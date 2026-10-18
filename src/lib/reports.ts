import { z } from "zod";
import Decimal from "decimal.js";
import type { exportRecords } from "../server/service";
import { totals } from "./money";
export const reportInput = z.strictObject({
  kind: z.enum(["all", "asset", "liability"]).default("all"),
  category: z.string().max(100).default(""),
  includeArchived: z.boolean().default(false),
  format: z.enum(["json", "csv"]).default("json"),
});
export type ReportOptions = z.infer<typeof reportInput>;
type Export = Awaited<ReturnType<typeof exportRecords>>;
export function buildReport(data: Export, options: ReportOptions) {
  const records = data.records
    .filter(
      (r) =>
        (options.includeArchived || !r.archived) &&
        (options.kind === "all" || r.kind === options.kind) &&
        (!options.category || r.categoryCode === options.category),
    )
    .map((r) => ({
      ...r,
      includedAmount:
        r.amount === null
          ? null
          : r.kind === "asset"
            ? new Decimal(r.amount)
                .times(r.ownershipPercent)
                .div(100)
                .toFixed(2)
            : new Decimal(r.amount).toFixed(2),
    }));
  const keys = [...new Set(records.map((r) => r.categoryCode))].sort();
  return {
    formatVersion: 1,
    generatedAt: data.exportedAt,
    family: data.family,
    currency: "BDT",
    scope:
      "Current records this member may view and export. Archived rows are excluded from totals. Not a full backup or historical valuation report.",
    filters: {
      kind: options.kind,
      category: options.category,
      includeArchived: options.includeArchived,
    },
    totals: totals(records),
    categories: keys.map((code) => {
      const rows = records.filter((r) => r.categoryCode === code);
      return {
        code,
        nameEn: rows[0].categoryEn,
        nameBn: rows[0].categoryBn,
        count: rows.filter((r) => !r.archived).length,
        ...totals(rows),
      };
    }),
    recordCount: records.length,
    activeCount: records.filter((r) => !r.archived).length,
    records,
  };
}
export type Report = ReturnType<typeof buildReport>;
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (
    /^[\s\u0000-\u001f\u007f-\u009f\uFEFF]*[=+\-@]/.test(text) ||
    /^[\t\r\n]/.test(text)
  )
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function reportCSV(report: Report) {
  const columns = [
    "Record ID",
    "Kind",
    "Name",
    "Category",
    "Type",
    "Currency",
    "Whole asset value / liability balance",
    "Family share (%)",
    "Included amount (rounded BDT)",
    "Value/balance date",
    "Archived",
    "Location",
    "Lender",
    "Notes",
    "Details JSON",
    "Owners JSON",
    "Ownership effective date",
  ];
  const rows = report.records.map((r) => [
    r.id,
    r.kind,
    r.name,
    r.categoryEn,
    r.typeNameEn,
    "BDT",
    r.amount,
    r.ownershipPercent,
    r.includedAmount,
    r.valuationDate,
    r.archived ? "Yes" : "No",
    r.location,
    r.lender,
    r.notes,
    JSON.stringify(r.details),
    JSON.stringify(r.owners),
    r.ownershipAsOf,
  ]);
  return (
    "\uFEFF" +
    [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
