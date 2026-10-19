# Deploy email delivery with Inngest — v0.8.0

This release contains the complete integration. No Render worker is needed when EMAIL_DELIVERY_MODE=inngest. The website and email execution run on Vercel; Inngest coordinates events, retries, and schedules; Neon holds encrypted jobs; Resend sends mail.

## Production setup

1. Merge this source into your repository, preserving your own .env and any custom changes. Run `npm ci`. No new database migration is required from 0.7.1 (older installations still need the existing migrations).
2. In Inngest, select the Production environment. Create/copy its Event Key and Signing Key.
3. In Vercel's Production environment set:

```
EMAIL_DELIVERY_MODE=inngest
INNGEST_EVENT_KEY=<production event key>
INNGEST_SIGNING_KEY=<production signing key>
INNGEST_DEV=0
DATABASE_URL=<same production Neon connection>
APP_ENCRYPTION_KEY=<existing unchanged encryption key>
RESEND_API_KEY=<working sending key>
EMAIL_FROM=<verified sender>
APP_ORIGIN=https://your-production-domain
```

Keep all other existing app settings, including BETTER_AUTH_SECRET. Do not expose any key with NEXT_PUBLIC_. Paste raw values, not surrounding quotes. Keep Neon TLS settings. Never regenerate APP_ENCRYPTION_KEY when upgrading: old jobs need it. Do not set INNGEST_DEV=1 in production; this release rejects that configuration.

4. Commit package.json, package-lock.json, src, scripts and docs; push to Vercel. Wait for the new deployment. The API route is `/api/inngest`; it requires Node and declares maxDuration=60. Ensure your Vercel runtime supports that duration. Do not use Edge runtime for these functions.
5. In Inngest Production -> Apps -> Sync new app, enter `https://your-production-domain/api/inngest`. Alternatively connect the official Vercel integration for automatic syncing; confirm it uses the same Production keys.
6. Confirm three functions appear:
   - `send-queued-email` — event-triggered, immediate auth/invitation delivery.
   - `recover-email-queue` — every 5 minutes, dispatches up to 100 due/abandoned jobs per run.
   - `schedule-reminder-emails` — every 15 minutes; visits all opted-in recipients in separate bounded steps and dispatches due jobs. Quiet hours and access revocation remain enforced.
7. If sync is blocked by deployment protection, configure a supported automation bypass for Inngest or use your reachable production deployment. Do not disable SDK signature checks. The endpoint must not redirect to your app's login screen.
8. Stop any old persistent mail worker. Stop local npm run dev when testing production. Request a fresh verification email on the deployed website. Inspect Inngest event/function runs, then Resend acceptance and inbox arrival. Test password-reset and invitation flows with accounts you control. A successful function run alone does not guarantee inbox delivery; inspect its returned status.
9. Resync after function-definition changes, unless automatic deployment sync is enabled. Monitor Inngest usage, failures, Resend failures and `npm run email:status` (against the intended database).

## Expected timing and safety

New auth/invitation jobs publish an event after the database commit. Events and durable step outputs contain job IDs/statuses, not decrypted email content, recipients or verification tokens. If publishing fails the app preserves the job, logs `email.event_publish_failed`, and recovery finds it within the next scheduled sweep, subject to service availability/backlog. Already pending jobs are also recovered after syncing. Recovery does not retry terminal failed jobs automatically.

Delivery uses atomic database claims, 120-second leases, fencing and the stable Resend idempotency key `email/<job-id>`. Duplicate events and replayed steps cannot claim a currently leased or sent job. Provider/network transient failures retain their retry time and use durable sleep, at most five provider attempts per job; infrastructure steps have three Inngest retries. Delayed jobs can fall back to recovery. This is at-least-once orchestration with provider deduplication, not a universal exactly-once inbox guarantee.

Verification/password-reset jobs older than 55 minutes expire without provider submission, leaving a safety margin before the one-hour token expiry. Old verification emails already sent cannot be recalled. Ask for a fresh link. Other queued messages retain the existing 12-hour delivery window. Failed provider configuration requires fixing settings and requesting a new email, not repeatedly replaying terminal failed jobs.

The recovery schedule depends on Inngest, not Vercel Hobby cron. It is not necessary to create vercel.json cron entries. Free quotas cover executions/steps, not just emails. Empty schedules still use quota; each reminder recipient page and each retry also uses it. Monitor both Inngest and Vercel usage; no promise of unlimited free service is made. The scheduler is intentionally every 15 minutes to reduce idle executions. In a large queue, more than 100 due messages can require subsequent recovery sweeps. A paused/exhausted Inngest plan cannot deliver until resumed.

## Local development

Default existing workflow:

```
EMAIL_DELIVERY_MODE=worker
```

Run `npm run dev` to start the website and standalone worker. Use a separate development Neon branch.

To test Inngest locally instead:

```
EMAIL_DELIVERY_MODE=inngest
INNGEST_DEV=1
```

Run `npm run dev:web`, then the Inngest CLI dev server (`npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`) in another terminal. Use test data and your own recipient. The local Inngest dashboard is normally http://localhost:8288. Do not use the production database/keys for casual local testing. npm run dev detects Inngest mode and does not launch the standalone worker; worker:email explicitly refuses to run in that mode.

## Troubleshooting

- Endpoint 404: wrong deployment or source not deployed; the file must be src/app/api/inngest/route.ts.
- Endpoint 503 INNGEST_CONFIGURATION_REQUIRED: missing signing key or dev mode enabled in production. Save settings and redeploy.
- Sync 401/403: check signing key/environment and deployment protection; do not bypass verification.
- No event after signup: verify EMAIL_DELIVERY_MODE=inngest, Event Key, current deployment and logs. Queue recovery still requires a synced app.
- EMAIL_DATABASE_UNAVAILABLE / REMINDER_SCHEDULER_UNAVAILABLE: Neon connectivity, TLS, migrations or database access; raw errors are deliberately not placed in Inngest step output.
- EMAIL_DECRYPT_OR_PAYLOAD_FAILED: encryption key mismatch or corrupt job. Preserve the existing key and request a fresh message after correcting configuration.
- Provider errors: inspect Resend sender/domain/key restrictions. Terminal failures require a fresh request after fixing settings.
- Status sent: Resend accepted; inspect provider delivery/bounce status separately.
- Expired: request a new verification/reset link.

## Files

src/inngest/client.ts, src/inngest/functions.ts, src/app/api/inngest/route.ts, src/server/email-events.ts and src/server/email-jobs.ts implement the integration. Auth and invitation producers publish after commit; reminders share their existing permission-aware scheduling service. The standalone worker uses the same processor.

Live Inngest account sync, Vercel execution and real Resend delivery must be verified after deployment. Automated tests use synthetic messages and mocked provider calls; no real email was sent during development.
