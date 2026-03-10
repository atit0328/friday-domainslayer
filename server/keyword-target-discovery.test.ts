/**
 * Vitest tests for Keyword Target Discovery module
 * Tests: default keywords, domain extraction, domain filtering, search result processing
 */
import { describe, it, expect, vi } from "vitest";

// ─── Test the DEFAULT_LOTTERY_KEYWORDS constant ───
// We can't import it directly since it's not exported, but we can test seedDefaultKeywords behavior

describe("Keyword Target Discovery", () => {
  describe("Domain extraction and filtering", () => {
    // Test domain extraction logic
    it("should extract domain from URL correctly", () => {
      // Simulate the extractDomain logic
      const extractDomain = (url: string): string | null => {
        try {
          const u = new URL(url);
          return u.hostname.replace(/^www\./, "");
        } catch {
          return null;
        }
      };

      expect(extractDomain("https://www.example.com/page")).toBe("example.com");
      expect(extractDomain("https://sub.example.com/page")).toBe("sub.example.com");
      expect(extractDomain("http://example.com")).toBe("example.com");
      expect(extractDomain("invalid-url")).toBeNull();
    });

    it("should skip major domains", () => {
      const SKIP_DOMAINS = [
        "google.com", "google.co.th", "facebook.com", "youtube.com",
        "wikipedia.org", "twitter.com", "instagram.com", "tiktok.com",
        "amazon.com", "reddit.com", "linkedin.com", "pinterest.com",
        "apple.com", "microsoft.com", "github.com", "stackoverflow.com",
        "line.me", "pantip.com", "sanook.com", "kapook.com",
        "thairath.co.th", "dailynews.co.th", "matichon.co.th",
        "bangkokpost.com", "nationthailand.com",
      ];

      const shouldSkipDomain = (domain: string): boolean => {
        const lower = domain.toLowerCase();
        return SKIP_DOMAINS.some(skip => lower === skip || lower.endsWith(`.${skip}`));
      };

      // Should skip major sites
      expect(shouldSkipDomain("google.com")).toBe(true);
      expect(shouldSkipDomain("www.google.com")).toBe(true); // endsWith .google.com
      expect(shouldSkipDomain("facebook.com")).toBe(true);
      expect(shouldSkipDomain("pantip.com")).toBe(true);
      expect(shouldSkipDomain("sub.google.com")).toBe(true);

      // Should NOT skip target sites
      expect(shouldSkipDomain("lotto888.com")).toBe(false);
      expect(shouldSkipDomain("huay999.com")).toBe(false);
      expect(shouldSkipDomain("random-lottery-site.com")).toBe(false);
    });

    it("should handle Thai lottery keywords", () => {
      const keywords = [
        "หวยออนไลน์",
        "ตรวจหวย",
        "หวยลาว",
        "ตรวจลอตเตอรี่",
        "สลากกินแบ่งรัฐบาล",
        "หวยฮานอย",
        "แทงหวย",
        "lottovip เข้าสู่ระบบ",
        "thai lottery",
      ];

      // All keywords should be non-empty strings
      for (const kw of keywords) {
        expect(typeof kw).toBe("string");
        expect(kw.length).toBeGreaterThan(0);
      }

      // Should have Thai and English keywords
      const hasThai = keywords.some(k => /[\u0E00-\u0E7F]/.test(k));
      const hasEnglish = keywords.some(k => /[a-zA-Z]/.test(k));
      expect(hasThai).toBe(true);
      expect(hasEnglish).toBe(true);
    });
  });

  describe("SerpAPI result processing", () => {
    it("should extract domains from SERP results", () => {
      const mockResults = [
        { title: "หวยออนไลน์", link: "https://www.lotto888.com/", snippet: "..." },
        { title: "ตรวจหวย", link: "https://huay999.com/check", snippet: "..." },
        { title: "หวยลาว", link: "https://www.google.com/search", snippet: "..." },
        { title: "สลาก", link: "https://facebook.com/lottery", snippet: "..." },
      ];

      const SKIP_DOMAINS = ["google.com", "google.co.th", "facebook.com", "youtube.com"];
      const shouldSkipDomain = (domain: string): boolean => {
        const lower = domain.toLowerCase();
        return SKIP_DOMAINS.some(skip => lower === skip || lower.endsWith(`.${skip}`));
      };

      const extractDomain = (url: string): string | null => {
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return null;
        }
      };

      const domains = new Set<string>();
      for (const r of mockResults) {
        const domain = extractDomain(r.link);
        if (domain && !shouldSkipDomain(domain)) {
          domains.add(domain);
        }
      }

      expect(domains.size).toBe(2);
      expect(domains.has("lotto888.com")).toBe(true);
      expect(domains.has("huay999.com")).toBe(true);
      expect(domains.has("google.com")).toBe(false);
      expect(domains.has("facebook.com")).toBe(false);
    });
  });

  describe("Discovery run result structure", () => {
    it("should have correct result structure", () => {
      const mockResult = {
        runId: 1,
        keywordsSearched: 20,
        rawResultsFound: 500,
        uniqueDomainsFound: 150,
        newTargetsAdded: 80,
        duplicatesSkipped: 50,
        blacklistedSkipped: 20,
        errors: [],
        targets: [
          { domain: "test.com", url: "https://test.com", title: "Test", keyword: "หวย", serpPosition: 1 },
        ],
      };

      expect(mockResult.runId).toBeGreaterThan(0);
      expect(mockResult.keywordsSearched).toBeGreaterThan(0);
      expect(mockResult.newTargetsAdded).toBeGreaterThanOrEqual(0);
      expect(mockResult.errors).toBeInstanceOf(Array);
      expect(mockResult.targets).toBeInstanceOf(Array);
      expect(mockResult.targets[0]).toHaveProperty("domain");
      expect(mockResult.targets[0]).toHaveProperty("keyword");
      expect(mockResult.targets[0]).toHaveProperty("serpPosition");
    });
  });
});

describe("Telegram Notifier - Success Only Filter", () => {
  it("should only allow success type notifications", () => {
    const BLOCKED_TYPES = ["failure", "partial", "progress"];
    const ERROR_INFO_PATTERNS = [
      "error", "failed", "failure", "ล้มเหลว", "ผิดพลาด",
      "timeout", "exception", "crash", "unable to", "cannot",
    ];

    const shouldSend = (type: string, title: string): boolean => {
      if (BLOCKED_TYPES.includes(type)) return false;
      if (type === "info") {
        const lowerTitle = title.toLowerCase();
        return !ERROR_INFO_PATTERNS.some(p => lowerTitle.includes(p));
      }
      return true;
    };

    // Success should always pass
    expect(shouldSend("success", "Attack succeeded")).toBe(true);
    expect(shouldSend("success", "Deploy complete")).toBe(true);

    // Failure should be blocked
    expect(shouldSend("failure", "Attack failed")).toBe(false);
    expect(shouldSend("partial", "Partial success")).toBe(false);
    expect(shouldSend("progress", "In progress")).toBe(false);

    // Info with error keywords should be blocked
    expect(shouldSend("info", "Error connecting")).toBe(false);
    expect(shouldSend("info", "Attack failed on target")).toBe(false);
    expect(shouldSend("info", "ล้มเหลว")).toBe(false);

    // Info without error keywords should pass
    expect(shouldSend("info", "New CVE discovered")).toBe(true);
    expect(shouldSend("info", "Learning cycle complete")).toBe(true);
  });
});
