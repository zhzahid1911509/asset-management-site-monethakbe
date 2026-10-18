import { it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import {
  emailTemplate,
  AUTH_LINK_SECONDS,
} from "../src/server/email-templates";
import { seal } from "../src/server/secrets";
import { decodeEmail, deliverEmail } from "../src/server/email-delivery";
afterEach(() => vi.unstubAllEnvs());
it("provides action-specific HTML and plain text with matching expiry and brand", () => {
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  for (const kind of [
    "verification",
    "password-reset",
    "invitation",
  ] as const) {
    const mail = emailTemplate(
      kind,
      "https://example.test/action?token=synthetic&next=app",
      "reader@example.test",
    );
    expect(mail.html).toContain("/brand/logo-light.png");
    expect(mail.html).toContain("token=synthetic&amp;next=app");
    expect(mail.text).toContain("token=synthetic&next=app");
    expect(mail.text).toContain(kind === "invitation" ? "48 hours" : "1 hour");
    expect(mail.html).toContain("do not forward");
    expect(mail.subject).toContain("মনে থাকবে");
  }
  expect(AUTH_LINK_SECONDS).toBe(3600);
});
it("escapes HTML input and rejects foreign or executable action URLs", () => {
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  const mail = emailTemplate(
    "verification",
    'https://example.test/action?token="<tag>',
    "<img onerror=alert(1)>",
  );
  expect(mail.html).not.toContain("<img onerror");
  expect(mail.html).toContain("&lt;img");
  for (const url of [
    "javascript:alert(1)",
    "https://evil.test/reset",
    "https://name:secret@example.test/reset",
  ])
    expect(() =>
      emailTemplate("password-reset", url, "reader@example.test"),
    ).toThrow("EMAIL_URL_INVALID");
});
it("preserves legacy queued mail and passes both alternatives to the transport", async () => {
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  const legacy = {
    to: "reader@example.test",
    subject: "Legacy",
    text: "Previously queued",
  };
  expect(decodeEmail(seal(JSON.stringify(legacy), "email"))).toEqual(legacy);
  const mail = emailTemplate(
    "invitation",
    "https://example.test/invite?token=synthetic",
    "reader@example.test",
  );
  let body: Record<string, unknown> = {};
  await deliverEmail(
    { id: "test-mail", payload: seal(JSON.stringify(mail), "email") },
    async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ id: "synthetic" });
    },
  );
  expect(body.html).toBe(mail.html);
  expect(body.text).toBe(mail.text);
});
