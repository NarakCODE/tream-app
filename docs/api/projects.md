# Projects Module Specification (Projects, Statuses, Milestones, Updates)

## 1. Overview and Key Components

The `ProjectsModule` manages workspace-level initiatives/projects, multi-team project associations, milestone roadmaps, project health status updates, and custom project workflow statuses.

- **Controllers**:
  - [`ProjectsController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/presentation/projects.controller.ts) (`/workspaces/:workspaceId/projects`): Project CRUD, team links, member links, milestone management, and project status update broadcasts.
  - [`ProjectStatusesController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/presentation/project-statuses.controller.ts) (`/workspaces/:workspaceId/project-statuses`): Workspace-level custom project workflow statuses.
- **Application Services**:
  - [`ProjectService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/application/project.service.ts): Lifecycle transitions, team associations, lead assignments, and project queries.
  - [`ProjectStatusService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/application/project-status.service.ts): Default status seeding, status ordering, and retirement migration.
  - [`ProjectCollaborationService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/application/project-collaboration.service.ts): Milestones CRUD and health update publishing.
  - [`ProjectAccessService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/application/project-access.service.ts): Validates project access rights and manager permissions.
  - [`ProjectCommandService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/application/project-command.service.ts): Outbox fact and audit event writer.
- **Domain Policies**:
  - [`project-policy.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/domain/project-policy.ts): Enforces `canManageProject`, `PROJECT_CATEGORIES`, `PROJECT_HEALTH`, and calendar date boundaries.
- **Database Schema**:
  - `work-management.schema.ts`: `projects`, `projectStatuses`, `projectTeams`, `projectMembers`, `projectMilestones`, `projectUpdates`.

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Access & Management Rules

- **View Access**: Active workspace member with `workspace.read` permission. Workspace guests (`role === 'GUEST'`) cannot view projects unless explicitly added as project members.
- **Manage Rights ([`project-policy.ts:10`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/domain/project-policy.ts#L10))**:
  - Non-guests who are workspace `OWNER` or `ADMIN`, the designated project `lead`, a registered project `member`, or an administrator of **all** teams linked to the project.
- **Team Link Rights**: Adding or removing a team link requires write permission on that specific team ([`project.service.ts:105`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/application/project.service.ts#L105)).

---

## 3. Domain Invariants & Error Codes

1. **Date Boundary Invariant (`HTTP 400 Bad Request`)**:
   - `startDate` and `targetDate` must be valid ISO calendar dates (`YYYY-MM-DD`).
   - `targetDate` must be on or after `startDate` ([`project-policy.ts:30`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/projects/domain/project-policy.ts#L30)). Throws `HTTP 400 Bad Request` (`"Target date must be on or after start date."`).
2. **Project Member Eligibility (`HTTP 409 Conflict`)**:
   - Project leads and members must be active, non-guest members of the parent workspace. Inactive or guest assignments throw `HTTP 409 Conflict` (`"Project members must be active non-guest workspace members."`).
3. **Lifecycle Transition State Rules (`HTTP 400 Bad Request`)**:
   - Archiving an already archived project throws `HTTP 400 Bad Request` (`"Project already archived."`).
   - Restoring a non-archived project throws `HTTP 400 Bad Request` (`"Project is not archived."`).
4. **Default Status Invariant (`HTTP 400 Bad Request`)**:
   - Every workspace must have exactly one active default status in category `PLANNED` ([`work-management.schema.ts:220`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/database/schema/work-management.schema.ts#L220)).
5. **Status Retirement Replacement Guard (`HTTP 400 Bad Request` / `HTTP 409 Conflict`)**:
   - Retiring a status that is currently assigned to active projects or is the default status requires a `replacementStatusId` in the same workspace.
6. **Full Catalog Reordering (`HTTP 400 Bad Request`)**:
   - Status or milestone reordering requires providing every active ID in the collection exactly once.

---

## 4. Endpoint Table

### 4.1 Projects Collection (`/api/v1/workspaces/:workspaceId/projects`)

| Method   | Path                                  | Access                      | Idempotent   | Description                                                                            |
| :------- | :------------------------------------ | :-------------------------- | :----------- | :------------------------------------------------------------------------------------- |
| `GET`    | `/`                                   | Workspace Read              | No           | List projects with cursor pagination, filtered by team, lead, status, or search query. |
| `POST`   | `/`                                   | Workspace Read              | Yes (Header) | Create new project, seed default statuses if none exist, and link teams/lead.          |
| `GET`    | `/:projectId`                         | Project View                | No           | Retrieve detailed project profile including linked team IDs.                           |
| `PATCH`  | `/:projectId`                         | Project Manage              | Yes (Header) | Update project fields or execute lifecycle transition (`archive` / `restore`).         |
| `DELETE` | `/:projectId`                         | Project Manage              | Yes (Header) | Soft-delete a project (`deletedAt = now()`).                                           |
| `GET`    | `/:projectId/teams`                   | Project View                | No           | List teams associated with this project.                                               |
| `POST`   | `/:projectId/teams`                   | Project Manage + Team Write | Yes (Header) | Associate a team with the project.                                                     |
| `DELETE` | `/:projectId/teams/:teamId`           | Project Manage + Team Write | Yes (Header) | Remove a team association.                                                             |
| `GET`    | `/:projectId/members`                 | Project View                | No           | List project members.                                                                  |
| `POST`   | `/:projectId/members`                 | Project Manage              | Yes (Header) | Add an active workspace member to the project.                                         |
| `DELETE` | `/:projectId/members/:membershipId`   | Project Manage              | Yes (Header) | Remove a member from the project.                                                      |
| `GET`    | `/:projectId/milestones`              | Project View                | No           | List milestones ordered by position.                                                   |
| `POST`   | `/:projectId/milestones`              | Project Manage              | Yes (Header) | Create a milestone.                                                                    |
| `POST`   | `/:projectId/milestones/reorder`      | Project Manage              | Yes (Header) | Reorder all milestones atomically.                                                     |
| `PATCH`  | `/:projectId/milestones/:milestoneId` | Project Manage              | Yes (Header) | Update milestone name, description, or target date.                                    |
| `DELETE` | `/:projectId/milestones/:milestoneId` | Project Manage              | Yes (Header) | Delete a milestone.                                                                    |
| `GET`    | `/:projectId/updates`                 | Project View                | No           | List project health updates (cursor pagination).                                       |
| `POST`   | `/:projectId/updates`                 | Project Manage              | Yes (Header) | Publish a project health update (`ON_TRACK`, `AT_RISK`, `OFF_TRACK`).                  |

### 4.2 Project Statuses (`/api/v1/workspaces/:workspaceId/project-statuses`)

| Method   | Path                 | Access          | Idempotent   | Description                                            |
| :------- | :------------------- | :-------------- | :----------- | :----------------------------------------------------- |
| `GET`    | `/`                  | Workspace Read  | No           | List workspace project statuses ordered by `position`. |
| `POST`   | `/`                  | Workspace Admin | Yes (Header) | Create a project status.                               |
| `POST`   | `/reorder`           | Workspace Admin | Yes (Header) | Reorder all project statuses atomically.               |
| `PATCH`  | `/:statusId`         | Workspace Admin | Yes (Header) | Update status name, category, or hex color.            |
| `POST`   | `/:statusId/default` | Workspace Admin | Yes (Header) | Set status as default (must be `PLANNED`).             |
| `DELETE` | `/:statusId`         | Workspace Admin | Yes (Header) | Retire a status. Requires replacement if in use.       |

---

## 5. DTO Types & Validation Rules

- `CreateProjectDto`:
  - `name`: string, trimmed, 1–200 characters.
  - `summary`: optional nullable string, max 2000 characters.
  - `description`: optional nullable string, max 100,000 characters.
  - `statusId`: string UUID.
  - `priority`: optional enum (`NO_PRIORITY`, `LOW`, `MEDIUM`, `HIGH`, `URGENT`, defaults to `NO_PRIORITY`).
  - `leadId`: optional nullable string UUID (active workspace membership).
  - `startDate`: optional calendar date string (`YYYY-MM-DD`).
  - `targetDate`: optional calendar date string (`YYYY-MM-DD`), `>= startDate`.
  - `teamIds`: optional array of string UUIDs.
- `UpdateProjectDto`: Partial of `CreateProjectDto` plus optional `lifecycle: 'archive' | 'restore'`.
- `CreateMilestoneDto`: `name` (1–200), `description?` (max 10,000), `targetDate?` (`YYYY-MM-DD`).
- `CreateProjectUpdateDto`: `body` (1–100,000 chars), `health` (`ON_TRACK` | `AT_RISK` | `OFF_TRACK`).
- `CreateProjectStatusDto`: `name` (1–100), `category` (`PLANNED` | `STARTED` | `PAUSED` | `COMPLETED` | `CANCELED`), `color?` (`/^#[0-9a-fA-F]{6}$/`).

---

## 6. Cross-Module Dependencies

1. **`TeamsModule`**: Projects link to teams via `project_teams`. Issues in `IssuesModule` link to projects via `issues.project_id`.
2. **`CollaborationModule`**: Project updates and milestones emit activity facts and support comments.
3. **`IamModule`**: Validates workspace permissions and membership identities.

---

## 7. Open Questions

- None. Controllers, services, and repositories verified against source.
