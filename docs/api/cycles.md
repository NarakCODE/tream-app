# Cycles Module Specification (Sprints, Cadence Scheduling, Burndown)

## 1. Overview and Key Components

The `CyclesModule` manages sprint planning, recurring cycle generation based on team settings, active cycle progression, issue rollovers upon completion, and burndown reports.

- **Controllers**:
  - [`CyclesController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/cycles/presentation/cycles.controller.ts) (`/workspaces/:workspaceId/teams/:teamId/cycles`): Cycle listing, creation, automated scheduling, detail lookup, burndown reports, updating, starting, completing, and canceling.
- **Application Services**:
  - [`CycleService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/cycles/application/cycle.service.ts): Cycle state machine transitions, concurrency control via `expectedRevision`, automated rollover migrations.
  - [`CycleSchedulerService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/cycles/application/cycle-scheduler.service.ts): Computes start/end dates using team timezone and cadence settings.
- **Domain Policies**:
  - [`cycle-planning.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/cycles/domain/cycle-planning.ts): Invariant validation (`validateWindow`, `requireRevision`, `localMidnight`).
- **Database Schema**:
  - `work-management.schema.ts`: `cycles`, `cycleRollovers`, `teams`, `issues`.

---

## 2. Permissions, Visibility & Tenant Rules

- **Access Scope**: Scoped to `/workspaces/:workspaceId/teams/:teamId/cycles`.
- **Read Access**: Team `read` permission (active workspace member if team is `WORKSPACE` visibility, or active team member if team is `PRIVATE`).
- **Write / Manage Access**: Team `write` permission (team `ADMIN` or workspace `ADMIN`/`OWNER`).
- **Team State Invariant**: Cycles cannot be modified on retired teams (`HTTP 409 Conflict`).

---

## 3. Domain Invariants & Error Codes

1. **Optimistic Locking (`HTTP 409 Conflict`)**:
   - `update`, `start`, `complete`, and `cancel` require `expectedRevision` matching `cycle.revision`. Mismatch throws `HTTP 409 Conflict` ([`cycle-planning.ts:33`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/cycles/domain/cycle-planning.ts#L33)).
2. **Cycle Window Invariants (`HTTP 400 Bad Request`)**:
   - `endsAt` must be strictly after `startsAt`.
   - Cycle date windows cannot overlap with existing active/scheduled cycles within the same team.
3. **Single Active Running Cycle (`HTTP 409 Conflict`)**:
   - Only one cycle per team may have `startedAt != null` while `completedAt == null` and `canceledAt == null`. Attempting to start a second cycle while one is active throws `HTTP 409 Conflict`.
4. **Terminal State Exclusivity (`HTTP 409 Conflict`)**:
   - A cycle cannot be completed if already completed or canceled.
   - A cycle cannot be canceled if already completed.
5. **Completion Rollover Target (`HTTP 400 Bad Request` / `HTTP 404 Not Found`)**:
   - If `nextCycleId` is specified for uncompleted issue migration:
     - `nextCycleId` must exist in the same team.
     - `nextCycleId` cannot be the same cycle being completed (`m08_cycle_completion_target`).
     - Target cycle cannot be completed or canceled.

---

## 4. Endpoint Table

All routes scoped under `/api/v1/workspaces/:workspaceId/teams/:teamId/cycles`.

| Method   | Path                 | Access     | Idempotent   | Description                                                                  |
| :------- | :------------------- | :--------- | :----------- | :--------------------------------------------------------------------------- |
| `GET`    | `/`                  | Team Read  | No           | List team cycles with cursor pagination.                                     |
| `POST`   | `/`                  | Team Admin | Yes (Header) | Create an individual cycle with explicit date windows.                       |
| `POST`   | `/schedule`          | Team Admin | Yes (Header) | Automatically schedule future cycles using team cadence settings.            |
| `GET`    | `/:cycleId`          | Team Read  | No           | Retrieve cycle details and current scope metrics.                            |
| `GET`    | `/:cycleId/report`   | Team Read  | No           | Retrieve cycle burndown statistics, completion rate, and rollover metrics.   |
| `PATCH`  | `/:cycleId`          | Team Admin | Yes (Header) | Update cycle name or date window (requires `expectedRevision`).              |
| `POST`   | `/:cycleId/start`    | Team Admin | Yes (Header) | Start cycle (sets `startedAt = now()`, requires `expectedRevision`).         |
| `POST`   | `/:cycleId/complete` | Team Admin | Yes (Header) | Complete cycle and optionally roll over uncompleted issues to `nextCycleId`. |
| `DELETE` | `/:cycleId`          | Team Admin | Yes (Header) | Cancel cycle (sets `canceledAt = now()`, requires `expectedRevision`).       |

---

## 5. DTO Types & Validation Rules

- `CycleRevisionDto`:
  - `expectedRevision`: integer, `@IsInt()`, `@Min(1)`.
- `CreateCycleDto`:
  - `name`: string, `@MinLength(1)`, `@MaxLength(200)`.
  - `startsAt`: ISO8601 timestamp string (or `startDate: YYYY-MM-DD`).
  - `endsAt`: ISO8601 timestamp string (or `endDate: YYYY-MM-DD`).
- `UpdateCycleDto`: Extends `CycleRevisionDto` with optional `name`, `startsAt`, `endsAt`.
- `ScheduleCyclesDto`:
  - `anchorDate`: optional string (`YYYY-MM-DD`).
  - `count`: optional integer, `@Min(1)`, `@Max(10)` (defaults to team's `upcomingCyclesCount`).
- `CompleteCycleDto`: Extends `CycleRevisionDto` with optional `nextCycleId: string`.

---

## 6. Cross-Module Dependencies

1. **`TeamsModule`**: Cycles inherit timezone, duration, cooldown, and start day from `teams` table.
2. **`IssuesModule`**: Issues assign to cycles via `issues.cycle_id`. Completing a cycle atomically updates rollover issues and emits `issue.cycle_rolled_over`.
3. **`NotificationsModule`**: Emits notifications on cycle completion and rollover.

---

## 7. Open Questions

- None. Cycle scheduling, rollover migrations, and revision assertions verified against source.
