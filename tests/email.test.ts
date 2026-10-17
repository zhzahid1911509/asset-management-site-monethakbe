import { it, expect, beforeEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { seal } from "../src/server/secrets";
import { deliverEmail } from "../src/server/email-delivery";
beforeEach(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.RESEND_API_KEY = "test-only-key";
  process.env.EMAIL_FROM = "test@example.test";
});
const job = () => ({
  id: "test-job",
  payload: seal(
    JSON.stringify({
      to: "recipient@example.test",
      subject: "Verify",
      text: "Synthetic test link",
    }),
    "email",
  ),
});
it("sends decrypted content with a stable provider idempotency key", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ id: "provider-id" }));
  expect(await deliverEmail(job(), send)).toEqual({
    providerId: "provider-id",
  });
  const init = send.mock.calls[0][1]!;
  expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
    "email/test-job",
  );
  expect(JSON.parse(init.body as string).to).toBe("recipient@example.test");
});
it("classifies provider 403 without persisting raw provider text", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ message: "Sensitive provider details" }, { status: 403 }),
    );
  await expect(deliverEmail(job(), send)).rejects.toMatchObject({
    code: "RESEND_HTTP_403",
    retryable: false,
    message: "RESEND_HTTP_403",
  });
});
it("honors Retry-After for rate limits", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("", { status: 429, headers: { "Retry-After": "300" } }),
    );
  await expect(deliverEmail(job(), send)).rejects.toMatchObject({
    code: "RESEND_HTTP_429",
    retryable: true,
    delaySeconds: 300,
  });
});
it("retries network failure without revealing transport errors", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("private network detail"));
  await expect(deliverEmail(job(), send)).rejects.toMatchObject({
    code: "EMAIL_NETWORK_OR_TIMEOUT",
    retryable: true,
  });
});
it("rejects mismatched encryption keys before contacting provider", async () => {
  const j = job();
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const send = vi.fn<typeof fetch>();
  await expect(deliverEmail(j, send)).rejects.toMatchObject({
    code: "EMAIL_DECRYPT_OR_PAYLOAD_FAILED",
    retryable: false,
  });
  expect(send).not.toHaveBeenCalled();
});
it("does not report acceptance for malformed successful responses", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
  await expect(deliverEmail(job(), send)).rejects.toMatchObject({
    code: "RESEND_INVALID_RESPONSE",
    retryable: true,
  });
});

it.each([
  [
    {
      name: "validation_error",
      message:
        "The example.test domain is not verified. Please add and verify your domain.",
    },
    "RESEND_SENDER_DOMAIN_UNVERIFIED",
  ],
  [
    {
      name: "validation_error",
      message:
        "You can only send testing emails to your own email address (private@example.test).",
    },
    "RESEND_TEST_RECIPIENT_RESTRICTED",
  ],
  [
    { name: "restricted_api_key", message: "API key is not active" },
    "RESEND_KEY_INACTIVE",
  ],
  [
    { name: "suspended_api_key", message: "This API key is suspended" },
    "RESEND_KEY_SUSPENDED",
  ],
  [
    {
      name: "invalid_permission",
      message: "Access token is missing required scopes.",
    },
    "RESEND_KEY_PERMISSION_DENIED",
  ],
])(
  "classifies documented Resend 403 errors without leaking provider messages: %j",
  async (body, code) => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body, { status: 403 }));
    await expect(deliverEmail(job(), send)).rejects.toMatchObject({
      code,
      message: code,
      retryable: false,
    });
  },
);
it("retains safe HTTP fallback when provider error is not JSON", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("private gateway details", { status: 403 }),
    );
  await expect(deliverEmail(job(), send)).rejects.toMatchObject({
    code: "RESEND_HTTP_403",
    message: "RESEND_HTTP_403",
  });
});
