# Email reminders and personal preferences — 0.6.0

## Configure your preferences

Open **Settings → Email reminders** in a family workspace. Preferences belong to the current member and current family. Owners cannot use this screen/API to subscribe other members. A membership must be active, and recipients must have a verified email address. Defaults are disabled, Asia/Dhaka, 09:00, quiet hours 22:00–07:00, and advance intervals 0, 1 and 7 days.

Enable or disable each of the seven existing reminder categories: maturity, renewal, payment, maintenance, valuation, family responsibility and other. The selected categories share the personal schedule. Choose up to four advance intervals. The UI offers due day, 1, 3, 7, 14 and 30 days before; the API accepts integer intervals from 0 through 30. All delivery times and quiet hours use the chosen valid time zone. The preferred send time must fall outside quiet hours. Equal quiet-hour start/end times are rejected; disable quiet hours explicitly if desired.

In-app reminder dates remain calendar dates. Their dashboard “today” uses Bangladesh time; email scheduling uses the recipient's chosen time zone. A preferred delivery time is a scheduling threshold, not a guaranteed arrival time. At a daylight-saving clock jump, scheduling begins at the next observed eligible local time. A repeated clock hour does not create a second delivery for the same occurrence/interval.

Saving uses an optimistic settings version. If another tab saved first, reload and compare before saving again. Reloading settings replaces the unsaved form draft. Saving preferences does not edit reminders, their recurrence, record data or another person's preferences.

## Scheduler and queue

The existing supervised email worker visits a page of up to 25 opted-in preference rows approximately every 15 seconds, retaining a cursor and wrapping at the end. It considers active reminders on active records that the member can currently view. Permission filtering follows the same deny-overrides-allow policy as the app. Each family's record/reminder scan still follows the small-family architecture; large-scale SQL permission filtering and throughput guarantees remain future work.

A message is eligible when the recipient's local calendar date is exactly one selected interval before the current due date, local time is at/after the preferred time, and quiet hours are inactive. A worker restarted later that same day can queue it if still eligible. Missed prior days are not backfilled. There are no repeated overdue emails. Recurring reminders only advance when completed in the existing in-app workflow.

The unique delivery identity is family + recipient + reminder + due date + advance interval. Reservation and encrypted queue insertion share a database transaction. Advisory locks and the database uniqueness constraint prevent duplicate queued messages across scheduling passes. A queue/encryption failure rolls back the reservation. Separate advance intervals intentionally produce separate emails. Completion/reopening or rescheduling back to an already recorded occurrence date does not resend that occurrence/interval.

Messages use the branded HTML/plain-text template and contain no record names, reminder titles, monetary values, document details or notes. The link opens the app's Reminders view and selects the family if the current authenticated session has access. If authentication interrupts the deep link, sign in and choose that family and Reminders manually. The link contains no bearer token and grants no access.

## Before each send

The worker decrypts the job and rechecks the recipient's current verified email, active membership, View permission, record archive state, reminder status/due date, enabled categories/intervals, time zone and delivery window. Changed/disabled/ineligible jobs are cancelled, with encrypted message content cleared. Quiet hours or a later preferred time defer the job for five minutes without spending a provider retry attempt. Deferral can eventually reach the end of the scheduled day or the queue's existing 12-hour retention limit; those messages are cancelled/expired rather than sent on another day.

Dispatch renews its current lease before the provider call. Queue completion, cancellation and deferral are fenced by the lease token. A stale worker cannot overwrite a newer worker's queue state. The existing bounded provider retries, safe error classifications and stable provider idempotency keys remain in use. No raw recipient, token, message body or provider response is logged.

There is no distributed transaction between preference changes, database state and the mail provider. An opt-out, completion or permission revocation cannot recall an already submitted message, and a request already in flight may still arrive. Provider/network ambiguity still means delivery is at least once within the existing retry/idempotency constraints, not universally exactly once. Sent messages are generic to limit disclosure even during that unavoidable boundary.

## Delivery history

The preferences screen shows the latest 100 personal delivery attempts for this family, filtered through current record permissions. It displays the current reminder title/record name, due date, advance interval, queue creation time, safe error code and status. It does not expose encrypted payloads or another member's attempts. A revoked record's attempts are hidden.

- **Queued / Sending:** waiting or being attempted by the worker.
- **Accepted by email provider:** the provider accepted the request; inbox delivery, reading and bounce status are not confirmed.
- **Failed:** bounded retry budget or a permanent error stopped the job.
- **Cancelled:** reminder/access/preferences changed or its local delivery window ended.
- **Expired:** the existing queue retention window ended.

Refresh to see changes. Failed/cancelled/expired occurrence identities are retained and are not automatically re-enqueued. There is no manual resend or delivery-webhook UI in this release. Existing `npm run email:status` remains available to operators.

## API

`GET /api/families/:familyId/notifications` returns the current user's preferences and permission-filtered delivery history. `PUT` saves `{enabled,categories,advanceDays,timeZone,sendAt,quietEnabled,quietStart,quietEnd,version}`. A missing row has version 0; each successful save increments the version. Requests require a verified session, active membership and, for PUT, the exact Origin check. No recipient ID/email field is accepted.

## Deployment checks and remaining features

Apply migration 0005 before starting the new worker. Test live queue processing/provider acceptance, opt-out before send, revoked access, cancelled reminders and a quiet-hour transition using synthetic records and your own test recipient. Verify multiple-worker locking on actual PostgreSQL/Neon; embedded database tests do not establish production pooling/network behavior. Keep staging credentials separate and stop workers before restoring a backup or cloning production data. Do not run a production-configured worker against a copied queue.

This increment implements personal email delivery for existing manually created reminders. It does not yet implement push/SMS, snooze, automatic date-to-reminder generation, assignees/family-wide subscription administration, individual-record overrides, different schedules per category, all specialized master-spec notification categories, bounce webhooks or an in-app inbox. Authentication/security mail is not controlled by these optional reminder settings. Reminders do not establish that a legal, financial or family obligation has been fulfilled.
