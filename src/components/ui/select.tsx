import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlClass, controlSizes } from "./input";

type Option = { value: string; label: string; disabled?: boolean };

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  options: Option[];
  placeholder?: string;
  size?: keyof typeof controlSizes;
  invalid?: boolean;
};

/** Native select with brand styling. Use Dropdown for custom menus. */
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { options, placeholder, size = "md", invalid, className, defaultValue, value, ...rest },
  ref,
) {
  const isControlled = value !== undefined;
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlClass, controlSizes[size], "appearance-none pr-10", className)}
        value={value}
        defaultValue={isControlled ? undefined : (defaultValue ?? (placeholder ? "" : undefined))}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled} className="bg-surface-3 text-fg">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
});
