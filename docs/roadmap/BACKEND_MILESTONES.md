# Backend implementation milestones

**Product:** Tream, a Linear-inspired workspace application.
**Baseline:** 2026-09-30; NestJS 11/Fastify, Drizzle/PostgreSQL, 20 empty feature modules.
**Status:** M01–M10 implementation is available; acceptance evidence is still being collected. M11–M22 remain planned. Accountable release owners and due dates are unassigned.
**Outcome:** An authenticated, tenant-safe, observable backend with proven recovery and a repeatable production release.

The implemented slice includes liveness/readiness, production configuration validation, persisted authentication and rotating sessions, transactional commands/events/audit, workspace RBAC, memberships, invitations, durable encrypted mail delivery, teams/workflows, projects, milestones, issues, cycles and collaboration. See [M01–M04 implementation notes](../../apps/server/docs/M01-M04.md), [M05 teams and workflows](../../apps/server/docs/M05.md) and [M06 projects and milestones](../../apps/server/docs/M06.md) and [M07–M09 issues, cycles and collaboration](../../apps/server/docs/M07-M09.md) for mounted APIs and verification commands. Later product/CRM modules remain scaffolds. Retained Drizzle history is upgraded incrementally and does not materialize the full [84-table target ERD](../database/linear-workspace.dbml). Checked implementation tasks below do not certify deployment, real SMTP delivery, staging/load/recovery gates or overall milestone acceptance.

## Scope and release rules

The recommended **core release** is M01–M18. It includes authentication/workspaces, teams, projects, issues, cycles, collaboration, private files, documents/initiatives, views/search, notifications and audit. This is a proposed release boundary, not a claim that all of these are mandatory for every MVP.

M19–M22 cover every remaining initialized module and advanced ERD identity capability. Integrations/reviews, CRM and Dynamic Data can be enabled later; if included in the first release, their acceptance checks must finish **before** M16–M18 close. Each subsequently enabled capability repeats security/load, staging and production gates. AI agents remain excluded. Billing, enterprise SSO, public intake portals, releases/SLA and extra customization are deferred and need their own accepted requirements.

This plan supersedes conflicting launch scope in the older agent-native `PRD.md` for backend implementation sequencing. It does not replace the domain glossary or accepted ADR. Use [CONTEXT.md](../../CONTEXT.md), [architecture](../../apps/server/docs/architecture.md), [database invariants](../database/README.md), [event contracts](../database/event-contracts.md) and [database review](../database/design-review.md) as constraints on the implementation.

Security, tenant tests, migration safety and observability are part of **every** milestone; M16 is the final adversarial/load gate, not the first security work. No milestone completes because a module compiles or a controller returns mock data.

## Milestone register

| ID  | Milestone                                           | Primary owners                        | Depends on                  | Release  |
| --- | --------------------------------------------------- | ------------------------------------- | --------------------------- | -------- |
| M01 | Platform, database and contract foundation          | Core / Database                       | None                        | Core     |
| M02 | Authentication and session security                 | IAM                                   | M01                         | Core     |
| M03 | Transactions, events and reliable commands          | Eventing / Audit / common idempotency | M01, M02                    | Core     |
| M04 | Workspaces, RBAC, memberships and invitations       | IAM                                   | M02, M03                    | Core     |
| M05 | Teams and workflow configuration                    | Teams                                 | M04                         | Core     |
| M06 | Projects and milestones                             | Projects                              | M05                         | Core     |
| M07 | Issues, identifiers and transfers                   | Issues                                | M05, M06                    | Core     |
| M08 | Cycles and rollover                                 | Cycles                                | M07                         | Core     |
| M09 | Collaboration                                       | Collaboration                         | M07                         | Core     |
| M10 | Private files and attachments                       | Files                                 | M04, M07, M09               | Core     |
| M11 | Documents and initiatives                           | Documents / Initiatives               | M06, M09, M10               | Core     |
| M12 | Saved views, favorites and search                   | Views / resource query owners         | M07, M09, M11               | Core     |
| M13 | Notifications and durable consumers                 | Notifications / Eventing              | M03, M09, M11               | Core     |
| M14 | Audit, lifecycle and retention                      | Audit / resource owners / Files       | M04–M13                     | Core     |
| M15 | Client API integration and contract freeze          | All enabled API owners                | M04–M14; enabled extensions | Core     |
| M16 | Security, concurrency and performance qualification | All enabled modules / Core            | M15; enabled extensions     | Core     |
| M17 | Deployment, staging and recovery rehearsal          | Platform / operations                 | M16                         | Core     |
| M18 | Production launch and operational acceptance        | Release owner / operations            | M17                         | Core     |
| M19 | External integrations and code reviews              | Integrations / Reviews                | M03, M04, M07, M13          | Optional |
| M20 | CRM extension                                       | Companies / Contacts / Deals / Tasks  | M03, M04, M10, M14          | Optional |
| M21 | Dynamic Data extension                              | Dynamic Data                          | M03, M04, M14               | Optional |
| M22 | Advanced identity and personal credentials          | IAM                                   | M02, M04, M14               | Optional |

Parallel tracks after their dependencies: M08 and M09 can proceed in parallel after M07; M10 follows M09; M11–M13 follow their required capabilities. M19–M22 need not wait for the core production launch, but must join its release gates if enabled. QA and deployment infrastructure start in M01 rather than waiting for M16.

## Shared definition of done

Every milestone requires an assigned accountable owner and evidence attached to its tracking ticket:

- Implemented use cases, narrow DI ports, tenant-aware adapters, typed DTOs and deliberate public module exports; no circular module dependency or dummy success endpoint.
- Incremental Drizzle migration/backfill, required SQL indexes/constraints and schema-to-ERD reconciliation for changed entities. Fresh install and upgrade from the retained schema both tested where applicable.
- OpenAPI request/response/error examples, `/api/v1` versioning, consistent envelopes, bounded pagination and validated sort/filter fields.
- Default-deny authentication and resource authorization before mounting feature routes; active membership/private-team checks and foreign-workspace denial for both reads and writes.
- Unit, HTTP, real PostgreSQL integration and relevant two-connection race tests. Include negative roles, lifecycle states, retries and failure injection, rather than only CRUD success tests.
- Atomic business state, applicable versioned event/outbox/audit facts and idempotent result persistence. Exceptions such as secret-bearing authentication responses are explicitly exempted and tested.
- Structured redacted logs, useful metrics and failure/recovery behavior; no secrets in responses other than intentional one-time issuance, event payloads, audit metadata or idempotency caches.
- Server lint, typecheck, tests and build pass; migration/contract/integration checks pass in CI. Acceptance evidence describes what mocks or fixtures cannot prove.

## M01 — Platform, database and contract foundation

**Owners:** Core, Database. **Depends on:** none.

- [ ] Confirm the release feature list, Node/pnpm/PostgreSQL deployment versions and migration strategy. Reconcile retained Drizzle tables/enums with target entities; inventory legacy data and normalized-key collisions.
- [ ] Establish local/staging/production configuration, secret injection, isolated test PostgreSQL and deterministic tenant fixtures. Reject development secrets/default credentials in production and validate trusted proxy/CORS settings.
- [ ] Define API conventions: IDs, dates/timezones, error codes, cursors, pagination limits, filter grammar, optimistic-concurrency policy and idempotency exemptions. Preserve `/health` as process liveness; add readiness with bounded dependency checks.
- [ ] Create incremental migration infrastructure for selected entities and SQL supplements. Separate non-owner app, migration and maintenance roles; application credentials cannot bypass triggers or truncate history.
- [x] Add CI for install, lint, types, unit/HTTP tests, build, schema/contract validation and real database integration tests. Define a narrow transaction/unit-of-work contract used by later milestones.

**Exit evidence:** fresh database bootstrap and retained-schema upgrade rehearsal pass; no automatic destructive startup migration; production config rejects unsafe defaults; readiness fails when PostgreSQL is unavailable while liveness remains meaningful. Capture the environment/runbook and CI results. Select transaction isolation/lock ordering before concurrent feature commands.

## M02 — Authentication and session security

**Owner:** IAM. **Depends on:** M01.

- [ ] Implement normalized registration, password hashing/verification, login, profile read/update, email verification, password recovery/reset and magic-link sign-in with a real mail port and development mailbox.
- [x] Implement short-lived bearer access tokens and opaque rotating refresh sessions, issuer/audience/algorithm checks, logout, logout-all and session listing/revocation. Refresh tokens are stored as hashes; identify session families for reuse detection through an accepted schema migration if required.
- [x] Install the global authentication guard with explicit public-route exemptions. Disabled accounts are rejected. Refresh/session operations reject revocation immediately; protected access requests honor an explicitly documented maximum stale access-token authorization window, or use session lookup for zero stale authorization.
- [ ] Protect browser refresh storage with Secure/HttpOnly cookie settings and origin/CSRF controls if cookies are selected; keep access tokens out of persistent browser storage in the web-client contract. Specify CORS, cookie domain and refresh failure behavior together.
- [x] Add login/signup/token endpoint throttling suitable for multiple replicas, generic recovery responses, one-time token expiry/consumption and redacted security logs. Do not cache authentication secrets in idempotency responses.

**Proposed API groups:** `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/sessions`, verification/recovery/magic-link routes and `/me`.

**Exit evidence:** expired/malformed/wrong-audience tokens fail; refresh replay revokes the session family; concurrent consumption succeeds once; reset/disable revoke the documented sessions; secrets never appear in logs. Authenticate an HTTP request against real persisted users/sessions, not an in-memory repository.

## M03 — Transactions, events and reliable commands

**Owners:** Eventing, Audit, common idempotency. **Depends on:** M01, M02.

- [x] Implement the transaction boundary for business changes, aggregate revision heads, validated immutable event facts, dispatch jobs and audit writes. Support multiple facts per committed revision/command.
- [ ] Enforce the exact registered `(event_type, schema_version)` envelope; quarantine unknown versions, retain legacy provenance and replay original facts without reinserting them as new live events.
- [ ] Coordinate command reservation, business commit and final response persistence so crash/retry cannot double-apply a command. Scope the command by principal, concrete tenant/resource operation, key and canonical request hash.
- [x] Implement durable job claiming, bounded leases, stale recovery, backoff, retry ceilings, failure/quarantine visibility and consumer receipts. Pick a PostgreSQL-backed queue initially; Redis/BullMQ is a separate transport decision, not a dependency presumed installed.
- [ ] Add security-audit write capability needed by subsequent workspace commands; global pre-workspace auth security remains in the approved redacted security-log sink. Define retention and authorized access.

**Exit evidence:** same key/body replays the original response; changed body conflicts; parallel requests produce one mutation/event set. Kill the process before/after commit and before response delivery, then prove safe retry. Two workers produce one same-database effect/receipt; unsupported event versions are visible in quarantine. External effects have a provider key or reconciliation path, never an unsupported exactly-once promise.

## M04 — Workspaces, RBAC, memberships and invitations

**Owner:** IAM. **Depends on:** M02, M03.

- [x] Implement workspace CRUD, active workspace selection, workspace preferences, atomic creation with owner membership and archive/trash access policy.
- [x] Implement membership list/change/remove/rejoin, roles `OWNER/ADMIN/MEMBER/GUEST`, suspension and final-owner protection. Role permissions follow the glossary; guests are restricted read-only and cannot infer private-team content.
- [x] Implement invitations, acceptance/revocation/expiry, normalized outstanding-email uniqueness and ownership-verified acceptance. Revoke expired invitations before replacement.
- [x] Establish reusable workspace/resource authorization ports, deny missing/foreign/deleted resources consistently and invalidate authorization caches on membership changes.
- [x] Implement explicit permission keys, such as `workspace.update`, `membership.invite`, `membership.change_role`, `team.manage`, `issue.read` and `issue.update`, mapped to the four workspace roles. Permission keys are server policy constants for the MVP, not a custom-role editor.
- [ ] Provide reusable authentication, active workspace-membership and permission/resource guards. Evaluate resource ownership, private-team visibility and lifecycle alongside RBAC; a permitted role alone never authorizes a foreign resource.
- [ ] Freeze the role/action matrix below and implement table-driven permission tests for every mounted endpoint, plus revocation, self-promotion and unauthorized bulk-operation tests.

- [x] Emit workspace/membership security facts and document role permissions for every existing/proposed API operation.

**API groups:** `/workspaces`, `/workspaces/:workspaceId/members`, invitations and preferences.

**Exit evidence:** workspace and owner commit together; two simultaneous owner removals cannot orphan it; accepted/revoked invitations cannot contradict each other. A two-workspace/departed-member matrix proves tenant isolation, including counts and error behavior. Complete private-team cases in M05, then include them in later regression gates. Workspace deletion blocks access immediately.

### RBAC deliverables and policy baseline

The four roles are workspace-scoped, not global user roles. A person may be OWNER in one workspace and GUEST in another. Treat the following as the MVP policy baseline to freeze during M01/M04; feature-specific ownership and visibility rules still apply.

| Capability                                                        | OWNER                            | ADMIN                                 | MEMBER                                                     | GUEST                                 |
| ----------------------------------------------------------------- | -------------------------------- | ------------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| Read authorized work                                              | Yes                              | Yes                                   | Yes                                                        | Explicitly shared read-only resources |
| Create/update authorized issues, projects and collaboration       | Yes                              | Yes                                   | Yes, subject to resource policy                            | No                                    |
| Manage workspace settings, teams and workflow catalogs            | Yes                              | Yes                                   | No by default; explicit team-admin policy where applicable | No                                    |
| Invite/manage MEMBER and GUEST memberships                        | Yes                              | Yes                                   | No                                                         | No                                    |
| Grant/revoke ADMIN, change OWNER or manage privileged memberships | Yes; preserve final active owner | No                                    | No                                                         | No                                    |
| Delete workspace / authorize erasure                              | Yes                              | No                                    | No                                                         | No                                    |
| Read restricted security/audit history                            | Yes                              | Only explicitly allowed audit actions | No                                                         | No                                    |

Every `Yes` still requires active membership, same-tenant resource access, visibility and lifecycle checks. Workspace ownership/admin status does not silently bypass private-team content policy. Specify any administrative override explicitly and audit its use.

Implement access checks as:

```text
Authenticated principal
  -> current active membership in the requested workspace
  -> required permission from workspace role
  -> resource workspace / private-team / ownership / lifecycle policy
  -> permitted fields and authorized query scope
```

Load current role/state from authoritative membership data; do not rely on roles captured in an access token. Membership suspension/removal or role downgrade must affect the next authorized resource request (or the explicitly bounded, tested cache-invalidation interval). Object IDs and hidden navigation are not permission controls. Scope list/search/count queries before pagination, and apply the same policies to bulk commands, files, subscribers, notifications and provider callbacks.

**Guest sharing design gate:** the target ERD does not yet provide a complete guest resource-grant model. Before exposing guest sharing, add accepted typed grants with tenant/resource foreign keys, revocation and inheritance rules, or keep guest resource access denied by default. A GUEST membership must not accidentally grant access to all workspace content. Team-level ADMIN is a separate scoped capability and cannot elevate the workspace role.

**Acceptance evidence:** every role/action pair has allow/deny coverage; unauthenticated, foreign-tenant, inactive and ungranted guest access fails. Administrators/members cannot promote themselves or assign a higher role; concurrent privileged-membership changes cannot remove the final owner. Permissions are enforced inside application commands as well as HTTP guards so a worker/provider path cannot bypass them. M05 adds private-team tests, each feature milestone adds its resource matrix, and M16 repeats the complete suite. M22 API-key authorization intersects key scopes with current membership/role permissions.

## M05 — Teams and workflow configuration

**Owner:** Teams. **Depends on:** M04.

- [x] Implement team CRUD/retirement, private/workspace visibility, team membership/admin rules and immutable canonical team keys.
- [x] Implement issue-status catalogs/categories/order and team cycle settings with timezone/day/duration validation.
- [x] Create exactly one usable default issue status per active team; replace defaults under a team lock and reject retirement of in-use statuses without an explicit replacement.
- [x] Reserve keys permanently and implement safe monotonic issue-number counters. Define usable-team requirements and dependency checks before retirement.

**Implementation scope:** 17 mounted team/member/status/settings routes, retained-schema upgrades 0011–0012 and an internal transactional allocator for M07. Cycle creation/rollover and issue creation/transfers remain M08/M07. See [M05 notes](../../apps/server/docs/M05.md) for privacy/RBAC, migration reconciliation and verification commands. Production acceptance and cross-feature release gates remain pending.

**API groups:** workspace teams, team members, issue statuses and settings.

**Exit evidence:** private teams are invisible to unauthorized members/guests; defaults remain exactly one under concurrent replacement; archived/retired resources cannot receive new work; key changes/reuse and counter regressions fail.

## M06 — Projects and milestones

**Owner:** Projects. **Depends on:** M05.

- [x] Implement project CRUD/lifecycle, workspace project-status catalog/defaults, priority, lead, dates and project members.
- [x] Implement project-team associations with at least one usable team at commit; forbid removal that invalidates assigned issues unless an explicit reassignment command resolves them.
- [x] Implement project milestones, milestone ordering, health updates and update history with scoped authors. Compute progress from work rather than storing an authoritative percentage.
- [x] Specify completion/cancellation and archive/restore effects on unfinished linked issues; do not silently rewrite unrelated issue statuses.

**Implementation scope:** 27 mounted catalog/project/team/member/milestone/update routes, computed progress and retained-schema upgrades. Completion, cancellation, archive and deletion reject unfinished linked issues; no issue statuses are rewritten. Team removal rejects retained dependencies until a future explicit reassignment command resolves them. See [M06 notes](../../apps/server/docs/M06.md) for privacy, management rules and retained-data reconciliation. Production acceptance and cross-feature release gates remain pending.

**API groups:** workspace projects, project teams/members, milestones and updates.

**Exit evidence:** invalid date ranges, cross-workspace teams and wrong-project milestones fail; last-team removal/default replacement are race-safe; role and private-team policies cover both project reads and aggregated progress.

## M07 — Issues, identifiers and transfers

**Owner:** Issues. **Depends on:** M05, M06.

- [x] Implement issue CRUD/filtering/order, status/priority, estimates, dates, assignments and valid project/milestone links.
- [x] Allocate team numbers under lock and reserve current/permanent aliases atomically. Identifier lookup continues to resolve old aliases after transfer, archive and trash.
- [x] Implement parent/subissues and directed/undirected relations with graph validation; reject hierarchy/dependency cycles under concurrent edge changes.
- [x] Implement explicit transfer commands: destination counter/identifier, status remap, cycle/project/milestone clearing/remap, compatible labels and any enabled SLA associations, one revision/event set and stable retry result.
- [x] Implement archive/trash/restore command hooks and lost-update prevention; finalize the version/ETag contract through an accepted migration if the target resource lacks a revision column.

**Implementation notes:** See [M07–M09](../../apps/server/docs/M07-M09.md) for mounted APIs, concurrency, scheduling and migration guarantees. Release qualification remains pending.

**API groups:** workspace/team issues, individual issues, identifier lookup, relations and transfer commands.

**Exit evidence:** concurrent creates have unique identifiers; opposing transfers preserve aliases and scope; old aliases cannot be stolen. Failure injection leaves no partial transfer. Foreign statuses/cycles/projects, inactive assignees and concurrent graph cycles are rejected. Pagination/order remains stable on ties.

## M08 — Cycles and rollover

**Owner:** Cycles. **Depends on:** M07.

- [x] Implement team cycle CRUD/scheduling with half-open non-overlapping windows and timezone-aware planning.
- [x] Implement explicit start/completion and eligible `UNSTARTED/STARTED` issue rollover to a valid next cycle; backlog/completed/canceled issues stay in place.
- [x] Record immutable rollover history, source completion and versioned facts in one command transaction. Make manual and scheduled completion use that same path.
- [x] Define missed-schedule catch-up, cooldowns, cancellation/error visibility and cycle reporting computed from authorized issue data.

**Implementation notes:** See [M07–M09](../../apps/server/docs/M07-M09.md) for mounted APIs, concurrency, scheduling and migration guarantees. Release qualification remains pending.

**Exit evidence:** adjacent windows succeed and overlaps fail; concurrent manual/scheduler completion moves each eligible issue once. Crash/retry preserves the same completion result and history. Subsequent team transfers do not invalidate historical rollover rows.

## M09 — Collaboration

**Owner:** Collaboration. **Depends on:** M07.

- [x] Implement issue/planning comments, replies, edits/trash, reactions and author permissions; prevent reply hierarchy cycles.
- [x] Implement workspace/team labels and issue/project assignment, active normalized name uniqueness and dependency-safe scope edits. Project labels are workspace-scoped.
- [x] Implement subscribers, issue activity and issue templates with validated defaults referencing usable tenant resources.
- [x] Produce minimal versioned collaboration facts for notification consumers and preserve historical attribution after membership departure.

**Implementation notes:** See [M07–M09](../../apps/server/docs/M07-M09.md) for mounted APIs, concurrency, scheduling and migration guarantees. Release qualification remains pending.

**Exit evidence:** label edit/link and issue transfer races cannot violate team scope; duplicate reactions/subscriptions are rejected; guests cannot write; templates and replies cannot reference foreign/private/deleted resources. Comment edits enforce the optimistic-concurrency contract.

## M10 — Private files and attachments

**Owner:** Files. **Depends on:** M04, M07, M09.

- [x] Select an object-storage provider through a port; implement upload intent/finalization, metadata/checksum, size/type quotas and private download authorization.
- [x] Validate actual content metadata and scanning/quarantine policy before making uploads downloadable; never trust only client filenames/MIME declarations.
- [x] Implement typed attachment links and exact target ownership, scoped download grants, safe filenames and short-lived signed URLs.
- [x] Implement abandoned-upload cleanup, deletion placeholders, restore-before-purge behavior and idempotent storage cleanup jobs.

**Implementation notes:** See [M10](../../apps/server/docs/M10.md) for the private storage adapters, authorization, quarantine and cleanup guarantees. Production storage/scanner provisioning and release qualification remain pending.

**Exit evidence:** foreign/private/deleted target downloads fail; unfinished/quarantined uploads cannot be read. Duplicate finalization/cleanup retries are safe, quotas cannot be bypassed by concurrent uploads, and object cleanup does not leave permanent orphan files.

## M11 — Documents and initiatives

**Owners:** Documents, Initiatives. **Depends on:** M06, M09, M10.

- [ ] Implement document CRUD/lifecycle with exactly one typed owner, authorized content and attachment access, input size limits and safe rendering contract.
- [ ] Implement optimistic document edits; collaborative live editing/history beyond the target schema requires a separate accepted version/history design.
- [ ] Implement initiatives, project associations, lead/status/dates, updates, discussions and subscribers; derive progress from included projects/issues.
- [ ] Enforce visibility through all linked projects/teams, dependency-aware archive/restore and valid cross-resource ownership.

**Exit evidence:** wrong-owner/cross-workspace links fail; simultaneous edits do not silently overwrite; initiative aggregates reveal no unauthorized project data. Discussions, subscriptions and notifications recheck resource permissions.

## M12 — Saved views, favorites and search

**Owners:** Views and resource query owners. **Depends on:** M07, M09, M11.

- [ ] Implement private/shared saved views, favorites and user/workspace display preferences with typed deduplicated targets.
- [ ] Define a versioned allowed filter grammar; validate referenced statuses/labels/teams and reject arbitrary executable/query expressions.
- [ ] Implement permission-filtered issue/project/document search and stable bounded cursor pagination. Start with PostgreSQL query/index capabilities; choose external search only after a measured need.
- [ ] Ensure archived parents and trash affect query results consistently; invalidate cached results on authorization changes.

**Exit evidence:** search, counts, favorites and shared views cannot leak another tenant/private team; deleted targets render safely. Adversarial filters cannot inject SQL or cause unbounded queries; keyset pagination is deterministic.

## M13 — Notifications and durable consumers

**Owners:** Notifications, Eventing. **Depends on:** M03, M09, M11.

- [ ] Implement recipient inbox/list/unread counts, read/archive/snooze and channel preferences with recipient ownership checks.
- [ ] Add versioned event consumers for assignments, mentions, subscriptions and planning updates; define deduplicated fanout keys and recheck permission at dispatch/read time.
- [ ] Implement email delivery through a provider port, retry/lease recovery, dead-letter visibility and stable external idempotency/reconciliation.
- [ ] Implement authorized real-time updates only if needed by accepted client contracts; define reconnect/cursor/replay semantics if SSE is enabled.

**Exit evidence:** duplicate delivery/replay creates one logical notification; removed/suspended/private-team recipients receive no protected content; a crashed worker is reclaimable. Mail-provider failure does not roll back business changes or block the API.

## M14 — Audit, lifecycle and retention

**Owners:** Audit, resource owners, Files. **Depends on:** M04–M13.

- [ ] Expose authorized audit history with redacted metadata, stable pagination, correlation IDs and immutable attribution; audit selected security and membership changes.
- [ ] Implement archive views, 30-day recoverable trash, dependency/uniqueness-checked unarchived restore, and scheduled dependency-aware purge.
- [ ] Preserve identifier/author/history tombstones; do not blindly cascade or null composite tenant keys. Hidden archived parents do not rewrite child lifecycle timestamps.
- [ ] Configure event/audit/security-log retention and account/workspace erasure separately; document anonymization and object-storage cleanup behavior.

**Exit evidence:** restore conflicts produce actionable errors; archived/deleted timestamps remain exclusive; workspace erasure immediately denies access and later removes selected content/storage safely. Audit/event integrity and accepted retention maintenance coexist without app-role trigger bypass.

## M15 — Client API integration and contract freeze

**Owners:** all enabled API modules. **Depends on:** M04–M14 and any enabled M19–M22.

- [ ] Generate/review OpenAPI contracts and client types; replace client fixture-only flows with authenticated APIs for enabled scope.
- [ ] Verify signup/login/refresh, workspace switching, issue/project/cycle workflows, permissions, uploads, comments, views and inbox through actual frontend journeys.
- [ ] Freeze endpoint names, command semantics, envelopes/error codes, pagination, optimistic versions and idempotency behavior. Remove obsolete placeholder routes/docs/tests.
- [ ] Publish module coverage and intentional omissions; distinguish implemented, disabled and deferred features in product/navigation behavior.

**Exit evidence:** no shipped feature depends on mock-only state; two-session/two-tenant browser workflows pass; permission errors, conflicts, refresh expiry and provider failures have usable client handling. Contract drift fails CI.

## M16 — Security, concurrency and performance qualification

**Owners:** all enabled modules and Core. **Depends on:** M15 and any enabled M19–M22.

- [ ] Run permission/tenant/privacy matrix, injection/size-limit tests, auth abuse tests, secret scanning and dependency/container vulnerability review; resolve all critical/high findings.
- [ ] Run the independent-connection races in the [database review](../database/design-review.md), plus refresh/token consumption, invitation acceptance, idempotency commit/retry and consumer receipt races.
- [ ] Load-test agreed representative data and API mix; inspect slow query plans, bounded pool usage, pagination, job fanout and outbox throughput. Add indexes/caches only from evidence.
- [ ] Exercise PostgreSQL/mail/storage/provider failures, network timeouts, worker restarts, deployment shutdown and queue saturation. Define overload/rate-limit/backpressure responses.

**Exit evidence:** meet the release targets below with saved reports and deployment-version PostgreSQL results, no unexplained lost updates/duplicate effects/leaks and no unresolved launch-blocking defects. Embedded/single-session tests are supplemental evidence.

## M17 — Deployment, staging and recovery rehearsal

**Owners:** platform/operations. **Depends on:** M16.

- [ ] Build a reproducible non-root production image and immutable artifact; run app and durable workers with controlled credentials, resource limits and graceful termination.
- [ ] Establish staging/production networking/TLS, managed secrets, database/storage configuration, deployment pipeline, migration locking and expand/contract rollout.
- [ ] Add dashboards/alerts for API latency/errors, readiness, database pool/pressure, outbox lag, queue age/retries, quarantine and delivery failures. Every alert has an owner/runbook.
- [ ] Configure backups/PITR and object recovery; restore into a clean isolated environment and verify application invariants. Rehearse compatible application rollback without destructive schema downgrade.
- [ ] Perform a minimum 24-hour staging soak, release smoke journeys and queue-drain/catch-up tests with representative workload.

**Exit evidence:** restore meets agreed RPO/RTO, rollback preserves data/aliases, migration is compatible with both rollout versions, dashboards/alerts fire in drills and shutdown loses no committed jobs. Record artifact, migration set and rehearsal evidence.

## M18 — Production launch and operational acceptance

**Owners:** release owner/operations. **Depends on:** M17.

- [ ] Close release checklist, enabled-feature scope, known limitations, migration/backup evidence, secrets/access review and named incident/on-call ownership.
- [ ] Execute approved rollout/canary, verify liveness/readiness, real-user auth/workspace/issue journey and worker/provider health; monitor error/latency/lag against rollback thresholds.
- [ ] Confirm restore/rollback paths remain available, public Swagger policy is correct and maintenance credentials are separate from the app.
- [ ] Complete a 72-hour monitored launch window, triage incidents and hand over operating/runbook documentation.

**Exit evidence:** all enabled milestones and release gates pass; no launch-blocking incident remains; SLOs hold for the observation window and the accountable release owner records acceptance. No automatic production deployment is authorized by this planning document.

## M19 — External integrations and code reviews

**Owners:** Integrations, Reviews. **Depends on:** M03, M04, M07, M13.

- [ ] Select the first provider(s) explicitly; implement OAuth state/PKCE, scope/redirect checks, encrypted token lifecycle, connection ownership, disconnect/revocation and provider mapping.
- [ ] Implement signed inbound receipts, deduplicated webhook ingestion, outbound destination/signature safeguards, rate-limit handling, resynchronization and provider outages.
- [ ] Implement repository/PR metadata, issue links, review requests, submitted reviews and per-member viewed-file progress; provider adapters own diff/files/thread fetching.
- [ ] Add Gmail only if enabled launch scope requires user-initiated mail; it is not an AI-agent feature. Never imply an unselected provider is supported.

**Exit evidence:** OAuth state and webhook replay are rejected/deduplicated appropriately; provider identities cannot cross tenants; revoked connections cease access; resync recovers missed events. Real provider sandbox journeys and secret/log checks pass, then repeat M16–M18 gates.

## M20 — CRM extension

**Owners:** Companies, Contacts, Deals, Tasks. **Depends on:** M03, M04, M10, M14.

- [ ] Implement company/contact CRUD, normalized active contact email uniqueness, company associations, cursor queries and archive/trash/restore.
- [ ] Implement deals, validated monetary amounts/currencies, accepted stage rules and deal/contact associations; do not invent a pipeline beyond agreed requirements.
- [ ] Implement CRM Tasks with `TODO/IN_PROGRESS/DONE`, assignee/due date/contact/deal links and completion behavior, separate from product Issues.
- [ ] Add audit/events, permissions, dedupe-conflict responses and authorized optional customer-request links when their scope is accepted.

**Exit evidence:** foreign/deleted links and guest writes fail; concurrent contact duplicates resolve predictably; reuse/restore collisions respect lifecycle policy. Core product issues are unaffected by CRM semantics; repeat M16–M18 gates when enabled.

## M21 — Dynamic Data extension

**Owner:** Dynamic Data. **Depends on:** M03, M04, M14.

- [ ] Implement database/field/record CRUD, schema configuration, reserved keys, required/scalar/select validation and accepted schema-change rules.
- [ ] Implement typed USER/RELATION joins and configured targets, single/multiple cardinality, deletion behavior and schema-change compatibility for existing records.
- [ ] Define record/formula/query/import limits; asynchronous import/export only if required, with authorized download and row-level failure reporting.
- [ ] Emit minimal versioned facts, audit schema/record changes and maintain archive/restore/retention and tenant-safe filtering.

**Exit evidence:** field-edit/link races preserve type/target integrity; invalid JSON/cardinality and foreign members/records fail; destructive schema edits cannot silently orphan values. Bounded load and retry tests pass, then repeat M16–M18 gates when enabled.

## M22 — Advanced identity and personal credentials

**Owner:** IAM. **Depends on:** M02, M04, M14.

- [ ] Implement optional WebAuthn passkeys with challenge expiry/single use, origin/RP validation, credential enrollment/removal and synced-passkey counter policy.
- [ ] Implement workspace-scoped personal API keys, scopes/expiry/revocation, one-time secret display and combined current-role/membership authorization.
- [ ] Require recent authentication for credential changes, provide recovery behavior and audit credential/security events without storing raw secrets.
- [ ] MFA or additional identity providers require separately accepted challenge/recovery/state models; their tables are not assumed present in the ERD.

**Exit evidence:** malicious origins/replayed challenges fail; revoked/expired/scopeless keys cannot read or mutate protected resources; departed-member keys cease authorization. Real browser credential and recovery journeys pass; repeat M16–M18 gates when enabled.

## Proposed production release targets

These are initial planning targets, not measured results or contractual promises. Confirm them in M01 and freeze them before M16; record any change with its capacity/cost trade-off.

| Gate                | Initial target                                                                                                                                           | Evidence                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Availability        | 99.9% monthly API availability; planned exclusions explicitly documented                                                                                 | Synthetic probes, dashboard and error-budget policy                               |
| API latency/load    | At 50 requests/second, 80% reads / 20% writes: p95 read <=300 ms, p95 write <=500 ms, unexpected 5xx <0.5%, excluding provider waits and intentional 4xx | 30-minute steady-load test after warm-up, including realistic joins/authorization |
| Representative data | 100 workspaces, 1,000 memberships, 500 teams, 1,000 projects, 100,000 issues and 1,000,000 activity/event rows, including private/archived/trash data    | Reproducible generated dataset and query-plan report                              |
| Delivery            | p95 internal outbox-to-consumer latency <=5 seconds under normal load; stalled queue alert within 5 minutes                                              | Worker throughput, oldest-job/lag metrics and restart drill                       |
| Durability          | No lost committed state/event set; retries produce one logical command effect                                                                            | Failure injection and independent-connection tests                                |
| Recovery            | Database RPO <=15 minutes and restore RTO <=60 minutes; object-storage recovery target explicitly selected                                               | Timed isolated restore/PITR drill, not merely a backup-success signal             |
| Security            | Zero unresolved critical/high findings; zero verified cross-tenant/private-resource leaks                                                                | Threat/permission review, automated tests and triage record                       |
| Release             | 24-hour staging soak and 72-hour monitored launch window; compatible application rollback exercised                                                      | Release runbook and recorded owner acceptance                                     |

Readiness should fail when a required dependency prevents serving accepted traffic; optional provider outages should degrade their capability without unnecessarily failing the whole API. Alert/rollback thresholds are fixed in the release runbook before deploying.

## Tracking and evidence template

Use these stable milestone IDs as GitHub milestone/epic titles when publishing the plan to the repository's tracker. Split each checklist item into a small implementation ticket; dates come after staffing and ticket estimation, not from an assumed team velocity. This file is the reviewable local plan; no remote tracker objects were created.

```text
Title: M07 — Issues, identifiers and transfers
Owner: <accountable owner>
Status: Planned | In progress | Blocked | Acceptance review | Complete
Release: Core | Optional enabled | Deferred
Blocked by: M05, M06
Tickets: <linked implementation/test/migration tickets>
Evidence: <CI, contract, migration, concurrency and acceptance results>
Exit decision: <owner + date + outstanding accepted limitations>
```

For implementation tickets include the triggering use case, module ownership, schema/API changes, acceptance criteria, negative permissions, transactional failure cases and validation commands. Follow the [GitHub tracker conventions](../agents/issue-tracker.md) and canonical triage labels; do not mark all milestones complete because checklist files exist.

Existing verification commands are:

```sh
pnpm --filter server check-types
pnpm --filter server lint
pnpm --filter server test
pnpm --filter server test:e2e
pnpm --filter server build
```

M01 must add explicit real PostgreSQL integration/concurrency, event-contract, migration-upgrade and load-test commands to CI; they are not implied by the current scaffold scripts.

Implementation guidance: Nest's [authentication](https://docs.nestjs.com/security/authentication) and [rate-limiting](https://docs.nestjs.com/security/rate-limiting) documentation inform the authentication/abuse checklist; retain the repo's selected adapter/contract until a deliberate design decision changes it. PostgreSQL's [backup and restore guidance](https://www.postgresql.org/docs/current/backup.html) informs M17 recovery planning. These references do not replace testing the actual deployed stack.
