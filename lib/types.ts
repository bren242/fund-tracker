export interface Fund {
  id: string;
  name: string;
  classification: string;
  startDate: string | null;
  manager: string;
  lastReportDate: string | null;
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
}

export interface Category {
  id: string;
  name: string;
  parentSection: string;
  funds: Fund[];
}

export interface FundsData {
  lastUpdated: string;
  categories: Category[];
  adminPassword?: string;
  superAdminPassword?: string;
}
