# Tream Backend API Specifications

This directory contains the authoritative, source-verified specifications for the NestJS REST backend (`apps/server`) serving the Next.js web application (`apps/web`).

These specifications serve as the single source of truth for generating TypeScript types, Zod schemas, API clients, and TanStack Query hooks.

---

## Global Conventions & Architecture

Before implementing feature clients, review [`docs/api-conventions.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api-conventions.md):

- **Base URI & Versioning**: `/api/v1/...`
- **Authentication**: Bearer JWT in `Authorization` header, refresh token via httpOnly cookie.
- **Idempotency**: All mutating operations (`POST`, `PATCH`, `DELETE`) require an `Idempotency-Key` header with a valid UUID v4.
- **Optimistic Concurrency Control**: Resources enforce `expectedRevision` numbers on updates and deletions, throwing `409 Conflict` on staleness.
- **Pagination**: Standard cursor pagination with Base64URL tokens (`cursor`, `limit`).
- **Response Format**: Enveloped responses via `ResponseTransformInterceptor`: `{ data: T, meta: { ... } }` or cursor lists `{ paginationType: 'cursor', items: T[], ... }`.

---

## Module Index (In Build Order)

| #   | Module                  | Base Path                                          | Spec Document                                                                                                | Key Features                                                                                        |
| --- | ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | **IamModule**           | `/api/v1/auth`, `/api/v1/me`, `/api/v1/workspaces` | [`iam.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/iam.md)                     | Authentication, sessions, user profile, workspace CRUD, memberships, invitations                    |
| 2   | **TeamsModule**         | `/api/v1/workspaces/:workspaceId/teams`            | [`teams.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/teams.md)                 | Team lifecycle, key reservation, membership administration, workflow statuses, cycle settings       |
| 3   | **ProjectsModule**      | `/api/v1/workspaces/:workspaceId/projects`         | [`projects.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/projects.md)           | Projects, multi-team links, custom project statuses, milestones, project updates                    |
| 4   | **IssuesModule**        | `/api/v1/workspaces/:workspaceId/issues`           | [`issues.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/issues.md)               | Atomic issue numbering, dependency DAGs, cycle & project assignments, transitions, transfers        |
| 5   | **CyclesModule**        | `/api/v1/workspaces/:workspaceId/cycles`           | [`cycles.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/cycles.md)               | Sprint cycles, automated cadence scheduling, rollover unfinished issues, burndown reports           |
| 6   | **InitiativesModule**   | `/api/v1/workspaces/:workspaceId/initiatives`      | [`initiatives.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/initiatives.md)     | Cross-project initiatives, project reordering, aggregate issue progress tracking, updates           |
| 7   | **DocumentsModule**     | `/api/v1/workspaces/:workspaceId/documents`        | [`documents.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/documents.md)         | Polymorphic documentation attached to projects, teams, or initiatives with revision control         |
| 8   | **CollaborationModule** | `/api/v1/workspaces/:workspaceId/...`              | [`collaboration.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/collaboration.md) | Threaded comments, mentions validation, emoji reactions, labels, subscriptions, issue templates     |
| 9   | **FilesModule**         | `/api/v1/workspaces/:workspaceId/files`            | [`files.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/files.md)                 | 3-stage upload intents, binary streaming, antivirus validation, signed download grants, attachments |
| 10  | **ViewsModule**         | `/api/v1/workspaces/:workspaceId/views`            | [`views.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/views.md)                 | Saved issue/project views, ad-hoc queries, member favorites reordering, global search               |
| 11  | **NotificationsModule** | `/api/v1/workspaces/:workspaceId/notifications`    | [`notifications.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/notifications.md) | Member inboxes, read/unread states, channel preferences, batch mark-as-read                         |
| 12  | **EventingModule**      | `/api/v1/workspaces/:workspaceId/outbox`           | [`eventing.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/eventing.md)           | Transactional outbox monitoring, failed/quarantined dispatch attempt inspection                     |
| 13  | **AuditHistoryModule**  | `/api/v1/workspaces/:workspaceId/audit`            | [`audit-history.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/audit-history.md) | Administrator audit logs, automatic credential/content redaction, private container visibility      |
| 14  | **RetentionModule**     | `/api/v1/workspaces/:workspaceId/trash`            | [`retention.md`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/docs/api/retention.md)         | Workspace data retention policies, multi-resource trash bin, soft-deleted workspace recovery        |

---

## Out of Scope Modules (No REST Endpoints)

The following modules in `apps/server/src/modules` were audited and confirmed to expose no REST controllers:

- `AuditModule`: Internal event provider and writer only.
- `ReviewsModule`, `ContactsModule`, `CompaniesModule`, `DealsModule`, `TasksModule`, `DynamicDataModule`, `IntegrationsModule`: Future scaffolds with no registered controllers.
- `CoreModule`: System health checks only (`GET /health`, `GET /health/ready` at version-neutral root).
