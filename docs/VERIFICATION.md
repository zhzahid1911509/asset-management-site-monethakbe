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
