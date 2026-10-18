# Upgrade to 0.5.0 — private document management

1. Stop the web app and email worker. Back up the database or use a development Neon branch first.
2. Replace the source with this release. Preserve `.env`/`.env.local` and existing authentication/email encryption secrets.
3. Run `npm ci`.
4. Run `npm run db:migrate` with `DATABASE_MIGRATION_URL` in `.env` or an exported environment variable. Migration `0004_private_documents.sql` adds document metadata, file-version and event tables without rewriting existing records. Earlier migrations apply automatically when needed; do not run individual SQL files manually or delete migration history.
5. Follow [DOCUMENTS.md](DOCUMENTS.md) to configure a private S3-compatible bucket and ClamAV. The app can run without these settings; uploads stay disabled.
6. Run `npm run dev`. For production, run `npm run build`, then start `npm start` and the existing email worker separately.
7. Verify upload/download, replacement, metadata edits and permission denial with synthetic records in your deployment.

No real provider credentials are included. Google Drive, OCR, Office formats and email/push reminders are not part of this increment. Existing JSON record exports do not include document bytes or document history.
