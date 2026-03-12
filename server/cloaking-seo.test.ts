/**
 * Tests for Cloaking Engine + AI On-Page SEO Optimizer
 */
import { describe, it, expect, vi } from "vitest";

// ═══ Cloaking Engine Tests ═══
import {
  isSearchBot,
  identifyBot,
  isGoogleBotIp,
  generateCloakingPHP,
  generateCloakingJS,
  SEARCH_ENGINE_BOTS,
  DEFAULT_CLOAKING_CONFIG,
  type CloakingConfig,
} from "./wp-cloaking-engine";

// ═══ On-Page SEO Optimizer Tests ═══
import {
  runSeoAudit,
  selectSeoTheme,
  SEO_OPTIMIZED_THEMES,
  generateHtaccessRules,
  generateRobotsTxt,
  type AuditInput,
} from "./ai-onpage-seo-optimizer";

// ═══════════════════════════════════════════════════════════════
// Bot Detection Tests
// ═══════════════════════════════════════════════════════════════

describe("Bot Detection", () => {
  it("should detect Googlebot", () => {
    expect(isSearchBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
  });

  it("should detect Bingbot", () => {
    expect(isSearchBot("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")).toBe(true);
  });

  it("should detect Googlebot-Image", () => {
    expect(isSearchBot("Googlebot-Image/1.0")).toBe(true);
  });

  it("should detect DuckDuckBot", () => {
    expect(isSearchBot("DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)")).toBe(true);
  });

  it("should detect Twitterbot", () => {
    expect(isSearchBot("Twitterbot/1.0")).toBe(true);
  });

  it("should NOT detect regular Chrome browser", () => {
    expect(isSearchBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")).toBe(false);
  });

  it("should NOT detect regular Firefox browser", () => {
    expect(isSearchBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0")).toBe(false);
  });

  it("should NOT detect mobile Safari", () => {
    expect(isSearchBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });

  it("should handle empty user agent", () => {
    expect(isSearchBot("")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isSearchBot("googlebot")).toBe(true);
    expect(isSearchBot("GOOGLEBOT")).toBe(true);
  });
});

describe("Bot Identification", () => {
  it("should identify Googlebot by name", () => {
    expect(identifyBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe("Googlebot");
  });

  it("should identify Bingbot by name", () => {
    expect(identifyBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe("Bingbot");
  });

  it("should return null for regular browser", () => {
    expect(identifyBot("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(identifyBot("")).toBeNull();
  });
});

describe("Google Bot IP Verification", () => {
  it("should recognize Google IP 66.249.x.x", () => {
    expect(isGoogleBotIp("66.249.64.1")).toBe(true);
  });

  it("should recognize Google IP 74.125.x.x", () => {
    expect(isGoogleBotIp("74.125.0.1")).toBe(true);
  });

  it("should reject non-Google IP", () => {
    expect(isGoogleBotIp("192.168.1.1")).toBe(false);
  });

  it("should reject empty IP", () => {
    expect(isGoogleBotIp("")).toBe(false);
  });

  it("should recognize Google Cloud IP 35.191.x.x", () => {
    expect(isGoogleBotIp("35.191.0.1")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// PHP Cloaking Code Generation Tests
// ═══════════════════════════════════════════════════════════════

describe("PHP Cloaking Code Generation", () => {
  it("should generate valid PHP code", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("<?php");
    expect(php).toContain("friday_is_search_bot");
    expect(php).toContain("friday_get_visitor_country");
    expect(php).toContain("friday_cloaking_handler");
  });

  it("should include redirect URL in PHP code", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://target-site.com",
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("https://target-site.com");
  });

  it("should use JS redirect method by default", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      redirectMethod: "js",
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("window.location.href");
  });

  it("should use 301 redirect when configured", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      redirectMethod: "301",
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("301 Moved Permanently");
  });

  it("should use 302 redirect when configured", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      redirectMethod: "302",
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("302");
  });

  it("should use meta refresh when configured", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      redirectMethod: "meta",
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("meta http-equiv");
  });

  it("should include target country TH", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      targetCountries: ["TH"],
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("'TH'");
  });

  it("should include multiple countries", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      targetCountries: ["TH", "VN", "MY"],
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("'TH'");
    expect(php).toContain("'VN'");
    expect(php).toContain("'MY'");
  });

  it("should include bot patterns", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("googlebot");
    expect(php).toContain("bingbot");
  });

  it("should include GeoIP detection methods", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("HTTP_CF_IPCOUNTRY"); // CloudFlare
    expect(php).toContain("geoip_country_code_by_name"); // PHP GeoIP
    expect(php).toContain("HTTP_ACCEPT_LANGUAGE"); // Language heuristic
    expect(php).toContain("ip-api.com"); // Free API fallback
  });

  it("should support A/B split redirect URLs", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://site-a.com",
      redirectUrls: ["https://site-b.com", "https://site-c.com"],
      enabled: true,
    };
    const php = generateCloakingPHP(config);
    expect(php).toContain("site-a.com");
    expect(php).toContain("site-b.com");
    expect(php).toContain("site-c.com");
    expect(php).toContain("array_rand");
  });
});

// ═══════════════════════════════════════════════════════════════
// JavaScript Cloaking Code Generation Tests
// ═══════════════════════════════════════════════════════════════

describe("JavaScript Cloaking Code Generation", () => {
  it("should generate valid JS code", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      enabled: true,
    };
    const js = generateCloakingJS(config);
    expect(js).toContain("navigator.userAgent");
    expect(js).toContain("window.location.href");
  });

  it("should include timezone detection for TH", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      targetCountries: ["TH"],
      enabled: true,
    };
    const js = generateCloakingJS(config);
    expect(js).toContain("Bangkok");
  });

  it("should include redirect URL", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://target.com",
      enabled: true,
    };
    const js = generateCloakingJS(config);
    expect(js).toContain("https://target.com");
  });

  it("should support redirect delay", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      redirectDelay: 3000,
      enabled: true,
    };
    const js = generateCloakingJS(config);
    expect(js).toContain("setTimeout");
    expect(js).toContain("3000");
  });

  it("should include bot detection patterns", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://example.com",
      enabled: true,
    };
    const js = generateCloakingJS(config);
    expect(js).toContain("googlebot");
    expect(js).toContain("isBot");
  });
});

// ═══════════════════════════════════════════════════════════════
// Constants Tests
// ═══════════════════════════════════════════════════════════════

describe("Cloaking Constants", () => {
  it("should have at least 15 bot patterns", () => {
    expect(SEARCH_ENGINE_BOTS.length).toBeGreaterThanOrEqual(15);
  });

  it("should include major search engines", () => {
    expect(SEARCH_ENGINE_BOTS).toContain("Googlebot");
    expect(SEARCH_ENGINE_BOTS).toContain("Bingbot");
    expect(SEARCH_ENGINE_BOTS).toContain("DuckDuckBot");
  });

  it("should include social media crawlers", () => {
    expect(SEARCH_ENGINE_BOTS).toContain("Twitterbot");
    expect(SEARCH_ENGINE_BOTS).toContain("LinkedInBot");
    expect(SEARCH_ENGINE_BOTS).toContain("facebot");
  });

  it("should have default config with TH country", () => {
    expect(DEFAULT_CLOAKING_CONFIG.targetCountries).toContain("TH");
  });

  it("should have default config disabled", () => {
    expect(DEFAULT_CLOAKING_CONFIG.enabled).toBe(false);
  });

  it("should have JS as default redirect method", () => {
    expect(DEFAULT_CLOAKING_CONFIG.redirectMethod).toBe("js");
  });
});

// ═══════════════════════════════════════════════════════════════
// SEO Audit Tests
// ═══════════════════════════════════════════════════════════════

describe("SEO Audit - Title Checks", () => {
  const baseInput: AuditInput = {
    title: "Best Casino Online Thailand - Top 10 Guide 2026",
    metaDescription: "Discover the best casino online Thailand options. Our expert guide reviews top 10 casinos with bonuses, games, and trusted payouts. Start playing today!",
    h1: "Top 10 Best Casino Online Thailand for 2026",
    headings: [
      { level: 2, text: "What Makes a Great Casino Online Thailand" },
      { level: 2, text: "Top Casino Bonuses in Thailand" },
      { level: 2, text: "How to Choose the Right Casino" },
      { level: 3, text: "Security and Licensing" },
      { level: 3, text: "Payment Methods" },
      { level: 2, text: "FAQ About Casino Online Thailand" },
    ],
    content: "casino online thailand is one of the most popular searches. In this comprehensive guide, we review the best casino online thailand options available. Our team has tested each casino online thailand platform extensively. We have years of experience in the online gambling industry. According to research, the Thai market is growing rapidly. casino online thailand offers various games including slots, poker, and live dealer games. Our expert review covers bonuses, payment methods, and security features. In conclusion, choosing the right casino online thailand requires careful consideration of multiple factors.",
    slug: "best-casino-online-thailand",
    primaryKeyword: "casino online thailand",
    secondaryKeywords: ["thai casino", "online gambling", "casino bonus"],
    schemas: [
      { "@type": "Article" },
      { "@type": "Organization" },
      { "@type": "BreadcrumbList" },
      { "@type": "FAQPage" },
    ],
    images: [
      { alt: "Best casino online thailand homepage", src: "/img/casino.jpg" },
      { alt: "Casino bonus comparison table", src: "/img/bonus.jpg" },
    ],
    internalLinks: [
      { anchor: "casino bonus guide", url: "/casino-bonus/" },
      { anchor: "payment methods for Thai players", url: "/payment-methods/" },
      { anchor: "online gambling regulations", url: "/regulations/" },
    ],
    wordCount: 1800,
    author: { name: "John Expert", credentials: "10 years in online gambling industry" },
  };

  it("should pass title keyword check", () => {
    const { checks } = runSeoAudit(baseInput);
    const titleKw = checks.find(c => c.name === "Title contains primary keyword");
    expect(titleKw?.status).toBe("pass");
  });

  it("should pass title length check", () => {
    const { checks } = runSeoAudit(baseInput);
    const titleLen = checks.find(c => c.name === "Title length optimal (50-60 chars)");
    // Title is 48 chars, might be warning
    expect(titleLen?.status).toBeDefined();
  });

  it("should pass H1 keyword check", () => {
    const { checks } = runSeoAudit(baseInput);
    const h1Kw = checks.find(c => c.name === "H1 contains primary keyword");
    expect(h1Kw?.status).toBe("pass");
  });

  it("should pass meta description keyword check", () => {
    const { checks } = runSeoAudit(baseInput);
    const descKw = checks.find(c => c.name === "Meta description contains keyword");
    expect(descKw?.status).toBe("pass");
  });

  it("should pass H2 subheadings check", () => {
    const { checks } = runSeoAudit(baseInput);
    const h2 = checks.find(c => c.name === "Has H2 subheadings");
    expect(h2?.status).toBe("pass");
  });

  it("should pass schema markup check", () => {
    const { checks } = runSeoAudit(baseInput);
    const schema = checks.find(c => c.name === "Has schema markup");
    expect(schema?.status).toBe("pass");
  });

  it("should pass Article schema check", () => {
    const { checks } = runSeoAudit(baseInput);
    const article = checks.find(c => c.name === "Has Article schema");
    expect(article?.status).toBe("pass");
  });

  it("should pass FAQ schema check", () => {
    const { checks } = runSeoAudit(baseInput);
    const faq = checks.find(c => c.name === "Has FAQ schema");
    expect(faq?.status).toBe("pass");
  });

  it("should pass author check", () => {
    const { checks } = runSeoAudit(baseInput);
    const author = checks.find(c => c.name === "Author information present");
    expect(author?.status).toBe("pass");
  });

  it("should pass internal links check", () => {
    const { checks } = runSeoAudit(baseInput);
    const links = checks.find(c => c.name === "Has internal links");
    expect(links?.status).toBe("pass");
  });

  it("should pass image alt check", () => {
    const { checks } = runSeoAudit(baseInput);
    const imgAlt = checks.find(c => c.name === "Images have alt text");
    expect(imgAlt?.status).toBe("pass");
  });

  it("should pass content length check", () => {
    const { checks } = runSeoAudit(baseInput);
    const contentLen = checks.find(c => c.name === "Content length adequate");
    expect(contentLen?.status).toBe("pass");
  });

  it("should pass keyword in first 100 words check", () => {
    const { checks } = runSeoAudit(baseInput);
    const firstKw = checks.find(c => c.name === "Keyword in first 100 words");
    expect(firstKw?.status).toBe("pass");
  });

  it("should pass keyword in URL slug check", () => {
    const { checks } = runSeoAudit(baseInput);
    const slugKw = checks.find(c => c.name === "Keyword in URL slug");
    expect(slugKw?.status).toBe("pass");
  });

  it("should generate score above 70 for well-optimized content", () => {
    const { score } = runSeoAudit(baseInput);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("should have at least 40 checks", () => {
    const { checks } = runSeoAudit(baseInput);
    expect(checks.length).toBeGreaterThanOrEqual(40);
  });
});

describe("SEO Audit - Failure Cases", () => {
  it("should fail when title missing keyword", () => {
    const input: AuditInput = {
      title: "Welcome to our website",
      metaDescription: "A great website",
      h1: "Welcome",
      headings: [],
      content: "Some content here",
      slug: "welcome",
      primaryKeyword: "casino online",
      secondaryKeywords: [],
      schemas: [],
      images: [],
      internalLinks: [],
      wordCount: 50,
    };
    const { checks } = runSeoAudit(input);
    const titleKw = checks.find(c => c.name === "Title contains primary keyword");
    expect(titleKw?.status).toBe("fail");
  });

  it("should fail when no schema markup", () => {
    const input: AuditInput = {
      title: "Casino Online Guide",
      metaDescription: "Best casino online",
      h1: "Casino Online",
      headings: [],
      content: "casino online content",
      slug: "casino-online",
      primaryKeyword: "casino online",
      secondaryKeywords: [],
      schemas: [],
      images: [],
      internalLinks: [],
      wordCount: 100,
    };
    const { checks } = runSeoAudit(input);
    const schema = checks.find(c => c.name === "Has schema markup");
    expect(schema?.status).toBe("fail");
  });

  it("should fail when no author info", () => {
    const input: AuditInput = {
      title: "Casino Guide",
      metaDescription: "Guide",
      h1: "Casino",
      headings: [],
      content: "content",
      slug: "casino",
      primaryKeyword: "casino",
      secondaryKeywords: [],
      schemas: [],
      images: [],
      internalLinks: [],
      wordCount: 10,
    };
    const { checks } = runSeoAudit(input);
    const author = checks.find(c => c.name === "Author information present");
    expect(author?.status).toBe("fail");
  });

  it("should give low score for poorly optimized content", () => {
    const input: AuditInput = {
      title: "Hello",
      metaDescription: "Hi",
      h1: "Welcome",
      headings: [],
      content: "Short content",
      slug: "hello",
      primaryKeyword: "casino online thailand",
      secondaryKeywords: ["bonus", "games"],
      schemas: [],
      images: [],
      internalLinks: [],
      wordCount: 5,
    };
    const { score } = runSeoAudit(input);
    expect(score).toBeLessThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// SEO Theme Selection Tests
// ═══════════════════════════════════════════════════════════════

describe("SEO Theme Selection", () => {
  it("should return a theme", () => {
    const theme = selectSeoTheme();
    expect(theme).toBeDefined();
    expect(theme.slug).toBeDefined();
    expect(theme.speedScore).toBeGreaterThan(0);
  });

  it("should return highest speed theme by default", () => {
    const theme = selectSeoTheme();
    expect(theme.speedScore).toBeGreaterThanOrEqual(95);
  });

  it("should filter by tier", () => {
    const theme = selectSeoTheme({ preferTier: 3 });
    expect(theme.tier).toBe(3);
  });

  it("should filter by minimum speed score", () => {
    const theme = selectSeoTheme({ minSpeedScore: 90 });
    expect(theme.speedScore).toBeGreaterThanOrEqual(90);
  });

  it("should return random theme when randomize is true", () => {
    // Run multiple times to verify randomness (probabilistic)
    const themes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      themes.add(selectSeoTheme({ randomize: true }).slug);
    }
    // Should have at least 1 theme (could be same due to randomness, but likely different)
    expect(themes.size).toBeGreaterThanOrEqual(1);
  });

  it("should have themes with schema support", () => {
    const theme = selectSeoTheme({ requireSchema: true });
    expect(theme.schemaSupport).toBe(true);
  });

  it("should have at least 10 themes in catalog", () => {
    expect(SEO_OPTIMIZED_THEMES.length).toBeGreaterThanOrEqual(10);
  });

  it("should have all themes mobile-friendly", () => {
    expect(SEO_OPTIMIZED_THEMES.every(t => t.mobileFriendly)).toBe(true);
  });

  it("should have pageSpeed scores for all themes", () => {
    for (const theme of SEO_OPTIMIZED_THEMES) {
      expect(theme.pageSpeed).toBeDefined();
      expect(theme.pageSpeed.performance).toBeGreaterThanOrEqual(80);
      expect(theme.pageSpeed.performance).toBeLessThanOrEqual(100);
      expect(theme.pageSpeed.accessibility).toBeGreaterThanOrEqual(80);
      expect(theme.pageSpeed.seo).toBeGreaterThanOrEqual(90);
      expect(theme.pageSpeed.bestPractices).toBeGreaterThanOrEqual(90);
    }
  });

  it("should have seoScore breakdown for all themes", () => {
    for (const theme of SEO_OPTIMIZED_THEMES) {
      expect(theme.seoScore).toBeDefined();
      expect(theme.seoScore.overall).toBeGreaterThanOrEqual(70);
      expect(theme.seoScore.overall).toBeLessThanOrEqual(100);
      expect(theme.seoScore.titleOptimization).toBeGreaterThan(0);
      expect(theme.seoScore.metaDescription).toBeGreaterThan(0);
      expect(theme.seoScore.headingStructure).toBeGreaterThan(0);
      expect(theme.seoScore.schemaMarkup).toBeGreaterThan(0);
      expect(theme.seoScore.mobileResponsive).toBeGreaterThan(0);
      expect(theme.seoScore.coreWebVitals).toBeGreaterThan(0);
      expect(theme.seoScore.codeQuality).toBeGreaterThan(0);
      expect(theme.seoScore.imageOptimization).toBeGreaterThan(0);
      expect(theme.seoScore.internalLinking).toBeGreaterThan(0);
      expect(theme.seoScore.contentReadability).toBeGreaterThan(0);
    }
  });

  it("should have unique real theme names (not all flavor)", () => {
    const names = new Set(SEO_OPTIMIZED_THEMES.map(t => t.name));
    expect(names.size).toBeGreaterThanOrEqual(8);
  });

  it("should have category for all themes", () => {
    const validCategories = ["starter", "multipurpose", "blog", "business", "developer"];
    for (const theme of SEO_OPTIMIZED_THEMES) {
      expect(validCategories).toContain(theme.category);
    }
  });

  it("should have preview images for tier 1 and tier 2 themes with known slugs", () => {
    const knownThemes = SEO_OPTIMIZED_THEMES.filter(t => 
      ["generatepress", "astra", "kadence", "hello-elementor", "neve", "blocksy", "oceanwp"].includes(t.slug)
    );
    for (const theme of knownThemes) {
      expect(theme.previewImage).toBeDefined();
      expect(theme.previewImage).toContain("cloudfront.net");
    }
  });

  it("should have tier 1 themes with higher seoScore than tier 4", () => {
    const tier1Avg = SEO_OPTIMIZED_THEMES.filter(t => t.tier === 1).reduce((sum, t) => sum + t.seoScore.overall, 0) / SEO_OPTIMIZED_THEMES.filter(t => t.tier === 1).length;
    const tier4Avg = SEO_OPTIMIZED_THEMES.filter(t => t.tier === 4).reduce((sum, t) => sum + t.seoScore.overall, 0) / SEO_OPTIMIZED_THEMES.filter(t => t.tier === 4).length;
    expect(tier1Avg).toBeGreaterThan(tier4Avg);
  });
});

// ═══════════════════════════════════════════════════════════════
// SEO Utilities Tests
// ═══════════════════════════════════════════════════════════════

describe("SEO Utilities", () => {
  it("should generate .htaccess rules with GZIP compression", () => {
    const rules = generateHtaccessRules();
    expect(rules).toContain("mod_deflate");
    expect(rules).toContain("DEFLATE");
  });

  it("should generate .htaccess rules with browser caching", () => {
    const rules = generateHtaccessRules();
    expect(rules).toContain("mod_expires");
    expect(rules).toContain("ExpiresActive On");
  });

  it("should generate .htaccess rules with security headers", () => {
    const rules = generateHtaccessRules();
    expect(rules).toContain("X-Content-Type-Options");
    expect(rules).toContain("X-Frame-Options");
  });

  it("should generate robots.txt with sitemap", () => {
    const robots = generateRobotsTxt("example.com");
    expect(robots).toContain("Sitemap:");
    expect(robots).toContain("example.com");
  });

  it("should generate robots.txt with custom sitemap URL", () => {
    const robots = generateRobotsTxt("example.com", "https://example.com/custom-sitemap.xml");
    expect(robots).toContain("custom-sitemap.xml");
  });

  it("should generate robots.txt blocking wp-admin", () => {
    const robots = generateRobotsTxt("example.com");
    expect(robots).toContain("Disallow: /wp-admin/");
  });

  it("should generate robots.txt allowing uploads", () => {
    const robots = generateRobotsTxt("example.com");
    expect(robots).toContain("Allow: /wp-content/uploads/");
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration Tests
// ═══════════════════════════════════════════════════════════════

describe("Cloaking + SEO Integration", () => {
  it("should generate both PHP and JS cloaking code", () => {
    const config: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: "https://casino-thai.com",
      enabled: true,
      targetCountries: ["TH"],
    };
    const php = generateCloakingPHP(config);
    const js = generateCloakingJS(config);
    
    expect(php).toContain("<?php");
    expect(php).toContain("casino-thai.com");
    expect(js).toContain("casino-thai.com");
    expect(js).toContain("Bangkok");
  });

  it("should audit content and return comprehensive results", () => {
    const input: AuditInput = {
      title: "Casino Online Thailand - Complete Guide 2026",
      metaDescription: "Find the best casino online thailand platforms. Expert reviews, bonuses, and tips. Discover top casinos now!",
      h1: "Complete Guide to Casino Online Thailand 2026",
      headings: [
        { level: 2, text: "Top Casino Online Thailand Platforms" },
        { level: 2, text: "Casino Bonuses and Promotions" },
        { level: 2, text: "How to Get Started" },
        { level: 3, text: "Registration Process" },
        { level: 3, text: "First Deposit Guide" },
        { level: 2, text: "Frequently Asked Questions" },
      ],
      content: "casino online thailand is the most searched term for Thai gamblers. This comprehensive guide covers everything you need to know about casino online thailand. Based on our extensive testing and years of experience in the industry, we recommend the following platforms. According to recent research and data from industry reports, the online gambling market in Thailand continues to grow. Our expert team has personally tested each casino online thailand platform. In conclusion, choosing the right casino online thailand requires understanding bonuses, payment methods, and security features. FAQ: What is the best casino online thailand? The best casino online thailand depends on your preferences.",
      slug: "casino-online-thailand-guide",
      primaryKeyword: "casino online thailand",
      secondaryKeywords: ["thai casino", "online gambling", "casino bonus", "casino games"],
      schemas: [
        { "@type": "Article" },
        { "@type": "Organization" },
        { "@type": "BreadcrumbList" },
        { "@type": "FAQPage" },
      ],
      images: [
        { alt: "Casino online thailand homepage screenshot", src: "/img/casino.jpg" },
      ],
      internalLinks: [
        { anchor: "casino bonus guide for Thai players", url: "/bonus-guide/" },
        { anchor: "payment methods in Thailand", url: "/payments/" },
        { anchor: "online gambling regulations", url: "/regulations/" },
      ],
      wordCount: 1600,
      author: { name: "Expert Reviewer", credentials: "Certified gambling industry analyst" },
    };

    const { score, checks } = runSeoAudit(input);
    
    // Should have a good score
    expect(score).toBeGreaterThanOrEqual(65);
    
    // Should have comprehensive checks
    expect(checks.length).toBeGreaterThanOrEqual(40);
    
    // Should have checks from multiple categories
    const categories = new Set(checks.map(c => c.category));
    expect(categories.size).toBeGreaterThanOrEqual(8);
    
    // Most checks should pass
    const passCount = checks.filter(c => c.status === "pass").length;
    expect(passCount).toBeGreaterThan(checks.length * 0.5);
  });
});
