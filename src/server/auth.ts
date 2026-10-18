import { emailTemplate, AUTH_LINK_SECONDS } from "./email-templates";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { seal } from "./secrets";
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
    trustedOrigins: [process.env.APP_ORIGIN!],
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
      resetPasswordTokenExpiresIn: AUTH_LINK_SECONDS,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        enqueue(user.email, url, "Reset your password"),
    },
    emailVerification: {
      expiresIn: AUTH_LINK_SECONDS,
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
          JSON.stringify(
            emailTemplate(
              purpose === "Reset your password"
                ? "password-reset"
                : "verification",
              url,
              to,
            ),
          ),
          "email",
        ),
      });
  }));
}
