"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { money, PaymentStatusBadge } from "@/components/patterns/booking-status";
import { PurchaseBadge } from "@/components/patterns/academy";
import type { PackageView, PurchaseView } from "@/server/services/packages";
import { cancelPurchaseAction, createPackageAction, purchasePackageAction, recordAcademyPaymentAction, updatePackageAction } from "@/server/actions/academy";
import { shortDate } from "@/lib/time";

type Props = { catalog: PackageView[]; purchases: PurchaseView[]; trainers: { id: string; name: string }[]; locations: { id: string; name: string }[]; members: { id: string; name: string; email: string }[]; canManage: boolean; isGlobal: boolean };

export function PackagesAdmin({ catalog, purchases, trainers, locations, members, canManage, isGlobal }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<PackageView | null>(null);
  const [sell, setSell] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(key: string, label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast({ tone: "success", title: label });
    else toast({ tone: "danger", title: "That did not go through", description: res.message });
    router.refresh();
    return res.ok;
  }

  async function submitPackage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = { name: String(f.get("name") ?? ""), description: String(f.get("description") ?? ""), credits: Number(f.get("credits") || 0), priceCents: Math.round(Number(f.get("price") || 0) * 100), validityDays: Number(f.get("validityDays") || 90), trainerId: String(f.get("trainerId") ?? "") || null, locationId: String(f.get("locationId") ?? "") || null, active: !!f.get("active") };
    setBusy("form");
    setError(null);
    const res = edit ? await updatePackageAction(edit.id, data) : await createPackageAction(data);
    setBusy(null);
    if (res.ok) {
      toast({ tone: "success", title: edit ? "Package updated" : "Package created" });
      setCreate(false);
      setEdit(null);
      router.refresh();
    } else setError(res.message);
  }

  async function submitSell(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const packageId = String(f.get("packageId") ?? "");
    const data = packageId ? { packageId, playerId: String(f.get("playerId")) } : { playerId: String(f.get("playerId")), name: String(f.get("name") ?? ""), credits: Number(f.get("credits") || 0), priceCents: Math.round(Number(f.get("price") || 0) * 100), validityDays: Number(f.get("validityDays") || 90) };
    const ok = await act("sell", "Package sold; take payment at the venue", () => purchasePackageAction(data));
    if (ok) setSell(false);
  }

  const Form = ({ p }: { p: PackageView | null }) => (
    <form onSubmit={submitPackage} className="space-y-4 pb-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">{(id) => <Input id={id} name="name" required defaultValue={p?.name ?? ""} placeholder="10 lessons" />}</Field>
        <Field label="Credits (lessons)">{(id) => <Input id={id} name="credits" type="number" min={1} max={100} required defaultValue={p?.credits ?? 10} />}</Field>
        <Field label="Price (EGP)">{(id) => <Input id={id} name="price" type="number" min={0} step={50} required defaultValue={p ? p.priceCents / 100 : 7500} />}</Field>
        <Field label="Valid for (days)">{(id) => <Input id={id} name="validityDays" type="number" min={7} max={730} defaultValue={p?.validityDays ?? 90} />}</Field>
        <Field label="Trainer (optional)">{(id) => <Select id={id} name="trainerId" defaultValue={p?.trainerId ?? ""} options={[{ value: "", label: "Any trainer" }, ...trainers.map((t) => ({ value: t.id, label: t.name }))]} />}</Field>
        <Field label="Club" hint={isGlobal ? "Leave empty for an academy-wide package." : "Staff at one club create packages for that club only."}>
          {(id) => <Select id={id} name="locationId" defaultValue={p?.locationId ?? (isGlobal ? "" : locations[0]?.id ?? "")} options={[...(isGlobal ? [{ value: "", label: "Every club" }] : []), ...locations.map((l) => ({ value: l.id, label: l.name }))]} />}
        </Field>
      </div>
      <Field label="Description">{(id) => <Textarea id={id} name="description" maxLength={500} defaultValue={p?.description ?? ""} />}</Field>
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" name="active" className="size-4 accent-blue-500" defaultChecked={p?.active ?? true} /> On sale
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => { setCreate(false); setEdit(null); }}>
          Cancel
        </Button>
        <Button type="submit" loading={busy === "form"}>
          {p ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );

  return (
    <AdminShell
      title="Packages"
      breadcrumb={["People", "Packages"]}
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSell(true)}>
              Sell to a member
            </Button>
            <Button leftIcon={<Plus />} onClick={() => setCreate(true)}>
              New package
            </Button>
          </div>
        ) : undefined
      }
    >
      <Card>
        <CardHeader title="Catalog" description="Prepaid lesson bundles. Credits are deducted when a lesson is booked and returned when it is cancelled in time." />
        {catalog.length === 0 ? (
          <EmptyState compact icon={<Package />} title="No packages yet" description="Create one above to let members buy lessons in advance." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Package</TH>
                  <TH className="text-right">Credits</TH>
                  <TH className="text-right">Price</TH>
                  <TH className="text-right">Per lesson</TH>
                  <TH>Validity</TH>
                  <TH>Scope</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {catalog.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-caption text-fg-subtle">{p.description}</div>
                    </TD>
                    <TD className="text-right tabular">{p.credits}</TD>
                    <TD className="text-right tabular">{money(p.priceCents, p.currency)}</TD>
                    <TD className="text-right tabular">{money(Math.round(p.priceCents / p.credits), p.currency)}</TD>
                    <TD className="text-fg-muted">{p.validityDays} days</TD>
                    <TD className="text-fg-muted">
                      {p.trainer?.user.name ?? "Any trainer"} · {p.location?.name.replace("HITTERS ", "") ?? "Every club"}
                    </TD>
                    <TD>
                      <Badge size="sm" tone={p.active ? "success" : "neutral"} dot>
                        {p.active ? "On sale" : "Hidden"}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      {canManage && (
                        <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>
                          Edit
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Purchases" description="Credits, usage and expiry per member. Record venue payments here." />
        {purchases.length === 0 ? (
          <div className="text-body-sm text-fg-muted">No purchases yet. Sell a package from the button above.</div>
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Member</TH>
                  <TH>Package</TH>
                  <TH className="text-right">Credits</TH>
                  <TH>Expires</TH>
                  <TH>Payment</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {purchases.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={p.player.name} size="xs" /> <span className="font-semibold">{p.player.name}</span>
                      </div>
                    </TD>
                    <TD>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-caption text-fg-subtle">{p.code}</div>
                    </TD>
                    <TD className="text-right tabular">
                      {p.creditsLeft} / {p.credits}
                    </TD>
                    <TD className="text-fg-muted">{shortDate(p.expiresAt)}</TD>
                    <TD>{p.payments[0] ? <PaymentStatusBadge status={p.payments[0].status} size="sm" /> : "—"}</TD>
                    <TD>
                      <PurchaseBadge status={p.status} />
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.payments[0]?.status === "PENDING" && canManage && (
                          <Button size="sm" variant="secondary" loading={busy === p.id} onClick={() => act(p.id, "Payment recorded", () => recordAcademyPaymentAction({ purchaseId: p.id }, { method: "CARD" }))}>
                            Paid by card
                          </Button>
                        )}
                        {p.status === "ACTIVE" && p.creditsUsed === 0 && canManage && (
                          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" loading={busy === p.id} onClick={() => act(p.id, "Purchase cancelled", () => cancelPurchaseAction(p.id))}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal open={create} onClose={() => setCreate(false)} title="New package" size="lg">
        <Form p={null} />
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit ${edit.name}` : ""} size="lg">
        {edit && <Form p={edit} />}
      </Modal>
      <Modal open={sell} onClose={() => setSell(false)} title="Sell a package" description="Pick a catalog package, or leave it empty and enter a custom one.">
        <form onSubmit={submitSell} className="space-y-4 pb-2">
          <Field label="Member">{(id) => <Select id={id} name="playerId" required placeholder="Choose a member" options={members.map((m) => ({ value: m.id, label: `${m.name} · ${m.email}` }))} />}</Field>
          <Field label="Catalog package">{(id) => <Select id={id} name="packageId" options={[{ value: "", label: "Custom package (enter below)" }, ...catalog.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.name} · ${c.credits} credits · ${money(c.priceCents, c.currency)}` }))]} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Custom name">{(id) => <Input id={id} name="name" placeholder="Custom 8" />}</Field>
            <Field label="Credits">{(id) => <Input id={id} name="credits" type="number" min={1} max={100} />}</Field>
            <Field label="Price (EGP)">{(id) => <Input id={id} name="price" type="number" min={0} step={50} />}</Field>
            <Field label="Valid for (days)">{(id) => <Input id={id} name="validityDays" type="number" min={7} max={730} defaultValue={90} />}</Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSell(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy === "sell"}>
              Sell
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
