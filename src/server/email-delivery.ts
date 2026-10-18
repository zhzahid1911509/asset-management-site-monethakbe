import { z } from "zod";
import { unseal } from "./secrets";
const payload = z.object({
  kind: z.literal("reminder").optional(),
  to: z.string().email(),
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().min(1).optional(),
});
export class DeliveryError extends Error {
  constructor(
    public code: string,
    public retryable: boolean,
    public delaySeconds = 120,
  ) {
    super(code);
  }
}
export function decodeEmail(encrypted: string) {
  try {
    return payload.parse(JSON.parse(unseal(encrypted, "email")));
  } catch {
    throw new DeliveryError("EMAIL_DECRYPT_OR_PAYLOAD_FAILED", false);
  }
}
export function senderDomain(from: string | undefined) {
  const value = from?.trim() ?? "";
  const address = value.match(/<([^<>]+)>$/)?.[1] ?? value;
  if (!z.string().email().safeParse(address).success) return null;
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}
// Interpret provider errors in memory; only allowlisted codes leave this boundary.
export async function classifyProviderError(response: Response) {
  const fallback = `RESEND_HTTP_${response.status}`;
  if (response.status !== 403) return fallback;
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return fallback;
  }
  if (!value || typeof value !== "object") return fallback;
  const body = value as Record<string, unknown>;
  const name =
    typeof body.name === "string" ? body.name.slice(0, 100).toLowerCase() : "";
  const message =
    typeof body.message === "string"
      ? body.message.slice(0, 2048).toLowerCase()
      : "";
  if (name === "suspended_api_key" || message.includes("api key is suspended"))
    return "RESEND_KEY_SUSPENDED";
  if (message.includes("api key is not active")) return "RESEND_KEY_INACTIVE";
  if (
    message.includes("only send testing emails") ||
    message.includes("only send test emails")
  )
    return "RESEND_TEST_RECIPIENT_RESTRICTED";
  if (message.includes("domain") && message.includes("not verified"))
    return "RESEND_SENDER_DOMAIN_UNVERIFIED";
  if (name === "invalid_permission" || name === "restricted_api_key")
    return "RESEND_KEY_PERMISSION_DENIED";
  return fallback;
}
export async function deliverEmail(
  job: { id: string; payload: string },
  transport: typeof fetch = fetch,
) {
  const { kind: _kind, ...data } = decodeEmail(job.payload);
  let response: Response;
  try {
    response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `email/${job.id}`,
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, ...data }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new DeliveryError("EMAIL_NETWORK_OR_TIMEOUT", true);
  }
  if (!response.ok) {
    const raw = response.headers.get("retry-after");
    const seconds =
      raw === null
        ? NaN
        : /^\d+$/.test(raw)
          ? Number(raw)
          : Math.ceil((Date.parse(raw) - Date.now()) / 1000);
    const delay = Number.isFinite(seconds) ? Math.max(1, seconds) : 120;
    // Store a safe classification, never raw provider text or recipient data.
    throw new DeliveryError(
      await classifyProviderError(response),
      response.status === 429 || response.status >= 500,
      delay,
    );
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new DeliveryError("RESEND_INVALID_RESPONSE", true);
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("id" in result) ||
    typeof result.id !== "string" ||
    !result.id
  )
    throw new DeliveryError("RESEND_INVALID_RESPONSE", true);
  return { providerId: result.id }; // API acceptance is not proof of inbox delivery.
}
export const deliveryHints: Record<string, string> = {
  RESEND_SENDER_DOMAIN_UNVERIFIED:
    "EMAIL_FROM must use a domain verified in the Resend account/team that owns this API key. Check the worker's effective sender domain with npm run email:status.",
  RESEND_TEST_RECIPIENT_RESTRICTED:
    "The request is using Resend's test-sender restrictions. Set EMAIL_FROM to your verified domain, restart the worker, and request a fresh verification email.",
  RESEND_KEY_INACTIVE:
    "The worker's API key is inactive. Configure an active sending key from the same Resend account/team as the verified domain and restart the worker.",
  RESEND_KEY_SUSPENDED:
    "Resend suspended this API key. Review the account status with Resend support.",
  RESEND_KEY_PERMISSION_DENIED:
    "Check the key's Sending access and allowed domain in the same Resend account/team as the verified domain.",
  RESEND_HTTP_400: "Check EMAIL_FROM and message configuration.",
  RESEND_HTTP_401: "Check the Resend API key used by this worker.",
  RESEND_HTTP_403:
    "Check API-key permissions, verified sender domain, and Resend test-recipient restrictions.",
  RESEND_HTTP_422: "Check sender format and provider configuration.",
  RESEND_HTTP_429: "Provider rate limit reached; retry is scheduled.",
  EMAIL_DECRYPT_OR_PAYLOAD_FAILED:
    "Web app and worker must use the same APP_ENCRYPTION_KEY. Restore the correct key, restart both, and request a new email.",
  EMAIL_NETWORK_OR_TIMEOUT:
    "Check worker connectivity to Resend; retry is scheduled.",
};
