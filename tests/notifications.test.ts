import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { testDatabase } from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import {
  applyReminderGate,
  notificationSettings,
  saveNotificationSettings,
  scheduleReminderEmails,
  reminderDeliveryGate,
} from "../src/server/notifications";
import {
  notificationDefaults,
  notificationInput,
  localClock,
  quietAt,
} from "../src/lib/notifications";
import { decodeEmail, deliverEmail } from "../src/server/email-delivery";
let f: Awaited<ReturnType<typeof testDatabase>>,
  familyId: string,
  viewerMembership: string,
  recordId: string,
  reminderId: string;
const owner = { id: "notification-owner", email: "owner@example.test" },
  viewer = { id: "notification-viewer", email: "viewer@example.test" },
  outsider = { id: "notification-outsider", email: "outsider@example.test" };
const now = new Date("2026-11-20T03:00:00Z"); // 09:00 Bangladesh.
const input = { ...notificationDefaults, enabled: true, advanceDays: [0] };
const settings = (patch: Record<string, unknown> = {}) =>
  saveNotificationSettings(f.db, familyId, owner, { ...input, ...patch });
const jobs = () => f.db.select().from(s.emailJobs);
async function queue() {
  await settings();
  await scheduleReminderEmails(f.db, now);
  return (await jobs())[0];
}
beforeAll(async () => {
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  f = await testDatabase();
  await f.db.insert(s.user).values(
    [owner, viewer, outsider].map((a) => ({
      ...a,
      name: a.id,
      emailVerified: true,
    })),
  );
});
afterAll(async () => {
  await f?.client.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await f.client.exec(
    "TRUNCATE families CASCADE; TRUNCATE email_jobs CASCADE;",
  );
  familyId = (
    await service.createFamily(f.db, owner, { name: "Notification family" })
  ).id;
  viewerMembership = (
    await f.db
      .insert(s.memberships)
      .values({ familyId, userId: viewer.id, role: "member" })
      .returning()
  )[0].id;
  recordId = (
    await service.createRecord(
      f.db,
      familyId,
      owner,
      {
        kind: "asset",
        typeCode: "property.apartment",
        name: "Private asset name",
        amount: "3000.01",
        asOf: "2026-01-01",
      },
      randomUUID(),
    )
  ).id;
  await service.saveReminder(
    f.db,
    familyId,
    owner,
    recordId,
    {
      version: 1,
      title: "Private tax task",
      category: "payment",
      dueOn: "2026-11-20",
      recurrence: "none",
      note: "Private note",
    },
    randomUUID(),
  );
  reminderId = (await service.listReminders(f.db, familyId, owner)).reminders[0]
    .id;
});
it("defaults to opt-out and scopes settings to the member", async () => {
  expect(
    (await notificationSettings(f.db, familyId, owner)).preferences.enabled,
  ).toBe(false);
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(0);
  await expect(
    saveNotificationSettings(f.db, familyId, outsider, input),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await settings();
  expect(
    (await notificationSettings(f.db, familyId, viewer)).preferences.enabled,
  ).toBe(false);
});
it("uses optimistic settings versions and validates time zones/quiet hours", async () => {
  await settings();
  await expect(settings()).rejects.toMatchObject({ code: "CONFLICT" });
  await settings({ version: 1, enabled: false });
  expect(
    (await notificationSettings(f.db, familyId, owner)).preferences.version,
  ).toBe(2);
  for (const patch of [
    { timeZone: "Invalid/Zone" },
    { sendAt: "25:00" },
    { sendAt: "23:00" },
    { quietStart: "07:00", quietEnd: "07:00" },
    { advanceDays: [-1] },
    { advanceDays: [] },
    { categories: [] },
  ])
    expect(notificationInput.safeParse({ ...input, ...patch }).success).toBe(
      false,
    );
});
it("queues at the preferred local time, encrypts content and deduplicates an occurrence", async () => {
  await settings();
  expect(
    (await scheduleReminderEmails(f.db, new Date("2026-11-20T02:59:00Z")))
      .queued,
  ).toBe(0);
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(1);
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(0);
  const job = (await jobs())[0],
    mail = decodeEmail(job.payload);
  expect(job.payload).not.toContain(owner.email);
  expect(mail.kind).toBe("reminder");
  expect(mail.html).toContain("Review reminders");
  for (const secret of [
    "Private asset name",
    "Private tax task",
    "3000.01",
    "Private note",
  ])
    expect(mail.text + mail.html).not.toContain(secret);
  expect(
    new URL(mail.text.match(/https:\/\/\S+/)![0]).searchParams.get("family"),
  ).toBe(familyId);
  expect(await reminderDeliveryGate(f.db, job.id, mail.to, now, true)).toEqual({
    action: "send",
  });
});
it("queues advance intervals independently and does not backfill missed days", async () => {
  await settings({ advanceDays: [0, 1, 7] });
  expect(
    (await scheduleReminderEmails(f.db, new Date("2026-11-13T03:00:00Z")))
      .queued,
  ).toBe(1);
  expect(
    (await scheduleReminderEmails(f.db, new Date("2026-11-19T03:00:00Z")))
      .queued,
  ).toBe(1);
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(1);
  expect(
    (await scheduleReminderEmails(f.db, new Date("2026-11-21T03:00:00Z")))
      .queued,
  ).toBe(0);
});
it("respects category controls and viewer permissions", async () => {
  await settings({ categories: ["maturity"] });
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(0);
  await saveNotificationSettings(f.db, familyId, viewer, input);
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(0);
  await service.setGrant(f.db, familyId, owner, recordId, {
    membershipId: viewerMembership,
    action: "view",
    effect: "allow",
  });
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(1);
  expect(decodeEmail((await jobs())[0].payload).to).toBe(viewer.email);
});
it("prevents scheduling for archived records", async () => {
  await settings();
  await service.archiveRecord(
    f.db,
    familyId,
    owner,
    recordId,
    { version: 2, archived: true },
    randomUUID(),
  );
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(0);
});
it("cancels queued mail after opt-out", async () => {
  const job = await queue();
  await settings({ version: 1, enabled: false });
  expect(
    await reminderDeliveryGate(f.db, job.id, owner.email, now, true),
  ).toMatchObject({ action: "cancel", code: "REMINDER_OPTED_OUT" });
});
it("cancels queued mail after completion or rescheduling", async () => {
  const job = await queue();
  await service.changeReminder(
    f.db,
    familyId,
    owner,
    recordId,
    { version: 2, reminderId, action: "complete" },
    randomUUID(),
  );
  expect(
    await reminderDeliveryGate(f.db, job.id, owner.email, now, true),
  ).toMatchObject({ action: "cancel", code: "REMINDER_CHANGED" });
});
it("revocation blocks queued mail and hides history", async () => {
  await saveNotificationSettings(f.db, familyId, viewer, input);
  await service.setGrant(f.db, familyId, owner, recordId, {
    membershipId: viewerMembership,
    action: "view",
    effect: "allow",
  });
  await scheduleReminderEmails(f.db, now);
  const job = (await jobs())[0];
  expect(
    (await notificationSettings(f.db, familyId, viewer)).deliveries,
  ).toHaveLength(1);
  await service.setGrant(f.db, familyId, owner, recordId, {
    membershipId: viewerMembership,
    action: "view",
    effect: "deny",
  });
  expect(
    await reminderDeliveryGate(f.db, job.id, viewer.email, now, true),
  ).toMatchObject({ action: "cancel", code: "REMINDER_ACCESS_CHANGED" });
  expect(
    (await notificationSettings(f.db, familyId, viewer)).deliveries,
  ).toHaveLength(0);
});
it("expires delivery windows and defers inside quiet hours", async () => {
  const job = await queue();
  expect(
    await reminderDeliveryGate(
      f.db,
      job.id,
      owner.email,
      new Date("2026-11-20T16:00:00Z"),
      true,
    ),
  ).toMatchObject({ action: "defer" });
  expect(
    await reminderDeliveryGate(
      f.db,
      job.id,
      owner.email,
      new Date("2026-11-21T03:00:00Z"),
      true,
    ),
  ).toMatchObject({ action: "cancel", code: "REMINDER_WINDOW_ENDED" });
});
it("rechecks preferred time changes before delivery", async () => {
  const job = await queue();
  await settings({ version: 1, sendAt: "10:00" });
  expect(
    await reminderDeliveryGate(f.db, job.id, owner.email, now, true),
  ).toMatchObject({ action: "defer" });
  expect(
    await reminderDeliveryGate(
      f.db,
      job.id,
      owner.email,
      new Date("2026-11-20T04:00:00Z"),
      true,
    ),
  ).toEqual({ action: "send" });
});
it("does not resend a completed-and-reopened occurrence", async () => {
  await queue();
  await service.changeReminder(
    f.db,
    familyId,
    owner,
    recordId,
    { version: 2, reminderId, action: "complete" },
    randomUUID(),
  );
  await service.changeReminder(
    f.db,
    familyId,
    owner,
    recordId,
    { version: 3, reminderId, action: "reopen" },
    randomUUID(),
  );
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(0);
});
it("uses new occurrence keys for recurring reminders", async () => {
  await service.saveReminder(
    f.db,
    familyId,
    owner,
    recordId,
    {
      version: 2,
      reminderId,
      title: "Recurring",
      category: "payment",
      dueOn: "2026-11-20",
      recurrence: "daily",
      note: "",
    },
    randomUUID(),
  );
  await queue();
  await service.changeReminder(
    f.db,
    familyId,
    owner,
    recordId,
    { version: 3, reminderId, action: "complete" },
    randomUUID(),
  );
  expect(
    (await scheduleReminderEmails(f.db, new Date("2026-11-21T03:00:00Z")))
      .queued,
  ).toBe(1);
});
it("retains auth-mail delivery and fails closed for a missing reminder mapping", async () => {
  const id = randomUUID();
  expect(await reminderDeliveryGate(f.db, id, owner.email, now)).toEqual({
    action: "send",
  });
  expect(
    await reminderDeliveryGate(f.db, id, owner.email, now, true),
  ).toMatchObject({ action: "cancel", code: "REMINDER_MAPPING_MISSING" });
});
it("rejects changed/unverified recipient email before dispatch", async () => {
  const job = await queue();
  expect(
    await reminderDeliveryGate(f.db, job.id, "other@example.test", now, true),
  ).toMatchObject({ action: "cancel" });
  await f.db
    .update(s.user)
    .set({ emailVerified: false })
    .where(eq(s.user.id, owner.id));
  try {
    expect(
      await reminderDeliveryGate(f.db, job.id, owner.email, now, true),
    ).toMatchObject({ action: "cancel" });
  } finally {
    await f.db
      .update(s.user)
      .set({ emailVerified: true })
      .where(eq(s.user.id, owner.id));
  }
});
it("does not expose another member's delivery history", async () => {
  await queue();
  expect(
    (await notificationSettings(f.db, familyId, viewer)).deliveries,
  ).toHaveLength(0);
});
it("handles midnight, DST changes and both quiet-hour shapes", () => {
  expect(localClock(new Date("2026-11-19T18:00:00Z"), "Asia/Dhaka")).toEqual({
    date: "2026-11-20",
    time: "00:00",
  });
  expect(
    localClock(new Date("2026-11-01T05:30:00Z"), "America/New_York"),
  ).toEqual(localClock(new Date("2026-11-01T06:30:00Z"), "America/New_York"));
  expect(quietAt("23:00", "22:00", "07:00")).toBe(true);
  expect(quietAt("07:00", "22:00", "07:00")).toBe(false);
  expect(quietAt("13:00", "12:00", "14:00")).toBe(true);
});
it("strips internal reminder classification from provider request bodies", async () => {
  const job = await queue();
  let sent: Record<string, unknown> = {};
  await deliverEmail(job, async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ id: "synthetic" });
  });
  expect(sent.kind).toBeUndefined();
  expect(sent.to).toBe(owner.email);
});
it("rolls back delivery reservations if encrypted queue creation fails", async () => {
  await settings();
  const key = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = "";
  try {
    await expect(scheduleReminderEmails(f.db, now)).rejects.toBeTruthy();
  } finally {
    process.env.APP_ENCRYPTION_KEY = key;
  }
  expect(await f.db.select().from(s.notificationDeliveries)).toHaveLength(0);
  expect(await jobs()).toHaveLength(0);
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(1);
});
it("pages preference rows so later families are not starved", async () => {
  await settings();
  for (let i = 0; i < 25; i++) {
    const family = (
      await service.createFamily(f.db, owner, { name: `Extra family ${i}` })
    ).id;
    await saveNotificationSettings(f.db, family, owner, input);
  }
  const first = await scheduleReminderEmails(f.db, now);
  expect(first.nextCursor).toBeTruthy();
  const second = await scheduleReminderEmails(f.db, now, first.nextCursor);
  expect(second.nextCursor).toBeUndefined();
  expect(first.queued + second.queued).toBe(1);
});
it("blocks expired memberships at scheduling and dispatch", async () => {
  await saveNotificationSettings(f.db, familyId, viewer, input);
  await service.setGrant(f.db, familyId, owner, recordId, {
    membershipId: viewerMembership,
    action: "view",
    effect: "allow",
  });
  await scheduleReminderEmails(f.db, now);
  const job = (await jobs())[0];
  await f.db
    .update(s.memberships)
    .set({ expiresAt: new Date("2026-01-01T00:00:00Z") })
    .where(eq(s.memberships.id, viewerMembership));
  expect(
    await reminderDeliveryGate(f.db, job.id, viewer.email, now, true),
  ).toMatchObject({ action: "cancel" });
  expect((await scheduleReminderEmails(f.db, now)).queued).toBe(0);
});
it("cancels rescheduled or archived queued reminders", async () => {
  const job = await queue();
  await service.saveReminder(
    f.db,
    familyId,
    owner,
    recordId,
    {
      version: 2,
      reminderId,
      title: "Moved",
      category: "payment",
      dueOn: "2026-11-21",
      recurrence: "none",
      note: "",
    },
    randomUUID(),
  );
  expect(
    await reminderDeliveryGate(f.db, job.id, owner.email, now, true),
  ).toMatchObject({ action: "cancel", code: "REMINDER_CHANGED" });
  await service.archiveRecord(
    f.db,
    familyId,
    owner,
    recordId,
    { version: 3, archived: true },
    randomUUID(),
  );
  expect(
    (await scheduleReminderEmails(f.db, new Date("2026-11-21T03:00:00Z")))
      .queued,
  ).toBe(0);
});
it("defers a claimed job without spending retry attempts and fences stale leases", async () => {
  const job = await queue(),
    lease = randomUUID();
  await f.db
    .update(s.emailJobs)
    .set({
      status: "processing",
      attempts: 2,
      leaseToken: lease,
      leaseUntil: new Date(now.getTime() + 60000),
    })
    .where(eq(s.emailJobs.id, job.id));
  expect(
    await applyReminderGate(
      f.db,
      job.id,
      randomUUID(),
      { action: "cancel", code: "TEST" },
      now,
    ),
  ).toBe(false);
  expect(
    await applyReminderGate(
      f.db,
      job.id,
      lease,
      { action: "defer", code: "REMINDER_QUIET_HOURS" },
      now,
    ),
  ).toBe(true);
  const updated = (await jobs())[0];
  expect(updated.status).toBe("pending");
  expect(updated.attempts).toBe(1);
  expect(updated.availableAt.getTime()).toBe(now.getTime() + 300000);
  expect(updated.payload).toBe(job.payload);
  expect(updated.leaseToken).toBeNull();
});
it("clears a cancelled job's encrypted content and retains delivery history", async () => {
  const job = await queue(),
    lease = randomUUID();
  await f.db
    .update(s.emailJobs)
    .set({ status: "processing", leaseToken: lease })
    .where(eq(s.emailJobs.id, job.id));
  await applyReminderGate(
    f.db,
    job.id,
    lease,
    { action: "cancel", code: "REMINDER_OPTED_OUT" },
    now,
  );
  expect((await jobs())[0].payload).toBe("");
  expect(
    (await notificationSettings(f.db, familyId, owner)).deliveries[0].status,
  ).toBe("cancelled");
});
