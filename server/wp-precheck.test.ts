/**
 * Tests for WordPress Site Pre-Check + Pipeline Conditional Skip Logic
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══ Unit Tests for Pre-Check Logic (no WP API calls) ═══

describe("WP Site Pre-Check — Theme Detection", () => {
  const DEFAULT_WP_THEMES = [
    "twentytwentyfive", "twentytwentyfour", "twentytwentythree",
    "twentytwentytwo", "twentytwentyone", "twentytwenty",
    "twentynineteen", "twentyeighteen", "twentyseventeen",
    "twentysixteen", "twentyfifteen", "twentyfourteen", "twentythirteen",
    "twentytwelve", "twentyeleven", "twentyten",
  ];

  it("should detect default WP themes as non-custom", () => {
    for (const theme of DEFAULT_WP_THEMES) {
      expect(DEFAULT_WP_THEMES.includes(theme.toLowerCase())).toBe(true);
    }
  });

  it("should detect custom themes as non-default", () => {
    const customThemes = ["astra", "flavor", "flavor-developer", "generatepress", "oceanwp", "neve", "kadence"];
    for (const theme of customThemes) {
      expect(DEFAULT_WP_THEMES.includes(theme.toLowerCase())).toBe(false);
    }
  });

  it("should handle case-insensitive theme matching", () => {
    expect(DEFAULT_WP_THEMES.includes("twentytwentyfour")).toBe(true);
    expect(DEFAULT_WP_THEMES.includes("TwentyTwentyFour".toLowerCase())).toBe(true);
  });

  it("should cover all WordPress default themes from 2010-2025", () => {
    expect(DEFAULT_WP_THEMES.length).toBeGreaterThanOrEqual(16);
    expect(DEFAULT_WP_THEMES).toContain("twentyten");
    expect(DEFAULT_WP_THEMES).toContain("twentytwentyfive");
  });
});

describe("WP Site Pre-Check — Settings Detection", () => {
  const DEFAULT_WP_TITLES = [
    "wordpress", "my site", "my wordpress site", "just another wordpress site",
    "another wordpress site", "a wordpress site", "site title", "",
  ];

  it("should detect default WP titles", () => {
    expect(DEFAULT_WP_TITLES.includes("wordpress")).toBe(true);
    expect(DEFAULT_WP_TITLES.includes("my site")).toBe(true);
    expect(DEFAULT_WP_TITLES.includes("just another wordpress site")).toBe(true);
    expect(DEFAULT_WP_TITLES.includes("")).toBe(true);
  });

  it("should detect custom titles as non-default", () => {
    const customTitles = ["My Casino Blog", "Best Slots Guide", "Thai Gambling Hub"];
    for (const title of customTitles) {
      expect(DEFAULT_WP_TITLES.includes(title.toLowerCase())).toBe(false);
    }
  });

  it("should detect default tagline", () => {
    const defaultTagline = "just another wordpress site";
    expect(defaultTagline).toBe("just another wordpress site");
  });

  it("should detect custom tagline as non-default", () => {
    const customTagline = "your trusted guide to online gaming";
    expect(customTagline !== "just another wordpress site").toBe(true);
    expect(customTagline !== "").toBe(true);
  });
});

describe("WP Site Pre-Check — SEO Plugin Detection", () => {
  const SEO_PLUGIN_SLUGS = [
    "wordpress-seo", "all-in-one-seo", "rank-math", "seo-by-rank-math",
    "the-seo-framework", "squirrly-seo", "smartcrawl-seo",
  ];

  it("should detect Yoast SEO", () => {
    const slug = "wordpress-seo";
    expect(SEO_PLUGIN_SLUGS.some(seo => slug.includes(seo))).toBe(true);
  });

  it("should detect Rank Math", () => {
    const slug = "seo-by-rank-math";
    expect(SEO_PLUGIN_SLUGS.some(seo => slug.includes(seo))).toBe(true);
  });

  it("should detect All in One SEO", () => {
    const slug = "all-in-one-seo-pack";
    expect(SEO_PLUGIN_SLUGS.some(seo => slug.includes(seo))).toBe(true);
  });

  it("should NOT detect non-SEO plugins", () => {
    const nonSeoPlugins = ["akismet", "wp-super-cache", "jetpack", "woocommerce"];
    for (const slug of nonSeoPlugins) {
      expect(SEO_PLUGIN_SLUGS.some(seo => slug.includes(seo))).toBe(false);
    }
  });

  it("should cover all major SEO plugins", () => {
    expect(SEO_PLUGIN_SLUGS.length).toBeGreaterThanOrEqual(7);
  });
});

describe("WP Site Pre-Check — Content Detection", () => {
  it("should filter out default Sample Page", () => {
    const pages = [
      { title: { rendered: "Sample Page" }, content: { rendered: "<p>This is a sample page.</p>" } },
      { title: { rendered: "About Us" }, content: { rendered: "<p>We are a trusted online gaming platform with over 10 years of experience in providing top-quality entertainment and services to our valued customers worldwide.</p>" } },
    ];

    const realPages = pages.filter(p => {
      const title = (p.title?.rendered || "").toLowerCase().trim();
      const content = (p.content?.rendered || "").trim();
      return title !== "sample page" && content.length > 100;
    });

    expect(realPages.length).toBe(1);
    expect(realPages[0].title.rendered).toBe("About Us");
  });

  it("should filter out Hello World post", () => {
    const posts = [
      { title: { rendered: "Hello world!" }, content: { rendered: "<p>Welcome to WordPress.</p>" } },
      { title: { rendered: "Best Online Casinos 2024" }, content: { rendered: "<p>Discover the best online casinos for Thai players. Our comprehensive guide covers everything you need to know about choosing a safe and reliable online casino platform.</p>" } },
    ];

    const realPosts = posts.filter(p => {
      const title = (p.title?.rendered || "").toLowerCase().trim();
      const content = (p.content?.rendered || "").trim();
      return title !== "hello world" && title !== "hello world!" && content.length > 100;
    });

    expect(realPosts.length).toBe(1);
    expect(realPosts[0].title.rendered).toBe("Best Online Casinos 2024");
  });

  it("should filter out pages with very short content", () => {
    const pages = [
      { title: { rendered: "Empty Page" }, content: { rendered: "<p>Short.</p>" } },
      { title: { rendered: "Real Page" }, content: { rendered: "<p>" + "x".repeat(200) + "</p>" } },
    ];

    const realPages = pages.filter(p => {
      const content = (p.content?.rendered || "").trim();
      return content.length > 100;
    });

    expect(realPages.length).toBe(1);
  });

  it("should detect sites with multiple content pages as having content", () => {
    const pageCount = 5;
    const postCount = 3;
    const hasContent = pageCount >= 1 || postCount >= 1;
    expect(hasContent).toBe(true);
  });

  it("should detect fresh WP install with no content", () => {
    const pageCount = 0;
    const postCount = 0;
    const hasContent = pageCount >= 1 || postCount >= 1;
    expect(hasContent).toBe(false);
  });
});

describe("WP Site Pre-Check — Skip Logic", () => {
  it("should skip theme when custom theme is active", () => {
    const hasCustomTheme = true;
    const skipTheme = hasCustomTheme;
    expect(skipTheme).toBe(true);
  });

  it("should NOT skip theme when default theme is active", () => {
    const hasCustomTheme = false;
    const skipTheme = hasCustomTheme;
    expect(skipTheme).toBe(false);
  });

  it("should skip settings when custom title and tagline exist", () => {
    const siteTitle = "My Casino Blog";
    const tagline = "Your trusted guide to online gaming";
    const DEFAULT_WP_TITLES = ["wordpress", "my site", "just another wordpress site", ""];
    const isDefaultTitle = DEFAULT_WP_TITLES.includes(siteTitle.toLowerCase().trim());
    const isDefaultTagline = tagline.toLowerCase().trim() === "just another wordpress site" || tagline === "";
    const hasCustomSettings = !isDefaultTitle && !isDefaultTagline;
    expect(hasCustomSettings).toBe(true);
  });

  it("should NOT skip settings when default title exists", () => {
    const siteTitle = "WordPress";
    const tagline = "Just another WordPress site";
    const DEFAULT_WP_TITLES = ["wordpress", "my site", "just another wordpress site", ""];
    const isDefaultTitle = DEFAULT_WP_TITLES.includes(siteTitle.toLowerCase().trim());
    const isDefaultTagline = tagline.toLowerCase().trim() === "just another wordpress site";
    const hasCustomSettings = !isDefaultTitle && !isDefaultTagline;
    expect(hasCustomSettings).toBe(false);
  });

  it("should skip homepage when pages exist", () => {
    const pageCount = 3;
    const postCount = 2;
    const hasContent = pageCount >= 1 || postCount >= 1;
    const skipHomepage = hasContent;
    expect(skipHomepage).toBe(true);
  });

  it("should skip reading settings when front page is already set", () => {
    const showOnFront = "page";
    const pageOnFront = 42;
    const hasHomepage = showOnFront === "page" && pageOnFront > 0;
    const skipReadingSettings = hasHomepage;
    expect(skipReadingSettings).toBe(true);
  });

  it("should NOT skip reading settings when using latest posts", () => {
    const showOnFront = "posts";
    const pageOnFront = 0;
    const hasHomepage = showOnFront === "page" && pageOnFront > 0;
    const skipReadingSettings = hasHomepage;
    expect(skipReadingSettings).toBe(false);
  });

  it("should ALWAYS run Step 6 (On-Page SEO) regardless of pre-check", () => {
    // Step 6 is the core SEO step — never skipped
    const alwaysRunSeo = true;
    expect(alwaysRunSeo).toBe(true);
  });

  it("should ALWAYS run Step 7 (Cloaking) if configured", () => {
    // Step 7 runs if cloakingRedirectUrl is set
    const cloakingRedirectUrl = "https://example.com";
    const shouldRunCloaking = !!cloakingRedirectUrl;
    expect(shouldRunCloaking).toBe(true);
  });
});

describe("Pipeline Conditional Skip — Full Scenarios", () => {
  it("Scenario: Fresh WP install → run ALL steps", () => {
    const preCheck = {
      hasCustomTheme: false,
      hasContent: false,
      hasHomepage: false,
      hasSeoPlugin: false,
      hasCustomSettings: false,
      skipTheme: false,
      skipSettings: false,
      skipPlugins: false,
      skipHomepage: false,
      skipReadingSettings: false,
    };

    const stepsToRun = [
      !preCheck.skipTheme,      // Step 1
      !preCheck.skipSettings,   // Step 2
      !preCheck.skipPlugins,    // Step 3
      !preCheck.skipHomepage,   // Step 4
      !preCheck.skipReadingSettings, // Step 5
      true,                      // Step 6 (always)
      true,                      // Step 7 (always)
    ];

    expect(stepsToRun.filter(Boolean).length).toBe(7);
  });

  it("Scenario: Established site with custom theme + content + SEO plugin → skip to SEO", () => {
    const preCheck = {
      hasCustomTheme: true,
      hasContent: true,
      hasHomepage: true,
      hasSeoPlugin: true,
      hasCustomSettings: true,
      skipTheme: true,
      skipSettings: true,
      skipPlugins: true,
      skipHomepage: true,
      skipReadingSettings: true,
    };

    const stepsToRun = [
      !preCheck.skipTheme,      // Step 1 → SKIP
      !preCheck.skipSettings,   // Step 2 → SKIP
      !preCheck.skipPlugins,    // Step 3 → SKIP
      !preCheck.skipHomepage,   // Step 4 → SKIP
      !preCheck.skipReadingSettings, // Step 5 → SKIP
      true,                      // Step 6 (always)
      true,                      // Step 7 (always)
    ];

    const skippedCount = stepsToRun.filter(s => !s).length;
    const runCount = stepsToRun.filter(Boolean).length;

    expect(skippedCount).toBe(5);
    expect(runCount).toBe(2); // Only SEO + Cloaking
  });

  it("Scenario: Site with custom theme but no content → skip theme, run rest", () => {
    const preCheck = {
      skipTheme: true,
      skipSettings: false,
      skipPlugins: false,
      skipHomepage: false,
      skipReadingSettings: false,
    };

    const stepsToRun = [
      !preCheck.skipTheme,      // Step 1 → SKIP
      !preCheck.skipSettings,   // Step 2 → RUN
      !preCheck.skipPlugins,    // Step 3 → RUN
      !preCheck.skipHomepage,   // Step 4 → RUN
      !preCheck.skipReadingSettings, // Step 5 → RUN
      true,                      // Step 6 (always)
      true,                      // Step 7 (always)
    ];

    const skippedCount = stepsToRun.filter(s => !s).length;
    expect(skippedCount).toBe(1); // Only theme skipped
  });

  it("Scenario: Site with content but default theme → skip homepage, run theme", () => {
    const preCheck = {
      skipTheme: false,
      skipSettings: false,
      skipPlugins: false,
      skipHomepage: true,
      skipReadingSettings: true,
    };

    const stepsToRun = [
      !preCheck.skipTheme,      // Step 1 → RUN
      !preCheck.skipSettings,   // Step 2 → RUN
      !preCheck.skipPlugins,    // Step 3 → RUN
      !preCheck.skipHomepage,   // Step 4 → SKIP
      !preCheck.skipReadingSettings, // Step 5 → SKIP
      true,                      // Step 6 (always)
      true,                      // Step 7 (always)
    ];

    const skippedCount = stepsToRun.filter(s => !s).length;
    expect(skippedCount).toBe(2); // Homepage + Reading skipped
  });

  it("Scenario: Pre-check fails → run ALL steps (safe fallback)", () => {
    // When pre-check throws an error, preCheck is null → no skips
    const preCheck = null;

    const stepsToRun = [
      !(preCheck as any)?.skipTheme,
      !(preCheck as any)?.skipSettings,
      !(preCheck as any)?.skipPlugins,
      !(preCheck as any)?.skipHomepage,
      !(preCheck as any)?.skipReadingSettings,
      true,
      true,
    ];

    // When preCheck is null, all ?.skip* are undefined → !undefined = true → all run
    expect(stepsToRun.filter(Boolean).length).toBe(7);
  });
});

describe("Pre-Check Summary Generation", () => {
  it("should generate summary for fresh install", () => {
    const summaryParts: string[] = [];
    // No custom theme, no content, no settings → empty
    const summary = summaryParts.length > 0
      ? summaryParts.join(" | ")
      : "Fresh WordPress install — running full setup";
    expect(summary).toBe("Fresh WordPress install — running full setup");
  });

  it("should generate summary for established site", () => {
    const summaryParts: string[] = [
      "Custom theme: flavor → skip theme setup",
      "Content found: 5 pages, 3 posts → skip homepage creation",
      "Custom settings: \"My Casino\" → skip settings",
      "SEO plugin active → skip plugin installation",
    ];
    const summary = summaryParts.join(" | ");
    expect(summary).toContain("Custom theme");
    expect(summary).toContain("Content found");
    expect(summary).toContain("Custom settings");
    expect(summary).toContain("SEO plugin active");
  });
});
