# Implementation status and handoff

This package implements the first working foundation/core slice. It does not complete all nine phases of the master specification.

## Verification record

The final accompanying handoff reports the executed checks. Tests run against synthetic data in an embedded PostgreSQL engine, not a connected live Neon project. No real email was sent while building. The production build does not require fake credentials; without required configuration, the app renders a setup screen.

A configured deployment still needs a live Neon migration and transaction smoke test, email delivery test, browser E2E/accessibility check, external security review and backup restoration evidence. Do not interpret a successful build as evidence of those checks.

## Deliberate foundation constraints

| Area             | Current behavior                                                                              | Next implementation work                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Money            | BDT only, exact decimals, manual whole-asset valuation and included economic share            | FX snapshots, verified market sources, historical ownership, rounding policies by currency                             |
| Liabilities      | Initial outstanding balance only; name/notes editable; archive/restore                        | Payments, schedules, balance reconciliation and interest/fee separation                                                |
| Ownership        | One included family economic percentage                                                       | Co-owner parties, legal/beneficial distinctions and dated share histories                                              |
| Permissions      | Fixed role defaults, explicit per-record allow/deny; owner-only invitations/grants/revocation | Custom roles, admin delegation, time-limited grants, transfer/recovery workflows                                       |
| Membership       | One-time verified-email invitation, expiry, revocation                                        | Re-invitation/reactivation of revoked members and role changes                                                         |
| Audit            | Append entries transactionally; no audit UI                                                   | Dedicated immutable application DB grants, audit viewing/retention and operational export                              |
| Export           | Current visible/exportable record JSON                                                        | Full history archive, CSV/PDF, asynchronous jobs and restoration                                                       |
| Catalog          | 131 seeded types, common asset form                                                           | Category-specific typed forms and editable family catalog                                                              |
| AI               | Not implemented; no key-entry controls                                                        | KMS envelopes, adapters, budgets, failover and confirmation tools                                                      |
| Documents/Drive  | Not implemented                                                                               | Private storage, scanning, metadata lifecycle, OAuth and reconciler                                                    |
| Notifications    | Auth/invitation email queue only                                                              | Reminder categories, quiet hours and recurrence                                                                        |
| Email encryption | AES-256-GCM with a server key and authenticated purpose                                       | Managed KMS envelope key rotation and retention procedures                                                             |
| Security         | Server checks, CSRF/origin, auth throttling, constrained validation, opaque errors            | Production DB privilege separation, RLS defense in depth, fresh-auth sensitive actions, centralized operational limits |
| UI               | Main labels/catalog bilingual, responsive CSS, native dialog keyboard behavior                | Full localization, browser E2E, measured WCAG 2.2 AA, dashboard customization and themes                               |
| Scalability      | Small-family snapshot loads permitted family data and filters it on the server                | SQL-level permission filtering, cursor pagination, bounded asynchronous exports                                        |
| Reliability      | Atomic record mutations/idempotency, optimistic edits, bounded email retries                  | General job queue, reconciliation, operational dashboards, backup drills and fault injection                           |

## Operational notes

- Stop the mail worker before a backup restore or staging clone to avoid replaying messages. Use separate test credentials and synthetic addresses.
- Email jobs are encrypted in PostgreSQL. The encryption key is required to read queued jobs; never remove an old key while its jobs still need delivery. Key rotation is not automated in this release.
- Worker sends are at least once across systems. Resend idempotency keys reduce duplicates within the provider's retention window; they do not create a universal exactly-once guarantee.
- Jobs attempt at most five deliveries, with a 60-second lease and 15-second send deadline. A lease token fences completion by stale workers. Use `npm run email:status` for safe queue diagnostics; the app has no worker-admin screen yet.
- Unsent/failed email content expires after 12 hours. Sent content is cleared. A resend-verification action creates a new message; expired invitation messages require a new invitation.
- Do not manually replay an old auth email after the token expires. Do not copy raw job payloads or verification URLs into logs.
- Input is retained in client memory on failed forms. Server-side draft recovery is not implemented; refreshing/closing the tab can lose unsaved data.
- Record mutations use request idempotency keys scoped to actor and family, with payload hashes. The initial family creation and invitation operations are not yet idempotent; avoid automated retries for them.
- The same asset can be recorded in multiple categories/workspaces. There is no automatic cross-record/cross-workspace deduplication; reports do not aggregate families.
- The production CSP allows inline scripts/styles needed by the current Next build. Nonce-based strict CSP, HSTS at the deployment edge, monitoring and full ASVS verification remain release work.
- Database audit immutability and RLS are not claimed: the application has no audit update/delete endpoint, but production database privileges still require deliberate setup.
- In a live multi-process deployment, test database lock/concurrency behavior using Neon/PostgreSQL. PGlite tests validate SQL/service semantics, not network failures or production pooling.

## Next deliverable

Extend the current foundation with category-specific asset forms, co-owners, liability repayment transactions and history, document metadata/storage, broader localization and browser tests. Preserve current permission checks and the exact-money contract. Add AI only through the planned server-side secret boundary; never use browser-stored keys.

Version 0.1.1 starts the mail worker alongside Next.js with `npm run dev`. Production `npm start` still requires `npm run worker:email` separately. Permanent provider 4xx errors stop retries; HTTP 429 and 5xx can retry, respecting Retry-After. Worker logs classify errors without printing recipients, verification links or provider response bodies.
