import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import { createReport } from "../src/server/reports";
import { csvCell, type Report } from "../src/lib/reports";
let f: Awaited<ReturnType<typeof testDatabase>>,
  familyId: string,
  viewerMembership: string,
  assetId: string,
  loanId: string;
const owner = { id: "report-owner", email: "report-owner@example.test" },
  viewer = { id: "report-viewer", email: "report-viewer@example.test" },
  outsider = { id: "report-outsider", email: "report-outsider@example.test" };
const report = (actor = owner, options: Record<string, unknown> = {}) =>
  createReport(f.db, familyId, actor, options) as Promise<Report>;
beforeAll(async () => {
  f = await testDatabase();
  await f.db
    .insert(s.user)
    .values(
      [owner, viewer, outsider].map((a) => ({
        ...a,
        name: a.id,
        emailVerified: true,
      })),
    );
  familyId = (
    await service.createFamily(f.db, owner, { name: "Report family" })
  ).id;
  viewerMembership = (
    await f.db
      .insert(s.memberships)
      .values({ familyId, userId: viewer.id, role: "member" })
      .returning()
  )[0].id;
  assetId = (
    await service.createRecord(
      f.db,
      familyId,
      owner,
      {
        kind: "asset",
        typeCode: "property.apartment",
        name: '=HYPERLINK("malicious") বাংলা',
        notes: "Line one\nLine two, quoted",
        amount: "1000.03",
        ownershipPercent: "33.333333",
        asOf: "2026-01-01",
      },
      randomUUID(),
    )
  ).id;
  loanId = (
    await service.createRecord(
      f.db,
      familyId,
      owner,
      {
        kind: "liability",
        typeCode: "liabilities.home",
        name: "Private liability",
        amount: "100.01",
        asOf: "2026-01-01",
      },
      randomUUID(),
    )
  ).id;
  await service.createRecord(
    f.db,
    familyId,
    owner,
    {
      kind: "asset",
      typeCode: "property.apartment",
      name: "Unknown value",
      asOf: "2026-01-01",
    },
    randomUUID(),
  );
  const old = await service.createRecord(
    f.db,
    familyId,
    owner,
    {
      kind: "asset",
      typeCode: "property.apartment",
      name: "Archived estimate",
      amount: "5000",
      asOf: "2026-01-01",
    },
    randomUUID(),
  );
  await service.archiveRecord(
    f.db,
    familyId,
    owner,
    old.id,
    { version: 1, archived: true },
    randomUUID(),
  );
});
afterAll(async () => {
  await f?.client.close();
});
it("aggregates exact included shares and tracks unknown values", async () => {
  const r = await report();
  expect(r.totals).toEqual({
    assets: "333.34",
    liabilities: "100.01",
    netWorth: "233.33",
    unknown: 1,
  });
  expect(r.recordCount).toBe(3);
  expect(r.records.find((r) => r.id === assetId)?.includedAmount).toBe(
    "333.34",
  );
});
it("includes archived rows only on request without counting them in totals", async () => {
  const r = await report(owner, { includeArchived: true });
  expect(r.recordCount).toBe(4);
  expect(r.activeCount).toBe(3);
  expect(r.totals.assets).toBe("333.34");
});
it("recomputes category/kind totals from filtered rows", async () => {
  const r = await report(owner, { kind: "liability" });
  expect(r.recordCount).toBe(1);
  expect(r.totals.netWorth).toBe("-100.01");
  expect((await report(owner, { category: "missing" })).recordCount).toBe(0);
});
it("requires active family membership", async () => {
  await expect(report(outsider)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("never exports view-only records or counts them in totals", async () => {
  for (const id of [assetId, loanId])
    await service.setGrant(f.db, familyId, owner, id, {
      membershipId: viewerMembership,
      action: "view",
      effect: "allow",
    });
  await expect(report(viewer)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await service.setGrant(f.db, familyId, owner, assetId, {
    membershipId: viewerMembership,
    action: "export",
    effect: "allow",
  });
  const r = await report(viewer);
  expect(r.records.map((r) => r.id)).toEqual([assetId]);
  expect(r.totals.liabilities).toBe("0.00");
  expect(JSON.stringify(r)).not.toContain("Private liability");
  await service.setGrant(f.db, familyId, owner, assetId, {
    membershipId: viewerMembership,
    action: "view",
    effect: "deny",
  });
  await expect(report(viewer)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("returns a UTF-8 CSV attachment with escaped quotes, newlines and formulas", async () => {
  const response = (await createReport(f.db, familyId, owner, {
    format: "csv",
  })) as Response;
  expect(response.headers.get("Content-Disposition")).toContain("attachment");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const buffer = new Uint8Array(await response.arrayBuffer());
  expect([...buffer.slice(0, 3)]).toEqual([239, 187, 191]);
  const text = new TextDecoder().decode(buffer);
  expect(text).toContain('"\'=HYPERLINK(""malicious"") বাংলা"');
  expect(text).toContain('"Line one\nLine two, quoted"');
  expect(text).not.toContain("Archived estimate");
});
it("neutralizes spreadsheet formulas including leading whitespace and control characters", () => {
  for (const value of [
    "=1+1",
    "+SUM(A1)",
    "-1+2",
    "@formula",
    "  =1+1",
    "\t=1",
    "\r=1",
  ])
    expect(csvCell(value).startsWith("\"'")).toBe(true);
  expect(csvCell('a,"b"')).toBe('"a,""b"""');
  expect(csvCell(null)).toBe('""');
});
it("rejects unsupported filters rather than silently accepting them", async () => {
  await expect(report(owner, { asOf: "2020-01-01" })).rejects.toBeTruthy();
  await expect(report(owner, { format: "pdf" })).rejects.toBeTruthy();
});
