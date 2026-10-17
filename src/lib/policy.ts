export type Action = "view" | "edit" | "export";
export type Membership = {
  id: string;
  role: string;
  active: boolean;
  expiresAt: Date | null;
  userId: string;
};
export type Grant = {
  membershipId: string;
  recordId: string;
  action: string;
  effect: string;
};
export function isActive(m: Membership, now = new Date()) {
  return m.active && (!m.expiresAt || m.expiresAt > now);
}
export function can(
  m: Membership,
  r: { id: string; createdBy: string },
  action: Action,
  grants: Grant[],
) {
  if (!isActive(m)) return false;
  if (action !== "view" && !can(m, r, "view", grants)) return false;
  const own = grants.filter(
    (g) => g.membershipId === m.id && g.recordId === r.id,
  );
  if (
    own.some(
      (g) =>
        g.effect === "deny" && (g.action === action || g.action === "view"),
    )
  )
    return false;
  if (["owner", "administrator"].includes(m.role)) return true;
  if (own.some((g) => g.effect === "allow" && g.action === action)) return true;
  return false; // Creation writes explicit view/edit grants; authorship alone is insufficient.
}
export function canCreate(m: Membership) {
  return (
    isActive(m) &&
    ["owner", "administrator", "asset-manager", "member"].includes(m.role)
  );
}
