import { describe, it, expect } from "vitest";
import { buildFilterParams } from "../lib/useFilters";

const ALL = "הכל";

describe("buildFilterParams", () => {
  it("sets group and category atomically", () => {
    const current = new URLSearchParams();
    const result = buildFilterParams(current, { group: "קרנות גידור ישראל", category: ALL }, ALL);
    expect(result.get("group")).toBe("קרנות גידור ישראל");
    expect(result.has("category")).toBe(false);
  });

  it("ALL value deletes the param", () => {
    const current = new URLSearchParams("group=A&category=B");
    const result = buildFilterParams(current, { group: ALL, category: ALL }, ALL);
    expect(result.has("group")).toBe(false);
    expect(result.has("category")).toBe(false);
  });

  it("empty string deletes the param", () => {
    const current = new URLSearchParams("group=A");
    const result = buildFilterParams(current, { group: "" }, ALL);
    expect(result.has("group")).toBe(false);
  });

  it("maps classification to cls URL key", () => {
    const current = new URLSearchParams();
    const result = buildFilterParams(current, { classification: "לונג מניות" }, ALL);
    expect(result.get("cls")).toBe("לונג מניות");
    expect(result.has("classification")).toBe(false);
  });

  it("ALL classification deletes cls param", () => {
    const current = new URLSearchParams("cls=לונג+מניות");
    const result = buildFilterParams(current, { classification: ALL }, ALL);
    expect(result.has("cls")).toBe(false);
  });

  it("preserves unrelated params", () => {
    const current = new URLSearchParams("client=green&q=search");
    const result = buildFilterParams(current, { group: "קרנות גידור ישראל" }, ALL);
    expect(result.get("client")).toBe("green");
    expect(result.get("q")).toBe("search");
    expect(result.get("group")).toBe("קרנות גידור ישראל");
  });

  it("does not mutate the input URLSearchParams", () => {
    const current = new URLSearchParams("group=A");
    buildFilterParams(current, { group: "B" }, ALL);
    expect(current.get("group")).toBe("A");
  });
});
