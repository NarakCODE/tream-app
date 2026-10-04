# Resend email delivery

Verification emails after registration and unverified login, password recovery,
magic links, and workspace invitations use the existing encrypted mail outbox.
`MAIL_PROVIDER=resend` selects the Resend HTTP API sender. `smtp` remains available
for local Mailpit testing. No frontend API key or new SDK dependency is needed.

## Configure

Create a sending API key in [Resend](https://resend.com/api-keys), and verify a
sender domain in [Domains](https://resend.com/domains). Keep the API key private.
Add these values to the ignored `apps/server/.env`:

```dotenv
RESEND_API_KEY=re_your_private_api_key
RESEND_FROM="Tream <no-reply@your-verified-domain.com>"
```

Run from the repository root:

```sh
node apps/server/scripts/resend-setup.mjs
```

Or use `pnpm --filter server mail:resend:setup`. With valid values, the command sets
`MAIL_PROVIDER=resend` and `BACKGROUND_WORKERS_ENABLED=true`, preserves other
credentials and encryption keys, and restricts `.env` permissions. If credentials
are missing, it adds empty placeholders and leaves the current provider unchanged.
Restart the API to load the configuration:

```sh
pnpm --filter server dev
```

`MAGIC_LINK_BASE_URL` must point to the web application users open for verification
(currently `http://localhost:3000` locally). Hosted applications use their public
HTTPS URL. Production instances that only serve API traffic may disable workers;
designated worker instances must enable them to dispatch the outbox.

Resend's `onboarding@resend.dev` test sender can only email the address associated
with the Resend account. To verify arbitrary registered users, use your verified
domain, not the testing domain. Production configuration rejects that testing
domain. See [Resend's sender restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Check delivery

Register or attempt to log in with the correct password as an unverified account, then open its verification email. Signup returns a pending verification message; unverified login returns `403 EMAIL_NOT_VERIFIED`. Neither creates an authenticated session. After confirming the email, sign in again.
The web client shows the separate email verification step before workspace setup.
Use Resend's email dashboard to inspect acceptance and delivery. An outbox `SENT`
state means Resend accepted the request; it does not prove inbox delivery.

Each outbox row supplies a stable Resend idempotency key so a retry after an
uncertain response or failed database acknowledgement does not send another copy
within Resend's 24-hour idempotency window. Provider errors remain retryable in the
outbox, without recording credentials or token-bearing provider response bodies.
See the [send API](https://resend.com/docs/api-reference/emails/send-email) and
[idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Validation

Provider tests mock HTTP requests and never send real emails. Run from the root:

```sh
pnpm --filter server test --runTestsByPath src/modules/iam/authentication/infrastructure/resend-auth.mail.spec.ts src/modules/iam/authentication/infrastructure/auth-mail-outbox.spec.ts src/config/env.validation.spec.ts src/modules/iam/authentication/application/authentication.service.spec.ts
node --test apps/server/scripts/resend-setup.test.mjs
```
