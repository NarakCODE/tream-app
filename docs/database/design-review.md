# Target-schema design review

The quality target is a coherent, enforceable Linear-inspired model with explicit operational boundaries. A numerical design rating is subjective; production readiness additionally requires migrating real data, implementing service transactions and proving concurrent behavior. This document records those boundaries so the ERD can be reviewed independently.

## Design decisions and evidence

| Concern                     | Target guarantee                                                                                                                                  | Evidence / remaining work                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant isolation            | Composite foreign keys reject cross-workspace/team/project references.                                                                            | DBML exports and loads; authorization controls reads separately.                                                                                                      |
| Stable issue identity       | Current identifier must belong to that issue's permanent alias registry. Team keys and registry history cannot change; counters cannot decrease.  | Deferred FK and reservation/identity triggers; creation, transfer, theft and collision smoke tests.                                                                   |
| Lifecycle                   | Archive retains planning history; trash is recoverable for 30 days. Archive and trash are exclusive.                                              | Row checks and explicit restore/reuse policy; implement retention jobs and dependency-aware restoration.                                                              |
| Typed links                 | Dynamic USER/RELATION joins match their field definition; issue labels match team scope; project labels are workspace labels.                     | Forward/reverse edit triggers and rejection tests. Required values, scalar types and cardinality remain service validation.                                           |
| Cycles                      | Half-open windows cannot overlap within one workspace/team, including history.                                                                    | Deferrable exclusion constraint; adjacency, overlap and window-swap tests. Rollover selection/completion remains an atomic service command.                           |
| Event identity and ordering | Versioned payload contract, durable aggregate head, immutable facts and per-consumer receipts. Multiple facts may share one revision and command. | Revision/append-only SQL guards; strict schemas, event fixtures and duplicate receipt tests. Producer must validate payload and commit business state with its event. |
| Mutable states              | Invitation, membership, token, job lease/completion and idempotency metadata cannot contradict their state.                                       | Named DBML checks and negative SQL tests. Rejoining clears `left_at` and sets a fresh `joined_at`; old membership transitions are audit facts.                        |
| Read/worker paths           | Deliberate indexes support live team/project boards, assignment queues, threaded comments, history, inbox and job claiming/reclaim.               | Inspect index definitions; measure representative `EXPLAIN (ANALYZE, BUFFERS)` plans before adding caches or partitioning.                                            |
| Scope                       | Core work management remains distinct from CRM tasks; optional extensions do not force MVP integrations.                                          | 84 tables in 15 groups; no AI agent entities, billing or enterprise SSO.                                                                                              |

## Transaction and authorization protocol

The target uses server-side application authorization. The application database role is a non-owner, non-superuser role with narrowly granted DML; clients never connect directly. No RLS policy is supplied or claimed. Workspace predicates, active membership, private-team visibility and resource permissions must be checked on every read/write, including background consumers and file downloads. Composite foreign keys protect relationship integrity, not read access. Administrative maintenance uses a separate role and audited procedure; application credentials cannot disable triggers, truncate history or run DDL. Trigger functions use invoker privileges.

Use READ COMMITTED for scoped-link commands, or SERIALIZABLE with whole-command retries. The scope guards reject REPEATABLE READ because an old transaction snapshot can miss concurrent links. Lock aggregate heads before mutating business rows. Multi-resource commands acquire aggregate heads and team counters in sorted identity order, then affected issues, labels/fields and links in a documented order. SQL guards take parent locks defensively; reverse edits can still deadlock, so retry the entire command with bounded jitter on `40P01` or `40001`. Do not retry arbitrary integrity failures as if they were transient.

Create stream heads at revision zero, increment exactly once in the business mutation transaction, then append all validated facts for that revision. New facts cannot claim a stale/future revision. Historical replay is consumer dispatch of original events, not reinsertion into the live event log. Imported legacy events and aliases need an explicit owner migration that preserves provenance; application inserts are intentionally stricter.

Hierarchy/dependency cycle detection and final-owner/default/project-team rules remain service invariants. For graph-changing commands, serialize graph changes per workspace (or use SERIALIZABLE and a complete reachability predicate with retries), then validate reachability. A parent self-check alone is insufficient. Default replacement locks the team/workspace workflow owner, clears the old default and selects the new one in the same transaction; never rely on an index to guarantee at least one default.

Consumer receipts give atomic deduplication only for side effects in the same database transaction. External mail/webhook/provider operations require a stable event-derived provider idempotency key where supported, or durable delivery state plus reconciliation. Do not describe an external effect as exactly once merely because a receipt exists.

## Validation performed

On 2026-09-30, the official DBML CLI exported the 84-table schema successfully. The export and all four SQL supplements loaded in disposable embedded PostgreSQL (`@electric-sql/pglite` 0.5.8 with `btree_gist`). All four rollback smoke scripts passed, as did rejection checks for all 13 archive/trash exclusivity constraints. Ajv 8.20 with formats and strict Draft 2020-12 validation compiled the event schema and produced the expected results for all six event fixtures. Documentation formatting and focused whitespace checks passed. This does not constitute deployment-version, multi-connection or application runtime validation.

## Concurrency acceptance tests before shipping

Run against the deployment PostgreSQL version using **two independent connections**, real service commands and barriers around the competing statements. Rollback smoke scripts prove single-session acceptance/rejection, not contention behavior.

| Race                                            | Required outcome                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Two issue creates in the same team              | Both commit with distinct numbers/identifiers; allocator exceeds both; exactly one alias ownership per identifier.                        |
| Opposing team transfers                         | Retried commands preserve all aliases, correct destination scope and monotonic counters; no partial transfer or duplicate event on retry. |
| Label/field scope edit vs new link              | One serializes or fails/retries; committed state never contains a mismatched team/type/target.                                            |
| Two default replacements / final-owner removals | Exactly one usable default and at least one active owner remain at commit.                                                                |
| Manual vs scheduled cycle completion            | One completion/rollover result; each eligible issue moves once with one history entry and stable idempotent response.                     |
| Two aggregate updates                           | Revisions advance without lost updates; each event reflects its committed revision. Multiple facts from one mutation share it.            |
| Two workers processing one event                | One committed receipt and one same-database effect; provider retries use the same external deduplication key.                             |
| Concurrent hierarchy/dependency edges           | A transaction fails/retries rather than committing a directed cycle.                                                                      |

## Migration gates

1. Inventory current Drizzle schemas and real data; map existing names/enums/auth token structures to the target. Do not execute the clean export against an occupied application database.
2. Find case-normalization collisions, orphan links, identifier/history gaps, missing defaults, invalid timestamps/lease states and overlapping cycles. Resolve them deterministically before adding enforcement.
3. Backfill tenant composite keys, alias history and stream metadata from reliable facts. Preserve legacy event bytes; do not invent aggregate revisions or label unvalidated payloads version 1.
4. Introduce versioned producer/consumer adapters and authorization paths with dual reporting. Add constraints in an incremental, reviewed migration with appropriate index build/validation strategy for table size.
5. Run the two-connection tests above, load/plan checks, backup/restore checks and dependency-aware trash recovery/purge tests. Configure event/audit retention and erasure separately from the 30-day trash rule.
6. Cut over with monitored outbox lag, retry/quarantine counts, constraint failures and restore conflicts. Keep a tested compatibility rollback plan; never remove existing aliases to simplify rollback.

Constraint design and lock behavior follow the primary PostgreSQL documentation for [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) and [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).
