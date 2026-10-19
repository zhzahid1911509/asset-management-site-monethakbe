# Record history export — v0.10.0

## Use

Open an asset or liability with current View and Export permission. Scroll to Download record history. Read the scope and confirm the checkbox, then choose Download history JSON. A file named monethakbe-history-<record-id>.json downloads. Save it privately. On mobile the browser may show a save/share prompt. Archived records can also be exported if permissions allow it.

The JSON format is monethakbe-record-history, version 1. It includes export time, BDT currency, workspace name/ID, current record, asset or liability details, catalog entry and these collections:

- Valuations and detailed-field revisions.
- Payments and separate payment reversals, linked by paymentId. Monetary values remain decimal strings.
- Ownership revisions and current ownership information.
- Reminders and reminder event snapshots.
- Document descriptions, tags and archive state; file version metadata (including scan status and checksum), and document events.

Counts report the actual number of entries in each section. Unlike the on-screen history, exports are not limited to the latest 100 entries.

## Limits and exclusions

Each history collection is limited to 1,000 entries, and the entire UTF-8 JSON must fit within 4 MiB. Exceeding either limit returns an explicit error with no partial file and no successful-export audit event. This bounded synchronous export is designed to stay below the previously documented Vercel response ceiling. Deployment/network limits can still prevent a download.

This is not a complete workspace backup and cannot be imported/restored by the app. It excludes uploaded file bytes, email/authentication data, membership and access grants, and workspace audit logs. Existing fields are included only where historical snapshots were actually recorded; edits to basic record names/notes do not have a complete before/after ledger. Actor identifiers are included in stored history; actor profiles are not exported. Upload request keys and request hashes are excluded. The JSON is plain text, not an encrypted archive.

## API and consistency

POST /api/families/:familyId/records/:recordId/history-export
Content-Type: application/json
Body: {"confirmed":true}

Session and same-origin checks apply. The server requires current view/export permission even if the client shows a download button. The read runs in one repeatable-read transaction; all history queries scope both family and record. Successful generation appends record.history.exported to activity. Audit means generation succeeded, not proof that the user saved the file. Responses are private no-store JSON attachments with nosniff. IDs form the filename rather than user-controlled record names.

## Upgrade and verification

No new migrations, configuration or Inngest function changes. Preserve existing environment secrets, run npm ci, build and deploy. Tests use synthetic embedded PostgreSQL and do not access live storage or send email. Real browser/mobile downloads and live Neon performance require deployment checks.
