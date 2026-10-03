"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type DropdownItem = {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  tone?: "default" | "danger";
  selected?: boolean;
  disabled?: boolean;
};

type Props = {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  className?: string;
  /** Optional heading rendered above the items. */
  label?: string;
};

/** Click-to-open menu. Closes on outside click, Escape and item selection. */
export function Dropdown({ trigger, items, align = "end", className, label }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <div onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-controls={id} className="contents">
        {trigger}
      </div>
      {open && (
        <div
          id={id}
          role="menu"
          className={cn(
            "absolute z-40 mt-2 min-w-48 overflow-hidden rounded-md border border-line/10 bg-surface-3 p-1.5 shadow-lg animate-scale-in origin-top",
            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
          )}
        >
          {label && <div className="px-2.5 pb-1.5 pt-1 text-overline uppercase text-fg-subtle">{label}</div>}
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-body-sm font-medium transition-colors",
                "hover:bg-line/5 disabled:opacity-45 [&_svg]:size-4",
                item.tone === "danger" ? "text-danger" : "text-fg",
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.selected && <Check className="text-blue-300" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
