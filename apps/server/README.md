# Tream API

NestJS 11/Fastify modular monolith using PostgreSQL and Drizzle. M01–M10 provide platform configuration, persisted authentication, transactional commands/events/audit, workspace RBAC, teams/workflows, projects, milestones, issues, cycles, collaboration, private files and attachments. Notifications, CRM and remaining feature modules are scaffolds; their business routes are not mounted. AI agents remain excluded.

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

The integration suite creates a separate temporary database and applies migrations. Use test credentials with database creation privileges, separate from the application role. See [M01–M04 implementation and operations](./docs/M01-M04.md), [M05 teams and workflows](./docs/M05.md) and [M06 projects and milestones](./docs/M06.md) and [M07–M09 issues, cycles and collaboration](./docs/M07-M09.md) and [M10 private files and attachments](./docs/M10.md) for endpoints, security guarantees, workers and verification limits.

## Structure

`AppModule` composes `CoreModule` and `ApiModule`. Core owns configuration, logging, request context, database connections, common idempotency and health. IAM owns authentication and workspaces. Teams owns visibility, scoped team administration, workflow catalogs and cycle settings. Projects owns cross-team project visibility, lifecycle, scoped members, milestones and health update history. Eventing owns versioned contracts, event writing, consumer registration, leases/receipts and outbox monitoring. Audit exposes a transactional writer; general audit search is deferred to M14.

Feature code uses application, domain, infrastructure and presentation boundaries. See [module inventory](./src/modules/README.md), the [Issues API reference](../../docs/issue-api.md), [architecture](./docs/architecture.md) and the [backend roadmap](../../docs/roadmap/BACKEND_MILESTONES.md) for module ownership, mounted issue routes, later milestones and release gates.

## Database and production setup

Migrations are explicit deployment steps; application startup does not migrate the database. Retained migration history plus incremental migrations support this slice. They do not materialize every table in the [target ERD](../../docs/database/linear-workspace.dbml). ERD supplemental SQL targets its own table layout and must not be applied blindly to the retained application schema.

Production requires explicit secrets, approved HTTPS origins, migration credentials separate from a non-owner application role, a configured SMTP provider, private S3-compatible storage and a ClamAV scanner. `BACKGROUND_WORKERS_ENABLED=false` is the development/test default; enable it on designated worker replicas to deliver queued authentication/invitation mail, registered event consumers, cycle scheduling and private-file cleanup. Production deployment, provider delivery, load qualification and recovery rehearsals remain later milestone gates.

## Postman API tests

Import the [Postman collection and local environment](postman/README.md) to test the implemented APIs. Start with the automatic smoke folder; mail-dependent and membership-management requests have manual prerequisites.
