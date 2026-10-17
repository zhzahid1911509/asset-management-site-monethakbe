# Upgrade to 0.2.0 — repayment tracking

1. Stop the web app and mail worker. Back up the database or create a Neon branch before applying the release.
2. Replace application source with this package. Preserve your working `.env` / `.env.local` files and the existing encryption/authentication secrets. Do not overwrite them with `.env.example`.
3. Run `npm ci` from the application folder.
4. Run `npm run db:migrate` with the direct `DATABASE_MIGRATION_URL` configured in `.env` (this migration script loads `.env`). The migration adds `liability_payments` and its constraints/index; it does not reset existing records. Do not run raw migration files manually or delete the Drizzle journal.
5. Run `npm run dev`. For production, run `npm run build`, then run the web process and email worker as before.
6. Open a liability, choose **Record a repayment**, and enter principal, interest, fees and the actual date. Only principal reduces outstanding debt. This is bookkeeping, not a bank transfer. Check the resulting balance and Financial history.

Payments must be dated on or after the current balance date and no later than today in Bangladesh. Split interest/fees from principal using your statement; do not guess that the full payment reduces principal. Principal cannot exceed the recorded balance. New payments on archived liabilities are blocked.

History entries are retained. This increment does not yet support corrections/reversals, amortization schedules, automatic interest, bank matching, or ledger export. Check entries before saving. History displays the latest 100 entries and says when more exist. Existing asset records now display valuation history too.

Conflicting edits return a reload message rather than overwrite newer values. The UI keeps fields after errors and preserves the request key when retrying identical data. Changed submissions get a new key. Server-side duplicate protection, version updates, balance changes, ledger insertion and auditing are atomic.

Validation uses synthetic PostgreSQL-engine data. A live Neon migration and browser acceptance test are still required on your configured branch before production rollout.
