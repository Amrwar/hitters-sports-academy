import { Badge } from "@/components/ui/badge";
import type { BookingStatus, PaymentStatus } from "@prisma/client";

const BOOKING_TONE: Record<BookingStatus, "success" | "warning" | "danger" | "neutral" | "volt"> = {
  CONFIRMED: "success",
  PENDING: "warning",
  CANCELLED: "danger",
  COMPLETED: "neutral",
  NO_SHOW: "danger",
};

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Pending",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

export function BookingStatusBadge({ status, size }: { status: BookingStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={BOOKING_TONE[status]} dot size={size}>
      {BOOKING_LABEL[status]}
    </Badge>
  );
}

const PAY_TONE: Record<PaymentStatus, "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  PENDING: "warning",
  WAIVED: "neutral",
  REFUNDED: "neutral",
  CANCELLED: "neutral",
  FAILED: "danger",
};

export const PAY_LABEL: Record<PaymentStatus, string> = {
  PAID: "Paid",
  PENDING: "Pay at the venue",
  WAIVED: "Waived",
  REFUNDED: "Refunded",
  CANCELLED: "No charge",
  FAILED: "Failed",
};

export function PaymentStatusBadge({ status, size }: { status: PaymentStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={PAY_TONE[status]} size={size}>
      {PAY_LABEL[status]}
    </Badge>
  );
}

export const money = (cents: number, currency = "EGP") => `${currency} ${Math.round(cents / 100).toLocaleString("en")}`;
