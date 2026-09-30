# Eventing

`EventWriter.append(tx, fact)` validates a registered v1 payload and envelope, reserves one revision per aggregate within the supplied transaction, writes the immutable fact, and creates a job for each registered consumer. The transaction belongs to `CommandBus`; callers must not append after a separate business commit. No downstream consumer is registered by default.

Feature modules register a stable consumer key with `EventConsumerRegistry.register(key, handler)` during `onModuleInit`, before accepting commands. The handler receives the same transaction used to insert its receipt and complete its job. Only database effects belong in this callback; provider calls require a separate idempotent delivery protocol. Changing/removing consumer keys requires a plan for pending jobs. Registration applies to future facts, not a retroactive subscription.

`OutboxHost` polls when `BACKGROUND_WORKERS_ENABLED=true`. `dispatchReady(limit)` also supports explicit worker hosting and integration tests. It claims jobs with PostgreSQL `SKIP LOCKED`, recovers expired 60-second leases, retries up to five attempts with backoff, and quarantines exhausted or invalid contracts. It never marks unregistered consumers delivered. The host shuts down its polling timer and awaits its active batch before the database closes.

`GET /api/v1/workspaces/:workspaceId/outbox` lists failed/quarantined jobs using cursor pagination. It requires an active membership with `audit.read` (OWNER in the current policy). Returned diagnostics omit event payloads and downstream exception details.

Published schemas live in `infrastructure/contracts`. The registry also declares exact workspace/membership/invitation v1 contracts introduced by M04. Existing unversioned rows are not relabeled as v1: workers quarantine them. A deliberate adapter/backfill or historical replay plan is required. Historical replay must preserve original event IDs and versions; writing replay as fresh live facts is unsupported.

The eight PostgreSQL integration tests verify transactional fact/revision rollback, shared revisions, competing workers, consumer rollback, stale leases, retry ceilings, quarantine, and explicitly hosted dispatch. They run in a unique migrated test database created and removed by the integration helper.
