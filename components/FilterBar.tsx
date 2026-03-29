"use client";

import { FilterOptions } from "@/lib/useFilters";

const ALL = "הכל";

interface FilterBarProps {
  group: string;
  category: string;
  classification: string;
  search: string;
  options: FilterOptions;
  activeFilterCount: number;
  onGroupChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onClassificationChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onClearAll: () => void;
  accentColor?: string;
}

export default function FilterBar({
  group,
  category,
  classification,
  search,
  options,
  activeFilterCount,
  onGroupChange,
  onCategoryChange,
  onClassificationChange,
  onSearchChange,
  onClearAll,
  accentColor,
}: FilterBarProps) {
  const accent = accentColor || "var(--accent)";
  const hasGroupOrCat = group !== ALL || category !== ALL;
  // Show chips when filtered down (group/category selected) OR when there are few enough to show cleanly
  const showClassifications = options.classifications.length >= 2 && (hasGroupOrCat || options.classifications.length <= 10);
  const hasFilters = activeFilterCount > 0;

  return (
    <div className="no-print" style={{ maxWidth: 1600, margin: "0 auto" }}>
      {/* ── Main filter row ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "nowrap",
        padding: "12px 24px 0",
        overflowX: "auto",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "0 0 220px", minWidth: 160 }}>
          <span style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: 13, color: "var(--text-muted)", pointerEvents: "none",
          }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="חיפוש קרן, מנהל או סיווג..."
            style={{
              width: "100%",
              padding: "8px 14px 8px 14px",
              paddingRight: 34,
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-input)",
              outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = accent;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}18`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              style={{
                position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", fontSize: 14, padding: 2, lineHeight: 1,
              }}
            >✕</button>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, backgroundColor: "var(--border)", flexShrink: 0 }} />

        {/* Group dropdown */}
        <FilterSelect
          label="קבוצה"
          value={group}
          options={options.groups}
          onChange={onGroupChange}
          accent={accent}
          isActive={group !== ALL}
        />

        {/* Category dropdown */}
        <FilterSelect
          label="קטגוריה"
          value={category}
          options={options.categories}
          onChange={onCategoryChange}
          accent={accent}
          isActive={category !== ALL}
        />

        {/* Active filter count + reset */}
        {hasFilters && (
          <button
            onClick={onClearAll}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: 8,
              border: `1px solid ${accent}30`,
              backgroundColor: `${accent}08`,
              color: accent,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = `${accent}15`;
              e.currentTarget.style.borderColor = `${accent}50`;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = `${accent}08`;
              e.currentTarget.style.borderColor = `${accent}30`;
            }}
          >
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18, borderRadius: "50%",
              backgroundColor: accent, color: "#fff",
              fontSize: 10, fontWeight: 700, lineHeight: 1,
            }}>
              {activeFilterCount}
            </span>
            איפוס הכל
          </button>
        )}
      </div>

      {/* ── Classification chips row ── */}
      {showClassifications && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "8px 24px 0",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
            סיווג:
          </span>

          {/* "All" chip */}
          <ClassificationChip
            label="הכל"
            isActive={classification === ALL}
            onClick={() => onClassificationChange(ALL)}
            accent={accent}
          />

          {options.classifications.map((cls) => (
            <ClassificationChip
              key={cls}
              label={cls}
              isActive={classification === cls}
              onClick={() => onClassificationChange(cls)}
              accent={accent}
            />
          ))}
        </div>
      )}

      {/* Bottom border */}
      <div style={{ height: 1, backgroundColor: "var(--border)", margin: "12px 0 0", opacity: 0.6 }} />
    </div>
  );
}


/* ── Premium dropdown select ── */
function FilterSelect({
  label,
  value,
  options,
  onChange,
  accent,
  isActive,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  accent: string;
  isActive: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <label style={{
        fontSize: 11,
        color: "var(--text-muted)",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            padding: "7px 28px 7px 12px",
            borderRadius: 8,
            border: isActive ? `1.5px solid ${accent}` : "1px solid var(--border)",
            fontSize: 12,
            fontWeight: isActive ? 600 : 400,
            color: isActive ? accent : "var(--text-primary)",
            backgroundColor: isActive ? `${accent}06` : "var(--bg-input)",
            cursor: "pointer",
            minWidth: 140,
            outline: "none",
            appearance: "none",
            WebkitAppearance: "none",
            transition: "all 0.15s",
          }}
        >
          <option value={ALL}>{ALL}</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {/* Custom chevron */}
        <span style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          fontSize: 10,
          color: isActive ? accent : "var(--text-muted)",
          lineHeight: 1,
        }}>
          ▾
        </span>
      </div>
    </div>
  );
}


/* ── Classification chip ── */
function ClassificationChip({
  label,
  isActive,
  onClick,
  accent,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 20,
        border: isActive ? `1.5px solid ${accent}` : "1px solid var(--border)",
        backgroundColor: isActive ? accent : "transparent",
        color: isActive ? "#fff" : "var(--text-secondary)",
        fontSize: 11,
        fontWeight: isActive ? 600 : 400,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.18s",
        lineHeight: 1.4,
      }}
      onMouseOver={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = `${accent}80`;
          e.currentTarget.style.backgroundColor = `${accent}0A`;
          e.currentTarget.style.color = accent;
        }
      }}
      onMouseOut={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
    >
      {label}
    </button>
  );
}
