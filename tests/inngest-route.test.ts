import { it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
afterEach(() => {vi.unstubAllEnvs();vi.resetModules();});
it("rejects production requests without a signing key", async () => {
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("INNGEST_SIGNING_KEY","");
  const {POST} = await import("../src/app/api/inngest/route");
  const res = await POST(new NextRequest("https://example.test/api/inngest", {method:"POST",body:"{}"}), undefined);
  expect(res.status).toBe(503);
});
it("rejects production development-mode bypass", async () => {
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("INNGEST_DEV","1");vi.stubEnv("INNGEST_SIGNING_KEY","signkey-prod-test");
  const {POST} = await import("../src/app/api/inngest/route");
  const res = await POST(new NextRequest("https://example.test/api/inngest", {method:"POST",body:"{}"}), undefined);
  expect(res.status).toBe(503);
});
it("SDK rejects unsigned production execution requests", async () => {
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("INNGEST_DEV","0");vi.stubEnv("INNGEST_SIGNING_KEY","signkey-prod-"+"ab".repeat(32));
  const {POST} = await import("../src/app/api/inngest/route");
  const res = await POST(new NextRequest("https://example.test/api/inngest", {method:"POST",headers:{"content-type":"application/json"},body:"{}"}), undefined);
  expect(res.status).toBeGreaterThanOrEqual(400);expect(res.status).toBeLessThan(500);
});
