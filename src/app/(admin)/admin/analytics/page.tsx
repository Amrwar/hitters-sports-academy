import { BarChart3 } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Card, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { money } from "@/data/mock";

const weeks = ["W36", "W37", "W38", "W39", "W40"];
const revenue = [86, 92, 88, 104, 118];
const bookings = [310, 334, 320, 372, 401];

export default function AdminAnalytics() {
  const max = Math.max(...revenue);
  return (
    <AdminShell title="Analytics" breadcrumb={["Overview", "Analytics"]}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile size="lg" label="Revenue (5 wks)" value={money(488000)} delta={{ value: "+21%" }} />
        <StatTile size="lg" label="Bookings (5 wks)" value="1,737" delta={{ value: "+14%" }} />
        <StatTile size="lg" label="Matchmaking fill rate" value="91%" delta={{ value: "+3 pts" }} tone="brand" />
        <StatTile size="lg" label="Program enrolment" value="78%" delta={{ value: "-2 pts", positive: false }} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Weekly revenue" description="Thousands EGP, all locations" />
          <div className="flex h-48 items-end gap-4">
            {revenue.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center gap-2">
                <span className="text-caption font-semibold tabular text-fg-muted">{v}k</span>
                <div className="flex w-full flex-1 items-end rounded-t-xs bg-brand/10">
                  <div className={`w-full rounded-t-xs ${i === revenue.length - 1 ? "bg-brand-gradient shadow-glow-sm" : "bg-brand/60"}`} style={{ height: `${(v / max) * 100}%` }} />
                </div>
                <span className="text-caption font-semibold text-fg-subtle">{weeks[i]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Weekly bookings" description="Court bookings, all locations" />
          <div className="flex h-48 items-end gap-4">
            {bookings.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center gap-2">
                <span className="text-caption font-semibold tabular text-fg-muted">{v}</span>
                <div className="flex w-full flex-1 items-end rounded-t-xs bg-brand/10">
                  <div className="w-full rounded-t-xs bg-brand/60" style={{ height: `${(v / Math.max(...bookings)) * 100}%` }} />
                </div>
                <span className="text-caption font-semibold text-fg-subtle">{weeks[i]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-5">
        <EmptyState icon={<BarChart3 />} title="Cohort and retention reports coming soon" description="Player retention, level progression and tournament analytics will appear here once the data layer is connected." />
      </div>
    </AdminShell>
  );
}
