# Feature modules

`ApiModule` composes 20 feature boundaries. IAM implements persisted authentication, workspaces, memberships, invitations and preferences (M02/M04). Teams implements visibility, team membership/admin rules, workflow statuses and cycle settings (M05). Projects implements catalogs, cross-team visibility, project lifecycle/members, milestones, computed progress and health updates (M06). Eventing implements versioned transactional facts, registered consumers, durable leases/receipts and owner-only delivery monitoring (M03). Audit exposes a transactional audit writer; its search/retention API is deferred to M14. Issues implements identifier allocation/aliases, revisioned commands, transfers, hierarchy and relations (M07). Cycles implements timezone scheduling, completion and rollover (M08). Collaboration implements comments, reactions, labels, subscriptions, activity and templates (M09). Files implements private upload intents, content verification/quarantine, scoped grants, typed attachments and durable cleanup (M10). The other 11 modules remain scaffolds without business controllers or persistence use cases. AI agents are excluded.

The table describes ownership, not a claim that every listed capability is implemented. See [M01–M04](../../docs/M01-M04.md), [M05](../../docs/M05.md) and [M06](../../docs/M06.md) and [M07–M09](../../docs/M07-M09.md) and [M10](../../docs/M10.md) for mounted routes and guarantees. Team settings configure cycle planning; M08 owns cycle APIs and workers. Issue creation and transfers use the exported transactional team allocator.

For the mounted issue routes, DTOs, visibility rules, revision and idempotency behavior, see the [Issues API reference](../../../../docs/issue-api.md). It also maps the server contract to the existing `apps/web/features/issues` feature and records current client gaps.

| Module        | Responsibility                                                                            |
| ------------- | ----------------------------------------------------------------------------------------- |
| IAM           | Authentication, users, workspaces, memberships and invitations                            |
| Teams         | Teams, team memberships and workflow statuses                                             |
| Projects      | Projects, milestones, memberships and updates                                             |
| Issues        | Issues, identifiers, assignments and relationships ([API](../../../../docs/issue-api.md)) |
| Cycles        | Iterations and rollover                                                                   |
| Collaboration | Comments, reactions, labels, subscribers and activity                                     |
| Initiatives   | Initiatives and project associations                                                      |
| Documents     | Documents and ownership                                                                   |
| Files         | Uploads, storage and attachments                                                          |
| Views         | Saved views, favorites and display preferences                                            |
| Notifications | Inbox, preferences and delivery                                                           |
| Reviews       | Pull requests, reviews and viewed-file progress                                           |
| Audit         | Audit history                                                                             |
| Eventing      | Versioned events, outbox and consumer receipts                                            |
| Integrations  | External integrations, OAuth and webhooks                                                 |
| Contacts      | CRM contacts                                                                              |
| Companies     | CRM companies                                                                             |
| Deals         | CRM deals and stages                                                                      |
| Tasks         | CRM follow-up tasks, separate from work-management issues                                 |
| Dynamic Data  | Custom databases, fields and records                                                      |

Feature code follows this layout:

```text
feature/
  feature.module.ts
  domain/
  application/
    ports/
  infrastructure/
  presentation/
    dto/
```

Keep business rules in `domain/`, orchestration in `application/`, contracts for
external dependencies in `application/ports/`, adapters in `infrastructure/`,
and HTTP controllers and DTOs in `presentation/`. Domain code must remain free
of NestJS, HTTP, ORM and platform dependencies. Add providers, exports and module
imports only when an implemented use case needs them; prefer constructor
injection and explicit ports over circular imports.

Health and startup infrastructure belong to `src/core/`. There is no AI agent
module in the MVP scaffold.
