import { notFound } from "next/navigation";
import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { isAppError } from "@/lib/errors";
import { can } from "@/lib/auth/authorize";
import { getInvoice } from "@/server/services/invoices";
import { invoiceLedger } from "@/server/services/finance";
import { InvoiceDetail } from "./invoice-detail";

export const metadata = { title: "Invoice" };

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const actor = await requireStaffOrRedirect();
  const invoice = await getInvoice(actor, decodeURIComponent(number)).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!invoice) notFound();
  const [ledger, canRefund] = await Promise.all([
    invoiceLedger(actor, invoice.id),
    can(actor, "refund.issue", invoice.locationId ? { locationId: invoice.locationId } : undefined),
  ]);
  return <InvoiceDetail invoice={invoice} ledger={ledger} canRefund={canRefund} />;
}
