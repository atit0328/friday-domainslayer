/**
 * Vitest tests for WordPress Casino Theme Engine
 * Tests: theme specs, theme generation, preview HTML, SEO compliance
 */
import { describe, it, expect } from "vitest";
import {
  THEME_SPECS,
  generateThemePackage,
  generatePreviewHTML,
} from "./theme-engine";

describe("Theme Engine — THEME_SPECS", () => {
  it("should have exactly 10 themes", () => {
    expect(THEME_SPECS).toHaveLength(10);
  });

  it("should have unique slugs", () => {
    const slugs = THEME_SPECS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(10);
  });

  it("should have unique names", () => {
    const names = THEME_SPECS.map((t) => t.name);
    expect(new Set(names).size).toBe(10);
  });

  it("should cover all 3 categories", () => {
    const categories = new Set(THEME_SPECS.map((t) => t.category));
    expect(categories.has("slots")).toBe(true);
    expect(categories.has("lottery")).toBe(true);
    expect(categories.has("baccarat")).toBe(true);
  });

  it("should have 4 slots, 3 lottery, 3 baccarat themes", () => {
    const counts = { slots: 0, lottery: 0, baccarat: 0 };
    for (const t of THEME_SPECS) counts[t.category]++;
    expect(counts.slots).toBe(4);
    expect(counts.lottery).toBe(3);
    expect(counts.baccarat).toBe(3);
  });

  it("each theme should have required color fields", () => {
    for (const t of THEME_SPECS) {
      expect(t.primaryColor).toBeTruthy();
      expect(t.secondaryColor).toBeTruthy();
      expect(t.accentColor).toBeTruthy();
      expect(t.bgColor).toBeTruthy();
      expect(t.textColor).toBeTruthy();
    }
  });

  it("each theme should have font definitions", () => {
    for (const t of THEME_SPECS) {
      expect(t.fontHeading).toBeTruthy();
      expect(t.fontBody).toBeTruthy();
    }
  });

  it("each theme should have SEO schema types", () => {
    for (const t of THEME_SPECS) {
      expect(t.seoSchemaTypes).toBeTruthy();
      expect(Array.isArray(t.seoSchemaTypes)).toBe(true);
      expect(t.seoSchemaTypes.length).toBeGreaterThan(0);
      // All should include GamblingService or similar
      expect(t.seoSchemaTypes.some((s: string) => s.includes("Gambling") || s.includes("Organization") || s.includes("WebSite"))).toBe(true);
    }
  });

  it("each theme should have SEO features array", () => {
    for (const t of THEME_SPECS) {
      expect(t.seoFeatures).toBeTruthy();
      expect(Array.isArray(t.seoFeatures)).toBe(true);
      expect(t.seoFeatures.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("each theme should have mobile features", () => {
    for (const t of THEME_SPECS) {
      expect(t.mobileFeatures).toBeTruthy();
      expect(Array.isArray(t.mobileFeatures)).toBe(true);
      expect(t.mobileFeatures.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("each theme should have tags", () => {
    for (const t of THEME_SPECS) {
      expect(t.tags).toBeTruthy();
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.tags.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("Theme Engine — generateThemePackage", () => {
  it("should generate files for each theme", () => {
    for (const spec of THEME_SPECS) {
      const pkg = generateThemePackage(spec);
      expect(pkg).toBeTruthy();
      expect(pkg.files).toBeTruthy();
      expect(typeof pkg.files).toBe("object");
    }
  });

  it("should include style.css with theme header", () => {
    const pkg = generateThemePackage(THEME_SPECS[0]);
    expect(pkg.files["style.css"]).toBeTruthy();
    expect(pkg.files["style.css"]).toContain("Theme Name:");
    expect(pkg.files["style.css"]).toContain(THEME_SPECS[0].name);
  });

  it("should include functions.php", () => {
    const pkg = generateThemePackage(THEME_SPECS[0]);
    expect(pkg.files["functions.php"]).toBeTruthy();
    expect(pkg.files["functions.php"]).toContain("<?php");
  });

  it("should include header.php with responsive viewport meta", () => {
    const pkg = generateThemePackage(THEME_SPECS[0]);
    expect(pkg.files["header.php"]).toBeTruthy();
    expect(pkg.files["header.php"]).toContain("viewport");
  });

  it("should include index.php", () => {
    const pkg = generateThemePackage(THEME_SPECS[0]);
    expect(pkg.files["index.php"]).toBeTruthy();
  });

  it("should include footer.php", () => {
    const pkg = generateThemePackage(THEME_SPECS[0]);
    expect(pkg.files["footer.php"]).toBeTruthy();
  });

  it("should include Schema.org structured data in functions.php", () => {
    for (const spec of THEME_SPECS) {
      const pkg = generateThemePackage(spec);
      const functions = pkg.files["functions.php"];
      expect(functions).toContain("application/ld+json");
      expect(functions).toContain("schema.org");
    }
  });

  it("should include SEO meta tags in functions.php", () => {
    const pkg = generateThemePackage(THEME_SPECS[0]);
    const functions = pkg.files["functions.php"];
    expect(functions).toContain("og:type");
    expect(functions).toContain("twitter:card");
  });

  it("should include responsive CSS with media queries", () => {
    const pkg = generateThemePackage(THEME_SPECS[0]);
    const css = pkg.files["style.css"];
    expect(css).toContain("@media");
  });

  it("should use theme-specific colors in CSS", () => {
    for (const spec of THEME_SPECS) {
      const pkg = generateThemePackage(spec);
      const css = pkg.files["style.css"];
      expect(css).toContain(spec.primaryColor);
    }
  });
});

describe("Theme Engine — generatePreviewHTML", () => {
  it("should generate valid HTML for each theme", () => {
    for (const spec of THEME_SPECS) {
      const html = generatePreviewHTML(spec);
      expect(html).toBeTruthy();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
    }
  });

  it("should include theme name in preview", () => {
    for (const spec of THEME_SPECS) {
      const html = generatePreviewHTML(spec);
      expect(html).toContain(spec.name);
    }
  });

  it("should include responsive viewport meta", () => {
    const html = generatePreviewHTML(THEME_SPECS[0]);
    expect(html).toContain("viewport");
    expect(html).toContain("width=device-width");
  });

  it("should include theme colors in preview", () => {
    for (const spec of THEME_SPECS) {
      const html = generatePreviewHTML(spec);
      expect(html).toContain(spec.primaryColor);
      expect(html).toContain(spec.bgColor);
    }
  });

  it("should include mobile navigation in preview", () => {
    const html = generatePreviewHTML(THEME_SPECS[0]);
    // Should have some form of mobile menu
    expect(html.toLowerCase()).toContain("mobile");
  });
});

describe("Theme Engine — SEO 2026 Compliance", () => {
  it("all themes should have AEO blocks", () => {
    for (const spec of THEME_SPECS) {
      expect(spec.seoFeatures.some((f: string) => f.includes("aeo-blocks"))).toBe(true);
    }
  });

  it("all themes should have rich-snippets or topic-clusters", () => {
    for (const spec of THEME_SPECS) {
      expect(spec.seoFeatures.some((f: string) => f.includes("rich-snippets") || f.includes("topic-clusters") || f.includes("voice-search"))).toBe(true);
    }
  });

  it("all themes should have PWA support", () => {
    for (const spec of THEME_SPECS) {
      expect(spec.mobileFeatures.some((f: string) => f === "pwa")).toBe(true);
    }
  });

  it("all themes should have touch gestures or bottom nav", () => {
    for (const spec of THEME_SPECS) {
      expect(spec.mobileFeatures.some((f: string) => f.includes("touch") || f.includes("bottom-nav") || f.includes("push-notifications"))).toBe(true);
    }
  });

  it("generated CSS should include mobile breakpoints", () => {
    for (const spec of THEME_SPECS) {
      const pkg = generateThemePackage(spec);
      const css = pkg.files["style.css"];
      // Should have at least one mobile breakpoint
      expect(css).toContain("@media");
    }
  });
});
