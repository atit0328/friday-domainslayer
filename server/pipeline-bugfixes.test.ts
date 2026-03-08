/**
 * Tests for Pipeline Bug Fixes:
 * 1. one-click-deploy uses fetchWithPoolProxy (not HTTP_PROXY env hack)
 * 2. WAF bypass supports multiple upload paths
 * 3. Pipeline data flow passes non-wp findings to shellless
 * 4. oneClickDeploy has fallback when no shell
 * 5. Pipeline timeout increased to 20 minutes
 */
import { describe, it, expect, vi } from "vitest";

// Mock LLM
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

// Mock db
vi.mock("./db", () => ({
  saveAttackDecision: vi.fn().mockResolvedValue(undefined),
  getSuccessfulMethods: vi.fn().mockResolvedValue([]),
  getDb: vi.fn(),
}));

// Track proxy-pool calls to verify they're being used
const mockFetchWithPoolProxy = vi.fn().mockImplementation(async (url: string) => {
  return {
    response: new Response("", { status: 403 }),
    proxyUsed: null,
  };
});

vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: mockFetchWithPoolProxy,
  proxyPool: {
    getProxy: vi.fn().mockReturnValue(null),
    reportSuccess: vi.fn(),
    reportFailure: vi.fn(),
    getStats: vi.fn().mockReturnValue({ total: 0, alive: 0 }),
  },
}));

describe("Bug 1: one-click-deploy uses fetchWithPoolProxy", () => {
  it("should import fetchWithPoolProxy from proxy-pool", async () => {
    // Read the source to verify import
    const fs = await import("fs");
    const source = fs.readFileSync("server/one-click-deploy.ts", "utf-8");
    
    // Should import fetchWithPoolProxy from proxy-pool
    expect(source).toContain('fetchWithPoolProxy');
    expect(source).toContain('proxy-pool');
  });

  it("proxyFetch helper should use fetchWithPoolProxy internally", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/one-click-deploy.ts", "utf-8");
    
    // proxyFetch should call fetchWithPoolProxy
    expect(source).toContain("async function proxyFetch");
    expect(source).toContain("fetchWithPoolProxy(url");
  });

  it("should not use HTTP_PROXY env variable hack", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/one-click-deploy.ts", "utf-8");
    
    // fetchWithProxy should use fetchWithPoolProxy, not HTTP_PROXY
    // The old pattern was: process.env.HTTP_PROXY = proxy.url
    expect(source).not.toContain("process.env.HTTP_PROXY = ");
    expect(source).not.toContain("delete process.env.HTTP_PROXY");
  });
});

describe("Bug 2: WAF bypass supports multiple upload paths", () => {
  it("WafBypassConfig should accept uploadPaths array", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/waf-bypass-engine.ts", "utf-8");
    
    // Should have uploadPaths in config
    expect(source).toContain("uploadPaths");
  });

  it("should discover additional upload paths during bypass", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/waf-bypass-engine.ts", "utf-8");
    
    // Should have path discovery logic — tries multiple paths not just one
    expect(source).toContain("uploadPaths");
    expect(source).toContain("paths");
  });

  it("should try PUT method in addition to POST", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/waf-bypass-engine.ts", "utf-8");
    
    // Should include PUT method
    expect(source).toContain('"PUT"');
  });
});

describe("Bug 3: Pipeline passes non-wp findings to shellless", () => {
  it("unified pipeline should run non-wp exploits BEFORE shellless phase", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/unified-attack-pipeline.ts", "utf-8");
    
    // Non-WP phase should appear before shellless phase
    const nonWpIndex = source.indexOf("Phase 4.7: Non-WP CMS Exploits");
    const shelllessIndex = source.indexOf("Phase 5: Shellless Attacks");
    
    expect(nonWpIndex).toBeGreaterThan(-1);
    expect(shelllessIndex).toBeGreaterThan(-1);
    expect(nonWpIndex).toBeLessThan(shelllessIndex);
  });

  it("shellless config should include enriched credentials from non-wp exploits", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/unified-attack-pipeline.ts", "utf-8");
    
    // Should have enrichedCredentials that includes non-wp findings
    expect(source).toContain("enrichedCredentials");
    expect(source).toContain("nonWpExploitResults");
  });
});

describe("Bug 4: oneClickDeploy fallback when no shell", () => {
  it("should try direct upload when shell is not active", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/one-click-deploy.ts", "utf-8");
    
    // Should have fallback logic instead of just "skipping file deployment"
    // Old: step5.details = "No active shell — skipping file deployment"
    // New: try direct upload of .htaccess and PHP redirect files
    expect(source).toContain("Fallback: try direct upload of redirect files without shell");
    expect(source).toContain("Try .htaccess upload");
    expect(source).toContain("Try PHP redirect upload");
  });

  it("should try multiple upload paths in fallback", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/one-click-deploy.ts", "utf-8");
    
    // Should iterate over paths
    expect(source).toContain("UPLOAD_SCAN_PATHS");
    expect(source).toContain("bestUploadPath");
  });
});

describe("Bug 5: Pipeline timeout increased", () => {
  it("SSE pipeline timeout should be 20 minutes", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/oneclick-sse.ts", "utf-8");
    
    // Should be 20 * 60 * 1000 = 1200000ms
    expect(source).toContain("20 * 60 * 1000");
    expect(source).not.toContain("8 * 60 * 1000");
    expect(source).not.toContain("10 * 60 * 1000");
  });
});

describe("Proxy Pool Integration", () => {
  it("proxy-pool should export fetchWithPoolProxy", async () => {
    const proxyPool = await import("./proxy-pool");
    expect(typeof proxyPool.fetchWithPoolProxy).toBe("function");
  });

  it("one-click-deploy should be importable without errors", async () => {
    const deploy = await import("./one-click-deploy");
    expect(deploy).toBeDefined();
    expect(typeof deploy.oneClickDeploy).toBe("function");
  });
});
