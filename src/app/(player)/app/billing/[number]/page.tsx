import { notFound } from "next/navigation";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { isAppError } from "@/lib/errors";
import { getInvoice } from "@/server/services/invoices";
import { creditBalance } from "@/server/services/credits";
import { getPaymentPolicy } from "@/server/services/payment-policy";
import { ReceiptView } from "./receipt-view";

export const metadata = { title: "Receipt" };

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const actor = await requireActorOrRedirect(`/app/billing/${number}`);
  const invoice = await getInvoice(actor, decodeURIComponent(number)).catch((e) => {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) return null;
    throw e;
  });
  if (!invoice) notFound();
  const [credit, policy] = await Promise.all([creditBalance(actor.id), getPaymentPolicy(invoice.locationId)]);
  return <ReceiptView invoice={invoice} creditCents={credit} onlineAvailable={policy.timing !== "AT_CLUB"} allowCredit={policy.allowCredit} />;
}
