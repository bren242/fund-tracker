/**
 * AI Parser types — Phase 1 + Sprint 1 (month handling + collision safety)
 *
 * Whitelist of fields that can be applied to funds.json:
 *   - monthlyReturn
 *   - returns (per year)
 *   - manager
 *   - classification
 *
 * Fund name is used for MATCHING only — never overwritten.
 */

export interface ParsedField {
  key: string;
  value: string | number | null;
  confidence: number; // 0-1
}

export interface FundMatch {
  fundId: string | null;
  fundName: string | null;
  similarity: number; // 0-1
  categoryId: string | null;
}

export interface ParseDraft {
  id: string;
  createdAt: string;
  source: {
    type: "text" | "pdf" | "image";
    preview: string; // first 200 chars of input
  };
  extracted: {
    fundName: string;
    fundNameConfidence: number;
    fields: ParsedField[];
  };
  /** Report month in YYYY-MM format, null if not detected */
  reportMonth: string | null;
  /** Confidence of reportMonth detection */
  reportMonthConfidence: "high" | "low";
  match: FundMatch | null;
  status: "pending" | "applied" | "rejected";
  appliedAt?: string;
  rejectedAt?: string;
}

export interface CollisionInfo {
  field: string;
  month: string;
  existingValue: number;
  newValue: number;
}

export interface ParseLogEntry {
  id: string;
  timestamp: string;
  action: "parse" | "apply" | "reject";
  draftId: string;
  fundName: string;
  fundId: string | null;
  details: string;
  /** Sprint 1: enhanced logging fields */
  reportMonth?: string | null;
  collision?: boolean;
  collisionDecision?: "replace" | "keep" | "new";
  oldValue?: number | null;
  newValue?: number | null;
}

/** Fields allowed to be written to funds.json in Phase 1 */
export const APPLY_WHITELIST = [
  "monthlyReturn",
  "returns",
  "manager",
  "classification",
] as const;

export type ApplyableField = typeof APPLY_WHITELIST[number];
