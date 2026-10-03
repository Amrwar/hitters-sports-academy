"use client";

import { useState } from "react";
import { Download, Filter, MoreHorizontal, Search, UserPlus } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { LevelBadge, StatusBadge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { Tabs } from "@/components/ui/tabs";
import { StatTile } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { currentUser, locationBySlug, players } from "@/data/mock";
import { LEVELS, type Level } from "@/lib/tokens";

type Filter = "all" | Level;

export default function AdminMembers() {
  const [level, setLevel] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const all = [currentUser, ...players];
  const list = all.filter((p) => (level === "all" || p.level === level) && p.name.toLowerCase().includes(q.toLowerCase()));
  const membership = (i: number) => (["active", "active", "paused", "active", "expired", "active", "active", "active"] as const)[i % 8];

  return (
    <AdminShell
      title="Members"
      breadcrumb={["People", "Members"]}
      actions={
        <>
          <Button variant="secondary" leftIcon={<Download />}>
            Export
          </Button>
          <Button leftIcon={<UserPlus />}>Add member</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile size="lg" label="Total members" value="1,284" delta={{ value: "+38 this month" }} />
        <StatTile size="lg" label="Active memberships" value="912" />
        <StatTile size="lg" label="Awaiting assessment" value={27} delta={{ value: "Book assessments", positive: false }} />
        <StatTile size="lg" label="Avg. matches / member" value="6.4" />
      </div>

      <Card padding="sm" className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <Input size="sm" placeholder="Search members" leading={<Search />} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
        </div>
        <Tabs variant="pill" value={level} onChange={setLevel} items={[{ value: "all", label: "All levels" }, ...LEVELS.map((l) => ({ value: l, label: `Level ${l}` }))]} />
        <IconButton variant="secondary" size="sm" label="More filters">
          <Filter />
        </IconButton>
      </Card>

      <TableWrap className="mt-4">
        <Table>
          <THead>
            <TR>
              <TH>Member</TH>
              <TH>Level</TH>
              <TH>Home club</TH>
              <TH className="text-right">Matches</TH>
              <TH className="text-right">Win rate</TH>
              <TH>Membership</TH>
              <TH>Joined</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {list.map((p, i) => (
              <TR key={p.id} interactive>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} size="sm" online={p.online} />
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-caption text-fg-subtle">{p.city}</div>
                    </div>
                  </div>
                </TD>
                <TD>
                  <LevelBadge level={p.level} size="sm" />
                </TD>
                <TD className="text-fg-muted">{locationBySlug(p.homeClub)?.name.replace("HITTERS ", "")}</TD>
                <TD numeric>{p.matches}</TD>
                <TD numeric>{Math.round((p.wins / Math.max(1, p.matches)) * 100)}%</TD>
                <TD>
                  <StatusBadge status={membership(i)} />
                </TD>
                <TD className="text-fg-muted">{p.memberSince}</TD>
                <TD className="w-12">
                  <Dropdown
                    trigger={
                      <IconButton variant="ghost" size="sm" label="Member actions">
                        <MoreHorizontal />
                      </IconButton>
                    }
                    items={[{ label: "View profile" }, { label: "Change level" }, { label: "Message" }, { label: "Suspend", tone: "danger" }]}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </AdminShell>
  );
}
