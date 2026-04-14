export const tokens = {
  colors: {
    primary: "#1B3A2F",
    accent: "#B8975A",
    bg: "#fbfbfd",
    bgSection: "#f7f7f9",
    positive: "#248a3d",
    negative: "#ff3b30",
    hover: "#eef2f0",
    text: "#1d1d1f",
    textMuted: "#888888",
    border: "#ebebeb",
  },
  typography: {
    fundName: { fontSize: 17, fontWeight: 500, letterSpacing: "-0.4px" },
    periodReturn: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" },
    sectionHeader: { fontSize: 11, letterSpacing: "1.5px" },
    columnHeader: { fontSize: 10, letterSpacing: "1.2px" },
    navTab: { fontSize: 14 },
    subTab: { fontSize: 13 },
  },
  spacing: {
    cellPadding: "15px 16px",
    headerPadding: "12px 16px",
  },
  animation: {
    fast: "0.12s ease",
    medium: "0.15s ease",
  },
  header: {
    topBarHeight: 52,
    navBarHeight: 44,
    subBarHeight: 36,
  },
} as const
