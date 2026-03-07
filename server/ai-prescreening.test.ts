import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      difficulty: "medium",
      recommended_methods: ["Shell Upload", "CMS Plugin Exploit"],
      waf_bypass_tips: ["Use obfuscation"],
      risk_assessment: "Moderate risk",
      detailed_analysis: "Target runs WordPress with ModSecurity"
    })}}]
  }),
}));

// Mock env
vi.mock("./_core/env", () => ({
  ENV: {
    shodanApiKey: "test-key",
  },
}));

describe("AI Pre-screening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("should export preScreenTarget function", async () => {
    const mod = await import("./ai-prescreening");
    expect(typeof mod.preScreenTarget).toBe("function");
  });

  it("should export PreScreenResult type", async () => {
    const mod = await import("./ai-prescreening");
    expect(mod).toBeDefined();
  });

  it("should return a valid PreScreenResult structure", async () => {
    // Mock all fetch calls to return reasonable responses
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("api.shodan.io")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ip_str: "1.2.3.4",
            ports: [80, 443, 21],
            data: [
              { port: 80, product: "Apache", version: "2.4.41" },
              { port: 21, product: "vsftpd", version: "3.0.3" },
            ],
            hostnames: ["example.com"],
          }),
        });
      }
      // Default: return a basic HTML response
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([
          ["server", "Apache/2.4.41"],
          ["x-powered-by", "PHP/7.4"],
        ]),
        text: () => Promise.resolve("<html><head><meta name='generator' content='WordPress 6.0'></head><body>Hello</body></html>"),
      });
    });

    const { preScreenTarget } = await import("./ai-prescreening");
    const result = await preScreenTarget("example.com");

    expect(result).toBeDefined();
    expect(result.domain).toBe("example.com");
    expect(typeof result.overallSuccessProbability).toBe("number");
    expect(result.overallSuccessProbability).toBeGreaterThanOrEqual(0);
    expect(result.overallSuccessProbability).toBeLessThanOrEqual(100);
    expect(["low", "medium", "high", "critical"]).toContain(result.riskLevel);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(Array.isArray(result.methodProbabilities)).toBe(true);
    expect(typeof result.shouldProceed).toBe("boolean");
  });

  it("should detect FTP availability from open ports", async () => {
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("dns/resolve")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ "ftp-target.com": "1.2.3.4" }),
        });
      }
      if (urlStr.includes("shodan/host")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ip_str: "1.2.3.4",
            ports: [21, 80, 443],
            data: [
              { port: 21, product: "vsftpd", version: "3.0.3" },
              { port: 80, product: "nginx" },
            ],
            hostnames: [],
          }),
        });
      }
      // Default HTTP response for target probing
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([["server", "nginx"]]),
        text: () => Promise.resolve("<html><body>Hello</body></html>"),
      });
    });

    const { preScreenTarget } = await import("./ai-prescreening");
    const result = await preScreenTarget("ftp-target.com");
    expect(result.ftpAvailable).toBe(true);
  });

  it("should handle network errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { preScreenTarget } = await import("./ai-prescreening");
    const result = await preScreenTarget("unreachable.com");

    expect(result).toBeDefined();
    expect(result.domain).toBe("unreachable.com");
    // Should still return a valid result even with errors
    expect(typeof result.overallSuccessProbability).toBe("number");
  });
});

describe("Alt Upload Methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("should export tryAllUploadMethods function", async () => {
    const mod = await import("./alt-upload-methods");
    expect(typeof mod.tryAllUploadMethods).toBe("function");
  });

  it("should export tryFtpBruteForce function", async () => {
    const mod = await import("./alt-upload-methods");
    expect(typeof mod.tryFtpBruteForce).toBe("function");
  });

  it("should export tryCmsPluginExploits function", async () => {
    const mod = await import("./alt-upload-methods");
    expect(typeof mod.tryCmsPluginExploits).toBe("function");
  });

  it("should return UploadAttemptResult array from tryAllUploadMethods", async () => {
    // Mock fetch for CMS exploit attempts
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    });

    const { tryAllUploadMethods, UploadAttemptResult } = await import("./alt-upload-methods");
    const { PreScreenResult } = await import("./ai-prescreening");

    const mockPrescreen = {
      domain: "example.com",
      timestamp: Date.now(),
      serverType: "Apache",
      serverVersion: "2.4",
      cms: "WordPress",
      cmsVersion: "6.0",
      phpVersion: "7.4",
      osGuess: "Linux",
      hostingProvider: null,
      ipAddress: "1.2.3.4",
      reverseIp: [],
      wafDetected: null,
      wafStrength: "none" as const,
      sslInfo: { enabled: true, issuer: null, validUntil: null },
      securityHeaders: {},
      securityScore: 30,
      openPorts: [{ port: 80, service: "http" }],
      ftpAvailable: false,
      sshAvailable: false,
      webdavAvailable: false,
      cmsPlugins: [],
      cmsTheme: null,
      knownVulnerabilities: [],
      writablePaths: ["/wp-content/uploads/"],
      uploadEndpoints: [],
      fileManagerDetected: false,
      xmlrpcAvailable: false,
      restApiAvailable: false,
      directoryListingPaths: [],
      overallSuccessProbability: 40,
      methodProbabilities: [
        { method: "CMS Plugin Exploit", probability: 30, reasoning: "WordPress detected" },
        { method: "WebDAV Upload", probability: 10, reasoning: "No WebDAV" },
      ],
      riskLevel: "medium" as const,
      detectionRisk: "medium" as const,
      warnings: [],
      recommendations: [],
      aiAnalysis: null,
      aiRecommendedMethods: [],
      aiEstimatedDifficulty: "medium" as const,
      shouldProceed: true,
      proceedReason: "Moderate chance",
    };

    const results = await tryAllUploadMethods(
      "https://example.com",
      mockPrescreen as any,
      "<?php echo 'test'; ?>",
      "test.php",
      "/wp-content/uploads/",
    );

    expect(Array.isArray(results)).toBe(true);
    // Each result should have the correct structure
    for (const r of results) {
      expect(typeof r.method).toBe("string");
      expect(typeof r.success).toBe("boolean");
      expect(typeof r.details).toBe("string");
      expect(typeof r.duration).toBe("number");
    }
  });
});

describe("Stealth Browser", () => {
  it("should export stealthBypassWaf function", async () => {
    const mod = await import("./stealth-browser");
    expect(typeof mod.stealthBypassWaf).toBe("function");
  });

  it("should export stealthVerifyFile function", async () => {
    const mod = await import("./stealth-browser");
    expect(typeof mod.stealthVerifyFile).toBe("function");
  });

  it("should export stealthVerifyBatch function", async () => {
    const mod = await import("./stealth-browser");
    expect(typeof mod.stealthVerifyBatch).toBe("function");
  });

  it("should export stealthUploadViaFileManager function", async () => {
    const mod = await import("./stealth-browser");
    expect(typeof mod.stealthUploadViaFileManager).toBe("function");
  });

  it("should export closeBrowser function", async () => {
    const mod = await import("./stealth-browser");
    expect(typeof mod.closeBrowser).toBe("function");
  });
});
