import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { testDatabase } from "./helpers";
import { rateLimit } from "../src/db/schema";
import { buildAuth } from "../src/server/auth";
let fixture: Awaited<ReturnType<typeof testDatabase>>,
  auth: ReturnType<typeof buildAuth>;
const messages: { url: string; purpose: string }[] = [];
beforeAll(async () => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = randomBytes(40).toString("base64");
  fixture = await testDatabase();
  auth = buildAuth(fixture.db, async (_to, url, purpose) => {
    messages.push({ url, purpose });
  });
});
afterAll(async () => {
  await fixture.client.close();
});
const request = (path: string, data: unknown, cookie?: string) =>
  auth.handler(
    new Request("http://localhost:3000/api/auth/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(data),
    }),
  );
it("registers, requires verification, verifies, signs in, revokes the session and resets a password", async () => {
  const credentials = {
    email: "auth@example.test",
    password: "A-test-only-password-123!",
  };
  let r = await request("sign-up/email", {
    ...credentials,
    name: "Auth Test",
    callbackURL: "/auth",
  });
  expect(r.status).toBe(200);
  expect(messages).toHaveLength(1);
  r = await request("sign-in/email", credentials);
  expect(r.status).toBe(403);
  expect(messages).toHaveLength(2); // Unverified sign-in queues a new verification email.
  const verify = await auth.handler(new Request(messages[0].url));
  expect([200, 302]).toContain(verify.status);
  r = await request("sign-in/email", credentials);
  expect(r.status).toBe(200);
  const cookie = r.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token");
  let session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  expect(session?.user.emailVerified).toBe(true);
  r = await request("sign-out", {}, cookie);
  expect(r.status).toBe(200);
  session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  expect(session).toBeNull();
  r = await request("request-password-reset", {
    email: credentials.email,
    redirectTo: "/auth",
  });
  expect(r.status).toBe(200);
  const mail = messages.find((m) => m.purpose === "Reset your password");
  expect(mail).toBeDefined();
  const resetUrl = new URL(mail!.url);
  const token = resetUrl.pathname.split("/").at(-1)!;
  r = await request("reset-password", {
    token,
    newPassword: "A-new-test-password-456!",
  });
  expect(r.status).toBe(200);
  r = await request("sign-in/email", credentials);
  expect(r.status).not.toBe(200);
  await fixture.db.delete(rateLimit); // Reset the test clock window after deliberate failed logins.
  r = await request("sign-in/email", {
    ...credentials,
    password: "A-new-test-password-456!",
  });
  expect(r.status).toBe(200);
});
it("rejects a forged cross-origin auth request", async () => {
  const r = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({
        email: "bad@example.test",
        password: "A-test-only-password-123!",
        name: "Attacker",
      }),
    }),
  );
  expect(r.status).toBe(403);
});

it("bounds repeated sign-in attempts and returns a finite retry delay", async () => {
  await fixture.db.delete(rateLimit);
  let response: Response | undefined;
  for (let i = 0; i < 5; i++) {
    response = await request("sign-in/email", {
      email: "missing@example.test",
      password: "Invalid-password-123!",
    });
    if (response.status === 429) break;
  }
  expect(response?.status).toBe(429);
  const wait = Number(response!.headers.get("x-retry-after"));
  expect(Number.isFinite(wait)).toBe(true);
  expect(wait).toBeGreaterThan(0);
  expect(wait).toBeLessThanOrEqual(60);
});
