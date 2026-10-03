import { PageHeader } from "@/components/nav/player-nav";
import { Badge } from "@/components/ui/badge";
import { TrainerCard } from "@/components/patterns/cards";
import { trainers } from "@/data/mock";

export default function TrainersPage() {
  return (
    <div>
      <PageHeader eyebrow="Academy" title="Private trainers" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Badge tone="brand" className="h-8 px-3 text-body-sm">
          All clubs
        </Badge>
        <Badge className="h-8 px-3 text-body-sm">Near me</Badge>
        <Badge className="h-8 px-3 text-body-sm">Top rated</Badge>
      </div>
      <div className="space-y-3">
        {trainers.map((t) => (
          <TrainerCard key={t.id} trainer={t} />
        ))}
      </div>
    </div>
  );
}
