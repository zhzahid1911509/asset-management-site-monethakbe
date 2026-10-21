# Member re-invitations — v0.12.0

## Upgrade first

Preserve your existing .env and deployment environment variables. Replace the source and run:

```powershell
npm ci
npm run db:migrate
npm run build
npm run dev
```

The additive migration `0006_member_reinvitations.sql` adds a nullable invitation reactivation marker. Run the migration against the correct Neon database before deploying the new application code; no new environment variables are needed. The migration does not delete or modify existing records. Existing invitations for first-time members remain valid, but old invitations cannot reactivate an existing inactive membership. Issue a new invitation for those members. Development and build commands now use Webpack by default.

## Owner workflow

Open Settings → Family members. Revoked or expired non-owner members have a Re-invite button. It fills their email into the invitation form and defaults to Read-only. Select the intended role, review the explanation and choose Send invitation. You may also enter an inactive member's email directly. Sending an invitation does not reactivate access. The recipient must sign in with the verified email address and accept the new link within 48 hours. The newest invitation replaces earlier links for that family/email. An active member uses Change role instead.

When the member rejoins:

- Their membership ID, authored records and historical references remain intact.
- All old record-level grants and denials for this membership are removed. Regrant the required access afterward. Administrator re-invitations confer the role's broad access; choose that role deliberately.
- Personal reminder email is disabled and its settings version advances. The member can opt in again.
- The newly selected role applies. Adviser access expires 30 days after acceptance; other roles have no automatic expiry.

## Security and concurrency

Invitation issuing remains owner-only. Acceptance checks the signed-in recipient email, expiry, one-use status, issuer's current active owner membership, and target inactive membership. Re-invitations are explicitly tied to the existing membership; legacy invitation tokens cannot reactivate it. Repeated revocation cancels pending re-invitations too. Family-scoped transaction advisory locks serialize issuing, acceptance and revocation; row locks protect the target state. Access restoration, permission cleanup, notification reset, token consumption and audit event commit together.

Old encrypted emails may still be delivered from the queue, but superseded/invalidated links cannot grant access. Email provider delivery is not guaranteed by an invitation being queued. No email is sent by automated tests. Existing same-origin/session controls remain in force. API paths remain POST /api/families/:familyId/invitations and POST /api/invitations/accept. Activity shows member.reinvited and member.rejoined.

## Limits

This does not implement ownership transfer/recovery, custom roles, an invitation listing/cancellation screen, or historical before/after membership snapshots. Live Neon concurrency and deployed email delivery require deployment verification.
