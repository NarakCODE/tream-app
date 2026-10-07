# Authentication & Profile API Reference

For the authenticated setup decision and persisted welcome completion, see
[Bootstrap and onboarding API](./onboarding-api.md).

API definition and architectural summary for the NestJS [`AuthenticationModule`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication.module.ts#L27), covering authentication endpoints (`/api/v1/auth`) and user profile management (`/api/v1/me`).

---

## 1. Overview & Architecture

The [`AuthenticationModule`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication.module.ts#L27) encapsulates user identity, credential verification, JWT issuance, session lifecycle management, and user profile management.

### Key Components

- **Controllers**:
  - [`AuthenticationController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.controller.ts#L34): Handles registration, login, token refresh, session revocation, recovery, email verification, and passwordless magic links.
  - [`ProfileController`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.controller.ts#L217): Handles reading and updating user profile information.
- **Service**:
  - [`AuthenticationService`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/application/authentication.service.ts#L38): Core application service executing hashing, token generation, session persistence, throttling, and verification logic.
- **Providers & Dependencies**:
  - [`AuthenticationGuard`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.guard.ts#L15): Registered as global `APP_GUARD`.
  - `AUTH_REPOSITORY` bound to [`PostgresAuthRepository`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/infrastructure/postgres-auth.repository.ts#L1).
  - `AUTH_MAIL_SENDER` bound to [`SmtpMailSender`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/infrastructure/smtp-auth.mail.ts#L1).
- [`AuthMailOutbox`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/infrastructure/auth-mail-outbox.ts#L1): Outbox queue processor for transactional auth emails.
- `JwtModule`: Used for HS256 JWT access token signing and verification.

Authentication emails are queued transactionally. A server replica only dispatches the queue when `BACKGROUND_WORKERS_ENABLED=true`; production must enable it on designated worker replicas with SMTP configured.

---

## 2. Global Policies & Behaviors

### URL Routing & Versioning

- **Global Prefix**: `/api`
- **API Version**: `v1` (URI versioning)
- **Base Paths**: `/api/v1/auth` and `/api/v1/me`

### Guard & Authorization

- Every route requires a valid Bearer token (`Authorization: Bearer <accessToken>`) by default.
- Routes marked with `@Public()` bypass token validation.
- Access token claims: `{ sub: string (userId), sid: string (sessionId) }`.
- When verifying, the session and user are reloaded from the database; revoked sessions, disabled accounts, or unverified email addresses fail immediately.

### Idempotency & Rate Limiting

- Both controllers are decorated with `@SkipIdempotency()`.
- Public operations enforce abuse rate limiting through [`AuthenticationService.throttle()`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/application/authentication.service.ts#L44), limiting attempts per IP and per normalized email (returns `HTTP 429 Too Many Requests`).

### Browser Origin & Cookie Handling

- Both authentication and profile controllers check any supplied `Origin` header against configured `app.corsOrigin`. Untrusted origins receive `HTTP 401 Unauthorized`; requests without an `Origin` are allowed through this check.
- If an origin is present, `refreshToken` is written to an `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth` cookie named `tream_refresh` (with `Secure` in production) and removed from the response JSON body.
- Cookie-based refresh requires an allowed `Origin`; direct API clients without an `Origin` pass `refreshToken` in JSON and receive it in the response payload.

---

## 3. Endpoints Reference

### 3.1 Authentication Controller (`/api/v1/auth`)

| Method   | Endpoint                                  | Access    | Request Body                                                                                                                                                                 | Description                                                                                           |
| :------- | :---------------------------------------- | :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/v1/auth/signup`                     | Public    | [`SignupDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L14)                | Registers a pending account and dispatches verification email; no session or tokens are issued.       |
| `POST`   | `/api/v1/auth/login`                      | Public    | [`LoginDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L11)                 | Verifies credentials and email verification before establishing a new session.                        |
| `POST`   | `/api/v1/auth/refresh`                    | Public    | [`RefreshDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L21) _(or Cookie)_ | Rotates the refresh token (session family) and returns a new access/refresh token pair.               |
| `POST`   | `/api/v1/auth/logout`                     | Protected | None                                                                                                                                                                         | Revokes the current session and clears the `tream_refresh` cookie.                                    |
| `POST`   | `/api/v1/auth/logout-all`                 | Protected | None                                                                                                                                                                         | Revokes all active sessions for the authenticated user and clears the cookie.                         |
| `GET`    | `/api/v1/auth/sessions`                   | Protected | None                                                                                                                                                                         | Lists all active sessions for the authenticated user.                                                 |
| `DELETE` | `/api/v1/auth/sessions/:id`               | Protected | Path Param: `id`                                                                                                                                                             | Revokes the specified session ID.                                                                     |
| `POST`   | `/api/v1/auth/password-recovery`          | Public    | [`EmailDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L8)                  | Issues a single-use password reset link via outbox mail (generic response to avoid user enumeration). |
| `POST`   | `/api/v1/auth/password-reset`             | Public    | [`ResetDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L28)                 | Consumes password reset token and sets new password.                                                  |
| `POST`   | `/api/v1/auth/email-verification/request` | Public    | [`EmailDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L8)                  | Sends verification link to user's registered email.                                                   |
| `POST`   | `/api/v1/auth/email-verification/confirm` | Public    | [`TokenDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L18)                 | Verifies email address using the supplied token.                                                      |
| `POST`   | `/api/v1/auth/magic-link/request`         | Public    | [`EmailDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L8)                  | Sends passwordless login magic link.                                                                  |
| `POST`   | `/api/v1/auth/magic-link/consume`         | Public    | [`TokenDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L18)                 | Consumes magic link token and starts authenticated session.                                           |

Revoking the current session through `DELETE /api/v1/auth/sessions/:id` also clears its refresh cookie.

---

### 3.2 Profile Controller (`/api/v1/me`)

| Method  | Endpoint     | Access    | Request Body                                                                                                                                                   | Description                                                      |
| :------ | :----------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| `GET`   | `/api/v1/me` | Protected | None                                                                                                                                                           | Retrieves profile information for the authenticated user.        |
| `PATCH` | `/api/v1/me` | Protected | [`ProfileDto`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts#L31) | Updates the profile (e.g. `fullName`) of the authenticated user. |

---

## 4. Request DTO Definitions

Defined in [`authentication.dto.ts`](file:///Users/narak/Documents/narakcode/turbo-repo/tream-app/apps/server/src/modules/iam/authentication/presentation/authentication.dto.ts):

### `EmailDto`

```typescript
{
  email: string; // Valid email, max 254 characters
}
```

### `LoginDto` (extends `EmailDto`)

```typescript
{
  email: string; // Valid email, max 254 characters
  password: string; // 1 to 256 characters
}
```

### `SignupDto` (extends `EmailDto`)

```typescript
{
  email: string; // Valid email, max 254 characters
  password: string; // 12 to 256 characters
  fullName: string; // 1 to 120 characters
}
```

### `TokenDto`

```typescript
{
  token: string; // 32 to 256 characters (base64url)
}
```

### `RefreshDto`

```typescript
{
  refreshToken?: string; // Optional (32 to 256 characters) when cookie is used
}
```

### `ResetDto` (extends `TokenDto`)

```typescript
{
  token: string; // 32 to 256 characters
  password: string; // 12 to 256 characters
}
```

### `ProfileDto`

```typescript
{
  fullName: string; // 1 to 120 characters
}
```

---

## 5. Response Formats

Every successful response is wrapped as `{ "data": ..., "meta": { "requestId": "...", "timestamp": "..." } }` by the global response interceptor. The examples below show the contents of `data`.

### Signup Pending Verification

Signup returns `{ "data": { "message": "..." }, "meta": { "requestId": "...", "timestamp": "..." } }` and does not create a refresh session or set an authentication cookie. The user follows the verification email link and then signs in. Correct password credentials for an unverified account return `403` with error code `EMAIL_NOT_VERIFIED` and queue a verification email. Existing access and refresh tokens cannot authenticate an account whose email is unverified.

### Auth Token Success (Verified Login / Refresh / Magic Link)

When called by direct API clients:

```json
{
  "data": {
    "user": {
      "id": "c1f7a08b-...",
      "email": "user@example.com",
      "fullName": "Jane Doe",
      "avatarUrl": null,
      "emailVerified": true
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "w8yv...",
    "expiresIn": 900
  },
  "meta": {
    "requestId": "req_...",
    "timestamp": "2026-10-03T12:00:00.000Z"
  }
}
```

_Note: For browser origins, `refreshToken` is omitted from the JSON payload and set in the `tream_refresh` HttpOnly cookie._

### Profile Success (`GET /api/v1/me`)

```json
{
  "data": {
    "id": "c1f7a08b-...",
    "email": "user@example.com",
    "fullName": "Jane Doe",
    "avatarUrl": null,
    "emailVerified": true
  },
  "meta": {
    "requestId": "req_...",
    "timestamp": "2026-10-03T12:00:00.000Z"
  }
}
```

### Sessions List (`GET /api/v1/auth/sessions`)

```json
{
  "data": [
    {
      "id": "97e687fd-...",
      "expiresAt": "2026-10-17T12:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_...",
    "timestamp": "2026-10-03T12:00:00.000Z"
  }
}
```

### Generic Operation Acknowledgments

- Token consumption / verification returns `{ "data": { "message": "Token accepted" }, "meta": ... }`.
- Token requests (recovery / verification / magic link) return `{ "data": { "message": "If the account is eligible, an email will be sent." }, "meta": ... }`.
- Session revocation / Logout returns a `data.message` of `Logged out`, `All sessions revoked`, or `Session revoked`, plus `meta`.

### Errors

Errors use the global envelope `{ "error": { "code": "...", "message": "...", "details": null }, "meta": { "requestId": "...", "timestamp": "..." } }`. Validation failures return `400`, invalid credentials or tokens return `401`, unverified password login returns `403` (`EMAIL_NOT_VERIFIED`), duplicate signup email returns `409`, and throttled public operations return `429`.
