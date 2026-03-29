export function pct(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return (value * 100).toFixed(2) + "%";
}

export function pctSigned(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const v = (value * 100).toFixed(2);
  return value >= 0 ? v + "%" : v + "%";
}

export function num(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(2);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("he-IL");
}

/** Format date as MM/YYYY for report display. Never returns empty. */
export function formatReportDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // Try parsing MM/YYYY or similar formats already in the string
    if (/^\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr;
    return dateStr;
  }
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${year}`;
}

export function returnColor(value: number | null): string {
  if (value === null || value === undefined) return "";
  if (value > 0) return "return-positive";
  if (value < 0) return "return-negative";
  return "";
}

/** For inline style usage */
export function returnColorInline(value: number | null): string {
  if (value === null || value === undefined) return "inherit";
  if (value > 0) return "var(--positive)";
  if (value < 0) return "var(--negative)";
  return "inherit";
}
