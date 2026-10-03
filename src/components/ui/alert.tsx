import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

const styles: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "border-blue-400/30 bg-blue-500/10 text-blue-100 [&_svg]:text-blue-300 light:text-fg light:[&_svg]:text-blue-600", icon: <Info /> },
  success: { box: "border-success/30 bg-success/10 text-fg [&_svg]:text-success", icon: <CheckCircle2 /> },
  warning: { box: "border-warning/30 bg-warning/10 text-fg [&_svg]:text-warning", icon: <AlertTriangle /> },
  danger: { box: "border-danger/30 bg-danger/10 text-fg [&_svg]:text-danger", icon: <XCircle /> },
};

export function Alert({ tone = "info", title, children, action, className }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-4 [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0", styles[tone].box, className)}>
      {styles[tone].icon}
      <div className="min-w-0 flex-1">
        {title && <div className="text-body-sm font-bold">{title}</div>}
        {children && <div className={cn("text-body-sm", title ? "mt-0.5 text-fg-muted" : "")}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}
