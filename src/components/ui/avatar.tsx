import { cn } from "@/lib/cn";

type Size = "xs" | "sm" | "md" | "lg" | "xl";
const sizes: Record<Size, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-caption",
  md: "size-10 text-body-sm",
  lg: "size-14 text-h4",
  xl: "size-20 text-h2",
};

const palettes = ["bg-brand-gradient text-white", "bg-navy-700 text-blue-200", "bg-blue-900 text-blue-100", "bg-blue-700 text-white"];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

type Props = {
  name: string;
  size?: Size;
  /** Photo URL. Falls back to initials when absent; a broken image falls back too. */
  src?: string | null;
  /** Online presence dot. */
  online?: boolean;
  /** Blue ring, used for the current user or a highlighted player. */
  ring?: boolean;
  className?: string;
};

/** Only http(s) URLs are painted, and quotes are dropped so a stored value cannot break out of the css url(). */
function safePhoto(src: string | null | undefined): string | null {
  if (!src) return null;
  const clean = src.trim().replace(/["'()\\]/g, "");
  return /^https?:\/\/\S+$/i.test(clean) ? clean : null;
}

/** Photo avatar when `src` is given, otherwise initials; the palette is derived from the name so it is stable across renders. */
export function Avatar({ name, size = "md", src, online, ring, className }: Props) {
  const palette = palettes[name.length % palettes.length];
  const photo = safePhoto(src);
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "relative inline-flex items-center justify-center overflow-hidden rounded-full font-bold uppercase tracking-wide select-none",
          sizes[size],
          palette,
          ring && "ring-2 ring-blue-400 ring-offset-2 ring-offset-canvas shadow-glow-sm",
        )}
        aria-label={name}
        role="img"
      >
        {initials(name)}
        {photo && (
          // A CSS layer over the initials: a missing or broken photo simply paints nothing and the initials
          // show through. Using a background rather than <img> keeps this usable from server components.
          <span aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${photo}")` }} />
        )}
      </span>
      {online && <span className="absolute bottom-0 right-0 size-[22%] min-h-2 min-w-2 rounded-full bg-success ring-2 ring-canvas" aria-label="Online" />}
    </span>
  );
}

export function AvatarGroup({ names, size = "sm", max = 4, className }: { names: string[]; size?: Size; max?: number; className?: string }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className={cn("inline-flex items-center -space-x-2", className)}>
      {shown.map((n) => (
        <Avatar key={n} name={n} size={size} className="ring-2 ring-surface-1 rounded-full" />
      ))}
      {rest > 0 && (
        <span className={cn("inline-flex items-center justify-center rounded-full bg-surface-3 font-bold text-fg-muted ring-2 ring-surface-1", sizes[size])}>+{rest}</span>
      )}
    </span>
  );
}
