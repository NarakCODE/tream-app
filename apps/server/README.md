# Tream API

A NestJS 11 and Fastify API for Tream. IAM uses PostgreSQL through Drizzle ORM for authenticated users, workspaces, and role-based memberships. Authentication uses bearer JWT access tokens, rotating refresh sessions, one-time magic links, and SMTP delivery. The legacy `UsersModule` remains an in-memory scaffold and is not the persistent IAM user store.

## Quick Start

From the repository root:

```bash
pnpm install
pnpm --filter server dev
```

The API listens on `http://localhost:3002` by default. Copy `.env.example` to `.env`, start PostgreSQL and an SMTP-compatible development mailbox, then apply migrations before starting the API:

```bash
pnpm --filter server db:migrate
pnpm --filter server dev
```

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

## Architecture

Controllers only map HTTP requests, versioning, validation, and OpenAPI metadata. Services own business behavior. `common/` contains global request context, validation, response transformation, and exception handling; `shared/logger/` configures structured Pino logs with redaction. IAM is organized as a feature boundary with domain types, application ports/services, Drizzle and SMTP infrastructure adapters, and HTTP presentation.

## Development Notes

The project is strict TypeScript, including exact optional properties and checked indexed access. Use Fastify types rather than Express types. Husky invokes `lint-staged` for staged TypeScript and Markdown files. The server has a package-level `turbo.json` so `dist/`, type-check state, and coverage participate in Turbo task caching.
