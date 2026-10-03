import { cn } from "@/lib/cn";
import { MONOGRAM_PATHS, MONOGRAM_VIEWBOX, WORDMARK_PATHS, WORDMARK_VIEWBOX } from "./logo-paths";

/**
 * HITTERS brand marks, vector-traced from the official references.
 * Never restyle the geometry; only size and color (currentColor) may change.
 */

type MarkProps = {
  /** Rendered height in px. Width follows the fixed aspect ratio. */
  height?: number;
  className?: string;
  /** Adds the signature electric glow behind the mark. */
  glow?: boolean;
  title?: string;
};

export function Monogram({ height = 24, className, glow, title = "HITTERS" }: MarkProps) {
  const { width, height: h } = MONOGRAM_VIEWBOX;
  return (
    <svg
      viewBox={`0 0 ${width} ${h}`}
      height={height}
      width={(height * width) / h}
      role="img"
      aria-label={title}
      className={cn("shrink-0 fill-current", glow && "drop-shadow-[0_0_14px_rgba(77,130,255,0.85)]", className)}
    >
      {MONOGRAM_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function Wordmark({ height = 18, className, glow, title = "HITTERS" }: MarkProps) {
  const { width, height: h } = WORDMARK_VIEWBOX;
  return (
    <svg
      viewBox={`0 0 ${width} ${h}`}
      height={height}
      width={(height * width) / h}
      role="img"
      aria-label={title}
      className={cn("shrink-0 fill-current", glow && "drop-shadow-[0_0_18px_rgba(77,130,255,0.75)]", className)}
    >
      {WORDMARK_PATHS.map((d, i) => (
        <path key={i} d={d} fillRule="evenodd" />
      ))}
    </svg>
  );
}

/** Wordmark with the letter-spaced "SPORTS ACADEMY" tagline justified to the same width. */
export function Lockup({ height = 28, className, glow }: MarkProps) {
  const width = (height * WORDMARK_VIEWBOX.width) / WORDMARK_VIEWBOX.height;
  const tagline = "SPORTS ACADEMY".split("");
  return (
    <div className={cn("inline-flex flex-col items-stretch text-current", className)} style={{ width }}>
      <Wordmark height={height} glow={glow} />
      <div
        aria-hidden
        className="mt-[0.35em] flex justify-between px-[0.1em] font-sans font-medium leading-none"
        style={{ fontSize: height * 0.42 }}
      >
        {tagline.map((c, i) => (
          <span key={i} className={c === " " ? "w-[0.3em]" : undefined}>
            {c === " " ? "" : c}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Rounded app-icon tile with the monogram, matching the reference home-screen icon. */
export function AppIcon({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-brand-gradient text-white shadow-glow-md",
        className,
      )}
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
      aria-hidden
    >
      <Monogram height={size * 0.34} />
    </div>
  );
}
