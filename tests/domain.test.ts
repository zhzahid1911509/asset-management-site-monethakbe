import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { testDatabase } from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import { totals, formatMoney } from "../src/lib/money";
import { can, type Membership } from "../src/lib/policy";
import { seal, unseal } from "../src/server/secrets";
import { recordInput } from "../src/lib/validation";
let fixture: Awaited<ReturnType<typeof testDatabase>>;
const owner = { id: "owner", email: "owner@example.test" },
  other = { id: "other", email: "other@example.test" },
  viewer = { id: "viewer", email: "viewer@example.test" };
let familyId: string, foreignId: string, viewerMembership: string;
const input = (name = "Apartment") => ({
  kind: "asset",
  typeCode: "property.apartment",
  name,
  amount: "10000000.00",
  ownershipPercent: "50",
  asOf: "2026-01-01",
  source: "Manual estimate",
  notes: "",
  location: "",
});
beforeAll(async () => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.APP_ORIGIN = "http://localhost:3000";
  fixture = await testDatabase();
  await fixture.db
    .insert(s.user)
    .values(
      [owner, other, viewer].map((a) => ({
        ...a,
        name: a.id,
        emailVerified: true,
      })),
    );
  familyId = (
    await service.createFamily(fixture.db, owner, { name: "Our family" })
  ).id;
  foreignId = (
    await service.createFamily(fixture.db, other, { name: "Other family" })
  ).id;
  const [m] = await fixture.db
    .insert(s.memberships)
    .values({ familyId, userId: viewer.id, role: "read-only" })
    .returning();
  viewerMembership = m.id;
});
afterAll(async () => {
  await fixture.client.close();
});
describe("real PostgreSQL schema and authorized operations", () => {
  it("seeds 131 types and does not insert demo assets", async () => {
    expect(await fixture.db.select().from(s.catalogTypes)).toHaveLength(131);
    expect(await fixture.db.select().from(s.records)).toHaveLength(0);
  });
  it("creates family and owner membership atomically", async () => {
    const [f] = await fixture.db
      .select()
      .from(s.families)
      .where(eq(s.families.id, familyId));
    const [m] = await fixture.db
      .select()
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.familyId, familyId),
          eq(s.memberships.userId, owner.id),
        ),
      );
    expect(f.ownerId).toBe(owner.id);
    expect(m.role).toBe("owner");
  });
  it("denies cross-family snapshot and creation", async () => {
    await expect(
      service.snapshot(fixture.db, familyId, other),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.createRecord(fixture.db, familyId, other, input(), randomUUID()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("replays a saved request without a duplicate asset or audit", async () => {
    const key = randomUUID();
    const a = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      input("Idempotent"),
      key,
    );
    const b = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      input("Idempotent"),
      key,
    );
    expect(a).toEqual(b);
    const audits = await fixture.db
      .select()
      .from(s.auditLogs)
      .where(eq(s.auditLogs.recordId, a.id));
    expect(audits).toHaveLength(1);
    await expect(
      service.createRecord(
        fixture.db,
        familyId,
        owner,
        input("Different"),
        key,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("hides unassigned records from a read-only member and forbids creation", async () => {
    expect(
      (await service.snapshot(fixture.db, familyId, viewer)).records,
    ).toHaveLength(0);
    await expect(
      service.createRecord(fixture.db, familyId, viewer, input(), randomUUID()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("grants view without edit or export", async () => {
    const r = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      input("Shared record"),
      randomUUID(),
    );
    await service.setGrant(fixture.db, familyId, owner, r.id, {
      membershipId: viewerMembership,
      action: "view",
      effect: "allow",
    });
    const snap = await service.snapshot(fixture.db, familyId, viewer);
    expect(snap.records).toHaveLength(1);
    expect(snap.records[0].canEdit).toBe(false);
    await expect(
      service.editRecord(
        fixture.db,
        familyId,
        viewer,
        r.id,
        { name: "Hacked", notes: "", version: 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.exportRecords(fixture.db, familyId, viewer),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("explicit view deny hides record and blocks other permissions", async () => {
    const r = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      input("Denied"),
      randomUUID(),
    );
    await service.setGrant(fixture.db, familyId, owner, r.id, {
      membershipId: viewerMembership,
      action: "edit",
      effect: "allow",
    });
    await service.setGrant(fixture.db, familyId, owner, r.id, {
      membershipId: viewerMembership,
      action: "view",
      effect: "deny",
    });
    await expect(
      service.editRecord(
        fixture.db,
        familyId,
        viewer,
        r.id,
        { name: "No", notes: "", version: 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects stale updates and retains the first successful edit", async () => {
    const r = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      input("Before"),
      randomUUID(),
    );
    await service.editRecord(
      fixture.db,
      familyId,
      owner,
      r.id,
      { name: "After", notes: "Kept", version: 1 },
      randomUUID(),
    );
    await expect(
      service.editRecord(
        fixture.db,
        familyId,
        owner,
        r.id,
        { name: "Lost update", notes: "", version: 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const row = (
      await service.snapshot(fixture.db, familyId, owner)
    ).records.find((x) => x.id === r.id);
    expect(row?.name).toBe("After");
    expect(row?.version).toBe(2);
  });
  it("stores valuation history and selects the latest dated value", async () => {
    const r = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      input("Valued"),
      randomUUID(),
    );
    await service.addValuation(
      fixture.db,
      familyId,
      owner,
      r.id,
      {
        amount: "12000000",
        asOf: "2026-02-01",
        source: "Appraisal",
        version: 1,
      },
      randomUUID(),
    );
    await service.addValuation(
      fixture.db,
      familyId,
      owner,
      r.id,
      {
        amount: "9000000",
        asOf: "2025-01-01",
        source: "Historical entry",
        version: 2,
      },
      randomUUID(),
    );
    const snap = await service.snapshot(fixture.db, familyId, owner);
    expect(snap.records.find((x) => x.id === r.id)?.amount).toBe("12000000.00");
    expect(
      await fixture.db
        .select()
        .from(s.valuations)
        .where(eq(s.valuations.recordId, r.id)),
    ).toHaveLength(3);
  });
  it("rejects future valuations and mismatched catalog types without partial writes", async () => {
    const before = (await fixture.db.select().from(s.records)).length;
    await expect(
      service.createRecord(
        fixture.db,
        familyId,
        owner,
        { ...input(), asOf: "2999-01-01" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "FUTURE_VALUATION" });
    await expect(
      service.createRecord(
        fixture.db,
        familyId,
        owner,
        { ...input(), typeCode: "liabilities.home" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TYPE" });
    expect((await fixture.db.select().from(s.records)).length).toBe(before);
  });
  it("preserves unknown values and excludes archived records from totals", async () => {
    const r = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      { ...input("Unknown"), amount: undefined },
      randomUUID(),
    );
    let snap = await service.snapshot(fixture.db, familyId, owner);
    expect(snap.records.find((x) => x.id === r.id)?.amount).toBeNull();
    expect(snap.totals.unknown).toBe(1);
    await service.archiveRecord(
      fixture.db,
      familyId,
      owner,
      r.id,
      { archived: true, version: 1 },
      randomUUID(),
    );
    snap = await service.snapshot(fixture.db, familyId, owner);
    expect(snap.totals.unknown).toBe(0);
    await service.archiveRecord(
      fixture.db,
      familyId,
      owner,
      r.id,
      { archived: false, version: 2 },
      randomUUID(),
    );
    expect(
      (await service.snapshot(fixture.db, familyId, owner)).totals.unknown,
    ).toBe(1);
  });
  it("database rejects a cross-family asset reference", async () => {
    const r = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      input("FK protected"),
      randomUUID(),
    );
    await expect(
      fixture.db
        .update(s.assets)
        .set({ familyId: foreignId })
        .where(eq(s.assets.recordId, r.id)),
    ).rejects.toThrow();
  });
  it("denies a foreign record ID even in an accessible family", async () => {
    const r = await service.createRecord(
      fixture.db,
      foreignId,
      other,
      input("Foreign"),
      randomUUID(),
    );
    await expect(
      service.editRecord(
        fixture.db,
        familyId,
        owner,
        r.id,
        { name: "No", notes: "", version: 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("records liabilities separately and exports only authorized current records", async () => {
    const r = await service.createRecord(
      fixture.db,
      familyId,
      owner,
      {
        ...input("Home loan"),
        kind: "liability",
        typeCode: "liabilities.home",
        amount: "1000000",
        lender: "Bank",
      },
      randomUUID(),
    );
    const snap = await service.snapshot(fixture.db, familyId, owner);
    expect(snap.totals.liabilities).toBe("1000000.00");
    expect(
      (await service.exportRecords(fixture.db, familyId, owner)).records.some(
        (x) => x.id === r.id,
      ),
    ).toBe(true);
  });
  it("persists locale and mode in the selected family", async () => {
    await service.savePreferences(fixture.db, familyId, owner, {
      locale: "en",
      mode: "advanced",
    });
    expect(
      (await service.snapshot(fixture.db, familyId, owner)).preferences,
    ).toEqual({ locale: "en", mode: "advanced" });
  });
  it("rolls back the entire asset mutation when the audit insert fails", async () => {
    const before = (await fixture.db.select().from(s.records)).length;
    await fixture.client.exec(
      "CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected audit failure'; END $$; CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_audit();",
    );
    try {
      await expect(
        service.createRecord(
          fixture.db,
          familyId,
          owner,
          input("Rollback"),
          randomUUID(),
        ),
      ).rejects.toThrow();
      expect((await fixture.db.select().from(s.records)).length).toBe(before);
    } finally {
      await fixture.client.exec(
        "DROP TRIGGER reject_test_audit ON audit_logs; DROP FUNCTION reject_test_audit();",
      );
    }
  });
  it("handles concurrent duplicate creates with a single result", async () => {
    const key = randomUUID();
    const [first, second] = await Promise.all([
      service.createRecord(
        fixture.db,
        familyId,
        owner,
        input("Concurrent"),
        key,
      ),
      service.createRecord(
        fixture.db,
        familyId,
        owner,
        input("Concurrent"),
        key,
      ),
    ]);
    expect(first.id).toBe(second.id);
    expect(
      await fixture.db
        .select()
        .from(s.auditLogs)
        .where(eq(s.auditLogs.recordId, first.id)),
    ).toHaveLength(1);
  });
  it("binds invitations to the email, queues encrypted content and permits one acceptance", async () => {
    const invited = { id: "invited", email: "invited@example.test" };
    await fixture.db
      .insert(s.user)
      .values({ ...invited, name: "Invited", emailVerified: true });
    await service.inviteMember(fixture.db, familyId, owner, {
      email: invited.email,
      role: "adviser",
    });
    const jobs = await fixture.db.select().from(s.emailJobs);
    const message = JSON.parse(unseal(jobs.at(-1)!.payload, "email"));
    expect(jobs.at(-1)!.payload).not.toContain(invited.email);
    const match = message.text.match(/http:\/\/[^ ]+/);
    const token = new URL(match[0]).searchParams.get("token")!;
    await expect(
      service.acceptInvitation(fixture.db, other, { token }),
    ).rejects.toMatchObject({ code: "INVALID_INVITATION" });
    expect(
      (await service.acceptInvitation(fixture.db, invited, { token })).id,
    ).toBe(familyId);
    await expect(
      service.acceptInvitation(fixture.db, invited, { token }),
    ).rejects.toMatchObject({ code: "INVALID_INVITATION" });
    const [m] = await fixture.db
      .select()
      .from(s.memberships)
      .where(eq(s.memberships.userId, invited.id));
    expect(m.role).toBe("adviser");
    expect(m.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
    expect(
      (await service.snapshot(fixture.db, familyId, invited)).records,
    ).toHaveLength(0);
  });
  it("revokes membership immediately and prevents owner self-revocation", async () => {
    await service.revokeMember(fixture.db, familyId, owner, viewerMembership);
    await expect(
      service.snapshot(fixture.db, familyId, viewer),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [m] = await fixture.db
      .select()
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.familyId, familyId),
          eq(s.memberships.userId, owner.id),
        ),
      );
    await expect(
      service.revokeMember(fixture.db, familyId, owner, m.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
describe("financial and privacy primitives", () => {
  it("uses exact decimals, economic share and explicit missing values", () => {
    expect(
      totals([
        {
          kind: "asset",
          amount: "0.10",
          ownershipPercent: "100",
          archived: false,
        },
        {
          kind: "asset",
          amount: "0.20",
          ownershipPercent: "100",
          archived: false,
        },
      ]).netWorth,
    ).toBe("0.30");
    expect(
      totals([
        {
          kind: "asset",
          amount: "10000000",
          ownershipPercent: "50",
          archived: false,
        },
        {
          kind: "liability",
          amount: "1000000",
          ownershipPercent: "100",
          archived: false,
        },
      ]).netWorth,
    ).toBe("4000000.00");
  });
  it("does not lose precision when displaying very large amounts", () => {
    expect(formatMoney("999999999999999999.99")).toBe(
      "৳999,999,999,999,999,999.99",
    );
  });
  it("rejects NaN, exponent input, invalid dates and excess shares", () => {
    for (const amount of ["NaN", "Infinity", "1e6", "-1", "1.001"])
      expect(recordInput.safeParse({ ...input(), amount }).success).toBe(false);
    expect(
      recordInput.safeParse({ ...input(), asOf: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      recordInput.safeParse({ ...input(), ownershipPercent: "101" }).success,
    ).toBe(false);
  });
  it("requires view independently from edit and blocks expired members", () => {
    const m: Membership = {
      id: "m",
      userId: "u",
      role: "member",
      active: true,
      expiresAt: null,
    };
    const r = { id: "r", createdBy: "u" };
    expect(
      can(m, r, "edit", [
        { membershipId: "m", recordId: "r", action: "edit", effect: "allow" },
      ]),
    ).toBe(false);
    expect(
      can({ ...m, role: "owner", expiresAt: new Date(0) }, r, "view", []),
    ).toBe(false);
  });
  it("encrypts email content with authenticated purpose binding", () => {
    const encrypted = seal("secret-link", "email");
    expect(encrypted).not.toContain("secret-link");
    expect(unseal(encrypted, "email")).toBe("secret-link");
    expect(() => unseal(encrypted, "another-purpose")).toThrow();
  });
});
