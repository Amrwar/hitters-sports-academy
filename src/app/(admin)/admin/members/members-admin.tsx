"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, MoreHorizontal, Search, ShieldCheck, UserX } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { useAdminActor } from "@/components/nav/admin-actor";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge, StatusBadge } from "@/components/ui/badge";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { StatTile } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TDTight, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { LEVELS } from "@/lib/tokens";
import type { UserSummary } from "@/server/services/users";
import { createAssessmentAction, setGlobalRoleAction, setUserStatusAction } from "@/server/actions/admin";

type Props = { users: UserSummary[]; total: number; query: string; locations: { id: string; name: string }[]; canSuspend: boolean; canAssess: boolean };

export function MembersAdmin({ users, total, query, locations, canSuspend, canAssess }: Props) {
  const router = useRouter();
  const me = useAdminActor();
  const { toast } = useToast();
  const [assess, setAssess] = useState<UserSummary | null>(null);
  const [suspend, setSuspend] = useState<UserSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const staffCount = users.filter((u) => u.globalRole || u.memberships.length).length;
  const unassessed = users.filter((u) => u.playerProfile && !u.playerProfile.level).length;

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "");
    router.push(q ? `/admin/members?q=${encodeURIComponent(q)}` : "/admin/members");
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) toast({ tone: "success", title: label });
    else toast({ tone: "danger", title: res.message ?? "Action failed" });
    router.refresh();
  }

  async function submitAssessment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!assess?.playerProfile) return;
    const form = new FormData(e.currentTarget);
    form.set("playerProfileId", assess.playerProfile.id);
    await run(`Level recorded for ${assess.name}`, async () => {
      const res = await createAssessmentAction(form);
      return res.ok ? { ok: true } : { ok: false, message: res.message };
    });
    setAssess(null);
  }

  return (
    <AdminShell title="Members" breadcrumb={["People", "Members"]}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile size="lg" label="Visible members" value={total} />
        <StatTile size="lg" label="Staff accounts" value={staffCount} />
        <StatTile size="lg" label="Awaiting assessment" value={unassessed} delta={unassessed ? { value: "Book assessments" } : undefined} />
        <StatTile size="lg" label="Your clubs" value={<span className="text-h3">{me.isGlobal ? "All locations" : `${me.locationIds.length} location${me.locationIds.length === 1 ? "" : "s"}`}</span>} />
      </div>

      <Card padding="sm" className="mt-5">
        <form onSubmit={search} className="flex gap-2">
          <div className="flex-1">
            <Input size="sm" name="q" defaultValue={query} placeholder="Search by name, email or phone" leading={<Search />} aria-label="Search members" />
          </div>
          <Button size="sm" type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </Card>

      {users.length === 0 ? (
        <EmptyState className="mt-4" icon={<Search />} title="No members found" description={query ? "Try a different search." : "Members whose home club is one of your locations will appear here."} />
      ) : (
        <TableWrap className="mt-4">
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Level</TH>
                <TH>Home club</TH>
                <TH>Roles</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {users.map((u) => {
                const items: DropdownItem[] = [];
                if (canAssess && u.playerProfile && u.id !== me.id) items.push({ label: "Record assessment", icon: <ClipboardCheck />, onSelect: () => setAssess(u) });
                if (me.isSuperAdmin && u.id !== me.id) {
                  items.push({
                    label: u.globalRole === "ACADEMY_OWNER" ? "Remove academy owner" : "Make academy owner",
                    icon: <ShieldCheck />,
                    onSelect: () => run("Global role updated", async () => setGlobalRoleAction(u.id, u.globalRole === "ACADEMY_OWNER" ? null : "ACADEMY_OWNER")),
                  });
                }
                if (canSuspend && u.id !== me.id) {
                  items.push(
                    u.status === "SUSPENDED"
                      ? { label: "Reactivate", onSelect: () => run("Account reactivated", async () => setUserStatusAction(u.id, "ACTIVE")) }
                      : { label: "Suspend", icon: <UserX />, tone: "danger", onSelect: () => setSuspend(u) },
                  );
                }
                return (
                  <TR key={u.id} interactive onClick={() => router.push(`/admin/members/${u.id}`)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} size="sm" />
                        <div>
                          <div className="font-semibold">{u.name}</div>
                          <div className="text-caption text-fg-subtle">
                            {u.email}
                            {!u.emailVerifiedAt && " · unverified"}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TDTight className="w-px">{u.playerProfile?.level ? <LevelBadge level={u.playerProfile.level} size="sm" /> : <Badge size="sm">Unassessed</Badge>}</TDTight>
                    <TDTight className="text-fg-muted">{u.playerProfile?.homeLocation?.name.replace("HITTERS ", "") ?? "—"}</TDTight>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {u.globalRole && (
                          <Badge tone="volt" size="sm">
                            {ROLE_LABEL[u.globalRole]}
                          </Badge>
                        )}
                        {u.memberships.map((m) => (
                          <Badge key={`${m.locationId}-${m.role}`} tone="brand" size="sm">
                            {ROLE_LABEL[m.role]} · {m.location.name.replace("HITTERS ", "")}
                          </Badge>
                        ))}
                        {!u.globalRole && u.memberships.length === 0 && (
                          <Badge size="sm">Player</Badge>
                        )}
                      </div>
                    </TD>
                    <TDTight>
                      {u.status === "ACTIVE" ? (
                        <span className="inline-flex items-center gap-1.5 text-body-sm text-fg-muted">
                          <span className="size-1.5 rounded-full bg-success" />
                          Active
                        </span>
                      ) : (
                        <StatusBadge status={u.status === "SUSPENDED" ? "paused" : "expired"} />
                      )}
                    </TDTight>
                    <TD className="whitespace-nowrap text-fg-muted">{new Date(u.createdAt).toLocaleDateString("en", { month: "short", year: "numeric" })}</TD>
                    <TD className="w-12" onClick={(e) => e.stopPropagation()}>
                      {items.length > 0 && (
                        <Dropdown
                          trigger={
                            <IconButton variant="ghost" size="sm" label="Member actions" disabled={busy}>
                              <MoreHorizontal />
                            </IconButton>
                          }
                          items={items}
                        />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <Modal open={!!assess} onClose={() => setAssess(null)} title={`Assess ${assess?.name ?? ""}`} description="Records an A/B/C/D placement and notifies the player.">
        {assess && (
          <form onSubmit={submitAssessment} className="space-y-4" id="assess-form">
            <Field label="Location">{(id) => <Select id={id} name="locationId" required placeholder="Choose a location" options={locations.map((l) => ({ value: l.id, label: l.name }))} />}</Field>
            <Field label="Level">
              {(id) => <Select id={id} name="level" required defaultValue={assess.playerProfile?.level ?? "C"} options={LEVELS.map((l) => ({ value: l, label: `Level ${l}` }))} />}
            </Field>
            <Field label="Notes">{(id) => <Textarea id={id} name="notes" placeholder="Strengths, areas to work on…" />}</Field>
            <div className="flex justify-end gap-2 pb-2">
              <Button type="button" variant="ghost" onClick={() => setAssess(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save assessment
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!suspend}
        onClose={() => setSuspend(null)}
        tone="danger"
        title={`Suspend ${suspend?.name ?? ""}?`}
        description="They will be signed out everywhere and unable to sign in until reactivated."
        confirmLabel="Suspend account"
        loading={busy}
        onConfirm={async () => {
          if (!suspend) return;
          await run("Account suspended", async () => setUserStatusAction(suspend.id, "SUSPENDED"));
          setSuspend(null);
        }}
      />
    </AdminShell>
  );
}
