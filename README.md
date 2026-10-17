# মনে থাকবে — Foundation implementation

A runnable **Next.js 16 / React / strict TypeScript** application for the first implementation slice of the family asset platform. Neon PostgreSQL is the production source of truth. No browser-local database, fake balances or simulated provider connections are used.

**Release:** 0.1.2 — foundation and core record workflows. This is not the complete master specification or a production-security certification.

## Implemented

- Better Auth email/password registration, mandatory email verification, sign-in/out, password reset and database-backed session revocation.
- Explicit same-origin checks for authentication and application mutations; database-backed authentication throttling.
- Multi-family workspaces; owner creation; six role names; active/expired/revoked membership checks.
- Owner-issued, email-bound, one-use invitations; 48-hour invitation expiry; 30-day adviser access.
- Per-record view/edit/export grants and denies, family isolation and immediate membership revocation checks.
- All 131 catalog types, with English and Bengali names; no user/demo assets seeded.
- Asset creation, name/notes editing, append-only valuations, archive/restore, ownership-adjusted totals.
- Separate basic liability records with the family's included outstanding balance and its as-of date.
- BDT exact-decimal calculations, missing-value states, permission-filtered dashboard and category counts.
- Search/filtering, family switching, responsive layout, English/Bengali primary UI, Simple/Advanced preferences.
- Authorized JSON current-record export and audit entries for mutations/exports.
- Transactional idempotency for record creation, edits, valuation and archive/restore; optimistic record versions.
- Durable encrypted email queue and a Resend worker with bounded retries, job leases, fencing and idempotency keys.
- Drizzle schema, generated SQL migration, versioned catalog seed, meaningful PostgreSQL-engine integration tests and authentication tests.

## Prerequisites

- Node.js 24 LTS (the development build was checked on Node 24.19).
- npm and a Neon PostgreSQL project.
- A Resend account with a verified sender/domain, for account verification and invitations.
- A host capable of running a Next.js Node server and a persistent email worker.

## Local setup

1. Extract this folder and open a terminal here.
2. Run `npm ci` to install the pinned lockfile.
3. Copy `.env.example` to `.env` and fill its values. Keep `APP_ORIGIN` exactly equal to the browser origin, without a trailing slash.
4. In Neon, use a development branch first. Put its pooled connection string in `DATABASE_URL` and a direct migration connection in `DATABASE_MIGRATION_URL`. Keep the provided TLS options. Do not disable certificate verification.
5. Generate independent authentication and encryption secrets using the commands in `.env.example`. Store them securely. Never paste them into chat or commit them.
6. Configure `RESEND_API_KEY` and `EMAIL_FROM` with your verified sender.
7. Run `npm run db:migrate` then `npm run db:seed`.
8. Run `npm run dev`. It starts both the Next.js web app and the email worker.
9. Wait for `email.worker.ready` in the terminal. Restart the whole command after changing email/environment settings.
10. Open `http://localhost:3000`, create an account, verify its email, sign in, create a family and add the first asset.

The configuration screen checks whether required values exist. It does not claim database connectivity, completed migrations or working delivery. Missing required configuration does not expose a mock authenticated dashboard.

### First successful workflow

Create an asset with its **whole-asset** estimated value and the family's included economic share. The dashboard applies that percentage exactly once. Leave the value empty when unknown. Enter a liability using the family's included outstanding balance; it is deducted directly. Only BDT is accepted in this release.

To share a record, invite a member and wait for acceptance. Open the record as owner and grant **View**, then separately **Edit** or **Export** if needed. An explicit View deny hides the record and blocks other actions. A read-only member sees no records until granted access. Asset authors receive explicit view/edit grants at creation.

### Useful commands

| Command                          | Purpose                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                    | Local web app + email worker                                    |
| `npm run typecheck`              | Strict TypeScript validation                                |
| `npm test`                       | Unit/integration/authentication checks using synthetic data |
| `npm run build`                  | Production build                                            |
| `npm start`                      | Run built Next.js app                                       |
| `npm run db:migrate`             | Apply tracked migrations once through Drizzle's journal     |
| `npm run db:seed`                | Idempotent version-1 catalog seed                           |
| `npm run worker:email`           | Persistent mail worker                                      |
| `npm run worker:email -- --once` | Process at most one available message, then exit            |

Do not run `db:generate` on the deployed server. It is a developer command for creating reviewed future migrations. Never replace a migration already applied to a database.

## Deployment

1. Provision staging first and set the environment variables in the host's server-side secret manager.
2. Use an HTTPS `APP_ORIGIN` in production. Reverse-proxy HTTPS correctly and restrict any forwarded client-IP headers to the trusted proxy so rate limits cannot be spoofed.
3. Install with `npm ci`; run typecheck, tests and `npm run build`.
4. Run migrations/seeding using the dedicated migration credential, once per release.
5. Start `npm start` for the web process and `npm run worker:email` as a separate supervised process. Restart failed workers; do not run an endless worker inside a request handler.
6. Verify registration/email delivery, sign-in, family creation and a synthetic asset on staging. Confirm cross-family denial using another test account.
7. Configure backups, runtime monitoring and appropriate database privileges before storing real family data. The current application must not use the migration owner's privileges in production.
8. Complete the remaining release gates in `docs/STATUS.md` before treating this as production-ready.

The package is not deployed and contains no Neon, email or hosting credentials. Hosting was not substituted with a different database or framework.

## Structure

- `src/app`: server routes, account/setup pages and app entry point.
- `src/components`: responsive user interface, accessible native dialogs and forms.
- `src/server`: authorization-enforced services, authentication, safe HTTP boundary and encryption.
- `src/db`: typed schema, lazy PostgreSQL pool and catalog seeding.
- `drizzle`: executable migration and migration metadata.
- `seed`: bilingual versioned catalog.
- `scripts`: migration, seed and email-worker entry points.
- `tests`: PGlite PostgreSQL-engine tests and auth handler tests.
- `docs`: feature status, API surface, operational limitations and implementation handoff.

The test database is PGlite, running the tracked PostgreSQL schema against synthetic data. The deployed application uses `pg` + Drizzle against Neon. Passing PGlite tests does not verify Neon networking, pooling, production concurrency or a live email service.

## Known boundaries

Read `docs/STATUS.md` before deployment. AI, document uploads, Drive, reminders, repayments, custom roles/categories/fields, full ownership histories, multi-currency, PDF/CSV reports, full backup/restore and production observability are not implemented yet. No controls pretend to provide these capabilities.

The UI translates the main workflows and catalog; auth-provider messages, role names and some validation/detail labels remain English. Full WCAG conformance and browser interaction testing remain outstanding. Simple/Advanced currently controls extra identifiers/version details; it is not yet the full advanced-workflow suite.

## References

Implementation consulted official [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next), [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), [Drizzle Neon integration](https://orm.drizzle.team/docs/connect-neon) and [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email).

## Authentication email fix (0.1.1)

See `docs/EMAIL-FIX.md` for upgrade instructions, queue diagnostics and delivery-error explanations. `npm run dev:web` runs only Next.js; `npm run email:status` inspects safe queue status. Production still uses a separately supervised worker.

Version 0.1.2 classifies Resend 403 errors using allowlisted diagnostic codes and shows the effective sender domain in worker startup/status output. Raw provider messages, API keys and verification links are not logged.
