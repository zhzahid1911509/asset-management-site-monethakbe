# Member role management — v0.11.0

## Use

Sign in as the family owner. Open Settings → Family members → Change role. Select the new role, read the access explanation, tick the confirmation checkbox and save. Refresh members reloads current server state. Revoked and expired memberships cannot be edited; ownership cannot be assigned or transferred with this screen. Administrators can read the directory but cannot change roles. The form supports English/Bengali and small-screen dialogs.

Administrators receive broad record access except explicit denials. Other roles continue to use the existing record-grant system; changing a role does not clear grants. A read-only role can still have an explicit per-record edit allow under the existing override policy. Review record access separately when reducing permissions. No role-only change revokes explicit grants.

Existing access expiry is preserved, even when moving away from adviser. Moving to adviser caps access at 30 days or the existing earlier expiry. The operation cannot renew expired access or reactivate revoked membership. No email is sent.

## API

PATCH /api/families/:familyId/members/:membershipId

JSON: {"role":"read-only","expectedRole":"member","confirmed":true}

Allowed roles: administrator, asset-manager, member, read-only, adviser. Session and same-origin mutation checks apply. The owner membership is checked in the transaction; the target is family-scoped and locked for update. An expected-role mismatch returns MEMBER_CONFLICT (409). An inactive/expired target returns MEMBER_INACTIVE (409). Reload the directory before retrying a conflict. This compares the current role, not a full revision counter: an intervening change away and back to the same role is not detected. Same-role confirmed requests succeed without another audit event; repeated old-role requests return conflict after a successful change.

Role updates and their audit entries commit atomically. The existing action field records member.role.changed:<membership UUID>:<old role>:<new role>. The activity viewer renders this as a role transition plus membership identifier. Events store no copied member name/email. The membership UUID remains stable even if a user's profile changes. Authorization uses the updated role on subsequent requests; an already displayed page is refreshed separately.

## Upgrade

Replace the source, preserve your environment values, run npm ci and build/deploy as usual. No migration, new environment variables or Inngest changes are required. Existing mobile modal fixes are included.

## Remaining work

Re-invitation/reactivation, ownership transfer/recovery, custom roles and time-limited record grants are separate unfinished features. This release does not complete the full master specification.
