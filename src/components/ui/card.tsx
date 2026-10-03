import Link from "next/link";
import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type CardVariant = "default" | "interactive" | "brand" | "glass" | "outline";

const variants: Record<CardVariant, string> = {
  default: "bg-surface-1 border border-line/10 shadow-inset-hi",
  interactive:
    "bg-surface-1 border border-line/10 shadow-inset-hi transition-[border-color,box-shadow,transform] duration-200 " +
    "hover:border-blue-400/50 hover:shadow-glow-sm active:scale-[0.995]",
  brand:
    "bg-brand-gradient text-white border border-blue-300/30 shadow-glow-md " +
    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-card-sheen",
  glass: "bg-white/[0.06] backdrop-blur-xl border border-white/10 text-white",
  outline: "border border-dashed border-line/20",
};

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  href?: string;
};

const paddings = { none: "", sm: "p-3", md: "p-4 sm:p-5", lg: "p-5 sm:p-7" };

export function Card({ variant = "default", padding = "md", href, className, children, ...rest }: Props) {
  const classes = cn("relative overflow-hidden rounded-lg", variants[variant], paddings[padding], className);
  const theme = variant === "brand" || variant === "glass" ? "dark" : undefined;
  if (href) {
    return (
      <Link href={href} className={cn(classes, "block")} data-theme={theme}>
        {children}
      </Link>
    );
  }
  return (
    <div className={classes} data-theme={theme} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-h4">{title}</h3>
        {description && <p className="mt-0.5 text-body-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Section heading used between card groups on dashboards. */
export function SectionHeader({ title, action, className, eyebrow }: { title: ReactNode; eyebrow?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <div>
        {eyebrow && <div className="text-overline uppercase text-blue-300 light:text-blue-700">{eyebrow}</div>}
        <h2 className="text-h3">{title}</h2>
      </div>
      {action}
    </div>
  );
}
