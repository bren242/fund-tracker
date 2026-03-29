import { Category, Fund } from "./types";

/**
 * Report groups — based on the exact PDF presentation structure.
 *
 * PDF section headers (extracted verbatim):
 *   Page 1: קרנות גידור ישראל (super-header)
 *     - אג"ח - חשיפה נמוכה למניות (bond-hedged)
 *     - Multi Strategy - חשיפה בינונית למניות (multi-strategy)
 *     - לונג - חשיפה גבוהה למניות (equity-hedged)
 *   Page 2:
 *     - אגד קרנות ישראלי (blended)
 *     - אחר (real-estate)
 *     - קרנות גידור מניות ואג"ח חו"ל (open-trust)
 *     - קרנות נאמנות סגורות (closed-trust) — Excel only
 *     - קרנות חוב פרייבט (private-debt) — Excel only
 *     - קרנות CLO (clo) — Excel only
 */

export interface ReportGroup {
  id: string;
  label: string;
  categoryIds: string[];
}

export const REPORT_GROUPS: ReportGroup[] = [
  {
    id: "hedge-bond",
    label: "אג\"ח - חשיפה נמוכה למניות",
    categoryIds: ["bond-hedged"],
  },
  {
    id: "hedge-multi",
    label: "Multi Strategy - חשיפה בינונית למניות",
    categoryIds: ["multi-strategy"],
  },
  {
    id: "hedge-equity",
    label: "לונג - חשיפה גבוהה למניות",
    categoryIds: ["equity-hedged"],
  },
  {
    id: "blend",
    label: "אגד קרנות ישראלי",
    categoryIds: ["blended"],
  },
  {
    id: "other",
    label: "אחר",
    categoryIds: ["real-estate"],
  },
  {
    id: "intl",
    label: "קרנות גידור מניות ואג\"ח חו\"ל",
    categoryIds: ["open-trust"],
  },
  {
    id: "closed-trust",
    label: "קרנות נאמנות סגורות",
    categoryIds: ["closed-trust"],
  },
  {
    id: "private-debt",
    label: "קרנות חוב פרייבט",
    categoryIds: ["private-debt"],
  },
  {
    id: "clo",
    label: "קרנות CLO",
    categoryIds: ["clo"],
  },
];

/** Collect all funds belonging to a report group */
export function fundsForGroup(
  group: ReportGroup,
  categories: Category[],
): Fund[] {
  const idSet = new Set(group.categoryIds);
  return categories
    .filter((c) => idSet.has(c.id))
    .flatMap((c) => c.funds);
}
