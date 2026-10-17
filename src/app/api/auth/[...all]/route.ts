import { getAuth, configured } from "@/server/auth";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: Request) {
  const correlationId = randomUUID();
  if (!configured())
    return Response.json(
      { message: "Authentication is not configured.", correlationId },
      { status: 503 },
    );
  try {
    const response = await getAuth().handler(request);
    const wait = response.headers.get("X-Retry-After");
    if (wait) response.headers.set("Retry-After", wait);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-ID", correlationId);
    return response;
  } catch {
    console.error(JSON.stringify({ event: "auth.failed", correlationId }));
    return Response.json(
      { message: "Authentication is temporarily unavailable.", correlationId },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST };
