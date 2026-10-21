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

## Version 0.7.0 — appearance and current reports

- Strict TypeScript check passed.
- **146 tests passed across 13 files**. Twelve new tests exercise theme startup/system changes, explicit persistence, unavailable storage, cross-tab synchronization, exact report totals, archive/filter behavior, membership/export denials, no hidden-record totals, UTF-8 CSV quoting/formula neutralization and strict request validation. Existing migrations, authentication, finance, documents and notification checks continued to pass.
- Clean production build passed after removing a corrupt generated `.next` cache; the source and database migrations were not reset.
- Static contrast calculations for the new principal dark-mode pairs: body 14.98:1, muted card text 8.36:1 and primary button text 9.06:1. These three calculations are not a full page-level WCAG audit.
- Browser rendering, first-paint behavior, native theme inputs, report print pagination, Bengali font rendering and actual PDF output remain unverified in a real browser/device. No live customer data or email service was used.

## Version 0.7.1 — mobile interface

Strict TypeScript passed. Full suite: 145 passed, one stale email-logo expectation failed; after updating that expectation, all three email-template tests passed on a targeted rerun. The 146 existing tests are therefore passing across those runs. Production webpack build passed. Browser download failed, so real Android/iOS, viewport, keyboard and visual checks remain unverified; use docs/MOBILE.md. No live storage or email operation was performed.

## Version 0.8.0 — Inngest

161 tests passed across 16 files. New tests exercise duplicate events, provider retry delays, permanent failure, expired auth messages, abandoned/active/exhausted leases, stale completion fencing, invalid payloads, event-only job IDs, event-publish failure recovery and rejection of unsigned/misconfigured production requests. Strict TypeScript and production webpack build passed, including /api/inngest. Live Vercel/Inngest synchronization, cron operation and real email delivery were not executed.

## Version 0.9.0 — workspace activity

170 tests passed across 17 files, including nine new activity tests. Strict TypeScript and production webpack build passed. Tests cover authorization, cross-family isolation, view-denial filtering before pagination, current membership checks, Bangladesh date boundaries, microsecond/tie pagination and malformed inputs. Browser/real-device interaction and live Neon performance remain unverified. No production data was accessed and no real email was sent.

## Version 0.10.0 — record history exports

178 tests passed across 18 files. Eight new tests cover exact decimals, view/export denials, outsiders, histories beyond 100 entries, omission of upload request keys, archived records, payment/reversal links, byte/row-limit failure and audit behavior. Strict TypeScript and production webpack build passed. Browser/mobile save dialogs and live Neon/storage integrations were not exercised; no real email was sent.

## 0.10.1 — mobile modal regression fix (19 October 2026)

- Strict TypeScript check and Next.js production webpack build passed.
- All 178 tests across 18 files passed.
- Chromium component harness using the real Modal and AssetForm components, complete seed catalog and production-built CSS passed 32 viewport/theme/language combinations: 320×568, 360×640, 375×667, 390×844, 430×932, 768×1024, 1024×768 and 844×390; each in English/Bengali and light/dark mode.
- Checks opened Add asset, selected property, expanded category fields, asserted dialog/field horizontal containment and dialog vertical containment, scrolled to Save and closed the dialog. No live record was submitted.
- Physical Android/iOS devices, Safari rendering and native software-keyboard behavior were not exercised. The device acceptance checklist is in MOBILE.md. This is component layout coverage, not a signed-in full application browser test.

## 0.11.0 — member roles (21 October 2026)

- 186 tests across 19 files passed, including eight new membership tests covering owner-only updates, self/owner protection, role/confirmation validation, stale role conflict, inactive/expired/cross-family rejection, adviser caps, explicit view-denial preservation, implicit access removal after demotion and no-op audit behavior.
- Strict TypeScript check and production webpack build passed.
- Six Chromium component browser scenarios passed at 320px, 390px and 1024px in English/Bengali. Real FamilyMembers/Modal components used production CSS and a mocked API. Checked confirmation gating, role-change PATCH payload, successful modal closure and horizontal containment.
- No real emails sent or live database modified. Physical mobile devices, full signed-in browser flows and deployed integration remain untested in this release.

## 0.12.0 — re-invitation and reactivation (21 October 2026)

- All 194 tests across 20 files passed against synthetic embedded PostgreSQL, including eight new re-invitation tests. Coverage: acceptance-only reactivation, stable membership identity, grant removal and notification reset, adviser expiry, superseded links, revocation cancellation, owner-only issuance, active member rejection, email binding, issuer authority and legacy-token rejection.
- Additive migration 0006 is applied by the test database fixture. Production webpack build and TypeScript checks passed.
- Six Chromium component scenarios passed at 320/390/1024px in English/Bengali: inactive-member Re-invite, email prefill, read-only default, invitation request payload, success notice and horizontal containment. API responses were mocked; no actual invitation was delivered.
- Physical devices, real provider delivery and concurrent multi-connection Neon transactions were not exercised.
