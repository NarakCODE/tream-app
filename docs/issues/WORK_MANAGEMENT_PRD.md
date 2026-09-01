# Work Management PRD

**Version:** 1.0  
**Date:** 2026-08-31  
**Author:** Codex  
**Status:** Draft  
**Related documents:** `PRD.md`, `apps/server/README.md`, Linear Concepts, Linear Teams, Linear Projects, Linear Cycles, Linear Create Issues

## 1. Overview & Goals

Add Linear-inspired product planning to the Tream server through Teams, Issues,
Projects, and Cycles. These concepts form one `Work Management` bounded context
inside the existing NestJS modular monolith.

The existing CRM `Task` remains a separate operational follow-up associated with
contacts and deals. An `Issue` represents product work owned by a Team and must
not reuse the CRM task schema, status policy, identifiers, or routes.

### Primary Goals

- Let a Workspace organize members and product work into Teams.
- Make Issues the smallest tracked unit of product work.
- Group Issues around deliverable outcomes with Projects.
- Plan near-term Team work in repeating Cycles.
- Preserve workspace tenancy, RBAC, prefixed IDs, cursor pagination,
  idempotency, transactional authorization, and durable domain events.
- Keep the model ready for future labels, comments, triage, templates,
  initiatives, Git integrations, and agent delegation without implementing
  them in v1.

### Success Metrics

- Every Issue has one Team, one team-scoped human identifier, and one workflow
  status.
- Cross-resource assignments cannot cross Workspace boundaries; Cycle
  assignments also cannot cross Team boundaries.
- Concurrent Issue creation never produces duplicate Team issue numbers.
- Current and upcoming Cycles can be derived without overlapping dates.
- Every mutation is covered through the HTTP API seam and critical constraints
  are covered against PostgreSQL.
- Team, Issue, Project, and Cycle writes append durable events in the same
  transaction as their state changes.

## 2. Scope

### In Scope (v1)

#### Teams

- Create, list, read, update, retire, and restore Teams inside a Workspace.
- Team properties: `id`, `workspaceId`, `name`, unique uppercase `key`, optional
  description, timezone, cycle settings, next Issue number, timestamps, and
  `retiredAt`.
- Add and remove active Workspace memberships through `TeamMembership`.
- A Workspace member may belong to multiple Teams.
- `OWNER` and `ADMIN` may create or administer Teams. `MEMBER` may read and join
  active public Teams. `GUEST` is read-only and cannot join in v1.
- Teams are public to members of their Workspace in v1. Private Teams and
  sub-Teams are deferred.
- Team creation atomically creates default Issue statuses: Backlog, Todo,
  In Progress, Done, Canceled, and Duplicate.

#### Issues

- Create, list, read, update, assign, move, and soft-delete Issues.
- An Issue belongs to exactly one Team and receives a stable human identifier
  such as `ENG-42`; its internal ID uses `iss_<ULID>`.
- Required properties: title and workflow status. Optional properties:
  description, priority, assignee Workspace membership, Project, Cycle, due
  date, and estimate.
- Priorities are `NO_PRIORITY`, `LOW`, `MEDIUM`, `HIGH`, and `URGENT`.
- Workflow statuses belong to a Team and have a fixed category:
  `BACKLOG`, `UNSTARTED`, `STARTED`, `COMPLETED`, `CANCELED`, or `DUPLICATE`.
- Issue status configuration is readable but custom status management is
  deferred; v1 uses the default statuses created with the Team.
- Issue lists support cursor pagination and filters for Team, status category,
  assignee, Project, Cycle, and priority.
- Only an active Workspace member can be assigned. Team membership is not
  required for assignment in v1, matching collaboration across public Teams.
- Parent/sub-Issues, blocking/related/duplicate relations, comments, labels,
  subscribers, attachments, activity history, and agent delegation are phase 2.

#### Projects

- Create, list, read, update, complete, cancel, and soft-delete Projects.
- A Project belongs to one Workspace and may be associated with one or more
  Teams through `ProjectTeam`.
- Project properties: name, summary, description, status, priority, lead
  Workspace membership, start date, target date, timestamps, and deletion data.
- Project statuses are `PLANNED`, `STARTED`, `PAUSED`, `COMPLETED`, and
  `CANCELED`.
- An Issue belongs to at most one Project. Its Team must be associated with that
  Project before assignment.
- Project progress is computed from active Issues by workflow-status category;
  it is not persisted as mutable source-of-truth state.
- Milestones, documents, updates, initiatives, custom project statuses, and
  project templates are phase 2.

#### Cycles

- Enable or disable Cycles per Team.
- Configure Team timezone, start day, duration in weeks, cooldown days, and the
  number of upcoming Cycles to keep generated.
- List past, current, and upcoming Cycles for a Team.
- A Cycle belongs to exactly one Team and has a sequential number, name,
  `startsAt`, `endsAt`, `completedAt`, and timestamps.
- Cycle intervals for one Team must not overlap. Past Cycle dates are immutable.
- A database-backed scheduler creates missing upcoming Cycles, closes elapsed
  Cycles, and rolls open Issues into the next Cycle.
- Completed, canceled, duplicate, backlog, and deleted Issues do not roll over.
- Cycle capacity forecasting, cooldown attribution, calendar feeds, manual
  date exceptions, and inherited sub-Team schedules are phase 2.

### Out of Scope (v1)

- UI implementation or changes in `apps/client`.
- Private Teams, sub-Teams, Team-level guest access, or cross-Workspace sharing.
- Custom workflow editing and workflow automations.
- Parent/sub-Issues, Issue relations, labels, comments, attachments, templates,
  triage, recurring Issues, notifications, and activity feeds.
- Project milestones, documents, initiatives, roadmaps, and custom views.
- GitHub/GitLab branch and pull-request automations.
- Agent assignment or autonomous Issue execution.
- Importing or synchronizing data from Linear.

## 3. User Flows

1. **Create a Team**
   1. An authenticated Workspace owner or admin creates `Engineering` with key
      `ENG`.
   2. The server transactionally creates the Team, Issue counter, creator Team
      membership, and default Issue statuses.
   3. A repeated request with the same idempotency key replays the response;
      another active Team cannot reuse `ENG` in that Workspace.

2. **Create and assign an Issue**
   1. A writable Workspace member creates an Issue under Engineering.
   2. The server locks/increments the Team counter and returns `ENG-1`.
   3. The Issue starts in the Team's default Backlog status unless another valid
      Team status is supplied.
   4. The assignee, Project, and Cycle are validated transactionally.

3. **Plan a Project across Teams**
   1. An owner, admin, or member creates a Project and associates Engineering
      and Design.
   2. Issues from those Teams may be added to the Project; Issues from other
      Teams are rejected until their Team is associated.
   3. Project progress reflects completed active Issues over all active Project
      Issues.

4. **Plan a Cycle**
   1. An owner or admin enables two-week Cycles for Engineering.
   2. The scheduler creates the current and configured upcoming Cycles without
      overlapping Team dates.
   3. A writable member assigns an Engineering Issue to an Engineering Cycle.
   4. Assigning a Design Issue to that Cycle returns a typed validation error.

5. **Complete a Cycle**
   1. The scheduler marks an elapsed current Cycle complete.
   2. Open Issues roll into the next Cycle in one transactionally consistent
      operation; completed/canceled/duplicate/backlog Issues do not.
   3. The operation is retry-safe and produces one `cycle.completed` event.

6. **Retire a Team**
   1. An owner or admin retires a Team.
   2. Historical Issues, Projects, and Cycles remain readable.
   3. New Issues and mutations within the retired Team are rejected.

## 4. Technical Specifications

### Data Model

Use `apps/server/src/database/schema/work-management.schema.ts` and export it
from the schema barrel. All mutable resources carry `createdAt` and `updatedAt`;
soft-deleted resources carry `deletedAt` or domain-specific `retiredAt`.

| Table              | Important constraints                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `teams`            | FK Workspace; unique active `(workspace_id, key)`; `next_issue_number >= 1`               |
| `team_memberships` | FK Team and Workspace membership; unique `(team_id, membership_id)`                       |
| `issue_statuses`   | FK Team; unique `(team_id, name)` and `(team_id, position)`; immutable category           |
| `projects`         | FK Workspace and optional lead membership; target date not before start date              |
| `project_teams`    | FK Project and Team; unique pair; both must share a Workspace                             |
| `cycles`           | FK Team; unique `(team_id, number)`; start before end; no overlapping active interval     |
| `issues`           | FK Workspace, Team, status, optional membership/Project/Cycle; unique `(team_id, number)` |

Concurrency-sensitive writes lock the Team row when allocating Issue numbers,
lock affected Project/Team/Cycle rows before cross-linking, and repeat
authorization inside the transaction.

Suggested domain events:

- `team.created`, `team.updated`, `team.retired`
- `project.created`, `project.updated`, `project.completed`, `project.canceled`
- `issue.created`, `issue.updated`, `issue.assigned`, `issue.status_changed`,
  `issue.deleted`
- `cycle.created`, `cycle.started`, `cycle.completed`

The TypeScript event catalog, PostgreSQL event constraint, and migration must be
updated together.

### Components and Integration

Implement one feature boundary:

```text
apps/server/src/modules/work-management/
├── domain/
├── application/
│   └── ports/
├── infrastructure/
├── presentation/
└── work-management.module.ts
```

Dependency direction:

```text
IAM + Database + Eventing -> Work Management
CRM Tasks                 (independent)
Agent Core                (future consumer of Work Management events/ports)
```

Initial API routes:

- `GET/POST /api/v1/workspaces/:workspaceId/teams`
- `GET/PATCH/DELETE /api/v1/teams/:teamId`
- `GET/POST /api/v1/teams/:teamId/members`
- `DELETE /api/v1/teams/:teamId/members/:membershipId`
- `GET /api/v1/teams/:teamId/issue-statuses`
- `GET/POST /api/v1/workspaces/:workspaceId/projects`
- `GET/PATCH/DELETE /api/v1/projects/:projectId`
- `POST /api/v1/projects/:projectId/teams`
- `DELETE /api/v1/projects/:projectId/teams/:teamId`
- `GET/POST /api/v1/teams/:teamId/issues`
- `GET /api/v1/workspaces/:workspaceId/issues`
- `GET/PATCH/DELETE /api/v1/issues/:issueId`
- `GET /api/v1/teams/:teamId/cycles`
- `PATCH /api/v1/teams/:teamId/cycle-settings`
- `GET/PATCH /api/v1/cycles/:cycleId`

Workspace list/create routes reuse `WorkspaceMembershipGuard`. Resource routes
use a Work Management access guard that returns indistinguishable `403` errors
for missing, retired/deleted, unauthorized, and cross-tenant identifiers.

Authenticated `POST` and `PATCH` routes require the existing UUID-v4
`Idempotency-Key`. Collections use the existing opaque cursor envelope.

### Keyboard and Focus Behavior

No UI is included in v1. Future clients should reserve Linear-like shortcuts
only when their owning surface is focused: `C` for Issue creation, `P` for
priority, `A` for assignee, and command-palette actions for Project/Cycle moves.
Global shortcuts must not fire while typing in an input or rich-text editor.

### Optimistic Updates and Error States

No client implementation is included. The API must support future optimistic
updates by returning the complete canonical resource after mutation and typed
conflict/validation responses suitable for rollback:

- `RESOURCE_CONFLICT` for duplicate Team keys or stale uniqueness assumptions.
- `VALIDATION_ERROR` for invalid workflow, date, Team, Project, Cycle, or
  assignee relationships.
- `FORBIDDEN` for hidden or unauthorized resources.
- `RESOURCE_NOT_FOUND` only where the resource is not tenant-sensitive.

## 5. Implementation Checklist

- [ ] Confirm the v1 model, API seam, worker seam, and PostgreSQL seam.
- [ ] Add the Work Management domain vocabulary to `CONTEXT.md`.
- [ ] Record the bounded-context and CRM Task/Issue separation in an ADR.
- [ ] Add schema definitions, constraints, indexes, migration, and snapshot.
- [ ] Implement Team policies, repository, service, guards, DTOs, and routes.
- [ ] Implement Project policies, repository, service, guards, DTOs, and routes.
- [ ] Implement Issue workflow policies, concurrency-safe numbering, repository,
      service, guards, DTOs, and routes.
- [ ] Implement Cycle settings, scheduler, rollover policy, repository, service,
      DTOs, and routes.
- [ ] Add Work Management event types and transactional event appends.
- [ ] Mount `WorkManagementModule` in `AppModule`.
- [ ] Add Fastify component tests through repository ports.
- [ ] Add disposable-PostgreSQL tests for migrations, uniqueness, numbering,
      tenant boundaries, date overlap, rollover, and concurrency.
- [ ] Run server typecheck, lint, unit tests, E2E tests, migration tests, build,
      and `git diff --check`.

## 6. Open Questions / Decisions

1. Confirm that CRM Tasks remain separate from product Issues. **Recommended:
   yes.**
2. Confirm v1 public Workspace Teams; private Teams and sub-Teams are deferred.
   **Recommended: yes.**
3. Confirm Projects may span multiple Teams, while an Issue belongs to only one
   Project and one Team. **Recommended: yes.**
4. Confirm automated repeating Cycles and rollover belong in v1, while capacity
   forecasting and manual date exceptions are deferred. **Recommended: yes.**
5. Confirm Issue relations, parent/sub-Issues, comments, labels, templates, and
   triage move to phase 2. **Recommended: yes.**

## 7. References

- [Local Brain Workspace API & Product Specification](../../PRD.md)
- [Tream server contracts](../../apps/server/README.md)
- [Linear concepts](https://linear.app/docs/conceptual-model)
- [Linear teams](https://linear.app/docs/teams)
- [Linear create issues](https://linear.app/docs/creating-issues)
- [Linear issue status](https://linear.app/docs/configuring-workflows)
- [Linear projects](https://linear.app/docs/projects)
- [Linear cycles](https://linear.app/docs/use-cycles)
- [Linear issue relations](https://linear.app/docs/issue-relations)
- [Linear parent and sub-issues](https://linear.app/docs/parent-and-sub-issues)
