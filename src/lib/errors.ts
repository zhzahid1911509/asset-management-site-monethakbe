export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export const safeMessages: Record<string, string> = {
  INVITATION_ACCEPTED: "This invitation has already been accepted. Manage the member’s access from Family members.",
  MEMBER_ALREADY_ACTIVE: "This person already has active membership. Use Change role instead.",
  MEMBER_CONFLICT: "This member’s role changed. Refresh the member list and review it again.",
  MEMBER_INACTIVE: "Revoked or expired memberships cannot be changed here.",
  HISTORY_EXPORT_LIMIT: "This history exceeds 1,000 rows in a section or the 4 MiB download limit. No partial file was exported.",
  REPORT_LIMIT: "This report exceeds the 5,000-record limit. No partial export was produced.",
  DOCUMENTS_NOT_CONFIGURED:
    "Document storage and scanning need administrator setup.",
  INVALID_FILE:
    "Use a matching PDF, PNG, JPEG, UTF-8 TXT or CSV file, up to 10 MB.",
  UNSAFE_FILE: "The scanner rejected this file. It was not made available.",
  SCAN_UNAVAILABLE:
    "The malware scanner is unavailable. Upload was blocked; please try again later.",
  DOCUMENT_UNAVAILABLE:
    "The document service could not complete the request. Reload before retrying.",
  UPLOAD_BUSY: "This upload is still pending. Reload to check its status.",
  UPLOAD_FAILED:
    "This upload did not finish. Reload and start a new upload attempt.",
  DOCUMENT_QUOTA:
    "The family's 1 GB document allowance is full, including retained versions and unfinished uploads.",
  DOCUMENT_LIMIT: "A record can contain up to 100 documents.",
  REVERSAL_DATE:
    "Correction date must be on or after the current balance date and no later than today.",
  ALREADY_REVERSED: "This payment has already been reversed.",
  REMINDER_CLOSED: "This reminder changed status. Reload it before continuing.",
  OWNERSHIP_DATE:
    "Use a date on or after the latest ownership date and no later than today.",
  PAYMENT_DATE:
    "Payment date must be on or after the recorded balance date and cannot be in the future.",
  EMPTY_PAYMENT:
    "Enter a principal, interest, or fee amount greater than zero.",
  OVERPAYMENT:
    "Principal exceeds the outstanding balance. Check the payment breakdown.",
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
