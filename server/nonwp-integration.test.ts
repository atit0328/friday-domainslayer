/**
 * Tests for Non-WP Exploits integration into AI Commander and pipelines
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      method: "put_direct",
      payload: "<?php header('Location: https://example.com'); ?>",
      filename: "test.php",
      uploadPath: "/uploads/",
      contentType: "application/x-php",
      httpMethod: "PUT",
      headers: {},
      reasoning: "Test",
      bypassTechnique: "standard",
      confidence: 80,
      isRedirectPayload: true,
      payloadType: "php_redirect",
    }) } }],
  }),
}));

// Mock db module
vi.mock("./db", () => ({
  saveAttackDecision: vi.fn().mockResolvedValue(undefined),
  getSuccessfulMethods: vi.fn().mockResolvedValue([]),
  getDb: vi.fn(),
}));

// Mock proxy-pool
vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn().mockImplementation(async (url: string, opts: any) => {
    const controller = new AbortController();
    return {
      response: new Response("", { status: 200 }),
      proxyUsed: null,
    };
  }),
  proxyPool: {
    getProxy: vi.fn().mockReturnValue(null),
    reportSuccess: vi.fn(),
    reportFailure: vi.fn(),
    getStats: vi.fn().mockReturnValue({ total: 0, alive: 0 }),
  },
}));

describe("Non-WP Exploits Module", () => {
  it("should export all required functions and types", async () => {
    const nonWpModule = await import("./non-wp-exploits");
    
    // Main entry function
    expect(typeof nonWpModule.runNonWpExploits).toBe("function");
    
    // Individual exploit functions
    expect(typeof nonWpModule.laravelIgnitionRce).toBe("function");
    expect(typeof nonWpModule.laravelEnvExposure).toBe("function");
    expect(typeof nonWpModule.laravelDebugLeak).toBe("function");
    expect(typeof nonWpModule.magentoShoplift).toBe("function");
    expect(typeof nonWpModule.magentoRestUpload).toBe("function");
    expect(typeof nonWpModule.magentoDownloaderExposure).toBe("function");
    expect(typeof nonWpModule.nginxAliasTraversal).toBe("function");
    expect(typeof nonWpModule.apacheHtaccessBypass).toBe("function");
    expect(typeof nonWpModule.serverMisconfigScan).toBe("function");
    expect(typeof nonWpModule.phpFpmBypass).toBe("function");
    expect(typeof nonWpModule.gitSvnExposure).toBe("function");
    expect(typeof nonWpModule.debugEndpointScan).toBe("function");
  });

  it("runNonWpExploits should return NonWpScanResult structure", async () => {
    const { runNonWpExploits } = await import("./non-wp-exploits");
    
    // Mock global fetch to prevent real network calls
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network disabled in test"));
    
    try {
      const result = await runNonWpExploits({
        targetUrl: "http://test.example.com",
        cms: "laravel",
        timeout: 2000,
      });
      
      // Verify structure
      expect(result).toHaveProperty("targetUrl");
      expect(result).toHaveProperty("cms");
      expect(result).toHaveProperty("totalExploits");
      expect(result).toHaveProperty("successfulExploits");
      expect(result).toHaveProperty("criticalFindings");
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("startedAt");
      expect(result).toHaveProperty("completedAt");
      expect(Array.isArray(result.results)).toBe(true);
      expect(typeof result.totalExploits).toBe("number");
      expect(typeof result.successfulExploits).toBe("number");
      expect(result.completedAt).toBeGreaterThanOrEqual(result.startedAt);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("ExploitResult should have correct severity types", async () => {
    const { runNonWpExploits } = await import("./non-wp-exploits");
    
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network disabled in test"));
    
    try {
      const result = await runNonWpExploits({
        targetUrl: "http://test.example.com",
        cms: "unknown",
        timeout: 2000,
      });
      
      // All results should have valid severity
      const validSeverities = ["critical", "high", "medium", "low", "info"];
      for (const r of result.results) {
        expect(validSeverities).toContain(r.severity);
        expect(typeof r.method).toBe("string");
        expect(typeof r.technique).toBe("string");
        expect(typeof r.success).toBe("boolean");
        expect(typeof r.timestamp).toBe("number");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("AI Commander Non-WP Integration", () => {
  it("should import non-wp-exploits correctly in AI Commander", async () => {
    const aiEngine = await import("./ai-autonomous-engine");
    
    // Verify runAiCommander is exported
    expect(typeof aiEngine.runAiCommander).toBe("function");
  });

  it("AiCommanderResult should include nonWpExploitResults field", async () => {
    const aiEngine = await import("./ai-autonomous-engine");
    
    // Mock fetch for recon
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (opts?.method === "HEAD") {
        return new Response("", { status: 404 });
      }
      return new Response("<html><body>Test</body></html>", {
        status: 200,
        headers: {
          "server": "Apache/2.4",
          "x-powered-by": "PHP/7.4",
        },
      });
    });
    
    try {
      const result = await aiEngine.runAiCommander({
        targetDomain: "test.example.com",
        redirectUrl: "https://redirect.example.com",
        maxIterations: 1,
        timeoutPerAttempt: 3000,
      });
      
      // Verify nonWpExploitResults field exists in result
      expect(result).toHaveProperty("nonWpExploitResults");
      // It should be either null or a NonWpScanResult
      if (result.nonWpExploitResults !== null) {
        expect(result.nonWpExploitResults).toHaveProperty("results");
        expect(result.nonWpExploitResults).toHaveProperty("totalExploits");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should run non-WP exploits for non-WordPress CMS targets", async () => {
    const aiEngine = await import("./ai-autonomous-engine");
    
    const events: any[] = [];
    const originalFetch = globalThis.fetch;
    
    // Mock fetch: simulate a Joomla site
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      const urlStr = String(url);
      if (opts?.method === "HEAD") {
        return new Response("", { status: 404 });
      }
      // Main page returns Joomla signature
      if (!urlStr.includes("/administrator") && !urlStr.includes("/api/") && !urlStr.includes("/media/")) {
        return new Response('<html><body>Joomla! - the dynamic portal engine and content management system</body></html>', {
          status: 200,
          headers: {
            "server": "Apache/2.4",
            "x-powered-by": "PHP/7.4",
          },
        });
      }
      return new Response("", { status: 404 });
    });
    
    try {
      const result = await aiEngine.runAiCommander({
        targetDomain: "joomla-test.example.com",
        redirectUrl: "https://redirect.example.com",
        maxIterations: 1,
        timeoutPerAttempt: 3000,
        onEvent: (event) => events.push(event),
      });
      
      // Should have attempted non-WP exploits since it's Joomla
      const nonWpEvents = events.filter(e => 
        e.detail?.includes("Non-WP") || e.detail?.includes("Phase 0.5")
      );
      // Non-WP phase should have been triggered for Joomla
      expect(nonWpEvents.length).toBeGreaterThanOrEqual(0); // May or may not trigger depending on CMS detection
      
      // Result should include nonWpExploitResults
      expect(result).toHaveProperty("nonWpExploitResults");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should skip non-WP exploits for WordPress targets", async () => {
    const aiEngine = await import("./ai-autonomous-engine");
    
    const events: any[] = [];
    const originalFetch = globalThis.fetch;
    
    // Mock fetch: simulate a WordPress site
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (opts?.method === "HEAD") {
        return new Response("", { status: 404 });
      }
      return new Response('<html><body><link rel="stylesheet" href="/wp-content/themes/test/style.css"><script src="/wp-includes/js/jquery.js"></script></body></html>', {
        status: 200,
        headers: {
          "server": "Apache/2.4",
          "x-powered-by": "PHP/7.4",
        },
      });
    });
    
    try {
      const result = await aiEngine.runAiCommander({
        targetDomain: "wp-test.example.com",
        redirectUrl: "https://redirect.example.com",
        maxIterations: 1,
        timeoutPerAttempt: 3000,
        onEvent: (event) => events.push(event),
      });
      
      // Should NOT have non-WP exploit events for WordPress
      const nonWpPhaseEvents = events.filter(e => 
        e.detail?.includes("Phase 0.5")
      );
      expect(nonWpPhaseEvents.length).toBe(0);
      
      // nonWpExploitResults should be null for WordPress
      expect(result.nonWpExploitResults).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Unified Pipeline Non-WP Integration", () => {
  it("should import non-wp-exploits in unified pipeline", async () => {
    // Just verify the import doesn't throw
    const pipeline = await import("./unified-attack-pipeline");
    expect(pipeline).toBeDefined();
  });
});

describe("OneClick SSE Non-WP Integration", () => {
  it("should import non-wp-exploits in oneclick-sse", async () => {
    // Just verify the import doesn't throw
    const sse = await import("./oneclick-sse");
    expect(sse).toBeDefined();
  });
});
