import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { getAuth, configured } from "./auth";
import { AppError, safeMessages } from "../lib/errors";
import type { Actor } from "./service";
export async function actor(request: Request): Promise<Actor> {
  if (!configured()) throw new AppError("NOT_CONFIGURED", 503);
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user?.emailVerified) throw new AppError("AUTH_REQUIRED", 401);
  return { id: session.user.id, email: session.user.email };
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("INVALID_REQUEST", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_REQUEST");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 32768) {
      await reader.cancel();
      throw new AppError("TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError("INVALID_REQUEST");
  }
}
export async function handle(
  request: Request,
  run: (a: Actor) => Promise<unknown>,
) {
  const correlationId = randomUUID();
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      if (request.headers.get("origin") !== process.env.APP_ORIGIN)
        throw new AppError("FORBIDDEN", 403);
    }
    const data = await run(await actor(request));
    if (data instanceof Response) {
      data.headers.set("Cache-Control", "no-store");
      data.headers.set("X-Request-ID", correlationId);
      return data;
    }
    return Response.json(data, {
      headers: { "Cache-Control": "no-store", "X-Request-ID": correlationId },
    });
  } catch (error) {
    const known = error instanceof AppError;
    const validation = error instanceof ZodError;
    const code = known
      ? error.code
      : validation
        ? "VALIDATION_ERROR"
        : "INTERNAL_ERROR";
    const status = known ? error.status : validation ? 422 : 500;
    if (status >= 500)
      console.error(
        JSON.stringify({ event: "request.failed", code, correlationId }),
      );
    return Response.json(
      {
        error: {
          code,
          message:
            safeMessages[code] ??
            (validation
              ? "Please check the form fields."
              : "The request could not be completed. Please retry."),
          correlationId,
          retryable: status >= 500,
          fields: validation
            ? error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
              }))
            : [],
        },
      },
      {
        status,
        headers: { "Cache-Control": "no-store", "X-Request-ID": correlationId },
      },
    );
  }
}
