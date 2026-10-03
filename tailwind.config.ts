import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * HITTERS SPORTS ACADEMY design tokens.
 * Semantic colors (canvas, surface, fg, line, brand) resolve through CSS variables so the
 * player app (dark) and the admin content area (light) share one component library.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      colors: {
        navy: {
          950: "#030712",
          900: "#050B24",
          800: "#0A1540",
          700: "#10205C",
          600: "#182B78",
        },
        blue: {
          50: "#EEF3FF",
          100: "#D9E4FF",
          200: "#B4C9FF",
          300: "#7FA6FF",
          400: "#4D82FF",
          500: "#2563FF",
          600: "#1646E6",
          700: "#0B2FD6",
          800: "#0A2199",
          900: "#0A1A5C",
        },
        volt: { DEFAULT: "#D4F23C", 600: "#A9C62A", 100: "#F3FBC9" },
        success: { DEFAULT: "#22C55E", 600: "#16A34A", 100: "#DCFCE7" },
        warning: { DEFAULT: "#F5A524", 600: "#D97706", 100: "#FEF3C7" },
        danger: { DEFAULT: "#F43F5E", 600: "#E11D48", 100: "#FFE4E6" },
        canvas: v("canvas"),
        surface: { 1: v("surface-1"), 2: v("surface-2"), 3: v("surface-3") },
        line: { DEFAULT: v("line"), strong: v("line-strong") },
        fg: { DEFAULT: v("fg"), muted: v("fg-muted"), subtle: v("fg-subtle") },
        brand: { DEFAULT: v("brand"), hover: v("brand-hover"), fg: v("brand-fg") },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["3.5rem", { lineHeight: "3.75rem", letterSpacing: "-0.03em", fontWeight: "800" }],
        display: ["2.5rem", { lineHeight: "2.75rem", letterSpacing: "-0.025em", fontWeight: "800" }],
        h1: ["2rem", { lineHeight: "2.375rem", letterSpacing: "-0.02em", fontWeight: "800" }],
        h2: ["1.5rem", { lineHeight: "1.875rem", letterSpacing: "-0.015em", fontWeight: "700" }],
        h3: ["1.25rem", { lineHeight: "1.625rem", letterSpacing: "-0.01em", fontWeight: "700" }],
        h4: ["1.125rem", { lineHeight: "1.5rem", letterSpacing: "-0.005em", fontWeight: "700" }],
        "body-lg": ["1rem", { lineHeight: "1.5rem" }],
        body: ["0.9375rem", { lineHeight: "1.375rem" }],
        "body-sm": ["0.875rem", { lineHeight: "1.25rem" }],
        caption: ["0.75rem", { lineHeight: "1rem" }],
        overline: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.12em", fontWeight: "700" }],
      },
      borderRadius: {
        xs: "6px",
        sm: "10px",
        md: "14px",
        lg: "18px",
        xl: "24px",
        "2xl": "32px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(3, 7, 18, 0.35)",
        md: "0 8px 24px -8px rgba(3, 7, 18, 0.55)",
        lg: "0 24px 48px -12px rgba(3, 7, 18, 0.65)",
        "glow-sm": "0 0 0 1px rgba(77,130,255,0.35), 0 0 18px rgba(37,99,255,0.35)",
        "glow-md": "0 0 0 1px rgba(77,130,255,0.45), 0 0 36px rgba(37,99,255,0.45)",
        "glow-lg": "0 0 0 1px rgba(127,166,255,0.5), 0 0 72px rgba(37,99,255,0.55)",
        "glow-volt": "0 0 0 1px rgba(212,242,60,0.45), 0 0 24px rgba(212,242,60,0.35)",
        "inset-hi": "inset 0 1px 0 rgba(255,255,255,0.08)",
        "light-md": "0 8px 24px -8px rgba(10, 26, 92, 0.18)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #0B2FD6 0%, #2563FF 60%, #4D82FF 100%)",
        "brand-gradient-v": "linear-gradient(180deg, #0A2199 0%, #1646E6 100%)",
        "navy-gradient": "linear-gradient(180deg, #0A1540 0%, #030712 100%)",
        "hero-gradient": "radial-gradient(120% 80% at 50% 0%, #1646E6 0%, #0A1A5C 45%, #030712 100%)",
        "card-sheen": "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 40%)",
      },
      spacing: { 18: "4.5rem", 22: "5.5rem" },
      maxWidth: { app: "480px", admin: "1440px" },
      transitionTimingFunction: { out: "cubic-bezier(0.22, 1, 0.36, 1)" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        "slide-up": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(37,99,255,0.55)" },
          "50%": { boxShadow: "0 0 0 10px rgba(37,99,255,0)" },
        },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        "ping-volt": { "75%, 100%": { transform: "scale(2.2)", opacity: "0" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.22,1,0.36,1) both",
        "slide-up": "slide-up 0.35s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-glow": "pulse-glow 2s ease-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "ping-volt": "ping-volt 1.4s cubic-bezier(0,0,0.2,1) infinite",
      },
    },
  },
  plugins: [
    // `light:` applies inside a [data-theme="light"] region unless a nested dark island overrides it.
    plugin(({ addVariant }) => addVariant("light", '[data-theme="light"] &:not([data-theme="dark"] *)')),
  ],
};

export default config;
