import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgramCard } from "@/components/patterns/cards";
import { programs } from "@/data/mock";

export default function ProgramsPage() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Academy" title="Programs" />
      <Card variant="brand" padding="md" className="court-line">
        <div className="relative flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-white/15">
            <GraduationCap size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-h4">Not sure of your level?</div>
            <div className="text-body-sm text-white/80">Book a free 30-minute assessment with a coach.</div>
          </div>
          <Button size="sm" variant="secondary" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" href="/app/trainers">
            Book
          </Button>
        </div>
      </Card>
      <div className="space-y-3">
        {programs.map((p) => (
          <ProgramCard key={p.id} program={p} />
        ))}
      </div>
    </div>
  );
}
