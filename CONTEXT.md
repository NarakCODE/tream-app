# Domain Context & Glossary

## 1. Identity & Access Management (IAM)

- **Workspace**: The root multi-tenant boundary. All data, members, teams, projects, issues, cycles, records, and integrations belong to a single Workspace.
- **User**: An authenticated individual with an email identity and credentials.
- **Membership**: The association of a User with a Workspace, carrying a role (`OWNER`, `ADMIN`, `MEMBER`, `GUEST`).
- **Role Permissions**:
  - `OWNER`: Full administrative and tenancy ownership.
  - `ADMIN`: Operational and team administration, member management.
  - `MEMBER`: Standard collaborative read/write access to resources.
  - `GUEST`: Restricted read-only access to authorized workspace resources.

## 2. Work Management Bounded Context

Product planning and issue tracking organized around Teams, Projects, Issues, and repeating Cycles.

- **Team**: An organizational unit within a Workspace (e.g., Engineering `ENG`, Design `DES`) that owns Issues, default Issue Statuses, and Cycle configurations.
- **Team Membership**: An association between an active Workspace Membership and a Team.
- **Issue**: The atomic unit of product work owned by exactly one Team. Identified by an immutable internal identity and a current human-readable identifier (e.g., `ENG-42`). A Team transfer changes its current identifier while all previous identifiers remain permanent aliases for the same Issue.
- **Issue Status**: A workflow state belonging to a Team, categorized into one of six fixed categories (`BACKLOG`, `UNSTARTED`, `STARTED`, `COMPLETED`, `CANCELED`, `DUPLICATE`).
- **Work Priority**: The urgency level of an Issue or Project (`NO_PRIORITY`, `LOW`, `MEDIUM`, `HIGH`, `URGENT`).
- **Project**: An outcome-oriented deliverable within a Workspace that spans one or more Teams via Project Teams. Progress is computed dynamically from active assigned Issues.
- **Project Team**: An association linking a Project to a Team, permitting Issues from that Team to be assigned to the Project.
- **Cycle**: A time-boxed iteration belonging to a single Team with a sequential number, start date, and end date. Used for near-term sprint/iteration planning.
- **Cycle Rollover**: The automated transition when a Cycle finishes: incomplete active issues (`UNSTARTED`, `STARTED`) are rolled into the next Cycle, while completed/canceled/backlog issues remain in place.

## 3. CRM Core vs. Work Management Distinction

- **CRM Task (`tsk_<ULID>`)**: An operational, customer-facing follow-up activity linked to CRM Contacts and Deals. Operates on a simple `TODO` / `IN_PROGRESS` / `DONE` state machine.
- **Product Issue (`iss_<ULID>`)**: Engineering and product work belonging to a Team, using customizable Team workflow statuses, estimates, cycles, and cross-team project deliverables. CRM Tasks and Product Issues are strictly distinct entities and do not share routes, schemas, or identifiers.

## 4. Dynamic Data Platform

- **Database**: A user-defined relational schema definition.
- **Field Definition**: A typed schema column with validation rules (`TEXT`, `NUMBER`, `SELECT`, `RELATION`, etc.).
- **Record**: A row containing attribute values conforming to the Database schema.

## 5. Eventing & Outbox Backbone

- **Domain Event**: An immutable record of a business fact appended in the same transaction as state mutations (`team.created`, `issue.created`, `cycle.completed`, etc.).
- **Aggregate Revision**: A committed change to one domain resource, shared by all Domain Events describing that change. It differs from the version of an event payload contract.
- **Consumer Receipt**: A record that one consumer has completed processing one Domain Event.
- **Dispatch Attempt**: An outbox queue entry (`PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`) tracking downstream delivery.

## 6. Collaboration & Planning

- **Initiative**: A strategic outcome within a Workspace that groups related Projects.
- **Project Milestone**: A checkpoint within one Project used to group Issues around an intermediate deliverable.
- **Issue Relation**: A connection between two Issues, such as blocking, related work, or duplication. A parent Issue groups sub-Issues.
- **Subscriber**: A Workspace member who follows changes to an Issue, Project, or Initiative.
- **Comment**: A member's contribution to a conversation about an Issue, Project, Initiative, or planning update.
- **Document**: A collaborative description, specification, or reference associated with workspace work.
- **File**: Private uploaded content belonging to a Workspace, with an immutable originating work item or conversation. Sharing it through another association preserves access to that origin as a prerequisite.
- **Attachment**: An association linking one File to exactly one work item or conversation.
- **Upload Intent**: A member's reservation to upload a File to its originating work item or conversation.
- **Quarantine**: A File state that prevents downloads until its content passes verification and scanning.
- **Saved View**: A named set of filters and display choices that presents a subset of workspace work.
- **Notification**: A recipient-specific notice of an event, with its own read and snooze state.
- **Pull Request**: A proposed repository change associated with workspace work.
- **Review**: A human assessment of a Pull Request, including feedback and an approval or change request.
- **Workspace Invitation**: An offer to join a Workspace with a specified membership role.

## 7. Resource Lifecycle

- **Archive**: Retained work removed from active planning without entering trash or losing its history. Completion and cancellation are separate workflow outcomes.
- **Trash**: Recoverably deleted work awaiting restoration or eventual purge. Restoring work returns it to an unarchived state after its dependencies are validated.
- **Purge**: Irreversible removal of retained content after its restoration window, preserving historical identity and placeholders.
- **Identifier Alias**: A permanently reserved readable identifier that continues to resolve to the same Issue after a Team transfer.
