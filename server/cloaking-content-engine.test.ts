/**
 * Tests for Cloaking Content Engine
 * 
 * Tests cover:
 * 1. generateKeywordClusters — keyword cluster generation
 * 2. aiGenerateContent — AI content generation
 * 3. generateContentPack — full content pack generation
 * 4. rotateContent — content rotation/anti-duplicate
 * 5. Content quality validation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          title: "สล็อตเว็บตรง อันดับ 1 - SlotXO เว็บสล็อตที่ดีที่สุด",
          metaDescription: "สล็อตเว็บตรง SlotXO เว็บสล็อตอันดับ 1 ฝาก-ถอนไม่มีขั้นต่ำ สมัครง่าย โบนัส 100%",
          metaKeywords: "สล็อต, สล็อตเว็บตรง, สล็อตออนไลน์, SlotXO",
          h1: "สล็อตเว็บตรง อันดับ 1 ในไทย",
          sections: [
            { heading: "สล็อตเว็บตรง คืออะไร?", content: "สล็อตเว็บตรงคือเว็บไซต์ให้บริการเกมสล็อตออนไลน์โดยตรง ไม่ผ่านเอเย่นต์" },
            { heading: "ทำไมต้องเลือก SlotXO?", content: "SlotXO เป็นเว็บสล็อตอันดับ 1 มีเกมมากกว่า 1000 เกม ฝาก-ถอนไม่มีขั้นต่ำ" },
          ],
          faq: [
            { question: "สล็อตเว็บตรง เล่นได้จริงไหม?", answer: "ได้จริง 100% มีใบอนุญาตถูกกฎหมาย" },
            { question: "ฝากขั้นต่ำเท่าไหร่?", answer: "ไม่มีขั้นต่ำ ฝากได้ตั้งแต่ 1 บาท" },
          ],
          internalLinks: [
            { text: "สมัครสล็อต", slug: "signup" },
            { text: "โปรโมชั่น", slug: "promotions" },
          ],
        }),
      },
    }],
  }),
}));

import {
  generateKeywordClusters,
  aiGenerateContent,
  generateContentPack,
  rotateContent,
  type ContentConfig,
  type GeneratedContent,
  type ContentPack,
} from "./cloaking-content-engine";

const baseConfig: ContentConfig = {
  primaryKeyword: "สล็อต",
  keywords: ["สล็อต", "สล็อตเว็บตรง", "สล็อตออนไลน์"],
  brandName: "SlotXO",
  redirectUrl: "https://slotxo-test.com",
  language: "th",
  contentType: "landing",
};

describe("Cloaking Content Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── generateKeywordClusters ───
  describe("generateKeywordClusters", () => {
    it("should generate keyword clusters from primary keyword", () => {
      const clusters = generateKeywordClusters("สล็อต");

      expect(clusters).toBeDefined();
      expect(typeof clusters).toBe("object");
      expect(Object.keys(clusters).length).toBeGreaterThan(0);
    });

    it("should include main cluster", () => {
      const clusters = generateKeywordClusters("สล็อต");

      expect(clusters.main).toBeDefined();
      expect(clusters.main.length).toBeGreaterThan(0);
      expect(clusters.main.some(k => k.includes("สล็อต"))).toBe(true);
    });

    it("should include signup cluster", () => {
      const clusters = generateKeywordClusters("สล็อต");

      expect(clusters.signup).toBeDefined();
      expect(clusters.signup.some(k => k.includes("สมัคร"))).toBe(true);
    });

    it("should include bonus cluster", () => {
      const clusters = generateKeywordClusters("สล็อต");

      expect(clusters.bonus).toBeDefined();
      expect(clusters.bonus.some(k => k.includes("โบนัส") || k.includes("เครดิตฟรี"))).toBe(true);
    });

    it("should include play, deposit, review, slot clusters", () => {
      const clusters = generateKeywordClusters("สล็อต");

      expect(clusters.play).toBeDefined();
      expect(clusters.deposit).toBeDefined();
      expect(clusters.review).toBeDefined();
      expect(clusters.slot).toBeDefined();
    });

    it("should work with different keywords", () => {
      const clusters = generateKeywordClusters("บาคาร่า");

      expect(clusters.main.some(k => k.includes("บาคาร่า"))).toBe(true);
      expect(clusters.signup.some(k => k.includes("บาคาร่า"))).toBe(true);
    });
  });

  // ─── aiGenerateContent ───
  describe("aiGenerateContent", () => {
    it("should generate content using LLM", async () => {
      const result = await aiGenerateContent(baseConfig);

      expect(result).not.toBeNull();
      expect(result!.title).toBeTruthy();
      expect(result!.metaDescription).toBeTruthy();
      expect(result!.h1).toBeTruthy();
      expect(result!.body).toBeTruthy();
    });

    it("should generate full HTML", async () => {
      const result = await aiGenerateContent(baseConfig);

      expect(result!.fullHtml).toContain("<!DOCTYPE html>");
      expect(result!.fullHtml).toContain("<title>");
      expect(result!.fullHtml).toContain("<meta name=\"description\"");
    });

    it("should generate schema markup", async () => {
      const result = await aiGenerateContent(baseConfig);

      expect(result!.schemaMarkup).toContain("application/ld+json");
      expect(result!.schemaMarkup).toContain("schema.org");
    });

    it("should include FAQ", async () => {
      const result = await aiGenerateContent(baseConfig);

      expect(result!.faq).toBeDefined();
      expect(result!.faq.length).toBeGreaterThan(0);
      expect(result!.faq[0]).toHaveProperty("question");
      expect(result!.faq[0]).toHaveProperty("answer");
    });

    it("should include internal links", async () => {
      const result = await aiGenerateContent(baseConfig);

      expect(result!.internalLinks).toBeDefined();
      expect(result!.internalLinks.length).toBeGreaterThan(0);
      expect(result!.internalLinks[0]).toHaveProperty("text");
      expect(result!.internalLinks[0]).toHaveProperty("slug");
    });

    it("should call progress callback", async () => {
      const progress = vi.fn();
      await aiGenerateContent(baseConfig, progress);

      expect(progress).toHaveBeenCalled();
    });

    it("should return null on LLM failure", async () => {
      const { invokeLLM } = await import("./_core/llm");
      vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("LLM error"));

      const result = await aiGenerateContent(baseConfig);
      expect(result).toBeNull();
    });

    it("should support different content types", async () => {
      const articleConfig: ContentConfig = { ...baseConfig, contentType: "article" };
      const result = await aiGenerateContent(articleConfig);

      expect(result).not.toBeNull();
    });
  });

  // ─── generateContentPack ───
  describe("generateContentPack", () => {
    it("should generate a complete content pack", async () => {
      const result = await generateContentPack(baseConfig);

      expect(result).toBeDefined();
      expect(result.mainPage).toBeDefined();
      expect(result.doorwayPages).toBeDefined();
      expect(result.sitemapXml).toBeDefined();
    });

    it("should have a valid main page", async () => {
      const result = await generateContentPack(baseConfig);

      expect(result.mainPage.title).toBeTruthy();
      expect(result.mainPage.fullHtml).toContain("<!DOCTYPE html>");
    });

    it("should generate doorway pages for keyword clusters", async () => {
      const result = await generateContentPack(baseConfig);

      // Should have doorway pages (one per cluster minus 'main')
      expect(result.doorwayPages.length).toBeGreaterThan(0);
    });

    it("should generate valid sitemap XML", async () => {
      const result = await generateContentPack(baseConfig);

      expect(result.sitemapXml).toContain("<?xml");
      expect(result.sitemapXml).toContain("<urlset");
      expect(result.sitemapXml).toContain("<loc>");
      expect(result.sitemapXml).toContain("</urlset>");
    });

    it("should call progress callback multiple times", async () => {
      const progress = vi.fn();
      await generateContentPack(baseConfig, progress);

      expect(progress).toHaveBeenCalled();
      // Should be called for main page + each doorway page
      expect(progress.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── rotateContent ───
  describe("rotateContent", () => {
    const sampleContents: GeneratedContent[] = [
      {
        title: "Title 1",
        metaDescription: "Desc 1",
        metaKeywords: "kw1",
        h1: "H1 1",
        body: "<h2>Section A</h2><p>Content A</p><h2>Section B</h2><p>Content B</p>",
        faq: [
          { question: "Q1", answer: "A1" },
          { question: "Q2", answer: "A2" },
          { question: "Q3", answer: "A3" },
        ],
        internalLinks: [{ text: "Link 1", slug: "link-1" }],
        schemaMarkup: "<script>schema</script>",
        fullHtml: "<html>full</html>",
      },
      {
        title: "Title 2",
        metaDescription: "Desc 2",
        metaKeywords: "kw2",
        h1: "H1 2",
        body: "<h2>Section C</h2><p>Content C</p><h2>Section D</h2><p>Content D</p>",
        faq: [
          { question: "Q4", answer: "A4" },
          { question: "Q5", answer: "A5" },
        ],
        internalLinks: [{ text: "Link 2", slug: "link-2" }],
        schemaMarkup: "<script>schema2</script>",
        fullHtml: "<html>full2</html>",
      },
    ];

    it("should return a GeneratedContent object", () => {
      const result = rotateContent(sampleContents);

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy();
      expect(result.body).toBeTruthy();
      expect(result.faq).toBeDefined();
    });

    it("should pick from the provided contents", () => {
      const result = rotateContent(sampleContents);

      const validTitles = sampleContents.map(c => c.title);
      expect(validTitles).toContain(result.title);
    });

    it("should not modify original array", () => {
      const originalLength = sampleContents.length;
      rotateContent(sampleContents);

      expect(sampleContents.length).toBe(originalLength);
    });

    it("should work with single content", () => {
      const result = rotateContent([sampleContents[0]]);

      expect(result.title).toBe("Title 1");
    });
  });
});
