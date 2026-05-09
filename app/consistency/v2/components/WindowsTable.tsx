import type { WindowLabel } from "@/lib/consistency";

interface MDD { drawdownPct: number }
interface WM {
  windowLabel: WindowLabel;
  monthsCount: number;
  fundReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  informationRatio: number | null;
  monthsAboveBenchmark: { count: number; total: number };
  monthsAboveCategory:  { count: number; total: number };
  maxDrawdown: MDD;
  upCapture: number | null;
  downCapture: number | null;
  rankInCategory: number | null;
  totalInCategory: number | null;
}

interface WindowsTableProps {
  windows: Partial<Record<WindowLabel, WM | null>>;
  benchmarkShortName: string | null;
  hasBenchmark?: boolean;
}

const WIN_ORDER: WindowLabel[] = ["YTD", "12M", "24M", "36M", "lifetime"];
const WIN_HEADER: Record<WindowLabel, string> = {
  YTD:      "YTD",
  "12M":    "12 חו׳",
  "24M":    "24 חו׳",
  "36M":    "36 חו׳",
  lifetime: "כל הנתונים",
};

function fmtPct(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  const s = v.toFixed(decimals);
  return v > 0 ? `+${s}%` : `${s}%`;
}
function fmtIR(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}
function fmtCapture(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(0)}%`;
}
function fmtRatio(count: number, total: number): string {
  return total === 0 ? "—" : `${count}/${total}`;
}
function fmtRank(rank: number | null, total: number | null): string {
  if (rank == null || total == null) return "—";
  return `${rank}/${total + 1}`;
}

type CellClass = "positive" | "negative" | "neutral" | "muted";
function numClass(v: number | null): CellClass {
  if (v == null) return "muted";
  if (v > 0) return "positive";
  if (v < 0) return "negative";
  return "neutral";
}
function irClass(v: number | null): CellClass {
  if (v == null) return "muted";
  if (v >= 0.5) return "positive";
  if (v < 0)    return "negative";
  return "neutral";
}
function captureClass(v: number | null, isDown: boolean): CellClass {
  if (v == null) return "muted";
  if (!isDown) return v >= 95 ? "positive" : v >= 70 ? "neutral" : "negative";
  return v <= 80 ? "positive" : v <= 100 ? "neutral" : "negative";
}

interface RowDef {
  label: string;
  sublabel?: string;
  tooltip?: string;
  bmOnly?: boolean;
  cells: (w: WM) => { value: string; cls: CellClass };
}

export default function WindowsTable({ windows, benchmarkShortName, hasBenchmark = true }: WindowsTableProps) {
  const cols = WIN_ORDER.map((wl) => ({ wl, w: windows[wl] ?? null }));
  const hasAnyData = cols.some((c) => c.w != null);
  if (!hasAnyData) return null;

  const rows: RowDef[] = [
    {
      label: "תשואה מצטברת",
      cells: (w) => ({ value: fmtPct(w.fundReturn), cls: numClass(w.fundReturn) }),
    },
    {
      label: benchmarkShortName ?? "",
      bmOnly: true,
      cells: (w) => ({ value: fmtPct(w.benchmarkReturn), cls: numClass(w.benchmarkReturn) }),
    },
    {
      label: "עודף על בנצ׳מרק",
      bmOnly: true,
      cells: (w) => ({ value: fmtPct(w.excessReturn), cls: numClass(w.excessReturn) }),
    },
    {
      label: "Information Ratio",
      bmOnly: true,
      tooltip: "עודף התשואה החודשי הממוצע על הבנצ׳מרק, מחולק בסטיית התקן שלו. IR מעל 0.5 = עקביות גבוהה. IR מתחת לאפס = הקרן הפסידה בממוצע לבנצ׳מרק.",
      cells: (w) => ({ value: fmtIR(w.informationRatio), cls: irClass(w.informationRatio) }),
    },
    {
      label: "מעל בנצ׳מרק",
      bmOnly: true,
      sublabel: "חודשים",
      cells: (w) => ({
        value: fmtRatio(w.monthsAboveBenchmark.count, w.monthsAboveBenchmark.total),
        cls: "neutral",
      }),
    },
    {
      label: "מעל קטגוריה",
      sublabel: "חודשים",
      cells: (w) => ({
        value: fmtRatio(w.monthsAboveCategory.count, w.monthsAboveCategory.total),
        cls: "neutral",
      }),
    },
    {
      label: "ירידה מקסימלית",
      tooltip: "הירידה המרבית מנקודת שיא לנקודת שפל בתקופה. ערך נמוך יותר (פחות שלילי) = פחות נזק למשקיע.",
      cells: (w) => ({
        value: w.maxDrawdown.drawdownPct !== 0 ? fmtPct(w.maxDrawdown.drawdownPct) : "—",
        cls: w.maxDrawdown.drawdownPct !== 0 ? "negative" : "muted",
      }),
    },
    {
      label: "Up Capture",
      bmOnly: true,
      tooltip: "אחוז מתשואת הבנצ׳מרק שהשיגה הקרן בחודשים שבהם הבנצ׳מרק עלה. מעל 100% — הקרן עלתה יותר מהבנצ׳מרק.",
      cells: (w) => ({ value: fmtCapture(w.upCapture), cls: captureClass(w.upCapture, false) }),
    },
    {
      label: "Down Capture",
      bmOnly: true,
      tooltip: "אחוז מירידת הבנצ׳מרק שספגה הקרן בחודשים שבהם הבנצ׳מרק ירד. מתחת ל-100% — הגנה טובה יותר בירידות.",
      cells: (w) => ({ value: fmtCapture(w.downCapture), cls: captureClass(w.downCapture, true) }),
    },
    {
      label: "דירוג בקטגוריה",
      bmOnly: true,
      sublabel: "לפי IR",
      tooltip: "מיקום הקרן בין כלל הקרנות בקטגוריה לפי IR, מהגבוה לנמוך. דירוג 1 = ה-IR הגבוה ביותר בקטגוריה.",
      cells: (w) => ({
        value: fmtRank(w.rankInCategory, w.totalInCategory),
        cls: w.rankInCategory != null && w.totalInCategory != null && w.rankInCategory === 1
          ? "positive" : "neutral",
      }),
    },
  ];

  const visibleRows = hasBenchmark ? rows : rows.filter((r) => !r.bmOnly);

  return (
    <div className="v2-wtable-wrap">
      <table className="v2-wtable">
        <thead>
          <tr>
            <th className="v2-wth-metric" />
            {cols.map(({ wl, w }) => (
              <th key={wl} className={`v2-wth${w ? "" : " v2-wth-empty"}`}>
                <span className="v2-wth-label">{WIN_HEADER[wl]}</span>
                {w && <span className="v2-wth-months">{w.monthsCount} חו׳</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.label} className="v2-wtr">
              <td className="v2-wtd-label">
                {row.label}
                {row.sublabel && <span className="v2-wtd-sublabel">{row.sublabel}</span>}
                {row.tooltip && (
                  <span className="v2-info-icon">
                    ⓘ
                    <span className="v2-tooltip">
                      {row.tooltip}
                      <a href="#v2-glossary" className="v2-tooltip-link">ראה מילון מלא ↓</a>
                    </span>
                  </span>
                )}
              </td>
              {cols.map(({ wl, w }) => {
                if (!w) return <td key={wl} className="v2-wtd v2-wtd-empty">—</td>;
                const { value, cls } = row.cells(w);
                return (
                  <td key={wl} className={`v2-wtd v2-wtd-${cls}`}>{value}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
