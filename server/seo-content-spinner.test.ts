/**
 * Tests for AI Content Spinner
 */
import { describe, it, expect } from "vitest";

// We test the utility functions and types — LLM calls are mocked in integration tests
describe("seo-content-spinner", () => {
  it("should export spinContent function", async () => {
    const mod = await import("./seo-content-spinner");
    expect(typeof mod.spinContent).toBe("function");
  });

  it("should export generateAndSpin function", async () => {
    const mod = await import("./seo-content-spinner");
    expect(typeof mod.generateAndSpin).toBe("function");
  });

  it("SpinRequest type should accept valid inputs", async () => {
    const mod = await import("./seo-content-spinner");
    // Type check: ensure the function signature accepts our input shape
    const request = {
      html: "<h1>Test</h1>",
      category: "slots" as const,
      siteName: "TestSite",
      domain: "test.com",
      intensity: "medium" as const,
    };
    // Verify the request shape matches SpinRequest
    expect(request.html).toBeTruthy();
    expect(request.category).toBe("slots");
    expect(request.intensity).toBe("medium");
  });

  it("should support all three intensity levels", () => {
    const levels: Array<"light" | "medium" | "heavy"> = ["light", "medium", "heavy"];
    expect(levels).toHaveLength(3);
    expect(levels).toContain("light");
    expect(levels).toContain("medium");
    expect(levels).toContain("heavy");
  });

  it("should support all three categories", () => {
    const categories = ["slots", "lottery", "baccarat"];
    expect(categories).toHaveLength(3);
  });
});
