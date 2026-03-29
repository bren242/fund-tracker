"use client";

import { BrandConfig } from "@/config/brand";

/**
 * Renders the correct logo variant based on context.
 * - variant="dark"  → uses logoDark (for dark backgrounds)
 * - variant="light" → uses logoLight (for light backgrounds, login, print)
 * - Falls back through logoDark → logoLight → logo
 * - Returns nothing if no logo URL is configured
 *
 * Responsive: uses max-height + width:auto + object-fit:contain.
 */
export default function BrandLogo({
  brand,
  height = 32,
  variant,
  style,
}: {
  brand: BrandConfig;
  height?: number;
  variant?: "light" | "dark";
  style?: React.CSSProperties;
}) {
  const isDarkBg = variant === "dark";
  const src = isDarkBg
    ? (brand.logoDark || brand.logoLight || brand.logo)
    : (brand.logoLight || brand.logoDark || brand.logo);

  // No logo configured — render nothing
  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={brand.name || ""}
      style={{
        maxHeight: height,
        width: "auto",
        objectFit: "contain",
        display: "block",
        ...style,
      }}
    />
  );
}
