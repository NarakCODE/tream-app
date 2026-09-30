# Local development

Requirements: Node 24+, pnpm 11, and Docker Desktop (or a running Docker Engine with Compose v2).

From the repository root:

```sh
pnpm install
pnpm local:setup
pnpm dev
```

`local:setup` preserves an existing `apps/server/.env`, adds missing settings, starts PostgreSQL 16 and Mailpit, waits for service health, ensures `tream_test` exists, and applies the incremental migrations to the local `tream` database. A new `.env` gets random authentication/mail encryption keys and enabled mail delivery. Existing credentials and encryption keys are retained. The command refuses production or remote migration targets. Rerunning it preserves existing data.

`pnpm dev` runs the Nest API and client. To run only the backend, use `pnpm --filter server dev`. If the API was already running when setup changed `.env`, restart its development watcher to load the new settings. Application startup itself never runs migrations.

| Service            | Address                              |
| ------------------ | ------------------------------------ |
| Client             | `http://localhost:3000`              |
| API                | `http://localhost:3002/api/v1`       |
| Swagger            | `http://localhost:3002/docs`         |
| Process liveness   | `http://localhost:3002/health`       |
| Database readiness | `http://localhost:3002/health/ready` |
| Mailpit inbox      | `http://localhost:8025`              |
| SMTP capture       | `localhost:1025`                     |
| PostgreSQL         | `localhost:5432`                     |

PostgreSQL uses database `tream`, username `postgres`, and password `postgres` for development. This administrator account can create disposable test databases. Production uses separately provisioned runtime/migration identities. Service ports bind to the local loopback interface. PostgreSQL data remains in `server_tream-postgres-data`; Mailpit messages remain in `server_tream-mailpit-data`.

## Daily commands

```sh
pnpm local:up                              # Start dependencies and wait for health
pnpm local:status                          # List container status
pnpm --filter server local:logs            # Follow PostgreSQL and Mailpit logs
pnpm --filter server db:migrate            # Apply new reviewed migrations
pnpm --filter server test:integration:local # Disposable PostgreSQL integration databases
pnpm local:down                            # Stop/remove containers; retain named volumes
```

`test:integration:local` supplies the local `tream_test` connection automatically. Each suite creates, migrates and drops its own uniquely named database; it does not truncate the development database. An explicit `TEST_DATABASE_URL` overrides the default. Both migration commands and Nest read `apps/server/.env`; explicitly supplied shell/CI variables take precedence.

To inspect the database:

```sh
cd apps/server
docker compose exec postgres psql -U postgres -d tream
```

The test-database SQL is mounted into PostgreSQL's initialization directory for fresh installations and also executed by `local:setup` for existing volumes. This makes the same setup work for retained development data.

## Verification and invitation emails

Keep these local settings in `apps/server/.env`:

```dotenv
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
BACKGROUND_WORKERS_ENABLED=true
```

Mailpit captures the messages locally and displays them in its inbox; verification, recovery, magic-link and invitation tokens are available through their email links. No external SMTP provider is required. Restart the API after changing `.env`. If an existing environment explicitly disables workers, setup preserves that choice: enable them to deliver queued mail.

Import the [Postman collection and environment](../postman/README.md), select **Tream — Local**, and run the **01 Smoke** folder. To test mailbox-dependent flows, copy the appropriate token from the Mailpit message into its Postman variable.

## Troubleshooting

- **Docker connection error:** open Docker Desktop and rerun `pnpm local:setup`.
- **Port already allocated:** check listeners on 5432, 1025 or 8025 and resolve the conflict before starting Compose. The existing API on 3002 can be reused; do not start a second API on that port.
- **Readiness returns 503:** inspect `pnpm local:status`, then verify the local `DATABASE_URL` and migrations.
- **No email appears:** confirm workers are enabled in the API process, SMTP points to Mailpit, and inspect API logs for delivery errors.
- **Migration refuses legacy normalized-key collisions:** reconcile the existing user-email/workspace-slug collisions explicitly before retrying. Setup never silently merges identities.

`local:down` does not delete data. Avoid `docker compose down --volumes` unless you intentionally want to erase the local databases and captured mail.

Mailpit installation and health behavior follow its [official Docker documentation](https://mailpit.axllent.org/docs/install/docker/) and [healthcheck documentation](https://mailpit.axllent.org/docs/integration/healthcheck/).

## Setup verification

Validated with Docker PostgreSQL 16 and Mailpit v1.31.3: both containers healthy, incremental migrations applied to the retained development volume, setup rerun without data replacement, all 26 PostgreSQL integration tests passed, API readiness/Swagger responded, and verification mail reached Mailpit through the automatic background worker.
