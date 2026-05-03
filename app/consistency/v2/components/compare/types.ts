// Shared types for compare view components

export interface CmpMDD {
  drawdownPct: number;
  peakMonthKey: string | null;
  troughMonthKey: string | null;
  durationMonths: number;
  recoveryMonths: number | null;
  monthsAvailable: number;
}

export interface CmpWM {
  windowLabel: string;
  monthsCount: number;
  fundReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  informationRatio: number | null;
  monthsAboveBenchmark: { count: number; total: number };
  monthsAboveCategory:  { count: number; total: number };
  maxDrawdown: CmpMDD;
  upCapture: number | null;
  downCapture: number | null;
  rankInCategory: number | null;
  totalInCategory: number | null;
}

export interface CmpFund {
  id: string;
  name: string;
  inceptionMonth: string;
  monthsActive: number;
  windows: {
    YTD:   CmpWM | null;
    "12M": CmpWM | null;
    "24M": CmpWM | null;
    "36M": CmpWM | null;
  };
  itd: CmpWM | null;
}

export interface CompareData {
  category: { id: string; label: string; benchmarkLabel: string };
  asOfMonth: string;
  asOfMonthLabel: string;
  funds: CmpFund[];
}

export type CmpWindow = "YTD" | "12M" | "24M" | "36M";

// Accent color per fund position
export const FUND_ACCENTS = ["#1b3a2f", "#b8975a", "#2c2c2a", "#888880"] as const;
export const FUND_ACCENT_LABELS = ["ירוק", "זהב", "שחור", "אפור"] as const;
