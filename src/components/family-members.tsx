"use client";
import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/client";
import { Button } from "./button";
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  expiresAt: string | null;
};
export function FamilyMembers({
  familyId,
  role,
  locale,
}: {
  familyId: string;
  role: string;
  locale: string;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const bn = locale === "bn";
  useEffect(() => {
    if (["owner", "administrator"].includes(role))
      api<Member[]>(`families/${familyId}/members`)
        .then(setMembers)
        .catch((e) => setError(errorText(e)));
  }, [familyId, role]);
  if (!["owner", "administrator"].includes(role))
    return (
      <section className="panel settings-panel">
        <h2>{bn ? "পরিবারের সদস্য" : "Family membership"}</h2>
        <p>
          {bn
            ? "সদস্যদের তালিকা পরিচালনার অনুমতি নেই।"
            : "Your role does not include access to the member directory."}
        </p>
        <p>
          {bn ? "আপনার ভূমিকা" : "Your role"}: {role}
        </p>
      </section>
    );
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <h2>{bn ? "পরিবারের সদস্য" : "Family members"}</h2>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <div className="member-list">
          {members.map((m) => (
            <div key={m.id}>
              <span className="avatar">{m.name[0]}</span>
              <span>
                <strong>{m.name}</strong>
                <small>{m.email}</small>
                <small>
                  {m.role} · {m.active ? "Active" : "Revoked"}
                  {m.expiresAt
                    ? " · expires " + new Date(m.expiresAt).toLocaleDateString()
                    : ""}
                </small>
              </span>
              {role === "owner" && m.role !== "owner" && m.active && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm("Revoke this member’s workspace access?"))
                      return;
                    setBusy(true);
                    try {
                      await api(
                        `families/${familyId}/members/${m.id}`,
                        "DELETE",
                      );
                      setMembers(
                        await api<Member[]>(`families/${familyId}/members`),
                      );
                    } catch (e) {
                      setError(errorText(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {bn ? "প্রবেশাধিকার বাতিল" : "Revoke"}
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
      {role === "owner" && (
        <section className="panel settings-panel">
          <h2>{bn ? "পরিবারকে আমন্ত্রণ জানান" : "Invite your family"}</h2>
          <p className="muted">
            {bn
              ? "ইমেইলে আমন্ত্রণ যাবে। লিংক ৪৮ ঘণ্টা কার্যকর থাকবে।"
              : "An invitation email will be queued. The link expires in 48 hours."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              setBusy(true);
              setError("");
              try {
                await api(`families/${familyId}/invitations`, "POST", {
                  email: f.get("email"),
                  role: f.get("role"),
                });
                setNotice(
                  bn
                    ? "আমন্ত্রণ ইমেইল পাঠানোর জন্য সারিতে রাখা হয়েছে।"
                    : "Invitation queued for email delivery.",
                );
                form.reset();
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {bn ? "ইমেইল" : "Email"}
              <input type="email" name="email" required />
            </label>
            <label>
              {bn ? "ভূমিকা" : "Role"}
              <select name="role" defaultValue="member">
                <option value="member">Family member</option>
                <option value="read-only">Read-only member</option>
                <option value="asset-manager">Asset manager</option>
                <option value="administrator">Administrator</option>
                <option value="adviser">Adviser (30-day access)</option>
              </select>
            </label>
            <Button disabled={busy}>
              {bn ? "আমন্ত্রণ পাঠান" : "Send invitation"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
