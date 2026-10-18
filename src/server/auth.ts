import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { seal } from "./secrets";

const appOrigin = process.env.APP_ORIGIN;
const altAppOrigin = process.env.ALTERNATIVE_APP_ORIGIN;
if (!appOrigin && !altAppOrigin) {
  throw new Error("APP_ORIGIN environment variable is missing");
}

export function configuration() {
  return {
    database: !!process.env.DATABASE_URL,
    authSecret: (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32,
    origin: !!process.env.APP_ORIGIN,
    email: !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM,
    encryption:
      Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64").length === 32,
  };
}
export function configured() {
  return Object.values(configuration()).every(Boolean);
}
export function buildAuth(
  db: ReturnType<typeof getDb>,
  enqueue: (to: string, url: string, purpose: string) => Promise<void>,
) {
  return betterAuth({
    appName: "মনে থাকবে",
    baseURL: process.env.APP_ORIGIN,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    trustedOrigins: [appOrigin!, altAppOrigin!],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.request?.method === "POST" &&
          ctx.headers?.get("origin") !== process.env.APP_ORIGIN
        )
          throw new APIError("FORBIDDEN", { message: "Origin rejected." });
      }),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        enqueue(user.email, url, "Reset your password"),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        enqueue(user.email, url, "Verify your email"),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      freshAge: 60 * 10,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
    logger: { disabled: true },
  });
}
let auth: ReturnType<typeof buildAuth> | undefined;
export function getAuth() {
  if (!configured()) throw new Error("AUTH_NOT_CONFIGURED");
  return (auth ??= buildAuth(getDb(), async (to, url, purpose) => {
    await getDb()
      .insert(schema.emailJobs)
      .values({
        payload: seal(
          JSON.stringify({
            to,
            subject: `${purpose} — মনে থাকবে`,
            text: `${purpose}: ${url}\nIf you did not request this, ignore this email.`,
          }),
          "email",
        ),
      });
  }));
}
