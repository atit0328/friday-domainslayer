/**
 * Integration Tests — WordPress API + Campaign Engine
 * ทดสอบว่า WP API module และ Campaign Engine ทำงานได้จริง
 */
import { describe, it, expect } from "vitest";

describe("WordPress API Module", () => {
  it("should export WordPressAPI class", async () => {
    const mod = await import("./wp-api");
    expect(mod.WordPressAPI).toBeDefined();
    expect(typeof mod.WordPressAPI).toBe("function");
  });

  it("should export createWPClient helper", async () => {
    const mod = await import("./wp-api");
    expect(mod.createWPClient).toBeDefined();
    expect(typeof mod.createWPClient).toBe("function");
  });

  it("WordPressAPI should instantiate with credentials", async () => {
    const { WordPressAPI } = await import("./wp-api");
    const client = new WordPressAPI({
      siteUrl: "https://example.com",
      username: "testuser",
      appPassword: "xxxx xxxx xxxx xxxx",
    });
    expect(client).toBeDefined();
    expect(typeof client.testConnection).toBe("function");
    expect(typeof client.getPosts).toBe("function");
    expect(typeof client.getPages).toBe("function");
    expect(typeof client.updatePost).toBe("function");
    expect(typeof client.updatePage).toBe("function");
    expect(typeof client.createPost).toBe("function");
    expect(typeof client.createPage).toBe("function");
    expect(typeof client.getPlugins).toBe("function");
    expect(typeof client.detectSEOPlugin).toBe("function");
    expect(typeof client.updateSEOMeta).toBe("function");
    expect(typeof client.injectSchemaMarkup).toBe("function");
    expect(typeof client.auditAllContent).toBe("function");
    expect(typeof client.addInternalLinks).toBe("function");
    expect(typeof client.fixImageAltTexts).toBe("function");
    expect(typeof client.optimizeSlug).toBe("function");
    expect(typeof client.updateSiteBranding).toBe("function");
  });

  it("createWPClient should return a WordPressAPI instance", async () => {
    const { createWPClient, WordPressAPI } = await import("./wp-api");
    const client = createWPClient({
      siteUrl: "https://example.com",
      username: "admin",
      appPassword: "test pass",
    });
    expect(client).toBeInstanceOf(WordPressAPI);
  });

  it("testConnection should fail gracefully for invalid domain", async () => {
    const { WordPressAPI } = await import("./wp-api");
    const client = new WordPressAPI({
      siteUrl: "https://this-domain-does-not-exist-12345.com",
      username: "admin",
      appPassword: "xxxx",
    });
    const result = await client.testConnection();
    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
  }, 30000);

  it("getSiteInfo should fail gracefully for invalid domain", async () => {
    const { WordPressAPI } = await import("./wp-api");
    const client = new WordPressAPI({
      siteUrl: "https://this-domain-does-not-exist-12345.com",
      username: "admin",
      appPassword: "xxxx",
    });
    await expect(client.getSiteInfo()).rejects.toThrow();
  }, 30000);
});

describe("Campaign Engine", () => {
  it("should export CAMPAIGN_PHASES with 16 phases", async () => {
    const { CAMPAIGN_PHASES } = await import("./campaign-engine");
    expect(CAMPAIGN_PHASES).toBeDefined();
    expect(CAMPAIGN_PHASES.length).toBe(16);
  });

  it("each phase should have required fields", async () => {
    const { CAMPAIGN_PHASES } = await import("./campaign-engine");
    for (const phase of CAMPAIGN_PHASES) {
      expect(phase.id).toBeDefined();
      expect(typeof phase.id).toBe("number");
      expect(phase.name).toBeDefined();
      expect(typeof phase.name).toBe("string");
      expect(phase.thaiName).toBeDefined();
      expect(typeof phase.thaiName).toBe("string");
      expect(phase.description).toBeDefined();
      expect(typeof phase.description).toBe("string");
      expect(typeof phase.requiresWP).toBe("boolean");
    }
  });

  it("phases should be numbered 0-15 sequentially", async () => {
    const { CAMPAIGN_PHASES } = await import("./campaign-engine");
    for (let i = 0; i < 16; i++) {
      expect(CAMPAIGN_PHASES[i].id).toBe(i);
    }
  });

  it("should export runPhase function", async () => {
    const mod = await import("./campaign-engine");
    expect(mod.runPhase).toBeDefined();
    expect(typeof mod.runPhase).toBe("function");
  });

  it("should export runAllPhases function", async () => {
    const mod = await import("./campaign-engine");
    expect(mod.runAllPhases).toBeDefined();
    expect(typeof mod.runAllPhases).toBe("function");
  });

  it("should export PhaseResult interface (via type check)", async () => {
    const { CAMPAIGN_PHASES } = await import("./campaign-engine");
    // Verify the phase structure matches what the engine expects
    const phase0 = CAMPAIGN_PHASES[0];
    expect(phase0.name).toBe("Technical Audit");
    expect(phase0.requiresWP).toBe(false);
  });

  it("WP-required phases should be correctly marked", async () => {
    const { CAMPAIGN_PHASES } = await import("./campaign-engine");
    // On-Page Optimization (2), Local SEO (5), Schema Markup (6), Content Creation (8), Internal Linking (9), Social Signals (11) require WP
    const wpPhases = CAMPAIGN_PHASES.filter(p => p.requiresWP);
    expect(wpPhases.length).toBeGreaterThanOrEqual(5);
    
    // Non-WP phases
    expect(CAMPAIGN_PHASES[0].requiresWP).toBe(false); // Technical Audit
    expect(CAMPAIGN_PHASES[1].requiresWP).toBe(false); // Keyword Research
    expect(CAMPAIGN_PHASES[2].requiresWP).toBe(true);  // On-Page Optimization
    expect(CAMPAIGN_PHASES[8].requiresWP).toBe(true);  // Content Creation
    expect(CAMPAIGN_PHASES[9].requiresWP).toBe(true);  // Internal Linking
  });
});

describe("Campaign Engine — Phase Names", () => {
  it("should have all 16 phase names", async () => {
    const { CAMPAIGN_PHASES } = await import("./campaign-engine");
    const expectedNames = [
      "Technical Audit",
      "Keyword Research",
      "On-Page Optimization",
      "Content Strategy",
      "Link Building Plan",
      "Local SEO Setup",
      "Schema Markup",
      "Core Web Vitals",
      "Content Creation",
      "Internal Linking",
      "Off-Page SEO",
      "Social Signals",
      "Monitoring Setup",
      "Competitor Analysis",
      "Performance Review",
      "Final Report",
    ];
    for (let i = 0; i < expectedNames.length; i++) {
      expect(CAMPAIGN_PHASES[i].name).toBe(expectedNames[i]);
    }
  });
});

describe("User Management Router", () => {
  it("should export userManagementRouter", async () => {
    const mod = await import("./routers/user-management");
    expect(mod.userManagementRouter).toBeDefined();
  });

  it("userManagementRouter should have list, updateRole, getUser, stats procedures", async () => {
    const { userManagementRouter } = await import("./routers/user-management");
    const procedures = Object.keys((userManagementRouter as any)._def.procedures ?? {});
    expect(procedures).toContain("list");
    expect(procedures).toContain("updateRole");
    expect(procedures).toContain("getUser");
    expect(procedures).toContain("stats");
  });
});
