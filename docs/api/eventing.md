# Eventing (Outbox) API Specification

> **Module**: `EventingModule` (`apps/server/src/modules/eventing`)  
> **Base Path**: `/api/v1/workspaces/:workspaceId/outbox`  
> **Source Files**:
>
> - Controller: [`apps/server/src/modules/eventing/presentation/outbox.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/eventing/presentation/outbox.controller.ts)
> - DTOs: [`apps/server/src/modules/eventing/presentation/dto/outbox-query.dto.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/eventing/presentation/dto/outbox-query.dto.ts)
> - Service: [`apps/server/src/modules/eventing/application/outbox-monitor.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/eventing/application/outbox-monitor.service.ts)
> - Worker: [`apps/server/src/modules/eventing/application/outbox-worker.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/eventing/application/outbox-worker.service.ts)
> - DB Schema: [`apps/server/src/database/schema/event.schema.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/database/schema/event.schema.ts)

---

## 1. Overview & Key Components

The `EventingModule` is responsible for durable transactional event publishing (Transactional Outbox pattern). The REST API exposes a read-only monitoring interface to inspect failed and quarantined outbox dispatch attempts.

Normal lifecycle events (`PENDING`, `SUCCEEDED`) are processed asynchronously by internal workers and are not exposed through this endpoint.

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Workspace Scoping & Authorization

- Caller must be an active workspace member.
- Caller role must possess the `'audit.read'` permission (`hasPermission(member.role, 'audit.read')`). Typically restricted to workspace `OWNER` or `ADMIN`.
- If the caller lacks `'audit.read'`, returns `403 Forbidden` (`Permission denied.`).
- If the workspace is deleted or membership is inactive, returns `404 Not Found` (`Workspace not found.`).

---

## 3. Domain Invariants & HTTP Errors

| Invariant / Condition           | HTTP Status       | Error Message                    | Source Reference                                                                                                                                                          |
| ------------------------------- | ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace not found or inactive | `404 Not Found`   | `"Workspace not found."`         | [`outbox-monitor.service.ts:37`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/eventing/application/outbox-monitor.service.ts#L37) |
| Missing `audit.read` permission | `403 Forbidden`   | `"Permission denied."`           | [`outbox-monitor.service.ts:39`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/eventing/application/outbox-monitor.service.ts#L39) |
| Invalid cursor payload          | `400 Bad Request` | Standard pagination cursor error | `CursorPaginationQueryDto`                                                                                                                                                |

---

## 4. Endpoints Table

| Method | Path                              | Access               | Idempotent | Description                                          |
| ------ | --------------------------------- | -------------------- | ---------- | ---------------------------------------------------- |
| `GET`  | `/workspaces/:workspaceId/outbox` | Admin (`audit.read`) | No         | List failed and quarantined outbox dispatch attempts |

---

## 5. Endpoint Details

### 5.1 List Outbox Dispatch Attempts

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/outbox`
- **Query Parameters (`OutboxQueryDto`)**:
  - `status?: 'FAILED' | 'QUARANTINED'` (Optional. If omitted, returns both `FAILED` and `QUARANTINED` attempts).
  - `cursor?: string` (Base64URL cursor, max length 1024).
  - `limit?: number` (Default: `25`, min: `1`, max: `100`).
- **Success Response (200 OK)**:

```json
{
  "paginationType": "cursor",
  "items": [
    {
      "id": "attempt_01j7abc...",
      "eventId": "evt_01j7abc...",
      "eventType": "issue.created",
      "schemaVersion": 1,
      "consumerKey": "internal",
      "status": "FAILED",
      "attemptCount": 5,
      "lastError": "Retry limit exhausted",
      "availableAt": "2026-10-01T12:05:00.000Z",
      "createdAt": "2026-10-01T12:00:00.000Z"
    }
  ],
  "cursor": null,
  "hasNext": false,
  "limit": 25,
  "total": 1,
  "nextCursor": null
}
```

- **Error Redaction Invariant**: Internal stack traces and consumer payload secrets are never persisted to `lastError`. Only sanitized failure strings (e.g. `'Consumer execution failed'`, `'Retry limit exhausted'`, `'Unsupported or invalid event contract'`) are returned.

---

## 6. DB Schema & Side Effects

### DB Tables

1. `events`: Stores transactional business events (ULID pk, `workspaceId`, `eventType`, `aggregateType`, `aggregateId`, `payload` jsonb).
2. `event_dispatch_attempts`: Stores delivery status per consumer (`status`: `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `QUARANTINED`, `attemptCount`, `lastError`).
3. `event_aggregate_heads`: Monotonic revision counter per `(workspaceId, aggregateType, aggregateId)`.

### Side Effects

- Read-only HTTP endpoint.
- Background worker (`OutboxWorker`) leases jobs with advisory locks and 60-second timeouts.
