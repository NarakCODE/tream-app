# Initiatives Module Specification (Initiatives, Roadmap, Progress Rollup)

## 1. Overview and Key Components

The `InitiativesModule` manages cross-project strategic goals (initiatives), multi-project links, project reordering, aggregate issue progress computation, health status updates, and member subscriptions.

- **Controller**:
  - [`InitiativesController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/initiatives/presentation/initiatives.controller.ts) (`/workspaces/:workspaceId/initiatives`): Endpoints for initiatives CRUD, lifecycle transitions (`archived`, `restored`, `deleted`), project links and reordering, aggregate progress rollups, updates, and subscriptions.
- **Application Services**:
  - [`InitiativeService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/initiatives/application/initiative.service.ts): Manages initiative lifecycle, atomic revision bumping via `expectedRevision`, project link validation, progress rollup calculations, and subscriber notifications.
- **Database Schema**:
  - `initiative.schema.ts`: `initiatives`, `initiativeProjects`, `initiativeUpdates`, `initiativeSubscribers`.

---

## 2. Permissions, Visibility & Tenant Rules

- **Base Route**: `/api/v1/workspaces/:workspaceId/initiatives`
- **Read Access**: Active workspace member with `workspace.read` permission. Guests (`role === 'GUEST'`) are prohibited unless explicitly participating.
- **Write / Manage Access**: Workspace member with non-guest access. Inactive or deleted workspaces reject all calls with `HTTP 403 Forbidden`.
- **Linked Project Access**: When linking projects (`POST /:id/projects`), the caller must have read access to the target project within the same workspace.

---

## 3. Domain Invariants & Error Codes

1. **Optimistic Concurrency Control (`HTTP 409 Conflict`)**:
   - `update`, `deleted`, `archived`, `restored`, `link`, `unlink`, `reorder`, and update modifications require `expectedRevision` matching `initiative.revision`. Mismatch throws `HTTP 409 Conflict` (`"Conflict: Expected revision X but found Y"`).
2. **Lifecycle State Invariants (`HTTP 400 Bad Request`)**:
   - Archiving an initiative already archived or deleted throws `HTTP 400 Bad Request`.
   - Restoring an active initiative throws `HTTP 400 Bad Request`.
   - Deleted initiatives reject all updates and linking operations.
3. **Project Link Boundaries (`HTTP 400 Bad Request` / `HTTP 409 Conflict`)**:
   - An initiative can link up to 100 projects maximum (`ArrayMaxSize(100)`).
   - Linking an already linked project throws `HTTP 409 Conflict`.
   - Target project must exist in the same workspace.
4. **Reorder Projects Completeness (`HTTP 400 Bad Request`)**:
   - Reordering projects requires submitting an array containing every currently linked project ID of the initiative exactly once.

---

## 4. Endpoint Table

All routes scoped under `/api/v1/workspaces/:workspaceId/initiatives`.

| Method   | Path                       | Access         | Idempotent   | Description                                                                                    |
| :------- | :------------------------- | :------------- | :----------- | :--------------------------------------------------------------------------------------------- |
| `GET`    | `/`                        | Workspace Read | No           | List initiatives with cursor pagination, filtered by lifecycle or status.                      |
| `POST`   | `/`                        | Workspace Read | Yes (Header) | Create an initiative, set optional owner, target date, and initial project links.              |
| `GET`    | `/:id`                     | Workspace Read | No           | Retrieve initiative details by UUID.                                                           |
| `PATCH`  | `/:id`                     | Workspace Read | Yes (Header) | Update name, description, status, owner, or target date (requires `expectedRevision`).         |
| `DELETE` | `/:id`                     | Workspace Read | Yes (Header) | Soft-delete an initiative (requires `expectedRevision`).                                       |
| `POST`   | `/:id/archive`             | Workspace Read | Yes (Header) | Archive an initiative (requires `expectedRevision`).                                           |
| `POST`   | `/:id/restore`             | Workspace Read | Yes (Header) | Restore an archived initiative (requires `expectedRevision`).                                  |
| `GET`    | `/:id/projects`            | Workspace Read | No           | List projects linked to this initiative in sorted order.                                       |
| `POST`   | `/:id/projects`            | Workspace Read | Yes (Header) | Link a project to the initiative (requires `expectedRevision`).                                |
| `DELETE` | `/:id/projects/:projectId` | Workspace Read | Yes (Header) | Unlink a project from the initiative (requires `expectedRevision`).                            |
| `POST`   | `/:id/projects/reorder`    | Workspace Read | Yes (Header) | Reorder linked projects atomically (requires `expectedRevision`).                              |
| `GET`    | `/:id/progress`            | Workspace Read | No           | Compute aggregate issue progress (total, completed, percentage) across all linked projects.    |
| `GET`    | `/:id/updates`             | Workspace Read | No           | List published health updates for the initiative (cursor pagination).                          |
| `POST`   | `/:id/updates`             | Workspace Read | Yes (Header) | Publish an initiative progress update with health status (`ON_TRACK`, `AT_RISK`, `OFF_TRACK`). |
| `PATCH`  | `/:id/updates/:updateId`   | Workspace Read | Yes (Header) | Edit an initiative update (requires `expectedRevision`).                                       |
| `DELETE` | `/:id/updates/:updateId`   | Workspace Read | Yes (Header) | Delete an initiative update (requires `expectedRevision`).                                     |
| `GET`    | `/:id/subscribers`         | Workspace Read | No           | List workspace members subscribed to updates for this initiative.                              |
| `POST`   | `/:id/subscription`        | Workspace Read | Yes (Header) | Subscribe current user to updates for this initiative.                                         |
| `DELETE` | `/:id/subscription`        | Workspace Read | Yes (Header) | Unsubscribe current user from this initiative.                                                 |

---

## 5. DTO Types & Validation Rules

- `CreateInitiativeDto`:
  - `name`: string, trimmed, max 200 characters.
  - `description`: optional nullable string, max 100,000 characters.
  - `status`: optional enum (`PLANNED`, `ACTIVE`, `COMPLETED`, `CANCELED`, defaults to `PLANNED`).
  - `ownerId`: optional nullable string UUID (membership ID).
  - `targetDate`: optional calendar date string (`YYYY-MM-DD`).
  - `position`: optional integer between 0 and 1,000,000.
  - `projectIds`: optional array of unique project UUIDs (max 100).
- `UpdateInitiativeDto`: Partial of `CreateInitiativeDto` (excluding `projectIds`) plus `expectedRevision: number` (`@IsInt() @Min(1)`).
- `LinkInitiativeProjectDto`: `projectId: string`, `expectedRevision: number`.
- `ReorderInitiativeProjectsDto`: `projectIds: string[]` (max 100 unique), `expectedRevision: number`.
- `InitiativeUpdateDto`: `body: string` (max 50,000 chars), `health: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'`.
- `EditInitiativeUpdateDto`: Extends `InitiativeUpdateDto` with `expectedRevision: number`.

---

## 6. Cross-Module Dependencies

1. **`ProjectsModule`**: Initiatives link to multiple projects (`initiative_projects`) and aggregate issue data from projects for progress rollups.
2. **`NotificationsModule`**: Publishing an initiative update automatically triggers notification fan-out to all active subscribers.

---

## 7. Open Questions

- None. Controller routes, DTOs, revision handling, and progress rollup queries verified against source.
