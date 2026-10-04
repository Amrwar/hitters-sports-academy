export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_TOKEN"
  // Booking domain
  | "SLOT_UNAVAILABLE"
  | "COURT_UNAVAILABLE"
  | "BOOKING_CONFLICT"
  | "CANCELLATION_NOT_ALLOWED"
  | "INVALID_DURATION"
  | "LOCATION_CLOSED"
  // Game sessions
  | "SESSION_FULL"
  | "INVALID_TRANSITION"
  | "NOT_ELIGIBLE"
  | "PROGRAM_FULL"
  | "NO_CREDITS"
  // Money
  | "PAYMENT_FAILED"
  | "PAYMENT_REQUIRED"
  | "ALREADY_PAID"
  | "REFUND_NOT_ALLOWED"
  | "PROVIDER_UNAVAILABLE"
  | "COUPON_INVALID";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INVALID_TOKEN: 400,
  SLOT_UNAVAILABLE: 409,
  COURT_UNAVAILABLE: 409,
  BOOKING_CONFLICT: 409,
  CANCELLATION_NOT_ALLOWED: 403,
  INVALID_DURATION: 400,
  LOCATION_CLOSED: 409,
  SESSION_FULL: 409,
  INVALID_TRANSITION: 409,
  NOT_ELIGIBLE: 409,
  PROGRAM_FULL: 409,
  NO_CREDITS: 409,
  PAYMENT_FAILED: 402,
  PAYMENT_REQUIRED: 402,
  ALREADY_PAID: 409,
  REFUND_NOT_ALLOWED: 409,
  PROVIDER_UNAVAILABLE: 503,
  COUPON_INVALID: 400,
};

/** Domain error carried from services to actions and route handlers. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message?: string, fields?: Record<string, string>) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fields = fields;
  }
}

export const unauthenticated = (msg = "You need to sign in.") => new AppError("UNAUTHENTICATED", msg);
export const forbidden = (msg = "You don't have permission to do that.") => new AppError("FORBIDDEN", msg);
export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found.`);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const validation = (msg: string, fields?: Record<string, string>) => new AppError("VALIDATION", msg, fields);
export const paymentFailed = (msg: string) => new AppError("PAYMENT_FAILED", msg);
export const paymentRequired = (msg: string) => new AppError("PAYMENT_REQUIRED", msg);
export const alreadyPaid = (msg = "That has already been paid.") => new AppError("ALREADY_PAID", msg);
export const refundNotAllowed = (msg: string) => new AppError("REFUND_NOT_ALLOWED", msg);
export const providerUnavailable = (msg = "Online payment is not available right now.") => new AppError("PROVIDER_UNAVAILABLE", msg);
export const couponInvalid = (msg: string) => new AppError("COUPON_INVALID", msg);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Shape returned by server actions so the UI never receives thrown errors. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; fields?: Record<string, string> };

export function toActionError(e: unknown): ActionResult<never> {
  if (isAppError(e)) return { ok: false, code: e.code, message: e.message, fields: e.fields };
  console.error(e);
  return { ok: false, code: "VALIDATION", message: "Something went wrong. Please try again." };
}
