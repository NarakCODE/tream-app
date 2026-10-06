# IAM Module Specification (Authentication, Profile & Workspaces)

## 1. Overview and Key Components

The `IamModule` owns identity, authentication, user profiles, workspaces, memberships, and invitations.

- **Controllers**:
  - [`AuthenticationController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.controller.ts) (`/auth`): Session lifecycle, credential management, email verification, magic link, password recovery.
  - [`ProfileController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.controller.ts#L217) (`/me`): Authenticated user profile retrieval and name updates.
  - [`WorkspacesController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/workspaces/presentation/workspaces.controller.ts) (`/workspaces`): Workspace CRUD, active workspace switching, member roster, role management, invitation dispatch, and user workspace preferences.
- **Application Services**:
  - [`AuthenticationService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/application/authentication.service.ts): Argon2id password hashing, JWT generation, session management, token consumption.
  - [`WorkspaceService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/workspaces/application/workspace.service.ts): Workspace creation, membership state transitions, slug allocation.
  - [`WorkspaceAuthorizationService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/workspaces/application/workspace-authorization.service.ts): Enforces role-based permissions and lifecycle checks (`archived`, `deleted`).
- **Guards & Decorators**:
  - [`AuthenticationGuard`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.guard.ts): Bearer token validation and user identity attachment.
  - [`AuthenticationOriginGuard`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication-origin.guard.ts): CSRF / origin header validation against allowed CORS origins.
  - [`WorkspacePermissionGuard`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/workspaces/presentation/workspace-permission.guard.ts): Enforces permission requirements per endpoint via `@RequireWorkspacePermission`.
- **Database Schema**:
  - `auth.schema.ts`: `users`, `sessions`, `authTokens`
  - `workspace.schema.ts`: `workspaces`, `memberships`, `invitations`, `workspacePreferences`

---

## 2. Permissions, Visibility & Tenant Rules

### 2.1 Workspace Roles & Permissions

Defined in [`permissions.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/workspaces/domain/permissions.ts):

- **Roles**: `ADMIN`, `MEMBER`, `GUEST`
- **Membership States**: `INVITED`, `ACTIVE`, `LEFT`, `SUSPENDED`
- **Role Permissions Map**:
  - `ADMIN`: `workspace.read`, `workspace.update`, `workspace.delete`, `membership.read`, `membership.invite`, `membership.change_role`, `preferences.update`
  - `MEMBER`: `workspace.read`, `membership.read`, `preferences.update`
  - `GUEST`: `workspace.read`, `preferences.update`

### 2.2 Workspace Lifecycle State Rules

- **Active**: Standard read/write access allowed based on role permissions.
- **Archived**: Blocks all operations unless endpoint explicitly permits archived workspaces (`archived: true`). When archived, updates with `lifecycle: 'restore'` and deletions are allowed; all other writes throw `HTTP 403 Forbidden` ([`workspace-authorization.service.ts:54`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/workspaces/application/workspace-authorization.service.ts#L54)).
- **Deleted**: Soft-deleted workspaces (`deletedAt != null`) reject all requests with `HTTP 403 Forbidden` (`"Workspace has been deleted"`).

---

## 3. Domain Invariants & Error Codes

1. **Email Uniqueness (`HTTP 409 Conflict`)**:
   - Registering an email that already exists throws `HTTP 409 Conflict` ([`authentication.service.ts:102`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/application/authentication.service.ts#L102)).
2. **Workspace Slug Canonical Format & Uniqueness (`HTTP 409 Conflict`)**:
   - Slug must match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (3–60 chars).
   - Collision with an existing slug throws `HTTP 409 Conflict` (`"Workspace slug already in use"`).
3. **Last Admin Protection (`HTTP 409 Conflict`)**:
   - An admin cannot leave the workspace or be demoted/removed if they are the sole remaining active `ADMIN` in the workspace ([`workspace.service.ts:245`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/workspaces/application/workspace.service.ts#L245)).
4. **Duplicate Membership & Invitation Guards (`HTTP 409 Conflict`)**:
   - Inviting an email that is already an active member throws `HTTP 409 Conflict`.
   - Inviting an email with an active pending invitation throws `HTTP 409 Conflict`.
5. **Token Validity & Single-Use (`HTTP 400 Bad Request` / `HTTP 404 Not Found`)**:
   - Expired or already consumed invitation, reset, verification, or magic link tokens throw `HTTP 400 Bad Request` or `HTTP 404 Not Found`.

---

## 4. Endpoint Table

| Method   | Path                                                        | Access                   | Idempotent   | Description                                                                         |
| :------- | :---------------------------------------------------------- | :----------------------- | :----------- | :---------------------------------------------------------------------------------- |
| `POST`   | `/api/v1/auth/signup`                                       | Public                   | No (exempt)  | Register new user account with email, password, and full name.                      |
| `POST`   | `/api/v1/auth/login`                                        | Public                   | No (exempt)  | Authenticate credentials; sets `tream_refresh` cookie on browser or returns tokens. |
| `POST`   | `/api/v1/auth/refresh`                                      | Public                   | No (exempt)  | Rotate refresh token; returns fresh access and refresh token pair.                  |
| `POST`   | `/api/v1/auth/logout`                                       | Authenticated            | No (exempt)  | Revoke current user session and clear refresh cookie.                               |
| `POST`   | `/api/v1/auth/logout-all`                                   | Authenticated            | No (exempt)  | Revoke all sessions for current user and clear refresh cookie.                      |
| `GET`    | `/api/v1/auth/sessions`                                     | Authenticated            | No           | List active sessions for authenticated user.                                        |
| `DELETE` | `/api/v1/auth/sessions/:id`                                 | Authenticated            | No (exempt)  | Revoke a specific session by ID.                                                    |
| `POST`   | `/api/v1/auth/password-recovery`                            | Public                   | No (exempt)  | Request password reset token sent via email.                                        |
| `POST`   | `/api/v1/auth/password-reset`                               | Public                   | No (exempt)  | Consume reset token and set new password (min 12 chars).                            |
| `POST`   | `/api/v1/auth/email-verification/request`                   | Public                   | No (exempt)  | Request email verification token.                                                   |
| `POST`   | `/api/v1/auth/email-verification/confirm`                   | Public                   | No (exempt)  | Confirm email address using verification token.                                     |
| `POST`   | `/api/v1/auth/magic-link/request`                           | Public                   | No (exempt)  | Request magic link login token sent via email.                                      |
| `POST`   | `/api/v1/auth/magic-link/consume`                           | Public                   | No (exempt)  | Exchange magic link token for session.                                              |
| `GET`    | `/api/v1/me`                                                | Authenticated            | No           | Retrieve authenticated user profile and identity.                                   |
| `PATCH`  | `/api/v1/me`                                                | Authenticated            | No (exempt)  | Update user profile (`fullName`).                                                   |
| `GET`    | `/api/v1/workspaces`                                        | Authenticated            | No           | List workspaces accessible to current user (cursor pagination).                     |
| `POST`   | `/api/v1/workspaces`                                        | Authenticated            | Yes (Header) | Create new workspace; caller becomes initial `ADMIN`.                               |
| `GET`    | `/api/v1/workspaces/active`                                 | Authenticated            | No           | Retrieve the currently active workspace for user.                                   |
| `POST`   | `/api/v1/workspaces/invitations/accept`                     | Authenticated            | Yes (Header) | Accept an invitation token to join a workspace.                                     |
| `GET`    | `/api/v1/workspaces/:workspaceId`                           | `workspace.read`         | No           | Get workspace profile by UUID.                                                      |
| `PATCH`  | `/api/v1/workspaces/:workspaceId`                           | `workspace.update`       | Yes (Header) | Update workspace name or trigger archive/restore lifecycle.                         |
| `DELETE` | `/api/v1/workspaces/:workspaceId`                           | `workspace.delete`       | Yes (Header) | Soft-delete a workspace.                                                            |
| `POST`   | `/api/v1/workspaces/:workspaceId/select`                    | `workspace.read`         | Yes (Header) | Set workspace as active for current session.                                        |
| `POST`   | `/api/v1/workspaces/:workspaceId/leave`                     | `workspace.read`         | Yes (Header) | Leave workspace. Protects last active admin.                                        |
| `GET`    | `/api/v1/workspaces/:workspaceId/members`                   | `membership.read`        | No           | List active members of workspace with roles.                                        |
| `PATCH`  | `/api/v1/workspaces/:workspaceId/members/:membershipId`     | `membership.change_role` | Yes (Header) | Update a member's role or state. Protects last admin.                               |
| `DELETE` | `/api/v1/workspaces/:workspaceId/members/:membershipId`     | `membership.change_role` | Yes (Header) | Remove a member (`state = LEFT`). Protects last admin.                              |
| `GET`    | `/api/v1/workspaces/:workspaceId/invitations`               | `membership.invite`      | No           | List pending invitations for workspace.                                             |
| `POST`   | `/api/v1/workspaces/:workspaceId/invitations`               | `membership.invite`      | Yes (Header) | Send workspace invitation to an email.                                              |
| `DELETE` | `/api/v1/workspaces/:workspaceId/invitations/:invitationId` | `membership.invite`      | Yes (Header) | Revoke pending invitation.                                                          |
| `GET`    | `/api/v1/workspaces/:workspaceId/preferences`               | `preferences.update`     | No           | Retrieve user's personal preferences for workspace.                                 |
| `PATCH`  | `/api/v1/workspaces/:workspaceId/preferences`               | `preferences.update`     | Yes (Header) | Update theme (`system`, `light`, `dark`) and timezone.                              |

---

## 5. Per Endpoint Details

### 5.1 POST `/api/v1/auth/signup`

- **Body (`SignupDto`)**:
  - `email`: string, `@IsEmail()`, `@MaxLength(254)`
  - `password`: string, `@IsString()`, `@MinLength(12)`, `@MaxLength(256)`
  - `fullName`: string, `@IsString()`, `@MinLength(1)`, `@MaxLength(120)`
- **Response (`201 Created`)**:
  ```json
  {
    "data": {
      "user": {
        "id": "u-1",
        "email": "dev@example.com",
        "fullName": "Jane Doe"
      },
      "accessToken": "ey...",
      "refreshToken": "ey..."
    }
  }
  ```
- **Errors**: `409 Conflict` (email taken), `429 Too Many Requests` (rate limited).

### 5.2 POST `/api/v1/auth/login`

- **Body (`LoginDto`)**:
  - `email`: string, `@IsEmail()`, `@MaxLength(254)`
  - `password`: string, `@IsString()`, `@MinLength(1)`, `@MaxLength(256)`
- **Response (`200 OK`)**: Returns user, `accessToken`, and `refreshToken` (if non-browser request; browser sets `tream_refresh` HttpOnly cookie).
- **Errors**: `401 Unauthorized` (invalid credentials), `429 Too Many Requests`.

### 5.3 POST `/api/v1/workspaces`

- **Headers**: `Idempotency-Key: <UUID-v4>`
- **Body (`CreateWorkspaceDto`)**:
  - `name`: string, trimmed, `@Length(1, 100)`
  - `slug`: string, `@Length(3, 60)`, `@Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)`
- **Response (`201 Created`)**:
  ```json
  {
    "data": {
      "id": "ws-123",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "createdAt": "2026-10-05T20:00:00.000Z"
    }
  }
  ```
- **Errors**: `409 Conflict` (slug taken), `400 Bad Request` (validation/idempotency failure).

---

## 6. Cross-Module Dependencies

1. **Tenancy Root**: All other modules depend on `workspaces.id` and validate membership/permissions via `WorkspaceAuthorizationService`.
2. **User Identity**: All modules reference `users.id` for `createdById`, `assigneeId`, `actorId`.
3. **Session Context**: Active workspace selection stored per session affects default workspace routing in web app.

---

## 7. Open Questions

- None. Controllers and application services fully inspected and verified against source.
