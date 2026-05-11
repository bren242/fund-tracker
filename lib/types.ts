export interface Fund {
  id: string;
  name: string;
  classification: string;
  startDate: string | null;
  manager: string;
  lastUpdated: string | null;   // "YYYY-MM" — data month (single source of truth for update date)
  lastUpdatedAt?: string;       // ISO timestamp — write time, used for staleness guard
  delayed?: boolean;
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
  monthlyReturns2026?: Record<string, number>; // keys: "01".."12", values: decimal (0.012 = 1.2%)
  monthlyDirection?: "LTR" | "RTL" | null;
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
  lastUpdated: string;  // "YYYY-MM" — data month of the tenant's latest update
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
