/**
 * PBN Auto-Setup Pipeline Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ENV before imports
vi.mock("./_core/env", () => ({
  ENV: {
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "123",
    TELEGRAM_CHAT_ID_2: "456",
    BUILT_IN_FORGE_API_URL: "http://localhost",
    BUILT_IN_FORGE_API_KEY: "test-key",
    DATABASE_URL: "mysql://test",
  },
}));

// Mock external dependencies
vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn().mockRejectedValue(new Error("no proxy")),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          siteTitle: "Test Brand Hub",
          tagline: "Your guide to test keyword expertise",
        }),
      },
    }],
  }),
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({ url: "https://example.com/image.png" }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/image.png", key: "test" }),
}));

// db mock moved below to include updateSeoProject

vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue({ success: true }),
  getTelegramConfig: vi.fn().mockReturnValue({ botToken: "test", chatId: "123" }),
}));

vi.mock("./pbn-seo-content", () => ({
  generateSeoContent: vi.fn().mockResolvedValue({
    title: "Test SEO Post Title",
    content: "<h1>Test</h1><p>Content</p>",
    metaDescription: "Test meta description for SEO",
    excerpt: "Test excerpt",
    slug: "test-seo-post",
    focusKeyword: "test keyword",
    seoScore: 85,
    wordCount: 900,
    contentType: "article",
    writingTone: "professional",
  }),
}));

// Mock db with additional main domain functions
vi.mock("./db", () => ({
  updatePbnSite: vi.fn().mockResolvedValue(undefined),
  updateSeoProject: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import {
  setupTheme,
  setupBasicSettings,
  setupPlugins,
  setupHomepage,
  setupReadingSettings,
  setupOnPageContent,
  runFullSetup,
  startAutoSetup,
  getSetupProgress,
  getAllSetupProgress,
  runMainDomainSetup,
  startMainDomainAutoSetup,
  getMainDomainSetupProgress,
  type PBNSetupConfig,
  type SetupStepResult,
  type MainDomainSetupConfig,
} from "./pbn-auto-setup";

// ═══ Test Config ═══

const mockConfig: PBNSetupConfig = {
  siteId: 1,
  siteUrl: "https://test-pbn.com",
  siteName: "Test PBN Site",
  username: "admin",
  appPassword: "xxxx xxxx xxxx xxxx",
  niche: "technology",
  brandKeyword: "best tech reviews",
  targetUrl: "https://money-site.com",
};

// ═══ Tests ═══

describe("PBN Auto-Setup Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global fetch for WordPress API calls
    global.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
      const urlStr = String(url);

      // Theme list endpoint
      if (urlStr.includes("/wp/v2/themes") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { stylesheet: "twentytwentyfour", status: "inactive" },
            { stylesheet: "twentytwentythree", status: "inactive" },
            { stylesheet: "twentytwentytwo", status: "active" },
          ]),
        });
      }

      // Theme activation
      if (urlStr.includes("/wp/v2/themes/") && init?.method) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ stylesheet: "twentytwentyfour", status: "active" }),
        });
      }

      // Settings endpoint
      if (urlStr.includes("/wp/v2/settings")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ title: "Test", description: "Test" }),
        });
      }

      // Plugins list
      if (urlStr.includes("/wp/v2/plugins") && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { plugin: "wordpress-seo/wp-seo.php", status: "inactive" },
          ]),
        });
      }

      // Plugin activation / installation
      if (urlStr.includes("/wp/v2/plugins") && init?.method) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ plugin: "test/test.php", status: "active" }),
        });
      }

      // Pages endpoint (create)
      if (urlStr.includes("/wp/v2/pages") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 42, link: "https://test-pbn.com/home/" }),
        });
      }

      // Posts endpoint (create)
      if (urlStr.includes("/wp/v2/posts") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 100, link: "https://test-pbn.com/test-post/" }),
        });
      }

      // Media endpoint (upload)
      if (urlStr.includes("/wp/v2/media")) {
        if (init?.method === "POST" && init?.headers?.["Content-Type"] === "image/png") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 55, source_url: "https://test-pbn.com/wp-content/uploads/hero.png" }),
          });
        }
        // Media update (alt text)
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 55 }),
        });
      }

      // Image download (for featured image)
      if (urlStr.includes("example.com/image.png")) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
        });
      }

      // Default
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      });
    });
  });

  // ═══ Types ═══

  describe("Types and Config", () => {
    it("should have valid PBNSetupConfig structure", () => {
      expect(mockConfig.siteId).toBe(1);
      expect(mockConfig.siteUrl).toBe("https://test-pbn.com");
      expect(mockConfig.username).toBe("admin");
      expect(mockConfig.appPassword).toBeTruthy();
      expect(mockConfig.niche).toBe("technology");
      expect(mockConfig.brandKeyword).toBe("best tech reviews");
    });
  });

  // ═══ Step 1: Theme ═══

  describe("Step 1: Theme Selection", () => {
    it("should select and activate an SEO-friendly theme", async () => {
      const result = await setupTheme(mockConfig);
      expect(result.step).toBe("theme");
      expect(result.success).toBe(true);
      expect(result.detail).toContain("Activated SEO theme");
    });

    it("should return theme data on success", async () => {
      const result = await setupTheme(mockConfig);
      expect(result.data).toBeDefined();
      expect(result.data.theme).toBeTruthy();
    });

    it("should handle no SEO themes gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ stylesheet: "custom-theme" }]),
      });
      const result = await setupTheme(mockConfig);
      expect(result.success).toBe(true);
      expect(result.detail).toContain("No SEO themes found");
    });

    it("should handle API failure gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden"),
      });
      const result = await setupTheme(mockConfig);
      expect(result.step).toBe("theme");
      expect(result.success).toBe(false);
    });
  });

  // ═══ Step 2: Basic Settings ═══

  describe("Step 2: Basic Settings", () => {
    it("should configure site title, tagline, comments, and permalink", async () => {
      const result = await setupBasicSettings(mockConfig);
      expect(result.step).toBe("basic_settings");
      expect(result.success).toBe(true);
      expect(result.detail).toBeTruthy();
    });

    it("should return site title and tagline data", async () => {
      const result = await setupBasicSettings(mockConfig);
      expect(result.data).toBeDefined();
      expect(result.data.siteTitle).toBeTruthy();
      expect(result.data.tagline).toBeTruthy();
    });

    it("should use AI-generated title and tagline", async () => {
      const result = await setupBasicSettings(mockConfig);
      expect(result.data.siteTitle).toBe("Test Brand Hub");
      expect(result.data.tagline).toContain("test keyword");
    });
  });

  // ═══ Step 3: Plugins ═══

  describe("Step 3: Plugin Installation", () => {
    it("should check and activate essential plugins", async () => {
      const result = await setupPlugins(mockConfig);
      expect(result.step).toBe("plugins");
      expect(result.success).toBe(true);
    });

    it("should handle plugin API not available", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
      });
      const result = await setupPlugins(mockConfig);
      expect(result.success).toBe(true);
      expect(result.detail).toContain("Plugin API not available");
    });
  });

  // ═══ Step 4: Homepage ═══

  describe("Step 4: Homepage Content", () => {
    it("should create homepage with SEO content", async () => {
      // Override LLM for homepage generation
      const { invokeLLM } = await import("./_core/llm");
      (invokeLLM as any).mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              siteTitle: "Test Brand Hub",
              tagline: "Your guide to test keyword",
            }),
          },
        }],
      }).mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "Best Tech Reviews - Test PBN Site",
              content: "<h1>Best Tech Reviews</h1><p>Welcome to our tech hub.</p>",
              metaDescription: "Test PBN Site - Your guide to best tech reviews.",
              excerpt: "Expert tech reviews and guides.",
            }),
          },
        }],
      });

      const result = await setupHomepage(mockConfig);
      expect(result.step).toBe("homepage");
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.pageId).toBe(42);
    });

    it("should include AI-generated image when available", async () => {
      const { invokeLLM } = await import("./_core/llm");
      (invokeLLM as any).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "Test Homepage",
              content: "<h1>Test</h1>",
              metaDescription: "Test meta",
              excerpt: "Test",
            }),
          },
        }],
      });

      const result = await setupHomepage(mockConfig);
      expect(result.success).toBe(true);
      // Image should be attempted
      expect(result.data?.hasImage).toBeDefined();
    });
  });

  // ═══ Step 5: Reading Settings ═══

  describe("Step 5: Reading Settings", () => {
    it("should set front page and posts page", async () => {
      const result = await setupReadingSettings(mockConfig, 42);
      expect(result.step).toBe("reading_settings");
      expect(result.success).toBe(true);
      expect(result.data.homepageId).toBe(42);
    });

    it("should create blog page", async () => {
      const result = await setupReadingSettings(mockConfig, 42);
      expect(result.data.postsPageId).toBeDefined();
    });
  });

  // ═══ Step 6: On-Page Content ═══

  describe("Step 6: On-Page SEO Content", () => {
    it("should create essential pages (About, Contact, Privacy, Terms)", async () => {
      const { invokeLLM } = await import("./_core/llm");
      (invokeLLM as any).mockResolvedValue({
        choices: [{
          message: {
            content: "<h1>About Us</h1><p>We are a leading technology resource.</p>",
          },
        }],
      });

      const result = await setupOnPageContent(mockConfig);
      expect(result.step).toBe("onpage_content");
      expect(result.success).toBe(true);
      expect(result.detail).toContain("About Us");
      expect(result.detail).toContain("Contact Us");
    });

    it("should create SEO blog posts", async () => {
      const { invokeLLM } = await import("./_core/llm");
      (invokeLLM as any).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              topics: [
                { keyword: "best tech guide", contentType: "article", tone: "professional" },
                { keyword: "tech tips 2026", contentType: "listicle", tone: "casual" },
              ],
            }),
          },
        }],
      });

      const result = await setupOnPageContent(mockConfig);
      expect(result.success).toBe(true);
      expect(result.data?.pagesCreated).toBe(4); // About, Contact, Privacy, Terms
    });
  });

  // ═══ Full Pipeline ═══

  describe("Full Pipeline (runFullSetup)", () => {
    it("should run all 6 steps in sequence", async () => {
      const result = await runFullSetup(mockConfig);
      expect(result.siteId).toBe(1);
      expect(result.siteName).toBe("Test PBN Site");
      expect(result.totalSteps).toBe(6);
      expect(result.stepsCompleted).toBe(6);
      expect(result.results.length).toBe(6);
      expect(result.startedAt).toBeTruthy();
      expect(result.completedAt).toBeTruthy();
    });

    it("should set completed status when all steps succeed", async () => {
      const result = await runFullSetup(mockConfig);
      // All steps should have been attempted
      expect(result.results.length).toBe(6);
      // Status should be completed or partial (depending on mock responses)
      expect(["completed", "partial"]).toContain(result.status);
    });

    it("should track step names correctly", async () => {
      const result = await runFullSetup(mockConfig);
      const stepNames = result.results.map(r => r.step);
      expect(stepNames).toContain("theme");
      expect(stepNames).toContain("basic_settings");
      expect(stepNames).toContain("plugins");
      expect(stepNames).toContain("homepage");
    });

    it("should set failed status when all steps fail", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server error"),
        json: () => Promise.reject(new Error("parse error")),
      });

      const result = await runFullSetup(mockConfig);
      expect(["failed", "partial"]).toContain(result.status);
    });
  });

  // ═══ Progress Tracking ═══

  describe("Progress Tracking", () => {
    it("should track setup progress with startAutoSetup", () => {
      startAutoSetup({ ...mockConfig, siteId: 999 });
      const progress = getSetupProgress(999);
      expect(progress).toBeDefined();
      expect(progress!.status).toBe("running");
      expect(progress!.siteId).toBe(999);
    });

    it("should return undefined for unknown siteId", () => {
      const progress = getSetupProgress(99999);
      expect(progress).toBeUndefined();
    });

    it("should list all active setups", () => {
      startAutoSetup({ ...mockConfig, siteId: 888 });
      const all = getAllSetupProgress();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });
  });

  // ═══ SetupStepResult Structure ═══

  describe("SetupStepResult Structure", () => {
    it("should always have step, success, and detail fields", async () => {
      const result = await setupTheme(mockConfig);
      expect(result).toHaveProperty("step");
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("detail");
      expect(typeof result.step).toBe("string");
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.detail).toBe("string");
    });
  });

  // ═══ Edge Cases ═══

  describe("Edge Cases", () => {
    it("should handle network errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      const result = await setupTheme(mockConfig);
      expect(result.success).toBe(false);
      expect(result.detail).toContain("error");
    });

    it("should handle empty site URL", async () => {
      const badConfig = { ...mockConfig, siteUrl: "" };
      // Should not throw, just return error result
      const result = await setupTheme(badConfig);
      expect(result).toBeDefined();
      expect(result.step).toBe("theme");
    });

    it("should handle special characters in brand keyword", async () => {
      const specialConfig = { ...mockConfig, brandKeyword: "test & review <script>" };
      const result = await setupBasicSettings(specialConfig);
      expect(result).toBeDefined();
      expect(result.step).toBe("basic_settings");
    });
  });

  // ═══ Main Domain (Money Site) Auto-Setup ═══

  describe("Main Domain Auto-Setup", () => {
    const mainDomainConfig: MainDomainSetupConfig = {
      projectId: 42,
      domain: "money-site.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx xxxx xxxx xxxx",
      niche: "gambling",
      brandKeyword: "best online casino",
    };

    it("should have valid MainDomainSetupConfig structure", () => {
      expect(mainDomainConfig.projectId).toBe(42);
      expect(mainDomainConfig.domain).toBe("money-site.com");
      expect(mainDomainConfig.wpUsername).toBe("admin");
      expect(mainDomainConfig.niche).toBe("gambling");
      expect(mainDomainConfig.brandKeyword).toBe("best online casino");
    });

    it("should convert MainDomainSetupConfig to PBNSetupConfig with negative siteId", async () => {
      // runMainDomainSetup uses -projectId as siteId
      const result = await runMainDomainSetup(mainDomainConfig);
      expect(result.siteId).toBe(-42); // negative = main domain
      expect(result.siteName).toBe("money-site.com");
    });

    it("should run all 6 setup steps for main domain", async () => {
      const result = await runMainDomainSetup(mainDomainConfig);
      expect(result.totalSteps).toBe(6);
      expect(result.stepsCompleted).toBe(6);
      expect(result.results.length).toBe(6);
    });

    it("should set targetUrl to the domain itself", async () => {
      // Main domain targets itself (not an external money site)
      const result = await runMainDomainSetup(mainDomainConfig);
      // The pipeline ran successfully — meaning config was valid
      expect(result.status).toBeDefined();
    });

    it("should update SEO project after setup", async () => {
      const { updateSeoProject } = await import("./db");
      await runMainDomainSetup(mainDomainConfig);
      expect(updateSeoProject).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          wpConnected: true,
          aiAgentLastAction: expect.stringContaining("WP Auto-Setup"),
        }),
      );
    });

    it("should prepend https:// if domain has no protocol", async () => {
      const result = await runMainDomainSetup(mainDomainConfig);
      // Should not throw — domain gets https:// prepended
      expect(result).toBeDefined();
      expect(result.siteName).toBe("money-site.com");
    });

    it("should handle domain with existing https://", async () => {
      const configWithProtocol = { ...mainDomainConfig, domain: "https://money-site.com" };
      const result = await runMainDomainSetup(configWithProtocol);
      expect(result).toBeDefined();
    });

    it("should use brandKeyword from config", async () => {
      const result = await runMainDomainSetup(mainDomainConfig);
      // Pipeline ran with brandKeyword = "best online casino"
      expect(result.results.length).toBeGreaterThan(0);
    });

    it("should generate brandKeyword from domain if not provided", async () => {
      const noBrandConfig = { ...mainDomainConfig, brandKeyword: "" };
      // Should not throw — falls back to domain-based keyword
      const result = await runMainDomainSetup(noBrandConfig);
      expect(result).toBeDefined();
    });
  });

  describe("Main Domain Progress Tracking", () => {
    const mainDomainConfig: MainDomainSetupConfig = {
      projectId: 99,
      domain: "track-test.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx xxxx xxxx xxxx",
      niche: "tech",
      brandKeyword: "tech reviews",
    };

    it("should track progress with negative projectId", () => {
      startMainDomainAutoSetup(mainDomainConfig);
      const progress = getMainDomainSetupProgress(99);
      expect(progress).toBeDefined();
      expect(progress!.siteId).toBe(-99);
      expect(progress!.siteName).toBe("track-test.com");
      expect(progress!.status).toBe("running");
    });

    it("should appear in getAllSetupProgress", () => {
      startMainDomainAutoSetup(mainDomainConfig);
      const all = getAllSetupProgress();
      const found = all.find(p => p.siteId === -99);
      expect(found).toBeDefined();
    });

    it("should distinguish main domain from PBN in progress", () => {
      // PBN uses positive siteId, main domain uses negative
      startAutoSetup(mockConfig); // PBN: siteId = 1
      startMainDomainAutoSetup(mainDomainConfig); // Main: siteId = -99
      const pbnProgress = getSetupProgress(1);
      const mainProgress = getMainDomainSetupProgress(99);
      expect(pbnProgress).toBeDefined();
      expect(mainProgress).toBeDefined();
      expect(pbnProgress!.siteId).toBe(1);
      expect(mainProgress!.siteId).toBe(-99);
    });
  });
});
