# Views and Search API Specification

> **Module**: `ViewsModule` (`apps/server/src/modules/views`)  
> **Base Path**: `/api/v1/workspaces/:workspaceId`  
> **Source Files**:
>
> - Controller: [`apps/server/src/modules/views/presentation/views.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/presentation/views.controller.ts)
> - DTOs: [`apps/server/src/modules/views/presentation/view.dto.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/presentation/view.dto.ts)
> - Service: [`apps/server/src/modules/views/application/view.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts)
> - Domain Filter: [`apps/server/src/modules/views/domain/view-filter.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/domain/view-filter.ts)
> - Cursor Encoding: [`apps/server/src/modules/views/infrastructure/query-cursor.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/infrastructure/query-cursor.ts)
> - DB Schema: [`apps/server/src/database/schema/view.schema.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/database/schema/view.schema.ts)

---

## 1. Overview & Key Components

The `ViewsModule` provides saved views for issues and projects, ad-hoc view querying, member favorites with custom ordering, and workspace-wide global search across issues, projects, and documents.

All mutating endpoints require the `Idempotency-Key` header via `@TransactionalCommand()`. Optimistic concurrency control is enforced on saved view and favorite updates via `expectedRevision`.

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Workspace Scoping & Authorization

- Authorization is executed programmatically in `ViewService` via `WorkspaceAuthorizationService.require(...)`.
- The caller must be an active workspace member.

### 2.2 View Visibility & Permissions

- Views can be either `PRIVATE` or `WORKSPACE`:
  - `PRIVATE`: Visible and manageable only by the creator (`ownerId`).
  - `WORKSPACE`: Visible to all workspace members who have access to the underlying team/project scopes.
- **Guest Limitations**:
  - Guests can create only `PRIVATE` views (`ForbiddenException('Guests can create only private views.')`).
  - Project views are unavailable to guests (`ForbiddenException('Project views are unavailable to guests.')`).
  - Guest assignee filters are limited to themselves (`ForbiddenException('Guest assignee filters are limited to themselves.')`).
- **Management Rights**:
  - To update, archive, delete, or restore a view, the caller must be the creator (`ownerId === member.id`) OR a workspace `OWNER`/`ADMIN` if the view visibility is `WORKSPACE`. Otherwise: `403 Forbidden` (`Saved view permission denied.`).

### 2.3 Favorites Privacy & Target Masking

- Favorites belong to a specific workspace membership (`membershipId`).
- A member can have up to 200 favorites (`ConflictException('Favorite limit reached.')`).
- When listing favorites, if a target resource is deleted, private, or retired such that the member no longer has read access, its details are masked (`title: null`, `targetId: null`, `state: 'UNAVAILABLE'`) to prevent information disclosure.

---

## 3. Domain Invariants & HTTP Errors

| Invariant / Condition                                                        | HTTP Status       | Error Message                                     | Source Reference                                                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| View update without any changes                                              | `400 Bad Request` | `"No view changes supplied."`                     | [`view.service.ts:201`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L201)  |
| Favorite reorder missing, duplicated, or mismatched IDs                      | `400 Bad Request` | `"Supply every favorite exactly once."`           | [`view.service.ts:483`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L483)  |
| Invalid filter grammar or unknown fields                                     | `400 Bad Request` | `"Use the supported version 1 filter grammar."`   | [`view-filter.ts:67`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/domain/view-filter.ts#L67)           |
| Invalid filter identifier format                                             | `400 Bad Request` | `"Filter references must be opaque identifiers."` | [`view-filter.ts:82`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/domain/view-filter.ts#L82)           |
| Unsupported view sort (allowed: `CREATED_DESC`, `UPDATED_DESC`, `TITLE_ASC`) | `400 Bad Request` | `"Unsupported view sort."`                        | [`view-filter.ts:111`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/domain/view-filter.ts#L111)         |
| Invalid cursor or tamper detected                                            | `400 Bad Request` | `"Invalid or mismatched query cursor."`           | [`query-cursor.ts:54`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/infrastructure/query-cursor.ts#L54) |
| View permission denied                                                       | `403 Forbidden`   | `"Saved view permission denied."`                 | [`view.service.ts:596`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L596)  |
| Guest creating non-private view                                              | `403 Forbidden`   | `"Guests can create only private views."`         | [`view.service.ts:626`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L626)  |
| Guest accessing project views                                                | `403 Forbidden`   | `"Project views are unavailable to guests."`      | [`view.service.ts:665`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L665)  |
| Saved view not found or inaccessible                                         | `404 Not Found`   | `"Saved view not found."`                         | [`view.service.ts:593`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L593)  |
| Favorite item not found                                                      | `404 Not Found`   | `"Favorite not found."`                           | [`view.service.ts:538`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L538)  |
| Favorite target resource not found                                           | `404 Not Found`   | `"Favorite target not found."`                    | [`view.service.ts:756`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L756)  |
| Revision mismatch                                                            | `409 Conflict`    | `"Resource revision is stale."`                   | [`view.service.ts:861`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L861)  |
| Archiving a soft-deleted view                                                | `409 Conflict`    | `"Restore the trashed view before archiving."`    | [`view.service.ts:273`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L273)  |
| Modifying an archived view without restore                                   | `409 Conflict`    | `"Saved view is archived."`                       | [`view.service.ts:332`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L332)  |
| Member has >= 200 favorites                                                  | `409 Conflict`    | `"Favorite limit reached."`                       | [`view.service.ts:422`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/views/application/view.service.ts#L422)  |

---

## 4. Endpoints Table

| Method   | Path                                             | Access        | Idempotent         | Description                                                            |
| -------- | ------------------------------------------------ | ------------- | ------------------ | ---------------------------------------------------------------------- |
| `GET`    | `/workspaces/:workspaceId/views`                 | Member        | No                 | List saved views with filtering and cursor pagination                  |
| `POST`   | `/workspaces/:workspaceId/views`                 | Member        | **Yes** (Required) | Create a saved view                                                    |
| `POST`   | `/workspaces/:workspaceId/views/query`           | Member        | No                 | Run ad-hoc query for issues or projects without saving                 |
| `GET`    | `/workspaces/:workspaceId/views/:viewId`         | Member        | No                 | Retrieve saved view definition                                         |
| `GET`    | `/workspaces/:workspaceId/views/:viewId/results` | Member        | No                 | Execute saved view and return cursor-paginated results                 |
| `PATCH`  | `/workspaces/:workspaceId/views/:viewId`         | Owner / Admin | **Yes** (Required) | Update saved view definition with revision lock                        |
| `POST`   | `/workspaces/:workspaceId/views/:viewId/archive` | Owner / Admin | **Yes** (Required) | Archive saved view with revision lock (Returns HTTP 200)               |
| `DELETE` | `/workspaces/:workspaceId/views/:viewId`         | Owner / Admin | **Yes** (Required) | Soft delete saved view with revision lock                              |
| `POST`   | `/workspaces/:workspaceId/views/:viewId/restore` | Owner / Admin | **Yes** (Required) | Restore archived or deleted view with revision lock (Returns HTTP 200) |
| `GET`    | `/workspaces/:workspaceId/favorites`             | Member        | No                 | List caller's favorites in ordered sequence                            |
| `POST`   | `/workspaces/:workspaceId/favorites`             | Member        | **Yes** (Required) | Add an item to caller's favorites                                      |
| `POST`   | `/workspaces/:workspaceId/favorites/reorder`     | Member        | **Yes** (Required) | Reorder caller's favorites in batch (Returns HTTP 200)                 |
| `DELETE` | `/workspaces/:workspaceId/favorites/:favoriteId` | Member        | **Yes** (Required) | Remove an item from caller's favorites                                 |
| `GET`    | `/workspaces/:workspaceId/search`                | Member        | No                 | Global search across issues, projects, and documents                   |

---

## 5. Endpoint Details

### 5.1 List Views

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/views`
- **Query Parameters (`ViewListDto`)**:
  - `cursor?: string`: Cursor token (max 4096 chars).
  - `limit?: number`: Page limit (default `25`, min `1`, max `100`).
  - `resource?: 'ISSUES' | 'PROJECTS'`: Resource type filter.
  - `lifecycle?: 'active' | 'archived' | 'deleted'`: Lifecycle filter (default `'active'`).
- **Success Response (200 OK)**:

```json
{
  "paginationType": "cursor",
  "items": [
    {
      "id": "view_01j7abc...",
      "workspaceId": "ws_123",
      "name": "Active Sprint Issues",
      "description": "High priority active tasks",
      "ownerId": "mem_01",
      "teamId": "team_01",
      "projectId": null,
      "resource": "ISSUES",
      "visibility": "WORKSPACE",
      "filters": { "version": 1, "statusCategory": ["STARTED"] },
      "display": { "layout": "board", "groupBy": "status" },
      "revision": 1,
      "archivedAt": null,
      "deletedAt": null,
      "createdAt": "2026-10-01T12:00:00.000Z",
      "updatedAt": "2026-10-01T12:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 25,
  "cursor": null,
  "hasNext": false,
  "nextCursor": null
}
```

### 5.2 Create View

- **Method**: `POST`
- **Path**: `/api/v1/workspaces/:workspaceId/views`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`CreateViewDto`)**:

```json
{
  "name": "My Open Issues",
  "description": "Issues assigned to me",
  "resource": "ISSUES",
  "visibility": "PRIVATE",
  "teamId": "team_01",
  "filters": {
    "version": 1,
    "statusCategory": ["UNSTARTED", "STARTED"]
  },
  "display": {
    "layout": "list",
    "groupBy": "status"
  }
}
```

- **Validation Rules**:
  - `name`: Non-empty string, max 200 chars.
  - `description`: Optional string, max 2000 chars.
  - `resource`: Required, `'ISSUES' | 'PROJECTS'`.
  - `visibility`: Optional, `'PRIVATE' | 'WORKSPACE'`.
  - `filters`: Required object conforming to version 1 filter grammar.
  - `display`: Optional object (`layout`: `'list' | 'board'`, `groupBy`: `'none' | 'status' | 'team' | 'assignee'`).
- **Success Response (201 Created)**:

```json
{
  "id": "view_01j7abc...",
  "revision": 1
}
```

### 5.3 Ad-Hoc Query View

- **Method**: `POST`
- **Path**: `/api/v1/workspaces/:workspaceId/views/query`
- **Request Body (`QueryViewDto`)**:

```json
{
  "resource": "ISSUES",
  "filters": {
    "version": 1,
    "teamId": "team_01"
  },
  "limit": 25
}
```

- **Success Response (200 OK)**:

```json
{
  "paginationType": "cursor",
  "items": [
    {
      "kind": "issue",
      "id": "iss_01j...",
      "title": "Fix memory leak in subscriber",
      "snippet": "...",
      "createdAt": "2026-10-01T12:00:00.000Z",
      "updatedAt": "2026-10-01T12:00:00.000Z",
      "position": "01j..."
    }
  ],
  "total": 1,
  "limit": 25,
  "cursor": null,
  "hasNext": false,
  "nextCursor": null
}
```

### 5.4 Get Saved View

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/views/:viewId`
- **Success Response (200 OK)**: Single `SavedView` object.

### 5.5 Get Saved View Results

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/views/:viewId/results`
- **Query Parameters**: `cursor?: string`, `limit?: number`.
- **Success Response (200 OK)**: Same cursor list shape as Ad-Hoc Query.

### 5.6 Update View

- **Method**: `PATCH`
- **Path**: `/api/v1/workspaces/:workspaceId/views/:viewId`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`UpdateViewDto`)**:

```json
{
  "expectedRevision": 1,
  "name": "Updated View Name",
  "display": { "layout": "board" }
}
```

- **Success Response (200 OK)**: `{ "id": "view_01j...", "revision": 2 }`

### 5.7 Archive / Delete / Restore View

- **Archive**: `POST /views/:viewId/archive` with body `{ "expectedRevision": 1 }` -> `{ "id": "...", "revision": 2 }`
- **Delete**: `DELETE /views/:viewId` with body `{ "expectedRevision": 1 }` -> `{ "id": "...", "revision": 2 }`
- **Restore**: `POST /views/:viewId/restore` with body `{ "expectedRevision": 2 }` -> `{ "id": "...", "revision": 3 }`

### 5.8 Favorites Endpoints

- **List**: `GET /workspaces/:workspaceId/favorites?cursor=...&limit=25`
  - Returns:
  ```json
  {
    "paginationType": "cursor",
    "items": [
      {
        "id": "fav_01j...",
        "revision": 1,
        "position": 0,
        "targetType": "issue",
        "targetId": "iss_01j...",
        "title": "My Favorite Issue",
        "state": "AVAILABLE"
      }
    ],
    "total": 1,
    "limit": 25,
    "cursor": null,
    "hasNext": false,
    "nextCursor": null
  }
  ```
- **Add**: `POST /workspaces/:workspaceId/favorites` (Headers: `Idempotency-Key`)
  - Body (`CreateFavoriteDto`): `{ "targetType": "issue", "targetId": "iss_01j..." }`
  - Returns: `{ "id": "fav_01j...", "revision": 1 }`
- **Reorder**: `POST /workspaces/:workspaceId/favorites/reorder` (Headers: `Idempotency-Key`)
  - Body (`ReorderFavoritesDto`):
  ```json
  {
    "items": [
      { "id": "fav_01j...", "expectedRevision": 1 },
      { "id": "fav_02j...", "expectedRevision": 1 }
    ]
  }
  ```
  - Returns: `{ "favoriteIds": ["fav_01j...", "fav_02j..."] }`
- **Remove**: `DELETE /workspaces/:workspaceId/favorites/:favoriteId` (Headers: `Idempotency-Key`)
  - Body: `{ "expectedRevision": 1 }`
  - Returns: `{ "id": "fav_01j...", "removed": true }`

### 5.9 Global Search

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/search`
- **Query Parameters (`SearchDto`)**:
  - `q`: Search string (max 100 chars, non-empty, characters `%_\` automatically escaped).
  - `resource?: 'ALL' | 'ISSUES' | 'PROJECTS' | 'DOCUMENTS'` (Default: `'ALL'`).
  - `cursor?: string`, `limit?: number`.
- **Success Response (200 OK)**:

```json
{
  "paginationType": "cursor",
  "items": [
    {
      "kind": "issue",
      "id": "iss_01...",
      "title": "OAuth Token Refresh Failure",
      "snippet": "Encountered 401 when refreshing token...",
      "createdAt": "2026-10-01T12:00:00.000Z",
      "updatedAt": "2026-10-01T12:00:00.000Z",
      "position": "01..."
    }
  ],
  "total": 1,
  "limit": 25,
  "cursor": null,
  "hasNext": false,
  "nextCursor": null
}
```

---

## 6. DB Schema & Side Effects

### DB Tables

1. `saved_views`:
   - `id`: ULID text (PK)
   - `workspace_id`: FK to `workspaces.id`
   - `filters`: JSONB (CHECK length <= 32,768 bytes)
   - `display`: JSONB (CHECK length <= 16,384 bytes)
   - `revision`: integer >= 1
2. `favorites`:
   - `id`: ULID text (PK)
   - `workspace_id`: FK to `workspaces.id`
   - `membership_id`: FK to `memberships`
   - Exactly one non-null target: `num_nonnulls(issue_id, project_id, team_id, initiative_id, view_id) = 1`
   - Unique index: `(membership_id, target_id)` prevents duplicate favorites.

### Side Effects

- **Domain Events** (`aggregateType: 'view'` or `'favorite'`):
  - `view.created`, `view.updated`, `view.archived`, `view.deleted`, `view.restored`
  - `favorite.added`, `favorite.reordered`, `favorite.removed`
- **Audit Logs**: Synchronously recorded in `audit_logs` with matching action and target metadata.

---

## 7. Cross-Module Dependencies

- `WorkspacesModule`: Membership verification and workspace scoping.
- `TeamsModule` / `ProjectsModule` / `IssuesModule` / `InitiativesModule`: Resource visibility and existence checks for view filters and favorite targets.
- `DocumentsModule`: Scoped in global search queries.
