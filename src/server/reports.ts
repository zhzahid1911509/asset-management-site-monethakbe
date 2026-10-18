import type { Db } from "../db";
import { exportRecords, type Actor } from "./service";
import { reportInput, buildReport, reportCSV } from "../lib/reports";
import { AppError } from "../lib/errors";
export async function createReport(
  db: Db,
  familyId: string,
  a: Actor,
  raw: unknown,
) {
  const options = reportInput.parse(raw),
    data = await exportRecords(db, familyId, a);
  if (data.records.length > 5000) throw new AppError("REPORT_LIMIT", 413);
  const report = buildReport(data, options);
  if (options.format === "csv")
    return new Response(reportCSV(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="monethakbe-records.csv"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  return report;
}
