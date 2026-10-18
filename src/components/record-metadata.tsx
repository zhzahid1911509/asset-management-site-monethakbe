"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { snapshot, recordMetadata } from "@/server/service";
import { parseDetails } from "@/lib/record-details";
import {
  ownershipInput,
  ownershipCapacities,
  type OwnerEntry,
} from "@/lib/ownership";
import { api, errorText } from "@/lib/client";
import { CategoryFields } from "./category-fields";
import { Button } from "./button";
type Row = Awaited<ReturnType<typeof snapshot>>["records"][number];
type History = Awaited<ReturnType<typeof recordMetadata>>;
const capacityLabels: Record<OwnerEntry["capacity"], [string, string]> = {
  "legal-owner": ["Legal owner", "আইনি মালিক"],
  "beneficial-owner": ["Beneficial owner", "সুবিধাভোগী মালিক"],
  "legal-and-beneficial": [
    "Legal and beneficial owner",
    "আইনি ও সুবিধাভোগী মালিক",
  ],
  manager: ["Manager", "ব্যবস্থাপক"],
  possessor: ["Possessor", "দখলকারী"],
};
function Owners({ owners, locale }: { owners: OwnerEntry[]; locale: string }) {
  const bn = locale === "bn";
  return (
    <ul className="owner-list">
      {owners.map((o) => (
        <li key={o.id}>
          <strong>{o.name}</strong> · {capacityLabels[o.capacity][bn ? 1 : 0]}
          <p>
            {bn ? "আইনি অংশ" : "Legal share"}: {o.legalPercent ?? "—"}% ·{" "}
            {bn ? "অর্থনৈতিক অংশ" : "Economic share"}:{" "}
            {o.economicPercent ?? "—"}%
          </p>
          <small>
            {o.includedInFamily
              ? bn
                ? "পরিবারের হিসাবে অন্তর্ভুক্ত"
                : "Included in family totals"
              : bn
                ? "পরিবারের হিসাবে অন্তর্ভুক্ত নয়"
                : "Not included in family totals"}
          </small>
        </li>
      ))}
    </ul>
  );
}
export function RecordMetadata({
  record: r,
  familyId,
  locale,
  onSaved,
}: {
  record: Row;
  familyId: string;
  locale: string;
  onSaved: () => void;
}) {
  const bn = locale === "bn",
    editable = r.canEdit && !r.archived;
  const [details, setDetails] = useState(r.details);
  const [owners, setOwners] = useState<OwnerEntry[]>(r.owners);
  const [familyShare, setFamilyShare] = useState(r.ownershipPercent);
  const [asOf, setAsOf] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(
      new Date(),
    ),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [history, setHistory] = useState<History | null>(null),
    [historyError, setHistoryError] = useState(""),
    [retry, setRetry] = useState(0);
  const request = useRef({ fingerprint: "", key: crypto.randomUUID() });
  useEffect(() => {
    let active = true;
    setHistoryError("");
    api<History>(`families/${familyId}/records/${r.id}/metadata`)
      .then((v) => {
        if (active) setHistory(v);
      })
      .catch((e) => {
        if (active) setHistoryError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [familyId, r.id, r.version, retry]);
  async function send(action: string, prepare: () => unknown) {
    setBusy(true);
    setError("");
    try {
      const data = prepare(),
        fingerprint = JSON.stringify({ action, data });
      if (fingerprint !== request.current.fingerprint)
        request.current = { fingerprint, key: crypto.randomUUID() };
      await api(
        `families/${familyId}/records/${r.id}/${action}`,
        "POST",
        data,
        request.current.key,
      );
      request.current = { fingerprint: "", key: crypto.randomUUID() };
      onSaved();
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ")
          : errorText(e),
      );
    } finally {
      setBusy(false);
    }
  }
  function updateOwner(index: number, patch: Partial<OwnerEntry>) {
    setOwners((old) =>
      old.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );
  }
  return (
    <div className="record-metadata">
      <section className="section-form">
        <h3>{bn ? "ধরন অনুযায়ী তথ্য" : "Category details"}</h3>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {editable ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send("details", () => ({
                details: parseDetails(r.categoryCode, details),
                version: r.version,
              }));
            }}
          >
            <CategoryFields
              category={r.categoryCode}
              values={details}
              onChange={setDetails}
              locale={locale}
              disabled={busy}
            />
            <Button disabled={busy}>
              {bn ? "তথ্য সংরক্ষণ" : "Save details"}
            </Button>
          </form>
        ) : Object.keys(details).length ? (
          <CategoryFields
            category={r.categoryCode}
            values={details}
            locale={locale}
          />
        ) : (
          <p className="muted">
            {bn ? "অতিরিক্ত তথ্য নেই।" : "No additional details recorded."}
          </p>
        )}
      </section>
      {r.kind === "asset" && (
        <section className="section-form">
          <h3>{bn ? "মালিকানা ও দায়িত্ব" : "Ownership and responsibility"}</h3>
          <p className="muted">
            {bn
              ? "পরিবারের অর্থনৈতিক অংশ মোট মূল্যের হিসাবে ব্যবহৃত হয়। আইনি অংশ আলাদা। নাম যোগ করলে প্রবেশাধিকার দেওয়া হয় না।"
              : "The family economic share determines included value. Legal shares are recorded separately. Adding a name does not grant access."}
          </p>
          <p className="fine-print">
            {bn
              ? "আপনার দেওয়া তথ্য সংরক্ষিত হয়; আইনি মালিকানা যাচাই বা উত্তরাধিকারের অংশ নির্ধারণ করা হয় না।"
              : "These are your records; legal ownership is not verified and inheritance shares are not calculated."}
          </p>
          {editable ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send("ownership", () =>
                  ownershipInput.parse({
                    version: r.version,
                    asOf,
                    familyShare,
                    owners,
                    reason,
                  }),
                );
              }}
            >
              {owners.map((o, i) => (
                <fieldset className="owner-editor" key={o.id} disabled={busy}>
                  <legend>
                    {bn ? "পক্ষ" : "Party"} {i + 1}
                  </legend>
                  <div className="form-grid">
                    <label>
                      {bn ? "নাম" : "Name"}
                      <input
                        required
                        maxLength={120}
                        value={o.name}
                        onChange={(e) =>
                          updateOwner(i, { name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {bn ? "ভূমিকা" : "Capacity"}
                      <select
                        value={o.capacity}
                        onChange={(e) => {
                          const capacity = e.target
                            .value as OwnerEntry["capacity"];
                          updateOwner(i, {
                            capacity,
                            legalPercent: undefined,
                            economicPercent: undefined,
                            includedInFamily: false,
                          });
                        }}
                      >
                        {ownershipCapacities.map((c) => (
                          <option key={c} value={c}>
                            {capacityLabels[c][bn ? 1 : 0]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-grid">
                    {["legal-owner", "legal-and-beneficial"].includes(
                      o.capacity,
                    ) && (
                      <label>
                        {bn
                          ? "আইনি অংশ (%) — অজানা হলে খালি"
                          : "Legal share (%) — blank if unknown"}
                        <input
                          inputMode="decimal"
                          value={o.legalPercent ?? ""}
                          onChange={(e) =>
                            updateOwner(i, {
                              legalPercent: e.target.value || undefined,
                            })
                          }
                        />
                      </label>
                    )}
                    {["beneficial-owner", "legal-and-beneficial"].includes(
                      o.capacity,
                    ) && (
                      <label>
                        {bn ? "অর্থনৈতিক অংশ (%)" : "Economic share (%)"}
                        <input
                          inputMode="decimal"
                          value={o.economicPercent ?? ""}
                          onChange={(e) =>
                            updateOwner(i, {
                              economicPercent: e.target.value || undefined,
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                  {["beneficial-owner", "legal-and-beneficial"].includes(
                    o.capacity,
                  ) && (
                    <label className="owner-check">
                      <input
                        type="checkbox"
                        checked={o.includedInFamily}
                        onChange={(e) =>
                          updateOwner(i, { includedInFamily: e.target.checked })
                        }
                      />
                      {bn
                        ? "পরিবারের মোট হিসাবে অন্তর্ভুক্ত"
                        : "Include in family totals"}
                    </label>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setOwners((old) => old.filter((_, index) => index !== i))
                    }
                  >
                    {bn ? "এই পক্ষ সরান" : "Remove party"}
                  </Button>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={busy || owners.length >= 20}
                onClick={() =>
                  setOwners((old) => [
                    ...old,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      capacity: "legal-and-beneficial",
                      includedInFamily: false,
                    },
                  ])
                }
              >
                {bn
                  ? "মালিক / দায়িত্বশীল ব্যক্তি যোগ করুন"
                  : "Add owner / responsible party"}
              </Button>
              <div className="form-grid ownership-controls">
                <label>
                  {bn
                    ? "পরিবারের অন্তর্ভুক্ত অর্থনৈতিক অংশ (%)"
                    : "Included family economic share (%)"}
                  <input
                    required
                    inputMode="decimal"
                    value={familyShare}
                    onChange={(e) => setFamilyShare(e.target.value)}
                  />
                  <small>
                    {bn
                      ? "পক্ষ থাকলে অন্তর্ভুক্ত পক্ষগুলোর অর্থনৈতিক অংশের যোগফলের সমান হতে হবে।"
                      : "When parties are listed, this must equal the sum of included economic shares."}
                  </small>
                </label>
                <label>
                  {bn ? "কার্যকর তারিখ" : "Effective date"}
                  <input
                    required
                    type="date"
                    min={r.ownershipAsOf ?? undefined}
                    max={new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Dhaka",
                    }).format(new Date())}
                    value={asOf}
                    onChange={(e) => setAsOf(e.target.value)}
                  />
                </label>
              </div>
              <label>
                {bn ? "পরিবর্তনের কারণ / উৎস" : "Reason / source of change"}
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <Button disabled={busy}>
                {bn ? "মালিকানা সংরক্ষণ" : "Save ownership"}
              </Button>
            </form>
          ) : (
            <>
              <p>
                {bn ? "পরিবারের অংশ" : "Family share"}: {r.ownershipPercent}% ·{" "}
                {r.ownershipAsOf ??
                  (bn ? "কার্যকর তারিখ অজানা" : "Effective date unknown")}
              </p>
              <Owners owners={r.owners} locale={locale} />
            </>
          )}
        </section>
      )}
      <section className="section-form">
        <h3>
          {bn ? "তথ্য ও মালিকানার ইতিহাস" : "Details and ownership history"}
        </h3>
        {historyError ? (
          <p role="alert">
            {historyError}{" "}
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              {bn ? "আবার চেষ্টা করুন" : "Retry"}
            </button>
          </p>
        ) : !history ? (
          <p role="status">{bn ? "লোড হচ্ছে…" : "Loading…"}</p>
        ) : (
          <>
            {history.ownershipHistory.map((h) => (
              <details key={h.id} className="metadata-revision">
                <summary>
                  {bn ? "মালিকানা" : "Ownership"}:{" "}
                  {h.asOf ??
                    (bn
                      ? "কার্যকর তারিখ অজানা"
                      : "Effective date unknown")}{" "}
                  · {h.familyShare}%
                </summary>
                <p>{h.reason}</p>
                <Owners owners={h.owners} locale={locale} />
                <small>
                  {bn ? "নথিভুক্ত" : "Recorded"}:{" "}
                  {new Date(h.createdAt).toLocaleString(
                    locale === "bn" ? "bn-BD" : "en-GB",
                    { timeZone: "Asia/Dhaka" },
                  )}
                </small>
              </details>
            ))}
            {history.detailHistory.map((h) => (
              <details key={h.id} className="metadata-revision">
                <summary>
                  {bn ? "তথ্য" : "Details"} ·{" "}
                  {new Date(h.createdAt).toLocaleString(
                    locale === "bn" ? "bn-BD" : "en-GB",
                    { timeZone: "Asia/Dhaka" },
                  )}
                </summary>
                {Object.keys(h.details).length ? (
                  <CategoryFields
                    category={r.categoryCode}
                    values={h.details}
                    locale={locale}
                  />
                ) : (
                  <p>
                    {bn
                      ? "অতিরিক্ত তথ্য ছিল না।"
                      : "No additional details at this revision."}
                  </p>
                )}
              </details>
            ))}
            {history.hasMore && (
              <p>
                {bn
                  ? "প্রতিটি ধরনের সর্বশেষ ১০০টি সংস্করণ দেখানো হচ্ছে।"
                  : "Showing the latest 100 revisions of each kind."}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
