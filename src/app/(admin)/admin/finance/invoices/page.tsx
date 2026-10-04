import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { listInvoices } from "@/server/services/invoices";
import { InvoicesView } from "./invoices-view";

export const metadata = { title: "Invoices" };

export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; outstanding?: string; q?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const params = await searchParams;
  const outstanding = params.outstanding === "1";
  const { rows, total } = await listInvoices(actor, { status: params.status, q: params.q, outstandingOnly: outstanding, take: 100 });
  return <InvoicesView rows={rows} total={total} filter={outstanding ? "outstanding" : (params.status ?? "")} q={params.q ?? ""} />;
}
