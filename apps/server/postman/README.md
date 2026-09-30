# Tream Postman API tests

Import both files into Postman:

- `tream-m01-m04.postman_collection.json`
- `tream-local.postman_environment.json`

Select **Tream — Local** as the active environment. Set `baseUrl` to your API origin without a trailing slash (default `http://localhost:3002`). The collection adds `/api/v1` for business routes; health probes use `/health` and `/health/ready`.

## Start the API

Configure `apps/server/.env` using `.env.example`, start PostgreSQL, apply the reviewed migrations with `pnpm --filter server db:migrate`, then start the API with `pnpm --filter server dev`. See [server setup](../README.md) and [M01–M04 operations](../docs/M01-M04.md).

## Automatic smoke run

In the Collection Runner, select only **01 Smoke — run this folder**, keep its request order, and run one iteration. This folder contains 28 requests with status, response-envelope and correlation-ID assertions. It tests refresh rotation, workspace creation/replay/key conflicts, list responses, preferences, invitations, outsider denial, final-owner protection, diagnostics, archive/trash and restoration.

Every smoke run generates unique owner/outsider emails and a workspace slug, then captures tokens, user/workspace/membership/invitation IDs into the active environment. It creates two accounts, a workspace, an invitation and encrypted mail jobs. The invitation is revoked and the workspace restored at the end; accounts and the workspace remain available for manual testing. The smoke folder does not need mailbox access. Do not run all six folders together: the other folders are stateful manual recipes.

Optional Newman command, with Newman installed:

```sh
newman run apps/server/postman/tream-m01-m04.postman_collection.json \
  --environment apps/server/postman/tream-local.postman_environment.json \
  --folder '01 Smoke — run this folder'
```

## Manual requests

Folders 02–06 cover every currently mounted M01–M04 API operation. Run requests individually after setting their variables:

| Variable                                            | Source or purpose                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `email`, `password`                                 | Owner login credentials. Login captures `accessToken` and `refreshToken`.                   |
| `verificationToken`, `resetToken`, `magicLinkToken` | Copy the `token` query value from the corresponding email link.                             |
| `inviteEmail`, `inviteePassword`                    | A separate account with a real mailbox for invitation acceptance.                           |
| `inviteeVerificationToken`                          | Verification email token for the invited account.                                           |
| `inviteeAccessToken`                                | Captured by the invitee registration/login requests without replacing the owner token.      |
| `invitationToken`                                   | Copy from the invitation email; creation responses deliberately omit it.                    |
| `workspaceId`                                       | Captured by workspace creation; change it to target another workspace.                      |
| `membershipId`                                      | Target membership for role/state changes; acceptance captures this automatically.           |
| `memberRole`                                        | `OWNER`, `ADMIN`, `MEMBER` or `GUEST`; default `MEMBER`.                                    |
| `sessionId`                                         | Captured from your session list. Revoking the current session invalidates its access token. |
| `workspaceCursor`                                   | Captured from `meta.nextCursor`; send the next-page request only when nonempty.             |

For invitation acceptance, register or log in the invitee, verify its email, create an invitation as the owner, copy its mailbox token, then run **Accept invitation as verified invitee**. The request uses `inviteeAccessToken`; owner requests continue using `accessToken`. To exercise other roles, change the accepted membership's role as owner and use the invitee token on protected requests.

Mail-dependent flows need configured SMTP and `BACKGROUND_WORKERS_ENABLED=true`; the API intentionally does not expose one-time mail tokens. Use a local SMTP mailbox for development. Logout, reset, suspension, departure and role changes affect authorization immediately. Login again after session revocation/reset. Final-owner removal returns 409; an unrelated user receives 404 for a workspace they cannot access.

## Request behavior

Workspace POST/PATCH/DELETE requests generate a fresh UUID `Idempotency-Key` in their pre-request script. The smoke replay/conflict requests deliberately reuse `createKey`. To replay any other command, reuse its original key with the identical method, path and body instead of generating a new key.

These requests use non-browser authentication: no `Origin` header, bearer access tokens, explicit refresh tokens, and the Postman cookie jar disabled per request. Browser cookie/CSRF testing requires a separate configured-Origin flow. API access tokens and mail tokens are stored in the selected environment as secret variables; the checked-in environment contains no live credentials or tokens. Do not commit or share a populated environment export.

The collection follows Postman's [v2.1 collection schema](https://schema.getpostman.com/json/collection/v2.1.0/collection.json) and [script variable APIs](https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-variables/). Teams, projects, issues and other deferred product modules are omitted.

## Validation

The collection passes the official Postman v2.1 JSON Schema. All 70 request scripts parse, request bodies are valid JSON, and every request variable is defined. The 28 smoke requests and their scripts passed against an isolated PostgreSQL-backed Nest API using a temporary script harness. Postman desktop and Newman execution were not run.
