import { cn } from "@/lib/cn";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

/** Data table. Wrap in <TableWrap> for horizontal scrolling on small screens. */
export function TableWrap({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("w-full overflow-x-auto rounded-lg border border-line/10 bg-surface-1", className)} {...rest} />;
}

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-[640px] border-collapse text-body-sm", className)} {...rest} />;
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-surface-2 text-left", className)} {...rest} />;
}

export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line/10", className)} {...rest} />;
}

export function TR({ className, interactive, ...rest }: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return <tr className={cn(interactive && "cursor-pointer transition-colors hover:bg-line/[0.04]", className)} {...rest} />;
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-11 whitespace-nowrap px-4 text-overline uppercase text-fg-subtle first:pl-5 last:pr-5", className)} {...rest} />;
}

export function TD({ className, numeric, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn("h-14 px-4 align-middle text-fg first:pl-5 last:pr-5", numeric && "whitespace-nowrap tabular text-right", className)} {...rest} />;
}
