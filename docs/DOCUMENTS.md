# Private documents — 0.5.0

> v0.14.0: To temporarily upload without scanning, follow [UPLOAD-WITHOUT-SCANNER.md](UPLOAD-WITHOUT-SCANNER.md). Scanning remains required by default; the scanner instructions below apply to required mode.

## Configure the services

For scanner-unavailable errors and Vercel deployment, follow [SCANNER-SETUP.md](SCANNER-SETUP.md). v0.13.1 adds an authenticated HTTPS option and `npm run documents:diagnose`. A live scanner is still required.

Document metadata lives in PostgreSQL. File contents live in a private S3-compatible bucket; the application does not store files in the public Next.js directory. Uploads stay disabled until `DOCUMENT_S3_BUCKET`, a region (`DOCUMENT_S3_REGION` or `AWS_REGION`) and scanner settings (`DOCUMENT_SCAN_URL` plus token, or `CLAMAV_HOST`) are present. This presence check does not verify connectivity or credentials. Other features work without document setup.

1. Create a dedicated private bucket. Enable provider-side encryption at rest and block public access. Do not enable website hosting, public ACLs, or public read policies. Use separate buckets and credentials for development, staging and production.
2. Set `DOCUMENT_S3_BUCKET` and `DOCUMENT_S3_REGION`. For AWS S3, leave `DOCUMENT_S3_ENDPOINT` empty. For an S3-compatible provider, use its documented HTTPS endpoint and signing region. Set `DOCUMENT_S3_PATH_STYLE=true` only when that provider requires it. Plain HTTP is appropriate only for a local isolated test service.
3. Use a server workload/instance role, or set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in server-only environment configuration. Temporary credentials also require `AWS_SESSION_TOKEN`. The SDK uses its standard credential chain. Never put credentials in `NEXT_PUBLIC_*` variables or browser code.
4. Give the application only `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `arn:aws:s3:::YOUR_BUCKET/documents/*`. It does not need bucket listing, ACL modification or public-policy permissions. Add only the narrowly scoped encryption-key permissions required by your provider if using a customer-managed KMS key. Configure encryption and public-access rules with a separate administrator identity.
5. Run an up-to-date ClamAV `clamd` service with current signature databases, reachable only over loopback or a trusted private network. Enable its TCP listener on port 3310 and set `StreamMaxLength` to at least 10 MiB. Set `CLAMAV_HOST` and, if needed, `CLAMAV_PORT`. ClamAV's TCP protocol provides no authentication or encryption: do not expose it to the Internet. For Windows development, a private Docker/WSL service is suitable; publish its port to `127.0.0.1` only. Containerized apps need the private service hostname, not the container's own localhost.
6. Apply the database migrations and restart the app. Your reverse proxy must accept multipart bodies of 10 MiB plus 32 KiB overhead and allow sufficient time for scanning/storage (suggested request timeout: 90 seconds). The TCP scanner has a 30-second deadline; the HTTPS request has a 35-second deadline; each storage request is bounded. Configure edge request/concurrency limits appropriate for your host. This release buffers one bounded file in memory per request, so small serverless body limits may be unsuitable.

Reference documentation: [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [S3 PutObject](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/), [S3 GetObject](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectCommand/), [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Use documents

Open an asset or liability and scroll to **Documents and files**. Add a title, description, category, up to ten tags and one file. Accepted extensions are PDF, PNG, JPG/JPEG, TXT and CSV. Maximum size is 10 MiB; empty files are rejected. Text/CSV must be UTF-8 without binary control characters. Binary formats must match detected signatures and declared MIME. PDF must have an EOF marker. These checks are not a complete structural parser or a guarantee against all malicious content; the scanner must also return a clean result.

A successful scan precedes storage and publication. Downloads use an authenticated application endpoint, recheck record Export permission, validate stored length and SHA-256, and return attachments with `nosniff` and no-store caching. The client receives no bucket key or public object URL. Only PNG/JPEG can be previewed inline, through the same export-authorized boundary. PDFs, CSV and text are download-only. Treat downloaded files appropriately in the application used to open them; this app does not rewrite spreadsheet formulas.

Record View permission reveals document metadata and history. Record Edit permission permits uploads and metadata changes. Record Export permission permits downloads/previews, including older versions. The existing policy also requires View for Edit or Export. Record creators receive View/Edit by default; the owner must separately grant Export when needed.

Select a document to inspect versions or edit its title, description, category and tags. **Upload replacement version** preserves earlier files. The archive checkbox hides the document from the default list; **Include archived documents** exposes it for restoration. Archiving is organizational, not access revocation or deletion: permitted readers can still retrieve retained versions. Archived records block uploads/metadata changes until restored.

Search covers the current record's title, description, category and tags. The cap is 100 documents per record, including empty/archived entries, and the latest 100 versions and events per document are displayed. A family's logical allowance is 1 GiB across retained versions and pending/failed uploads. Archive does not release quota. Permanent deletion, quota administration and full-history export are not implemented.

## Failed uploads and recovery

States are `pending`, `scanning`, `available`, `rejected`, `failed` and `discarded`. Only available, scanned versions can be downloaded. Failed replacement uploads leave the previously available version unchanged. New uploads that fail can leave a metadata entry with “No available file”; select it and upload a replacement rather than repeatedly creating new documents.

A request key identifies an exact attempt. Repeating a completed request returns its existing result. An active duplicate returns `UPLOAD_BUSY`. Failed/rejected attempts are terminal: refresh the record, inspect its status, and reselect the file to start a new attempt. A browser reload loses unsaved form input. No automatic background upload retry occurs.

Record versions are checked when reserving and publishing. If another user changes the record while scanning/storage is in progress, publication fails with a conflict. Reload the latest record before trying again. Requests older than two minutes cannot publish.

Object storage and PostgreSQL do not share a transaction. An uncertain storage write or database failure can leave an object associated with an unavailable attempt. The attempt retains quota until cleanup confirms deletion. A lost successful commit acknowledgement does not downgrade an available file; inspect status or retry the original request before creating another attempt.

Run the operator command with the same database and storage configuration as the app:

```bash
npm run documents:cleanup
npm run documents:cleanup -- --apply
```

The default is a dry run. `--apply` considers at most 100 known pending/scanning/failed versions untouched for more than 24 hours, fences publication by marking them failed, deletes their generated object key, then marks them discarded. It never deletes available/rejected versions or lists unrelated bucket objects. Failed deletes stay quota-charged and can be retried after another 24 hours. Metadata/history remain. Schedule this command operationally if desired; this release does not install a scheduler.

For a versioned bucket, ordinary S3 DeleteObject creates a delete marker and can leave provider-retained physical versions. Configure a provider lifecycle policy for noncurrent versions/delete markers consistent with your retention requirements; the app's logical allowance is not a physical billing meter. Enable backups for both PostgreSQL and the bucket, preserve their relationship, and validate restoration before storing important records. This command is not a general inventory reconciler for manually modified or database-restored buckets. Stop uploads during restores/maintenance.

## Deployment verification

Before real documents: upload/download a harmless synthetic file; compare bytes; test image preview; replace/archive/restore it; verify a view-only member cannot download; revoke export and verify access stops; test a cross-family URL; temporarily stop the scanner and confirm uploads fail closed; test a storage failure and the cleanup dry-run. Have the administrator validate malware detection using ClamAV's documented testing procedure in an isolated test environment.

Automated tests use an in-memory object adapter and a synthetic TCP scanner protocol server. They do not certify live S3 permissions/encryption, signature freshness, real malware detection, network behavior, browser interactions or production load.

## Deferred document features

Office files, archives, audio/video, PDF inline rendering, OCR/content search, external URL fetches, Google Drive OAuth, resumable uploads, document-specific grants, retention/deletion administration and a complete bucket reconciliation/backup UI remain future work. No external URL content is fetched by this module.
