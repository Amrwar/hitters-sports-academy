import { Plus } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { byId, locationBySlug, money, programs, trainers } from "@/data/mock";

export default function AdminPrograms() {
  return (
    <AdminShell title="Programs" breadcrumb={["People", "Programs"]} actions={<Button leftIcon={<Plus />}>Create program</Button>}>
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>Program</TH>
              <TH>Levels</TH>
              <TH>Coach · club</TH>
              <TH>Starts</TH>
              <TH className="min-w-48">Enrolment</TH>
              <TH className="text-right">Price</TH>
              <TH>Tag</TH>
            </TR>
          </THead>
          <TBody>
            {programs.map((p) => {
              const enrolled = p.capacity - p.spotsLeft;
              return (
                <TR key={p.id} interactive>
                  <TD>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-caption text-fg-subtle">
                      {p.weeks} wks · {p.sessionsPerWeek}×/wk
                    </div>
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      {p.levels.map((l) => (
                        <LevelBadge key={l} level={l} size="sm" />
                      ))}
                    </div>
                  </TD>
                  <TD className="text-fg-muted">
                    {byId(trainers, p.trainerId)?.name.replace("Coach ", "")} · {locationBySlug(p.locationSlug)?.name.replace("HITTERS ", "")}
                  </TD>
                  <TD>{p.startDate}</TD>
                  <TD>
                    <ProgressBar value={enrolled} max={p.capacity} label={`${enrolled}/${p.capacity}`} tone={p.spotsLeft <= 1 ? "volt" : "brand"} />
                  </TD>
                  <TD numeric className="font-semibold">
                    {money(p.price)}
                  </TD>
                  <TD>{p.tag && <Badge tone={p.tag === "Last spots" ? "warning" : p.tag === "New" ? "volt" : "brand"}>{p.tag}</Badge>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>
    </AdminShell>
  );
}
