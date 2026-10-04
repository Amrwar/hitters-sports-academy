import { cn } from "@/lib/cn";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * Data table wrapper. Scrolls horizontally on narrow screens, where the table is wider than the viewport.
 *
 * From `lg` up the overflow is removed entirely, because a container with `overflow-x: auto` is a scroll
 * container, and a sticky `thead` inside one sticks to that container rather than to the page, which means it
 * never appears. Wide screens fit the table anyway, so dropping the overflow there is what lets the header
 * follow the page down.
 */
export function TableWrap({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("w-full overflow-x-auto rounded-lg border border-line/10 bg-surface-1 lg:overflow-x-visible", className)} {...rest} />;
}

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-[640px] border-collapse text-body-sm", className)} {...rest} />;
}

/**
 * Admin tables run to hundreds of rows, so the header follows the page down and stays under the sticky top
 * bar rather than scrolling away and leaving columns unlabelled.
 */
export function THead({ className, sticky = true, ...rest }: HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  return <thead className={cn("bg-surface-2 text-left", sticky && "lg:sticky lg:top-16 lg:z-10 lg:shadow-[0_1px_0_0_rgb(var(--line)/0.12)]", className)} {...rest} />;
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

/**
 * A short value that must never wrap, such as a club name or a level. Wrapping one of these ragged the row
 * heights down a whole table for the sake of a single long word.
 */
export function TDTight({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <TD className={cn("whitespace-nowrap", className)} {...rest} />;
}
