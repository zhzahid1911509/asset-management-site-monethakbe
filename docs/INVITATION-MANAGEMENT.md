# Pending invitation management — v0.13.0

## Use

As family owner, open Settings → Pending invitations. The panel shows unused, unexpired invitations in pages of 25, newest first. Each entry shows email, role, re-invitation status and expiry in Dhaka time. Choose Cancel invitation and confirm the recipient to disable the link. Refresh returns to the first page; Next page displays older invitations. Sending an invitation or revoking membership refreshes the list automatically.

Cancelling an invitation never revokes an already accepted membership. If acceptance has already committed, cancellation returns a conflict and directs the owner to Family members. Cancelling an already expired/cancelled unused invitation is harmless and does not create another audit event. Old queued emails may still arrive, but the cancelled link cannot grant access.

This list reflects server state when loaded; it does not poll. Refresh to see acceptance/expiry changes from another browser. Expired, replaced, cancelled and accepted invitations are omitted. Historical cancellation events remain in Activity. No raw tokens, token hashes or acceptance links are returned.

## API

GET /api/families/:familyId/invitations

Returns entries and nextCursor. Follow with ?before=<cursor.before>&beforeId=<cursor.beforeId>; both parameters are required together. Cursor timestamp retains PostgreSQL microseconds and is paired with the UUID for stable tie ordering. Each page is checked against current family membership and owner role.

DELETE /api/families/:familyId/invitations/:invitationId

JSON body: {"confirmed":true}

Session and same-origin checks apply. Authorization is owner-only and family-scoped. The family invitation lock serializes cancellation with issuance, acceptance and membership revocation. The invitation row is locked and checked before expiring it. Audit action member.invitation.cancelled:<invitation UUID> identifies the cancelled link without copying recipient email or token data. Accepted invitations return INVITATION_ACCEPTED (409). Unknown/cross-family IDs return NOT_FOUND (404).

## Upgrade

No additional migration beyond v0.12.0 migration 0006. If upgrading from an earlier release, apply all bundled migrations with npm run db:migrate first. Preserve environment variables, run npm ci and npm run build, then deploy. Webpack remains the default.

Remaining work includes ownership transfer/recovery and custom roles. This release adds pending-link management, not email-provider delivery tracking or complete invitation-history reporting.
