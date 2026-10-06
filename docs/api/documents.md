# Documents API Specification

> **Module**: `DocumentsModule` (`apps/server/src/modules/documents`)  
> **Base Path**: `/api/v1/workspaces/:workspaceId/documents`  
> **Source Files**:
>
> - Controller: [`apps/server/src/modules/documents/presentation/documents.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/presentation/documents.controller.ts)
> - DTOs: [`apps/server/src/modules/documents/presentation/document.dto.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/presentation/document.dto.ts)
> - Service: [`apps/server/src/modules/documents/application/document.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document.service.ts)
> - Access Service: [`apps/server/src/modules/documents/application/document-access.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document-access.service.ts)
> - Visibility Policy: [`apps/server/src/modules/documents/infrastructure/document-visibility.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/infrastructure/document-visibility.ts)
> - DB Schema: [`apps/server/src/database/schema/document.schema.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/database/schema/document.schema.ts)

---

## 1. Overview & Key Components

The `DocumentsModule` provides polymorphic document management scoped to either a `project`, a `team`, or an `initiative`. Each document must belong to exactly one container (`num_nonnulls(project_id, team_id, initiative_id) = 1`).

All mutation operations require optimistic concurrency control via `expectedRevision` and enforce idempotency through `@TransactionalCommand()` requiring the `Idempotency-Key` header (UUID v4).

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Workspace and Role Scoping

- **Guest Restriction**: Members with `member.role === 'GUEST'` are rejected with `403 Forbidden` (`Document permission denied.`) on all document routes.
- **Tenant Isolation**: Every query and mutation is partitioned by `:workspaceId`.

### 2.2 Container Scoping & Invariant Checks

- **Owner Inactive Check**: If the target container (`project`, `team`, `initiative`) is archived or deleted, document creation or mutation is rejected with `409 Conflict` (`Document owner is inactive.`).
- **Owner Polymorphism**:
  - `ownerType`: `'project' | 'team' | 'initiative'`
  - `ownerId`: string identifier corresponding to the target container.
  - A document's owner container cannot be altered after creation.
- **Author vs. Owner Management Rights**:
  - Updating, archiving, deleting, or restoring a document is permitted if:
    - The caller is the original author (`authorId === member.id`), OR
    - The caller is a workspace `OWNER` or `ADMIN`, OR
    - The caller has `manage` permission on the owner container (e.g. project manager, team admin, initiative lead).

### 2.3 Visibility Filtering (Read Access)

- Non-deleted documents are visible based on container privacy:
  - **Team documents**: Team visibility is `WORKSPACE` or the user is an active member of the team.
  - **Project documents**: Project is not deleted, and for every private team the project belongs to, the user is a member of that team.
  - **Initiative documents**: Initiative is not deleted and satisfies initiative visibility policies.
  - If a user lacks read access to the container when querying a specific document, it throws `404 Not Found` (information-hiding principle).

---

## 3. Domain Invariants & HTTP Errors

| Invariant / Condition                                            | HTTP Status       | Error Message / Code                                         | Source File & Line                                                                                                                                                                        |
| ---------------------------------------------------------------- | ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User role is `GUEST`                                             | `403 Forbidden`   | `"Document permission denied."`                              | [`document-access.service.ts#L49-L50`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document-access.service.ts#L49-L50)     |
| Non-author lacks manage rights on container                      | `403 Forbidden`   | Container-specific permission exception                      | [`document-access.service.ts#L115-L127`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document-access.service.ts#L115-L127) |
| Missing either `ownerType` or `ownerId` when filtering in `list` | `400 Bad Request` | `"Supply both ownerType and ownerId."`                       | [`document.service.ts#L66-L67`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document.service.ts#L66-L67)                   |
| Document not found or soft-deleted                               | `404 Not Found`   | `"Document not found."`                                      | [`document-access.service.ts#L102-L103`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document-access.service.ts#L102-L103) |
| Container is archived or inactive during create/update           | `409 Conflict`    | `"Document owner is inactive."`                              | [`document-access.service.ts#L70-L82`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document-access.service.ts#L70-L82)     |
| Mutation against inactive (deleted/archived) document            | `409 Conflict`    | `"Document is inactive."`                                    | [`document-access.service.ts#L114`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document-access.service.ts#L114)           |
| Archiving an already deleted document without restoring          | `409 Conflict`    | `"Restore a deleted document before archiving it."`          | [`document.service.ts#L247-L250`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document.service.ts#L247-L250)               |
| `expectedRevision` does not match DB `revision`                  | `409 Conflict`    | `"Revision conflict. Fetch the current resource and retry."` | [`document.service.ts#L212-L215`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/documents/application/document.service.ts#L212-L215)               |

---

## 4. Endpoints Table

| Method   | Path                                             | Access           | Idempotent         | Description                                                                   |
| -------- | ------------------------------------------------ | ---------------- | ------------------ | ----------------------------------------------------------------------------- |
| `GET`    | `/workspaces/:workspaceId/documents`             | Member           | No                 | List documents with cursor pagination and optional owner filter               |
| `POST`   | `/workspaces/:workspaceId/documents`             | Member           | **Yes** (Required) | Create a new document attached to a project, team, or initiative              |
| `GET`    | `/workspaces/:workspaceId/documents/:id`         | Member           | No                 | Retrieve single document details                                              |
| `PATCH`  | `/workspaces/:workspaceId/documents/:id`         | Author / Manager | **Yes** (Required) | Update document title and/or body with revision lock                          |
| `DELETE` | `/workspaces/:workspaceId/documents/:id`         | Author / Manager | **Yes** (Required) | Soft delete a document with revision lock (Returns HTTP 200)                  |
| `POST`   | `/workspaces/:workspaceId/documents/:id/archive` | Author / Manager | **Yes** (Required) | Archive an active document with revision lock (Returns HTTP 200)              |
| `POST`   | `/workspaces/:workspaceId/documents/:id/restore` | Author / Manager | **Yes** (Required) | Restore an archived or deleted document with revision lock (Returns HTTP 200) |

---

## 5. Endpoint Details

### 5.1 List Documents

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/documents`
- **Query Parameters (`DocumentListDto`)**:
  - `cursor?: string` (Base64URL cursor)
  - `limit?: number` (Default: `25`, max: `100`)
  - `ownerType?: 'project' | 'team' | 'initiative'` (Must be provided if `ownerId` is provided)
  - `ownerId?: string` (Must be provided if `ownerType` is provided)
  - `lifecycle?: 'active' | 'archived' | 'deleted'` (Default: `'active'`)
- **Success Response (200 OK)**:

```json
{
  "data": [
    {
      "id": "doc_01j7abc...",
      "workspaceId": "ws_123",
      "title": "Architecture Specification",
      "body": "# Architecture Overview...",
      "authorId": "mem_01",
      "projectId": "proj_01",
      "teamId": null,
      "initiativeId": null,
      "revision": 1,
      "archivedAt": null,
      "deletedAt": null,
      "createdAt": "2026-10-01T12:00:00.000Z",
      "updatedAt": "2026-10-01T12:00:00.000Z"
    }
  ],
  "meta": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

### 5.2 Create Document

- **Method**: `POST`
- **Path**: `/api/v1/workspaces/:workspaceId/documents`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`CreateDocumentDto`)**:

```json
{
  "ownerType": "project",
  "ownerId": "proj_01j7abc...",
  "title": "Technical Requirements",
  "body": "Detailed technical specification..."
}
```

- **Validation Rules**:
  - `ownerType`: Required, must be one of `project`, `team`, `initiative`.
  - `ownerId`: Required string, non-empty, max 100 chars.
  - `title`: Required string, non-empty, max 200 chars.
  - `body`: Required string, max 100,000 chars, cannot contain null bytes (`\0`).
- **Success Response (201 Created)**: Single document object wrapped in `{ data: Document, meta: {} }`.

### 5.3 Get Document

- **Method**: `GET`
- **Path**: `/api/v1/workspaces/:workspaceId/documents/:id`
- **Success Response (200 OK)**: Single document object wrapped in `{ data: Document, meta: {} }`.

### 5.4 Update Document

- **Method**: `PATCH`
- **Path**: `/api/v1/workspaces/:workspaceId/documents/:id`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`UpdateDocumentDto`)**:

```json
{
  "expectedRevision": 1,
  "title": "Updated Architecture Specification",
  "body": "Updated markdown content..."
}
```

- **Validation Rules**:
  - `expectedRevision`: Required integer >= 1.
  - `title`: Optional string, non-empty, max 200 chars.
  - `body`: Optional string, max 100,000 chars, no null bytes.
- **Success Response (200 OK)**: Updated document with bumped `revision: 2`.

### 5.5 Delete Document

- **Method**: `DELETE`
- **Path**: `/api/v1/workspaces/:workspaceId/documents/:id`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`DocumentRevisionDto`)**:

```json
{
  "expectedRevision": 1
}
```

- **Success Response (200 OK)**: Updated document with `deletedAt: "<iso-date>"` and bumped `revision: 2`.

### 5.6 Archive Document

- **Method**: `POST`
- **Path**: `/api/v1/workspaces/:workspaceId/documents/:id/archive`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`DocumentRevisionDto`)**:

```json
{
  "expectedRevision": 1
}
```

- **Success Response (200 OK)**: Updated document with `archivedAt: "<iso-date>"` and bumped `revision: 2`.

### 5.7 Restore Document

- **Method**: `POST`
- **Path**: `/api/v1/workspaces/:workspaceId/documents/:id/restore`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`DocumentRevisionDto`)**:

```json
{
  "expectedRevision": 2
}
```

- **Success Response (200 OK)**: Updated document with `archivedAt: null`, `deletedAt: null` and bumped `revision: 3`.

---

## 6. DB Schema & Side Effects

### DB Table `documents`

- Primary key: `id text`
- Partition key: `workspace_id text`
- Target container columns: `project_id text NULL`, `team_id text NULL`, `initiative_id text NULL`
- Constraints:
  - Exactly one container target non-null: `check('m11_document_target', num_nonnulls(project_id, team_id, initiative_id) = 1)`
  - Title: `length(trim(title)) BETWEEN 1 AND 200`
  - Body: `length(body) <= 200000` (Note: DTO limits to 100,000)
  - Revision: `integer DEFAULT 1 CHECK (revision >= 1)`
  - Lifecycle: `archived_at IS NULL OR deleted_at IS NULL`

### Side Effects

- **Domain Events** (`aggregateType: 'document'`):
  - `document.created`, `document.updated`, `document.archived`, `document.deleted`, `document.restored` with payload `{ document_id: id }`.
- **Audit Logs** (`targetType: 'document'`):
  - Emitted synchronously in the same transaction with action identical to the event name.
- **Idempotency**:
  - Enforced using PostgreSQL transaction-level advisory locks via `CommandBus`.

---

## 7. Cross-Module Dependencies

- `WorkspacesModule`: Membership, user identity, workspace tenancy.
- `ProjectsModule`: `ProjectAccessService` verifies project permissions and active state.
- `TeamsModule`: `TeamAccessService` verifies team permissions and membership.
- `InitiativesModule`: `InitiativeAccessService` verifies initiative permissions and active state.

---

## 8. Open Questions & Unverified Items

1. **Body length discrepancy**: The DTO decorator enforces `@MaxLength(100000)` while the DB schema check allows `length(body) <= 200000`. Frontend validation should enforce 100,000 to match the DTO pipe.
2. **Batch / Reorder endpoints**: Unlike initiatives or issues, documents have no ordering or sequence number, only creation timestamp ordering.
