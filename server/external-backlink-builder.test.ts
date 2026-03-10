import { describe, it, expect } from "vitest";
import {
  WEB2_PLATFORMS,
  SOCIAL_PLATFORMS,
  ARTICLE_DIRECTORIES,
  FORUM_PLATFORMS,
  htmlToTelegraphNodes,
  extractPostId,
  generateAnchorDistribution,
  generatePlatformContent,
  type BacklinkBuildRequest,
  type ExternalBuildSession,
} from "./external-backlink-builder";

// ═══ Platform Configuration Tests ═══

describe("Platform Configurations", () => {
  it("should have Web 2.0 platforms with required fields", () => {
    expect(WEB2_PLATFORMS.length).toBeGreaterThanOrEqual(5);
    for (const p of WEB2_PLATFORMS) {
      expect(p.name).toBeTruthy();
      expect(p.domain).toBeTruthy();
      expect(p.da).toBeGreaterThan(0);
      expect(["api", "form"]).toContain(p.method);
      expect(["dofollow", "nofollow"]).toContain(p.linkType);
    }
  });

  it("should have Social platforms with required fields", () => {
    expect(SOCIAL_PLATFORMS.length).toBeGreaterThanOrEqual(4);
    for (const p of SOCIAL_PLATFORMS) {
      expect(p.name).toBeTruthy();
      expect(p.domain).toBeTruthy();
      expect(p.da).toBeGreaterThan(0);
    }
  });

  it("should have Article directories with required fields", () => {
    expect(ARTICLE_DIRECTORIES.length).toBeGreaterThanOrEqual(3);
    for (const d of ARTICLE_DIRECTORIES) {
      expect(d.name).toBeTruthy();
      expect(d.domain).toBeTruthy();
      expect(d.da).toBeGreaterThan(0);
    }
  });

  it("should have Forum platforms with required fields", () => {
    expect(FORUM_PLATFORMS.length).toBeGreaterThanOrEqual(3);
    for (const f of FORUM_PLATFORMS) {
      expect(f.name).toBeTruthy();
      expect(f.domain).toBeTruthy();
      expect(f.da).toBeGreaterThan(0);
    }
  });

  it("should include Telegraph as a Web 2.0 platform (no auth needed)", () => {
    const telegraph = WEB2_PLATFORMS.find(p => p.type === "telegraph");
    expect(telegraph).toBeDefined();
    expect(telegraph!.domain).toBe("telegra.ph");
    expect(telegraph!.method).toBe("api");
    expect(telegraph!.linkType).toBe("dofollow");
  });

  it("should have diverse DA range across all platforms", () => {
    const allPlatforms = [...WEB2_PLATFORMS, ...SOCIAL_PLATFORMS, ...ARTICLE_DIRECTORIES, ...FORUM_PLATFORMS];
    const das = allPlatforms.map(p => p.da);
    const minDA = Math.min(...das);
    const maxDA = Math.max(...das);
    expect(maxDA - minDA).toBeGreaterThan(40); // Good diversity
    expect(minDA).toBeGreaterThan(0);
    expect(maxDA).toBeLessThanOrEqual(100);
  });
});

// ═══ Telegraph Node Conversion Tests ═══

describe("htmlToTelegraphNodes", () => {
  it("should convert simple paragraphs", () => {
    const nodes = htmlToTelegraphNodes(
      "<p>Hello world</p><p>Second paragraph</p>",
      "https://example.com",
      "example",
    );
    expect(nodes.length).toBeGreaterThan(0);
    // Should have paragraph nodes
    const pNodes = nodes.filter((n: any) => n.tag === "p");
    expect(pNodes.length).toBeGreaterThan(0);
  });

  it("should include a link to the target URL", () => {
    const nodes = htmlToTelegraphNodes(
      "<p>Visit our site</p>",
      "https://example.com",
      "Example Site",
    );
    const json = JSON.stringify(nodes);
    expect(json).toContain("https://example.com");
  });

  it("should handle headings", () => {
    const nodes = htmlToTelegraphNodes(
      "<h2>My Heading</h2><p>Content here</p>",
      "https://example.com",
      "example",
    );
    const headingNodes = nodes.filter((n: any) => n.tag === "h3");
    expect(headingNodes.length).toBeGreaterThan(0);
  });

  it("should handle empty HTML gracefully", () => {
    const nodes = htmlToTelegraphNodes("", "https://example.com", "example");
    expect(nodes.length).toBeGreaterThan(0); // Should at least have fallback link
  });
});

// ═══ Post ID Extraction Tests ═══

describe("extractPostId", () => {
  it("should extract ID from ?p=123 format", () => {
    expect(extractPostId("https://blog.com/?p=456")).toBe(456);
  });

  it("should extract ID from /archives/123 format", () => {
    expect(extractPostId("https://blog.com/archives/789")).toBe(789);
  });

  it("should return undefined for slug-based URLs", () => {
    expect(extractPostId("https://blog.com/2024/01/my-post/")).toBeUndefined();
  });

  it("should return undefined for non-matching URLs", () => {
    expect(extractPostId("https://blog.com/about")).toBeUndefined();
  });
});

// ═══ Anchor Distribution Ratio Tests (no LLM, pure math) ═══

describe("Anchor Distribution Ratios", () => {
  // Test the ratio logic without calling LLM (test the math directly)
  const RATIOS = {
    conservative: { branded: 0.40, exact: 0.05, partial: 0.15, generic: 0.20, naked: 0.10, lsi: 0.10 },
    balanced:     { branded: 0.30, exact: 0.10, partial: 0.20, generic: 0.15, naked: 0.10, lsi: 0.15 },
    aggressive:   { branded: 0.20, exact: 0.20, partial: 0.25, generic: 0.10, naked: 0.05, lsi: 0.20 },
  };

  it("conservative should allocate 40% to branded", () => {
    const linkCount = 20;
    const branded = Math.round(linkCount * RATIOS.conservative.branded);
    expect(branded).toBe(8);
  });

  it("aggressive should allocate 20% to exact match", () => {
    const linkCount = 20;
    const exact = Math.round(linkCount * RATIOS.aggressive.exact);
    expect(exact).toBe(4);
  });

  it("conservative should have more branded than aggressive", () => {
    const linkCount = 20;
    const conservativeBranded = Math.round(linkCount * RATIOS.conservative.branded);
    const aggressiveBranded = Math.round(linkCount * RATIOS.aggressive.branded);
    expect(conservativeBranded).toBeGreaterThan(aggressiveBranded);
  });

  it("aggressive should have more exact match than conservative", () => {
    const linkCount = 20;
    const conservativeExact = Math.round(linkCount * RATIOS.conservative.exact);
    const aggressiveExact = Math.round(linkCount * RATIOS.aggressive.exact);
    expect(aggressiveExact).toBeGreaterThan(conservativeExact);
  });

  it("all ratios should sum to 1.0 for each strategy", () => {
    for (const [strategy, ratio] of Object.entries(RATIOS)) {
      const sum = Object.values(ratio).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    }
  });

  it("balanced should be between conservative and aggressive for exact match", () => {
    expect(RATIOS.balanced.exact).toBeGreaterThan(RATIOS.conservative.exact);
    expect(RATIOS.balanced.exact).toBeLessThan(RATIOS.aggressive.exact);
  });

  it("generic anchor texts should be natural-looking", () => {
    const genericTexts = ["click here", "learn more", "visit website", "read more", "check this out", "more info", "see details"];
    expect(genericTexts.length).toBeGreaterThanOrEqual(5);
    for (const text of genericTexts) {
      expect(text.length).toBeGreaterThan(3);
      expect(text.length).toBeLessThan(30);
    }
  });

  it("naked URL format should be correct", () => {
    const domain = "example.com";
    const nakedUrl = `https://${domain}`;
    expect(nakedUrl).toBe("https://example.com");
    expect(nakedUrl).toMatch(/^https:\/\//); 
  });
});

// ═══ Type Safety Tests ═══

describe("Type Safety", () => {
  it("BacklinkBuildRequest should have all required fields", () => {
    const request: BacklinkBuildRequest = {
      projectId: 1,
      targetUrl: "https://example.com",
      targetDomain: "example.com",
      keyword: "gambling online",
      niche: "gambling",
      anchorText: "gambling online",
      anchorType: "exact_match",
    };
    expect(request.projectId).toBe(1);
    expect(request.targetUrl).toBeTruthy();
    expect(request.targetDomain).toBeTruthy();
    expect(request.keyword).toBeTruthy();
    expect(request.niche).toBeTruthy();
    expect(request.anchorText).toBeTruthy();
    expect(["branded", "exact_match", "partial_match", "generic", "naked_url", "lsi"]).toContain(request.anchorType);
  });

  it("ExternalBuildSession should have all required fields", () => {
    const session: ExternalBuildSession = {
      projectId: 1,
      targetUrl: "https://example.com",
      targetDomain: "example.com",
      keywords: ["gambling"],
      niche: "gambling",
      strategy: "balanced",
      aggressiveness: 5,
      maxLinks: 10,
      results: [],
      startedAt: new Date(),
    };
    expect(session.projectId).toBe(1);
    expect(["conservative", "balanced", "aggressive"]).toContain(session.strategy);
    expect(session.aggressiveness).toBeGreaterThanOrEqual(1);
    expect(session.aggressiveness).toBeLessThanOrEqual(10);
  });
});

// ═══ Integration Readiness Tests ═══

describe("Integration Readiness", () => {
  it("should export all required functions for seo-daily-engine", async () => {
    const mod = await import("./external-backlink-builder");
    expect(typeof mod.runExternalBuildSession).toBe("function");
    expect(typeof mod.generateAnchorDistribution).toBe("function");
    expect(typeof mod.generatePlatformContent).toBe("function");
  });

  it("should export all required functions for seo-agent", async () => {
    const mod = await import("./external-backlink-builder");
    expect(typeof mod.buildTelegraphLink).toBe("function");
    expect(typeof mod.buildTier2Links).toBe("function");
    expect(typeof mod.buildSocialBookmark).toBe("function");
    expect(typeof mod.buildBlogComments).toBe("function");
    expect(typeof mod.buildArticleDirectoryLinks).toBe("function");
  });

  it("should export platform configs for UI display", async () => {
    const mod = await import("./external-backlink-builder");
    expect(Array.isArray(mod.WEB2_PLATFORMS)).toBe(true);
    expect(Array.isArray(mod.SOCIAL_PLATFORMS)).toBe(true);
    expect(Array.isArray(mod.ARTICLE_DIRECTORIES)).toBe(true);
    expect(Array.isArray(mod.FORUM_PLATFORMS)).toBe(true);
  });
});
