# Verification — finance increment 0.2.0

Executed on 17 October 2026 in the build environment.

| Check                                       | Result                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Strict TypeScript check                     | Passed                                                           |
| Next.js production build                    | Passed; app/API routes built                                     |
| Automated tests                             | 49 passed across 4 test files                                    |
| Drizzle schema generation consistency       | Tracked additive migration 0001 generated for liability_payments |
| npm dependency audit                        | Prior 0.1.0 audit: 0; not rerun for this patch                   |
| Synthetic catalog                           | 131 types across 14 categories                                   |
| Credential-pattern check of packaged source | No real database URLs or recognizable provider keys found        |

Test coverage includes authentication verification and reset, sign-out/session revocation, CSRF-origin rejection, auth throttling, family isolation, record-level permission boundaries, invalid catalog input, optimistic concurrency, transactional rollback, duplicate-request idempotency, invitation email binding and replay rejection, member revocation, exact monetary arithmetic, missing values, valuation history, archive/restore, exports and authenticated email encryption.

The isolated integration engine is PGlite (PostgreSQL). The application's production driver is node-postgres against Neon. Tests do not prove production networking, pooling/concurrency, email delivery or deployment behavior. No real user records or real provider credentials were used.

Not executed: live Neon connection/migration, actual Resend delivery, browser UI/E2E tests, screen-reader/accessibility audit, load tests, external penetration testing or backup/restore drill. No deployed URL is claimed.

The esbuild override is restricted to `@esbuild-kit/core-utils` and pins 0.25.12 to remove its older vulnerable development-server dependency. Drizzle schema generation was rechecked after this change.

Patch checks: unverified sign-in enqueues verification; mocked Resend acceptance, 403 rejection, Retry-After handling, transport failure, encryption mismatch and malformed responses. No real email was sent. The development process supervisor and live worker delivery require confirmation in the configured deployment.

Version 0.1.2 adds tests for documented Resend 403 subtypes and a non-JSON error fallback. The user subsequently confirmed that the email issue was resolved. No independent live-provider delivery test was run in this build environment.

Version 0.2.0 adds ten repayment integration tests: principal-only balance reduction, idempotent replay/payload conflicts, overpayment rollback, invalid dates/zero amounts, interest-only/final repayment, competing versions, cross-family denial, view-only history, archived-record rejection, and audit-failure rollback. The suite applies both tracked migrations to a clean embedded PostgreSQL database. Existing deployment upgrades have not been executed against a live Neon branch.

Implementation references consulted: https://orm.drizzle.team/docs/transactions and https://www.postgresql.org/docs/18/explicit-locking.html .

## Version 0.2.1 UI verification

Production build and its strict TypeScript step passed after the home-page and password-control changes. HTTP smoke checks returned 200 for `/`, `/auth` and `/auth?mode=signup`, with the expected headline and initially masked password control in server-rendered HTML. The local smoke server used synthetic configuration and performed no login, database mutation or email send.

Browser interaction and screenshot checks were attempted but could not run: no browser binary was installed and the Chromium download failed. Responsive breakpoints, focus styles and button semantics were reviewed in source; visual layout and Show/Hide interaction still need a browser acceptance check. The previous 49-test finance/backend suite was not rerun for this UI-only release.

## Version 0.3.0 verification — 18 October 2026

- Strict TypeScript check and production build: passed.
- Automated tests: 65 passed across 5 files, including 16 new category/ownership/migration tests.
- Coverage: all 14 category definitions; unknown-key, date, last-four and land-unit validation; creation/history atomicity; exact legal/economic shares; baseline preservation; idempotency and stale versions; view/edit/export boundaries; archived/liability restrictions; competing writes; audit-failure rollback.
- Populated upgrade test: applies 0000/0001, inserts a legacy asset with a 12.345678% share and version 7, applies 0002, then checks unchanged values and an unknown effective ownership date.
- Browser interaction, live Neon migrations and provider integrations were not exercised for this release. Existing browser runtime remains unavailable following the prior download failure.
- Official implementation references: https://orm.drizzle.team/docs/column-types and https://orm.drizzle.team/docs/transactions and https://zod.dev/api .

## Version 0.4.0 verification — 18 October 2026

- Existing suite plus new reminder/reversal cases: 84 tests across 6 files (83 passed in the full run; the final migration-journal test is checked in the focused 19-test reminder/reversal run).
- Cases include recurrence across month-end/leap-year/year boundaries; Asia/Dhaka dates; idempotency; exact principal restoration; interest-only corrections; older-payment reversal with later payments preserved; invalid dates; record/family/view/edit boundaries; archived-record restrictions; competing requests and audit rollback.
- Populated upgrade preserves an existing payment and its liability balance. Migration-journal application and rerun check that all four migrations are tracked once. An initial generated ordering error was found and fixed before release: the composite payment key now precedes its referencing reversal foreign key.
- Production build and strict TypeScript: passed.
- No real reminders/emails were sent. No live Neon upgrade, interactive browser acceptance or external provider call is claimed. Browser runtime was unavailable in prior UI checks.
- Primary references consulted: https://www.postgresql.org/docs/18/ddl-constraints.html and https://orm.drizzle.team/docs/transactions .

## Version 0.5.0 — private document management

Executed in the implementation workspace using synthetic data:

- `npm run typecheck`: passed (strict TypeScript, including new document modules/tests).
- `npm test`: **105 tests passed across 8 files**. The new coverage includes exact upload/download bytes, replacement history, replay idempotency, active duplicate rejection, cross-record/family denial, View versus Export permission, revocation during external I/O, malware/scanner failure, uncertain storage writes, optimistic conflicts, archive/restore, quota reservation, cleanup eligibility/failure, content-integrity failure, multipart bounds, file validation and binary HTTP responses/origin checks.
- The ClamAV adapter was exercised against a local synthetic TCP server that verifies INSTREAM bytes and returns clean/infected/error verdicts. It was not a real malware engine and no real malware was uploaded.
- Database tests executed tracked SQL in PGlite, including all five migrations and a safe migration-journal rerun. Existing auth, money, ownership, reminder and repayment tests continued to pass.
- `npm run build`: passed; public and authenticated route compilation completed without service credentials.
- Source ZIP validation: performed during packaging; generated output, dependencies and populated environment files excluded.

Not executed: live Neon migration/pooling/concurrency, live S3 requests/IAM/encryption, actual ClamAV signatures/detection, browser upload/preview interactions, deployment load/edge limits or a backup restoration drill. These remain explicit deployment checks in DOCUMENTS.md. No real email was sent.

## Version 0.5.1 — logo, email and web-app installation

- Strict TypeScript check passed.
- **110 tests passed across 10 files**, including existing auth/invitation workflows and five new tests covering HTML/plain-text templates, escaping and URL restrictions, backward-compatible email transport, manifest/icon assets, and offline service-worker/API boundaries.
- Production Next.js build passed, including the new manifest route.
- The invitation integration test's URL extraction was updated to stop at any whitespace, so it correctly parses the multiline professional email body. Invitation acceptance, recipient binding and one-time use still pass.
- The supplied logo was inspected and copied unchanged; PNG installation icons were mechanically resized/padded from it.
- A local HTTP smoke test could not run because Next's server startup encountered the environment's `uv_interface_addresses` system error. No successful browser/device interaction, actual installation, live delivery or inbox rendering is claimed. No real email was sent.

## Version 0.6.0 — opt-in reminder emails

Executed with synthetic data and mocked mail transport only:

- Strict TypeScript check passed.
- **134 tests passed across 11 files**, including 24 new notification tests: default opt-out, member/family isolation, preference versions/validation, scheduled local time, time zones/DST clock behavior, quiet hours, advance intervals, deduplication, category and View filters, archived records, revoked/expired memberships, recipient verification, completion/rescheduling/reopening, recurrence, private-content omission, queue rollback, scheduler pagination, provider payload boundaries, and fenced cancellation/deferral with content cleanup.
- All six tracked migrations were exercised by the PostgreSQL-engine tests; the migration-journal rerun remained idempotent. Existing authentication, invitation, document, ownership, finance, reminder and installation tests passed.
- Production Next.js build passed.
- No real emails were sent. No live Neon migration, multiple-worker network/concurrency test, real Resend delivery, browser form interaction or notification inbox placement was verified. These are deployment checks in NOTIFICATIONS.md.
