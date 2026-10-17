# Verification email fix — 0.1.1

## What the reported logs mean

- A 403 on `/api/auth/sign-in/email` is consistent with an unverified email, but the status alone is not conclusive: an incorrect Origin can also be rejected. The response code/message distinguishes them.
- A 200 on `/api/auth/send-verification-email` is not proof of inbox delivery. For an eligible account, the app queues encrypted mail; a worker must submit it to Resend. The endpoint can also return a generic response for an ineligible email to avoid exposing account existence.
- The shown PostgreSQL SSL warning is not itself a delivery error. Do not disable TLS or certificate verification to fix mail. If a connection actually fails, inspect that separate error and the worker startup status.
- This is email/password authentication with verification links, not an OTP email for every login. Already-verified accounts normally sign in without receiving an email.

## Changes

1. Enable `emailVerification.sendOnSignIn` so a correct-password attempt on an unverified account queues a new verification link.
2. `npm run dev` starts both Next.js and the email worker. `npm run dev:web` retains the old web-only behavior.
3. Worker/status scripts load environment files with the same precedence as Next.js, including `.env.local`.
4. Show explicit startup, provider acceptance and safe classified failure events. Preserve the failure code in `email_jobs.last_error`.
5. Classify permanent vs temporary Resend errors and honor Retry-After.
6. Expire old queued messages before sending, and add a read-only queue diagnostic command.

## Upgrade an existing installation

1. Stop the old web process and any old email worker.
2. Replace application source/package files with this release, **keeping your existing `.env` / `.env.local` and database**. No new database migration is needed for this patch. Do not regenerate `APP_ENCRYPTION_KEY`: pending messages depend on the existing key.
3. Run:

```bash
npm ci
npm run dev
```

4. Wait for `email.worker.ready`. If you see `email.worker.configuration_error` or `email.worker.database_error`, fix the named configuration/connection issue first.
5. On `/auth`, use **Resend verification email** once, or sign in with the correct password on an unverified account.
6. Check the terminal for `email.provider_accepted`, then check your inbox and spam folder. Provider acceptance does not guarantee final delivery; check the Resend delivery dashboard for bounce or suppression events if necessary.
7. In another terminal, run:

```bash
npm run email:status
```

This prints settings presence, aggregate job states, and recent job IDs/status/error codes. It does not print API keys, addresses, encrypted payloads, or verification links.

### If retaining the previous web-only startup

Run these in two terminals:

```bash
npm run dev:web
```

```bash
npm run worker:email
```

Production still needs both `npm start` and a separately supervised `npm run worker:email`. Restart both after changing credentials or email settings; Next's `.env` reload does not reload a running worker.

## Diagnose the result

| Evidence                           | Meaning / next step                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`, attempts `0`            | Usually no worker has picked up the message. Start the worker and check startup output.                                                                                 |
| `RESEND_HTTP_401`                  | Check the API key in the worker's effective environment.                                                                                                                |
| `RESEND_HTTP_403`                  | Check API-key permission, sender-domain verification and any restrictions on test recipients.                                                                           |
| `RESEND_HTTP_400` / `422`          | Check `EMAIL_FROM` and provider configuration.                                                                                                                          |
| `RESEND_HTTP_429`                  | Provider throttled the request; a delayed retry is scheduled.                                                                                                           |
| `EMAIL_NETWORK_OR_TIMEOUT`         | Worker cannot reach the provider or request timed out.                                                                                                                  |
| `EMAIL_DECRYPT_OR_PAYLOAD_FAILED`  | Web app and worker may have different encryption keys, or queued data was created under an older key. Restore the correct key and request a fresh verification message. |
| `sent` / `email.provider_accepted` | Resend accepted the API request. Check delivery events/spam if no mail arrives.                                                                                         |
| No recent job                      | Check account eligibility, address entry, response body, and whether status tool/web process use the same database.                                                     |

After correcting a permanent failure, request a new verification email rather than blindly replaying an expired token. Do not edit `email_verified` in the database to bypass verification.

For development, `APP_ORIGIN` must match the actual origin you visit (for example `http://localhost:3000`, without a trailing slash). `127.0.0.1`, a different port, and `localhost` are different origins.

Official references: [Better Auth email verification](https://better-auth.com/docs/concepts/email), [Resend errors](https://resend.com/docs/api-reference/errors).

## Verified and unverified

TypeScript check, 33 automated tests and production build pass. Email adapter tests use synthetic data and mocked transport. Actual Resend delivery, your Neon connection and inbox delivery could not be checked from this workspace.

## Verified domain but still HTTP 403 (0.1.2)

A domain marked Verified in the dashboard does not show which sender or API key the running worker is using. Version 0.1.2 prints the effective sender domain at `email.worker.ready` and in `npm run email:status`.

For the domain shown in the supplied screenshot, configure:

```env
EMAIL_FROM="Mone Thakbe <noreply@monethakbe.online>"
```

Check `.env.local`, `.env.development.local`, `.env.development`, and exported shell variables as well as `.env`. A higher-priority setting can keep an old sender/key active. Restart both processes after editing. API keys must belong to the Resend account/team with access to the verified domain; Sending access can be scoped to a domain, so check that scope too.

New safe failure codes:

| Code                               | Action                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `RESEND_SENDER_DOMAIN_UNVERIFIED`  | Compare the effective sender domain with the verified domain in the key's account/team.    |
| `RESEND_TEST_RECIPIENT_RESTRICTED` | Stop using the test sender; use your verified sender domain.                               |
| `RESEND_KEY_INACTIVE`              | Configure an active sending key.                                                           |
| `RESEND_KEY_SUSPENDED`             | Review account/key suspension with Resend support.                                         |
| `RESEND_KEY_PERMISSION_DENIED`     | Check key sending permission and allowed domain.                                           |
| `RESEND_HTTP_403`                  | Provider response is unrecognized; inspect the failed API request in the Resend dashboard. |

These codes classify the provider response; they do not bypass provider restrictions. After correcting configuration, request a new verification message. The old failed job is not automatically retried.

Upgrade with the v0.1.2 source while preserving existing environment files, encryption key and database. Run `npm ci`, then `npm run dev`. No database migration is required for this patch.

Official API-key domain permissions: https://resend.com/changelog/new-api-key-permissions
