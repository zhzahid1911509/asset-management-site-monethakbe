import { and, eq, asc, desc, gt, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as s from "../db/schema";
import { member, audit, type Actor } from "./service";
import { can, isActive } from "../lib/policy";
import { AppError } from "../lib/errors";
import {
  notificationDefaults,
  notificationInput,
  deliveryWindow,
  dateDistance,
} from "../lib/notifications";
import { seal } from "./secrets";
import { emailTemplate } from "./email-templates";
type Query = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
function parseSettings(row: typeof s.notificationPreferences.$inferSelect) {
  const {
    id: _,
    familyId: __,
    userId: ___,
    updatedAt: ____,
    ...settings
  } = row;
  return notificationInput.parse(settings);
}
async function recipient(q: Query, familyId: string, userId: string) {
  const [value] = await q
    .select({
      membership: s.memberships,
      user: s.user,
      settings: s.notificationPreferences,
    })
    .from(s.notificationPreferences)
    .innerJoin(
      s.memberships,
      and(
        eq(s.memberships.familyId, s.notificationPreferences.familyId),
        eq(s.memberships.userId, s.notificationPreferences.userId),
      ),
    )
    .innerJoin(s.user, eq(s.user.id, s.notificationPreferences.userId))
    .where(
      and(
        eq(s.notificationPreferences.familyId, familyId),
        eq(s.notificationPreferences.userId, userId),
      ),
    );
  return value;
}
export async function notificationSettings(db: Db, familyId: string, a: Actor) {
  const m = await member(db, familyId, a);
  const [settings] = await db
    .select()
    .from(s.notificationPreferences)
    .where(
      and(
        eq(s.notificationPreferences.familyId, familyId),
        eq(s.notificationPreferences.userId, a.id),
      ),
    );
  const grants = await db
    .select()
    .from(s.recordGrants)
    .where(
      and(
        eq(s.recordGrants.familyId, familyId),
        eq(s.recordGrants.membershipId, m.id),
      ),
    );
  const attempts = await db
    .select({
      id: s.notificationDeliveries.id,
      record: s.records,
      reminderTitle: s.reminders.title,
      dueOn: s.notificationDeliveries.dueOn,
      advanceDays: s.notificationDeliveries.advanceDays,
      createdAt: s.notificationDeliveries.createdAt,
      status: s.emailJobs.status,
      errorCode: s.emailJobs.lastError,
    })
    .from(s.notificationDeliveries)
    .innerJoin(
      s.records,
      and(
        eq(s.records.familyId, s.notificationDeliveries.familyId),
        eq(s.records.id, s.notificationDeliveries.recordId),
      ),
    )
    .innerJoin(
      s.reminders,
      eq(s.reminders.id, s.notificationDeliveries.reminderId),
    )
    .leftJoin(s.emailJobs, eq(s.emailJobs.id, s.notificationDeliveries.jobId))
    .where(
      and(
        eq(s.notificationDeliveries.familyId, familyId),
        eq(s.notificationDeliveries.userId, a.id),
      ),
    )
    .orderBy(
      desc(s.notificationDeliveries.createdAt),
      desc(s.notificationDeliveries.id),
    )
    .limit(101);
  return {
    preferences: settings ? parseSettings(settings) : notificationDefaults,
    deliveries: attempts
      .slice(0, 100)
      .filter((row) => can(m, row.record, "view", grants))
      .map(({ record, ...row }) => ({ ...row, recordName: record.name })),
    hasMore: attempts.length > 100,
  };
}
export async function saveNotificationSettings(
  db: Db,
  familyId: string,
  a: Actor,
  raw: unknown,
) {
  const input = notificationInput.parse(raw);
  return db.transaction(async (q) => {
    await member(q, familyId, a);
    const { version, ...data } = input;
    const updated =
      version === 0
        ? await q
            .insert(s.notificationPreferences)
            .values({ familyId, userId: a.id, ...data })
            .onConflictDoNothing()
            .returning()
        : await q
            .update(s.notificationPreferences)
            .set({ ...data, version: version + 1, updatedAt: new Date() })
            .where(
              and(
                eq(s.notificationPreferences.familyId, familyId),
                eq(s.notificationPreferences.userId, a.id),
                eq(s.notificationPreferences.version, version),
              ),
            )
            .returning();
    if (!updated.length) throw new AppError("CONFLICT", 409);
    await audit(q, familyId, a, "notifications.preferences-updated");
    return { version: updated[0].version };
  });
}
// Each invocation visits at most 25 preference rows. The worker retains the cursor and wraps.
export async function scheduleReminderEmails(
  db: Db,
  now = new Date(),
  cursor?: string,
) {
  const page = await db
    .select({
      id: s.notificationPreferences.id,
      familyId: s.notificationPreferences.familyId,
      userId: s.notificationPreferences.userId,
    })
    .from(s.notificationPreferences)
    .where(
      and(
        eq(s.notificationPreferences.enabled, true),
        cursor ? gt(s.notificationPreferences.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(s.notificationPreferences.id))
    .limit(25);
  let queued = 0;
  for (const item of page)
    queued += await db.transaction(async (q) => {
      await q.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"reminder-mail:" + item.familyId + ":" + item.userId},0))`,
      );
      const target = await recipient(q, item.familyId, item.userId);
      if (
        !target ||
        !target.user.emailVerified ||
        !isActive(target.membership, now)
      )
        return 0;
      const input = parseSettings(target.settings),
        window = deliveryWindow(input, now);
      if (!window.open) return 0;
      const grants = await q
        .select()
        .from(s.recordGrants)
        .where(
          and(
            eq(s.recordGrants.familyId, item.familyId),
            eq(s.recordGrants.membershipId, target.membership.id),
          ),
        );
      const candidates = await q
        .select({ reminder: s.reminders, record: s.records })
        .from(s.reminders)
        .innerJoin(
          s.records,
          and(
            eq(s.records.familyId, s.reminders.familyId),
            eq(s.records.id, s.reminders.recordId),
          ),
        )
        .where(
          and(
            eq(s.reminders.familyId, item.familyId),
            eq(s.reminders.status, "active"),
            eq(s.records.archived, false),
          ),
        );
      let count = 0;
      for (const { reminder, record } of candidates) {
        const lead = dateDistance(window.date, reminder.dueOn);
        if (
          !input.categories.includes(
            reminder.category as (typeof input.categories)[number],
          ) ||
          !input.advanceDays.includes(lead) ||
          !can(target.membership, record, "view", grants)
        )
          continue;
        const [delivery] = await q
          .insert(s.notificationDeliveries)
          .values({
            familyId: item.familyId,
            recordId: record.id,
            reminderId: reminder.id,
            userId: item.userId,
            dueOn: reminder.dueOn,
            advanceDays: lead,
            scheduledOn: window.date,
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning();
        if (!delivery) continue;
        const url = new URL("/app", process.env.APP_ORIGIN);
        url.searchParams.set("view", "reminders");
        url.searchParams.set("family", item.familyId);
        const [job] = await q
          .insert(s.emailJobs)
          .values({
            payload: seal(
              JSON.stringify({
                ...emailTemplate("reminder", url.toString(), target.user.email),
                kind: "reminder",
              }),
              "email",
            ),
            createdAt: now,
            availableAt: now,
          })
          .returning();
        await q
          .update(s.notificationDeliveries)
          .set({ jobId: job.id })
          .where(eq(s.notificationDeliveries.id, delivery.id));
        count++;
      }
      return count;
    });
  return {
    queued,
    nextCursor: page.length === 25 ? page.at(-1)!.id : undefined,
  };
}
export type ReminderGate =
  | { action: "send" }
  | { action: "cancel"; code: string }
  | { action: "defer"; code: string };
export async function reminderDeliveryGate(
  db: Db,
  jobId: string,
  to: string,
  now = new Date(),
  requireDelivery = false,
): Promise<ReminderGate> {
  const [d] = await db
    .select()
    .from(s.notificationDeliveries)
    .where(eq(s.notificationDeliveries.jobId, jobId));
  if (!d)
    return requireDelivery
      ? { action: "cancel", code: "REMINDER_MAPPING_MISSING" }
      : { action: "send" }; // Auth/invitation mail is not governed by reminder preferences.
  const target = await recipient(db, d.familyId, d.userId);
  if (
    !target ||
    !target.user.emailVerified ||
    target.user.email !== to ||
    !isActive(target.membership, now)
  )
    return { action: "cancel", code: "REMINDER_ACCESS_CHANGED" };
  const input = parseSettings(target.settings);
  const [pair] = await db
    .select({ reminder: s.reminders, record: s.records })
    .from(s.reminders)
    .innerJoin(
      s.records,
      and(
        eq(s.records.familyId, s.reminders.familyId),
        eq(s.records.id, s.reminders.recordId),
      ),
    )
    .where(
      and(
        eq(s.reminders.familyId, d.familyId),
        eq(s.reminders.id, d.reminderId),
      ),
    );
  if (
    !pair ||
    pair.record.archived ||
    pair.reminder.status !== "active" ||
    pair.reminder.dueOn !== d.dueOn
  )
    return { action: "cancel", code: "REMINDER_CHANGED" };
  const grants = await db
    .select()
    .from(s.recordGrants)
    .where(
      and(
        eq(s.recordGrants.familyId, d.familyId),
        eq(s.recordGrants.membershipId, target.membership.id),
      ),
    );
  if (!can(target.membership, pair.record, "view", grants))
    return { action: "cancel", code: "REMINDER_ACCESS_CHANGED" };
  if (
    !input.enabled ||
    !input.categories.includes(
      pair.reminder.category as (typeof input.categories)[number],
    ) ||
    !input.advanceDays.includes(d.advanceDays)
  )
    return { action: "cancel", code: "REMINDER_OPTED_OUT" };
  const window = deliveryWindow(input, now);
  if (
    window.date !== d.scheduledOn ||
    dateDistance(window.date, d.dueOn) !== d.advanceDays
  )
    return { action: "cancel", code: "REMINDER_WINDOW_ENDED" };
  if (!window.open) return { action: "defer", code: "REMINDER_QUIET_HOURS" };
  return { action: "send" };
}

// Fenced queue transitions: a stale worker must not cancel/defer a newer lease.
export async function applyReminderGate(
  db: Db,
  jobId: string,
  lease: string,
  gate: Exclude<ReminderGate, { action: "send" }>,
  now = new Date(),
) {
  const patch =
    gate.action === "cancel"
      ? {
          status: "cancelled",
          payload: "",
          lastError: gate.code,
          leaseToken: null,
          leaseUntil: null,
        }
      : {
          status: "pending",
          attempts: sql`greatest(${s.emailJobs.attempts}-1,0)`,
          availableAt: new Date(now.getTime() + 300000),
          lastError: gate.code,
          leaseToken: null,
          leaseUntil: null,
        };
  const updated = await db
    .update(s.emailJobs)
    .set(patch)
    .where(
      and(
        eq(s.emailJobs.id, jobId),
        eq(s.emailJobs.status, "processing"),
        eq(s.emailJobs.leaseToken, lease),
      ),
    )
    .returning({ id: s.emailJobs.id });
  return updated.length === 1;
}
