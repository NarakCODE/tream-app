# Bootstrap and onboarding API

Bootstrap gives authenticated clients one server-owned setup decision. Workspace
and team resources determine readiness; the membership records whether the user
finished the optional welcome step. Browser storage is only used for draft and
command-retry recovery, not completion.

## Read bootstrap

`GET /api/v1/bootstrap` requires Bearer authentication and returns
`Cache-Control: no-store`. It uses the standard `{ data, meta }` response envelope.
The shared web contract is `bootstrapResponseSchema` in
[`packages/schemas/src/bootstrap.ts`](../packages/schemas/src/bootstrap.ts).

```json
{
  "data": {
    "user": {
      "id": "user-id",
      "email": "alex@example.com",
      "fullName": "Alex",
      "avatarUrl": null,
      "emailVerified": true
    },
    "activeWorkspace": null,
    "onboarding": {
      "setupReady": false,
      "completed": false,
      "completedAt": null,
      "nextStep": "CREATE_WORKSPACE"
    }
  },
  "meta": {
    "requestId": "request-id",
    "timestamp": "2026-10-07T00:00:00.000Z"
  }
}
```

When present, `activeWorkspace` has the same shape as
`GET /api/v1/workspaces/active`: `{ workspaceId, workspace, membership }`.
It only represents a selected, usable workspace with an active membership.
Archived or deleted workspaces and inactive memberships cannot satisfy setup.

The server applies these decisions in order:

| Condition                                                               | `nextStep`         |
| ----------------------------------------------------------------------- | ------------------ |
| User email is unverified                                                | `VERIFY_EMAIL`     |
| No selected usable workspace and no usable memberships                  | `CREATE_WORKSPACE` |
| No selected usable workspace, but usable memberships exist              | `SELECT_WORKSPACE` |
| Workspace has no non-retired team; user has `team.manage`               | `CREATE_TEAM`      |
| Workspace has no non-retired team; user cannot manage teams             | `WAIT_FOR_TEAM`    |
| Workspace setup is ready; membership has not completed the welcome step | `INVITE_TEAMMATES` |
| Workspace setup is ready; membership has completed the welcome step     | `DONE`             |

`VERIFY_EMAIL` is a defensive policy result. The existing authentication guard
rejects unverified accounts; signup issues no session, and clients complete email
verification before login/bootstrap. Bootstrap does not weaken that policy.

`setupReady` requires verified email, a usable selected workspace, and at least
one non-retired workspace team. Team existence is evaluated independently of
the caller's visible team list. A guest with no visible private teams therefore
does not incorrectly get asked to create a team. This response exposes no private
team names or identifiers and grants no additional access to issues or teams.

`completedAt` is the membership's persisted first completion time, or `null`.
`completed` requires both that timestamp and current readiness. If the last team
is retired, bootstrap can require setup again while retaining the historical
timestamp. Each workspace membership has its own completion state.

## Complete onboarding

`POST /api/v1/workspaces/:workspaceId/onboarding/complete`

- Requires Bearer authentication and a UUID v4 `Idempotency-Key` header.
- Has no request body.
- Requires the user's own active membership, a usable selected workspace matching
  the path, verified email, and at least one non-retired workspace team.
- Does not require invitation permission or any sent invitations. **Skip for now**
  and **Continue to workspace** use the same completion command.
- Records `memberships.onboarding_completed_at` only once. Distinct retry keys
  converge on that first timestamp; repeated keys use the existing command replay
  mechanism. Authorization and prerequisites are checked before replay as well as
  before a new write.
- Only a completion receipt is stored for command replay. The endpoint reads fresh
  bootstrap state after the command, so a retry cannot restore an old profile,
  membership role, or workspace slug into the client's cache.
- Returns the bootstrap response in the standard envelope. Clients enter
  `/{workspaceSlug}/my-issues` using the returned slug when `nextStep` is `DONE`
  and the selected workspace still matches the command target.

Unauthenticated requests return `401`. Inaccessible or inactive memberships and
unusable workspaces follow workspace authorization (`404` for missing/deleted
or inaccessible resources, `403` for archived workspaces). Incomplete setup or a
mismatched workspace selection returns `409`. Existing idempotency validation
rejects missing or invalid command keys.

## Web integration and rollout

The root and onboarding pages use the bootstrap decision rather than infer
completion from local storage. Existing memberships without a selected workspace
are offered selection in `/onboarding`; `/workspaces` remains a creation page.
Users without invitation permission can finish with **Open workspace**.

Bootstrap query options use a positive stale time, `no-store` network reads, and
the shared Zod response schema. Workspace selection/creation and membership
changes, invitation acceptance, team changes, and onboarding completion refresh
or invalidate bootstrap state. Session changes clear user-scoped cache state.
Server rendering uses a request-local QueryClient and hydrates the client cache.

Deploy the new database migration before running the updated server and web app.
The nullable column deliberately defaults to `null`: existing membership records
have no trustworthy historical completion timestamp and will see the optional
welcome step once. Existing local-storage completion flags are not migrated or
trusted. Existing workspace and team resources are reused.
