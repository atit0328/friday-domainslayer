/**
 * Tests for Theme Customizer + Auto-Select by Category
 */
import { describe, it, expect } from "vitest";
import { selectSeoTheme, SEO_OPTIMIZED_THEMES } from "./ai-onpage-seo-optimizer";

describe("Theme Customizer & Auto-Select", () => {
  // ═══ Theme Data Integrity ═══
  describe("defaultColors on all themes", () => {
    it("every theme should have defaultColors defined", () => {
      for (const theme of SEO_OPTIMIZED_THEMES) {
        expect(theme.defaultColors, `${theme.slug} missing defaultColors`).toBeDefined();
        expect(theme.defaultColors!.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.defaultColors!.secondary).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.defaultColors!.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.defaultColors!.fontHeading.length).toBeGreaterThan(0);
        expect(theme.defaultColors!.fontBody.length).toBeGreaterThan(0);
      }
    });

    it("each theme should have unique defaultColors primary", () => {
      const primaries = SEO_OPTIMIZED_THEMES.map(t => t.defaultColors!.primary);
      const unique = new Set(primaries);
      expect(unique.size).toBe(primaries.length);
    });
  });

  // ═══ Auto-Select by Category ═══
  describe("selectSeoTheme with preferCategory", () => {
    it("should return a slots theme when preferCategory=slots", () => {
      const theme = selectSeoTheme({ preferCategory: "slots" });
      expect(theme.category).toBe("slots");
    });

    it("should return a lottery theme when preferCategory=lottery", () => {
      const theme = selectSeoTheme({ preferCategory: "lottery" });
      expect(theme.category).toBe("lottery");
    });

    it("should return a baccarat theme when preferCategory=baccarat", () => {
      const theme = selectSeoTheme({ preferCategory: "baccarat" });
      expect(theme.category).toBe("baccarat");
    });

    it("should return any theme when no category specified", () => {
      const theme = selectSeoTheme({});
      expect(theme).toBeDefined();
      expect(["slots", "lottery", "baccarat"]).toContain(theme.category);
    });

    it("randomize should return different themes over multiple calls", () => {
      const results = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const theme = selectSeoTheme({ preferCategory: "slots", randomize: true });
        results.add(theme.slug);
      }
      // With 4 slots themes and 20 tries, we should get at least 2 different ones
      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ═══ Category Distribution ═══
  describe("theme category distribution", () => {
    it("should have 4 slots themes", () => {
      const slots = SEO_OPTIMIZED_THEMES.filter(t => t.category === "slots");
      expect(slots.length).toBe(4);
    });

    it("should have 3 lottery themes", () => {
      const lottery = SEO_OPTIMIZED_THEMES.filter(t => t.category === "lottery");
      expect(lottery.length).toBe(3);
    });

    it("should have 3 baccarat themes", () => {
      const baccarat = SEO_OPTIMIZED_THEMES.filter(t => t.category === "baccarat");
      expect(baccarat.length).toBe(3);
    });

    it("total should be 10 themes", () => {
      expect(SEO_OPTIMIZED_THEMES.length).toBe(10);
    });
  });

  // ═══ Niche-to-Category Mapping (simulating auto-detect logic) ═══
  describe("niche-to-category auto-detection", () => {
    function detectCategory(niche: string): string | undefined {
      const nicheLower = niche.toLowerCase();
      if (/สล็อต|slot|spin|jackpot|สปิน/.test(nicheLower)) return "slots";
      if (/หวย|lottery|lotto|ลอตเตอรี่|ตัวเลข/.test(nicheLower)) return "lottery";
      if (/บาคาร่า|baccarat|ไพ่|เสือมังกร|dragon.*tiger|คาสิโน|casino/.test(nicheLower)) return "baccarat";
      return undefined;
    }

    it("should detect slots from Thai keywords", () => {
      expect(detectCategory("เว็บสล็อตออนไลน์")).toBe("slots");
      expect(detectCategory("slot online 2026")).toBe("slots");
      expect(detectCategory("jackpot mega win")).toBe("slots");
    });

    it("should detect lottery from Thai keywords", () => {
      expect(detectCategory("หวยออนไลน์")).toBe("lottery");
      expect(detectCategory("lottery results")).toBe("lottery");
      expect(detectCategory("ลอตเตอรี่ไทย")).toBe("lottery");
    });

    it("should detect baccarat from Thai keywords", () => {
      expect(detectCategory("บาคาร่าออนไลน์")).toBe("baccarat");
      expect(detectCategory("baccarat live")).toBe("baccarat");
      expect(detectCategory("dragon tiger game")).toBe("baccarat");
      expect(detectCategory("คาสิโนออนไลน์")).toBe("baccarat");
    });

    it("should return undefined for unrelated niches", () => {
      expect(detectCategory("cooking recipes")).toBeUndefined();
      expect(detectCategory("travel blog")).toBeUndefined();
    });
  });

  // ═══ Preview Images ═══
  describe("preview images", () => {
    it("every theme should have a previewImage URL", () => {
      for (const theme of SEO_OPTIMIZED_THEMES) {
        expect(theme.previewImage, `${theme.slug} missing previewImage`).toBeDefined();
        expect(theme.previewImage).toMatch(/^https:\/\//);
      }
    });
  });
});
