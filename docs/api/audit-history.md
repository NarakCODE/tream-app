# Audit History API Specification

> **Module**: `AuditHistoryModule` (`apps/server/src/modules/audit-history`)  
> **Base Path**: `/api/v1/workspaces/:workspaceId/audit`  
> **Source Files**:
>
> - Controller: [`apps/server/src/modules/audit-history/presentation/audit-history.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/audit-history/presentation/audit-history.controller.ts)
> - DTOs: [`apps/server/src/modules/audit-history/presentation/audit-query.dto.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/audit-history/presentation/audit-query.dto.ts)
> - Service: [`apps/server/src/modules/audit-history/application/audit-history.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/audit-history/application/audit-history.service.ts)
> - Redaction Policy: [`apps/server/src/modules/audit-history/domain/audit-redaction.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/audit-history/domain/audit-redaction.ts)
> - Resource Visibility: [`apps/server/src/modules/audit-history/infrastructure/resource-visibility.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/audit-history/infrastructure/resource-visibility.ts)
> - DB Schema: [`apps/server/src/database/schema/audit.schema.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/database/schema/audit.schema.ts)

---

## 1. Overview & Key Components

The `AuditHistoryModule` provides an immutable audit log query endpoint for workspace administrators. It audits actions across all resources (issues, projects, teams, members, files, etc.), strips sensitive credentials or message contents, and strictly enforces tenant and private container boundaries.

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Workspace Scoping & Admin Only

- Restricted exclusively to workspace `OWNER` and `ADMIN` roles.
- Non-admin callers receive `403 Forbidden` (`Audit history requires a workspace administrator.`).

### 2.2 Historical Resource Visibility

- Even though the caller is an administrator, the query joins with the `resourceVisibility` CTE.
- If an audit entry pertains to a private team, private project, or document that the admin is not an authorized viewer of, the entry is filtered out of the results.

### 2.3 Metadata Redaction Policy

- Audit log metadata is sanitized before returning:
  - **Stripped sensitive keys**: Keys matching `/password|token|secret|authorization|cookie|email|storage_key|body|description|content|name|title|url/i` are stripped.
  - **Retained safe keys**: IDs (`*_id`), `changed_fields`, `role`, `previous_role`, `state`, `status`, `revision`, `position`, `correlation_id`, timestamps.
  - Strings are truncated to 512 characters. Arrays are limited to 100 entries.

---

## 3. Domain Invariants & HTTP Errors

| Invariant / Condition           | HTTP Status     | Error Message                                         | Source Reference                                                                                                                                                                    |
| ------------------------------- | --------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caller is not OWNER or ADMIN    | `403 Forbidden` | `"Audit history requires a workspace administrator."` | [`audit-history.service.ts:26-28`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/audit-history/application/audit-history.service.ts#L26-L28) |
| Workspace not found or inactive | `404 Not Found` | Handled by `WorkspaceAuthorizationService`            | [`workspace-authorization.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/application/workspace-authorization.service.ts)     |

---

## 4. Endpoints Table

| Method | Path                             | Access     | Idempotent | Description                                                   |
| ------ | -------------------------------- | ---------- | ---------- | ------------------------------------------------------------- |
| `GET`  | `/workspaces/:workspaceId/audit` | Admin Only | No         | List sanitized workspace audit history with cursor pagination |

---

## 5. Endpoint Details

### 5.1 List Audit History

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/audit`
- **Query Parameters (`AuditQueryDto`)**:
  - `targetType?: string` (1–100 chars, e.g. `'issue'`, `'project'`, `'member'`)
  - `targetId?: string` (1–128 chars)
  - `actorId?: string` (1–128 chars)
  - `action?: string` (1–128 chars, e.g. `'team.member_added'`, `'issue.updated'`)
  - `correlationId?: string` (1–128 chars)
  - `cursor?: string` (Base64URL cursor, max 1024 chars)
  - `limit?: number` (Default: `25`, min: `1`, max: `100`)
- **Success Response (200 OK)**:

```json
{
  "paginationType": "cursor",
  "items": [
    {
      "id": "audit_01j7abc...",
      "workspaceId": "ws_123",
      "actorId": "mem_01j...",
      "correlationId": "corr_01j...",
      "action": "issue.status_changed",
      "targetType": "issue",
      "targetId": "iss_01j...",
      "metadata": {
        "previous_state": "STARTED",
        "state": "COMPLETED",
        "changed_fields": ["statusId", "updatedAt"]
      },
      "createdAt": "2026-10-01T12:00:00.000Z"
    }
  ],
  "cursor": null,
  "limit": 25,
  "total": 1,
  "hasNext": false,
  "nextCursor": null
}
```

---

## 6. DB Schema & Side Effects

### DB Table `audit_logs`

- `id`: ULID text (PK)
- `workspace_id`: FK to `workspaces.id`
- `actor_id`: FK to `memberships.id`
- `correlation_id`: text nullable
- `action`: text (e.g. `issue.created`)
- `target_type`: text
- `target_id`: text
- `metadata`: JSONB
- `created_at`: timestamp with time zone

### Side Effects

- Read-only HTTP endpoint.
