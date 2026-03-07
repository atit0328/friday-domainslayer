import { describe, expect, it } from "vitest";
import { CAMPAIGN_PHASES, type PhaseResult } from "./campaign-engine";

describe("CAMPAIGN_PHASES", () => {
  it("has exactly 16 phases", () => {
    expect(CAMPAIGN_PHASES).toHaveLength(16);
  });

  it("phases have sequential IDs from 0 to 15", () => {
    CAMPAIGN_PHASES.forEach((phase, i) => {
      expect(phase.id).toBe(i);
    });
  });

  it("every phase has required fields", () => {
    CAMPAIGN_PHASES.forEach((phase) => {
      expect(phase.name).toBeTruthy();
      expect(phase.icon).toBeTruthy();
      expect(phase.thaiName).toBeTruthy();
      expect(phase.description).toBeTruthy();
      expect(typeof phase.requiresWP).toBe("boolean");
    });
  });

  it("WP-required phases include On-Page, Schema, Content Creation, Internal Linking", () => {
    const wpPhases = CAMPAIGN_PHASES.filter((p) => p.requiresWP);
    const wpPhaseNames = wpPhases.map((p) => p.name);
    expect(wpPhaseNames).toContain("On-Page Optimization");
    expect(wpPhaseNames).toContain("Schema Markup");
    expect(wpPhaseNames).toContain("Content Creation");
    expect(wpPhaseNames).toContain("Internal Linking");
  });

  it("non-WP phases include Technical Audit, Keyword Research, Off-Page SEO", () => {
    const nonWpPhases = CAMPAIGN_PHASES.filter((p) => !p.requiresWP);
    const nonWpNames = nonWpPhases.map((p) => p.name);
    expect(nonWpNames).toContain("Technical Audit");
    expect(nonWpNames).toContain("Keyword Research");
    expect(nonWpNames).toContain("Off-Page SEO");
  });

  it("phase names are unique", () => {
    const names = CAMPAIGN_PHASES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("phase thaiNames are unique", () => {
    const names = CAMPAIGN_PHASES.map((p) => p.thaiName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("PhaseResult type", () => {
  it("can construct a valid PhaseResult object", () => {
    const result: PhaseResult = {
      phase: 0,
      phaseName: "Technical Audit",
      thaiName: "ตรวจสอบเทคนิค",
      status: "completed",
      actions: [{ success: true, action: "test", detail: "test detail" }],
      aiAnalysis: "Test analysis",
      detail: "Test detail",
      wpChanges: 2,
      duration: 5000,
    };
    expect(result.phase).toBe(0);
    expect(result.status).toBe("completed");
    expect(result.wpChanges).toBe(2);
    expect(result.actions).toHaveLength(1);
  });

  it("supports all valid status values", () => {
    const statuses: PhaseResult["status"][] = ["completed", "failed", "skipped"];
    statuses.forEach((status) => {
      const result: PhaseResult = {
        phase: 0,
        phaseName: "Test",
        thaiName: "ทดสอบ",
        status,
        actions: [],
        aiAnalysis: "",
        detail: "",
        wpChanges: 0,
        duration: 0,
      };
      expect(result.status).toBe(status);
    });
  });
});
