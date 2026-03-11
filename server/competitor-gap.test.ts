import { describe, it, expect } from "vitest";
import {
  getGapSummary,
  getAllAnalyses,
} from "./competitor-gap-analyzer";

describe("Competitor Gap Analyzer", () => {
  describe("getGapSummary", () => {
    it("should return summary with required fields", () => {
      const summary = getGapSummary();
      expect(summary).toHaveProperty("totalDomains");
      expect(summary).toHaveProperty("totalGaps");
      expect(summary).toHaveProperty("highOpportunity");
      expect(summary).toHaveProperty("filled");
      expect(summary).toHaveProperty("ranking");
      expect(summary).toHaveProperty("avgOpportunityScore");
    });

    it("should have numeric values", () => {
      const summary = getGapSummary();
      expect(typeof summary.totalDomains).toBe("number");
      expect(typeof summary.totalGaps).toBe("number");
      expect(typeof summary.highOpportunity).toBe("number");
      expect(typeof summary.filled).toBe("number");
      expect(typeof summary.avgOpportunityScore).toBe("number");
    });
  });

  describe("getAllAnalyses", () => {
    it("should return an array", () => {
      const analyses = getAllAnalyses();
      expect(Array.isArray(analyses)).toBe(true);
    });
  });
});
