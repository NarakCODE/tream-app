# Files and Attachments API Specification

> **Module**: `FilesModule` (`apps/server/src/modules/files`)  
> **Base Path**: `/api/v1/workspaces/:workspaceId`  
> **Source Files**:
>
> - Controller: [`apps/server/src/modules/files/presentation/files.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/presentation/files.controller.ts)
> - DTOs: [`apps/server/src/modules/files/presentation/file.dto.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/presentation/file.dto.ts)
> - Service: [`apps/server/src/modules/files/application/file.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts)
> - Access Service: [`apps/server/src/modules/files/application/file-access.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file-access.service.ts)
> - Policy: [`apps/server/src/modules/files/domain/file-content-policy.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/domain/file-content-policy.ts)
> - DB Schema: [`apps/server/src/database/schema/files.schema.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/database/schema/files.schema.ts)

---

## 1. Overview & Key Components

The `FilesModule` provides secure, authenticated binary file storage and attachment management across `issues`, `projects`, `comments`, and `documents`.

File upload is a 3-step staged workflow:

1. **Upload Intent**: Client declares filename, MIME type, byte size, and SHA-256 hash. Returns short-lived signed upload token.
2. **Binary Upload**: Client uploads raw binary stream (`application/octet-stream`) using the token. Server verifies magic bytes, MIME conformance, and checksum.
3. **Finalize**: Client triggers finalization with SHA-256 check. Server runs antivirus/anti-malware scanning and sets file status to `READY`.

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Workspace Scoping & Target Access

- All requests are scoped by `:workspaceId`.
- Uploading or attaching a file requires write permissions on the target resource (`issue`, `project`, `comment`, or `document`).
- Reading/downloading a file requires read permissions on at least one active attachment container referencing that file.

### 2.2 Security & Redaction Policies

- **Storage Key Redaction**: The internal `storageKey` is strictly excluded from all public API responses via `publicFile()`.
- **MIME Whitelist**: Allowed MIME types are strictly limited to:
  - `image/png`, `image/jpeg`, `application/pdf`, `text/plain`.
  - SVG and active HTML/script uploads are rejected with `400 Bad Request` (`Active markup is not allowed in attachments.`).
- **PDF Sanitization**: Embedded JavaScript (`/JavaScript`, `/Launch`, `/EmbeddedFile`, `/XFA`) is rejected with `400 Bad Request`.
- **Download Headers**:
  - `Content-Type: <mime>`
  - `Content-Disposition: attachment; filename="<sanitized>"`
  - `X-Content-Type-Options: nosniff`
  - `Cache-Control: private, no-store`

### 2.3 Quotas and Limits

- **Max File Size**: 25 MiB (`26,214,400` bytes).
- **Workspace Quota**: 1 GiB (`1,073,741,824` bytes) across non-purged files. Exceeding throws `409 Conflict` (`Workspace file quota exceeded.`).
- **Retention**: Deleted files are retained for 30 days before permanent deletion by `FileCleanupWorker`.

---

## 3. Domain Invariants & HTTP Errors

| Invariant / Condition                          | HTTP Status       | Error Message                                                                          | Source Reference                                                                                                                                                 |
| ---------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsupported MIME type                          | `400 Bad Request` | `"Unsupported file MIME type."`                                                        | [`file.service.ts:92`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L92)               |
| File exceeds 25 MiB cap                        | `400 Bad Request` | `"File exceeds the configured upload limit."`                                          | [`file.service.ts:95`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L95)               |
| Invalid filename (paths, controls, >150 chars) | `400 Bad Request` | `"Filename must be a plain name of at most 150 characters without paths or controls."` | [`file-content-policy.ts:24`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/domain/file-content-policy.ts#L24)      |
| Uploaded bytes do not match size or sha256     | `400 Bad Request` | `"Uploaded bytes do not match the declared size and checksum."`                        | [`file.service.ts:227`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L227)             |
| Active HTML/SVG markup detected                | `400 Bad Request` | `"Active markup is not allowed in attachments."`                                       | [`file-content-policy.ts:117`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/domain/file-content-policy.ts#L117)    |
| Embedded JS in PDF                             | `400 Bad Request` | `"Active or embedded PDF content is not allowed."`                                     | [`file-content-policy.ts:131`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/domain/file-content-policy.ts#L131)    |
| Invalid or expired grant token                 | `403 Forbidden`   | `"Invalid or expired file grant."`                                                     | [`file.service.ts:807`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L807)             |
| Attachment permission denied                   | `403 Forbidden`   | `"Attachment permission denied."`                                                      | [`file.service.ts:656`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L656)             |
| File or attachment not found                   | `404 Not Found`   | `"File not found."` / `"Attachment not found."`                                        | [`file-access.service.ts:86`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file-access.service.ts#L86) |
| Revision mismatch                              | `409 Conflict`    | `"Revision conflict. Fetch the current resource and retry."`                           | [`file.service.ts:70`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L70)               |
| Workspace file quota exceeded                  | `409 Conflict`    | `"Workspace file quota exceeded."`                                                     | [`file.service.ts:112`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L112)             |
| Attaching file not in READY state              | `409 Conflict`    | `"Only clean ready files can be attached."`                                            | [`file.service.ts:578`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L578)             |
| File already attached to target                | `409 Conflict`    | `"File is already attached to this target."`                                           | [`file.service.ts:599`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L599)             |
| Attachment already detached                    | `409 Conflict`    | `"Attachment is already detached."`                                                    | [`file.service.ts:677`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/files/application/file.service.ts#L677)             |

---

## 4. Endpoints Table

| Method   | Path                                                      | Access         | Idempotent         | Description                                      |
| -------- | --------------------------------------------------------- | -------------- | ------------------ | ------------------------------------------------ |
| `POST`   | `/workspaces/:workspaceId/files/upload-intents`           | Member         | **Yes** (Required) | Initiate upload intent and reserve storage quota |
| `POST`   | `/workspaces/:workspaceId/files/:fileId/upload-grants`    | Author         | **Yes** (Required) | Re-issue upload grant token for pending upload   |
| `PUT`    | `/workspaces/:workspaceId/files/:fileId/content`          | Author         | No (Body Stream)   | Stream binary bytes with signed grant token      |
| `POST`   | `/workspaces/:workspaceId/files/:fileId/finalize`         | Author         | **Yes** (Required) | Trigger checksum validation and virus scanning   |
| `GET`    | `/workspaces/:workspaceId/files/:fileId`                  | Viewer         | No                 | Get file metadata                                |
| `POST`   | `/workspaces/:workspaceId/files/:fileId/download-grants`  | Viewer         | **Yes** (Required) | Obtain signed token to download file             |
| `GET`    | `/workspaces/:workspaceId/files/:fileId/content`          | Viewer         | No                 | Stream binary file download with signed token    |
| `DELETE` | `/workspaces/:workspaceId/files/:fileId`                  | Author / Admin | **Yes** (Required) | Soft delete file and schedule 30-day purge       |
| `POST`   | `/workspaces/:workspaceId/files/:fileId/restore`          | Author / Admin | **Yes** (Required) | Restore soft-deleted file before purge deadline  |
| `GET`    | `/workspaces/:workspaceId/file-attachments`               | Viewer         | No                 | List attachments for target container            |
| `POST`   | `/workspaces/:workspaceId/file-attachments`               | Member         | **Yes** (Required) | Attach existing READY file to another container  |
| `DELETE` | `/workspaces/:workspaceId/file-attachments/:attachmentId` | Author / Admin | **Yes** (Required) | Detach attachment (cascades delete if last link) |

---

## 5. Endpoint Details

### 5.1 Upload Intent

- **Method**: `POST`
- **Path**: `/api/v1/workspaces/:workspaceId/files/upload-intents`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`UploadIntentDto`)**:

```json
{
  "targetType": "issue",
  "targetId": "iss_01j7abc...",
  "name": "screenshot.png",
  "mimeType": "image/png",
  "sizeBytes": 1048576,
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

- **Validation**:
  - `targetType`: Required, `'issue' | 'project' | 'comment' | 'document'`.
  - `name`: Non-empty string, max 200 chars.
  - `mimeType`: Allowed list only (`image/png`, `image/jpeg`, `application/pdf`, `text/plain`).
  - `sizeBytes`: Integer between 1 and 26,214,400 bytes (25 MiB).
  - `sha256`: Hex string matching `/^[a-f0-9]{64}$/`.
- **Success Response (201 Created)**:

```json
{
  "file": {
    "id": "file_01j7abc...",
    "workspaceId": "ws_123",
    "createdById": "mem_01j...",
    "sourceAttachmentId": "att_01j...",
    "name": "screenshot.png",
    "declaredMimeType": "image/png",
    "sizeBytes": 1048576,
    "sha256": "e3b0c442...",
    "status": "PENDING",
    "revision": 1,
    "uploadExpiresAt": "2026-10-01T12:05:00.000Z",
    "createdAt": "2026-10-01T12:00:00.000Z",
    "updatedAt": "2026-10-01T12:00:00.000Z"
  },
  "attachment": {
    "id": "att_01j...",
    "workspaceId": "ws_123",
    "fileId": "file_01j7abc...",
    "issueId": "iss_01j7abc...",
    "createdById": "mem_01j...",
    "revision": 1
  },
  "uploadUrl": "/api/v1/workspaces/ws_123/files/file_01j7abc.../content?grant=tream-file-grant-v1...",
  "expiresAt": "2026-10-01T12:05:00.000Z"
}
```

### 5.2 Upload Binary Content

- **Method**: `PUT`
- **Path**: `/api/v1/workspaces/:workspaceId/files/:fileId/content`
- **Query Parameter**: `grant: string` (Signed HMAC grant token)
- **Content-Type**: `application/octet-stream`
- **Body**: Raw binary bytes.
- **Success Response (200 OK)**: Public file record with `status: 'UPLOADED'`, `actualSizeBytes`, `actualMimeType`, `uploadedAt`.

### 5.3 Finalize File

- **Method**: `POST`
- **Path**: `/api/v1/workspaces/:workspaceId/files/:fileId/finalize`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`FinalizeFileDto`)**:

```json
{
  "expectedRevision": 2,
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

- **Success Response (200 OK)**: Public file record with `status: 'READY'`, `readyAt: "<timestamp>"`, and bumped `revision: 3`.

### 5.4 Download Grant & Content

- **Request Grant**: `POST /files/:fileId/download-grants`
  - Body: `{ "attachmentId": "att_01j..." }`
  - Response (201): `{ "downloadUrl": "/api/v1/workspaces/ws_123/files/.../content?grant=...", "expiresAt": "<timestamp>" }`
- **Download**: `GET /files/:fileId/content?grant=...`
  - Returns binary data stream with attachment download headers.

### 5.5 File Attachments

- **List Attachments**: `GET /file-attachments?targetType=issue&targetId=iss_01j...`
- **Attach**: `POST /file-attachments` (Body: `{ "targetType": "issue", "targetId": "...", "fileId": "...", "expectedRevision": 1 }`)
- **Detach**: `DELETE /file-attachments/:attachmentId` (Body: `{ "expectedRevision": 1 }`)

---

## 6. DB Schema & Side Effects

### DB Tables

1. `files`: `id` (ULID), `workspaceId`, `createdById`, `sourceAttachmentId`, `storageKey` (secret), `declaredMimeType`, `actualMimeType`, `sizeBytes`, `status` (`PENDING`, `UPLOADED`, `QUARANTINED`, `READY`, `DELETED`, `PURGING`, `PURGED`, `EXPIRED`), `revision`, `purgeAfter`.
2. `attachments`: `id` (ULID), `workspaceId`, `fileId`, `issueId`, `projectId`, `commentId`, `documentId`, `createdById`, `deletedAt`, `revision`.
3. `storage_cleanup_jobs`: Tracks asynchronous file purge jobs.

### Side Effects

- Emits events: `file.upload_intent_created`, `file.uploaded`, `file.ready`, `file.quarantined`, `file.deleted`, `file.restored`, `attachment.created`, `attachment.detached`.
- Mirrored synchronously in `audit_logs`.
- Cleanup jobs processed every 30s by `FileCleanupWorker`.
