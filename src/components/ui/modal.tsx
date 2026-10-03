"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton, Button } from "./button";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** On small screens the modal rises as a bottom sheet; set false to keep it centered. */
  sheetOnMobile?: boolean;
};

const sizes = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl" };

/** Dialog that behaves as a bottom sheet on mobile and a centered modal on larger screens. */
export function Modal({ open, onClose, title, description, children, footer, size = "md", sheetOnMobile = true }: Props) {
  const id = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Portal to <body> so no animated or transformed ancestor can trap the overlay below fixed navigation.
  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex", sheetOnMobile ? "items-end sm:items-center" : "items-center", "justify-center sm:p-4")}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm animate-fade-in" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-describedby={description ? `${id}-desc` : undefined}
        className={cn(
          "relative flex w-full max-h-[92dvh] flex-col border border-line/10 bg-surface-3 shadow-lg",
          sheetOnMobile ? "rounded-t-2xl animate-slide-up sm:rounded-xl sm:animate-scale-in" : "mx-4 rounded-xl animate-scale-in",
          sizes[size],
        )}
      >
        {sheetOnMobile && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line/20 sm:hidden" aria-hidden />}
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            {title && (
              <h2 id={`${id}-title`} className="text-h3">
                {title}
              </h2>
            )}
            {description && (
              <p id={`${id}-desc`} className="mt-1 text-body-sm text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton variant="ghost" size="sm" label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <X />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-3 sm:px-6">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line/10 px-5 py-4 safe-bottom sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

type ConfirmProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "brand" | "danger";
  loading?: boolean;
};

/** Confirmation dialog for irreversible or paid actions. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", tone = "brand", loading }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
