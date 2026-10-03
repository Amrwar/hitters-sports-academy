import { Plus, Star } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { locationBySlug, money, trainers } from "@/data/mock";

export default function AdminTrainers() {
  return (
    <AdminShell title="Trainers" breadcrumb={["People", "Trainers"]} actions={<Button leftIcon={<Plus />}>Invite trainer</Button>}>
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>Trainer</TH>
              <TH>Clubs</TH>
              <TH>Specialties</TH>
              <TH className="text-right">Rate</TH>
              <TH className="text-right">Rating</TH>
              <TH className="text-right">Sessions / wk</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {trainers.map((t, i) => (
              <TR key={t.id} interactive>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={t.name.replace("Coach ", "")} size="sm" />
                    <div>
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-caption text-fg-subtle">{t.title}</div>
                    </div>
                  </div>
                </TD>
                <TD className="text-fg-muted">{t.locationSlugs.map((s) => locationBySlug(s)?.name.replace("HITTERS ", "")).join(", ")}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {t.specialties.map((s) => (
                      <Badge key={s} size="sm">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD numeric className="font-semibold">
                  {money(t.pricePerHour)}
                </TD>
                <TD numeric>
                  <span className="inline-flex items-center gap-1">
                    <Star size={12} className="fill-volt-600 text-volt-600" /> {t.rating.toFixed(1)}
                  </span>
                </TD>
                <TD numeric>{[18, 12, 9][i]}</TD>
                <TD>
                  <StatusBadge status="active" />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </AdminShell>
  );
}
