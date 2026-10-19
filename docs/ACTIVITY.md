# Workspace activity — v0.9.0

Open Settings → Workspace activity as an active owner or administrator. Select an activity category and optional From/Through dates, then Apply / refresh. Both date boundaries use Bangladesh calendar dates (Asia/Dhaka). Older activity replaces the current page; Apply / refresh returns to newest events. Each page contains up to 25 events.

Includes events already recorded for records, valuations, ownership, payments/reversals, documents, reminders, members, workspace creation, notification preferences and exports. Historical entries are visible without a migration. Labels and dates adapt to Bengali/English; unrecognized future action codes appear verbatim.

## Authorization

Server verifies current active membership and owner/administrator role on every read. An explicit record view-denial overrides role access. Filtering happens before limit/cursor generation so denied events are not revealed through pagination. Cross-family and missing-record references are omitted. Workspace-level events are visible to authorized administrators. Actor names and record names reflect current profile/record values, not historical snapshots. The endpoint returns neither email addresses nor email bodies, document bytes, secrets or previous field values.

API: POST /api/families/:familyId/activity with JSON {group?,from?,to?,cursor?,limit?}. Existing session/origin checks and no-store responses apply. group supports all, record, asset, liability, document, reminder, member, family, notifications and records. Dates are YYYY-MM-DD. limit defaults to 25, maximum 50. Use returned nextCursor unchanged; results sort by exact database time then ID descending. New activity appears on refresh. Changing filters should start a new page sequence. The API does not expose a total count.

No audit update/delete endpoint is introduced. This is an application activity viewer, not evidence of database-level audit immutability or a complete restore archive. Events only have the detail recorded by existing operations; recipient/target metadata is not reconstructed when it was not logged. Existing operational privilege/retention hardening remains pending. Large deployments should evaluate indexes for their actual audit volume.

Upgrade: preserve environment/secrets, run npm ci, build and deploy. No database migration or new environment variables. Inngest function definitions are unchanged; normal deployment syncing may still occur. Browser and real-device checks remain deployment verification tasks.
