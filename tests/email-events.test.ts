import { it, expect, vi, afterEach } from "vitest";
const { send } = vi.hoisted(() => ({send: vi.fn()}));
vi.mock("../src/inngest/client", () => ({inngest: {send}}));
import { notifyEmailJob } from "../src/server/email-events";
afterEach(() => {vi.unstubAllEnvs();vi.clearAllMocks();});
it("publishes only the committed job identifier", async () => {
  vi.stubEnv("EMAIL_DELIVERY_MODE","inngest"); send.mockResolvedValue({ids:["test"]});
  await notifyEmailJob("00000000-0000-4000-8000-000000000001");
  expect(send).toHaveBeenCalledWith({name:"monethakbe/email.queued",data:{jobId:"00000000-0000-4000-8000-000000000001"}});
});
it("leaves a queued job recoverable when event publishing fails", async () => {
  vi.stubEnv("EMAIL_DELIVERY_MODE","inngest"); send.mockRejectedValue(new Error("sensitive transport detail"));
  const log = vi.spyOn(console,"error").mockImplementation(() => {});
  await expect(notifyEmailJob("00000000-0000-4000-8000-000000000001")).resolves.toBeUndefined();
  expect(log.mock.calls.flat().join()).not.toContain("sensitive transport detail");
  expect(log.mock.calls.flat().join()).toContain("scheduled_recovery");log.mockRestore();
});
