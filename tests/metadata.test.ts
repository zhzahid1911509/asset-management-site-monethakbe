import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { testDatabase } from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import { detailFields, parseDetails } from "../src/lib/record-details";
import { ownershipInput, type OwnerEntry } from "../src/lib/ownership";
import catalog from "../seed/catalog.v1.json";
let fixture: Awaited<ReturnType<typeof testDatabase>>,
  familyId: string,
  memberId: string;
const owner = { id: "metadata-owner", email: "metadata-owner@example.test" },
  viewer = { id: "metadata-viewer", email: "metadata-viewer@example.test" },
  outsider = {
    id: "metadata-outsider",
    email: "metadata-outsider@example.test",
  };
const input = {
  kind: "asset",
  typeCode: "property.apartment",
  name: "Family property",
  amount: "1000.00",
  ownershipPercent: "60",
  asOf: "2026-01-01",
};
const party = (patch: Partial<OwnerEntry> = {}): OwnerEntry => ({
  id: randomUUID(),
  name: "Family member",
  capacity: "legal-and-beneficial",
  legalPercent: "60",
  economicPercent: "60",
  includedInFamily: true,
  ...patch,
});
const ownership = (patch: Record<string, unknown> = {}) => ({
  version: 1,
  asOf: "2026-02-01",
  familyShare: "60",
  owners: [party()],
  reason: "Verified against family records",
  ...patch,
});
const create = () =>
  service.createRecord(fixture.db, familyId, owner, input, randomUUID());
const row = async (id: string) =>
  (await service.snapshot(fixture.db, familyId, owner)).records.find(
    (r) => r.id === id,
  )!;
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.db
    .insert(s.user)
    .values(
      [owner, viewer, outsider].map((a) => ({
        ...a,
        name: a.id,
        emailVerified: true,
      })),
    );
  familyId = (
    await service.createFamily(fixture.db, owner, { name: "Metadata family" })
  ).id;
  const [m] = await fixture.db
    .insert(s.memberships)
    .values({ familyId, userId: viewer.id, role: "read-only" })
    .returning();
  memberId = m.id;
});
afterAll(async () => {
  await fixture.client.close();
});
describe("category detail validation", () => {
  it("covers every seeded category with unique field keys", () => {
    for (const category of catalog.categories) {
      expect(detailFields[category.code]?.length).toBeGreaterThan(0);
      expect(parseDetails(category.code, {})).toEqual({});
      expect(new Set(detailFields[category.code].map((f) => f.key)).size).toBe(
        detailFields[category.code].length,
      );
    }
  });
  it("rejects unknown fields, invalid dates and full account identifiers", () => {
    expect(() => parseDetails("cash", { password: "secret" })).toThrow();
    expect(() =>
      parseDetails("cash", { accountLast4: "1234567890" }),
    ).toThrow();
    expect(() => parseDetails("cash", { openedOn: "2026-02-30" })).toThrow();
    expect(() =>
      parseDetails("cash", { openedOn: "2026-03-01", maturesOn: "2026-02-01" }),
    ).toThrow();
    expect(
      parseDetails("cash", {
        accountLast4: "1234",
        institution: " Bank ",
        openedOn: "",
      }),
    ).toEqual({ accountLast4: "1234", institution: "Bank" });
  });
  it("requires land area units and local definitions without converting", () => {
    expect(() => parseDetails("property", { area: "2" })).toThrow();
    expect(() =>
      parseDetails("property", { area: "2", areaUnit: "katha" }),
    ).toThrow();
    expect(
      parseDetails("property", {
        area: "2",
        areaUnit: "katha",
        unitDefinition: "Per deed: local survey basis",
      }),
    ).toMatchObject({ area: "2", areaUnit: "katha" });
  });
  it("creates category data with its baseline history atomically", async () => {
    const r = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      { ...input, details: { mouza: "Example mouza", dagNumber: "123" } },
      randomUUID(),
    );
    expect((await row(r.id)).details).toEqual({
      mouza: "Example mouza",
      dagNumber: "123",
    });
    const history = await service.recordMetadata(
      fixture.db,
      familyId,
      owner,
      r.id,
    );
    expect(history.detailHistory).toHaveLength(1);
    expect(history.ownershipHistory[0]).toMatchObject({
      familyShare: "60.000000",
      asOf: null,
      owners: [],
    });
  });
  it("rejects mismatched category fields without creating a record", async () => {
    const before = (await fixture.db.select().from(s.records)).length;
    await expect(
      service.createRecord(
        fixture.db,
        familyId,
        owner,
        { ...input, details: { chassis: "wrong-category" } },
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect((await fixture.db.select().from(s.records)).length).toBe(before);
  });
  it("retains old details, replays exactly once and rejects stale edits", async () => {
    const r = await create(),
      key = randomUUID(),
      data = { version: 1, details: { district: "Dhaka" } };
    await service.saveDetails(fixture.db, familyId, owner, r.id, data, key);
    await service.saveDetails(fixture.db, familyId, owner, r.id, data, key);
    await expect(
      service.saveDetails(
        fixture.db,
        familyId,
        owner,
        r.id,
        { version: 1, details: {} },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.saveDetails(
        fixture.db,
        familyId,
        owner,
        r.id,
        { version: 1, details: {} },
        key,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(
      (await service.recordMetadata(fixture.db, familyId, owner, r.id))
        .detailHistory,
    ).toHaveLength(2);
    expect((await row(r.id)).details).toEqual({ district: "Dhaka" });
  });
  it("includes current metadata in permission-checked exports", async () => {
    const r = await create();
    await service.saveDetails(
      fixture.db,
      familyId,
      owner,
      r.id,
      { version: 1, details: { district: "Dhaka" } },
      randomUUID(),
    );
    const exported = await service.exportRecords(fixture.db, familyId, owner);
    expect(exported.records.find((x) => x.id === r.id)?.details).toEqual({
      district: "Dhaka",
    });
  });
});
describe("co-ownership snapshots", () => {
  it("enforces separate legal/economic totals and exact included family share", () => {
    expect(
      ownershipInput.safeParse(
        ownership({
          owners: [
            party({ legalPercent: "80" }),
            party({
              legalPercent: "30",
              economicPercent: "0",
              includedInFamily: false,
            }),
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      ownershipInput.safeParse(ownership({ familyShare: "50" })).success,
    ).toBe(false);
    expect(
      ownershipInput.safeParse(
        ownership({ owners: [party({ capacity: "manager" })] }),
      ).success,
    ).toBe(false);
    expect(
      ownershipInput.safeParse(
        ownership({ owners: [party({ economicPercent: undefined })] }),
      ).success,
    ).toBe(false);
    const exact = ownership({
      familyShare: "0.3",
      owners: [
        party({ legalPercent: undefined, economicPercent: "0.1" }),
        party({ legalPercent: undefined, economicPercent: "0.2" }),
      ],
    });
    expect(ownershipInput.safeParse(exact).success).toBe(true);
  });
  it("changes financial share exactly once while retaining previous state", async () => {
    const r = await create(),
      data = ownership({
        familyShare: "40",
        owners: [party({ economicPercent: "40", legalPercent: "80" })],
      }),
      key = randomUUID();
    await service.saveOwnership(fixture.db, familyId, owner, r.id, data, key);
    await service.saveOwnership(fixture.db, familyId, owner, r.id, data, key);
    const result = await row(r.id);
    expect(result.ownershipPercent).toBe("40.000000");
    expect(result.owners[0].legalPercent).toBe("80");
    expect(result.version).toBe(2);
    const history = await service.recordMetadata(
      fixture.db,
      familyId,
      owner,
      r.id,
    );
    expect(history.ownershipHistory).toHaveLength(2);
    expect(history.ownershipHistory[1].familyShare).toBe("60.000000");
    const exported = await service.exportRecords(fixture.db, familyId, owner);
    expect(exported.records.find((x) => x.id === r.id)?.owners).toEqual(
      result.owners,
    );
  });
  it("allows explicit family shares without listing parties and keeps unknown date baseline", async () => {
    const r = await create();
    await service.saveOwnership(
      fixture.db,
      familyId,
      owner,
      r.id,
      ownership({ familyShare: "25", owners: [] }),
      randomUUID(),
    );
    expect((await row(r.id)).ownershipPercent).toBe("25.000000");
  });
  it("rejects future or backdated ownership without partial version changes", async () => {
    const r = await create();
    await service.saveOwnership(
      fixture.db,
      familyId,
      owner,
      r.id,
      ownership(),
      randomUUID(),
    );
    for (const asOf of ["2026-01-01", "2999-01-01"]) {
      await expect(
        service.saveOwnership(
          fixture.db,
          familyId,
          owner,
          r.id,
          ownership({ version: 2, asOf }),
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "OWNERSHIP_DATE" });
    }
    expect((await row(r.id)).version).toBe(2);
  });
  it("blocks outsiders, ungranted viewers and view-only mutations", async () => {
    const r = await create();
    for (const a of [viewer, outsider]) {
      await expect(
        service.recordMetadata(fixture.db, familyId, a, r.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        service.saveDetails(
          fixture.db,
          familyId,
          a,
          r.id,
          { version: 1, details: {} },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        service.saveOwnership(
          fixture.db,
          familyId,
          a,
          r.id,
          ownership(),
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await service.setGrant(fixture.db, familyId, owner, r.id, {
      membershipId: memberId,
      action: "view",
      effect: "allow",
    });
    expect(
      (await service.recordMetadata(fixture.db, familyId, viewer, r.id))
        .detailHistory,
    ).toHaveLength(1);
    await expect(
      service.saveOwnership(
        fixture.db,
        familyId,
        viewer,
        r.id,
        ownership(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("blocks metadata writes on archived records and ownership on liabilities", async () => {
    const r = await create();
    await service.archiveRecord(
      fixture.db,
      familyId,
      owner,
      r.id,
      { version: 1, archived: true },
      randomUUID(),
    );
    await expect(
      service.saveDetails(
        fixture.db,
        familyId,
        owner,
        r.id,
        { version: 2, details: {} },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.saveOwnership(
        fixture.db,
        familyId,
        owner,
        r.id,
        ownership({ version: 2 }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const l = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      { ...input, kind: "liability", typeCode: "liabilities.home" },
      randomUUID(),
    );
    await expect(
      service.saveOwnership(
        fixture.db,
        familyId,
        owner,
        l.id,
        ownership(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TYPE" });
  });
  it("serializes competing details/ownership updates against one version", async () => {
    const r = await create();
    const results = await Promise.allSettled([
      service.saveDetails(
        fixture.db,
        familyId,
        owner,
        r.id,
        { version: 1, details: { district: "Dhaka" } },
        randomUUID(),
      ),
      service.saveOwnership(
        fixture.db,
        familyId,
        owner,
        r.id,
        ownership(),
        randomUUID(),
      ),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await row(r.id)).version).toBe(2);
  });
  it("rolls back current data and history when audit insertion fails", async () => {
    const r = await create();
    await fixture.client.exec(
      `CREATE FUNCTION fail_metadata_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('record.details.updated','asset.ownership.updated') THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_metadata_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_metadata_audit();`,
    );
    try {
      await expect(
        service.saveOwnership(
          fixture.db,
          familyId,
          owner,
          r.id,
          ownership(),
          randomUUID(),
        ),
      ).rejects.toThrow();
      await expect(
        service.saveDetails(
          fixture.db,
          familyId,
          owner,
          r.id,
          { version: 1, details: { district: "Dhaka" } },
          randomUUID(),
        ),
      ).rejects.toThrow();
      expect(await row(r.id)).toMatchObject({
        version: 1,
        details: {},
        owners: [],
      });
      const h = await service.recordMetadata(fixture.db, familyId, owner, r.id);
      expect(h.detailHistory).toHaveLength(1);
      expect(h.ownershipHistory).toHaveLength(1);
    } finally {
      await fixture.client.exec(
        "DROP TRIGGER fail_metadata_audit ON audit_logs; DROP FUNCTION fail_metadata_audit();",
      );
    }
  });
});
it("upgrades existing records without losing values or inventing ownership dates", async () => {
  const client = new PGlite();
  try {
    await client.exec(
      readFileSync("drizzle/0000_numerous_moonstone.sql", "utf8"),
    );
    await client.exec(
      readFileSync("drizzle/0001_chilly_leper_queen.sql", "utf8"),
    );
    const f = randomUUID(),
      r = randomUUID();
    await client.query(
      `INSERT INTO "user" (id,name,email,email_verified) VALUES ('legacy','Legacy','legacy@example.test',true)`,
    );
    await client.query(
      `INSERT INTO families (id,name,owner_id) VALUES ($1,'Legacy family','legacy')`,
      [f],
    );
    await client.query(
      `INSERT INTO catalog_types (code,category_code,kind,name_en,name_bn,category_en,category_bn,seed_version) VALUES ('property.test','property','asset','Test','Test','Test','Test',1)`,
    );
    await client.query(
      `INSERT INTO records (id,family_id,kind,type_code,name,created_by,version) VALUES ($1,$2,'asset','property.test','Legacy record','legacy',7)`,
      [r, f],
    );
    await client.query(
      `INSERT INTO assets (record_id,family_id,ownership_percent) VALUES ($1,$2,'12.345678')`,
      [r, f],
    );
    await client.exec(
      readFileSync("drizzle/0002_record_details_ownership.sql", "utf8"),
    );
    const rows = await client.query(
      `SELECT family_share::text,as_of,record_version,owners FROM ownership_history WHERE record_id=$1`,
      [r],
    );
    expect(rows.rows).toEqual([
      { family_share: "12.345678", as_of: null, record_version: 7, owners: [] },
    ]);
    expect(
      (
        await client.query(`SELECT version,details FROM records WHERE id=$1`, [
          r,
        ])
      ).rows,
    ).toEqual([{ version: 7, details: {} }]);
  } finally {
    await client.close();
  }
});
