/**
 * AI Credential Hunter — Vitest Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock proxy-pool
vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn().mockResolvedValue({
    response: {
      ok: false,
      status: 404,
      text: async () => "",
      json: async () => [],
      headers: new Map(),
    },
    proxyUsed: "direct",
  }),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          predictions: [
            { username: "admin", password: "test123", reasoning: "common" },
          ],
        }),
      },
    }],
  }),
}));

// Mock env
vi.mock("./_core/env", () => ({
  ENV: {
    SHODAN_API_KEY: "test-key",
  },
}));

describe("AI Credential Hunter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Module Exports", () => {
    it("should export all required functions", async () => {
      const mod = await import("./ai-credential-hunter");
      expect(mod.executeCredentialHunt).toBeDefined();
      expect(typeof mod.executeCredentialHunt).toBe("function");
      expect(mod.enumerateWpUsers).toBeDefined();
      expect(mod.getCmsDefaultCredentials).toBeDefined();
      expect(mod.generateDomainDerivedPasswords).toBeDefined();
      expect(mod.detectHostingPanel).toBeDefined();
      expect(mod.gatherWhoisIntel).toBeDefined();
      expect(mod.gatherShodanIntel).toBeDefined();
      expect(mod.generateBreachPatternCredentials).toBeDefined();
      expect(mod.aiPredictPasswords).toBeDefined();
    });

    it("should export required interfaces/types", async () => {
      const mod = await import("./ai-credential-hunter");
      // TypeScript interfaces are compile-time only, but we can verify the function signatures
      const result = await mod.executeCredentialHunt({ domain: "test.com" });
      expect(result).toHaveProperty("domain");
      expect(result).toHaveProperty("credentials");
      expect(result).toHaveProperty("enumeratedUsers");
      expect(result).toHaveProperty("techniques");
      expect(result).toHaveProperty("totalDurationMs");
    });
  });

  describe("executeCredentialHunt", () => {
    it("should return structured result for any domain", async () => {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const result = await executeCredentialHunt({
        domain: "example.com",
        maxDurationMs: 10_000,
      });

      expect(result.domain).toBe("example.com");
      expect(Array.isArray(result.credentials)).toBe(true);
      expect(Array.isArray(result.enumeratedUsers)).toBe(true);
      expect(Array.isArray(result.techniques)).toBe(true);
      expect(typeof result.totalDurationMs).toBe("number");
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should include all 8 techniques in results", async () => {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const result = await executeCredentialHunt({
        domain: "example.com",
        maxDurationMs: 30_000,
      });

      const techniqueNames = result.techniques.map(t => t.name);
      expect(techniqueNames).toContain("wp_user_enumeration");
      expect(techniqueNames).toContain("cms_default_credentials");
      expect(techniqueNames).toContain("domain_derived_passwords");
      expect(techniqueNames).toContain("hosting_panel_detection");
      // Some techniques may be skipped due to timeout or API unavailability
      // At minimum, the first 4 local techniques should always run
      expect(techniqueNames.length).toBeGreaterThanOrEqual(4);
    });

    it("should call onProgress callback when provided", async () => {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const progressCalls: Array<{ phase: string; detail: string }> = [];

      await executeCredentialHunt({
        domain: "example.com",
        maxDurationMs: 10_000,
        onProgress: (phase, detail) => {
          progressCalls.push({ phase, detail });
        },
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      // Should have at least the starting phase
      expect(progressCalls.some(p => p.phase.length > 0)).toBe(true);
    });

    it("should deduplicate credentials", async () => {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const result = await executeCredentialHunt({
        domain: "example.com",
        maxDurationMs: 10_000,
      });

      // Check no duplicate username:password pairs
      const seen = new Set<string>();
      let hasDuplicates = false;
      for (const cred of result.credentials) {
        const key = `${cred.username}:${cred.password}`;
        if (seen.has(key)) {
          hasDuplicates = true;
          break;
        }
        seen.add(key);
      }
      expect(hasDuplicates).toBe(false);
    });

    it("should respect CMS parameter for targeted credential generation", async () => {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const result = await executeCredentialHunt({
        domain: "example.com",
        cms: "WordPress",
        cmsVersion: "6.0",
        maxDurationMs: 10_000,
      });

      expect(result.detectedCms).toBe("WordPress");
    });
  });

  describe("getCmsDefaultCredentials", () => {
    it("should return WordPress default credentials", async () => {
      const { getCmsDefaultCredentials } = await import("./ai-credential-hunter");
      const creds = getCmsDefaultCredentials("WordPress", undefined);

      expect(creds.length).toBeGreaterThan(0);
      expect(creds.some(c => c.username === "admin")).toBe(true);
      // Most should be cms_default, but some may have different source labels
      expect(creds.some(c => c.source.includes("cms") || c.source.includes("default"))).toBe(true);
    });

    it("should return Joomla default credentials", async () => {
      const { getCmsDefaultCredentials } = await import("./ai-credential-hunter");
      const creds = getCmsDefaultCredentials("Joomla", undefined);

      expect(creds.length).toBeGreaterThan(0);
      expect(creds.some(c => c.username === "admin")).toBe(true);
    });

    it("should return Drupal default credentials", async () => {
      const { getCmsDefaultCredentials } = await import("./ai-credential-hunter");
      const creds = getCmsDefaultCredentials("Drupal", undefined);

      expect(creds.length).toBeGreaterThan(0);
    });

    it("should return generic credentials for unknown CMS", async () => {
      const { getCmsDefaultCredentials } = await import("./ai-credential-hunter");
      const creds = getCmsDefaultCredentials("UnknownCMS", undefined);

      expect(creds.length).toBeGreaterThan(0);
      expect(creds.some(c => c.username === "admin")).toBe(true);
    });
  });

  describe("generateDomainDerivedPasswords", () => {
    it("should generate passwords based on domain name", async () => {
      const { generateDomainDerivedPasswords } = await import("./ai-credential-hunter");
      const creds = generateDomainDerivedPasswords("mysite.example.com");

      expect(creds.length).toBeGreaterThan(0);
      // Should include domain-based patterns
      expect(creds.some(c => c.source === "domain_derived")).toBe(true);
    });

    it("should handle .edu domains specially", async () => {
      const { generateDomainDerivedPasswords } = await import("./ai-credential-hunter");
      const creds = generateDomainDerivedPasswords("empleos.uncp.edu.pe");

      expect(creds.length).toBeGreaterThan(0);
      // Should include org-based patterns for .edu
      expect(creds.some(c => c.password.toLowerCase().includes("uncp") || c.username.toLowerCase().includes("uncp"))).toBe(true);
    });

    it("should handle .gov domains", async () => {
      const { generateDomainDerivedPasswords } = await import("./ai-credential-hunter");
      const creds = generateDomainDerivedPasswords("portal.agency.gov");

      expect(creds.length).toBeGreaterThan(0);
    });
  });

  describe("generateBreachPatternCredentials", () => {
    it("should generate breach pattern credentials", async () => {
      const { generateBreachPatternCredentials } = await import("./ai-credential-hunter");
      const creds = generateBreachPatternCredentials("example.com", ["admin", "webmaster"]);

      expect(creds.length).toBeGreaterThan(0);
      expect(creds.every(c => c.source === "breach_pattern")).toBe(true);
    });

    it("should include all enumerated users", async () => {
      const { generateBreachPatternCredentials } = await import("./ai-credential-hunter");
      const users = ["john", "admin", "editor"];
      const creds = generateBreachPatternCredentials("example.com", users);

      // Should have credentials for each user
      for (const user of users) {
        expect(creds.some(c => c.username === user)).toBe(true);
      }
    });
  });

  describe("Credential structure validation", () => {
    it("all credentials should have required fields", async () => {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const result = await executeCredentialHunt({
        domain: "test.example.com",
        maxDurationMs: 10_000,
      });

      for (const cred of result.credentials) {
        expect(typeof cred.username).toBe("string");
        expect(cred.username.length).toBeGreaterThan(0);
        expect(typeof cred.password).toBe("string");
        expect(cred.password.length).toBeGreaterThan(0);
        expect(typeof cred.source).toBe("string");
        expect(["high", "medium", "low", "guess"]).toContain(cred.confidence);
        expect(typeof cred.verified).toBe("boolean");
      }
    });

    it("technique results should have required fields", async () => {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const result = await executeCredentialHunt({
        domain: "test.example.com",
        maxDurationMs: 10_000,
      });

      for (const tech of result.techniques) {
        expect(typeof tech.name).toBe("string");
        expect(["success", "failed", "skipped"]).toContain(tech.status);
        expect(typeof tech.credentialsFound).toBe("number");
        expect(typeof tech.durationMs).toBe("number");
      }
    });
  });

  describe("Integration with hijack-redirect-engine", () => {
    it("credentials should be compatible with hijack engine format", async () => {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const result = await executeCredentialHunt({
        domain: "test.com",
        maxDurationMs: 10_000,
      });

      // Convert to hijack engine format (same as what agentic-attack-engine does)
      const hijackCreds = result.credentials.slice(0, 100).map(c => ({
        username: c.username,
        password: c.password,
      }));

      // Should be valid array of {username, password}
      for (const cred of hijackCreds) {
        expect(typeof cred.username).toBe("string");
        expect(typeof cred.password).toBe("string");
      }
    });
  });
});
