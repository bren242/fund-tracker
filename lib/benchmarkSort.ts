import { Benchmark } from "./types";

const CATEGORY_ORDER: Record<string, number> = {
  "מדדי מניות ישראל": 1,
  'מדדי אג"ח ישראל': 2,
  'מדדי חו"ל': 3,
};

const ID_PRIORITY: Record<string, number> = {
  "bm-ta125": 1,
  "bm-sme60": 2,
  "bm-agach-klali": 1,
  "bm-telbond-maagar": 2,
  "bm-sp500": 1,
  "bm-nasdaq100": 2,
};

export function sortBenchmarks(bms: Benchmark[]): Benchmark[] {
  return [...bms].sort((a, b) => {
    const catA = CATEGORY_ORDER[a.category ?? ""] ?? 99;
    const catB = CATEGORY_ORDER[b.category ?? ""] ?? 99;
    if (catA !== catB) return catA - catB;
    return (ID_PRIORITY[a.id] ?? 99) - (ID_PRIORITY[b.id] ?? 99);
  });
}
