# Upgrade to 0.6.0 — personal reminder emails

1. Stop the web app and email worker. Back up the database or test on a development Neon branch first.
2. Replace the source with this release, preserving `.env`/`.env.local`, authentication secrets and the existing email encryption key.
3. Run `npm ci`.
4. Run `npm run db:migrate` with the direct `DATABASE_MIGRATION_URL` in `.env` or an exported environment variable. Migration `0005_reminder_email_preferences.sql` adds personal notification settings and delivery tracking. It does not opt anyone in or rewrite existing records/reminders. Do not run the SQL separately or reset the migration journal.
5. Ensure the mail worker has `APP_ORIGIN` alongside its existing database, encryption and Resend settings. It must match the deployed web origin. Restart both processes with `npm run dev`, or run `npm run build`, `npm start` and `npm run worker:email` for production.
6. In a family workspace, open **Settings → Email reminders**. Enable emails, select categories and advance intervals, choose a time zone and delivery time, then save. Each member opts in separately for each family. There is no automatic enrollment.
7. Test with a harmless reminder linked to a synthetic record. Use your verified test account, choose the current local date and an eligible send time, and check the delivery history. Inspect the received email and current record access separately.

The existing email worker now schedules reminder emails as well as delivering authentication/invitation mail. There is no second reminder daemon. `--once` performs one scheduling page and claims at most one job; it is a diagnostic mode, not a complete queue drain. Normal production usage is a supervised persistent worker.

Read [NOTIFICATIONS.md](NOTIFICATIONS.md) for delivery semantics, permissions, quiet hours, cancellation and limitations. Opting out of reminder mail does not disable account verification, password reset or family-invitation emails.
