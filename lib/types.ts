export interface Fund {
  id: string;
  name: string;
  classification: string;
  startDate: string | null;
  manager: string;
  lastReportDate: string | null;
  reportingDelay?: boolean;
  monthlyReturn: number | null;
  returns: {
    ytd2026: number | null;
    y2025: number | null;
    y2024: number | null;
    y2023: number | null;
    y2022: number | null;
    y2021: number | null;
    y2020: number | null;
    y2019: number | null;
  };
  avgAnnualReturn: number | null;
  sharpe: number | null;
  stdDev: number | null;
  aumMillions: number | null;
  active?: boolean;
  currency?: "ILS" | "USD";
  monthlyReturns?: Record<string, number>;
  monthlyDirection?: "LTR" | "RTL" | null;
  lastUpdated?: string;    // "YYYY-MM" — set when indication is saved
  lastUpdatedAt?: string;  // ISO timestamp — set when indication is saved
}

export interface Category {
  id: string;
  name: string;
  parentSection: string;
  funds: Fund[];
}

export interface Benchmark {
  id: string;
  name: string;
  currency: "ILS" | "USD";
  returns: {
    ytd2026: number | null;
    y2025: number | null;
    y2024: number | null;
    y2023: number | null;
    y2022: number | null;
    y2021: number | null;
    y2020: number | null;
    y2019: number | null;
  };
  monthlyReturns?: Record<string, number>;
  active: boolean;
}

export interface FundsData {
  lastUpdated: string;
  categories: Category[];
  adminPassword?: string;
  superAdminPassword?: string;
}

export interface Indication {
  id: string;
  fundId: string;
  fundName: string;
  currency: "ILS" | "USD";
  monthReturn: number;
  ytd: number;
  reportMonth: string; // MM/YYYY
  createdAt: number;
  tenant: string;
}
