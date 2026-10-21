"use client";
import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/client";
import { Modal } from "./modal";
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
  const [editing, setEditing] = useState<Member | null>(null),
    [nextRole, setNextRole] = useState("member"),
    [confirmed, setConfirmed] = useState(false),
    [editError, setEditError] = useState("");
  const [members, setMembers] = useState<Member[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const bn = locale === "bn";
  useEffect(() => {
    let cancelled = false;
    setMembers([]); setEditing(null); setError(""); setNotice("");
    if (["owner", "administrator"].includes(role))
      api<Member[]>(`families/${familyId}/members`)
        .then((data) => { if (!cancelled) setMembers(data); })
        .catch((e) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
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
        <Button variant="secondary" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { setMembers(await api<Member[]>(`families/${familyId}/members`)); }
          catch(e) { setError(errorText(e)); } finally { setBusy(false); }
        }}>{bn ? "তালিকা রিফ্রেশ করুন" : "Refresh members"}</Button>
        <div className="member-list">
          {members.map((m) => (
            <div key={m.id}>
              <span className="avatar">{m.name[0]}</span>
              <span>
                <strong>{m.name}</strong>
                <small>{m.email}</small>
                <small>
                  {m.role} · {!m.active ? "Revoked" : m.expiresAt && new Date(m.expiresAt) <= new Date() ? "Expired" : "Active"}
                  {m.expiresAt
                    ? " · expires " + new Date(m.expiresAt).toLocaleDateString()
                    : ""}
                </small>
              </span>
              {role === "owner" && m.role !== "owner" && m.active &&
                (!m.expiresAt || new Date(m.expiresAt) > new Date()) && (
                <Button variant="secondary" disabled={busy} onClick={() => {
                  setEditing(m); setNextRole(m.role); setConfirmed(false); setEditError("");
                }}>{bn ? "ভূমিকা পরিবর্তন" : "Change role"}</Button>
              )}
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
      {editing && <Modal title={bn ? "সদস্যের ভূমিকা পরিবর্তন" : "Change member role"}
        onClose={() => setEditing(null)}>
        <form onSubmit={async e => {
          e.preventDefault(); setBusy(true); setEditError("");
          try {
            await api(`families/${familyId}/members/${editing.id}`, "PATCH", {
              role: nextRole, expectedRole: editing.role, confirmed,
            });
            setEditing(null);
            setNotice(bn ? "ভূমিকা পরিবর্তন হয়েছে।" : "Member role updated.");
            setMembers(await api<Member[]>(`families/${familyId}/members`));
          } catch(e) { setEditError(errorText(e)); setError(errorText(e)); }
          finally { setBusy(false); }
        }}>
          <p><strong>{editing.name}</strong> · {editing.email}</p>
          <p>{bn ? "বর্তমান ভূমিকা" : "Current role"}: {editing.role}</p>
          <label>{bn ? "নতুন ভূমিকা" : "New role"}
            <select value={nextRole} disabled={busy} onChange={e => {setNextRole(e.target.value); setConfirmed(false);}}>
              <option value="administrator">{bn ? "পরিবার প্রশাসক" : "Administrator"}</option>
              <option value="asset-manager">{bn ? "সম্পদ ব্যবস্থাপক" : "Asset manager"}</option>
              <option value="member">{bn ? "পরিবারের সদস্য" : "Family member"}</option>
              <option value="read-only">{bn ? "শুধু দেখার সদস্য" : "Read-only member"}</option>
              <option value="adviser">{bn ? "উপদেষ্টা" : "Adviser"}</option>
            </select>
          </label>
          <p className="notice">{bn
            ? "প্রশাসক সাধারণত সব রেকর্ড দেখতে, সম্পাদনা ও রপ্তানি করতে পারেন। রেকর্ডভিত্তিক অনুমতি ও নিষেধাজ্ঞা বহাল থাকবে—ভূমিকা কমালেও পূর্বের সম্পাদনার অনুমতি বাতিল হবে না। বিদ্যমান মেয়াদ বাড়বে না; নতুন উপদেষ্টার মেয়াদ সর্বোচ্চ ৩০ দিন।"
            : "Administrators can generally view, edit and export all records. Record-specific grants and denials remain in force: reducing a role does not remove existing edit grants. Existing access expiry is preserved; newly assigned advisers receive at most 30 days."}</p>
          <label className="checkbox"><input type="checkbox" checked={confirmed} disabled={busy}
            onChange={e => setConfirmed(e.target.checked)} required />
            {bn ? "আমি এই প্রবেশাধিকারের পরিবর্তন নিশ্চিত করছি।" : "I confirm this access change."}</label>
          {editError && <p role="alert" className="notice error">{editError}</p>}
          <Button disabled={busy || !confirmed || nextRole === editing.role}>
            {busy ? (bn ? "সংরক্ষণ হচ্ছে…" : "Saving…") : (bn ? "ভূমিকা সংরক্ষণ" : "Save role")}</Button>
        </form>
      </Modal>}
    </div>
  );
}
