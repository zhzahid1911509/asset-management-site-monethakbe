# Upload documents without a scanner (v0.14.0)

This temporary option allows uploads and permission-checked downloads without a scanner gateway. It does not provide malware detection. File-type/signature validation, the 10 MiB size limit, family quota, private storage, download integrity checks and access permissions remain enabled. Only exchange files you trust.

## Deploy this update

1. Replace the application source with this release. Preserve your own `.env` and credentials. Run `npm ci`.
2. Ensure your local `.env` has `DATABASE_MIGRATION_URL` pointing to the target Neon database using the migration credentials. Run `npm run db:migrate` once for each target database **before deploying the new code**. This applies migration `0007_optional_document_scanning`; it preserves existing document history.
3. Add to local `.env`:

   ```env
   DOCUMENT_SCAN_MODE=disabled
   ```

4. Keep your existing working storage values:

   ```env
   DOCUMENT_S3_BUCKET=your-bucket-name
   AWS_ENDPOINT_URL_S3=your-neon-s3-endpoint
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   AWS_REGION=your-provider-region
   ```

   Retain any existing `DOCUMENT_S3_PATH_STYLE` or `DOCUMENT_S3_*` overrides that your bucket needs. The bucket must stay private. Do not put secrets in `NEXT_PUBLIC_*` variables. `DOCUMENT_SCAN_URL`, `DOCUMENT_SCAN_TOKEN`, and `CLAMAV_HOST` can be absent or empty in disabled mode.
5. Restart local development with `npm run dev`. In Vercel → project → Settings → Environment Variables, set `DOCUMENT_SCAN_MODE` to `disabled` for each environment you use, retain the storage variables, and redeploy this release. Environment changes require a new deployment.
6. Open My assets → select asset → Documents. Confirm the scanning-disabled notice. Upload a small `.txt` or `.pdf`, then download it. The version should show **Not malware-scanned**. Previously failed attempts are not recovered automatically: select the file again and submit a new upload/version.

`npm run documents:diagnose` reports scanning as SKIPPED in this mode; it does not verify S3 connectivity. If upload fails, check its new error/reference and deployment logs rather than assuming every error is scanner-related.

## Enable scanning later

Deploy and verify the scanner using [SCANNER-SETUP.md](SCANNER-SETUP.md). Configure the HTTPS gateway URL and matching token, set `DOCUMENT_SCAN_MODE=required` locally and in Vercel, then restart/redeploy. Scanner errors will block new uploads; there is no automatic bypass.

Existing unscanned versions retain their label and remain downloadable by authorized users. Changing the setting does not scan old files. Upload a new version with required mode enabled to obtain a scanned version. The old version stays in history as unscanned.

If `DOCUMENT_SCAN_MODE` is omitted, scanning is required. Only the exact values `required` and `disabled` are accepted. The mode is captured once per upload. Database metadata records `scan_skipped=true` and a null `scanned_at` for unscanned uploads; it never fabricates a clean scan.
