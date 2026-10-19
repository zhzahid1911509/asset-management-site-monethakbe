import { z } from "zod";
import { inngest } from "./client";
import { getDb } from "../db";
import { processEmailJob, recoverableEmailIds } from "../server/email-jobs";
import { scheduleReminderEmails } from "../server/notifications";

export const sendQueuedEmail = inngest.createFunction(
  { id: "send-queued-email", triggers: { event: "monethakbe/email.queued" }, retries: 3, concurrency: { limit: 1 } },
  async ({ event, step }) => {
    if (process.env.EMAIL_DELIVERY_MODE !== "inngest") return {status: "disabled"};
    const parsed = z.string().uuid().safeParse(event.data.jobId);
    if (!parsed.success) return {status: "invalid_job"};
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await step.run(`deliver-${attempt}`, async () => {
        try { return await processEmailJob(getDb(), parsed.data); }
        catch { throw new Error("EMAIL_DATABASE_UNAVAILABLE"); }
      });
      if (!result.retryAt) return result;
      await step.sleepUntil(`retry-${attempt}`, result.retryAt);
    }
    return {status: "deferred_to_recovery"};
  },
);
export const recoverEmails = inngest.createFunction(
  { id: "recover-email-queue", triggers: { cron: "*/5 * * * *" }, retries: 3, concurrency: { limit: 1 } },
  async ({ step }) => {
    if (process.env.EMAIL_DELIVERY_MODE !== "inngest") return {status: "disabled"};
    const ids = await step.run("find-due-jobs", async () => {
      try { return await recoverableEmailIds(getDb()); }
      catch { throw new Error("EMAIL_DATABASE_UNAVAILABLE"); }
    });
    if (ids.length) await step.sendEvent("dispatch-due-jobs", ids.map(({id}) => ({name: "monethakbe/email.queued", data: {jobId: id}})));
    return {dispatched: ids.length};
  },
);
export const scheduleReminders = inngest.createFunction(
  { id: "schedule-reminder-emails", triggers: { cron: "*/15 * * * *" }, retries: 3, concurrency: { limit: 1 } },
  async ({ step }) => {
    if (process.env.EMAIL_DELIVERY_MODE !== "inngest") return {status: "disabled"};
    let cursor: string | undefined;
    let queued = 0;
    let page = 0;
    do {
      const result: {queued: number; nextCursor?: string} = await step.run(`schedule-page-${page++}`, async () => {
        try { return await scheduleReminderEmails(getDb(), new Date(), cursor, 1); }
        catch { throw new Error("REMINDER_SCHEDULER_UNAVAILABLE"); }
      });
      queued += result.queued;
      cursor = result.nextCursor;
    } while (cursor);
    // Recovery also dispatches these if this step is interrupted.
    const ids = await step.run("find-reminder-jobs", async () => {
      try { return await recoverableEmailIds(getDb()); }
      catch { throw new Error("EMAIL_DATABASE_UNAVAILABLE"); }
    });
    if (ids.length) await step.sendEvent("dispatch-reminders", ids.map(({id}) => ({name: "monethakbe/email.queued", data: {jobId: id}})));
    return {queued};
  },
);
