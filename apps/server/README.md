# Tream API

NestJS 11/Fastify modular monolith using PostgreSQL and Drizzle. M01–M04 provide platform configuration, persisted authentication, transactional commands/events/audit and workspace RBAC. Teams, projects, issues, cycles, CRM and the remaining feature modules are scaffolds; their business routes are not mounted. AI agents remain excluded.

## Start and validate

Use Node 24+ and pnpm 11 with Docker running. The [local development guide](./docs/LOCAL_DEVELOPMENT.md) covers PostgreSQL, captured email and repeatable setup. Run from the repository root:

```sh
pnpm install
pnpm local:setup
pnpm --filter server dev
pnpm --filter server check-types
pnpm --filter server lint
pnpm --filter server test
pnpm --filter server test:e2e
pnpm --filter server build
```

The default port is 3002. Business routes use `/api/v1`; `GET /health` checks process liveness and `GET /health/ready` checks PostgreSQL with a bounded timeout. Both health responses are unwrapped. `SWAGGER_ENABLED=true` exposes `/docs`.

Real PostgreSQL integration tests require an isolated test database:

```sh
pnpm --filter server test:integration:local
```

The integration suite creates a separate temporary database and applies migrations. Use test credentials with database creation privileges, separate from the application role. See [M01–M04 implementation and operations](./docs/M01-M04.md) for endpoints, security guarantees, workers and verification limits.

## Structure

`AppModule` composes `CoreModule` and `ApiModule`. Core owns configuration, logging, request context, database connections, common idempotency and health. IAM owns authentication and workspaces. Eventing owns versioned contracts, event writing, consumer registration, leases/receipts and outbox monitoring. Audit exposes a transactional writer; general audit search is deferred to M14.

Feature code uses application, domain, infrastructure and presentation boundaries. See [module inventory](./src/modules/README.md), [architecture](./docs/architecture.md) and the [backend roadmap](../../docs/roadmap/BACKEND_MILESTONES.md) for later milestones and release gates.

## Database and production setup

Migrations are explicit deployment steps; application startup does not migrate the database. Retained migration history plus incremental migrations support this slice. They do not materialize every table in the [target ERD](../../docs/database/linear-workspace.dbml). ERD supplemental SQL targets its own table layout and must not be applied blindly to the retained application schema.

Production requires explicit secrets, approved HTTPS origins, migration credentials separate from a non-owner application role, and a configured SMTP provider. `BACKGROUND_WORKERS_ENABLED=false` is the development/test default; enable it on designated worker replicas to deliver queued authentication/invitation mail and registered event consumers. Production deployment, provider delivery, load qualification and recovery rehearsals remain later milestone gates.

## Postman API tests

Import the [Postman collection and local environment](postman/README.md) to test the implemented APIs. Start with the automatic smoke folder; mail-dependent and membership-management requests have manual prerequisites.
