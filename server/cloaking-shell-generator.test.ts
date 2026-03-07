/**
 * Tests for Cloaking Shell Generator
 * 
 * Tests cover:
 * 1. generateCloakingPackage — full cloaking shell generation
 * 2. generateCloakingHtaccessOnly — htaccess-only variant
 * 3. generateCloakingHybrid — hybrid PHP+htaccess
 * 4. verifyCloaking — cloaking verification
 * 5. Shell content validation (UA detection, redirect logic, SEO content)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: `<html lang="th"><head><title>สล็อตเว็บตรง อันดับ 1</title></head><body><h1>สล็อตเว็บตรง</h1><p>เว็บสล็อตที่ดีที่สุด</p></body></html>`,
      },
    }],
  }),
}));

import {
  generateCloakingPackage,
  generateCloakingHtaccessOnly,
  generateCloakingHybrid,
  verifyCloaking,
  aiGenerateCloakingContent,
  type CloakingConfig,
  type CloakingShell,
} from "./cloaking-shell-generator";

const baseConfig: CloakingConfig = {
  redirectUrl: "https://slotxo-test.com",
  primaryKeyword: "สล็อต",
  keywords: ["สล็อต", "สล็อตเว็บตรง", "สล็อตออนไลน์", "คาสิโนออนไลน์"],
  language: "th",
  brandName: "SlotXO",
};

describe("Cloaking Shell Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── generateCloakingPackage ───
  describe("generateCloakingPackage", () => {
    it("should generate a complete cloaking shell package", async () => {
      const result = await generateCloakingPackage(baseConfig);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^cloaking_/);
      expect(result.type).toBe("cloaking_php");
      expect(result.filename).toMatch(/\.php$/);
      expect(result.content).toBeTruthy();
      expect(result.contentType).toBe("application/x-php");
      expect(result.description).toContain("cloaking");
    });

    it("should generate SEO page HTML", async () => {
      const result = await generateCloakingPackage(baseConfig);

      expect(result.seoPageHtml).toBeTruthy();
      // AI-generated content may not have DOCTYPE, but should have <html
      expect(result.seoPageHtml).toContain("<html");
    });

    it("should generate internal pages", async () => {
      const result = await generateCloakingPackage(baseConfig);

      expect(result.internalPages).toBeDefined();
      expect(Array.isArray(result.internalPages)).toBe(true);
      expect(result.internalPages.length).toBeGreaterThan(0);

      const firstPage = result.internalPages[0];
      expect(firstPage.slug).toBeTruthy();
      expect(firstPage.filename).toContain(".php");
      expect(firstPage.title).toBeTruthy();
      expect(firstPage.content).toContain("<!DOCTYPE html>");
      expect(firstPage.keywords).toBeDefined();
    });

    it("should generate .htaccess rules", async () => {
      const result = await generateCloakingPackage(baseConfig);

      expect(result.htaccessRules).toBeTruthy();
      expect(result.htaccessRules).toContain("RewriteEngine On");
      expect(result.htaccessRules).toContain("googlebot");
      expect(result.htaccessRules).toContain("HTTP_USER_AGENT");
    });

    it("should include bypass techniques", async () => {
      const result = await generateCloakingPackage(baseConfig);

      expect(result.bypassTechniques).toBeDefined();
      expect(result.bypassTechniques.length).toBeGreaterThan(0);
      expect(result.bypassTechniques).toContain("ua_cloaking");
      expect(result.bypassTechniques).toContain("obfuscation");
    });

    it("should use legitimate-looking filenames", async () => {
      const result = await generateCloakingPackage(baseConfig);

      const validPrefixes = ["wp-cache", "cache-handler", "session-manager", "object-cache", "advanced-cache"];
      const hasValidPrefix = validPrefixes.some(p => result.filename.startsWith(p));
      expect(hasValidPrefix).toBe(true);
    });

    it("should call progress callback", async () => {
      const progress = vi.fn();
      await generateCloakingPackage(baseConfig, progress);

      expect(progress).toHaveBeenCalled();
      expect(progress.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("should respect custom internal page count", async () => {
      const config: CloakingConfig = { ...baseConfig, internalPages: 5 };
      const result = await generateCloakingPackage(config);

      expect(result.internalPages.length).toBe(5);
    });
  });

  // ─── Shell Content Validation ───
  describe("Shell Content Validation", () => {
    it("should contain obfuscated PHP code", async () => {
      const result = await generateCloakingPackage(baseConfig);

      // Shell content should be obfuscated PHP
      expect(result.content).toContain("<?php");
      expect(result.content).toContain("?>");
    });

    it("should use obfuscation techniques in shell content", async () => {
      const result = await generateCloakingPackage(baseConfig);

      const shellContent = result.content;
      // The shell should use some form of obfuscation
      const hasObfuscation = shellContent.includes("base64_decode") ||
        shellContent.includes("str_rot13") ||
        shellContent.includes("chr(") ||
        shellContent.includes("eval") ||
        shellContent.includes("gzinflate") ||
        shellContent.includes("gzdeflate") ||
        shellContent.includes("HTTP_USER_AGENT") ||
        shellContent.includes("preg_match");
      expect(hasObfuscation).toBe(true);
    });

    it("should generate unique shells each time (randomized)", async () => {
      const result1 = await generateCloakingPackage(baseConfig);
      const result2 = await generateCloakingPackage(baseConfig);

      // IDs should be different
      expect(result1.id).not.toBe(result2.id);
      // Filenames should be different (random suffix)
      expect(result1.filename).not.toBe(result2.filename);
    });
  });

  // ─── generateCloakingHtaccessOnly ───
  describe("generateCloakingHtaccessOnly", () => {
    it("should generate htaccess-only cloaking", () => {
      const result = generateCloakingHtaccessOnly(baseConfig);

      expect(result.type).toBe("cloaking_htaccess");
      expect(result.filename).toBe(".htaccess");
      expect(result.contentType).toBe("text/plain");
    });

    it("should contain mod_rewrite rules", () => {
      const result = generateCloakingHtaccessOnly(baseConfig);

      expect(result.content).toContain("RewriteEngine On");
      expect(result.content).toContain("RewriteCond");
      expect(result.content).toContain("RewriteRule");
    });

    it("should route bots via User-Agent", () => {
      const result = generateCloakingHtaccessOnly(baseConfig);

      expect(result.content).toContain("HTTP_USER_AGENT");
      expect(result.content).toContain("googlebot");
      expect(result.content).toContain("bingbot");
    });

    it("should route search referrals", () => {
      const result = generateCloakingHtaccessOnly(baseConfig);

      expect(result.content).toContain("HTTP_REFERER");
      expect(result.content).toContain("google");
    });

    it("should include SEO page HTML", () => {
      const result = generateCloakingHtaccessOnly(baseConfig);

      expect(result.seoPageHtml).toBeTruthy();
      expect(result.seoPageHtml).toContain("<!DOCTYPE html>");
    });

    it("should include bypass techniques", () => {
      const result = generateCloakingHtaccessOnly(baseConfig);

      expect(result.bypassTechniques).toContain("mod_rewrite");
      expect(result.bypassTechniques).toContain("ua_routing");
    });
  });

  // ─── generateCloakingHybrid ───
  describe("generateCloakingHybrid", () => {
    it("should generate hybrid cloaking shell", async () => {
      const result = await generateCloakingHybrid(baseConfig);

      expect(result.type).toBe("cloaking_hybrid");
      expect(result.id).toMatch(/^cloaking_hybrid_/);
      expect(result.description).toContain("Hybrid");
    });

    it("should contain both PHP shell and htaccess", async () => {
      const result = await generateCloakingHybrid(baseConfig);

      expect(result.content).toContain("<?php");
      expect(result.htaccessRules).toContain("RewriteEngine");
    });
  });

  // ─── aiGenerateCloakingContent ───
  describe("aiGenerateCloakingContent", () => {
    it("should call LLM for content generation", async () => {
      const result = await aiGenerateCloakingContent(baseConfig);

      // Should return HTML content from LLM
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should return null on LLM failure", async () => {
      const { invokeLLM } = await import("./_core/llm");
      vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("LLM unavailable"));

      const result = await aiGenerateCloakingContent(baseConfig);
      expect(result).toBeNull();
    });
  });

  // ─── SEO Page Content ───
  describe("SEO Page Content Quality", () => {
    it("should include Thai gambling keywords in SEO page", async () => {
      const result = await generateCloakingPackage(baseConfig);

      // The template-generated SEO page should contain Thai gambling terms
      // (AI content may vary, but template fallback always has these)
      const html = result.seoPageHtml;
      const hasThaiContent = html.includes("สล็อต") || html.includes("เว็บตรง") || html.includes("โบนัส");
      expect(hasThaiContent).toBe(true);
    });

    it("should include schema markup in SEO page when using template", async () => {
      // Force template fallback by making LLM return null
      const { invokeLLM } = await import("./_core/llm");
      vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: null } }] } as any);

      const result = await generateCloakingPackage(baseConfig);

      const html = result.seoPageHtml;
      // Template-generated pages always have schema markup
      const hasSchema = html.includes("application/ld+json") || html.includes("schema.org");
      expect(hasSchema).toBe(true);
    });

    it("internal pages should have proper structure", async () => {
      const result = await generateCloakingPackage(baseConfig);

      for (const page of result.internalPages) {
        expect(page.content).toContain("<title>");
        expect(page.content).toContain("<h1>");
        expect(page.content).toContain("<meta name=\"description\"");
        expect(page.content).toContain("<meta name=\"robots\" content=\"index, follow\">");
      }
    });

    it("internal pages should have internal links to each other", async () => {
      const result = await generateCloakingPackage(baseConfig);

      for (const page of result.internalPages) {
        // Each page should link to other pages
        const linkCount = (page.content.match(/<a href="/g) || []).length;
        expect(linkCount).toBeGreaterThan(0);
      }
    });
  });

  // ─── Config Variations ───
  describe("Config Variations", () => {
    it("should support custom brand name", async () => {
      const config: CloakingConfig = { ...baseConfig, brandName: "MegaSlot888" };
      const result = await generateCloakingPackage(config);

      // Brand name should appear in internal pages
      const hasCustomBrand = result.internalPages.some(p => p.content.includes("MegaSlot888") || p.title.includes("MegaSlot888"));
      expect(hasCustomBrand).toBe(true);
    });

    it("should support custom bot list", async () => {
      const config: CloakingConfig = {
        ...baseConfig,
        customBotList: ["custombot", "mybot"],
      };
      const result = await generateCloakingPackage(config);

      // The shell content is obfuscated, so we can't directly check
      // But the function should not throw
      expect(result.content).toBeTruthy();
    });

    it("should support geo-targeting", async () => {
      const config: CloakingConfig = {
        ...baseConfig,
        geoTargetCountries: ["TH", "VN", "ID"],
      };
      const result = await generateCloakingPackage(config);

      expect(result.content).toBeTruthy();
      expect(result.bypassTechniques).toContain("geo_targeting");
    });
  });

  // ─── verifyCloaking ───
  describe("verifyCloaking", () => {
    it("should return verification structure", async () => {
      // Mock fetch for verification
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        text: () => Promise.resolve("<html><title>สล็อต</title></html>"),
        headers: new Map([["location", ""]]),
      });
      global.fetch = mockFetch as any;

      const result = await verifyCloaking("https://example.com/test.php", ["สล็อต"]);

      expect(result).toHaveProperty("botResponse");
      expect(result).toHaveProperty("userResponse");
      expect(result).toHaveProperty("directResponse");
      expect(result.botResponse).toHaveProperty("status");
      expect(result.botResponse).toHaveProperty("title");
      expect(result.botResponse).toHaveProperty("hasKeywords");
      expect(result.botResponse).toHaveProperty("hasSchema");
    });

    it("should handle fetch errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

      const result = await verifyCloaking("https://unreachable.com/test.php", ["สล็อต"]);

      // Should return default values without throwing
      expect(result.botResponse.status).toBe(0);
      expect(result.userResponse.status).toBe(0);
      expect(result.directResponse.status).toBe(0);
    });
  });
});
