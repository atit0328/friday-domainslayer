/**
 * Tests for wp-setup-engine.ts and backlink-verifier.ts
 */
import { describe, it, expect } from "vitest";

// ─── WP Setup Engine Tests ───
describe("WP Setup Engine", () => {
  describe("exports", () => {
    it("should export runWPSetup function", async () => {
      const mod = await import("./wp-setup-engine");
      expect(typeof mod.runWPSetup).toBe("function");
    });

    it("should export generateWebsiteSchema function", async () => {
      const mod = await import("./wp-setup-engine");
      expect(typeof mod.generateWebsiteSchema).toBe("function");
    });

    it("should export generateOrganizationSchema function", async () => {
      const mod = await import("./wp-setup-engine");
      expect(typeof mod.generateOrganizationSchema).toBe("function");
    });
  });

  describe("generateWebsiteSchema", () => {
    it("should generate valid schema object for a website", async () => {
      const { generateWebsiteSchema } = await import("./wp-setup-engine");
      const schema = generateWebsiteSchema({
        siteName: "Test Site",
        siteUrl: "https://example.com",
        description: "A test website",
      });
      expect(schema["@context"]).toBe("https://schema.org");
      expect(schema["@type"]).toBe("WebSite");
      expect(schema.name).toBe("Test Site");
      expect(schema.url).toBe("https://example.com");
      expect(schema.description).toBe("A test website");
    });

    it("should include SearchAction potentialAction", async () => {
      const { generateWebsiteSchema } = await import("./wp-setup-engine");
      const schema = generateWebsiteSchema({
        siteName: "My Site",
        siteUrl: "https://mysite.com",
        description: "Description",
      });
      expect(schema.potentialAction).toBeDefined();
      expect(schema.potentialAction["@type"]).toBe("SearchAction");
      expect(schema.potentialAction.target).toContain("https://mysite.com");
    });

    it("should produce JSON-serializable output", async () => {
      const { generateWebsiteSchema } = await import("./wp-setup-engine");
      const schema = generateWebsiteSchema({
        siteName: "My Site",
        siteUrl: "https://mysite.com",
        description: "Description",
      });
      expect(() => JSON.stringify(schema)).not.toThrow();
    });
  });

  describe("generateOrganizationSchema", () => {
    it("should generate valid schema object for an organization", async () => {
      const { generateOrganizationSchema } = await import("./wp-setup-engine");
      const schema = generateOrganizationSchema({
        name: "Test Org",
        url: "https://example.com",
        description: "A test org",
      });
      expect(schema["@context"]).toBe("https://schema.org");
      expect(schema["@type"]).toBe("Organization");
      expect(schema.name).toBe("Test Org");
      expect(schema.url).toBe("https://example.com");
    });

    it("should produce JSON-serializable output", async () => {
      const { generateOrganizationSchema } = await import("./wp-setup-engine");
      const schema = generateOrganizationSchema({
        name: "Org",
        url: "https://org.com",
        description: "An org",
      });
      expect(() => JSON.stringify(schema)).not.toThrow();
    });
  });
});

// ─── Backlink Verifier Tests ───
describe("Backlink Verifier", () => {
  describe("exports", () => {
    it("should export verifyBacklink function", async () => {
      const mod = await import("./backlink-verifier");
      expect(typeof mod.verifyBacklink).toBe("function");
    });

    it("should export verifyBacklinks function", async () => {
      const mod = await import("./backlink-verifier");
      expect(typeof mod.verifyBacklinks).toBe("function");
    });
  });

  describe("verifyBacklink", () => {
    it("should return correct shape for unreachable URLs", async () => {
      const { verifyBacklink } = await import("./backlink-verifier");
      const result = await verifyBacklink({
        sourceUrl: "https://this-domain-does-not-exist-12345.com/page",
        targetDomain: "example.com",
        platform: "test",
      });
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("sourceUrl");
      expect(result).toHaveProperty("httpStatus");
      expect(result).toHaveProperty("hasTargetLink");
      expect(result).toHaveProperty("isDofollow");
      expect(result).toHaveProperty("responseTimeMs");
      expect(result).toHaveProperty("detail");
      expect(result).toHaveProperty("checkedAt");
      expect(["broken", "error", "timeout"]).toContain(result.status);
    });

    it("should include responseTimeMs >= 0", async () => {
      const { verifyBacklink } = await import("./backlink-verifier");
      const result = await verifyBacklink({
        sourceUrl: "https://this-domain-does-not-exist-12345.com/page",
        targetDomain: "example.com",
        platform: "test",
      });
      expect(typeof result.responseTimeMs).toBe("number");
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("verifyBacklinks batch", () => {
    it("should handle empty backlinks array", async () => {
      const { verifyBacklinks } = await import("./backlink-verifier");
      const result = await verifyBacklinks([]);
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("verified");
      expect(result).toHaveProperty("broken");
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("should verify multiple backlinks and return correct totals", async () => {
      const { verifyBacklinks } = await import("./backlink-verifier");
      const backlinks = [
        { sourceUrl: "https://nonexistent-domain-1234.com/page1", targetDomain: "example.com", platform: "test1" },
        { sourceUrl: "https://nonexistent-domain-5678.com/page2", targetDomain: "example.com", platform: "test2" },
      ];
      const result = await verifyBacklinks(backlinks);
      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.broken + result.error + result.timeout).toBe(2);
    });

    it("should include a summary string", async () => {
      const { verifyBacklinks } = await import("./backlink-verifier");
      const result = await verifyBacklinks([]);
      expect(typeof result.summary).toBe("string");
    });
  });
});
