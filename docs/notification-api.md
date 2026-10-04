# Notifications API Reference

API definition and architectural reference for the NestJS [`NotificationsModule`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/notifications.module.ts#L46), covering notification inbox management, status mutations, channel preferences, and asynchronous email delivery tracking under `/api/v1/workspaces/:workspaceId/notifications`.

---

## 1. Overview & Architecture

The notification module provides durable, multi-channel notification fan-out, lifecycle tracking (inbox, archive, snooze), and delivery auditing for workspace members.

### Key Components

- **Controller**:
  - [`NotificationsController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/presentation/notifications.controller.ts#L32): REST endpoints for listing, reading, archiving, snoozing, configuring preferences, and inspecting/retrying deliveries.
- **Application Services**:
  - [`NotificationService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/application/notification.service.ts#L26): Manages notification retrieval, state transitions, preference management, and idempotency tracking.
  - [`NotificationAccessService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/application/notification-access.service.ts#L27): Enforces tenant scoping, recipient ownership, and entity access permissions across issues, projects, initiatives, and documents.
  - [`NotificationConsumer`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/application/notification-consumer.service.ts#L28): Transactional event consumer registered with [`EventConsumerRegistry`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/eventing/application/event-consumer-registry.ts) (`notifications.fanout.v1`). Converts domain events into notification records and delivery jobs.
  - [`NotificationMailWorker`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/application/notification-mail.worker.ts#L33): Background queue worker that claims pending email delivery leases with exponential backoff and jitter.
- **Repository & Infrastructure**:
  - [`NotificationRepository`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/infrastructure/notification.repository.ts#L22): Query operations with cursor pagination and status filtering.
  - [`notificationVisibility`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/infrastructure/notification-visibility.ts#L4): Dynamic SQL filtering ensuring users only see notifications for resources (issues, projects, initiatives, documents, comments) they currently have permission to access.
  - [`AuthMailNotificationAdapter`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/infrastructure/auth-mail-notification.adapter.ts#L8): Implementation of [`NotificationMailSender`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/application/notification-mail.ts) adapting email dispatch.

---

## 2. Global Policies & Behaviors

### URL Routing & Versioning

- **Global Prefix**: `/api`
- **API Version**: `v1` (URI versioning)
- **Base Route**: `/api/v1/workspaces/:workspaceId/notifications`

### Authentication & Authorization

- All endpoints require an authenticated user with a valid JWT Bearer token (`Authorization: Bearer <accessToken>`).
- The caller must be an active member of the specified `workspaceId` with `workspace.read` permission (or `preferences.update` for preference updates).
- Resource ownership is strictly enforced: callers can only read or mutate notifications specifically targeted to their workspace membership.
- If the source entity (e.g., an issue or project) was deleted or the caller lost access, dynamic visibility filters suppress the notification from listings or return `HTTP 404 Not Found`.

### Projection Privacy

- Read endpoints (`list`, `get`) project and return **metadata only**. Fields `title` and `body` are omitted from the returned JSON payloads to prevent leaking stale or sensitive content directly from notification snapshots. Clients resolve presentation details from the referenced entity (`issueId`, `projectId`, `initiativeId`, `documentId`).

### Concurrency & Optimistic Locking

- State mutations (`read`, `archive`, `snooze`, `preferences`) enforce optimistic locking using an `expectedRevision` field:
  - If `expectedRevision` does not match the stored `revision`, the server throws `HTTP 409 Conflict`.
  - On each successful update, the entity `revision` increments by 1.

### Idempotency & Transactional Commands

- All mutation endpoints (`PATCH`, `POST`) are decorated with [`@TransactionalCommand()`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/common/decorators/transactional-command.decorator.ts) and executed through [`CommandBus`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/common/idempotency/command-bus.service.ts) to guarantee idempotency and audit trail creation.

---

## 3. Endpoints Summary

| Method  | Endpoint                                                             | Access         | Idempotent | Description                                                   |
| :------ | :------------------------------------------------------------------- | :------------- | :--------- | :------------------------------------------------------------ |
| `GET`   | `/api/v1/workspaces/:workspaceId/notifications`                      | Member         | No         | List notifications with cursor pagination and filtering.      |
| `GET`   | `/api/v1/workspaces/:workspaceId/notifications/unread-count`         | Member         | No         | Get count of unread, active notifications.                    |
| `GET`   | `/api/v1/workspaces/:workspaceId/notifications/preferences`          | Member         | No         | Get member's notification channel preferences.                |
| `PATCH` | `/api/v1/workspaces/:workspaceId/notifications/preferences`          | Member         | Yes        | Update member's notification channel preferences.             |
| `GET`   | `/api/v1/workspaces/:workspaceId/notifications/:id`                  | Member (Owner) | No         | Get metadata for a single notification by ID.                 |
| `PATCH` | `/api/v1/workspaces/:workspaceId/notifications/:id/read`             | Member (Owner) | Yes        | Mark a notification as read or unread.                        |
| `PATCH` | `/api/v1/workspaces/:workspaceId/notifications/:id/archive`          | Member (Owner) | Yes        | Archive or unarchive a notification.                          |
| `PATCH` | `/api/v1/workspaces/:workspaceId/notifications/:id/snooze`           | Member (Owner) | Yes        | Snooze a notification until a future timestamp (or unsnooze). |
| `GET`   | `/api/v1/workspaces/:workspaceId/notifications/:id/deliveries`       | Member (Owner) | No         | List email delivery job statuses for a notification.          |
| `POST`  | `/api/v1/workspaces/:workspaceId/notifications/:id/deliveries/retry` | Member (Owner) | Yes        | Retry a failed, dead, or unknown delivery job.                |

---

## 4. Endpoints Reference

### 4.1 List Notifications

Returns a cursor-paginated list of notifications for the authenticated member.

- **HTTP Method**: `GET`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
- **Query Parameters**:
  | Parameter | Type     | Required | Default     | Allowed Values / Validation                   | Description                                                      |
  | :-------- | :------- | :------- | :---------- | :-------------------------------------------- | :--------------------------------------------------------------- |
  | `status`  | `string` | No       | `'inbox'`   | `'inbox'`, `'archived'`, `'snoozed'`, `'all'` | Filter by lifecycle state.                                       |
  | `unread`  | `string` | No       | `undefined` | `'true'`, `'false'`                           | Filter by read status (`'true'` for unread, `'false'` for read). |
  | `cursor`  | `string` | No       | `null`      | String (max 1024 chars)                       | Base64 pagination cursor.                                        |
  | `limit`   | `number` | No       | `25`        | Integer, min `1`, max `100`                   | Number of items per page.                                        |
- **Success Response** (`200 OK`):
  ```json
  {
    "paginationType": "cursor",
    "items": [
      {
        "id": "notif_01J0...",
        "workspaceId": "ws_01J0...",
        "recipientMembershipId": "mem_01J0...",
        "actorMembershipId": "mem_01J0...",
        "eventId": "evt_01J0...",
        "kind": "ASSIGNMENT",
        "issueId": "iss_01J0...",
        "projectId": null,
        "initiativeId": null,
        "documentId": null,
        "revision": 1,
        "readAt": null,
        "archivedAt": null,
        "snoozedUntil": null,
        "createdAt": "2026-10-04T12:00:00.000Z",
        "updatedAt": "2026-10-04T12:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 25,
    "cursor": null,
    "hasNext": false,
    "nextCursor": null
  }
  ```
- **Notes**: If the user has disabled in-app notifications (`inAppEnabled: false`), this endpoint returns an empty item list.

---

### 4.2 Get Unread Count

Returns the total count of unread, non-archived, non-snoozed notifications visible to the caller.

- **HTTP Method**: `GET`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/unread-count`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
- **Success Response** (`200 OK`):
  ```json
  {
    "unreadCount": 3
  }
  ```
- **Notes**: Returns `{ "unreadCount": 0 }` if in-app notifications are disabled in user preferences.

---

### 4.3 Get Notification Preferences

Fetches notification delivery preferences (in-app and email channels) for the caller in the workspace.

- **HTTP Method**: `GET`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/preferences`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
- **Success Response** (`200 OK`):
  ```json
  {
    "id": "pref_01J0...",
    "workspaceId": "ws_01J0...",
    "recipientMembershipId": "mem_01J0...",
    "inAppEnabled": true,
    "emailEnabled": false,
    "revision": 1,
    "createdAt": "2026-10-04T10:00:00.000Z",
    "updatedAt": "2026-10-04T10:00:00.000Z"
  }
  ```
- **Notes**: If no preferences row has been persisted yet, returns defaults (`inAppEnabled: true`, `emailEnabled: false`, `revision: 0`).

---

### 4.4 Update Notification Preferences

Updates channel notification toggles. Requires optimistic revision check.

- **HTTP Method**: `PATCH`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/preferences`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
- **Request Body** ([`NotificationPreferencesDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/presentation/notification.dto.ts#L30)):
  | Field                                                                  | Type      | Required | Description                                              |
  | :--------------------------------------------------------------------- | :-------- | :------- | :------------------------------------------------------- |
  | `expectedRevision`                                                     | `number`  | Yes      | Non-negative integer matching current revision (`>= 0`). |
  | `inAppEnabled`                                                         | `boolean` | Optional | Enable or disable in-app notifications.                  |
  | `emailEnabled`                                                         | `boolean` | Optional | Enable or disable email notifications.                   |
  | _(At least one of `inAppEnabled` or `emailEnabled` must be provided)._ |
- **Side Effects**: Disabling email (`emailEnabled: false`) immediately suppresses any pending, processing, or failed delivery jobs for that member.
- **Success Response** (`200 OK`): Returns updated preference object with incremented `revision`.
- **Errors**:
  - `400 Bad Request`: Neither channel was supplied.
  - `409 Conflict`: `expectedRevision` does not match current state.

---

### 4.5 Get Notification by ID

Fetches metadata for a single notification.

- **HTTP Method**: `GET`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/:id`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
  - `id` (`string`, required): Notification ID.
- **Success Response** (`200 OK`): Returns notification metadata object (excluding `title` and `body`).
- **Errors**:
  - `404 Not Found`: Notification does not exist, belongs to another member, or referenced source entity has been deleted/inaccessible.

---

### 4.6 Mark Notification Read/Unread

Sets or clears the `readAt` timestamp on a notification.

- **HTTP Method**: `PATCH`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/:id/read`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
  - `id` (`string`, required): Notification ID.
- **Request Body** ([`NotificationReadDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/presentation/notification.dto.ts#L19)):
  | Field              | Type      | Required | Description                                                                       |
  | :----------------- | :-------- | :------- | :-------------------------------------------------------------------------------- |
  | `expectedRevision` | `number`  | Yes      | Integer `>= 1`.                                                                   |
  | `read`             | `boolean` | Yes      | `true` to mark read (`readAt = now()`), `false` to mark unread (`readAt = null`). |
- **Success Response** (`200 OK`): Updated notification metadata with incremented `revision`.
- **Errors**:
  - `404 Not Found`: Notification not found or not owned.
  - `409 Conflict`: Revision mismatch.

---

### 4.7 Archive/Unarchive Notification

Sets or clears the `archivedAt` timestamp on a notification.

- **HTTP Method**: `PATCH`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/:id/archive`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
  - `id` (`string`, required): Notification ID.
- **Request Body** ([`NotificationArchiveDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/presentation/notification.dto.ts#L22)):
  | Field              | Type      | Required | Description                                                                         |
  | :----------------- | :-------- | :------- | :---------------------------------------------------------------------------------- |
  | `expectedRevision` | `number`  | Yes      | Integer `>= 1`.                                                                     |
  | `archived`         | `boolean` | Yes      | `true` to archive (`archivedAt = now()`), `false` to restore (`archivedAt = null`). |
- **Success Response** (`200 OK`): Updated notification metadata with incremented `revision`.

---

### 4.8 Snooze Notification

Snoozes a notification until a specified ISO 8601 date, or clears snoozing.

- **HTTP Method**: `PATCH`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/:id/snooze`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
  - `id` (`string`, required): Notification ID.
- **Request Body** ([`NotificationSnoozeDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/presentation/notification.dto.ts#L25)):
  | Field              | Type             | Required | Description                                                                                   |
  | :----------------- | :--------------- | :------- | :-------------------------------------------------------------------------------------------- |
  | `expectedRevision` | `number`         | Yes      | Integer `>= 1`.                                                                               |
  | `snoozedUntil`     | `string \| null` | Yes      | Strict ISO 8601 timestamp string (must be future date within 90 days), or `null` to unsnooze. |
- **Validation Rules**: If `snoozedUntil` is provided, it must be greater than current time and cannot exceed 90 days into the future.
- **Success Response** (`200 OK`): Updated notification metadata with incremented `revision`.
- **Errors**:
  - `400 Bad Request`: `snoozedUntil` is in the past or beyond 90 days.
  - `409 Conflict`: Revision mismatch.

---

### 4.9 Get Notification Deliveries

Retrieves the delivery status and dispatch logs for email delivery jobs associated with the notification.

- **HTTP Method**: `GET`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/:id/deliveries`
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
  - `id` (`string`, required): Notification ID.
- **Success Response** (`200 OK`):
  ```json
  [
    {
      "id": "job_01J0...",
      "status": "SUCCEEDED",
      "attemptCount": 1,
      "lastErrorCode": null,
      "sentAt": "2026-10-04T12:00:05.123Z"
    }
  ]
  ```
- **Delivery Job Statuses**: `PENDING`, `PROCESSING`, `SENDING`, `FAILED`, `SUCCEEDED`, `UNKNOWN`, `SUPPRESSED`, `DEAD`.

---

### 4.10 Retry Delivery

Manually retries a failed, dead, or indeterminate delivery job.

- **HTTP Method**: `POST`
- **Route**: `/api/v1/workspaces/:workspaceId/notifications/:id/deliveries/retry`
- **Status Code**: `200 OK` (via `@HttpCode(200)`)
- **Path Parameters**:
  - `workspaceId` (`string`, required): Target workspace identifier.
  - `id` (`string`, required): Notification ID.
- **Request Body** ([`RetryDeliveryDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/notifications/presentation/notification.dto.ts#L35)):
  | Field                          | Type      | Required | Description                                           |
  | :----------------------------- | :-------- | :------- | :---------------------------------------------------- |
  | `acknowledgePossibleDuplicate` | `boolean` | Yes      | Must be set to `true` if current status is `UNKNOWN`. |
- **Preconditions**:
  - Recipient must have `emailEnabled: true` in preferences.
  - Job status must be one of `FAILED`, `DEAD`, or `UNKNOWN`.
  - If status is `UNKNOWN`, `acknowledgePossibleDuplicate` must be `true` (as the email may have already arrived).
- **Success Response** (`200 OK`):
  ```json
  {
    "id": "job_01J0...",
    "status": "PENDING"
  }
  ```
- **Errors**:
  - `400 Bad Request`: Job is in `UNKNOWN` status and duplicate warning was not acknowledged.
  - `404 Not Found`: Delivery job not found.
  - `409 Conflict`: Email notifications disabled in preferences or delivery is in an unretryable state (e.g. `SUCCEEDED`, `PENDING`, `PROCESSING`).

---

## 5. Data Transfer Objects (DTOs)

```typescript
// Cursor pagination
export class CursorPaginationQueryDto {
  cursor?: string; // Max length: 1024
  limit: number = 25; // Min: 1, Max: 100
}

// Notification listing query
export class NotificationListDto extends CursorPaginationQueryDto {
  status: "inbox" | "archived" | "snoozed" | "all" = "inbox";
  unread?: "true" | "false";
}

// Optimistic revision base
export class NotificationRevisionDto {
  expectedRevision: number; // Integer, Min: 1
}

// Read status patch
export class NotificationReadDto extends NotificationRevisionDto {
  read: boolean;
}

// Archive status patch
export class NotificationArchiveDto extends NotificationRevisionDto {
  archived: boolean;
}

// Snooze patch
export class NotificationSnoozeDto extends NotificationRevisionDto {
  snoozedUntil: string | null; // Strict ISO 8601 or null
}

// Channel preferences patch
export class NotificationPreferencesDto {
  expectedRevision: number; // Integer, Min: 0
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
}

// Retry delivery
export class RetryDeliveryDto {
  acknowledgePossibleDuplicate: boolean;
}
```

---

## 6. Database Schema Reference

Defined in [`notification.schema.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/database/schema/notification.schema.ts):

### `notifications` Table

- `id` (`text`, PK): Unique identifier.
- `workspaceId` (`text`, FK -> `workspaces.id`): Tenant workspace ID.
- `recipientMembershipId` (`text`, FK -> `memberships.id`): Recipient member.
- `actorMembershipId` (`text`, FK -> `memberships.id`, nullable): Member who triggered the notification.
- `eventId` (`text`, FK -> `events.id`): Source event ID.
- `kind` (`notificationKind` enum): `'ASSIGNMENT'`, `'MENTION'`, `'SUBSCRIPTION'`, `'PLANNING_UPDATE'`.
- Target foreign keys (mutually exclusive check constraint `m13_notification_target`):
  - `issueId` (`text`, nullable, FK -> `issues.id`)
  - `projectId` (`text`, nullable, FK -> `projects.id`)
  - `initiativeId` (`text`, nullable, FK -> `initiatives.id`)
  - `documentId` (`text`, nullable, FK -> `documents.id`)
- `title` (`text`, nullable, max length 500)
- `body` (`text`, nullable, max length 10000)
- `revision` (`integer`, default `1`): Optimistic concurrency counter.
- `readAt` (`timestamp with time zone`, nullable)
- `archivedAt` (`timestamp with time zone`, nullable)
- `snoozedUntil` (`timestamp with time zone`, nullable)
- `createdAt`, `updatedAt` (`timestamp with time zone`)

### `notification_preferences` Table

- `id` (`text`, PK)
- `workspaceId` (`text`, FK -> `workspaces.id`)
- `recipientMembershipId` (`text`, FK -> `memberships.id`, unique per workspace)
- `inAppEnabled` (`boolean`, default `true`)
- `emailEnabled` (`boolean`, default `false`)
- `revision` (`integer`, default `1`)
- `createdAt`, `updatedAt` (`timestamp with time zone`)

### `notification_delivery_jobs` Table

- `id` (`text`, PK)
- `workspaceId` (`text`, FK -> `workspaces.id`)
- `notificationId` (`text`, FK -> `notifications.id`)
- `recipientMembershipId` (`text`, FK -> `memberships.id`)
- `channel` (`notificationChannel` enum): `'IN_APP'`, `'EMAIL'` (defaults to `'EMAIL'`)
- `status` (`notificationDeliveryStatus` enum): `'PENDING'`, `'PROCESSING'`, `'SENDING'`, `'FAILED'`, `'SUCCEEDED'`, `'UNKNOWN'`, `'SUPPRESSED'`, `'DEAD'`
- `runAfter` (`timestamp with time zone`): Scheduled execution time.
- `leaseUntil` (`timestamp with time zone`, nullable): Worker lease expiry.
- `lockedBy` (`text`, nullable): Worker identifier.
- `leaseToken` (`text`, nullable): Worker lease token.
- `attemptCount` (`integer`, default `0`, max 8).
- `messageId` (`text`, unique)
- `providerReceipt` (`text`, nullable)
- `lastErrorCode` (`text`, nullable)
- `completedAt` (`timestamp with time zone`, nullable)
- `sentAt` (`timestamp with time zone`, nullable)
- `createdAt`, `updatedAt` (`timestamp with time zone`)
