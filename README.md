# মনে থাকবে — Foundation implementation

A runnable **Next.js 16 / React / strict TypeScript** application for the first implementation slice of the family asset platform. Neon PostgreSQL is the production source of truth. No browser-local database, fake balances or simulated provider connections are used.

**Release:** 0.11.0 — foundation and core record workflows. This is not the complete master specification or a production-security certification.

## Implemented

- Owner-controlled member role changes, confirmation, expiry preservation and auditable old/new roles. See docs/MEMBER-ROLES.md.

- Private scanned document uploads, retained file versions, metadata/history, archive/restore and permission-checked downloads; optional storage/scanner setup.

- Better Auth email/password registration, mandatory email verification, sign-in/out, password reset and database-backed session revocation.
- Explicit same-origin checks for authentication and application mutations; database-backed authentication throttling.
- Multi-family workspaces; owner creation; six role names; active/expired/revoked membership checks.
- Owner-issued, email-bound, one-use invitations; 48-hour invitation expiry; 30-day adviser access.
- Per-record view/edit/export grants and denies, family isolation and immediate membership revocation checks.
- All 131 catalog types, with English and Bengali names; optional validated category-specific fields for all 14 categories.
- Co-owner, beneficiary, manager and possessor records; separate legal/economic shares, dated family-share updates and revision history.
- Asset creation, name/notes editing, append-only valuations, archive/restore, ownership-adjusted totals.
- Liability repayments with separate principal, interest and fees, exact outstanding balances, append-only payment corrections and record-level financial history.
- BDT exact-decimal calculations, missing-value states, permission-filtered dashboard and category counts.
- Search/filtering, family switching, responsive layout, English/Bengali primary UI, Simple/Advanced preferences.
- Authorized JSON current-record export including category details and current ownership; audit entries for mutations/exports.
- Transactional idempotency for record creation, edits, valuation, repayments and archive/restore; optimistic record versions.
- Record-linked in-app reminders with due/overdue views, recurrence, completion, cancellation, reopening and history.
- Durable encrypted email queue and a Resend worker with bounded retries, job leases, fencing and idempotency keys.
- Drizzle schema, generated SQL migration, versioned catalog seed, meaningful PostgreSQL-engine integration tests and authentication tests.

## Prerequisites

- Node.js 24 LTS (the development build was checked on Node 24.19).
- npm and a Neon PostgreSQL project.
- A Resend account with a verified sender/domain, for account verification and invitations.
- A Next.js Node host, plus either the Inngest integration (Vercel) or a persistent email worker.

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
| `npm run dev`                    | Local web app + email worker                                |
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

Read `docs/STATUS.md` before deployment. AI, Drive, push reminder delivery, custom roles/categories/fields, historical net-worth reports, multi-currency, server-generated PDF reports, full backup/restore and production observability are not implemented yet. No controls pretend to provide these capabilities.

The UI translates the main workflows and catalog; auth-provider messages, role names and some validation/detail labels remain English. Full WCAG conformance and browser interaction testing remain outstanding. Simple/Advanced currently controls extra identifiers/version details; it is not yet the full advanced-workflow suite.

## References

Implementation consulted official [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next), [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), [Drizzle Neon integration](https://orm.drizzle.team/docs/connect-neon) and [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email).

## Authentication email fix (0.1.1)

See `docs/EMAIL-FIX.md` for upgrade instructions, queue diagnostics and delivery-error explanations. `npm run dev:web` runs only Next.js; `npm run email:status` inspects safe queue status. Production still uses a separately supervised worker.

Version 0.1.2 classifies Resend 403 errors using allowlisted diagnostic codes and shows the effective sender domain in worker startup/status output. Raw provider messages, API keys and verification links are not logged.

## Upgrade from 0.1.2

See [docs/UPGRADE-0.2.md](docs/UPGRADE-0.2.md). This release requires the new tracked database migration before starting the app. Keep your existing environment files and secrets.

## Version 0.2.1 — home and authentication UI

The public `/` route now shows the Bengali family-first home page. `/app` remains the workspace and `/auth` retains the configuration checks. Sign-in, sign-up and reset-password forms have keyboard-accessible Show/Hide controls. Home-page registration links open `/auth?mode=signup`. No database migration is added in 0.2.1; upgrading from 0.1.x still requires the 0.2.0 migration.

## Upgrade to 0.3.0

See [docs/UPGRADE-0.3.md](docs/UPGRADE-0.3.md). Apply the additive migration before starting the new app. It preserves current records and creates baseline detail/ownership history without inventing historical ownership dates.

## Upgrade to 0.4.0

See [docs/UPGRADE-0.4.md](docs/UPGRADE-0.4.md). Apply migration 0003 before starting the app. This release adds in-app reminders and full-payment reversals; email/push reminder delivery is not enabled.

## Upgrade to 0.5.0

See [docs/UPGRADE-0.5.md](docs/UPGRADE-0.5.md). Migration 0004 adds private document metadata, file versions and event history. Record forms support upload, replacement, metadata search/edit, archive/restore, image preview and authenticated download. A private S3-compatible bucket and ClamAV are required to enable uploads; existing features work without them. Setup, permissions, limits and cleanup are documented in [docs/DOCUMENTS.md](docs/DOCUMENTS.md).

## Upgrade to 0.5.1 — branding, email and installation

The supplied logo appears across public/auth/workspace/setup pages and browser/home-screen icons. Verification, password-reset and invitation emails now include branded HTML plus plain text, action-specific guidance and expiry information. Existing queued plain-text jobs remain compatible.

Android and iPhone/iPad installation help is available at the bottom of every page. Supported browsers can show the native install prompt; Safari users can add the app through Share → Add to Home Screen. This is an installable web app, with online access required for records; it does not include native store packages or push notifications. See [docs/INSTALLATION.md](docs/INSTALLATION.md).

Keep your environment files and secrets, run `npm ci`, then restart both web and email-worker processes. For production, run `npm run build` before restarting. No new database migration is added in 0.5.1; users upgrading from older releases must still apply existing migrations. Old queued emails keep their original content.

## Upgrade to 0.6.0

Apply migration 0005, then restart the web app and email worker. Open Settings → Email reminders to opt in separately for each family. Choose reminder categories, advance notice, preferred time, time zone and quiet hours. Personal delivery history shows queue/provider status. The same worker now schedules and delivers reminders; no additional daemon is required.

See [docs/UPGRADE-0.6.md](docs/UPGRADE-0.6.md) and [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md). The worker requires APP_ORIGIN as well as its existing settings. Reminder emails contain generic sign-in links rather than private record details. No member is subscribed by the migration.

## Upgrade to 0.7.0 — themes and current-record reports

Use the persistent **Theme** selector to choose Light, Dark or System on any page. The choice is saved on this browser, follows operating-system changes in System mode, and works without signing in.

Open **Settings → Reports and CSV** to generate an export-authorized current summary, filter by kind/category, optionally include archived rows, download CSV, or print/save PDF through the browser. Reports recompute exact totals from eligible filtered rows; they do not expose view-only records. Unknown values remain unknown and archived records stay out of totals.

Run `npm ci` and restart the app. For production, rebuild before restarting. No new database migration is required from 0.6.0; older releases still need their tracked migrations. Keep environment files and secrets. See [docs/THEMES-AND-REPORTS.md](docs/THEMES-AND-REPORTS.md).

## Upgrade to 0.7.1 — mobile layouts

Responsive Android/iOS browser and installed PWA layouts, safe-area spacing, mobile drawer focus management, readable controls, adaptive dialogs and keyboard-accessible scrolling tables. Includes the recent theme logos and document fixes. Preserve your .env, run npm ci, then build and restart. No new database migration from 0.7.0. See docs/MOBILE.md for device checks and limitations.

## Upgrade to 0.8.0 — Inngest email delivery

Complete Vercel/Inngest setup is in [docs/INNGEST.md](docs/INNGEST.md). Set EMAIL_DELIVERY_MODE=inngest plus the production Inngest keys, deploy, and sync /api/inngest. Immediate events, durable retries, queue recovery and reminder scheduling replace the persistent worker. Existing local worker mode remains supported. No new database migration from 0.7.1.

## Upgrade to 0.9.0 — workspace activity

Owners and administrators can open Settings → Workspace activity to review authorized audit events, filter by action category and Bangladesh calendar dates, and page through older events. Existing records and Inngest configuration are preserved. No new database migration; run npm ci, build and redeploy. See docs/ACTIVITY.md.

## Upgrade to 0.10.0 — record history download

Open a record with Export permission and choose Download record history. Confirm the download to receive the stored financial, ownership, reminder and document-metadata histories as JSON. Uploaded file bytes and restore functionality are not included. No migration or new environment settings; preserve .env, run npm ci and redeploy. See docs/HISTORY-EXPORT.md.
