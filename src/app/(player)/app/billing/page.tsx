import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyInvoices } from "@/server/services/invoices";
import { getCreditStatement } from "@/server/services/credits";
import { getPaymentPolicy } from "@/server/services/payment-policy";
import { getMyProfile } from "@/server/services/profiles";
import { BillingView } from "./billing-view";

export const metadata = { title: "Billing" };

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const actor = await requireActorOrRedirect("/app/billing");
  const [invoices, statement, profile] = await Promise.all([listMyInvoices(actor), getCreditStatement(actor), getMyProfile(actor)]);
  // The policy of the club the player calls home decides what they are offered; an invoice at another
  // club still shows its own options on its own page.
  const policy = await getPaymentPolicy(profile.homeLocation?.id ?? null);
  return <BillingView invoices={invoices} statement={statement} onlineAvailable={policy.timing !== "AT_CLUB"} allowCredit={policy.allowCredit} />;
}
