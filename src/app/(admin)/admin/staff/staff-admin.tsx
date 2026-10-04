"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { useAdminActor } from "@/components/nav/admin-actor";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { MANAGER_GRANTABLE_ROLES, ROLE_LABEL, STAFF_ROLES } from "@/lib/auth/permissions";
import type { MembershipView } from "@/server/services/staff";
import { grantStaffRoleAction, revokeStaffRoleAction } from "@/server/actions/admin";

type Props = { memberships: MembershipView[]; locations: { id: string; name: string }[]; users: { id: string; name: string; email: string }[]; canGrant: boolean };

export function StaffAdmin({ memberships, locations, users, canGrant }: Props) {
  const router = useRouter();
  const me = useAdminActor();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [revoke, setRevoke] = useState<MembershipView | null>(null);
  const [busy, setBusy] = useState(false);
  const roles = me.isGlobal ? STAFF_ROLES : MANAGER_GRANTABLE_ROLES;

  async function grant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await grantStaffRoleAction(new FormData(e.currentTarget));
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      toast({ tone: "success", title: `${res.data.user.name} is now ${ROLE_LABEL[res.data.role].toLowerCase()} at ${res.data.location.name.replace("HITTERS ", "")}` });
      router.refresh();
    } else toast({ tone: "danger", title: res.message });
  }

  return (
    <AdminShell title="Staff" breadcrumb={["People", "Staff"]} actions={canGrant ? <Button leftIcon={<UserPlus />} onClick={() => setOpen(true)}>Grant role</Button> : undefined}>
      {!me.isGlobal && (
        <Alert tone="info" className="mb-4" title="Roles apply per club">
          You see and manage staff at your own locations. Only academy owners appoint location managers.
        </Alert>
      )}
      {memberships.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="No staff yet" description="Grant a role to bring someone onto the team." />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Staff member</TH>
                <TH>Role</TH>
                <TH>Location</TH>
                <TH>Granted</TH>
                <TH>By</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {memberships.map((m) => {
                const canRevoke = canGrant && m.user.id !== me.id && (me.isGlobal || MANAGER_GRANTABLE_ROLES.includes(m.role));
                return (
                  <TR key={m.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={m.user.name} size="sm" />
                        <div>
                          <div className="font-semibold">{m.user.name}</div>
                          <div className="text-caption text-fg-subtle">{m.user.email}</div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={m.role === "LOCATION_MANAGER" ? "volt" : "brand"}>{ROLE_LABEL[m.role]}</Badge>
                    </TD>
                    <TD>{m.location.name}</TD>
                    <TD className="whitespace-nowrap text-fg-muted">{new Date(m.createdAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}</TD>
                    <TD className="text-fg-muted">{m.createdBy?.name ?? "—"}</TD>
                    <TD className="w-12">
                      {canRevoke && (
                        <IconButton variant="ghost" size="sm" label="Revoke role" className="text-danger hover:bg-danger/10" onClick={() => setRevoke(m)}>
                          <UserMinus />
                        </IconButton>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Grant a staff role" description="Roles are scoped to one location. A person can hold several.">
        <form onSubmit={grant} className="space-y-4">
          <Field label="Person">{(id) => <Select id={id} name="userId" required placeholder="Choose a member" options={users.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }))} />}</Field>
          <Field label="Location">{(id) => <Select id={id} name="locationId" required placeholder="Choose a location" options={locations.map((l) => ({ value: l.id, label: l.name }))} />}</Field>
          <Field label="Role">{(id) => <Select id={id} name="role" required placeholder="Choose a role" options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />}</Field>
          <div className="flex justify-end gap-2 pb-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Grant role
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!revoke}
        onClose={() => setRevoke(null)}
        tone="danger"
        title={`Remove ${revoke ? ROLE_LABEL[revoke.role].toLowerCase() : ""} from ${revoke?.user.name ?? ""}?`}
        description="They keep their player account but lose access to this location's admin tools."
        confirmLabel="Revoke role"
        loading={busy}
        onConfirm={async () => {
          if (!revoke) return;
          setBusy(true);
          const res = await revokeStaffRoleAction(revoke.id);
          setBusy(false);
          setRevoke(null);
          if (res.ok) toast({ tone: "success", title: "Role revoked" });
          else toast({ tone: "danger", title: res.message });
          router.refresh();
        }}
      />
      <Card padding="sm" className="mt-6 text-body-sm text-fg-muted">
        Changes take effect on the person&apos;s next request. Every grant and revoke is recorded in the audit log.
      </Card>
    </AdminShell>
  );
}
