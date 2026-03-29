/** Darken a hex color by a factor (0 = black, 1 = unchanged) */
export function darkenHex(hex: string, factor: number = 0.5): string {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.substring(0, 2), 16) * factor);
  const g = Math.round(parseInt(h.substring(2, 4), 16) * factor);
  const b = Math.round(parseInt(h.substring(4, 6), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Convert hex to rgba string */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Build CSS custom properties object from brand colors */
export function brandCssVars(primaryColor: string, accentColor: string): Record<string, string> {
  return {
    "--bg-section": primaryColor,
    "--bg-super": darkenHex(primaryColor, 0.4),
    "--accent": accentColor,
    "--accent-hover": darkenHex(accentColor, 0.85),
    "--ring": hexToRgba(primaryColor, 0.3),
  };
}
