"use client";
import { useEffect, useState } from "react";
import type { recordHistory } from "@/server/service";
import { api, errorText } from "@/lib/client";
import { formatMoney } from "@/lib/money";
type History = Awaited<ReturnType<typeof recordHistory>>;
export function RecordHistory({
  familyId,
  recordId,
  version,
  locale,
}: {
  familyId: string;
  recordId: string;
  version: number;
  locale: string;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const bn = locale === "bn";
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
