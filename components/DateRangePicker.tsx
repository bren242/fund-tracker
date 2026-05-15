"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  TimeRange,
  PRESETS,
  PRESET_LABELS,
  MONTHS_HE,
  DEFAULT_RANGE,
  rangeToDateRange,
  formatMonthHe,
} from "@/lib/dateRange";

export interface DateRangeValue {
  range: TimeRange;
  from?: string;
  to?: string;
}

interface Props {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  latestAvailableMonth: string | null;
  minMonth?: string;
  syncToUrl?: boolean;
}

// ── inner component (needs Suspense for useSearchParams) ──────────────────────

function DateRangePickerInner({
  value,
  onChange,
  latestAvailableMonth,
  minMonth = "2019-01",
  syncToUrl = true,
}: Props) {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const pathname    = usePathname();

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selecting,   setSelecting]   = useState<"from" | "to">("from");
  const [hoverMonth,  setHoverMonth]  = useState<string | null>(null);
  const [popoverYear, setPopoverYear] = useState<number>(() => {
    const ref = value.to || latestAvailableMonth;
    return ref ? parseInt(ref.split("-")[0]) : new Date().getFullYear();
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const urlSyncedRef = useRef(false);

  // URL → state (on mount only, once)
  useEffect(() => {
    if (!syncToUrl || urlSyncedRef.current) return;
    urlSyncedRef.current = true;
    const rp = searchParams.get("range") as TimeRange | null;
    if (!rp || !PRESETS.includes(rp)) return;
    const fp = searchParams.get("from") ?? undefined;
    const tp = searchParams.get("to") ?? undefined;
    if (rp === value.range && fp === value.from && tp === value.to) return;
    onChange({ range: rp, from: fp, to: tp });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // state → URL
  function writeUrl(next: DateRangeValue) {
    if (!syncToUrl) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next.range);
    if (next.range === "custom" && next.from && next.to) {
      params.set("from", next.from);
      params.set("to",   next.to);
    } else {
      params.delete("from");
      params.delete("to");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function emit(next: DateRangeValue) {
    onChange(next);
    writeUrl(next);
  }

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setPopoverOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [popoverOpen]);

  // Close popover on Escape
  useEffect(() => {
    if (!popoverOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setPopoverOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popoverOpen]);

  const maxYear = latestAvailableMonth
    ? parseInt(latestAvailableMonth.split("-")[0])
    : new Date().getFullYear();
  const minYear = parseInt(minMonth.split("-")[0]);

  // ── Preset click ────────────────────────────────────────────────────────────

  function handlePresetClick(preset: TimeRange) {
    if (preset === "custom") {
      if (!popoverOpen) {
        // Prime the popover: seed from/to from the current preset range
        if (value.range !== "custom") {
          const cur = rangeToDateRange(value.range, latestAvailableMonth);
          const seed = cur ?? { from: "2024-01", to: latestAvailableMonth ?? "2026-01" };
          emit({ range: "custom", from: seed.from, to: seed.to });
          // Show the "to" year so user sees the end of the seeded range
          setPopoverYear(parseInt(seed.to.split("-")[0]));
          setSelecting("from");
        } else {
          // Already custom: open at "to" year for easy re-selection
          if (value.to) setPopoverYear(parseInt(value.to.split("-")[0]));
          setSelecting("from");
        }
      }
      setPopoverOpen(p => !p);
      return;
    }
    setPopoverOpen(false);
    emit({ range: preset });
  }

  // ── Month click in popover ──────────────────────────────────────────────────

  function handleMonthClick(ym: string) {
    const { from, to } = value;
    const hasComplete = from && to;

    if (!from || hasComplete) {
      // Start a new range selection
      emit({ range: "custom", from: ym, to: undefined });
      setSelecting("to");
    } else {
      // Second click: commit range
      const [f, t] = ym >= from ? [from, ym] : [ym, from];
      emit({ range: "custom", from: f, to: t });
      setSelecting("from");
      setPopoverOpen(false);
    }
  }

  // ── Month state helpers ─────────────────────────────────────────────────────

  function getMonthState(ym: string) {
    const { from, to } = value;
    const isFrom     = ym === from;
    const isTo       = ym === to;
    const isDisabled = ym > (latestAvailableMonth ?? "9999-12") || ym < minMonth;

    let isInRange = false;
    if (from && to) {
      isInRange = ym > from && ym < to;
    } else if (from && !to && hoverMonth) {
      const [lo, hi] = from <= hoverMonth ? [from, hoverMonth] : [hoverMonth, from];
      isInRange = ym > lo && ym < hi;
    }

    const isEdge = isFrom || isTo ||
      (!to && hoverMonth && (ym === hoverMonth) && from !== undefined);

    return { isFrom, isTo, isInRange, isEdge, isDisabled };
  }

  // ── Summary text ────────────────────────────────────────────────────────────

  const { from, to } = value;
  const summaryText = from && to
    ? `${formatMonthHe(from)} — ${formatMonthHe(to)}`
    : from
    ? `${formatMonthHe(from)} — ...`
    : null;

  const instructionText = (!from || (from && to))
    ? "בחר חודש התחלה"
    : "בחר חודש סיום";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }} dir="rtl">

      {/* ── Preset pills ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {PRESETS.map((preset) => {
          const isActive = value.range === preset;
          return (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                border: `0.5px solid ${isActive ? "#1B3A2F" : "rgba(27,58,47,0.2)"}`,
                backgroundColor: isActive ? "#1B3A2F" : "transparent",
                color: isActive ? "#fff" : "rgba(27,58,47,0.7)",
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {PRESET_LABELS[preset]}
            </button>
          );
        })}
      </div>

      {/* ── Custom popover ─────────────────────────────────────────────────── */}
      {value.range === "custom" && popoverOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 200,
            backgroundColor: "#fff",
            border: "0.5px solid rgba(27,58,47,0.15)",
            borderRadius: 12,
            padding: "14px 16px",
            width: 300,
            boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
          }}
          dir="rtl"
        >
          {/* Year navigation — LTR so arrows stay consistent */}
          <div
            style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
              direction: "ltr",
            }}
          >
            <button
              onClick={() => setPopoverYear(y => Math.min(y + 1, maxYear))}
              disabled={popoverYear >= maxYear}
              aria-label="שנה הבאה"
              style={yearNavBtn(popoverYear >= maxYear)}
            >→</button>

            <span style={{ fontSize: 15, fontWeight: 600, color: "#1B3A2F", letterSpacing: 0.5 }}>
              {popoverYear}
            </span>

            <button
              onClick={() => setPopoverYear(y => Math.max(y - 1, minYear))}
              disabled={popoverYear <= minYear}
              aria-label="שנה קודמת"
              style={yearNavBtn(popoverYear <= minYear)}
            >←</button>
          </div>

          {/* Instruction */}
          <div style={{
            fontSize: 11, color: "rgba(27,58,47,0.5)",
            textAlign: "center", marginBottom: 10,
          }}>
            {instructionText}
          </div>

          {/* Month grid — 4×3, LTR order */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 2,
            direction: "ltr",
          }}>
            {MONTHS_HE.map((name, idx) => {
              const mm = String(idx + 1).padStart(2, "0");
              const ym = `${popoverYear}-${mm}`;
              const { isFrom, isTo, isInRange, isDisabled } = getMonthState(ym);

              let bg        = "transparent";
              let color     = "#1B3A2F";
              let fontWeight: number = 400;

              if (isFrom)        { bg = "#1B3A2F"; color = "#fff"; fontWeight = 600; }
              else if (isTo)     { bg = "#B8975A"; color = "#fff"; fontWeight = 600; }
              else if (isInRange){ bg = "rgba(27,58,47,0.08)"; }
              if (isDisabled)    { color = "rgba(27,58,47,0.22)"; bg = "transparent"; fontWeight = 400; }

              return (
                <button
                  key={ym}
                  onClick={() => { if (!isDisabled) handleMonthClick(ym); }}
                  onMouseEnter={() => { if (!isDisabled) setHoverMonth(ym); }}
                  onMouseLeave={() => setHoverMonth(null)}
                  disabled={isDisabled}
                  style={{
                    padding: "10px 0",
                    border: "none",
                    borderRadius: 6,
                    backgroundColor: bg,
                    color,
                    fontWeight,
                    fontSize: 11,
                    cursor: isDisabled ? "default" : "pointer",
                    transition: "background 0.1s",
                    textAlign: "center",
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>

          {/* Footer: summary + clear */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 14,
            paddingTop: 12,
            borderTop: "0.5px solid rgba(27,58,47,0.1)",
          }}>
            <span style={{ fontSize: 11, color: "rgba(27,58,47,0.55)", direction: "rtl" }}>
              {summaryText ?? "לא נבחרה תקופה"}
            </span>
            <button
              onClick={() => { emit({ range: DEFAULT_RANGE }); setPopoverOpen(false); setSelecting("from"); }}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 5,
                border: "0.5px solid rgba(27,58,47,0.2)",
                background: "transparent", color: "rgba(27,58,47,0.55)",
                cursor: "pointer",
              }}
            >
              נקה
            </button>
          </div>
        </div>
      )}

      {/* fade-in animation */}
      <style>{`
        @keyframes drp-in { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function yearNavBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 6, border: "none",
    background: disabled ? "transparent" : "rgba(27,58,47,0.06)",
    color: disabled ? "rgba(27,58,47,0.2)" : "#1B3A2F",
    cursor: disabled ? "default" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, fontWeight: 600, transition: "background 0.12s",
    lineHeight: 1,
  };
}

// ── export (Suspense wrapper for useSearchParams) ─────────────────────────────

export default function DateRangePicker(props: Props) {
  return (
    <Suspense fallback={null}>
      <DateRangePickerInner {...props} />
    </Suspense>
  );
}
