import { randomUUID } from "node:crypto";
import { and, eq, lte, lt, or, asc, sql } from "drizzle-orm";
import type { Db } from "../db";
import { emailJobs as jobs } from "../db/schema";
import { decodeEmail, deliverEmail, DeliveryError } from "./email-delivery";
import { applyReminderGate, reminderDeliveryGate } from "./notifications";

const due = (now: Date) => or(
  and(eq(jobs.status, "pending"), lte(jobs.availableAt, now)),
  and(eq(jobs.status, "processing"), lt(jobs.leaseUntil, now)),
);
export async function recoverableEmailIds(db: Db, now = new Date()) {
  return db.select({ id: jobs.id }).from(jobs).where(due(now))
    .orderBy(asc(jobs.createdAt)).limit(100);
}
export function emailExpired(subject: string, createdAt: Date, now: Date) {
  const auth = ["Verify your email address", "Verify your email", "Reset your password"].includes(subject);
  // Stop auth delivery slightly before token expiry; legacy jobs use the same subjects.
  return now.getTime() - createdAt.getTime() >= (auth ? 55 * 60 : 12 * 3600) * 1000;
}
export async function processEmailJob(
  db: Db, id: string, send: (job: {id: string; payload: string}) => Promise<unknown> = deliverEmail, now = new Date(),
): Promise<{ status: string; retryAt?: string }> {
  const lease = randomUUID();
  // UPDATE with a conditional predicate atomically claims exactly one job.
  const [job] = await db.update(jobs).set({
    status: "processing", leaseToken: lease,
    leaseUntil: new Date(now.getTime() + 120000), attempts: sql`${jobs.attempts} + 1`,
  }).where(and(eq(jobs.id, id), due(now))).returning();
  if (!job) {
    const [current] = await db.select({status: jobs.status, availableAt: jobs.availableAt, leaseUntil: jobs.leaseUntil})
      .from(jobs).where(eq(jobs.id, id));
    const next = current?.status === "pending" ? current.availableAt : current?.status === "processing" ? current.leaseUntil : null;
    return next ? {status: "waiting", retryAt: new Date(Math.max(next.getTime() + 1000, Date.now() + 1000)).toISOString()} : {status: current?.status ?? "missing"};
  }
  const owned = and(eq(jobs.id, id), eq(jobs.status, "processing"), eq(jobs.leaseToken, lease));
  const finish = async (status: string, code: string | null = null) => {
    const rows = await db.update(jobs).set({status, lastError: code, payload: "", leaseToken: null, leaseUntil: null})
      .where(owned).returning({id: jobs.id});
    return {status: rows.length ? status : "lease_lost"};
  };
  try {
    if (job.attempts > 5) return finish("failed", "LEASE_EXHAUSTED");
    const decoded = decodeEmail(job.payload);
    if (emailExpired(decoded.subject, job.createdAt, now)) return finish("expired", "EMAIL_EXPIRED");
    const gate = await reminderDeliveryGate(db, id, decoded.to, now, decoded.kind === "reminder");
    if (gate.action !== "send") {
      await applyReminderGate(db, id, lease, gate, now);
      return gate.action === "defer" ? {status: "waiting", retryAt: new Date(now.getTime() + 300000).toISOString()} : {status: "cancelled"};
    }
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new DeliveryError("EMAIL_PROVIDER_NOT_CONFIGURED", true);
    const renewed = await db.update(jobs).set({leaseUntil: new Date(Date.now() + 120000)})
      .where(and(owned, sql`${jobs.leaseUntil} > now()`)).returning({id: jobs.id});
    if (!renewed.length) return {status: "lease_lost"};
    await send(job);
    const result = await finish("sent");
    console.log(JSON.stringify({event: "email." + (result.status === "sent" ? "provider_accepted" : "lease_lost"), id}));
    return result;
  } catch (error) {
    const failure = error instanceof DeliveryError ? error : new DeliveryError("EMAIL_COMPLETION_UNKNOWN", true);
    const status = failure.retryable && job.attempts < 5 ? "pending" : "failed";
    const retryAt = new Date(Date.now() + Math.max(1, failure.delaySeconds) * 1000);
    await db.update(jobs).set({status, lastError: failure.code, availableAt: retryAt, leaseToken: null, leaseUntil: null})
      .where(owned);
    console.error(JSON.stringify({event: "email.failed", id, code: failure.code, next: status}));
    return status === "pending" ? {status, retryAt: retryAt.toISOString()} : {status};
  }
}
