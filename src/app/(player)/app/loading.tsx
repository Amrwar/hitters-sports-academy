import { Skeleton, SkeletonCard } from "@/components/ui/states";

export default function PlayerLoading() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-40" />
      </div>
      <Skeleton className="h-44 rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <SkeletonCard />
      <SkeletonCard lines={1} />
    </div>
  );
}
