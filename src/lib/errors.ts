export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export const safeMessages: Record<string, string> = {
  AUTH_REQUIRED: "Please sign in.",
  NOT_FOUND: "This record or workspace is unavailable.",
  FORBIDDEN: "You do not have permission for this action.",
  CONFLICT: "This record changed. Reload and compare your changes.",
  IDEMPOTENCY_CONFLICT: "This request identifier was used for different data.",
  INVALID_TYPE: "Choose a valid category.",
  NOT_CONFIGURED: "The application needs service configuration.",
  INVALID_INVITATION:
    "This invitation is expired, used, or belongs to another email address.",
  FUTURE_VALUATION: "A current valuation cannot be dated in the future.",
  TOO_LARGE: "The request is too large.",
};
