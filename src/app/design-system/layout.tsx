import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design system",
  description: "The HITTERS component library: brand marks, colour tokens, typography and every interface pattern the product is built from.",
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
