# Tream API

A NestJS 11 and Fastify API for Tream. IAM uses PostgreSQL through Drizzle ORM for authenticated users, workspaces, and role-based memberships. Authentication uses bearer JWT access tokens, rotating refresh sessions, one-time magic links, and SMTP delivery. The legacy `UsersModule` remains an in-memory scaffold and is not the persistent IAM user store.

## Quick Start

From the repository root:

```bash
pnpm install
pnpm --filter server dev
```

The API listens on `http://localhost:3002` by default. Copy `.env.example` to `.env`, start PostgreSQL and an SMTP-compatible development mailbox, then apply migrations before starting the API. The checked-in Compose service matches the default `DATABASE_URL`:

```bash
docker compose -f apps/server/compose.yaml up -d
pnpm --filter server db:migrate
pnpm --filter server dev
```

Stop PostgreSQL with `docker compose -f apps/server/compose.yaml down`. The named volume preserves local data; add `--volumes` only when you intentionally want to delete it.

The API uses `/api/v1` routes, while `GET /health` is intentionally unversioned and unwrapped. Set `SWAGGER_ENABLED=true` to expose OpenAPI documentation at `/docs`.

```bash
pnpm --filter server check-types
pnpm --filter server lint
pnpm --filter server test
pnpm --filter server test:e2e
pnpm --filter server build
```

## API Contracts

Successful resources use a `{ data, meta }` envelope. `meta` always includes an ISO timestamp and correlation ID. List responses add pagination metadata. Expected errors use `{ error, meta }`, with typed error codes such as `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, and `RESOURCE_CONFLICT`.

Send a valid UUID, ULID, or `req_<ULID>` in `x-request-id` to retain it; otherwise the server generates a `req_<ULID>` value and returns it in every response header and envelope.

Authenticated `POST` and `PATCH` endpoints require `Idempotency-Key` with a UUID v4 value unless the route is explicitly exempt. A completed key replays the stored transformed response for the same authenticated user, method, route, key, and request payload. Reusing the same key with different request content returns `RESOURCE_CONFLICT`. Public authentication endpoints and read-only requests do not require this header.

The reservation and each feature mutation are not yet coordinated by one shared PostgreSQL transaction. Reservations are retained when response persistence fails, but crash recovery and reconciliation for a mutation committed before its idempotency response remain deferred.

## Authentication

- `POST /api/v1/auth/signup` creates an account and session.
- `POST /api/v1/auth/login` authenticates with email and password.
- `POST /api/v1/auth/magic-link` sends a generic, non-enumerating response.
- `POST /api/v1/auth/magic-link/verify` consumes a one-time token.
- `POST /api/v1/auth/refresh` rotates an opaque refresh token.
- `POST /api/v1/auth/logout` revokes a refresh session and requires bearer authentication.
- `GET /api/v1/me` and `PATCH /api/v1/me` expose the authenticated profile.

Access tokens are short-lived JWTs. Refresh and magic-link tokens are returned or delivered only in raw form; PostgreSQL stores SHA-256 token digests. Passwords are stored as salted scrypt hashes. Configure token lifetimes, issuer/audience, the access secret, magic-link URL, and SMTP transport through the variables documented in `.env.example`.

## Workspaces and RBAC

- `GET /api/v1/workspaces` lists the authenticated user's active workspaces.
- `POST /api/v1/workspaces` creates a workspace and atomically grants the creator `OWNER` membership.
- `GET`, `PATCH`, and `DELETE /api/v1/workspaces/:workspaceId` read, update, and soft-delete a workspace.
- `GET` and `POST /api/v1/workspaces/:workspaceId/members` list or add existing accounts by email.
- `GET`, `PATCH`, and `DELETE /api/v1/workspaces/:workspaceId/members/:memberId` read, change the role of, or remove a member.

Workspace authorization is loaded from the current membership on every request; roles are not embedded in access tokens. `OWNER`, `ADMIN`, `MEMBER`, and `GUEST` can view workspace and membership data. `OWNER` and `ADMIN` can update workspace metadata and add members, while only an `OWNER` can delete a workspace. Owners can manage every membership while preserving at least one owner. Admins can manage only `MEMBER` and `GUEST` memberships and can assign `ADMIN`, `MEMBER`, or `GUEST`; they cannot manage owners, modify existing admins, or grant ownership. Requests by non-members and requests for missing or deleted workspaces return `FORBIDDEN` to avoid disclosing tenant existence.

Workspace slugs are unique lowercase alphanumeric strings with hyphens. Member creation does not issue an invitation token: the supplied normalized email must already belong to an IAM account.

## Contacts

- `GET` and `POST /api/v1/workspaces/:workspaceId/contacts` list or create active contacts.
- `GET /api/v1/workspaces/:workspaceId/contacts/by-email/:email` finds an active contact by normalized email.
- `GET`, `PATCH`, and `DELETE /api/v1/contacts/:contactId` read, update, and soft-delete a contact.

Contact lists use opaque cursor pagination ordered by creation time and ID in descending order. Emails are normalized to lowercase and are case-insensitively unique among active contacts in each workspace. Duplicate create or update requests return `RESOURCE_CONFLICT` with the existing contact ID and a merge recommendation. Soft deletion permits the same email to be created again later.

All workspace roles may read contacts. `OWNER`, `ADMIN`, and `MEMBER` may write; `GUEST` is read-only. Resource routes return the same `FORBIDDEN` response for missing, deleted, and foreign-workspace IDs to avoid disclosing tenant data. Contact company assignments are checked against an active company in the same workspace and protected by a composite database foreign key. The migration adds that constraint as `NOT VALID` so legacy rows do not block rollout; PostgreSQL still enforces it for new assignments. Contact timelines, merge execution, and event/outbox emission remain deferred.

## Companies

- `GET` and `POST /api/v1/workspaces/:workspaceId/companies` list or create active companies.
- `GET /api/v1/workspaces/:workspaceId/companies/by-domain/:domain` resolves a canonical web domain.
- `GET`, `PATCH`, and `DELETE /api/v1/companies/:companyId` read, update, and soft-delete a company.
- `GET /api/v1/companies/:companyId/contacts` cursor-paginates active contacts assigned to the company.
- `GET /api/v1/companies/:companyId/deals` cursor-paginates active deals assigned to the company.

Company lists use the same opaque, stable cursor contract as Contacts. Domains are optional, canonical DNS names without schemes, paths, ports, or IP addresses. Domains intentionally remain non-unique per workspace; a by-domain lookup with multiple active matches returns `RESOURCE_CONFLICT` and all matching company IDs. Every workspace role may read companies, while `OWNER`, `ADMIN`, and `MEMBER` may write. Hidden resource IDs use the same non-enumerating `FORBIDDEN` response.

Company event/outbox emission and broader company search are deferred.

## Deals

- `GET` and `POST /api/v1/workspaces/:workspaceId/deals` list or create active deals, with optional `stage` and `companyId` list filters.
- `GET`, `PATCH`, and `DELETE /api/v1/deals/:dealId` read, update, and soft-delete a deal.
- `GET` and `POST /api/v1/deals/:dealId/contacts` list or add contact associations.
- `DELETE /api/v1/deals/:dealId/contacts/:contactId` removes a contact association.

Deal amounts are fixed-scale decimal strings backed by `numeric(12,2)`, must be non-negative, and allow up to ten integer digits. Currency codes are normalized to three uppercase ASCII letters and default to `USD`. The only currently evidenced stage is `DISCOVERY`, so it is the default and no additional pipeline states are invented. Company and contact references must be active and belong to the same workspace. Duplicate contact associations return `RESOURCE_CONFLICT`.

All roles can read deals; `OWNER`, `ADMIN`, and `MEMBER` can write, while `GUEST` is read-only. Deal events/outbox delivery, additional stages, search, and timelines remain deferred.

## Tasks

- `GET` and `POST /api/v1/workspaces/:workspaceId/tasks` list or create active tasks, with optional `status` and `assigneeId` list filters.
- `GET`, `PATCH`, and `DELETE /api/v1/tasks/:taskId` read, update, and soft-delete a task.
- `POST /api/v1/tasks/:taskId/assign` assigns any active membership from the same workspace.
- `POST /api/v1/tasks/:taskId/complete` marks an open task `DONE`.
- `POST /api/v1/tasks/:taskId/reopen` moves a completed task back to `TODO`.

Tasks are created as `TODO`; ordinary updates may use only `TODO` or `IN_PROGRESS`. Completion and reopening are explicit, state-idempotent actions: repeating an already satisfied action returns the unchanged task without advancing `updatedAt`. Optional contact and deal references must be active and belong to the same workspace when assigned. Task references use scalar `ON DELETE SET NULL` foreign keys plus transactional tenant checks so physical cleanup can retain safe nulling semantics without risking a non-null workspace ID.

All roles can read tasks; `OWNER`, `ADMIN`, and `MEMBER` can write, while `GUEST` is read-only. Direct task-to-company links, completion audit columns, events/outbox delivery, search, and timelines remain deferred.

## Dynamic Data

- `GET` and `POST /api/v1/workspaces/:workspaceId/databases` list or create workspace databases.
- `GET`, `PATCH`, `DELETE`, and `POST /api/v1/databases/:databaseId/duplicate` manage database metadata and schema duplication.
- `GET` and `POST /api/v1/databases/:databaseId/fields` list or create active field definitions.
- `GET`, `PATCH`, and `DELETE /api/v1/database-fields/:fieldId` read, update, and soft-delete fields.
- `GET` and `POST /api/v1/databases/:databaseId/records` list or create records.
- `GET`, `PATCH`, `DELETE`, and `POST /api/v1/records/:recordId/restore` read, update, soft-delete, and restore records.
- `POST /api/v1/databases/:databaseId/records/bulk`, `PATCH /api/v1/databases/:databaseId/records/bulk`, and `POST /api/v1/databases/:databaseId/records/bulk-delete` perform atomic bulk record operations.
- `POST /api/v1/databases/:databaseId/query` evaluates a finite validated filter AST and is exempt from the idempotency header because it is a read query.

Dynamic fields support typed values, required fields, select/status option validation, user references within the same workspace, relation references to active records, and system-managed created/updated timestamps. Record soft deletes can be restored for 30 days. Record create, update, restore, and delete operations append durable `database.record.*` events and create initial `PENDING` database dispatch attempts in the same repository transaction.

All workspace roles may read dynamic data. `OWNER`, `ADMIN`, and `MEMBER` may write, while `GUEST` is read-only. Missing, deleted, foreign-tenant, and unauthorized resources return non-enumerating `FORBIDDEN` responses.

## Events

- `GET /api/v1/workspaces/:workspaceId/events` cursor-paginates the immutable workspace event log with optional event-type and date filters.
- `GET /api/v1/events/:eventId` returns an event payload when the actor belongs to the event workspace.
- `POST /api/v1/events/:eventId/reprocess` creates another pending dispatch attempt for owners and admins.

Eventing is currently a database-backed outbox boundary. A `PENDING` dispatch attempt records that delivery or trigger re-evaluation has been requested; no BullMQ, Redis, or worker delivery process is mounted in this slice.

## Architecture

Controllers only map HTTP requests, versioning, validation, and OpenAPI metadata. Services own business behavior. `common/` contains global request context, validation, response transformation, idempotency, normalization, and exception handling; `shared/logger/` configures structured Pino logs with redaction. IAM, Contacts, Companies, Deals, Tasks, Dynamic Data, and Eventing are isolated feature boundaries with domain types, application ports/services, infrastructure adapters, and HTTP presentation. Contacts owns contact queries; Deals imports that query capability, while Companies imports Deals' narrow company-list query service. This preserves the one-way dependency direction `Companies -> Deals -> Contacts`.

## Development Notes

The project is strict TypeScript, including exact optional properties and checked indexed access. Use Fastify types rather than Express types. Husky invokes `lint-staged` for staged TypeScript and Markdown files. The server has a package-level `turbo.json` so `dist/`, type-check state, and coverage participate in Turbo task caching.
