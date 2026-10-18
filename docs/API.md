# Foundation API

All application routes require a verified Better Auth database session. Mutations require an exact `Origin` matching `APP_ORIGIN`. JSON request bodies are capped at 32 KiB. All data is returned with `Cache-Control: no-store`.

| Method and path                                     | Behavior                                                |
| --------------------------------------------------- | ------------------------------------------------------- |
| GET `/api/families`                                 | Active, unexpired workspaces for the authenticated user |
| POST `/api/families`                                | Create workspace + owner membership; body `{name}`      |
| GET `/api/catalog`                                  | Bilingual catalog                                       |
| GET `/api/families/:family/snapshot`                | Permitted records, exact totals, preferences and role   |
| POST `/api/families/:family/records`                | Create asset/liability; idempotency header required     |
| PATCH `/api/families/:family/records/:id`           | Name/notes update with expected `version`               |
| POST `/api/families/:family/records/:id/valuations` | Append value with `amount`, `asOf`, `source`, `version` |
| POST `/api/families/:family/records/:id/archive`    | Set `archived` with expected `version`                  |
| POST `/api/families/:family/records/:id/grants`     | Owner sets `membershipId`, `action`, `effect`           |
| GET `/api/families/:family/members`                 | Owner/admin member directory                            |
| DELETE `/api/families/:family/members/:id`          | Owner revokes non-owner member                          |
| POST `/api/families/:family/invitations`            | Owner queues invitation `{email,role}`                  |
| POST `/api/invitations/accept`                      | Verified recipient accepts `{token}`                    |
| PUT `/api/families/:family/preferences`             | `{locale:"bn"                                           | "en",mode:"simple" | "advanced"}` |
| POST `/api/families/:family/export`                 | Authorized current-record JSON; audited                 |
| GET/POST `/api/auth/*`                              | Better Auth handlers; use the supported client          |

For record create/edit/archive/valuation, supply a UUID `Idempotency-Key`. Keep the same key and payload when retrying an uncertain result. A different payload with the same committed key returns 409. Replayed results are re-authorized.

Amounts and percentages are decimal strings. Record input:

```json
{
  "kind": "asset",
  "typeCode": "property.apartment",
  "name": "Family apartment",
  "amount": "10000000.00",
  "ownershipPercent": "50",
  "asOf": "2026-01-01",
  "source": "Manual estimate",
  "location": "Dhaka",
  "notes": "Synthetic example only"
}
```

Omit amount for an unknown asset valuation. Liability amounts are required and represent the family's included outstanding balance. No foreign currency conversion is performed.

Errors return `{error:{code,message,correlationId,retryable,fields}}`. Hidden records/workspaces return not-found. A conflict preserves the original committed record and requires reload/compare. Runtime error logs contain only event/code/correlation ID; raw database/provider errors and request bodies are not logged by the application boundary.

## Documents (0.5.0)

All routes below use `/api/families/:familyId/records/:recordId`. Authentication and active membership are required. Mutations require the exact APP_ORIGIN Origin header.

| Method / suffix | Permission | Behavior |
| --- | --- | --- |
| GET `/documents` | View | Metadata list and setup-presence flag |
| POST `/documents` | Edit | Multipart `file` and JSON-string `metadata`; UUID Idempotency-Key required |
| GET `/documents/:documentId` | View | Latest 100 versions and events |
| PATCH `/documents/:documentId` | Edit | JSON metadata/archive state; version and Idempotency-Key required |
| GET `/document-files/:versionId` | Export | Private attachment bytes; `?preview=1` allows PNG/JPEG inline only |

Upload metadata: `{title, description, category, tags, version, documentId?}`. Omit documentId for a new document; include it for a replacement. PATCH metadata: `{title, description, category, tags, version, archived}`. Version refers to the parent record version. Successful publication/edit advances it. Available upload retries return the same IDs; active/failed retries return a safe conflict. Download responses are binary with no-store and request ID headers. Limits and recovery: DOCUMENTS.md.

## Notification preferences (0.6.0)

GET/PUT `/api/families/:familyId/notifications` reads/saves the authenticated member's personal settings. GET also returns the latest 100 personal delivery attempts, filtered by current record permissions. PUT uses an optimistic preference version (0 when absent); it does not accept another recipient or member ID. See NOTIFICATIONS.md for the JSON fields, schedule semantics and status meanings.
