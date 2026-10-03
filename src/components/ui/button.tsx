import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "volt" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold " +
  "transition-[background-color,box-shadow,transform,color,border-color] duration-200 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-busy:pointer-events-none";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-gradient text-white shadow-glow-sm hover:shadow-glow-md hover:brightness-110 " +
    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-card-sheen",
  secondary: "bg-surface-2 text-fg border border-line/10 hover:border-line-strong/40 hover:bg-surface-3 shadow-inset-hi",
  outline: "border border-blue-400/60 text-fg hover:bg-blue-500/10 hover:border-blue-300",
  ghost: "text-fg-muted hover:text-fg hover:bg-line/5",
  volt: "bg-volt text-navy-950 shadow-glow-volt hover:brightness-105",
  danger: "bg-danger text-white hover:bg-danger-600",
  link: "text-blue-300 underline-offset-4 hover:underline hover:text-blue-200 h-auto px-0",
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-body-sm rounded-sm [&_svg]:size-4",
  md: "h-11 px-5 text-body-sm [&_svg]:size-[18px]",
  lg: "h-12 px-6 text-body [&_svg]:size-5",
  xl: "h-14 px-7 text-body-lg rounded-lg [&_svg]:size-5",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  /** Renders a Next.js Link styled as a button. */
  href?: string;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  leftIcon,
  rightIcon,
  fullWidth,
  href,
  className,
  children,
  disabled,
  type,
  ...rest
}: Props) {
  const classes = cn(base, buttonVariants[variant], buttonSizes[size], fullWidth && "w-full", className);
  const content = (
    <>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : leftIcon}
      <span className={cn(loading && "opacity-80")}>{children}</span>
      {!loading && rightIcon}
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={classes} aria-busy={loading || undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Exclude<ButtonVariant, "link">;
  size?: "sm" | "md" | "lg";
  label: string;
  href?: string;
};

const iconSizes = { sm: "size-9 rounded-sm [&_svg]:size-4", md: "size-11 [&_svg]:size-5", lg: "size-12 [&_svg]:size-6" };

export function IconButton({ variant = "secondary", size = "md", label, href, className, children, ...rest }: IconButtonProps) {
  const classes = cn(base, buttonVariants[variant], iconSizes[size], "p-0", className);
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={label} title={label}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
