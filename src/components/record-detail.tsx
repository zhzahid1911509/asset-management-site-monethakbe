"use client";
import { useState, useRef, useEffect } from "react";
import type { snapshot } from "@/server/service";
import { api, errorText } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { RecordMetadata } from "./record-metadata";
import { RecordHistory } from "./record-history";
import { Button } from "./button";
type Row = Awaited<ReturnType<typeof snapshot>>["records"][number];
export function RecordDetail({
  record: r,
  familyId,
  locale,
  role,
  advanced,
  onSaved,
}: {
  record: Row;
  familyId: string;
  locale: string;
  role: string;
  advanced: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [members, setMembers] = useState<
      { id: string; name: string; role: string }[]
    >([]);
  const request = useRef({ fingerprint: "", key: crypto.randomUUID() });
  const bn = locale === "bn";
  useEffect(() => {
    if (role === "owner")
      api<{ id: string; name: string; role: string }[]>(
        `families/${familyId}/members`,
      )
        .then(setMembers)
        .catch((e) => setError(errorText(e)));
  }, [familyId, role]);
  async function send(path: string, data: unknown, method = "POST") {
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify({ path, data, method });
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await api(
        `families/${familyId}/records/${r.id}${path}`,
        method,
        data,
        request.current.key,
      );
      request.current = { fingerprint: "", key: crypto.randomUUID() };
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="detail-summary">
        <span className="pill">{bn ? r.typeNameBn : r.typeNameEn}</span>
        <h2>
          {r.amount === null
            ? bn
              ? "মূল্য দেওয়া হয়নি"
              : "Not valued"
            : formatMoney(r.amount, locale)}
        </h2>
        <p>
          {r.kind === "asset"
            ? `${bn ? "পরিবারের অংশ" : "Family share"}: ${parseFloat(r.ownershipPercent)}%`
            : bn
              ? "পরিবারের নথিভুক্ত দায়"
              : "Recorded family liability"}
          {r.archived ? " · Archived" : ""}
        </p>
        {r.valuationDate && (
          <small>
            {r.valuationDate} · {r.valuationSource}
          </small>
        )}
        {(r.location || r.lender) && <p>{r.location || r.lender}</p>}
        {advanced && (
          <p className="fine-print">
            ID: {r.id}
            <br />
            Version: {r.version}
          </p>
        )}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {r.canEdit ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send(
                "",
                {
                  name: f.get("name"),
                  notes: f.get("notes"),
                  version: r.version,
                },
                "PATCH",
              );
            }}
          >
            <h3>{bn ? "রেকর্ড সম্পাদনা" : "Edit record"}</h3>
            <label>
              {bn ? "নাম" : "Name"}
              <input
                name="name"
                defaultValue={r.name}
                required
                minLength={2}
                maxLength={160}
              />
            </label>
            <label>
              {bn ? "নোট" : "Notes"}
              <textarea name="notes" defaultValue={r.notes} maxLength={3000} />
            </label>
            <Button disabled={busy} variant="secondary">
              {bn ? "পরিবর্তন সংরক্ষণ" : "Save changes"}
            </Button>
          </form>
          {r.kind === "asset" && (
            <form
              className="section-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send("/valuations", {
                  amount: f.get("amount"),
                  asOf: f.get("asOf"),
                  source: f.get("source"),
                  version: r.version,
                });
              }}
            >
              <h3>{bn ? "নতুন মূল্যায়ন" : "Add a valuation"}</h3>
              <p className="muted">
                {bn
                  ? "পুরোনো মূল্যায়ন মুছে যাবে না।"
                  : "Previous valuations are retained in the database."}
              </p>
              <div className="form-grid">
                <label>
                  {bn ? "সম্পূর্ণ মূল্য (৳)" : "Whole-asset value (৳)"}
                  <input
                    required
                    inputMode="decimal"
                    name="amount"
                    pattern="[0-9]+(\.[0-9]{1,2})?"
                  />
                </label>
                <label>
                  {bn ? "তারিখ" : "As-of date"}
                  <input
                    required
                    type="date"
                    name="asOf"
                    defaultValue={new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Dhaka",
                    }).format(new Date())}
                  />
                </label>
              </div>
              <label>
                {bn ? "উৎস" : "Source"}
                <input
                  name="source"
                  required
                  maxLength={200}
                  defaultValue="Manual estimate"
                />
              </label>
              <Button disabled={busy}>
                {bn ? "মূল্যায়ন সংরক্ষণ" : "Save valuation"}
              </Button>
            </form>
          )}
          {r.kind === "liability" && !r.archived && (
            <form
              className="section-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send("/payments", {
                  principal: f.get("principal"),
                  interest: f.get("interest"),
                  fees: f.get("fees"),
                  paidOn: f.get("paidOn"),
                  note: f.get("note"),
                  version: r.version,
                });
              }}
            >
              <h3>{bn ? "পরিশোধ নথিভুক্ত করুন" : "Record a repayment"}</h3>
              <p className="muted">
                {bn
                  ? "শুধু মূলধন বকেয়া কমায়। সুদ ও ফি আলাদা খরচ। এটি ব্যাংকে টাকা পাঠায় না।"
                  : "Only principal reduces the balance. Interest and fees are separate costs. This records a payment; it does not transfer money."}
              </p>
              <div className="form-grid">
                {[
                  ["principal", bn ? "মূলধন (৳)" : "Principal (৳)"],
                  ["interest", bn ? "সুদ (৳)" : "Interest (৳)"],
                  ["fees", bn ? "ফি (৳)" : "Fees (৳)"],
                ].map(([name, label]) => (
                  <label key={name}>
                    {label}
                    <input
                      name={name}
                      required
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,2})?"
                      defaultValue="0"
                    />
                  </label>
                ))}
                <label>
                  {bn ? "পরিশোধের তারিখ" : "Payment date"}
                  <input
                    name="paidOn"
                    type="date"
                    required
                    min={r.valuationDate ?? undefined}
                    max={new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Dhaka",
                    }).format(new Date())}
                    defaultValue={new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Dhaka",
                    }).format(new Date())}
                  />
                </label>
              </div>
              <label>
                {bn ? "নোট" : "Note"}
                <textarea name="note" maxLength={1000} />
              </label>
              <Button disabled={busy}>
                {bn ? "পরিশোধ সংরক্ষণ" : "Save repayment"}
              </Button>
            </form>
          )}
          <div className="section-form">
            <h3>
              {r.archived
                ? bn
                  ? "রেকর্ড ফিরিয়ে আনুন"
                  : "Restore record"
                : bn
                  ? "আর্কাইভ"
                  : "Archive record"}
            </h3>
            <p className="muted">
              {bn
                ? "আর্কাইভ করা রেকর্ড বর্তমান মোট হিসাবে অন্তর্ভুক্ত হয় না।"
                : "Archived records remain stored but are excluded from current totals."}
            </p>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => {
                if (
                  confirm(
                    r.archived
                      ? "Restore this record?"
                      : "Archive this record?",
                  )
                )
                  void send("/archive", {
                    archived: !r.archived,
                    version: r.version,
                  });
              }}
            >
              {r.archived
                ? bn
                  ? "ফিরিয়ে আনুন"
                  : "Restore"
                : bn
                  ? "আর্কাইভ করুন"
                  : "Archive"}
            </Button>
          </div>
        </>
      ) : (
        <p>
          {r.notes ||
            (bn
              ? "এই রেকর্ডে আপনার শুধু দেখার অনুমতি আছে।"
              : "You have read-only access to this record.")}
        </p>
      )}
      <RecordMetadata
        key={`${r.id}:${r.version}`}
        record={r}
        familyId={familyId}
        locale={locale}
        onSaved={onSaved}
      />
      <RecordHistory
        canEdit={r.canEdit && !r.archived}
        balanceAsOf={r.valuationDate}
        onSaved={onSaved}
        familyId={familyId}
        recordId={r.id}
        version={r.version}
        locale={locale}
      />
      {role === "owner" && (
        <form
          className="section-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send("/grants", {
              membershipId: f.get("membershipId"),
              action: f.get("action"),
              effect: f.get("effect"),
            });
          }}
        >
          <h3>{bn ? "রেকর্ডের অনুমতি" : "Record permissions"}</h3>
          <p className="muted">
            {bn
              ? "একটি নিষেধাজ্ঞা অনুমতির চেয়ে অগ্রাধিকার পায়।"
              : "A deny overrides an allow. Grant view separately before edit or export."}
          </p>
          <label>
            {bn ? "সদস্য" : "Member"}
            <select name="membershipId" required defaultValue="">
              <option value="">
                {bn ? "সদস্য বেছে নিন" : "Choose member"}
              </option>
              {members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              {bn ? "কাজ" : "Action"}
              <select name="action">
                <option value="view">View</option>
                <option value="edit">Edit / archive / value</option>
                <option value="export">Export</option>
              </select>
            </label>
            <label>
              {bn ? "সিদ্ধান্ত" : "Effect"}
              <select name="effect">
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
              </select>
            </label>
          </div>
          <Button variant="secondary" disabled={busy}>
            {bn ? "অনুমতি সংরক্ষণ" : "Save permission"}
          </Button>
        </form>
      )}
    </div>
  );
}
