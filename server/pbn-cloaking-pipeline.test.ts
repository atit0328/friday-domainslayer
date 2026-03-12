/**
 * Tests for Cloaking integration into PBN Auto-Setup Pipeline (Step 7)
 * and Cloaking tRPC router endpoints
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the wp-cloaking-engine before importing pbn-auto-setup
vi.mock("./wp-cloaking-engine", () => ({
  DEFAULT_CLOAKING_CONFIG: {
    redirectUrl: "",
    redirectUrls: [],
    enabled: false,
    redirectMethod: "js" as const,
    redirectDelay: 0,
    targetCountries: ["TH"],
    allowedBots: ["Googlebot", "Bingbot"],
    verifyBotIp: false,
  },
  deployFullCloaking: vi.fn().mockResolvedValue({
    success: true,
    methods: [
      { method: "functions.php", success: true, detail: "Injected" },
      { method: "mu-plugin", success: true, detail: "Created" },
      { method: "header_injection", success: false, detail: "No active theme" },
    ],
    phpCode: "<?php // cloaking",
    jsCode: "// cloaking js",
    config: { enabled: true, redirectUrl: "https://target.com" },
  }),
  generateCloakingPHP: vi.fn().mockReturnValue("<?php // cloaking code"),
  generateCloakingJS: vi.fn().mockReturnValue("// js cloaking code"),
  detectBot: vi.fn().mockReturnValue({
    isBot: true,
    botName: "Googlebot",
    confidence: "high",
    action: "serve_seo",
  }),
  identifyBot: vi.fn().mockReturnValue("Googlebot"),
  isGoogleBotIp: vi.fn().mockReturnValue(true),
}));

// Mock telegram notifier
vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue(true),
}));

// Mock proxy pool
vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ topics: [] }) } }],
  }),
}));

// Mock image generation
vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/img.png" }),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test", url: "https://cdn.example.com/test.png" }),
}));

// Mock db
vi.mock("./db", () => ({
  updatePbnSite: vi.fn().mockResolvedValue(undefined),
  updateSeoProject: vi.fn().mockResolvedValue(undefined),
}));

// Mock SEO content
vi.mock("./pbn-seo-content", () => ({
  generateSeoContent: vi.fn().mockResolvedValue({
    title: "Test",
    content: "<p>Test content</p>",
    metaDescription: "Test desc",
    slug: "test",
    schema: {},
    focusKeyword: "test",
  }),
}));

import { setupCloaking, type PBNSetupConfig } from "./pbn-auto-setup";
import { deployFullCloaking } from "./wp-cloaking-engine";
import { sendTelegramNotification } from "./telegram-notifier";

const baseConfig: PBNSetupConfig = {
  siteId: 1,
  siteUrl: "https://test-pbn.com",
  siteName: "Test PBN",
  username: "admin",
  appPassword: "xxxx xxxx xxxx xxxx",
  niche: "gambling",
  brandKeyword: "casino online",
};

describe("setupCloaking (PBN Pipeline Step 7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip cloaking when no redirectUrl is configured", async () => {
    const result = await setupCloaking(baseConfig);
    expect(result.step).toBe("cloaking");
    expect(result.success).toBe(true);
    expect(result.detail).toContain("Skipped");
    expect(deployFullCloaking).not.toHaveBeenCalled();
  });

  it("should deploy cloaking when redirectUrl is configured", async () => {
    const configWithCloaking: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target-casino.com",
    };

    const result = await setupCloaking(configWithCloaking);
    expect(result.step).toBe("cloaking");
    expect(result.success).toBe(true);
    expect(result.detail).toContain("Cloaking deployed");
    expect(result.detail).toContain("https://target-casino.com");
    expect(deployFullCloaking).toHaveBeenCalledOnce();
  });

  it("should pass correct WP config to deployFullCloaking", async () => {
    const configWithCloaking: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target.com",
    };

    await setupCloaking(configWithCloaking);

    expect(deployFullCloaking).toHaveBeenCalledWith(
      {
        siteUrl: "https://test-pbn.com",
        username: "admin",
        appPassword: "xxxx xxxx xxxx xxxx",
      },
      expect.objectContaining({
        redirectUrl: "https://target.com",
        enabled: true,
      }),
    );
  });

  it("should use custom redirect method and countries", async () => {
    const configWithOptions: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target.com",
      cloakingMethod: "301",
      cloakingCountries: ["TH", "VN", "MY"],
      cloakingDelay: 2000,
    };

    await setupCloaking(configWithOptions);

    expect(deployFullCloaking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        redirectMethod: "301",
        targetCountries: ["TH", "VN", "MY"],
        redirectDelay: 2000,
      }),
    );
  });

  it("should pass A/B split URLs", async () => {
    const configWithSplit: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target-a.com",
      cloakingRedirectUrls: ["https://target-b.com", "https://target-c.com"],
    };

    await setupCloaking(configWithSplit);

    expect(deployFullCloaking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        redirectUrl: "https://target-a.com",
        redirectUrls: ["https://target-b.com", "https://target-c.com"],
      }),
    );
  });

  it("should send Telegram notification on successful deploy", async () => {
    const configWithCloaking: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target.com",
    };

    await setupCloaking(configWithCloaking);

    expect(sendTelegramNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        targetUrl: "https://test-pbn.com",
      }),
    );
  });

  it("should return deploy method details in data", async () => {
    const configWithCloaking: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target.com",
    };

    const result = await setupCloaking(configWithCloaking);
    expect(result.data).toBeDefined();
    expect(result.data.redirectUrl).toBe("https://target.com");
    expect(result.data.deployMethods).toHaveLength(3);
    expect(result.data.deployMethods[0].success).toBe(true);
  });

  it("should handle deploy failure gracefully", async () => {
    vi.mocked(deployFullCloaking).mockResolvedValueOnce({
      success: false,
      methods: [
        { method: "functions.php", success: false, detail: "Permission denied" },
        { method: "mu-plugin", success: false, detail: "Cannot write" },
        { method: "header_injection", success: false, detail: "No theme" },
      ],
      phpCode: "",
      jsCode: "",
      config: { enabled: true, redirectUrl: "https://target.com" } as any,
    });

    const configWithCloaking: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target.com",
    };

    const result = await setupCloaking(configWithCloaking);
    expect(result.success).toBe(false);
    expect(result.detail).toContain("Cloaking deploy failed");
  });

  it("should handle exception gracefully", async () => {
    vi.mocked(deployFullCloaking).mockRejectedValueOnce(new Error("Network timeout"));

    const configWithCloaking: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target.com",
    };

    const result = await setupCloaking(configWithCloaking);
    expect(result.success).toBe(false);
    expect(result.detail).toContain("Cloaking error");
    expect(result.detail).toContain("Network timeout");
  });

  it("should default to js method when not specified", async () => {
    const configWithCloaking: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target.com",
    };

    await setupCloaking(configWithCloaking);

    expect(deployFullCloaking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        redirectMethod: "js",
        redirectDelay: 0,
        targetCountries: ["TH"],
      }),
    );
  });

  it("should set verifyBotIp to false for PBN sites", async () => {
    const configWithCloaking: PBNSetupConfig = {
      ...baseConfig,
      cloakingRedirectUrl: "https://target.com",
    };

    await setupCloaking(configWithCloaking);

    expect(deployFullCloaking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        verifyBotIp: false,
      }),
    );
  });
});

describe("PBNSetupConfig cloaking fields", () => {
  it("should accept all cloaking-related fields", () => {
    const config: PBNSetupConfig = {
      siteId: 1,
      siteUrl: "https://test.com",
      siteName: "Test",
      username: "admin",
      appPassword: "pass",
      niche: "gambling",
      brandKeyword: "casino",
      cloakingRedirectUrl: "https://redirect.com",
      cloakingRedirectUrls: ["https://a.com", "https://b.com"],
      cloakingMethod: "meta",
      cloakingCountries: ["TH", "VN"],
      cloakingDelay: 500,
    };

    expect(config.cloakingRedirectUrl).toBe("https://redirect.com");
    expect(config.cloakingRedirectUrls).toHaveLength(2);
    expect(config.cloakingMethod).toBe("meta");
    expect(config.cloakingCountries).toEqual(["TH", "VN"]);
    expect(config.cloakingDelay).toBe(500);
  });

  it("should have optional cloaking fields", () => {
    const config: PBNSetupConfig = {
      siteId: 1,
      siteUrl: "https://test.com",
      siteName: "Test",
      username: "admin",
      appPassword: "pass",
      niche: "gambling",
      brandKeyword: "casino",
    };

    expect(config.cloakingRedirectUrl).toBeUndefined();
    expect(config.cloakingRedirectUrls).toBeUndefined();
    expect(config.cloakingMethod).toBeUndefined();
  });
});
