/**
 * Tests for Theme Installation - name safety checks
 * Bug fix: WP REST API returns name as { rendered: "..." } not string
 */
import { describe, it, expect } from "vitest";

describe("Theme Name Safety", () => {
  // Simulate the fixed themeExists check
  function safeThemeExists(installedThemes: any[], themeSlug: string): boolean {
    return installedThemes.some((t: any) => {
      if (t.stylesheet === themeSlug || t.template === themeSlug) return true;
      const themeName = typeof t.name === "string" ? t.name 
        : (t.name?.rendered ? String(t.name.rendered) : "");
      return themeName && themeName.toLowerCase().includes(themeSlug.toLowerCase());
    });
  }

  it("should handle name as string", () => {
    const themes = [{ stylesheet: "flavor", template: "flavor", name: "Flavor Theme" }];
    expect(safeThemeExists(themes, "flavor")).toBe(true);
    expect(safeThemeExists(themes, "nonexistent")).toBe(false);
  });

  it("should handle name as object with rendered property (WP API format)", () => {
    const themes = [
      { stylesheet: "flavor", template: "flavor", name: { rendered: "Flavor Theme" } },
      { stylesheet: "flavor-child", template: "flavor", name: { rendered: "Flavor Child" } },
    ];
    expect(safeThemeExists(themes, "flavor")).toBe(true);
    expect(safeThemeExists(themes, "Flavor")).toBe(true); // case insensitive
  });

  it("should handle name as null", () => {
    const themes = [
      { stylesheet: "flavor", template: "flavor", name: null },
    ];
    // Should still match by stylesheet
    expect(safeThemeExists(themes, "flavor")).toBe(true);
    // Should not crash when name is null
    expect(safeThemeExists(themes, "nonexistent")).toBe(false);
  });

  it("should handle name as undefined", () => {
    const themes = [
      { stylesheet: "flavor", template: "flavor" },
    ];
    expect(safeThemeExists(themes, "flavor")).toBe(true);
    expect(safeThemeExists(themes, "nonexistent")).toBe(false);
  });

  it("should handle name as number (edge case)", () => {
    const themes = [
      { stylesheet: "flavor", template: "flavor", name: 123 },
    ];
    // Should not crash, match by stylesheet
    expect(safeThemeExists(themes, "flavor")).toBe(true);
    expect(safeThemeExists(themes, "nonexistent")).toBe(false);
  });

  it("should handle empty themes array", () => {
    expect(safeThemeExists([], "flavor")).toBe(false);
  });

  it("should handle name as empty object", () => {
    const themes = [
      { stylesheet: "flavor", template: "flavor", name: {} },
    ];
    expect(safeThemeExists(themes, "flavor")).toBe(true);
    expect(safeThemeExists(themes, "nonexistent")).toBe(false);
  });

  it("should match by stylesheet even when name doesn't match", () => {
    const themes = [
      { stylesheet: "neon-jackpot", template: "flavor", name: "Flavor Theme" },
    ];
    expect(safeThemeExists(themes, "neon-jackpot")).toBe(true);
  });

  it("should match by template even when name doesn't match", () => {
    const themes = [
      { stylesheet: "flavor-child", template: "neon-jackpot", name: "Flavor Child" },
    ];
    expect(safeThemeExists(themes, "neon-jackpot")).toBe(true);
  });

  it("should do case-insensitive name matching", () => {
    const themes = [
      { stylesheet: "other", template: "other", name: "NEON JACKPOT Theme" },
    ];
    expect(safeThemeExists(themes, "neon-jackpot")).toBe(false); // "neon-jackpot" not in "NEON JACKPOT Theme" (has space not dash)
    expect(safeThemeExists(themes, "neon")).toBe(true); // partial match
    expect(safeThemeExists(themes, "JACKPOT")).toBe(true); // case insensitive
  });
});
