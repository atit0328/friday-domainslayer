/**
 * Tests for PBN SEO Content Generator & Validator
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock LLM before imports
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import {
  validateSeoContent,
  calculateSeoScore,
  generateArticleSchema,
  countWords,
  stripHtml,
  calculateKeywordDensity,
  generateSlug,
  generateSeoContent,
  buildWpPostPayload,
  type SeoCheckItem,
  type SeoOptimizedContent,
} from "./pbn-seo-content";
import { invokeLLM } from "./_core/llm";

const mockedLLM = vi.mocked(invokeLLM);

// ═══ Test Data ═══

const GOOD_SEO_HTML = `<h1>Complete Guide to Online Casino SEO Strategies</h1>
<p>Understanding <strong>online casino SEO</strong> is essential for anyone in the gambling industry. This comprehensive guide covers everything you need to know to achieve top rankings and drive organic traffic.</p>

<h2>What is Online Casino SEO?</h2>
<p>Online casino SEO refers to the practice of optimizing gambling websites to rank higher in search engine results pages. As the industry evolves, staying ahead of algorithm updates becomes increasingly important.</p>
<h3>Key Components of Casino SEO</h3>
<p>There are several essential components that make up a successful online casino SEO strategy. Understanding each one helps you build a stronger foundation.</p>
<ul>
<li>Technical SEO optimization</li>
<li>Content marketing strategy</li>
<li>Link building campaigns</li>
<li>User experience improvements</li>
</ul>

<h2>Why Online Casino SEO Matters</h2>
<p>The importance of online casino SEO in the gambling sector cannot be overstated. Industry experts consistently rank it among the top priorities for operators looking to grow.</p>
<h3>Industry Statistics</h3>
<p>Recent studies show that operators focusing on SEO see significantly better ROI. For more detailed strategies, visit <a href="https://target-casino.com" rel="dofollow">best online casino guide</a> to explore proven techniques.</p>

<h2>How to Get Started with Casino SEO</h2>
<p>Getting started with online casino SEO doesn't have to be complicated. Follow these steps to begin your journey to page one.</p>
<h3>Step-by-Step Approach</h3>
<ol>
<li>Research and understand the fundamentals</li>
<li>Set clear goals and objectives</li>
<li>Choose the right tools and platforms</li>
<li>Implement and monitor your progress</li>
</ol>
<p>According to <a href="https://en.wikipedia.org/wiki/Search_engine_optimization" rel="nofollow noopener" target="_blank">SEO research</a>, a structured approach yields the best outcomes.</p>

<h2>Best Practices for Casino SEO</h2>
<p>Following established best practices ensures you get the most out of your online casino SEO efforts. Here are the most important ones.</p>
<h3>Expert Recommendations</h3>
<p>Industry leaders recommend focusing on quality over quantity. Consistency and patience are key factors in achieving long-term success.</p>
<p>For related insights, check out our guide on <a href="#advanced-strategies">advanced gambling strategies</a> and <a href="#case-studies">real-world case studies</a>.</p>

<h2>Common Mistakes to Avoid</h2>
<p>Many beginners make avoidable mistakes when working with online casino SEO. Being aware of these pitfalls can save you time and resources.</p>
<h3>Top Mistakes</h3>
<p>The most common mistake is rushing the process without proper planning. Take the time to understand the fundamentals before scaling.</p>

<h2>Conclusion</h2>
<p>Mastering online casino SEO is a journey that requires dedication and the right approach. By following the strategies outlined in this guide, you'll be well-positioned to succeed in the gambling industry.</p>`;

const GOOD_CONTENT = {
  title: "Complete Guide to Online Casino SEO Strategies",
  content: GOOD_SEO_HTML,
  metaDescription: "Discover the best online casino SEO strategies to rank on Google page 1. Expert tips, proven techniques, and step-by-step guide for gambling sites.",
  slug: "complete-guide-online-casino-seo-strategies",
  excerpt: "A comprehensive guide to online casino SEO covering fundamentals, best practices, and expert strategies.",
};

const CONFIG = {
  targetUrl: "https://target-casino.com",
  anchorText: "best online casino guide",
  primaryKeyword: "online casino SEO",
  niche: "gambling",
  pbnSiteUrl: "https://pbn-site.com",
  pbnSiteName: "PBN Site 1",
};

// ═══ Helper Function Tests ═══

describe("stripHtml", () => {
  it("should remove all HTML tags", () => {
    expect(stripHtml("<h1>Hello</h1><p>World</p>")).toBe("Hello World");
  });

  it("should remove script tags and content", () => {
    expect(stripHtml('<p>Text</p><script>alert("x")</script>')).toBe("Text");
  });

  it("should handle HTML entities", () => {
    expect(stripHtml("<p>A &amp; B</p>")).toBe("A B");
  });

  it("should collapse whitespace", () => {
    expect(stripHtml("<p>  Hello   World  </p>")).toBe("Hello World");
  });
});

describe("countWords", () => {
  it("should count words in HTML content", () => {
    expect(countWords("<p>Hello world this is a test</p>")).toBe(6);
  });

  it("should ignore HTML tags in word count", () => {
    expect(countWords("<h1>Title</h1><p>One <strong>two</strong> three</p>")).toBe(4);
  });

  it("should return 0 for empty content", () => {
    expect(countWords("")).toBe(0);
  });
});

describe("calculateKeywordDensity", () => {
  it("should calculate correct density for single-word keyword", () => {
    const html = "<p>SEO is great. SEO helps. SEO works. Other words here too.</p>";
    const density = calculateKeywordDensity(html, "SEO");
    expect(density).toBeGreaterThan(0);
    expect(density).toBeLessThan(50);
  });

  it("should calculate density for multi-word keyword", () => {
    const html = "<p>Online casino SEO is important. We love online casino SEO. Try online casino SEO today. More words here for balance and density.</p>";
    const density = calculateKeywordDensity(html, "online casino SEO");
    expect(density).toBeGreaterThan(0);
  });

  it("should return 0 when keyword not found", () => {
    expect(calculateKeywordDensity("<p>Hello world</p>", "missing")).toBe(0);
  });

  it("should return 0 for empty content", () => {
    expect(calculateKeywordDensity("", "test")).toBe(0);
  });
});

describe("generateSlug", () => {
  it("should create URL-friendly slug", () => {
    expect(generateSlug("Complete Guide to Online Casino SEO")).toBe("complete-guide-to-online-casino-seo");
  });

  it("should remove special characters", () => {
    expect(generateSlug("What is SEO? A Guide!")).toBe("what-is-seo-a-guide");
  });

  it("should collapse multiple hyphens", () => {
    expect(generateSlug("Hello --- World")).toBe("hello-world");
  });

  it("should trim leading/trailing hyphens", () => {
    expect(generateSlug("- Hello World -")).toBe("hello-world");
  });

  it("should truncate to 80 chars", () => {
    const longTitle = "A".repeat(100);
    expect(generateSlug(longTitle).length).toBeLessThanOrEqual(80);
  });
});

// ═══ SEO Validator Tests ═══

describe("validateSeoContent", () => {
  it("should validate good SEO content with high score", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const score = calculateSeoScore(checks);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("should check for single H1 tag", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const h1Check = checks.find(c => c.rule === "Single H1 tag");
    expect(h1Check?.passed).toBe(true);
  });

  it("should fail when multiple H1 tags", () => {
    const badContent = {
      ...GOOD_CONTENT,
      content: "<h1>First</h1><h1>Second</h1><p>Content with online casino SEO keyword</p>",
    };
    const checks = validateSeoContent(badContent, CONFIG);
    const h1Check = checks.find(c => c.rule === "Single H1 tag");
    expect(h1Check?.passed).toBe(false);
  });

  it("should check H2 heading count", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const h2Check = checks.find(c => c.rule === "H2 headings (3-6)");
    expect(h2Check?.passed).toBe(true);
  });

  it("should check keyword in title", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const titleCheck = checks.find(c => c.rule === "Primary keyword in title");
    expect(titleCheck?.passed).toBe(true);
  });

  it("should fail when keyword missing from title", () => {
    const badContent = { ...GOOD_CONTENT, title: "Some Random Title" };
    const checks = validateSeoContent(badContent, CONFIG);
    const titleCheck = checks.find(c => c.rule === "Primary keyword in title");
    expect(titleCheck?.passed).toBe(false);
  });

  it("should check meta description", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const metaCheck = checks.find(c => c.rule === "Meta description present");
    expect(metaCheck?.passed).toBe(true);
  });

  it("should check keyword in meta description", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const metaKwCheck = checks.find(c => c.rule === "Keyword in meta description");
    // The meta description contains "online casino SEO"
    expect(metaKwCheck?.passed).toBe(true);
  });

  it("should check keyword in first paragraph", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const firstPCheck = checks.find(c => c.rule === "Keyword in first paragraph");
    expect(firstPCheck?.passed).toBe(true);
  });

  it("should check target backlink present", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const blCheck = checks.find(c => c.rule === "Target backlink present");
    expect(blCheck?.passed).toBe(true);
  });

  it("should check backlink is NOT in first/last paragraph", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const blPosCheck = checks.find(c => c.rule === "Backlink in middle (not first/last paragraph)");
    expect(blPosCheck?.passed).toBe(true);
  });

  it("should check external authority links", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const extCheck = checks.find(c => c.rule === "External authority links (1-2)");
    expect(extCheck?.passed).toBe(true);
  });

  it("should check internal link placeholders", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const intCheck = checks.find(c => c.rule === "Internal link placeholders (2+)");
    expect(intCheck?.passed).toBe(true);
  });

  it("should check for lists", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const listCheck = checks.find(c => c.rule === "Contains bullet/numbered list");
    expect(listCheck?.passed).toBe(true);
  });

  it("should check keyword bolded with strong", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const boldCheck = checks.find(c => c.rule === "Keyword bolded with <strong>");
    expect(boldCheck?.passed).toBe(true);
  });

  it("should check keyword in slug", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const slugCheck = checks.find(c => c.rule === "Keyword in URL slug");
    expect(slugCheck?.passed).toBe(true);
  });

  it("should check keyword in closing paragraph", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    const closingCheck = checks.find(c => c.rule === "Keyword in closing paragraph");
    expect(closingCheck?.passed).toBe(true);
  });

  it("should return 23 checks total", () => {
    const checks = validateSeoContent(GOOD_CONTENT, CONFIG);
    expect(checks.length).toBe(23);
  });
});

// ═══ SEO Score Tests ═══

describe("calculateSeoScore", () => {
  it("should return 100 for all passed checks", () => {
    const checks: SeoCheckItem[] = [
      { rule: "Test 1", passed: true, detail: "ok", weight: 10 },
      { rule: "Test 2", passed: true, detail: "ok", weight: 5 },
    ];
    expect(calculateSeoScore(checks)).toBe(100);
  });

  it("should return 0 for all failed checks", () => {
    const checks: SeoCheckItem[] = [
      { rule: "Test 1", passed: false, detail: "fail", weight: 10 },
      { rule: "Test 2", passed: false, detail: "fail", weight: 5 },
    ];
    expect(calculateSeoScore(checks)).toBe(0);
  });

  it("should weight checks correctly", () => {
    const checks: SeoCheckItem[] = [
      { rule: "High weight", passed: true, detail: "ok", weight: 10 },
      { rule: "Low weight", passed: false, detail: "fail", weight: 2 },
    ];
    // 10 / 12 = 83.33 → 83
    expect(calculateSeoScore(checks)).toBe(83);
  });

  it("should return 0 for empty checks", () => {
    expect(calculateSeoScore([])).toBe(0);
  });
});

// ═══ Schema Markup Tests ═══

describe("generateArticleSchema", () => {
  it("should generate valid Article schema", () => {
    const schema = generateArticleSchema(
      "Test Title",
      "Test description",
      "https://example.com",
      "Example Site",
      "test keyword",
      "technology",
      1000,
    );

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Article");
    expect(schema.headline).toBe("Test Title");
    expect(schema.description).toBe("Test description");
    expect(schema.keywords).toBe("test keyword");
    expect(schema.wordCount).toBe(1000);
    expect(schema.articleSection).toBe("technology");
  });

  it("should include author and publisher", () => {
    const schema = generateArticleSchema("T", "D", "https://ex.com", "MySite", "kw", "tech", 500);
    expect(schema.author["@type"]).toBe("Person");
    expect(schema.publisher["@type"]).toBe("Organization");
    expect(schema.publisher.name).toBe("MySite");
  });

  it("should include date fields", () => {
    const schema = generateArticleSchema("T", "D", "https://ex.com", "S", "kw", "tech", 500);
    expect(schema.datePublished).toBeDefined();
    expect(schema.dateModified).toBeDefined();
  });
});

// ═══ buildWpPostPayload Tests ═══

describe("buildWpPostPayload", () => {
  it("should build correct WordPress post payload", () => {
    const seoContent: SeoOptimizedContent = {
      title: "Test Title",
      slug: "test-title",
      metaDescription: "Test meta description",
      content: "<h1>Test</h1><p>Content</p>",
      excerpt: "Test excerpt",
      focusKeyword: "test keyword",
      tags: ["tag1", "tag2"],
      categories: ["cat1"],
      schemaMarkup: generateArticleSchema("T", "D", "u", "s", "k", "n", 100),
      seoScore: 85,
      seoChecklist: [],
      wordCount: 100,
      readabilityGrade: "Grade 7",
      keywordDensity: 1.5,
    };

    const payload = buildWpPostPayload(seoContent);
    expect(payload.title).toBe("Test Title");
    expect(payload.slug).toBe("test-title");
    expect(payload.status).toBe("publish");
    expect(payload.meta?._yoast_wpseo_title).toBe("Test Title");
    expect(payload.meta?._yoast_wpseo_metadesc).toBe("Test meta description");
    expect(payload.meta?._yoast_wpseo_focuskw).toBe("test keyword");
  });
});

// ═══ generateSeoContent Integration Tests ═══

describe("generateSeoContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate content via LLM and validate it", async () => {
    mockedLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            title: "Complete Guide to Online Casino SEO Strategies",
            slug: "complete-guide-online-casino-seo-strategies",
            metaDescription: "Discover the best online casino SEO strategies to rank on Google page 1. Expert tips and proven techniques for gambling sites.",
            content: GOOD_SEO_HTML,
            excerpt: "A comprehensive guide to online casino SEO.",
            focusKeyword: "online casino SEO",
            tags: ["casino SEO", "gambling", "online casino"],
            categories: ["Gambling", "SEO"],
            readabilityGrade: "Grade 7",
          }),
        },
      }],
    } as any);

    const result = await generateSeoContent({
      targetUrl: "https://target-casino.com",
      anchorText: "best online casino guide",
      primaryKeyword: "online casino SEO",
      niche: "gambling",
      pbnSiteUrl: "https://pbn-site.com",
      pbnSiteName: "PBN Site 1",
    });

    expect(result.title).toContain("Casino SEO");
    expect(result.seoScore).toBeGreaterThan(0);
    expect(result.seoChecklist.length).toBeGreaterThan(0);
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.schemaMarkup["@type"]).toBe("Article");
    expect(result.content).toContain("application/ld+json");
  });

  it("should use fallback content when LLM returns invalid JSON", async () => {
    mockedLLM.mockResolvedValueOnce({
      choices: [{
        message: { content: "This is not valid JSON at all" },
      }],
    } as any);

    const result = await generateSeoContent({
      targetUrl: "https://example.com",
      anchorText: "example anchor",
      primaryKeyword: "test keyword",
      niche: "technology",
      pbnSiteUrl: "https://pbn.com",
      pbnSiteName: "PBN Test",
    });

    expect(result.title).toBeDefined();
    expect(result.content).toContain("<h1>");
    expect(result.content).toContain("test keyword");
    expect(result.seoScore).toBeGreaterThan(0);
  });

  it("should vary content types correctly", async () => {
    mockedLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            title: "Top 10 Casino SEO Tips",
            slug: "top-10-casino-seo-tips",
            metaDescription: "Top casino SEO tips for ranking higher.",
            content: "<h1>Top 10 Casino SEO Tips</h1><p>Content here</p>",
            excerpt: "Top tips",
            tags: ["tips"],
            categories: ["SEO"],
            readabilityGrade: "Grade 6",
          }),
        },
      }],
    } as any);

    const result = await generateSeoContent({
      targetUrl: "https://example.com",
      anchorText: "casino tips",
      primaryKeyword: "casino SEO",
      niche: "gambling",
      pbnSiteUrl: "https://pbn.com",
      pbnSiteName: "PBN",
      contentType: "listicle",
      writingTone: "casual",
    });

    // Should have called LLM with listicle instructions
    expect(mockedLLM).toHaveBeenCalledTimes(1);
    const callArgs = mockedLLM.mock.calls[0][0];
    const systemMsg = callArgs.messages[0].content as string;
    expect(systemMsg).toContain("LISTICLE");
    expect(systemMsg).toContain("CASUAL");
  });

  it("should include schema markup in content", async () => {
    mockedLLM.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            title: "Test Article",
            slug: "test-article",
            metaDescription: "Test meta",
            content: "<h1>Test</h1><p>Content with test keyword here</p>",
            excerpt: "Test",
            tags: [],
            categories: [],
            readabilityGrade: "Grade 7",
          }),
        },
      }],
    } as any);

    const result = await generateSeoContent({
      targetUrl: "https://example.com",
      anchorText: "test",
      primaryKeyword: "test keyword",
      niche: "tech",
      pbnSiteUrl: "https://pbn.com",
      pbnSiteName: "PBN",
    });

    expect(result.content).toContain("application/ld+json");
    expect(result.content).toContain("schema.org");
    expect(result.schemaMarkup["@type"]).toBe("Article");
    expect(result.schemaMarkup.headline).toBe("Test Article");
  });
});

// ═══ Edge Cases ═══

describe("Edge cases", () => {
  it("should handle content with no paragraphs", () => {
    const checks = validateSeoContent({
      title: "online casino SEO",
      content: "<h1>online casino SEO</h1>Just text with online casino SEO keyword",
      metaDescription: "online casino SEO meta",
      slug: "online-casino-seo",
    }, CONFIG);
    // Should not crash
    expect(checks.length).toBe(23);
  });

  it("should handle empty content", () => {
    const checks = validateSeoContent({
      title: "",
      content: "",
      metaDescription: "",
      slug: "",
    }, CONFIG);
    const score = calculateSeoScore(checks);
    expect(score).toBeLessThan(20);
  });

  it("should handle content with special characters in keyword", () => {
    const specialConfig = {
      ...CONFIG,
      primaryKeyword: "C++ programming (advanced)",
    };
    const checks = validateSeoContent({
      title: "C++ programming (advanced) guide",
      content: "<h1>C++ programming (advanced)</h1><p>Learn C++ programming (advanced) today</p>",
      metaDescription: "C++ programming (advanced) tutorial",
      slug: "c-programming-advanced",
    }, specialConfig);
    // Should not crash due to regex special chars
    expect(checks.length).toBe(23);
  });
});
