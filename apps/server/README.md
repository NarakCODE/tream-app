# Tream API

A production-oriented NestJS 11 and Fastify scaffold. It intentionally contains no database, authentication provider, cache, or queue dependency; the `UsersModule` uses in-memory state to demonstrate module boundaries and API contracts.

## Quick Start

From the repository root:

```bash
pnpm install
pnpm --filter server dev
```

The API listens on `http://localhost:3002` by default. Copy `.env.example` to `.env` to change configuration. The API uses `/api/v1` routes, while `GET /health` is intentionally unversioned and unwrapped. Set `SWAGGER_ENABLED=true` to expose OpenAPI documentation at `/docs`.

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

## Architecture

Controllers only map HTTP requests, versioning, validation, and OpenAPI metadata. Services own business behavior. `common/` contains global request context, validation, response transformation, and exception handling; `shared/logger/` configures structured Pino logs with redaction. `modules/health` and `modules/users` are feature boundaries.

## Development Notes

The project is strict TypeScript, including exact optional properties and checked indexed access. Use Fastify types rather than Express types. Husky invokes `lint-staged` for staged TypeScript and Markdown files. The server has a package-level `turbo.json` so `dist/`, type-check state, and coverage participate in Turbo task caching.
