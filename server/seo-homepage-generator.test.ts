/**
 * Tests for SEO Homepage Content Generator
 */
import { describe, it, expect } from "vitest";
import {
  generateSeoHomepage,
  getKeywordsForCategory,
  type HomepageGeneratorInput,
  type GeneratedHomepage,
} from "./seo-homepage-generator";

describe("getKeywordsForCategory", () => {
  it("returns slots keywords", () => {
    const kw = getKeywordsForCategory("slots");
    expect(kw.primary.length).toBeGreaterThan(5);
    expect(kw.secondary.length).toBeGreaterThan(5);
    expect(kw.lsi.length).toBeGreaterThan(5);
    expect(kw.longTail.length).toBeGreaterThan(3);
    expect(kw.questions.length).toBeGreaterThan(3);
    expect(kw.brands.length).toBeGreaterThan(3);
    expect(kw.primary.some(k => k.includes("สล็อต"))).toBe(true);
  });

  it("returns lottery keywords", () => {
    const kw = getKeywordsForCategory("lottery");
    expect(kw.primary.length).toBeGreaterThan(5);
    expect(kw.primary.some(k => k.includes("หวย"))).toBe(true);
  });

  it("returns baccarat keywords", () => {
    const kw = getKeywordsForCategory("baccarat");
    expect(kw.primary.length).toBeGreaterThan(5);
    expect(kw.primary.some(k => k.includes("บาคาร่า"))).toBe(true);
  });

  it("returns default slots for unknown category", () => {
    const kw = getKeywordsForCategory("unknown");
    expect(kw.primary.some(k => k.includes("สล็อต"))).toBe(true);
  });
});

describe("generateSeoHomepage", () => {
  const baseInput: HomepageGeneratorInput = {
    domain: "test-casino.com",
    siteName: "Lucky888",
    category: "slots",
  };

  it("generates valid HTML with required SEO elements", () => {
    const result = generateSeoHomepage(baseInput);
    
    // Has HTML structure
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<html");
    expect(result.html).toContain("</html>");
    
    // Has meta tags
    expect(result.html).toContain("<title>");
    expect(result.html).toContain('name="description"');
    expect(result.html).toContain('name="keywords"');
    expect(result.html).toContain('rel="canonical"');
    
    // Has OG tags
    expect(result.html).toContain('property="og:title"');
    expect(result.html).toContain('property="og:description"');
    expect(result.html).toContain('property="og:type"');
  });

  it("generates title with primary keyword and site name", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.title).toContain("Lucky888");
    expect(result.title.length).toBeGreaterThan(20);
    expect(result.title.length).toBeLessThan(120);
  });

  it("generates meta description within SEO limits", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.metaDescription.length).toBeGreaterThan(50);
    expect(result.metaDescription.length).toBeLessThan(300);
    expect(result.metaDescription).toContain("Lucky888");
  });

  it("generates content with high word count (2000+)", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.wordCount).toBeGreaterThan(1500);
  });

  it("has keyword density between 2-8%", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.keywordDensity).toBeGreaterThanOrEqual(1);
    expect(result.keywordDensity).toBeLessThanOrEqual(10);
  });

  it("includes Schema.org markup", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.html).toContain("application/ld+json");
    expect(result.schemaTypes.length).toBeGreaterThan(2);
    expect(result.schemaTypes).toContain("GamblingService");
  });

  it("has proper heading hierarchy", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.headingCount.h1).toBe(1); // Only 1 H1
    expect(result.headingCount.h2).toBeGreaterThan(3);
    expect(result.headingCount.h3).toBeGreaterThan(2);
  });

  it("includes FAQ section", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.html).toContain("FAQ");
    expect(result.html).toContain("คำถามที่พบบ่อย");
    expect(result.schemaTypes).toContain("FAQPage");
  });

  it("includes breadcrumb navigation", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.html).toContain("breadcrumb");
    expect(result.schemaTypes).toContain("BreadcrumbList");
  });

  it("generates different content for each category", () => {
    const slots = generateSeoHomepage({ ...baseInput, category: "slots" });
    const lottery = generateSeoHomepage({ ...baseInput, category: "lottery" });
    const baccarat = generateSeoHomepage({ ...baseInput, category: "baccarat" });

    // Different titles
    expect(slots.title).not.toBe(lottery.title);
    expect(lottery.title).not.toBe(baccarat.title);

    // Category-specific keywords
    expect(slots.keywords.some(k => k.includes("สล็อต"))).toBe(true);
    expect(lottery.keywords.some(k => k.includes("หวย"))).toBe(true);
    expect(baccarat.keywords.some(k => k.includes("บาคาร่า"))).toBe(true);
  });

  it("incorporates custom keywords when provided", () => {
    const result = generateSeoHomepage({
      ...baseInput,
      customKeywords: ["สล็อตเว็บตรงพิเศษ", "เว็บสล็อตอันดับ1"],
    });
    expect(result.html).toContain("สล็อตเว็บตรงพิเศษ");
  });

  it("uses theme slug to match theme styling", () => {
    const result = generateSeoHomepage({
      ...baseInput,
      themeSlug: "neon-jackpot",
    });
    // Should still generate valid content
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.wordCount).toBeGreaterThan(1000);
  });

  it("generates table of contents", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.html).toContain("สารบัญ");
    expect(result.html).toContain("toc");
  });

  it("generates footer with keyword-rich links", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.html).toContain("<footer");
    expect(result.html).toContain("</footer>");
  });

  it("includes robots meta allowing indexing", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.html).toContain('name="robots"');
    expect(result.html).toContain("index, follow");
  });

  it("returns keywords array with substantial count", () => {
    const result = generateSeoHomepage(baseInput);
    expect(result.keywords.length).toBeGreaterThan(10);
  });
});
