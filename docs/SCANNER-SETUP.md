# Fix scanner-unavailable uploads — v0.13.1

> v0.14.0: To temporarily upload without scanning, follow [UPLOAD-WITHOUT-SCANNER.md](UPLOAD-WITHOUT-SCANNER.md). Scanning remains required by default; the scanner instructions below apply to required mode.

## What the error means

The application could not obtain a valid clean scan. It blocks file storage/publication in this case. An S3 bucket and its credentials do not provide malware scanning. Setting CLAMAV_HOST does not start ClamAV. A scanner on your Windows PC is not reachable through localhost from Vercel. The reference shown in the error matches a request.failed event in your app logs. v0.13.1 includes a safe diagnostic field such as ECONNREFUSED, ENOTFOUND or SCANNER_AUTH_FAILED. It never logs file contents, URLs or tokens.

## 1. Update the app

Keep your .env and existing production secrets. Replace source, then run npm ci. No new migration is required beyond the migrations from earlier releases. Run npm run documents:diagnose from the app directory. This sends only a harmless synthetic buffer to the scanner and tests neither S3 nor database access. Running it on your PC verifies your PC's network; it does not prove Vercel can reach the scanner.

## 2A. Windows local development

With Docker Desktop installed and running, start a loopback-only ClamAV service:

```powershell
docker run -d --name monethakbe-clamav --publish 127.0.0.1:3310:3310 --mount type=volume,source=monethakbe-clamav-db,target=/var/lib/clamav clamav/clamav:stable
docker logs -f monethakbe-clamav
```

On subsequent runs, use docker start monethakbe-clamav instead of creating the same container again. Wait for signature download/loading and daemon readiness. ClamAV needs enough memory to load its database; inspect the container logs if it exits. Ctrl+C stops log-following without stopping the container.

In the application's .env:

```dotenv
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
DOCUMENT_SCAN_URL=
DOCUMENT_SCAN_TOKEN=
```

Then run:

```powershell
npm run documents:diagnose
npm run dev
```

Wait for the diagnostic PASS before retrying the upload. If Next.js also runs inside Docker, use the scanner's private service hostname instead of 127.0.0.1. Never publish unauthenticated port 3310 to the Internet.

## 2B. Vercel / hosted application

Use the HTTPS gateway bundled in deploy/scanner. This requires a separate Docker-capable host and a scanner hostname you control. It cannot be created merely by setting an environment variable on Vercel. Hosting availability/cost depends on the provider; no free hosting or provisioned server is included.

1. Point a DNS hostname, such as scanner.your-domain.example, to that host. Allow inbound 80/443 for TLS; do not expose 3310 or 8080.
2. Copy the project to that host. Generate a private token with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it private.
3. Create deploy/scanner/.env on the host (do not commit it):

```dotenv
SCAN_DOMAIN=scanner.your-domain.example
SCANNER_GATEWAY_TOKEN=YOUR_GENERATED_TOKEN
```

4. From deploy/scanner run:

```sh
docker compose up -d --build
docker compose logs -f clamav gateway tls
```

ClamAV downloads/updates signatures in a persistent volume. Caddy provisions TLS for the DNS hostname. The gateway and ClamAV ports stay private within Docker. Wait for both signatures and TLS to be ready. The gateway buffers at most 10 MiB per request and allows two active requests; adjust deployment capacity before heavier use.

5. In Vercel → project → Settings → Environment Variables, set for the environments you use:

```dotenv
DOCUMENT_SCAN_URL=https://scanner.your-domain.example/scan
DOCUMENT_SCAN_TOKEN=THE_SAME_GENERATED_TOKEN
```

Replace the placeholder hostname/token. Do not prefix these with NEXT_PUBLIC_. DOCUMENT_SCAN_URL takes precedence over CLAMAV_HOST; production HTTP URLs, redirects, credentials in URLs and mismatched tokens are rejected. The endpoint must implement this gateway protocol; an arbitrary scanning provider's URL is not interchangeable.

6. Keep your existing S3 settings. AWS_REGION and AWS_ENDPOINT_URL_S3 now work as fallbacks for DOCUMENT_S3_REGION and DOCUMENT_S3_ENDPOINT. DOCUMENT_S3_BUCKET is still required.
7. Redeploy Vercel so the new environment settings take effect. Test one small synthetic TXT upload. If blocked, search the deployment logs for its new reference and diagnostic code.

An authenticated GET /health on the gateway performs a harmless real scan. It returns 200 only when the scanner succeeds; this checks availability, not signature freshness or detection completeness. The app POSTs raw bytes to /scan and only accepts {"verdict":"clean","sha256":"<hash of these exact bytes>"}. Infected results are rejected; unknown/error/malformed/oversized replies fail closed.

## Diagnose failures

| Diagnostic | Action |
| --- | --- |
| ECONNREFUSED | Start ClamAV; confirm host/port and wait for database loading. |
| ENOTFOUND / EAI_AGAIN | Fix hostname/DNS from the app's actual deployment network. |
| SCANNER_AUTH_FAILED | Make DOCUMENT_SCAN_TOKEN match SCANNER_GATEWAY_TOKEN; restart gateway/redeploy app after changing either. |
| SCANNER_BACKEND_UNAVAILABLE | Inspect gateway and ClamAV logs; service may be booting, busy or unavailable. |
| HTTPS_REQUIRED | Use a valid HTTPS /scan endpoint in production. |
| INVALID_TCP_CONFIG | Use a hostname/IP without a URL scheme and a valid numeric port. |
| SCANNER_TIMEOUT / TCP_CONNECTION_FAILED | Check networking, firewall and scanner capacity. |
| SCANNER_DIGEST_MISMATCH / INVALID_SCANNER_VERDICT | Endpoint does not implement the required protocol or returned an invalid result. |

## Retry the failed document

Once the scanner is healthy, refresh the record. If the failed attempt left a document with no available file, select it and upload a replacement version rather than creating duplicates. Failed attempts are terminal; reselect the file to start a new attempt. Already scanned downloads remain permission-checked and are no longer gated by scanner configuration.

## Verification and limits

Tests cover the protocol using synthetic TCP responses and gateway scans injected in the test process. No actual malware engine, external server, Docker deployment or Vercel networking was exercised here. The gateway does not store files or log their bodies. Deploy it on infrastructure under your control. Update container images/signatures and monitor readiness operationally. The existing app uploads still use bounded multipart requests; hosting body-size/time limits remain separate constraints.

Official references: https://docs.clamav.net/manual/Usage/Scanning.html and https://docs.clamav.net/manual/Installing/Docker.html
