/**
 * Centralized Anthropic API configuration.
 * Update model strings here only — referenced from all callers.
 *
 * Last updated: May 2026 (Sonnet 4.6 release)
 */

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";

/**
 * Models in production use.
 * Update strings here when migrating to new model versions.
 */
export const CLAUDE_MODELS = {
  /** Sonnet 4.6 — primary model for PDF/image parsing and text extraction */
  SONNET: "claude-sonnet-4-6",
  /** Opus 4.7 — reserved for complex reasoning tasks (currently unused) */
  OPUS: "claude-opus-4-7",
  /** Haiku 4.5 — reserved for high-volume fast tasks (currently unused) */
  HAIKU: "claude-haiku-4-5-20251001",
} as const;
