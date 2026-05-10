import { describe, it, expect } from "vitest";
import {
  isCreditExhaustedError,
  CREDIT_EXHAUSTED_SENTINEL,
  creditExhaustedBody,
} from "../lib/credit-error";

describe("isCreditExhaustedError", () => {
  it("detects HTTP 402 status regardless of body", () => {
    expect(isCreditExhaustedError(402, "")).toBe(true);
    expect(isCreditExhaustedError(402, "some random body")).toBe(true);
  });

  it("detects 'credit balance' in body text (case-insensitive)", () => {
    expect(isCreditExhaustedError(400, "Your credit balance is too low")).toBe(true);
    expect(isCreditExhaustedError(500, "CREDIT BALANCE exhausted")).toBe(true);
  });

  it("detects 'billing' in body text (case-insensitive)", () => {
    expect(isCreditExhaustedError(400, "billing error occurred")).toBe(true);
    expect(isCreditExhaustedError(500, "BILLING account inactive")).toBe(true);
  });

  it("does not trigger on unrelated error bodies", () => {
    expect(isCreditExhaustedError(500, "Internal server error")).toBe(false);
    expect(isCreditExhaustedError(429, "Rate limit exceeded")).toBe(false);
    expect(isCreditExhaustedError(503, "Service unavailable")).toBe(false);
  });

  it("does not trigger on empty 200 body", () => {
    expect(isCreditExhaustedError(200, "")).toBe(false);
  });
});

describe("creditExhaustedBody", () => {
  it("returns correct error code for frontend detection", () => {
    const body = creditExhaustedBody();
    expect(body.error).toBe("anthropic_credit_exhausted");
  });

  it("returns a non-empty Hebrew message", () => {
    const body = creditExhaustedBody();
    expect(body.message.length).toBeGreaterThan(0);
  });
});

describe("CREDIT_EXHAUSTED_SENTINEL", () => {
  it("has the expected value used by route handlers", () => {
    expect(CREDIT_EXHAUSTED_SENTINEL).toBe("ANTHROPIC_CREDIT_EXHAUSTED");
  });
});
