# Northstar demo seed

## Run

Apply database migrations first. From the repository root:

```sh
pnpm --filter server db:migrate
pnpm --filter server seed:demo
pnpm --filter server seed:demo:reset
pnpm --filter server seed:demo --verify
```

Login: **demo@yourapp.com / Demo@1234**. All six accounts have verified emails. The primary account is workspace OWNER (full administrative permissions), Priya is ADMIN, Mateo/Emma/Noah are MEMBER, and Sofia is GUEST. The workspace route is `/northstar-demo`.

Use Node 24+ and the server environment in `apps/server/.env`. The runner uses the configured PostgreSQL database and filesystem/S3 object storage. It needs the table-owner privileges used by local migrations. It refuses `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` is explicitly set. No emails, OAuth connections, or pending delivery jobs are generated. Terminal email receipts are explicitly marked demo-simulated.

## Safety and repeatability

The workspace slug `northstar-demo` is reserved. A seed marker and random namespace are persisted in workspace settings; record IDs derive from that namespace and stable keys. A conflicting workspace or demo email is rejected. Demo accounts attached to another workspace are rejected. A purged workspace is never revived. Existing non-demo rows are never truncated, updated, or deleted.

Both commands restore the marked demo tenant to the canonical dataset, so rerunning refreshes relative dates and does not duplicate records. Workspace/account identities, preferences and migration-provided project statuses are retained. Passwords use the actual authentication scrypt helper with fresh salts. Content and relationships are deterministic; IDs stay stable for this demo tenant. Immutable stored file bytes use scoped object keys.

The database enforces permanent lifecycle and append-only guards. A reset acquires transaction-scoped advisory and exclusive table locks, temporarily disables application triggers on the affected tables, deletes only demo-tenant rows in child-first order, then restores triggers before inserting data. PostgreSQL foreign-key constraints remain enabled. Any failure rolls back rows and trigger changes together. This is a local fixture-restoration tool, not a runtime API. It briefly blocks writes to affected tables. Do not run it during a walkthrough. File storage writes occur outside PostgreSQL rollback; they are deterministic, immutable and demo-scoped.

## Seed order and entities

| Order | Seed file                                     | Entities                                                                                                       |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1     | identity.ts                                   | users, workspaces, memberships, invitations, preferences, selections                                           |
| 2     | teams.ts                                      | teams, team memberships, issue statuses                                                                        |
| 3     | projects.ts                                   | projects, migration statuses, project teams/members/milestones/updates                                         |
| 4     | cycles.ts, issues.ts                          | cycles, issues, identifiers, relations, rollovers                                                              |
| 5     | initiatives.ts, documents.ts                  | initiatives, project links, updates, subscribers, documents                                                    |
| 6     | collaboration.ts                              | labels, comments/replies/mentions, reactions, labels/subscribers joins, templates, activity                    |
| 7     | views.ts                                      | saved views and favorites                                                                                      |
| 8     | history.ts, notifications.ts                  | events, audit logs, terminal dispatch/consumer receipts, notifications, preferences, terminal delivery history |
| 9     | files.ts                                      | files, origin attachments, real downloadable text briefings                                                    |
| 10    | companies.ts, contacts.ts, deals.ts, tasks.ts | CRM companies, contacts, deals, deal contacts, follow-up tasks                                                 |
| 11    | dynamic-data.ts                               | custom databases, fields, records                                                                              |

## Enum inventory

These are the schema enums discovered before seeding; coverage follows the migrated domain models. Operational states are intentionally not made executable solely to cover every enum.

| Schema                    | Enum                         | Values                                                                                                                                              |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| contact.schema.ts         | contact_status               | LEAD                                                                                                                                                |
| deal.schema.ts            | deal_stage                   | DISCOVERY                                                                                                                                           |
| dynamic-data.schema.ts    | dynamic_field_type           | TEXT, LONG_TEXT, NUMBER, CURRENCY, BOOLEAN, DATE, DATETIME, EMAIL, PHONE, URL, SELECT, MULTI_SELECT, STATUS, USER, RELATION, CREATED_AT, UPDATED_AT |
| event.schema.ts           | event_dispatch_status        | PENDING, PROCESSING, SUCCEEDED, FAILED, QUARANTINED                                                                                                 |
| files.schema.ts           | file_status                  | PENDING, UPLOADED, QUARANTINED, READY, DELETED, PURGING, PURGED, EXPIRED                                                                            |
| files.schema.ts           | storage_cleanup_status       | PENDING, PROCESSING, FAILED, SUCCEEDED, CANCELED                                                                                                    |
| files.schema.ts           | storage_cleanup_reason       | ABANDONED, DELETED                                                                                                                                  |
| idempotency.schema.ts     | idempotency_status           | PENDING, COMPLETED                                                                                                                                  |
| initiative.schema.ts      | initiative_status            | PLANNED, ACTIVE, COMPLETED, CANCELED                                                                                                                |
| integration.schema.ts     | integration_provider         | gmail                                                                                                                                               |
| integration.schema.ts     | integration_status           | ACTIVE, EXPIRED, REVOKED                                                                                                                            |
| notification.schema.ts    | notification_kind            | ASSIGNMENT, MENTION, SUBSCRIPTION, PLANNING_UPDATE                                                                                                  |
| notification.schema.ts    | notification_channel         | IN_APP, EMAIL                                                                                                                                       |
| notification.schema.ts    | notification_delivery_status | PENDING, PROCESSING, SENDING, FAILED, SUCCEEDED, UNKNOWN, SUPPRESSED, DEAD                                                                          |
| task.schema.ts            | task_status                  | TODO, IN_PROGRESS, DONE                                                                                                                             |
| view.schema.ts            | view_resource                | ISSUES, PROJECTS                                                                                                                                    |
| view.schema.ts            | view_visibility              | PRIVATE, WORKSPACE                                                                                                                                  |
| work-management.schema.ts | work_priority                | NO_PRIORITY, LOW, MEDIUM, HIGH, URGENT                                                                                                              |
| work-management.schema.ts | issue_status_category        | BACKLOG, UNSTARTED, STARTED, COMPLETED, CANCELED, DUPLICATE                                                                                         |
| work-management.schema.ts | project_status               | PLANNED, STARTED, PAUSED, COMPLETED, CANCELED                                                                                                       |
| work-management.schema.ts | team_visibility              | WORKSPACE, PRIVATE                                                                                                                                  |
| work-management.schema.ts | team_member_role             | ADMIN, MEMBER                                                                                                                                       |
| work-management.schema.ts | update_health                | ON_TRACK, AT_RISK, OFF_TRACK                                                                                                                        |
| work-management.schema.ts | issue_relation_type          | BLOCKS, RELATED, DUPLICATES                                                                                                                         |
| workspace.schema.ts       | workspace_role               | OWNER, ADMIN, MEMBER, GUEST                                                                                                                         |
| workspace.schema.ts       | membership_state             | ACTIVE, SUSPENDED, LEFT                                                                                                                             |

## Dataset and walkthrough

Eight cross-functional teams share twelve projects for the customer portal, mobile app, identity platform, accessible design system, customer analytics, and launch readiness. Seventy-two issues span every workflow category and priority; estimates and assignments create uneven workload. Completed work is spread through the last thirty days, with overdue and upcoming work, unassigned issues, long titles, and archived/deleted resources.

The Platform team critical path is issue numbers 1 → 2 → 3 → 4 → 5 (`BLOCKS`); the parallel branch is 1 → 6 → 5. Issue 7 represents optional slack work, related to issue 2 rather than blocking launch. Each team has completed, active, upcoming, and canceled cycles, with rollovers and issue timestamps supporting the existing cycle report.

Comments, replies, mentions, reactions, milestones, project/initiative health updates, saved-view results, files, notifications and recent audit/activity support a realistic walkthrough. The owner belongs to every private team.

## Verification

The runner prints actual scoped counts for each seeded table. The integration test creates a fresh, uniquely named database, applies every migration, runs the seed twice and reset once, compares counts and IDs, proves an unrelated workspace/account survives, logs in as the demo owner, and checks implemented list/detail/report endpoints and a real file download.

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tream_test pnpm --filter server test:integration -- demo-seed.integration-spec.ts
pnpm --filter server test -- runner.spec.ts
```

Verification passed against a fresh PostgreSQL database and the configured local development database: **154 authenticated checks**, including **136 populated lists**, **17 detail/report checks**, and **one real file download**. A second seed and reset preserved identical counts; the unrelated test workspace/account was unchanged.

## Explicit unavailable screens

As approved, this seed targets the existing backend. Reviews, companies, contacts, deals, CRM tasks, custom databases and integrations currently have empty Nest modules and no working product HTTP controllers. CRM/custom tables are seeded for future integration. Integration/OAuth tables are not migrated, and no fake credentials are inserted. Many frontend screens and charts still import `apps/web/mock-data`, so backend seeding cannot populate or replace their data.

There is no dedicated burndown snapshot/history table or endpoint. The seed supplies real cycles, estimates, completed issue timestamps and rollover history for the current report; it does not invent an unsupported burndown API. Workload is derived from assignment and estimates. Authentication sessions/tokens/rate buckets/idempotency records and runnable email/storage cleanup jobs are runtime state, not seeded business fixtures. Some permission, lifecycle or exclusion filters deliberately return no records when the selected state has none; the seed does not bypass authorization to make every impossible view nonempty.
