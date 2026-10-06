# Collaboration API Specification

> **Module**: `CollaborationModule` (`apps/server/src/modules/collaboration`)  
> **Base Path**: `/api/v1/workspaces/:workspaceId`  
> **Source Files**:
>
> - Controllers:
>   - [`apps/server/src/modules/collaboration/presentation/collaboration.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/presentation/collaboration.controller.ts)
>   - [`apps/server/src/modules/collaboration/presentation/issue-collaboration.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/presentation/issue-collaboration.controller.ts)
>   - [`apps/server/src/modules/collaboration/presentation/project-collaboration.controller.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/presentation/project-collaboration.controller.ts)
> - DTOs: [`apps/server/src/modules/collaboration/presentation/collaboration.dto.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/presentation/collaboration.dto.ts)
> - Services:
>   - [`apps/server/src/modules/collaboration/application/comment.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/comment.service.ts)
>   - [`apps/server/src/modules/collaboration/application/label.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/label.service.ts)
>   - [`apps/server/src/modules/collaboration/application/subscriber.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/subscriber.service.ts)
>   - [`apps/server/src/modules/collaboration/application/template.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/template.service.ts)
>   - [`apps/server/src/modules/collaboration/application/collaboration-access.service.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/collaboration-access.service.ts)
> - Domain Policies: [`apps/server/src/modules/collaboration/domain/collaboration-policy.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/domain/collaboration-policy.ts)
> - DB Schema: [`apps/server/src/database/schema/collaboration.schema.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/database/schema/collaboration.schema.ts)

---

## 1. Overview & Key Components

The `CollaborationModule` coordinates collaborative workflows across issues, projects, project updates, initiatives, and initiative updates. It provides:

1. **Threaded Comments & Reactions**: Rich markdown comments with `@mentions` verification and emoji reactions.
2. **Labels**: Workspace-wide and team-scoped taxonomy tags with color codes.
3. **Subscribers & Activity**: Entity subscriptions and timeline audit history.
4. **Issue Templates**: Team or workspace templates with default field presets and issue instantiation.

All mutating endpoints require the `Idempotency-Key` header via `@TransactionalCommand()`. Optimistic locking is enforced via `expectedRevision`.

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Workspace Scoping & Authorization

- Authorization is executed imperatively inside transaction callbacks via `CollaborationAccessService`.
- **Guest Limitations**: Members with role `GUEST` cannot write collaboration resources (`ForbiddenException('Guests cannot write collaboration resources.')`).
- **Target Invariant**: If a target container (project, initiative, issue) is archived or deleted, write operations are rejected with `ForbiddenException('Initiative is inactive.')` or `ForbiddenException('Project is inactive.')`.

### 2.2 Comment Moderation & Authorship Policy

- **Edit Body**: Only the original comment author (`authorId === member.id`) can update the comment body. Workspace administrators cannot edit another user's comment (`moderation: false`).
- **Soft-Delete / Restore**: Can be performed by either the original comment author OR workspace `OWNER`/`ADMIN` (`moderation: true`).
- **Deleted Comment Body Masking**: When querying a soft-deleted comment or listing comments that include deleted rows, the `body` field is masked to `null` to respect privacy while preserving thread hierarchy.

### 2.3 Mentions Gatekeeping

- When `@mentioning` member IDs (`mentionedMembershipIds`), every recipient is validated:
  - Must be an active member of the workspace.
  - Must have read access to the target entity. If any recipient cannot view the target, comment creation/update fails with `404 Not Found` (`Mention recipient not found.`) or `403 Forbidden`.

### 2.4 Label Scoping Rules

- Workspace-level labels (`teamId: null`) require workspace `OWNER` or `ADMIN` role to create or modify (`ForbiddenException('Workspace collaboration settings require an administrator.')`).
- Team-scoped labels (`teamId != null`) require team `manage` permission.
- Project labels must be workspace-scoped (`ConflictException('Project labels must be workspace scoped.')`). Team-scoped labels can only be assigned to issues belonging to that exact team.
- A label's team scope cannot be changed while it is actively assigned to issues or projects (`ConflictException('Remove label assignments before changing scope.')`).

---

## 3. Domain Invariants & HTTP Errors

| Invariant / Condition                      | HTTP Status       | Error Message                                                   | Source Reference                                                                                                                                                                             |
| ------------------------------------------ | ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text is empty or blank                     | `400 Bad Request` | `"Text must not be blank."`                                     | [`collaboration-policy.ts:9`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/domain/collaboration-policy.ts#L9)                          |
| Reply target mismatch                      | `400 Bad Request` | `"Replies must share the parent target."`                       | [`comment.service.ts:93`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/comment.service.ts#L93)                             |
| Guest writes collaboration resource        | `403 Forbidden`   | `"Guests cannot write collaboration resources."`                | [`collaboration-access.service.ts:46`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/collaboration-access.service.ts#L46)   |
| Non-author editing comment body            | `403 Forbidden`   | `"Comment permission denied."`                                  | [`collaboration-policy.ts:25`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/domain/collaboration-policy.ts#L25)                        |
| Non-admin modifying workspace label        | `403 Forbidden`   | `"Workspace collaboration settings require an administrator."`  | [`collaboration-access.service.ts:153`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/collaboration-access.service.ts#L153) |
| Mentioned member not found or lacks access | `404 Not Found`   | `"Mention recipient not found."`                                | [`collaboration-access.service.ts:187`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/collaboration-access.service.ts#L187) |
| Removing nonexistent reaction              | `404 Not Found`   | `"Reaction not found."`                                         | [`comment.service.ts:277`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/comment.service.ts#L277)                           |
| Unsubscribing when not subscribed          | `404 Not Found`   | `"Subscription not found."`                                     | [`subscriber.service.ts:64`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/subscriber.service.ts#L64)                       |
| Revision mismatch                          | `409 Conflict`    | `"Revision conflict. Fetch the current resource and retry."`    | [`collaboration-policy.ts:14`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/domain/collaboration-policy.ts#L14)                        |
| Deleting already deleted comment           | `409 Conflict`    | `"Comment is already deleted."`                                 | [`comment.service.ts:199`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/comment.service.ts#L199)                           |
| Restoring non-deleted comment              | `409 Conflict`    | `"Comment is not deleted."`                                     | [`comment.service.ts:201`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/comment.service.ts#L201)                           |
| Adding duplicate reaction                  | `409 Conflict`    | `"Reaction already exists."`                                    | [`comment.service.ts:279`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/comment.service.ts#L279)                           |
| Duplicate label name in scope              | `409 Conflict`    | `"An active label with this name already exists in the scope."` | [`label.service.ts:250`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/label.service.ts#L250)                               |
| Changing label scope with active links     | `409 Conflict`    | `"Remove label assignments before changing scope."`             | [`label.service.ts:157`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/label.service.ts#L157)                               |
| Team label linked to project               | `409 Conflict`    | `"Project labels must be workspace scoped."`                    | [`label.service.ts:345`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/label.service.ts#L345)                               |
| Label scope mismatch with issue team       | `409 Conflict`    | `"Label scope does not match the issue team."`                  | [`label.service.ts:317`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/label.service.ts#L317)                               |
| Subscribing when already subscribed        | `409 Conflict`    | `"Already subscribed."`                                         | [`subscriber.service.ts:65`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/subscriber.service.ts#L65)                       |
| Template defaults team mismatch            | `409 Conflict`    | `"Template defaults must match its team scope."`                | [`template.service.ts:333`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/collaboration/application/template.service.ts#L333)                         |

---

## 4. Endpoints Table

### 4.1 Comments, Labels & Templates (`CollaborationController`)

Base Path: `/workspaces/:workspaceId`

| Method   | Path                                                       | Access          | Idempotent         | Description                                       |
| -------- | ---------------------------------------------------------- | --------------- | ------------------ | ------------------------------------------------- |
| `GET`    | `/workspaces/:workspaceId/comments`                        | Member          | No                 | List comments for any target container            |
| `POST`   | `/workspaces/:workspaceId/comments`                        | Member          | **Yes** (Required) | Create a comment or threaded reply                |
| `GET`    | `/workspaces/:workspaceId/comments/:id`                    | Member          | No                 | Retrieve single comment (body is null if deleted) |
| `PATCH`  | `/workspaces/:workspaceId/comments/:id`                    | Author Only     | **Yes** (Required) | Edit comment body (authorship strictly enforced)  |
| `DELETE` | `/workspaces/:workspaceId/comments/:id`                    | Author / Admin  | **Yes** (Required) | Soft delete comment with revision lock            |
| `POST`   | `/workspaces/:workspaceId/comments/:id/restore`            | Author / Admin  | **Yes** (Required) | Restore deleted comment with revision lock        |
| `GET`    | `/workspaces/:workspaceId/comments/:id/reactions`          | Member          | No                 | List reactions on comment                         |
| `POST`   | `/workspaces/:workspaceId/comments/:id/reactions`          | Member          | **Yes** (Required) | Add emoji reaction                                |
| `DELETE` | `/workspaces/:workspaceId/comments/:id/reactions`          | Member          | **Yes** (Required) | Remove emoji reaction                             |
| `GET`    | `/workspaces/:workspaceId/labels`                          | Member          | No                 | List workspace and team labels                    |
| `POST`   | `/workspaces/:workspaceId/labels`                          | Manager / Admin | **Yes** (Required) | Create label                                      |
| `GET`    | `/workspaces/:workspaceId/labels/:id`                      | Member          | No                 | Get label details                                 |
| `PATCH`  | `/workspaces/:workspaceId/labels/:id`                      | Manager / Admin | **Yes** (Required) | Update label details                              |
| `POST`   | `/workspaces/:workspaceId/labels/:id/archive`              | Manager / Admin | **Yes** (Required) | Archive label                                     |
| `POST`   | `/workspaces/:workspaceId/labels/:id/restore`              | Manager / Admin | **Yes** (Required) | Restore label                                     |
| `GET`    | `/workspaces/:workspaceId/issue-templates`                 | Member          | No                 | List issue templates                              |
| `POST`   | `/workspaces/:workspaceId/issue-templates`                 | Manager / Admin | **Yes** (Required) | Create issue template                             |
| `GET`    | `/workspaces/:workspaceId/issue-templates/:id`             | Member          | No                 | Get issue template details                        |
| `PATCH`  | `/workspaces/:workspaceId/issue-templates/:id`             | Manager / Admin | **Yes** (Required) | Update issue template                             |
| `POST`   | `/workspaces/:workspaceId/issue-templates/:id/archive`     | Manager / Admin | **Yes** (Required) | Archive issue template                            |
| `POST`   | `/workspaces/:workspaceId/issue-templates/:id/restore`     | Manager / Admin | **Yes** (Required) | Restore issue template                            |
| `POST`   | `/workspaces/:workspaceId/issue-templates/:id/instantiate` | Member          | **Yes** (Required) | Create an issue directly from template            |

### 4.2 Issue Collaboration (`IssueCollaborationController`)

Base Path: `/workspaces/:workspaceId/issues/:targetId`

| Method   | Path                                   | Access | Idempotent         | Description                             |
| -------- | -------------------------------------- | ------ | ------------------ | --------------------------------------- |
| `GET`    | `.../issues/:targetId/comments`        | Member | No                 | List comments on issue                  |
| `GET`    | `.../issues/:targetId/labels`          | Member | No                 | List assigned labels on issue           |
| `POST`   | `.../issues/:targetId/labels`          | Member | **Yes** (Required) | Attach label to issue                   |
| `DELETE` | `.../issues/:targetId/labels/:labelId` | Member | **Yes** (Required) | Detach label from issue                 |
| `GET`    | `.../issues/:targetId/subscribers`     | Member | No                 | List subscribers on issue               |
| `POST`   | `.../issues/:targetId/subscription`    | Member | **Yes** (Required) | Subscribe caller to issue notifications |
| `DELETE` | `.../issues/:targetId/subscription`    | Member | **Yes** (Required) | Unsubscribe caller from issue           |
| `GET`    | `.../issues/:targetId/activity`        | Member | No                 | List audit activity timeline for issue  |

### 4.3 Project Collaboration (`ProjectCollaborationController`)

Base Path: `/workspaces/:workspaceId/projects/:targetId`

| Method   | Path                                     | Access | Idempotent         | Description                               |
| -------- | ---------------------------------------- | ------ | ------------------ | ----------------------------------------- |
| `GET`    | `.../projects/:targetId/comments`        | Member | No                 | List comments on project                  |
| `GET`    | `.../projects/:targetId/labels`          | Member | No                 | List assigned labels on project           |
| `POST`   | `.../projects/:targetId/labels`          | Member | **Yes** (Required) | Attach label to project                   |
| `DELETE` | `.../projects/:targetId/labels/:labelId` | Member | **Yes** (Required) | Detach label from project                 |
| `GET`    | `.../projects/:targetId/subscribers`     | Member | No                 | List subscribers on project               |
| `POST`   | `.../projects/:targetId/subscription`    | Member | **Yes** (Required) | Subscribe caller to project notifications |
| `DELETE` | `.../projects/:targetId/subscription`    | Member | **Yes** (Required) | Unsubscribe caller from project           |

---

## 5. Endpoint Details

### 5.1 Create Comment

- **Method**: `POST`
- **Path**: `/api/v1/workspaces/:workspaceId/comments`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`CreateCommentDto`)**:

```json
{
  "targetType": "issue",
  "targetId": "iss_01j7abc...",
  "body": "Fixed the query optimization issue in commit 4b2a.",
  "parentCommentId": "cmt_01j7parent...",
  "mentionedMembershipIds": ["mem_01j7bob..."]
}
```

- **Validation**:
  - `targetType`: Required, `'issue' | 'project' | 'project_update' | 'initiative' | 'initiative_update'`.
  - `targetId`: Required string (1–100 chars).
  - `body`: Required string (1–50,000 chars, non-blank).
  - `parentCommentId`: Optional string (1–100 chars).
  - `mentionedMembershipIds`: Optional array of unique strings, max 50 items.
- **Success Response (201 Created)**: Single `Comment` object wrapped in standard envelope.

### 5.2 Update Comment

- **Method**: `PATCH`
- **Path**: `/api/v1/workspaces/:workspaceId/comments/:id`
- **Headers**: `Idempotency-Key: <uuid-v4>` (Required)
- **Request Body (`UpdateCommentDto`)**:

```json
{
  "expectedRevision": 1,
  "body": "Updated comment text with clarification.",
  "mentionedMembershipIds": ["mem_01j7bob..."]
}
```

- **Success Response (200 OK)**: Single updated `Comment` with `editedAt: "<timestamp>"` and `revision: 2`.

### 5.3 Comment Reactions

- **Add Reaction**: `POST /comments/:id/reactions`
  - Body: `{ "emoji": "👍" }` (1–32 chars)
  - Headers: `Idempotency-Key: <uuid-v4>`
  - Response (201): `{ "commentId": "cmt_...", "emoji": "👍", "removed": false }`
- **Remove Reaction**: `DELETE /comments/:id/reactions`
  - Body: `{ "emoji": "👍" }`
  - Headers: `Idempotency-Key: <uuid-v4>`
  - Response (200): `{ "commentId": "cmt_...", "emoji": "👍", "removed": true }`

### 5.4 Labels Management

- **Create**: `POST /labels`
  - Body (`CreateLabelDto`):
  ```json
  {
    "name": "bug",
    "color": "#e11d48",
    "teamId": "team_01j...",
    "description": "Software defect or malfunction",
    "groupName": "type"
  }
  ```
  - Validation: `name` (1–100 chars), `color` (valid hex `#RRGGBB`), `teamId` (optional string or null).
- **Link to Issue**: `POST /issues/:targetId/labels`
  - Body (`LabelLinkDto`): `{ "labelId": "lbl_01...", "expectedRevision": 1 }`
  - Response (201): `{ "targetId": "iss_...", "labelId": "lbl_...", "removed": false, "revision": 2 }`
- **Unlink from Issue**: `DELETE /issues/:targetId/labels/:labelId`
  - Body (`LabelUnlinkDto`): `{ "expectedRevision": 2 }`
  - Response (200): `{ "targetId": "iss_...", "labelId": "lbl_...", "removed": true, "revision": 3 }`

### 5.5 Entity Subscription

- **Subscribe**: `POST /issues/:targetId/subscription` (or `projects/:targetId/subscription`)
  - No body required. Headers: `Idempotency-Key: <uuid-v4>`
  - Response (201): `{ "membershipId": "mem_01...", "subscribed": true }`
- **Unsubscribe**: `DELETE /issues/:targetId/subscription` (or `projects/:targetId/subscription`)
  - No body required. Headers: `Idempotency-Key: <uuid-v4>`
  - Response (200): `{ "membershipId": "mem_01...", "subscribed": false }`

### 5.6 Issue Templates

- **Instantiate**: `POST /issue-templates/:id/instantiate`
  - Headers: `Idempotency-Key: <uuid-v4>`
  - Body (`InstantiateTemplateDto`):
  ```json
  {
    "teamId": "team_01j...",
    "title": "Custom Issue Title Override"
  }
  ```
  - Response (201): Returns the newly created `Issue` record.

---

## 6. DB Schema & Side Effects

### DB Tables

1. `comments`: `id` (ULID), `workspaceId`, `authorId`, `parentCommentId`, `body` (masked to null if `deletedAt`), `mentionedMembershipIds` (jsonb), `revision`, `deletedAt`, `editedAt`.
   - Constraint `m09_comment_target`: `num_nonnulls(issue_id, project_id, project_update_id, initiative_id, initiative_update_id) = 1`.
2. `comment_reactions`: `id`, `workspaceId`, `commentId`, `membershipId`, `emoji`.
   - Unique index: `(comment_id, membership_id, emoji)`.
3. `labels`: `id`, `workspaceId`, `teamId`, `name`, `color`, `description`, `groupName`, `revision`, `archivedAt`.
4. `issue_labels` / `project_labels`: Association tables tracking label assignments.
5. `issue_subscribers` / `project_subscribers`: Subscriptions table.
6. `issue_templates`: Reusable issue blueprints.
7. `issue_activity`: Relational link between `events` and issues.

### Side Effects

- Emits events via `EventWriter.append`: `comment.created`, `comment.updated`, `comment.deleted`, `comment.reaction_added`, `issue.label_added`, `issue.subscribed`, etc.
- Synchronously mirrors each action into `audit_logs`.
- Records entries in `issue_activity` for timeline visualization.
