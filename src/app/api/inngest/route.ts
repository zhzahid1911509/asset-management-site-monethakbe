import type { NextRequest } from "next/server";
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { sendQueuedEmail, recoverEmails, scheduleReminders } from "../../../inngest/functions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handlers = serve({client: inngest, functions: [sendQueuedEmail, recoverEmails, scheduleReminders]});
// Never allow dev-mode signature bypass in a deployed runtime.
function guarded(method: keyof typeof handlers) {
  return async (request: NextRequest, context: Parameters<typeof handlers.GET>[1]) => {
    if (process.env.NODE_ENV === "production" && (
      !process.env.INNGEST_SIGNING_KEY ||
      (process.env.INNGEST_DEV && process.env.INNGEST_DEV !== "0" && process.env.INNGEST_DEV !== "false")
    )) return Response.json({error: "INNGEST_CONFIGURATION_REQUIRED"}, {status: 503});
    return handlers[method](request, context);
  };
}
export const GET = guarded("GET");
export const POST = guarded("POST");
export const PUT = guarded("PUT");
