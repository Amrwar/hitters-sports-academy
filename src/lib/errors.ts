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
  | "LOCATION_CLOSED";

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
