"use client";
import { useEffect, useState, useRef } from "react";
import type { recordHistory } from "@/server/service";
import { api, errorText } from "@/lib/client";
import { Button } from "./button";
import { bangladeshToday } from "@/lib/reminders";
import { formatMoney } from "@/lib/money";
type History = Awaited<ReturnType<typeof recordHistory>>;
export function RecordHistory({
  familyId,
  recordId,
  version,
  locale,
  canEdit,
  balanceAsOf,
  onSaved,
}: {
  familyId: string;
  recordId: string;
  version: number;
  locale: string;
  canEdit: boolean;
  balanceAsOf: string | null;
  onSaved: () => void;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const bn = locale === "bn";
  const [busy, setBusy] = useState(false),
    [mutationError, setMutationError] = useState("");
  const request = useRef({ fingerprint: "", key: crypto.randomUUID() });
  async function reverse(paymentId: string, f: FormData) {
    const data = {
      paymentId,
      version,
      reversedOn: f.get("reversedOn"),
      reason: f.get("reason"),
    };
    const fingerprint = JSON.stringify(data);
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setMutationError("");
    try {
      await api(
        `families/${familyId}/records/${recordId}/reversals`,
        "POST",
        data,
        request.current.key,
      );
      onSaved();
    } catch (e) {
      setMutationError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    setHistory(null);
    setError("");
    api<History>(`families/${familyId}/records/${recordId}/history`)
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [familyId, recordId, version, retry]);
  return (
    <section className="section-form">
      <h3>{bn ? "আর্থিক ইতিহাস" : "Financial history"}</h3>
      {mutationError && (
        <p role="alert" className="notice error">
          {mutationError}
        </p>
      )}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            {bn ? "আবার চেষ্টা করুন" : "Retry"}
          </button>
        </p>
      ) : !history ? (
        <p role="status">{bn ? "লোড হচ্ছে…" : "Loading…"}</p>
      ) : (
        <>
          {!history.valuations.length && !history.payments.length && (
            <p>{bn ? "এখনও কোনো লেনদেন নেই।" : "No entries yet."}</p>
          )}
          {history.valuations.map((v) => (
            <article key={v.id} className="detail-summary">
              <strong>{formatMoney(v.amount, locale)}</strong>
              <p>
                {v.asOf} · {v.source}
              </p>
            </article>
          ))}
          {history.payments.map((p) => (
            <article key={p.id} className="detail-summary">
              <strong>{p.paidOn}</strong>
              <p>
                {bn ? "মূলধন" : "Principal"}: {formatMoney(p.principal, locale)}{" "}
                · {bn ? "সুদ" : "Interest"}: {formatMoney(p.interest, locale)} ·{" "}
                {bn ? "ফি" : "Fees"}: {formatMoney(p.fees, locale)}
              </p>
              <p>
                {bn ? "বকেয়া" : "Balance"}:{" "}
                {formatMoney(p.balanceBefore, locale)} →{" "}
                {formatMoney(p.balanceAfter, locale)}
              </p>
              {p.note && <p>{p.note}</p>}
              {p.reversal ? (
                <div className="notice">
                  <strong>
                    {bn ? "পরিশোধটি বাতিল করা হয়েছে" : "Payment reversed"} ·{" "}
                    {p.reversal.reversedOn}
                  </strong>
                  <p>{p.reversal.reason}</p>
                  <p>
                    {bn ? "সংশোধনের সময় বকেয়া" : "Balance at correction"}:{" "}
                    {formatMoney(p.reversal.balanceBefore, locale)} →{" "}
                    {formatMoney(p.reversal.balanceAfter, locale)}
                  </p>
                </div>
              ) : (
                canEdit && (
                  <details className="payment-correction">
                    <summary>
                      {bn
                        ? "ভুল পরিশোধ সংশোধন করুন"
                        : "Correct an incorrect payment"}
                    </summary>
                    <p>
                      {bn
                        ? "এটি মূলধন বকেয়ায় ফিরিয়ে দেবে এবং সম্পূর্ণ পরিশোধটি বাতিল হিসেবে চিহ্নিত করবে। মূল ইতিহাস থাকবে। প্রয়োজনে পরে সঠিক পরিশোধ যোগ করুন।"
                        : "This restores principal to the balance and marks the entire payment reversed. Original history remains. Add a corrected payment separately if needed."}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void reverse(p.id, new FormData(e.currentTarget));
                      }}
                    >
                      <label>
                        {bn ? "সংশোধনের তারিখ" : "Correction date"}
                        <input
                          type="date"
                          name="reversedOn"
                          required
                          min={balanceAsOf ?? p.paidOn}
                          max={bangladeshToday()}
                          defaultValue={bangladeshToday()}
                        />
                      </label>
                      <label>
                        {bn ? "কারণ" : "Reason"}
                        <textarea
                          name="reason"
                          required
                          minLength={3}
                          maxLength={500}
                        />
                      </label>
                      <Button disabled={busy} variant="danger">
                        {bn ? "পরিশোধ বাতিল করুন" : "Reverse payment"}
                      </Button>
                    </form>
                  </details>
                )
              )}
            </article>
          ))}
          {history.hasMore && (
            <p>
              {bn
                ? "সর্বশেষ ১০০টি এন্ট্রি দেখানো হচ্ছে।"
                : "Showing the latest 100 entries."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
