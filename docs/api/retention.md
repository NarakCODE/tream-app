# Retention & Trash API Specification

> **Module**: `RetentionModule` (`apps/server/src/modules/retention`)  
> **Base Path**: `/api/v1/workspaces/:workspaceId` and `/api/v1/workspaces`  
> **Source Files**:
>
> - Controllers: [`apps/server/src/modules/retention/presentation/retention.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/retention/presentation/retention.controller.ts)
> - DTOs: [`apps/server/src/modules/retention/presentation/trash-query.dto.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/retention/presentation/trash-query.dto.ts)
> - Retention Policy Service: [`apps/server/src/modules/retention/application/retention-policy.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/retention/application/retention-policy.service.ts)
> - Trash Query Service: [`apps/server/src/modules/retention/application/trash-query.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/retention/application/trash-query.service.ts)
> - Workspace Trash Service: [`apps/server/src/modules/retention/application/workspace-trash.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/retention/application/workspace-trash.service.ts)

---

## 1. Overview & Key Components

The `RetentionModule` provides endpoints to view workspace data retention policies, query soft-deleted resources (trash bin) across all system entities, and inspect soft-deleted workspaces awaiting permanent purge.

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Workspace Scoping & Admin Only

- `GET /workspaces/:workspaceId/retention-policy`: Available to all active members of the workspace.
- `GET /workspaces/:workspaceId/trash`: Restricted to workspace `OWNER` or `ADMIN`. Non-admins receive `403 Forbidden` (`Workspace trash history requires an administrator.`).
- `GET /workspaces/trash`: Restricted to users who hold the `OWNER` role on deleted workspaces.

### 2.2 Resource Visibility in Trash

- Even though the caller is an administrator, `trash-query.service.ts` joins with the `resourceVisibility` filter.
- Trashed items residing in private teams or projects that the admin does not have explicit membership in are excluded.

---

## 3. Domain Invariants & HTTP Errors

| Invariant / Condition             | HTTP Status     | Error Message                                          | Source Reference                                                                                                                                                                |
| --------------------------------- | --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trash queried by non-admin member | `403 Forbidden` | `"Workspace trash history requires an administrator."` | [`trash-query.service.ts:33-35`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/retention/application/trash-query.service.ts#L33-L35)     |
| Workspace not found or inactive   | `404 Not Found` | Handled by `WorkspaceAuthorizationService`             | [`workspace-authorization.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/application/workspace-authorization.service.ts) |

---

## 4. Endpoints Table

| Method | Path                                        | Access          | Idempotent | Description                                                         |
| ------ | ------------------------------------------- | --------------- | ---------- | ------------------------------------------------------------------- |
| `GET`  | `/workspaces/:workspaceId/retention-policy` | Member          | No         | Read workspace retention and recoverability rules                   |
| `GET`  | `/workspaces/:workspaceId/trash`            | Admin Only      | No         | List soft-deleted items across issues, projects, documents, etc.    |
| `GET`  | `/workspaces/trash`                         | Workspace Owner | No         | List soft-deleted workspaces eligible for recovery (within 30 days) |

---

## 5. Endpoint Details

### 5.1 Get Retention Policy

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/retention-policy`
- **Success Response (200 OK)**:

```json
{
  "workspace": {
    "recoverableTrashDays": 30,
    "restoreRequires": "OWNER"
  },
  "archive": {
    "expires": false,
    "preservesContent": true
  },
  "files": {
    "recoverableTrashDays": 30,
    "automaticCleanup": true,
    "quotaReleasedAfter": "CONFIRMED_STORAGE_PURGE",
    "restoreBefore": "PURGE_CLAIM"
  },
  "preserved": [
    "identifier_aliases",
    "author_membership_ids",
    "audit_facts",
    "business_events",
    "consumer_receipts",
    "resource_ids"
  ]
}
```

### 5.2 List Workspace Resource Trash

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/trash`
- **Query Parameters (`TrashQueryDto`)**:
  - `resourceType?: 'issue' | 'project' | 'document' | 'initiative' | 'view' | 'comment' | 'file'`
  - `cursor?: string` (Base64URL cursor, max 1024 chars)
  - `limit?: number` (Default: `25`, min: `1`, max: `100`)
- **Success Response (200 OK)**:

```json
{
  "paginationType": "cursor",
  "items": [
    {
      "id": "doc_01j7abc...",
      "resourceType": "document",
      "label": "Old Design Document",
      "deletedAt": "2026-10-01T12:00:00.000Z",
      "createdAt": "2026-09-01T12:00:00.000Z",
      "recoveryDeadline": null,
      "restoreThrough": "/api/v1/workspaces/ws_123/documents/doc_01j7abc.../restore"
    }
  ],
  "total": 1,
  "cursor": null,
  "limit": 25,
  "hasNext": false,
  "nextCursor": null
}
```

_Note: `restoreThrough` provides the REST endpoint URI used to restore the item. It is `null` for comments._

### 5.3 List Trashed Workspaces

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/trash`
- **Query Parameters (`CursorPaginationQueryDto`)**:
  - `cursor?: string`, `limit?: number`
- **Success Response (200 OK)**:

```json
{
  "paginationType": "cursor",
  "items": [
    {
      "id": "ws_123",
      "name": "Acme Corp",
      "deletedAt": "2026-10-01T12:00:00.000Z",
      "purgedAt": null,
      "createdAt": "2026-01-01T12:00:00.000Z",
      "recoveryDeadline": "2026-10-31T12:00:00.000Z",
      "recoverable": true,
      "restoreThrough": "/api/v1/workspaces/ws_123"
    }
  ],
  "total": 1,
  "cursor": null,
  "limit": 25,
  "hasNext": false,
  "nextCursor": null
}
```

---

## 6. DB Schema & Side Effects

### Invariants & Triggers

- Soft-deleted workspaces are retained for 30 days before permanent purging.
- Database trigger `protect_workspace_purge_tombstone` enforces SQLSTATE `23514` if any update attempts to modify or undelete a purged workspace.
- Background worker `RetentionWorker` periodically executes file cleanup tasks for soft-deleted files past their retention window.
