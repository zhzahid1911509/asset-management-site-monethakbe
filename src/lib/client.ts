export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public reference?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  method = "GET",
  data?: unknown,
  key?: string,
): Promise<T> {
  const response = await fetch("/api/" + url, {
    method,
    headers: {
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error?.code ?? result.code ?? "REQUEST_FAILED",
      result.error?.message ?? result.message ?? "The request failed.",
      result.error?.correlationId ?? result.correlationId,
    );
  return result;
}
export function errorText(e: unknown) {
  return e instanceof ApiError
    ? `${e.message}${e.reference ? " · Reference " + e.reference : ""}`
    : e instanceof Error
      ? e.message
      : "Unable to complete the request.";
}
