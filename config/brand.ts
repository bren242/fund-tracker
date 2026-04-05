export interface AppFeatures {
  comparison: boolean;
  comparisonMode?: "basic" | "advanced";
  chartPage: boolean;
  aiParser?: boolean;
  mobileUpload?: boolean;
  desktopUpload?: boolean;
  excelUpload?: boolean;
  manualUpload?: boolean;
  emailUpload?: boolean;
  benchmarks?: boolean;
  dataCompletion?: boolean;
}

export interface BrandConfig {
  name: string;
  fullName: string;
  logo: string;
  logoLight: string;
  logoDark: string;

  primaryColor: string;
  secondaryColor: string;
  accentColor: string;

  mainTitle: string;

  subtitleMode: "auto" | "custom";
  customSubtitle: string;

  footerDisclaimer: string;

  showCredit: boolean;
  creditText: string;

  version: string;

  defaultAppearance: "light" | "dark";

  features: AppFeatures;
}

export const DEFAULT_BRAND: BrandConfig = {
  name: "",
  fullName: "",
  logo: "",
  logoLight: "",
  logoDark: "",

  primaryColor: "#1a365d",
  secondaryColor: "#2d4a7a",
  accentColor: "#c8a96b",

  mainTitle: "מעקב קרנות השקעה",

  subtitleMode: "auto",
  customSubtitle: "",

  footerDisclaimer: "",

  showCredit: false,
  creditText: "",

  version: "1.0",

  defaultAppearance: "light",

  features: {
    comparison: true,
    chartPage: true,
  },
};
