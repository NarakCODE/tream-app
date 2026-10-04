# Tream Postman API tests

Import both files into Postman:

- `tream-complete.postman_collection.json` (or `tream-m01-m04.postman_collection.json`, which contains the identical full 251-request suite for backward compatibility)
- `tream-local.postman_environment.json`

Select **Tream — Local** as the active environment. Set `baseUrl` to your API origin without a trailing slash (default `http://localhost:3002`). The collection adds `/api/v1` for business routes; health probes use `/health` and `/health/ready`.

## Start the API

Configure `apps/server/.env` using `.env.example`, start PostgreSQL, apply migrations with `pnpm --filter server db:migrate`, then start the API with `pnpm --filter server dev`. See [server setup](../README.md).

## Automatic smoke run

In the Collection Runner, select only **01 Smoke — run this folder**, keep its request order, and run one iteration. This folder contains 28 requests with status, response-envelope and correlation-ID assertions. It tests refresh rotation, workspace creation/replay/key conflicts, list responses, preferences, invitations, outsider denial, final-owner protection, diagnostics, archive/trash and restoration.

Every smoke run generates unique owner/outsider emails and a workspace slug, then captures tokens, user/workspace/membership/invitation IDs into the active environment. It creates two accounts, a workspace, an invitation and encrypted mail jobs. The invitation is revoked and the workspace restored at the end; accounts and the workspace remain available for manual testing. The smoke folder does not need mailbox access. Do not run all nineteen folders together in a single sequential sweep: folders 02–19 are stateful manual recipes.

Newman command (tested and verified 28/28 passed):

```sh
pnpm dlx newman run apps/server/postman/tream-complete.postman_collection.json \
  --environment apps/server/postman/tream-local.postman_environment.json \
  --folder '01 Smoke — run this folder'
```

## Collection Structure

The collection contains **251 requests** across **19 modular folders**:

| # | Folder | Requests | Scope & Features |
|---|---|---|---|
| **01** | **Smoke — run this folder** | 28 | End-to-end regression smoke suite (executable via Newman) |
| **02** | **Auth — manual** | 15 | Register, login, refresh, logout, password reset, magic link, email verification, sessions |
| **03** | **Workspaces — manual** | 11 | Create, lookup, list, update settings, slug availability, member preferences |
| **04** | **Memberships — manual** | 6 | List members, get membership, update roles, suspend, leave workspace |
| **05** | **Invitations — manual** | 7 | Send invite, list invites, resend, revoke, accept invitation |
| **06** | **Workspace lifecycle — manual** | 3 | Archive, trash, restore workspace |
| **07** | **Teams and workflows — manual** | 17 | Team CRUD, visibility, membership, status catalog (create/reorder/retire) |
| **08** | **Projects and milestones — manual** | 30 | Project CRUD, statuses, milestones, health updates, team associations, archive/trash/restore |
| **09** | **Issues — M07 manual** | 14 | Issue CRUD, relations, transfers, revisions, archive/trash/restore |
| **10** | **Cycles — M08 manual** | 9 | Cycle creation, calendar bounds, rollover, completion, report, cancel |
| **11** | **Collaboration — M09 manual** | 40 | Comments, replies, reactions, subscriptions, labels, templates, activity log |
| **12** | **Private files and attachments — M10 manual** | 14 | Upload intents, signed upload/download grants, binary PUT, scanning, quota, attachments |
| **13** | **Initiatives — manual** | 19 | Initiative CRUD, target dates, project links/unlinks, reorder, status updates, archive/restore |
| **14** | **Documents — manual** | 7 | Document CRUD, Markdown body, project attachment, archive/trash/restore |
| **15** | **Views and search — manual** | 14 | Saved views, AST filter queries, favorites (add/reorder/remove), workspace search |
| **16** | **Notifications — manual** | 10 | Inbox listing, unread count badge, mark read/unread/archived, delivery preferences |
| **17** | **Audit history — manual** | 2 | Workspace audit trail listing, actor/action filtering, pagination |
| **18** | **Retention and trash — manual** | 3 | Workspace trash listing across resources, single purge/restore, retention policies |
| **19** | **Eventing outbox — manual** | 2 | Domain event outbox inspection, dead-letter monitoring, event retry |

---

## Environment Variables

The `tream-local.postman_environment.json` environment defines all necessary state variables. Key variables include:

| Variable | Scope & Purpose |
|---|---|
| `baseUrl` | API origin (`http://localhost:3002` by default). |
| `email`, `password` | Owner login credentials. Login automatically captures `accessToken` and `refreshToken`. |
| `workspaceId`, `workspaceSlug` | Target workspace ID and slug. |
| `membershipId`, `ownerMembershipId` | Workspace membership references. |
| `teamId`, `teamKey` | Active team ID and team key. |
| `projectId`, `milestoneId`, `projectUpdateId` | Project management references. |
| `issueId`, `issueIdentifier`, `issueRevision` | Active issue reference and concurrency revision tracker. |
| `cycleId`, `cycleRevision` | Active cycle reference and revision tracker. |
| `commentId`, `labelId`, `templateId` | Collaboration entities. |
| `fileId`, `attachmentId`, `fileUploadUrl`, `fileDownloadUrl` | Private file storage and signed grant URLs. |
| `initiativeId`, `initiativeRevision`, `initiativeUpdateId` | Strategic initiatives and status updates. |
| `documentId`, `documentRevision` | Project documentation reference. |
| `viewId`, `viewRevision`, `favoriteId`, `favoriteRevision` | Custom saved views and navigation favorites. |
| `notificationId`, `notificationRevision` | In-app notification ID and revision. |
| `*Cursor` (`workspaceCursor`, `issueCursor`, etc.) | Cursor pagination variables captured from `meta.nextCursor`. |

---

## Detailed Manual Testing Recipes

### M05 Team & Workflow Recipe (Folder 07)
Use **07 Teams and workflows — manual** after running the smoke run or logging in.
1. Run **Create team** to allocate a team and unique prefix key.
2. Run **List workflow statuses** to capture default statuses.
3. Exercise status catalog management: create, update, set default, reorder (`teamStatusIds`), and retire statuses.
4. Manage team members with **Add team member** and **Update team member role**.

### M06 Project & Milestone Recipe (Folder 08)
Use **08 Projects and milestones — manual** with an active workspace and team.
1. Run **List project statuses** to capture status IDs.
2. Run **Create project**; note that project dates accept `YYYY-MM-DD`.
3. Create milestones, reorder via `milestoneIds`, and post health status updates via **Publish project update**.
4. Test team association and lifecycle operations (archive, delete, restore).

### M07 Issue Recipe (Folder 09)
Use **09 Issues — M07 manual** with an active team.
1. Create parent and related issues to capture `parentIssueId` and `relatedIssueId`.
2. Create the primary issue; capture `issueId`, `issueIdentifier`, and `issueRevision`.
3. Every issue mutation sends `expectedRevision`. Successful mutations update `issueRevision`.
4. Test relations, label linking, team transfer, and archive/trash/restore.

### M08 Cycle Recipe (Folder 10)
Use **10 Cycles — M08 manual** on a cycle-enabled team (`cyclesEnabled: true`).
1. Create a cycle with calendar bounds (`cycleStartDate`, `cycleEndDate`).
2. Plan upcoming cycles; start the active cycle.
3. Test rollover by updating an issue into the cycle, then completing the cycle with rollover destination.
4. Read cycle progress and velocity reports.

### M09 Collaboration Recipe (Folder 11)
Use **11 Collaboration — M09 manual** on an active issue or project.
1. Add comments, reply to comments (`parentCommentId`), and edit comments with `expectedRevision`.
2. Add and delete emoji reactions.
3. Subscribe and unsubscribe to notifications on resources.
4. Create workspace/team labels, apply labels to issues, and test issue templates.

### M10 Private Files Recipe (Folder 12)
Use **12 Private files and attachments — M10 manual**.
1. **Create private upload intent**: captures `fileId` and `attachmentId`.
2. **Refresh expiring upload grant**: captures signed PUT URL `fileUploadUrl`.
3. **Upload exact UTF-8 fixture bytes**: PUT binary fixture (`23 UTF-8 bytes`, SHA256 `988f4488205e8a707724da5ed86e914902574aac51d2678251a0871be6ac8ee6`).
4. **Finalize and scan private file**: triggers antivirus scan and transitions file to `READY`.
5. **Issue scoped download grant** and **Download private fixture bytes**: verifies authenticated stream download.

### Initiatives Recipe (Folder 13)
Use **13 Initiatives — manual** to manage roadmap initiatives.
1. Run **Create initiative**: sets target date, color, description, capturing `initiativeId` and `initiativeRevision`.
2. Run **Link project to initiative**: associates an active project. Note that linking bumps `initiativeRevision`.
3. Run **Reorder linked projects**: sends array of project IDs and `expectedRevision`.
4. Run **Publish initiative update**: posts status update (`ON_TRACK`, `AT_RISK`, `OFF_TRACK`) with sentiment and confidence score.
5. Exercise archive and restore lifecycle.

### Documents Recipe (Folder 14)
Use **14 Documents — manual** for project documentation and specs.
1. Run **Create document**: creates a Markdown document linked to a project/workspace.
2. Run **Get document by ID**: fetches content and metadata.
3. Run **Update document**: updates title/body with `expectedRevision`.
4. Run **Trash document** and **Restore document**: verifies soft deletion and restoration.

### Saved Views & Search Recipe (Folder 15)
Use **15 Views and search — manual** to test the query and search engine.
1. Run **Create saved view**: saves an AST query with strict schema `{"version": 1, "sort": "CREATED_DESC"}`.
2. Run **Execute ad-hoc view query**: runs POST `/views/query` with arbitrary AST filters without saving.
3. Run **Create favorite**: pins an issue, project, or view to the user navigation sidebar.
4. Run **Reorder favorites**: updates ordering of pinned items.
5. Run **Search workspace resources**: runs full-text fuzzy search across issues, projects, and documents via GET `/search?q={{searchQuery}}`.

### Notifications Recipe (Folder 16)
Use **16 Notifications — manual** for inbox and notification preferences.
1. Run **List my notifications**: retrieves user inbox with pagination cursor.
2. Run **Get unread notification count**: returns badge count `{ "count": N }`.
3. Run **Mark notification as read / unread / archived**: updates individual notification state with `expectedRevision`.
4. Run **Mark all notifications as read**: batch dismisses all inbox items.
5. Run **Get / Update notification preferences**: configures per-category delivery channels (`inApp`, `email`) and digest frequency.

### Audit, Trash & Outbox Recipes (Folders 17–19)
- **17 Audit history**: Query workspace-level audit trail with filtering by `action`, `actorId`, and date range.
- **18 Retention and trash**: List all soft-deleted resources in the workspace, inspect retention policies, and execute restore or permanent purge.
- **19 Eventing outbox**: Inspect transactional outbox events, monitor failed deliveries, and trigger manual retry for dead-lettered events.

---

## Request & Protocol Behavior

1. **Idempotency**: All authenticated POST, PATCH, and DELETE requests (excluding auth routes and `/views/query`) automatically generate a UUID v4 `Idempotency-Key` header via pre-request scripts. Replaying commands with the same key returns the cached response.
2. **Fastify Empty Body**: Fastify strictly validates `Content-Type: application/json`. POST/DELETE routes without payloads (e.g., subscriptions) send `{}` to prevent JSON parsing errors.
3. **Filter AST Schema**: Views queries require strict AST grammar including `"version": 1`.
4. **Concurrency Control**: State-modifying endpoints require `expectedRevision`. Test scripts capture updated revisions automatically from response payloads.
5. **Non-browser Auth**: Requests use bearer token authorization headers (`Authorization: Bearer {{accessToken}}`), keeping cookies and session state isolated.

---

## Validation & Verification

- **Schema Compliance**: Verified against the official Postman v2.1 JSON Schema specification.
- **Script Validation**: All 397 pre-request and test scripts statically compiled and executed in Node VM.
- **Newman Smoke Verification**: Automated smoke suite (`01 Smoke — run this folder`) executed with **28/28 requests passing and 89/89 assertions successful (0 failures)**.
- **Integration Coverage**: Verified all newly added endpoints (Folders 13–19) against the running local NestJS Fastify server.
