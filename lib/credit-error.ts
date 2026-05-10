export const CREDIT_EXHAUSTED_SENTINEL = "ANTHROPIC_CREDIT_EXHAUSTED";

export function isCreditExhaustedError(status: number, bodyText: string): boolean {
  const lower = bodyText.toLowerCase();
  return status === 402 || lower.includes("credit balance") || lower.includes("billing");
}

export function creditExhaustedBody(): { error: string; message: string } {
  return {
    error: "anthropic_credit_exhausted",
    message: "חשבון Anthropic מחייב טעינת קרדיט",
  };
}
