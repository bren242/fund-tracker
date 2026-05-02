/**
 * lib/consistency-v2/ai-caller.ts
 *
 * Thin wrapper around Anthropic REST API with JSON-mode prefill + jsonrepair fallback.
 * Returns parsed output or null on any failure (never throws).
 */

import { jsonrepair } from "jsonrepair";

const MODEL    = "claude-sonnet-4-5";
const TEMP     = 0.4;
const TIMEOUT  = 30_000;

export async function callAI<T>(
  systemPrompt: string,
  userMessage:  string,
  maxTokens = 2000
): Promise<T | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: maxTokens,
        temperature: TEMP,
        system:     systemPrompt,
        messages: [
          { role: "user",      content: userMessage },
          { role: "assistant", content: "{" },   // JSON-mode prefill
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (err) {
    console.error("[ai-caller] fetch error:", err);
    return null;
  }

  if (!res.ok) {
    console.error("[ai-caller] API error:", res.status, await res.text().catch(() => ""));
    return null;
  }

  let body: { content?: { type: string; text?: string }[]; stop_reason?: string };
  try {
    body = await res.json();
  } catch {
    return null;
  }

  const raw = "{" + (body.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Try jsonrepair fallback
    try {
      return JSON.parse(jsonrepair(raw)) as T;
    } catch (e) {
      console.error("[ai-caller] JSON parse failed after repair:", e);
      return null;
    }
  }
}
