import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { testDatabase } from "./helpers";
import { emailJobs } from "../src/db/schema";
import { seal } from "../src/server/secrets";
import { processEmailJob, recoverableEmailIds } from "../src/server/email-jobs";
import { DeliveryError } from "../src/server/email-delivery";
import { notifyEmailJob } from "../src/server/email-events";
let f: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("RESEND_API_KEY", "synthetic"); vi.stubEnv("EMAIL_FROM", "test@example.test");
  f = await testDatabase();
});
afterAll(async () => {await f.client.close(); vi.unstubAllEnvs();});
beforeEach(async () => {await f.db.delete(emailJobs);});
async function job(patch: Partial<typeof emailJobs.$inferInsert> = {}) {
  const [j] = await f.db.insert(emailJobs).values({payload: seal(JSON.stringify({to: "test@example.test", subject: "Verify your email address", text: "synthetic"}), "email"), ...patch}).returning();
  return j;
}
const read = async (id: string) => (await f.db.select().from(emailJobs).where(eq(emailJobs.id, id)))[0];
it("sends once, clears secrets, and ignores duplicate events", async () => {
  const j = await job(), send = vi.fn(async () => {});
  expect(await processEmailJob(f.db, j.id, send)).toEqual({status: "sent"});
  expect(await processEmailJob(f.db, j.id, send)).toEqual({status: "sent"});
  expect(send).toHaveBeenCalledTimes(1); expect((await read(j.id)).payload).toBe("");
});
it("preserves provider backoff and does not resend before available_at", async () => {
  const j = await job(), send = vi.fn(async () => {throw new DeliveryError("RESEND_HTTP_429", true, 180);});
  expect((await processEmailJob(f.db, j.id, send)).retryAt).toBeTruthy();
  expect((await processEmailJob(f.db, j.id, send)).status).toBe("waiting");
  expect(send).toHaveBeenCalledTimes(1); expect((await recoverableEmailIds(f.db))).toHaveLength(0);
});
it("ends permanent failures without automatic replay", async () => {
  const j = await job();
  expect((await processEmailJob(f.db, j.id, async () => {throw new DeliveryError("RESEND_HTTP_403", false);})).status).toBe("failed");
  expect(await recoverableEmailIds(f.db)).toHaveLength(0);
});
it("expires stale auth mail before provider submission", async () => {
  const j = await job({createdAt: new Date(Date.now() - 7 * 3600000)}), send = vi.fn(async () => {});
  expect((await processEmailJob(f.db, j.id, send)).status).toBe("expired"); expect(send).not.toHaveBeenCalled();
});
it("does not steal an active lease", async () => {
  const j = await job({status: "processing", leaseUntil: new Date(Date.now() + 60000)}), send = vi.fn(async () => {});
  expect((await processEmailJob(f.db, j.id, send)).status).toBe("waiting"); expect(send).not.toHaveBeenCalled();
});
it("recovers abandoned leases and pending jobs without published events", async () => {
  const j = await job({status: "processing", leaseUntil: new Date(Date.now() - 1000), attempts: 1});
  expect(await recoverableEmailIds(f.db)).toEqual([{id:j.id}]);
  expect((await processEmailJob(f.db, j.id, async () => {})).status).toBe("sent");
});
it("caps exhausted leases without another provider call", async () => {
  const j = await job({status: "processing", leaseUntil: new Date(Date.now()-1000), attempts:5}), send = vi.fn(async () => {});
  expect((await processEmailJob(f.db,j.id,send)).status).toBe("failed"); expect(send).not.toHaveBeenCalled();
});
it("fails safely when payload cannot be decrypted", async () => {
  const j = await job({payload:"invalid"}), send = vi.fn(async () => {});
  expect((await processEmailJob(f.db,j.id,send)).status).toBe("failed"); expect(send).not.toHaveBeenCalled();
});
it("does not mark a superseded lease sent", async () => {
  const j = await job();
  const result = await processEmailJob(f.db,j.id,async () => {
    await f.db.update(emailJobs).set({leaseToken:"00000000-0000-4000-8000-000000000001"}).where(eq(emailJobs.id,j.id));
  });
  expect(result.status).toBe("lease_lost"); expect((await read(j.id)).status).toBe("processing");
});
it("does not contact Inngest in standalone mode", async () => {
  vi.stubEnv("EMAIL_DELIVERY_MODE", "worker");
  const transport = vi.spyOn(globalThis,"fetch");
  await notifyEmailJob("00000000-0000-4000-8000-000000000001");
  expect(transport).not.toHaveBeenCalled(); transport.mockRestore();
});
