# Implementation status and handoff

This package implements the first working foundation/core slice. It does not complete all nine phases of the master specification.

## Verification record

The final accompanying handoff reports the executed checks. Tests run against synthetic data in an embedded PostgreSQL engine, not a connected live Neon project. No real email was sent while building. The production build does not require fake credentials; the public home page renders without configuration, while authentication/workspace routes require configuration.

A configured deployment still needs a live Neon migration and transaction smoke test, email delivery test, browser E2E/accessibility check, external security review and backup restoration evidence. Do not interpret a successful build as evidence of those checks.

## Deliberate foundation constraints

| Area             | Current behavior                                                                              | Next implementation work                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Money            | BDT only, exact decimals, manual whole-asset valuation and included economic share            | FX snapshots, verified market sources, historical ownership, rounding policies by currency                             |
| Liabilities      | Outstanding balance, principal/interest/fee payments, full-payment reversals and history      | Amortization schedules, statement reconciliation and partial corrections                                               |
| Ownership        | Co-owner roles, separate legal/economic shares, dated share revisions                         | Historical net-worth reports, party/member linking and ownership transfer workflows                                    |
| Permissions      | Fixed role defaults, explicit per-record allow/deny; owner-only invitations/grants/revocation | Custom roles, admin delegation, time-limited grants, transfer/recovery workflows                                       |
| Membership       | One-time verified-email invitation, expiry, revocation                                        | Re-invitation/reactivation of revoked members and role changes                                                         |
| Audit            | Append entries transactionally; no audit UI                                                   | Dedicated immutable application DB grants, audit viewing/retention and operational export                              |
| Export           | Current visible/exportable record JSON including details and owners                           | Full history archive, CSV/PDF, asynchronous jobs and restoration                                                       |
| Catalog          | 131 seeded types, optional typed fields across all 14 categories                              | Editable family catalog, custom fields and guided multi-step forms                                                     |
| AI               | Not implemented; no key-entry controls                                                        | KMS envelopes, adapters, budgets, failover and confirmation tools                                                      |
| Documents/Drive | Private S3 uploads, ClamAV gate, versions, metadata/search/history, archive/restore, checked downloads and failed-upload cleanup | Drive OAuth, richer formats, content search, retention administration and full reconciliation |
| Notifications | In-app reminders; opt-in personal email scheduling, category/advance/time-zone/quiet-hour controls and delivery history | Push/SMS, snooze, per-record/per-category schedules, specialized events and bounce webhooks |
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

Continue with reporting/export and financial reconciliation, broader localization and browser tests. Preserve current permission checks and the exact-money contract. Add AI only through the planned server-side secret boundary; never use browser-stored keys.

Version 0.1.1 starts the mail worker alongside Next.js with `npm run dev`. Production `npm start` still requires `npm run worker:email` separately. Permanent provider 4xx errors stop retries; HTTP 429 and 5xx can retry, respecting Retry-After. Worker logs classify errors without printing recipients, verification links or provider response bodies.

## Version 0.2.0 finance increment

Repayments and on-screen valuation/payment history are implemented end to end. Payment principal alone reduces the outstanding liability; interest and fees do not. Dates are chronological from the last recorded balance and cannot be in the future. Archived liabilities reject new payments. History is view-authorized and displays the latest 100 entries with an explicit limit notice. Payments cannot currently be edited/reversed; reconciliation and correction workflows remain pending. Current-record JSON exports include updated balances, but do not yet contain the payment ledger. No automatic bank transfers, amortization, bank reconciliation or interest accrual are implied.

## Version 0.2.1 presentation update

A responsive Bengali home page groups the supplied family, trust and technology taglines, with English supporting copy. It links to working authentication routes and labels document uploads, reminders and AI as upcoming. Password visibility toggles are available for sign-in, sign-up and reset, hidden initially and reset to hidden when changing modes.

## Version 0.3.0 category and ownership increment

- All 14 seeded categories have optional structured fields validated on the server and in the entry UI. Details can be added during creation and edited later. Revision snapshots are retained and view-authorized.
- Property fields include division/district/upazila, mouza/JL/dag/khatian/deed/namjari/tax references and area. Katha/bigha entries require a local definition/source. Units are recorded without automatic conversion.
- Account/policy/licence references use last-four-only inputs. These fields do not accept full account credentials. Arbitrary category keys are rejected.
- Ownership records support legal owners, beneficial owners, combined owners, managers and possessors. Legal and economic totals are validated separately. Managers/possessors have no ownership percentages. Parties do not grant user access.
- An explicit family economic share drives current totals exactly once. When parties are listed, their included economic shares must sum exactly to that share. Without parties, a manual family share remains allowed. Unknown legal shares remain unknown.
- Ownership updates carry a non-future effective date and reason; backdating before the latest effective date is rejected. The migration retains the pre-upgrade share with an unknown effective date. This does not implement historical net-worth reports, legal validation or automatic inheritance calculations.
- Category and ownership updates are version-checked, idempotent and audited transactionally. Archived records show history but cannot receive these updates.
- Current JSON export includes current details/owners; complete history exports are still pending. History screens display the latest 100 revisions per kind and disclose the limit.
- Forms preserve drafts in memory on failures; automatic recovery after browser reload is still pending. Some enumerated option values remain English.

## Version 0.4.0 corrections and in-app reminders

- Full-payment reversal restores only original principal to the current balance. Original principal, interest and fee amounts remain in payment history and the entire entry is marked reversed. A separate correction records date, reason and before/after balances. Corrected payments can then be entered separately.
- A payment can be reversed once, enforced by a unique constraint and a composite foreign key tying the reversal to the payment's family/record. Dates must be on/after the current balance date and no later than today. Later payments retain their original history. Partial reversals, bank reconciliation and lender-confirmed balances remain pending.
- In-app reminders belong to an existing record, inherit its view/edit permission and appear in a workspace Reminders section. Categories cover maturity, renewal, payment, maintenance, valuation, family responsibility and other. They are manually created; category detail dates do not automatically create reminders.
- Recurrence supports none/daily/weekly/monthly/quarterly/yearly. Completing a recurring occurrence advances exactly one period from its scheduled date, preserving its original day-of-month where possible. Missed occurrences are not silently skipped. Calendar dates are interpreted in Asia/Dhaka; no time-of-day delivery is claimed.
- Reminders can be edited/rescheduled, completed, cancelled or reopened. Event history is retained. Archived records' reminders remain visible in All/history but are excluded from the active list and cannot be changed until the record is restored.
- Reminder writes and reversals use the parent record version, idempotency keys, transactional audit and rollback. History reads are record-authorized. Reminder actions do not mark financial or legal obligations fulfilled outside this app and do not create a repayment.
- Email, push, SMS, advance delivery, quiet hours, per-category preferences and assignee-specific notifications are not implemented. No reminder messages were sent during this implementation.
- Reminder lists currently load all permitted reminders for a small family; history is capped at 100 entries with a limit notice. Cursor pagination and full history export remain pending. Current-record JSON export includes corrected balances but does not include reminder/reversal ledgers.

## Version 0.5.0 private documents

- PDF, PNG, JPEG, UTF-8 TXT/CSV uploads up to 10 MiB, server validation, mandatory ClamAV scan, private S3 adapter and generated object keys. Unconfigured deployments clearly disable uploads.
- Record-linked metadata, tags/category search, immutable file versions, metadata event history, archive/restore, authenticated downloads and image previews. View/Edit/Export permissions are enforced on the server; archived records reject mutations.
- Idempotent completed uploads, optimistic publication, logical family quota, explicit upload states, storage-content integrity check and operator dry-run/apply cleanup of stale failed objects. See DOCUMENTS.md for the cross-system failure model and versioned-bucket retention limitation.
- Limits: 100 documents per record, latest 100 versions/events displayed, 1 GiB logical family allowance. No permanent-delete UI, OCR, Drive OAuth, Office files, resumable uploads or full document export/backup.
- Live storage/scanner configuration, malware signatures, deployment concurrency and browser interaction remain deployment verification requirements.

## Version 0.5.1 branding, service email and installation

- Supplied logo integrated across public/authentication/workspace/setup/error surfaces, with browser and home-screen icons.
- Shared professional HTML/plain-text templates for all implemented service email: verification/resend, password reset and invitations. Existing encrypted text-only queued jobs remain supported. No reminder delivery added.
- Web-app manifest, Android install-prompt handling, iOS/iPadOS Safari instructions and a network-only service worker with generic offline fallback. No private offline cache, native store binaries, push notifications or background sync.
- Real-device installation and email-client rendering still require deployment verification; see INSTALLATION.md.

## Version 0.6.0 reminder delivery

Personal email preferences are now opt-in per member/family. The existing worker schedules active authorized reminders, tracks occurrence/interval identities, and rechecks permission/status/preferences immediately before dispatch. Quiet hours, recipient time zones, advance notice and safe delivery-history status are implemented. Messages are deliberately generic; account/invitation mail remains independent.

This supersedes the earlier release notes that described email reminders as unavailable. The full notification specification is not complete: specialized categories, snooze, per-record overrides, push/SMS and delivery webhooks remain pending. See NOTIFICATIONS.md and UPGRADE-0.6.md.

## Version 0.7.0 appearance and reporting

- Light/Dark/System appearance across public and authenticated screens, persisted as a browser-only preference with cross-tab and operating-system updates. Original logo imagery is preserved.
- Current filtered reports with export-authorized category/record totals, unknown-value counts, archive handling, CSV download and browser print/save-PDF. Each action requests fresh data. Current exports now use repeatable-read snapshots.
- CSV uses UTF-8 BOM, correct quoting and spreadsheet-formula neutralization. Preview is limited to 100 rows; CSV/print include all selected rows, with a 5,000-exportable-record server cap and explicit error rather than truncation.
- This supersedes prior notes describing all CSV/PDF presentation and themes as absent. Historical reporting, full history exports, server-generated PDF and backup restoration remain unimplemented. Real-browser visual/accessibility/printing checks remain deployment tasks.

## Version 0.7.1

Responsive mobile layout refinements, safe areas, drawer keyboard/focus handling, larger controls, dynamic-height dialogs and scrollable tables. Includes theme-specific supplied logos and document fixes. This remains an installable web app, not a native store binary. Real-device visual checks remain outstanding.

## Version 0.8.0

Inngest event delivery, five-minute queue recovery, fifteen-minute reminder scheduling, shared lease-fenced processor and auth-email expiry. Deploy/sync instructions in INNGEST.md. No new database migration. Live Vercel/Inngest/Resend integration remains a deployment verification step.
