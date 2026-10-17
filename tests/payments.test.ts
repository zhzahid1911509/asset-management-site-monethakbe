import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { testDatabase } from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
let fixture: Awaited<ReturnType<typeof testDatabase>>;
const owner = { id: "payer", email: "payer@example.test" };
const outsider = { id: "outsider", email: "outsider@example.test" };
let familyId: string;
const payment = {
  principal: "100.01",
  interest: "10.02",
  fees: "2.03",
  paidOn: "2026-02-01",
  note: "Receipt checked",
  version: 1,
};
async function loan() {
  return service.createRecord(
    fixture.db,
    familyId,
    owner,
    {
      kind: "liability",
      typeCode: "liabilities.home",
      name: "Home loan",
      amount: "1000.03",
      asOf: "2026-01-01",
    },
    randomUUID(),
  );
}
async function balance(id: string) {
  return (await service.snapshot(fixture.db, familyId, owner)).records.find(
    (r) => r.id === id,
  )!;
}
beforeAll(async () => {
  fixture = await testDatabase();
  await fixture.db
    .insert(s.user)
    .values(
      [owner, outsider].map((a) => ({ ...a, name: a.id, emailVerified: true })),
    );
  familyId = (
    await service.createFamily(fixture.db, owner, { name: "Payment tests" })
  ).id;
});
afterAll(async () => {
  await fixture.client.close();
});
describe("repayment ledger", () => {
  it("reduces exact principal only and saves auditable before/after balances", async () => {
    const r = await loan();
    await service.addPayment(
      fixture.db,
      familyId,
      owner,
      r.id,
      payment,
      randomUUID(),
    );
    expect((await balance(r.id)).amount).toBe("900.02");
    expect((await balance(r.id)).version).toBe(2);
    const history = await service.recordHistory(
      fixture.db,
      familyId,
      owner,
      r.id,
    );
    expect(history.payments).toHaveLength(1);
    expect(history.payments[0]).toMatchObject({
      principal: "100.01",
      interest: "10.02",
      fees: "2.03",
      balanceBefore: "1000.03",
      balanceAfter: "900.02",
    });
    expect(
      await fixture.db
        .select()
        .from(s.auditLogs)
        .where(eq(s.auditLogs.recordId, r.id)),
    ).toHaveLength(2);
  });
  it("replays without charging twice and rejects changed reuse", async () => {
    const r = await loan(),
      key = randomUUID();
    await service.addPayment(fixture.db, familyId, owner, r.id, payment, key);
    await service.addPayment(fixture.db, familyId, owner, r.id, payment, key);
    expect((await balance(r.id)).amount).toBe("900.02");
    expect(
      (await service.recordHistory(fixture.db, familyId, owner, r.id)).payments,
    ).toHaveLength(1);
    await expect(
      service.addPayment(
        fixture.db,
        familyId,
        owner,
        r.id,
        { ...payment, principal: "200" },
        key,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects excessive principal with no partial version or history changes", async () => {
    const r = await loan();
    await expect(
      service.addPayment(
        fixture.db,
        familyId,
        owner,
        r.id,
        { ...payment, principal: "1000.04" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "OVERPAYMENT" });
    expect(await balance(r.id)).toMatchObject({
      version: 1,
      amount: "1000.03",
    });
    expect(
      (await service.recordHistory(fixture.db, familyId, owner, r.id)).payments,
    ).toHaveLength(0);
  });
  it("rejects future, pre-balance and all-zero payments", async () => {
    const r = await loan();
    for (const paidOn of ["2999-01-01", "2025-12-31"])
      await expect(
        service.addPayment(
          fixture.db,
          familyId,
          owner,
          r.id,
          { ...payment, paidOn },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "PAYMENT_DATE" });
    await expect(
      service.addPayment(
        fixture.db,
        familyId,
        owner,
        r.id,
        { ...payment, principal: "0", interest: "0", fees: "0" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "EMPTY_PAYMENT" });
    expect((await balance(r.id)).version).toBe(1);
  });
  it("accepts interest-only and final principal payments", async () => {
    const r = await loan();
    await service.addPayment(
      fixture.db,
      familyId,
      owner,
      r.id,
      { ...payment, principal: "0" },
      randomUUID(),
    );
    expect((await balance(r.id)).amount).toBe("1000.03");
    await service.addPayment(
      fixture.db,
      familyId,
      owner,
      r.id,
      { ...payment, principal: "1000.03", version: 2 },
      randomUUID(),
    );
    expect((await balance(r.id)).amount).toBe("0.00");
  });
  it("permits only one of two writes against the same version", async () => {
    const r = await loan();
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.addPayment(
          fixture.db,
          familyId,
          owner,
          r.id,
          payment,
          randomUUID(),
        ),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await balance(r.id)).amount).toBe("900.02");
  });
  it("denies outsider history and mutation", async () => {
    const r = await loan();
    await expect(
      service.recordHistory(fixture.db, familyId, outsider, r.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.addPayment(
        fixture.db,
        familyId,
        outsider,
        r.id,
        payment,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("view grants expose history but never permit payments", async () => {
    const r = await loan();
    const [m] = await fixture.db
      .insert(s.memberships)
      .values({ familyId, userId: outsider.id, role: "read-only" })
      .returning();
    await service.setGrant(fixture.db, familyId, owner, r.id, {
      membershipId: m.id,
      action: "view",
      effect: "allow",
    });
    expect(
      (await service.recordHistory(fixture.db, familyId, outsider, r.id))
        .payments,
    ).toHaveLength(0);
    await expect(
      service.addPayment(
        fixture.db,
        familyId,
        outsider,
        r.id,
        payment,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects archived loans", async () => {
    const r = await loan();
    await service.archiveRecord(
      fixture.db,
      familyId,
      owner,
      r.id,
      { archived: true, version: 1 },
      randomUUID(),
    );
    await expect(
      service.addPayment(
        fixture.db,
        familyId,
        owner,
        r.id,
        { ...payment, version: 2 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rolls back balances and ledger when audit persistence fails", async () => {
    const r = await loan();
    await fixture.client.exec(
      `CREATE FUNCTION fail_payment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'liability.payment.recorded' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_payment_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_payment_audit();`,
    );
    try {
      await expect(
        service.addPayment(
          fixture.db,
          familyId,
          owner,
          r.id,
          payment,
          randomUUID(),
        ),
      ).rejects.toThrow();
      expect(await balance(r.id)).toMatchObject({
        amount: "1000.03",
        version: 1,
      });
      expect(
        (await service.recordHistory(fixture.db, familyId, owner, r.id))
          .payments,
      ).toHaveLength(0);
    } finally {
      await fixture.client.exec(
        "DROP TRIGGER fail_payment_audit ON audit_logs; DROP FUNCTION fail_payment_audit();",
      );
    }
  });
});
