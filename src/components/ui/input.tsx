import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Shared control surface: inputs, selects and textareas look identical. */
export const controlClass =
  "w-full rounded-md border border-line/10 bg-surface-2 text-fg placeholder:text-fg-subtle/80 shadow-inset-hi " +
  "transition-[border-color,box-shadow,background-color] duration-200 " +
  "hover:border-line/20 focus:border-blue-400 focus:shadow-glow-sm focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-45 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_1px_rgba(244,63,94,0.5),0_0_18px_rgba(244,63,94,0.3)]";

export const controlSizes = {
  sm: "h-9 px-3 text-body-sm",
  md: "h-11 px-4 text-body",
  lg: "h-12 px-4 text-body-lg",
};

type FieldProps = {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (id: string, describedBy?: string) => ReactNode;
};

/** Label + control + hint/error wrapper. Pass a render function so the id is wired for a11y. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-body-sm font-semibold text-fg-muted">
          {label}
          {required && <span className="ml-0.5 text-blue-300">*</span>}
        </label>
      )}
      {children(id, error || hint ? messageId : undefined)}
      {(error || hint) && (
        <p id={messageId} className={cn("text-caption", error ? "text-danger" : "text-fg-subtle")} role={error ? "alert" : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: keyof typeof controlSizes;
  leading?: ReactNode;
  trailing?: ReactNode;
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", leading, trailing, invalid, className, ...rest },
  ref,
) {
  return (
    <div className="relative flex items-center">
      {leading && <span className="pointer-events-none absolute left-3.5 text-fg-subtle [&_svg]:size-[18px]">{leading}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlClass, controlSizes[size], leading && "pl-11", trailing && "pr-11", className)}
        {...rest}
      />
      {trailing && <span className="absolute right-3 text-fg-subtle [&_svg]:size-[18px]">{trailing}</span>}
    </div>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClass, "min-h-28 resize-y px-4 py-3 text-body", className)}
      {...rest}
    />
  );
});
