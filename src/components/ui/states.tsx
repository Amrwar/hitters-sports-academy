import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { Button } from "./button";

/* ------------------------------------------------------------------ Loading */

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn("animate-spin text-blue-300 light:text-blue-600", className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

/** Card-shaped skeleton for lists while data loads. */
export function SkeletonCard({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-line/10 bg-surface-1 p-4", className)} aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      {lines > 0 && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-fg-muted", className)} role="status">
      <Spinner size={28} />
      <span className="text-body-sm font-medium">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Empty / error / success */

type StateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  compact?: boolean;
};

const tileBase = "flex size-14 items-center justify-center rounded-lg [&_svg]:size-7";

export function EmptyState({ icon, title, description, action, secondaryAction, className, compact }: StateProps) {
  return (
    <div className={cn("flex flex-col items-center rounded-lg border border-dashed border-line/15 px-6 text-center", compact ? "py-8" : "py-14", className)}>
      {icon && <div className={cn(tileBase, "bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-400/20 light:text-blue-700")}>{icon}</div>}
      <h3 className="mt-4 text-h4">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-body-sm text-fg-muted">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry, className }: { title?: string; description?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-lg border border-danger/20 bg-danger/5 px-6 py-12 text-center", className)} role="alert">
      <div className={cn(tileBase, "bg-danger/10 text-danger")}>
        <AlertTriangle />
      </div>
      <h3 className="mt-4 text-h4">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-body-sm text-fg-muted">{description}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Full-bleed success confirmation after booking, payment or join requests. */
export function ConfirmationState({ title, description, action, secondaryAction, className }: StateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)} role="status">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-success/30 blur-2xl" aria-hidden />
        <div className="relative flex size-20 items-center justify-center rounded-full bg-success/15 text-success ring-1 ring-success/40 animate-scale-in [&_svg]:size-10">
          <CheckCircle2 />
        </div>
      </div>
      <h2 className="mt-6 text-h2">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-body text-fg-muted">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-7 flex w-full max-w-xs flex-col gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
