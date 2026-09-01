# ADR 0001: Work Management Bounded Context and CRM Task vs. Product Issue Separation

## Status

Accepted

## Context

The Tream application currently provides generic IAM, Dynamic Data, CRM Core (Contacts, Companies, Deals, Tasks), and Eventing. There is a need to introduce Linear-style product management capabilities: Teams, Issues, Projects, and Cycles.

We considered two architectural alternatives for modeling product work:

1. Reusing and extending the existing CRM `Task` model with foreign keys to Teams, Projects, and Cycles.
2. Creating a separate `Work Management` bounded context with dedicated entities (`Team`, `Issue`, `Project`, `Cycle`, `IssueStatus`, `TeamMembership`, `ProjectTeam`) and distinct lifecycle, identification, and routing conventions.

## Decision

We will implement a dedicated `Work Management` bounded context (`modules/work-management`) and keep it strictly separated from the CRM Core `Task` model:

1. **Entity Separation**: CRM `Task` represents operational sales/lead follow-ups (`TODO` -> `IN_PROGRESS` -> `DONE`) tied to contacts and deals. Product `Issue` represents engineering/product work owned by a `Team`, tracking workflow status categories (`BACKLOG`, `UNSTARTED`, `STARTED`, `COMPLETED`, `CANCELED`, `DUPLICATE`), estimates, priorities, cycles, and cross-team projects.
2. **Identification**: Issues receive human-readable stable identifiers scoped to the Team key (`ENG-12`) backed by internal prefixed ULIDs (`iss_<ULID>`). CRM Tasks use `tsk_<ULID>` without team keys.
3. **Multi-Tenancy and Access Boundaries**:
   - Workspaces partition Teams, Projects, and Issues.
   - Cross-resource references (assignees, project associations, cycle associations) are validated strictly within the same Workspace boundary.
   - Cycles and Issue Statuses are scoped strictly to individual Teams.
   - Projects can span multiple Teams within the same Workspace via `ProjectTeam` join associations.
4. **Durable Eventing**: All mutations in Work Management append immutable domain events to the outbox (`team.created`, `project.created`, `issue.created`, `cycle.completed`, etc.) within the same database transaction.
5. **Security & Non-Enumeration**: Consistent with existing server modules, unauthorized, missing, or cross-tenant resource requests return non-disclosing `403 Forbidden` errors.

## Consequences

- Clean separation between customer operational tasks and product development issues.
- Clear modular boundaries ready for future capabilities (labels, comments, git integrations, triage, and agent delegation) without schema contamination.
- Requires maintenance of two distinct issue/task pipelines, which accurately models the distinct domain requirements.
