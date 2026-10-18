# Upgrade to 0.4.0 — in-app reminders and repayment corrections

1. Stop the web app and email worker. Back up the database or create a Neon branch for the upgrade.
2. Replace the source with this release, preserving your `.env`/`.env.local` files and current authentication/encryption secrets.
3. Run `npm ci` in the project folder.
4. Run `npm run db:migrate` with the direct `DATABASE_MIGRATION_URL` in `.env` or an exported environment variable. Migration 0003 adds reminders, event history and payment reversals. It preserves existing payments and balances. Do not execute individual migration files manually or delete the migration journal.
5. Run `npm run dev`. For production, build first and start the web process and email worker as before.

## Correct an incorrect repayment

Open a liability and expand **Correct an incorrect payment** in Financial history. Enter a correction date and reason, then choose **Reverse payment**. Only the payment's principal is restored to the current outstanding balance. The original entry—including interest and fees—is kept and marked reversed. The correction records the balance immediately before/after it. Existing later payment entries are not rewritten.

The correction date must be on/after the latest balance date and no later than today in Bangladesh. Each payment can be reversed once. Restore an archived record before correcting it. If needed, enter a new corrected payment afterwards using a date on/after the updated balance date. This is manual bookkeeping; no bank transfer, refund or lender reconciliation occurs. Partial reversals are not supported.

## Use reminders

Open **Reminders** in the workspace sidebar. Choose **Add reminder**, select a record you may edit, then enter its title, category, due date, repeat rule and note. Reminders are shown in the app; no email, SMS or push reminder is sent. Category-specific dates do not automatically create reminders.

Choose **Complete occurrence** to record completion. For a recurring reminder, the next date is computed from the scheduled due date, rather than the day you click complete. January 31 monthly becomes February 28, then March 31. February 29 yearly returns to February 29 in a leap year. Missed dates remain due until completed or explicitly rescheduled. Completing a reminder does not create a repayment or establish that an external obligation was satisfied.

Use **Edit** to change a title, note, category or schedule. Editing title/note alone retains the recurrence anchor; changing due date/repeat rule sets a new anchor. **Cancel reminder** preserves its history. Completed and cancelled reminders can be reopened. Use **All and history** to inspect closed or archived reminders.

View permission on the linked record permits viewing reminders/history; edit permission permits changes. Adding a reminder never grants access to the record. Archived records suspend reminder changes and their reminders are excluded from Active/Due views. Restoring the record exposes active reminders again.

## Validation

84 automated tests cover the existing app and the new recurrence/correction workflows, including fresh migrations, migration-journal reruns and a populated pre-0.4 upgrade. Exact validation results are in `docs/VERIFICATION.md`. Live Neon migration and interactive browser checks are still required in the configured deployment.
