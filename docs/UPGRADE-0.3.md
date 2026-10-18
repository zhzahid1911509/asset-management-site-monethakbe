# Upgrade to 0.3.0 — category details and co-owners

1. Stop the web app and email worker. Back up the database or create a Neon branch for the upgrade.
2. Replace the source with this release, retaining your existing `.env`/`.env.local` files, database URLs and authentication/encryption secrets.
3. Run `npm ci` in the project folder.
4. Run `npm run db:migrate`. The script reads the direct `DATABASE_MIGRATION_URL` from `.env` or an exported environment variable. Migration `0002_record_details_ownership.sql` adds current detail/owner fields and revision tables, then preserves existing records as baseline snapshots. It does not reset records, valuations or repayments. Do not run raw migration files manually or delete the migration journal.
5. Run `npm run dev`. For production, run `npm run build`, then start the web process and email worker as before.

## Use the new fields

During record creation, choose a type and expand **Category details (optional)**. Cash/deposit records include institution, last four account-reference characters, opening/maturity dates and estimated maturity amount. Property records include Bangladesh land references and units. Vehicles, valuables, investments, business, benefits, liabilities, household goods, digital assets, rights, rural assets, transfers and other assets each have their own fields.

Open a record later to edit its category details. Empty fields remain unknown. Monetary detail fields are BDT and do not automatically replace asset valuations, liability balances or generate income/expense transactions. Dates do not yet create reminders.

For an asset, use **Ownership and responsibility** to add parties. Choose legal owner, beneficial owner, both, manager or possessor. Enter legal and economic percentages separately; blank means unknown. Check only the economic interests included in this family's totals. The family economic share must equal their sum when parties are listed. A manual family share is still supported with an empty party list. Adding parties never invites users or changes their permissions.

Record the effective date and reason/source before saving. Dates cannot be in the future or earlier than the most recent ownership update. New data, record version, history and audit entries commit together. Repeating an identical request does not create a second revision. A stale edit asks you to reload and compare.

History retains past details and ownership snapshots. Existing shares are marked **Effective date unknown** because earlier versions did not collect this date. Legal ownership is not verified and inheritance shares are not computed. The app applies the current family economic share to current totals once; it does not yet produce historical ownership-adjusted net-worth reports.

## Verification and remaining limits

65 automated tests and a production build are recorded in `docs/VERIFICATION.md`. The migration has been tested on populated synthetic PostgreSQL-engine data, including fractional shares. Live Neon upgrade and interactive browser acceptance remain deployment checks. Document uploads/Drive, reminders, AI, payment corrections, full history export, custom categories/roles and the other remaining modules are tracked in `docs/STATUS.md`.
