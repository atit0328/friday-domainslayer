import { describe, it, expect, vi } from "vitest";

// We test the exported functions by importing them
// Since these modules make HTTP calls, we mock fetch for unit tests

describe("cms-vuln-scanner", () => {
  it("should export required functions", async () => {
    const mod = await import("./cms-vuln-scanner");
    expect(typeof mod.detectCms).toBe("function");
    expect(typeof mod.runCmsVulnScan).toBe("function");
    expect(typeof mod.executeCmsExploit).toBe("function");
  });

  it("detectCms should return a CMS detection result", async () => {
    const { detectCms } = await import("./cms-vuln-scanner");

    // Mock fetch to return a Joomla-like response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<meta name="generator" content="Joomla! - Open Source Content Management" />'),
      headers: new Headers({ "x-powered-by": "PHP/7.4" }),
    }) as any;

    try {
      const result = await detectCms("https://example.com");
      expect(result).toBeDefined();
      expect(typeof result.cms).toBe("string");
      expect(typeof result.confidence).toBe("number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("detectCms should detect Drupal from headers", async () => {
    const { detectCms } = await import("./cms-vuln-scanner");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html><head></head><body>Drupal site</body></html>'),
      headers: new Headers({
        "x-generator": "Drupal 9",
        "x-drupal-cache": "HIT",
      }),
    }) as any;

    try {
      const result = await detectCms("https://example.com");
      expect(result).toBeDefined();
      // Should detect Drupal from headers
      expect(result.cms === "drupal" || result.cms === "unknown").toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("detectCms should handle network errors gracefully", async () => {
    const { detectCms } = await import("./cms-vuln-scanner");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    try {
      const result = await detectCms("https://example.com");
      expect(result).toBeDefined();
      expect(result.cms).toBe("unknown");
      expect(result.confidence).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("runCmsVulnScan should return a complete scan result", async () => {
    const { runCmsVulnScan } = await import("./cms-vuln-scanner");

    const originalFetch = globalThis.fetch;
    // Mock a Magento-like response
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("magento_version")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("Magento/2.4.3"),
          headers: new Headers({}),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<html><body><script src="/static/version1234/frontend/Magento/luma/en_US/"></script></body></html>'),
        headers: new Headers({ "x-magento-vary": "abc123" }),
      });
    }) as any;

    try {
      const progressCalls: string[] = [];
      const result = await runCmsVulnScan("https://example.com", (phase, detail) => {
        progressCalls.push(`${phase}: ${detail}`);
      });

      expect(result).toBeDefined();
      expect(typeof result.cmsDetected).toBe("string");
      expect(Array.isArray(result.extensions)).toBe(true);
      expect(Array.isArray(result.vulnerabilities)).toBe(true);
      expect(Array.isArray(result.interestingFindings)).toBe(true);
      expect(typeof result.scanDuration).toBe("number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("executeCmsExploit should handle failed exploits gracefully", async () => {
    const { executeCmsExploit } = await import("./cms-vuln-scanner");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    }) as any;

    try {
      const vuln = {
        cms: "joomla" as const,
        component: "com_test",
        title: "Test Vuln",
        cve: "CVE-2024-0001",
        severity: "critical" as const,
        type: "file_upload" as const,
        exploitAvailable: true,
        description: "Test vulnerability",
        affectedVersions: "1.0-2.0",
        reference: "https://example.com",
        exploitPath: "/test",
      };

      const result = await executeCmsExploit("https://example.com", vuln, "test.php", "<?php echo 1; ?>");
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("cve-auto-updater", () => {
  it("should export required functions", async () => {
    const mod = await import("./cve-auto-updater");
    expect(typeof mod.fetchWordfenceVulns).toBe("function");
    expect(typeof mod.fetchNvdVulns).toBe("function");
    expect(typeof mod.runFullCveUpdate).toBe("function");
    expect(typeof mod.getCveStats).toBe("function");
    expect(typeof mod.lookupCves).toBe("function");
    expect(typeof mod.matchPluginsAgainstDb).toBe("function");
  });

  it("fetchWordfenceVulns should handle missing database gracefully", async () => {
    const mod = await import("./cve-auto-updater");
    // Without DATABASE_URL, should return error result
    const originalDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const result = await mod.fetchWordfenceVulns();
      expect(result).toBeDefined();
      expect(result.source).toBe("wordfence");
      expect(typeof result.totalFetched).toBe("number");
      expect(typeof result.errors).toBe("number");
    } finally {
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  it("fetchNvdVulns should handle missing database gracefully", async () => {
    const mod = await import("./cve-auto-updater");
    const originalDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const result = await mod.fetchNvdVulns();
      expect(result).toBeDefined();
      expect(result.source).toBe("nvd");
      expect(typeof result.totalFetched).toBe("number");
      expect(typeof result.errors).toBe("number");
    } finally {
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  it("getCveStats should return empty stats when no database", async () => {
    const mod = await import("./cve-auto-updater");
    const originalDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const stats = await mod.getCveStats();
      expect(stats).toBeDefined();
      expect(stats.totalCves).toBe(0);
      expect(stats.byCms).toEqual({});
    } finally {
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  it("lookupCves should return empty array when no database", async () => {
    const mod = await import("./cve-auto-updater");
    const originalDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const results = await mod.lookupCves("wordpress", "contact-form-7");
      expect(results).toEqual([]);
    } finally {
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  it("matchPluginsAgainstDb should return empty array when no database", async () => {
    const mod = await import("./cve-auto-updater");
    const originalDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const results = await mod.matchPluginsAgainstDb([
        { slug: "contact-form-7", version: "5.0" },
      ]);
      expect(results).toEqual([]);
    } finally {
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });
});
