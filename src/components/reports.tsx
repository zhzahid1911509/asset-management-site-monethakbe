"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Report, ReportOptions } from "@/lib/reports";
import { api, errorText } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { Button } from "./button";
function ReportView({
  report,
  bn,
  printing = false,
}: {
  report: Report;
  bn: boolean;
  printing?: boolean;
}) {
  return (
    <div className="report-content">
      {printing && (
        <img src="/brand/logo-light.png" alt="মনে থাকবে" width="140" height="94" />
      )}
      <h2>
        {report.family.name} ·{" "}
        {bn ? "বর্তমান রেকর্ডের প্রতিবেদন" : "Current records report"}
      </h2>
      <p>
        {new Date(report.generatedAt).toLocaleString(bn ? "bn-BD" : "en-GB", {
          timeZone: "Asia/Dhaka",
        })}{" "}
        · BDT
      </p>
      <p className="fine-print">
        {bn
          ? "শুধু দেখার ও এক্সপোর্টের অনুমতি থাকা রেকর্ড। আর্কাইভ মোট হিসাবে নেই। এটি পূর্ণ ব্যাকআপ বা ঐতিহাসিক মূল্যায়ন নয়।"
          : "Only records you may view and export. Archived rows do not affect totals. This is not a full backup or historical valuation."}
      </p>
      <p>
        {bn ? "ফিল্টার" : "Filters"}: {report.filters.kind} ·{" "}
        {report.filters.category || "All categories"} ·{" "}
        {report.filters.includeArchived
          ? "Includes archived rows"
          : "Active rows only"}
      </p>
      <div className="report-totals">
        {[
          [bn ? "সম্পদ" : "Assets", report.totals.assets],
          [bn ? "দায়" : "Liabilities", report.totals.liabilities],
          [
            bn ? "আনুমানিক নিট সম্পদ" : "Estimated net worth",
            report.totals.netWorth,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{formatMoney(value, bn ? "bn" : "en")}</strong>
          </div>
        ))}
      </div>
      <p>
        {report.activeCount} {bn ? "সক্রিয় রেকর্ড" : "active records"} ·{" "}
        {report.totals.unknown}{" "}
        {bn ? "রেকর্ডের মূল্য অজানা" : "records without a value"}
      </p>
      <h3>{bn ? "বিভাগ অনুযায়ী" : "By category"}</h3>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable records table">
        <table>
          <thead>
            <tr>
              <th>{bn ? "বিভাগ" : "Category"}</th>
              <th>{bn ? "সক্রিয়" : "Active"}</th>
              <th>{bn ? "সম্পদ" : "Assets"}</th>
              <th>{bn ? "দায়" : "Liabilities"}</th>
            </tr>
          </thead>
          <tbody>
            {report.categories.map((c) => (
              <tr key={c.code}>
                <td>{bn ? c.nameBn : c.nameEn}</td>
                <td>{c.count}</td>
                <td>{formatMoney(c.assets, bn ? "bn" : "en")}</td>
                <td>{formatMoney(c.liabilities, bn ? "bn" : "en")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>{bn ? "রেকর্ডসমূহ" : "Records"}</h3>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable records table">
        <table>
          <thead>
            <tr>
              <th>{bn ? "নাম" : "Name"}</th>
              <th>{bn ? "ধরন" : "Kind"}</th>
              <th>{bn ? "পূর্ণ মূল্য / বকেয়া" : "Whole value / balance"}</th>
              <th>{bn ? "পরিবারের অংশ" : "Family share"}</th>
              <th>{bn ? "অন্তর্ভুক্ত মূল্য" : "Included value"}</th>
              <th>{bn ? "তারিখ" : "As of"}</th>
            </tr>
          </thead>
          <tbody>
            {report.records.slice(0, printing ? 5000 : 100).map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  {r.archived ? " (Archived)" : ""}
                </td>
                <td>{r.kind}</td>
                <td>
                  {r.amount === null
                    ? "—"
                    : formatMoney(r.amount, bn ? "bn" : "en")}
                </td>
                <td>{r.ownershipPercent}%</td>
                <td>
                  {r.includedAmount === null
                    ? "—"
                    : formatMoney(r.includedAmount, bn ? "bn" : "en")}
                </td>
                <td>{r.valuationDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!report.recordCount && (
        <p>
          {bn
            ? "এই ফিল্টারে এক্সপোর্টযোগ্য রেকর্ড নেই।"
            : "No exportable records match these filters."}
        </p>
      )}
      {!printing && report.recordCount > 100 && (
        <p>
          {bn
            ? "প্রিভিউতে প্রথম ১০০টি রেকর্ড। CSV ও প্রিন্টে সব নির্বাচিত রেকর্ড থাকবে।"
            : "Preview shows the first 100 rows; CSV and print include every selected row."}
        </p>
      )}
      <p className="fine-print">
        {bn
          ? "মোট মূল্য পূর্ণ নির্ভুলতায় যোগ করে রাউন্ড করা হয়; পৃথক রাউন্ড করা সারির যোগফল সামান্য ভিন্ন হতে পারে।"
          : "Totals are rounded after exact aggregation; summing individually rounded rows can differ slightly. Values are user-recorded estimates."}
      </p>
    </div>
  );
}
export function Reports({
  familyId,
  locale,
  categories,
}: {
  familyId: string;
  locale: string;
  categories: { code: string; name: string }[];
}) {
  const bn = locale === "bn",
    path = `families/${familyId}/reports`;
  const [options, setOptions] = useState<ReportOptions>({
      kind: "all",
      category: "",
      includeArchived: false,
      format: "json",
    }),
    [report, setReport] = useState<Report | null>(null),
    [printData, setPrintData] = useState<Report | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!printData) return;
    const done = () => setPrintData(null);
    window.addEventListener("afterprint", done);
    const id = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("afterprint", done);
    };
  }, [printData]);
  function change(patch: Partial<ReportOptions>) {
    setOptions((old) => ({ ...old, ...patch }));
    setReport(null);
    setError("");
  }
  async function run(action: "preview" | "csv" | "print") {
    setBusy(true);
    setError("");
    try {
      if (action === "csv") {
        const response = await fetch("/api/" + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...options, format: "csv" }),
          cache: "no-store",
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error?.message ?? "Export failed");
        }
        const blob = await response.blob();
        if (!active.current) return;
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = "monethakbe-records.csv";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const result = await api<Report>(path, "POST", {
          ...options,
          format: "json",
        });
        if (!active.current) return;
        setReport(result);
        if (action === "print") setPrintData(result);
      }
    } catch (e) {
      if (active.current) setError(errorText(e));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel span-two reports-panel">
      <h2>{bn ? "প্রতিবেদন ও CSV" : "Reports and CSV"}</h2>
      <p className="muted">
        {bn
          ? "প্রতিটি অনুরোধে সার্ভার অনুমতি পরীক্ষা করে। অন্য সদস্যের প্রতিবেদন ভিন্ন হতে পারে।"
          : "Every request checks server permissions. Another member's report may contain different records."}
      </p>
      <fieldset disabled={busy} className="report-filters">
        <div className="form-grid">
          <label>
            {bn ? "রেকর্ডের ধরন" : "Record kind"}
            <select
              value={options.kind}
              onChange={(e) =>
                change({ kind: e.target.value as ReportOptions["kind"] })
              }
            >
              <option value="all">All</option>
              <option value="asset">Assets</option>
              <option value="liability">Liabilities</option>
            </select>
          </label>
          <label>
            {bn ? "বিভাগ" : "Category"}
            <select
              value={options.category}
              onChange={(e) => change({ category: e.target.value })}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option value={c.code} key={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="owner-check">
          <input
            type="checkbox"
            checked={options.includeArchived}
            onChange={(e) => change({ includeArchived: e.target.checked })}
          />
          {bn ? "আর্কাইভ করা সারিও রাখুন" : "Include archived rows"}
        </label>
        <div className="report-actions">
          <Button type="button" onClick={() => void run("preview")}>
            {bn ? "প্রতিবেদন তৈরি" : "Generate report"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void run("csv")}
          >
            {bn ? "CSV ডাউনলোড" : "Download CSV"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void run("print")}
          >
            {bn ? "প্রিন্ট / PDF" : "Print / save PDF"}
          </Button>
        </div>
      </fieldset>
      {busy && (
        <p role="status">
          {bn ? "প্রতিবেদন তৈরি হচ্ছে…" : "Preparing report…"}
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <p className="fine-print">
        {bn
          ? "PDF সংরক্ষণের জন্য ব্রাউজারের প্রিন্ট ডায়ালগ ব্যবহার করুন। CSV-তে নোট, মালিকানা ও অতিরিক্ত তথ্যও থাকে। নিরাপদ স্থানে রাখুন।"
          : "Use your browser's print dialog to save PDF. CSV includes notes, ownership and additional details; store it securely."}
      </p>
      {report && <ReportView report={report} bn={bn} />}
      {printData &&
        createPortal(
          <div id="print-report">
            <ReportView report={printData} bn={bn} printing />
          </div>,
          document.body,
        )}
    </section>
  );
}
