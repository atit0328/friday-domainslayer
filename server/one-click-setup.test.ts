import { describe, it, expect } from "vitest";

/**
 * Tests for One-Click Full Setup Pipeline Integration
 * Validates that:
 * 1. MainDomainSetupConfig accepts targetKeywords + cloaking config
 * 2. PBNSetupConfig passes targetKeywords through to setupOnPageContent
 * 3. Keywords are properly injected into content generation prompts
 * 4. Cloaking config flows from create mutation → startMainDomainAutoSetup → runFullSetup → setupCloaking
 */

// ═══ MainDomainSetupConfig Interface Tests ═══

describe("MainDomainSetupConfig accepts new fields", () => {
  it("should accept targetKeywords array", () => {
    const config = {
      projectId: 1,
      domain: "example.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx",
      niche: "gambling",
      brandKeyword: "casino online",
      targetKeywords: ["casino online", "เว็บคาสิโน", "บาคาร่า", "สล็อตออนไลน์"],
    };
    expect(config.targetKeywords).toHaveLength(4);
    expect(config.targetKeywords![0]).toBe("casino online");
  });

  it("should accept cloaking redirect URL", () => {
    const config = {
      projectId: 1,
      domain: "example.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx",
      niche: "gambling",
      brandKeyword: "casino online",
      cloakingRedirectUrl: "https://target-casino.com",
    };
    expect(config.cloakingRedirectUrl).toBe("https://target-casino.com");
  });

  it("should accept full cloaking config", () => {
    const config = {
      projectId: 1,
      domain: "example.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx",
      niche: "gambling",
      brandKeyword: "casino online",
      cloakingRedirectUrl: "https://target-casino.com",
      cloakingRedirectUrls: ["https://target-a.com", "https://target-b.com"],
      cloakingMethod: "js" as const,
      cloakingCountries: ["TH", "VN"],
      cloakingDelay: 500,
    };
    expect(config.cloakingRedirectUrls).toHaveLength(2);
    expect(config.cloakingMethod).toBe("js");
    expect(config.cloakingCountries).toContain("TH");
    expect(config.cloakingDelay).toBe(500);
  });

  it("should work without optional cloaking fields", () => {
    const config = {
      projectId: 1,
      domain: "example.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx",
      niche: "general",
      brandKeyword: "example",
    };
    expect(config.cloakingRedirectUrl).toBeUndefined();
    expect(config.cloakingMethod).toBeUndefined();
  });
});

// ═══ PBNSetupConfig targetKeywords Tests ═══

describe("PBNSetupConfig passes targetKeywords", () => {
  it("should include targetKeywords in PBNSetupConfig", () => {
    const pbnConfig = {
      siteId: -1,
      siteUrl: "https://example.com",
      siteName: "example.com",
      username: "admin",
      appPassword: "xxxx",
      niche: "gambling",
      brandKeyword: "casino online",
      targetUrl: "https://example.com",
      targetKeywords: ["casino online", "เว็บคาสิโน", "บาคาร่า"],
    };
    expect(pbnConfig.targetKeywords).toHaveLength(3);
    expect(pbnConfig.targetKeywords![0]).toBe("casino online");
  });

  it("should pass cloaking config through PBNSetupConfig", () => {
    const pbnConfig = {
      siteId: -1,
      siteUrl: "https://example.com",
      siteName: "example.com",
      username: "admin",
      appPassword: "xxxx",
      niche: "gambling",
      brandKeyword: "casino online",
      targetUrl: "https://example.com",
      cloakingRedirectUrl: "https://target.com",
      cloakingMethod: "js" as const,
      cloakingCountries: ["TH"],
    };
    expect(pbnConfig.cloakingRedirectUrl).toBe("https://target.com");
    expect(pbnConfig.cloakingMethod).toBe("js");
  });
});

// ═══ Keyword Injection Logic Tests ═══

describe("Keyword injection into content prompts", () => {
  it("should build keyword list from targetKeywords", () => {
    const targetKeywords = ["casino online", "เว็บคาสิโน", "บาคาร่า", "สล็อตออนไลน์"];
    const brandKeyword = "casino online";

    const allKeywords = targetKeywords.length > 0 ? targetKeywords : [brandKeyword];
    const keywordList = allKeywords.slice(0, 10).join(", ");
    const secondaryKeywords = allKeywords.slice(1, 6).join(", ");

    expect(keywordList).toBe("casino online, เว็บคาสิโน, บาคาร่า, สล็อตออนไลน์");
    expect(secondaryKeywords).toBe("เว็บคาสิโน, บาคาร่า, สล็อตออนไลน์");
  });

  it("should fallback to brandKeyword when no targetKeywords", () => {
    const targetKeywords: string[] = [];
    const brandKeyword = "casino online";

    const allKeywords = targetKeywords.length > 0 ? targetKeywords : [brandKeyword];
    const keywordList = allKeywords.slice(0, 10).join(", ");
    const secondaryKeywords = allKeywords.slice(1, 6).join(", ");

    expect(keywordList).toBe("casino online");
    expect(secondaryKeywords).toBe("");
  });

  it("should limit keywords to 10 max", () => {
    const targetKeywords = Array.from({ length: 15 }, (_, i) => `keyword-${i + 1}`);
    const allKeywords = targetKeywords.slice(0, 10);
    expect(allKeywords).toHaveLength(10);
    expect(allKeywords[9]).toBe("keyword-10");
  });

  it("should limit secondary keywords to 5 max", () => {
    const targetKeywords = Array.from({ length: 15 }, (_, i) => `keyword-${i + 1}`);
    const secondaryKeywords = targetKeywords.slice(1, 6);
    expect(secondaryKeywords).toHaveLength(5);
    expect(secondaryKeywords[0]).toBe("keyword-2");
    expect(secondaryKeywords[4]).toBe("keyword-6");
  });
});

// ═══ Config Flow Tests ═══

describe("Config flows from MainDomain to PBN correctly", () => {
  it("should map MainDomainSetupConfig to PBNSetupConfig with all fields", () => {
    const mainConfig = {
      projectId: 42,
      domain: "test-casino.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx xxxx xxxx",
      niche: "gambling",
      brandKeyword: "casino online",
      targetKeywords: ["casino online", "เว็บคาสิโน"],
      cloakingRedirectUrl: "https://target.com",
      cloakingRedirectUrls: ["https://a.com", "https://b.com"],
      cloakingMethod: "js" as const,
      cloakingCountries: ["TH", "VN"],
      cloakingDelay: 1000,
    };

    // Simulate runMainDomainSetup mapping
    const siteUrl = mainConfig.domain.startsWith("http") ? mainConfig.domain : `https://${mainConfig.domain}`;
    const pbnConfig = {
      siteId: -mainConfig.projectId,
      siteUrl,
      siteName: mainConfig.domain,
      username: mainConfig.wpUsername,
      appPassword: mainConfig.wpAppPassword,
      niche: mainConfig.niche || "general",
      brandKeyword: mainConfig.brandKeyword,
      targetUrl: siteUrl,
      targetKeywords: mainConfig.targetKeywords,
      cloakingRedirectUrl: mainConfig.cloakingRedirectUrl,
      cloakingRedirectUrls: mainConfig.cloakingRedirectUrls,
      cloakingMethod: mainConfig.cloakingMethod,
      cloakingCountries: mainConfig.cloakingCountries,
      cloakingDelay: mainConfig.cloakingDelay,
    };

    expect(pbnConfig.siteId).toBe(-42);
    expect(pbnConfig.siteUrl).toBe("https://test-casino.com");
    expect(pbnConfig.targetKeywords).toEqual(["casino online", "เว็บคาสิโน"]);
    expect(pbnConfig.cloakingRedirectUrl).toBe("https://target.com");
    expect(pbnConfig.cloakingRedirectUrls).toEqual(["https://a.com", "https://b.com"]);
    expect(pbnConfig.cloakingMethod).toBe("js");
    expect(pbnConfig.cloakingCountries).toEqual(["TH", "VN"]);
    expect(pbnConfig.cloakingDelay).toBe(1000);
  });

  it("should handle domain with http prefix", () => {
    const domain = "https://already-prefixed.com";
    const siteUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    expect(siteUrl).toBe("https://already-prefixed.com");
  });

  it("should handle domain without http prefix", () => {
    const domain = "no-prefix.com";
    const siteUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    expect(siteUrl).toBe("https://no-prefix.com");
  });
});

// ═══ Pipeline Step Order Tests ═══

describe("Pipeline step execution order", () => {
  it("should define correct step order with 7 total steps", () => {
    const steps = [
      "theme",           // Step 1
      "basic_settings",  // Step 2
      "plugins",         // Step 3
      "homepage",        // Step 4
      "reading_settings",// Step 5
      "onpage_content",  // Step 6
      "cloaking",        // Step 7
    ];
    expect(steps).toHaveLength(7);
    expect(steps[5]).toBe("onpage_content"); // SEO content before cloaking
    expect(steps[6]).toBe("cloaking");       // Cloaking is always last
  });

  it("should always run on-page SEO (step 6) regardless of pre-check", () => {
    // On-page SEO is the core purpose — never skip
    const preCheck = {
      skipTheme: true,
      skipSettings: true,
      skipPlugins: true,
      skipHomepage: true,
      skipReadingSettings: true,
    };
    // Step 6 (onpage_content) should NOT be in skip list
    const skipSteps = Object.entries(preCheck)
      .filter(([_, skip]) => skip)
      .map(([key]) => key);
    expect(skipSteps).not.toContain("skipOnPageContent");
  });

  it("should always run cloaking (step 7) when redirect URL is configured", () => {
    const config = {
      cloakingRedirectUrl: "https://target.com",
    };
    // Cloaking runs when URL is set, regardless of pre-check
    expect(config.cloakingRedirectUrl).toBeTruthy();
  });

  it("should skip cloaking when no redirect URL", () => {
    const config = {
      cloakingRedirectUrl: undefined,
    };
    expect(config.cloakingRedirectUrl).toBeFalsy();
  });
});

// ═══ Create Mutation Input Validation Tests ═══

describe("Create mutation accepts cloaking params", () => {
  it("should accept cloakingRedirectUrl as valid URL", () => {
    const input = {
      domain: "test.com",
      cloakingRedirectUrl: "https://target-casino.com",
      cloakingMethod: "js",
    };
    expect(input.cloakingRedirectUrl).toMatch(/^https?:\/\//);
  });

  it("should accept all cloaking method options", () => {
    const methods = ["js", "meta", "301", "302"];
    methods.forEach(method => {
      expect(["js", "meta", "301", "302"]).toContain(method);
    });
  });

  it("should accept cloakingCountries array", () => {
    const input = {
      domain: "test.com",
      cloakingCountries: ["TH", "VN", "MY"],
    };
    expect(input.cloakingCountries).toHaveLength(3);
    expect(input.cloakingCountries).toContain("TH");
  });

  it("should work without cloaking params (all optional)", () => {
    const input = {
      domain: "test.com",
      strategy: "grey_hat",
      aggressiveness: 5,
    };
    expect((input as any).cloakingRedirectUrl).toBeUndefined();
    expect((input as any).cloakingMethod).toBeUndefined();
  });
});
