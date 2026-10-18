import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { testDatabase } from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import { nextDueDate, bangladeshToday } from "../src/lib/reminders";
let fixture: Awaited<ReturnType<typeof testDatabase>>,
  familyId: string,
  viewerId: string;
const owner = { id: "task-owner", email: "task-owner@example.test" },
  viewer = { id: "task-viewer", email: "task-viewer@example.test" },
  outsider = { id: "task-outsider", email: "task-outsider@example.test" };
const assetInput = {
  kind: "asset",
  typeCode: "property.apartment",
  name: "Task property",
  amount: "1000.03",
  asOf: "2026-01-01",
};
const task = {
  version: 1,
  title: "Renew registration",
  category: "renewal",
  dueOn: "2026-01-31",
  recurrence: "monthly",
  note: "Bring the receipt",
};
const payment = {
  version: 1,
  principal: "100.01",
  interest: "10.02",
  fees: "2.03",
  paidOn: "2026-02-01",
  note: "Statement",
};
const create = () =>
  service.createRecord(fixture.db, familyId, owner, assetInput, randomUUID());
const row = async (id: string) =>
  (await service.snapshot(fixture.db, familyId, owner)).records.find(
    (r) => r.id === id,
  )!;
async function loan(p = payment) {
  const r = await service.createRecord(
    fixture.db,
    familyId,
    owner,
    { ...assetInput, kind: "liability", typeCode: "liabilities.home" },
    randomUUID(),
  );
  await service.addPayment(fixture.db, familyId, owner, r.id, p, randomUUID());
  const original = (
    await service.recordHistory(fixture.db, familyId, owner, r.id)
  ).payments[0];
  return { ...r, paymentId: original.id };
}
async function newReminder(patch: Record<string, unknown> = {}) {
  const r = await create();
  await service.saveReminder(
    fixture.db,
    familyId,
    owner,
    r.id,
    { ...task, ...patch },
    randomUUID(),
  );
  const reminder = (
    await service.listReminders(fixture.db, familyId, owner)
  ).reminders.find((x) => x.recordId === r.id)!;
  return { recordId: r.id, reminderId: reminder.id };
}
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
    await service.createFamily(fixture.db, owner, { name: "Tasks family" })
  ).id;
  const [m] = await fixture.db
    .insert(s.memberships)
    .values({ familyId, userId: viewer.id, role: "read-only" })
    .returning();
  viewerId = m.id;
});
afterAll(async () => {
  await fixture.client.close();
});
describe("date-only recurrence", () => {
  it("retains a monthly anchor across short months", () => {
    expect(nextDueDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(nextDueDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
  });
  it("handles leap years, quarters, weeks and one-time dates", () => {
    expect(nextDueDate("2024-02-29", "yearly", 29)).toBe("2025-02-28");
    expect(nextDueDate("2027-02-28", "yearly", 29)).toBe("2028-02-29");
    expect(nextDueDate("2026-01-31", "quarterly", 31)).toBe("2026-04-30");
    expect(nextDueDate("2026-12-28", "weekly", 28)).toBe("2027-01-04");
    expect(nextDueDate("2026-12-31", "daily", 31)).toBe("2027-01-01");
    expect(nextDueDate("2026-01-01", "none", 1)).toBeNull();
  });
  it("uses the Bangladesh calendar boundary", () => {
    expect(bangladeshToday(new Date("2026-01-01T18:01:00Z"))).toBe(
      "2026-01-02",
    );
  });
});
describe("reminder lifecycle and permissions", () => {
  it("creates only one reminder/event for a retried request", async () => {
    const r = await create(),
      key = randomUUID();
    await service.saveReminder(fixture.db, familyId, owner, r.id, task, key);
    await service.saveReminder(fixture.db, familyId, owner, r.id, task, key);
    const reminders = (
      await service.listReminders(fixture.db, familyId, owner)
    ).reminders.filter((x) => x.recordId === r.id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].recordVersion).toBe(2);
    expect(
      (
        await service.reminderHistory(
          fixture.db,
          familyId,
          owner,
          r.id,
          reminders[0].id,
        )
      ).events,
    ).toHaveLength(1);
    await expect(
      service.saveReminder(
        fixture.db,
        familyId,
        owner,
        r.id,
        { ...task, title: "Different" },
        key,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("advances one occurrence exactly once and retains its original due date", async () => {
    const r = await newReminder(),
      key = randomUUID(),
      data = { version: 2, reminderId: r.reminderId, action: "complete" };
    await service.changeReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      data,
      key,
    );
    await service.changeReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      data,
      key,
    );
    let reminder = (
      await service.listReminders(fixture.db, familyId, owner)
    ).reminders.find((x) => x.id === r.reminderId)!;
    expect(reminder.dueOn).toBe("2026-02-28");
    expect(reminder.status).toBe("active");
    const h = await service.reminderHistory(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      r.reminderId,
    );
    expect(h.events[0]).toMatchObject({
      action: "complete",
      snapshot: { dueOn: "2026-01-31" },
    });
    await service.changeReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      { ...data, version: 3 },
      randomUUID(),
    );
    reminder = (
      await service.listReminders(fixture.db, familyId, owner)
    ).reminders.find((x) => x.id === r.reminderId)!;
    expect(reminder.dueOn).toBe("2026-03-31");
  });
  it("preserves the monthly anchor on a title-only edit but resets it for rescheduling", async () => {
    const r = await newReminder();
    await service.changeReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      { version: 2, reminderId: r.reminderId, action: "complete" },
      randomUUID(),
    );
    await service.saveReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      {
        ...task,
        version: 3,
        reminderId: r.reminderId,
        title: "New title",
        dueOn: "2026-02-28",
      },
      randomUUID(),
    );
    let reminder = (
      await service.listReminders(fixture.db, familyId, owner)
    ).reminders.find((x) => x.id === r.reminderId)!;
    expect(reminder.anchorDay).toBe(31);
    await service.saveReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      { ...task, version: 4, reminderId: r.reminderId, dueOn: "2026-03-15" },
      randomUUID(),
    );
    reminder = (
      await service.listReminders(fixture.db, familyId, owner)
    ).reminders.find((x) => x.id === r.reminderId)!;
    expect(reminder.anchorDay).toBe(15);
  });
  it("completes one-time reminders and supports cancel/reopen without deleting history", async () => {
    const r = await newReminder({ recurrence: "none" });
    await service.changeReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      { version: 2, reminderId: r.reminderId, action: "complete" },
      randomUUID(),
    );
    expect(
      (await service.listReminders(fixture.db, familyId, owner)).reminders.find(
        (x) => x.id === r.reminderId,
      )?.status,
    ).toBe("completed");
    await expect(
      service.changeReminder(
        fixture.db,
        familyId,
        owner,
        r.recordId,
        { version: 3, reminderId: r.reminderId, action: "complete" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "REMINDER_CLOSED" });
    await service.changeReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      { version: 3, reminderId: r.reminderId, action: "reopen" },
      randomUUID(),
    );
    await service.changeReminder(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      { version: 4, reminderId: r.reminderId, action: "cancel" },
      randomUUID(),
    );
    expect(
      (
        await service.reminderHistory(
          fixture.db,
          familyId,
          owner,
          r.recordId,
          r.reminderId,
        )
      ).events,
    ).toHaveLength(4);
  });
  it("hides reminders and history without record view, and never grants edit through view", async () => {
    const r = await newReminder();
    expect(
      (await service.listReminders(fixture.db, familyId, viewer)).reminders,
    ).toHaveLength(0);
    await expect(
      service.listReminders(fixture.db, familyId, outsider),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.reminderHistory(
        fixture.db,
        familyId,
        viewer,
        r.recordId,
        r.reminderId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.setGrant(fixture.db, familyId, owner, r.recordId, {
      membershipId: viewerId,
      action: "view",
      effect: "allow",
    });
    const visible = (await service.listReminders(fixture.db, familyId, viewer))
      .reminders;
    expect(visible).toHaveLength(1);
    expect(visible[0].canEdit).toBe(false);
    await expect(
      service.saveReminder(
        fixture.db,
        familyId,
        viewer,
        r.recordId,
        { ...task, version: 2 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.changeReminder(
        fixture.db,
        familyId,
        viewer,
        r.recordId,
        { version: 2, reminderId: r.reminderId, action: "cancel" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.setGrant(fixture.db, familyId, owner, r.recordId, {
      membershipId: viewerId,
      action: "view",
      effect: "deny",
    });
    expect(
      (await service.listReminders(fixture.db, familyId, viewer)).reminders,
    ).toHaveLength(0);
  });
  it("rejects mismatched record identifiers and archived mutations", async () => {
    const r = await newReminder(),
      other = await create();
    await expect(
      service.changeReminder(
        fixture.db,
        familyId,
        owner,
        other.id,
        { version: 1, reminderId: r.reminderId, action: "cancel" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await row(other.id)).version).toBe(1);
    await service.archiveRecord(
      fixture.db,
      familyId,
      owner,
      r.recordId,
      { version: 2, archived: true },
      randomUUID(),
    );
    await expect(
      service.changeReminder(
        fixture.db,
        familyId,
        owner,
        r.recordId,
        { version: 3, reminderId: r.reminderId, action: "complete" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await service.listReminders(fixture.db, familyId, owner)).reminders.find(
        (x) => x.id === r.reminderId,
      ),
    ).toMatchObject({ archived: true, canEdit: false, status: "active" });
  });
  it("accepts only one competing update and rolls back failed auditing", async () => {
    const r = await newReminder();
    const results = await Promise.allSettled(
      ["complete", "cancel"].map((action) =>
        service.changeReminder(
          fixture.db,
          familyId,
          owner,
          r.recordId,
          { version: 2, reminderId: r.reminderId, action },
          randomUUID(),
        ),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const fresh = await create();
    await fixture.client.exec(
      `CREATE FUNCTION fail_reminder_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'reminder.created' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_reminder_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_reminder_audit();`,
    );
    try {
      await expect(
        service.saveReminder(
          fixture.db,
          familyId,
          owner,
          fresh.id,
          task,
          randomUUID(),
        ),
      ).rejects.toThrow();
      expect((await row(fresh.id)).version).toBe(1);
      expect(
        (
          await service.listReminders(fixture.db, familyId, owner)
        ).reminders.filter((x) => x.recordId === fresh.id),
      ).toHaveLength(0);
    } finally {
      await fixture.client.exec(
        "DROP TRIGGER fail_reminder_audit ON audit_logs; DROP FUNCTION fail_reminder_audit();",
      );
    }
  });
});
describe("payment corrections", () => {
  it("restores principal once, retains payment amounts and records before/after balances", async () => {
    const r = await loan(),
      key = randomUUID(),
      data = {
        version: 2,
        paymentId: r.paymentId,
        reversedOn: "2026-02-02",
        reason: "Duplicate receipt",
      };
    await service.reversePayment(fixture.db, familyId, owner, r.id, data, key);
    await service.reversePayment(fixture.db, familyId, owner, r.id, data, key);
    expect(await row(r.id)).toMatchObject({ amount: "1000.03", version: 3 });
    const h = await service.recordHistory(fixture.db, familyId, owner, r.id);
    expect(h.payments).toHaveLength(1);
    expect(h.payments[0]).toMatchObject({
      principal: "100.01",
      interest: "10.02",
      fees: "2.03",
      reversal: {
        balanceBefore: "900.02",
        balanceAfter: "1000.03",
        reason: "Duplicate receipt",
      },
    });
    await expect(
      service.reversePayment(
        fixture.db,
        familyId,
        owner,
        r.id,
        { ...data, version: 3 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ALREADY_REVERSED" });
    expect((await row(r.id)).version).toBe(3);
  });
  it("allows interest-only reversal without adding interest to principal", async () => {
    const r = await loan({ ...payment, principal: "0" });
    await service.reversePayment(
      fixture.db,
      familyId,
      owner,
      r.id,
      {
        version: 2,
        paymentId: r.paymentId,
        reversedOn: "2026-02-02",
        reason: "Fee receipt corrected",
      },
      randomUUID(),
    );
    expect((await row(r.id)).amount).toBe("1000.03");
  });
  it("preserves later payments when an older payment is reversed", async () => {
    const r = await loan();
    await service.addPayment(
      fixture.db,
      familyId,
      owner,
      r.id,
      { ...payment, version: 2, principal: "50.01", paidOn: "2026-02-03" },
      randomUUID(),
    );
    await service.reversePayment(
      fixture.db,
      familyId,
      owner,
      r.id,
      {
        version: 3,
        paymentId: r.paymentId,
        reversedOn: "2026-02-04",
        reason: "Correct earlier entry",
      },
      randomUUID(),
    );
    expect((await row(r.id)).amount).toBe("950.02");
  });
  it("rejects backdated/future reversals and foreign payment IDs without partial updates", async () => {
    const r = await loan(),
      other = await loan();
    for (const reversedOn of ["2026-01-31", "2999-01-01"])
      await expect(
        service.reversePayment(
          fixture.db,
          familyId,
          owner,
          r.id,
          {
            version: 2,
            paymentId: r.paymentId,
            reversedOn,
            reason: "Date check",
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "REVERSAL_DATE" });
    await expect(
      service.reversePayment(
        fixture.db,
        familyId,
        owner,
        r.id,
        {
          version: 2,
          paymentId: other.paymentId,
          reversedOn: "2026-02-03",
          reason: "Wrong loan",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await row(r.id)).toMatchObject({ version: 2, amount: "900.02" });
  });
  it("denies view-only corrections and archived corrections", async () => {
    const r = await loan(),
      data = {
        version: 2,
        paymentId: r.paymentId,
        reversedOn: "2026-02-02",
        reason: "Correct receipt",
      };
    await service.setGrant(fixture.db, familyId, owner, r.id, {
      membershipId: viewerId,
      action: "view",
      effect: "allow",
    });
    await expect(
      service.reversePayment(
        fixture.db,
        familyId,
        viewer,
        r.id,
        data,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.archiveRecord(
      fixture.db,
      familyId,
      owner,
      r.id,
      { version: 2, archived: true },
      randomUUID(),
    );
    await expect(
      service.reversePayment(
        fixture.db,
        familyId,
        owner,
        r.id,
        { ...data, version: 3 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rolls back the correction, balance and version when audit persistence fails", async () => {
    const r = await loan();
    await fixture.client.exec(
      `CREATE FUNCTION fail_reversal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'liability.payment.reversed' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_reversal_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_reversal_audit();`,
    );
    try {
      await expect(
        service.reversePayment(
          fixture.db,
          familyId,
          owner,
          r.id,
          {
            version: 2,
            paymentId: r.paymentId,
            reversedOn: "2026-02-03",
            reason: "Audit failure test",
          },
          randomUUID(),
        ),
      ).rejects.toThrow();
      expect(await row(r.id)).toMatchObject({ amount: "900.02", version: 2 });
      expect(
        await fixture.db
          .select()
          .from(s.paymentReversals)
          .where(eq(s.paymentReversals.paymentId, r.paymentId)),
      ).toHaveLength(0);
    } finally {
      await fixture.client.exec(
        "DROP TRIGGER fail_reversal_audit ON audit_logs; DROP FUNCTION fail_reversal_audit();",
      );
    }
  });
});

it("allows only one concurrent reversal of the same payment", async () => {
  const r = await loan(),
    data = {
      version: 2,
      paymentId: r.paymentId,
      reversedOn: "2026-02-02",
      reason: "Concurrent correction",
    };
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      service.reversePayment(
        fixture.db,
        familyId,
        owner,
        r.id,
        data,
        randomUUID(),
      ),
    ),
  );
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect((await row(r.id)).amount).toBe("1000.03");
});
it("adds reminder/reversal schema over populated pre-0.4 data without changing payments", async () => {
  const client = new PGlite();
  try {
    for (const name of [
      "0000_numerous_moonstone",
      "0001_chilly_leper_queen",
      "0002_record_details_ownership",
    ])
      await client.exec(readFileSync(`drizzle/${name}.sql`, "utf8"));
    const family = randomUUID(),
      record = randomUUID(),
      paymentId = randomUUID();
    await client.query(
      `INSERT INTO "user" (id,name,email,email_verified) VALUES ('upgrade-owner','Upgrade','upgrade@example.test',true)`,
    );
    await client.query(
      `INSERT INTO families (id,name,owner_id) VALUES ($1,'Upgrade family','upgrade-owner')`,
      [family],
    );
    await client.query(
      `INSERT INTO catalog_types (code,category_code,kind,name_en,name_bn,category_en,category_bn,seed_version) VALUES ('loan.test','liabilities','liability','Loan','Loan','Loan','Loan',1)`,
    );
    await client.query(
      `INSERT INTO records (id,family_id,kind,type_code,name,created_by,version) VALUES ($1,$2,'liability','loan.test','Legacy loan','upgrade-owner',2)`,
      [record, family],
    );
    await client.query(
      `INSERT INTO liabilities (family_id,record_id,outstanding,balance_as_of) VALUES ($1,$2,'900.02','2026-02-01')`,
      [family, record],
    );
    await client.query(
      `INSERT INTO liability_payments (id,family_id,record_id,principal,interest,fees,balance_before,balance_after,paid_on,created_by) VALUES ($1,$2,$3,'100.01','10.02','2.03','1000.03','900.02','2026-02-01','upgrade-owner')`,
      [paymentId, family, record],
    );
    await client.exec(
      readFileSync("drizzle/0003_reminders_reversals.sql", "utf8"),
    );
    expect(
      (
        await client.query(
          `SELECT principal::text,interest::text,fees::text FROM liability_payments WHERE id=$1`,
          [paymentId],
        )
      ).rows,
    ).toEqual([{ principal: "100.01", interest: "10.02", fees: "2.03" }]);
    expect(
      (
        await client.query(
          `SELECT outstanding::text FROM liabilities WHERE record_id=$1`,
          [record],
        )
      ).rows,
    ).toEqual([{ outstanding: "900.02" }]);
    expect(
      (await client.query(`SELECT count(*)::int AS count FROM reminders`)).rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await client.close();
  }
});

it("applies the migration journal once and safely skips it on rerun", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    expect(
      (
        await client.query(
          `SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
        )
      ).rows,
    ).toEqual([{ count: 4 }]);
    expect(
      (
        await client.query(
          `SELECT count(*)::int AS count FROM payment_reversals`,
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await client.close();
  }
});
