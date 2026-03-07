import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AiTargetAnalysis, AnalysisStep, AnalysisStepCallback } from "./ai-target-analysis";

// Mock external dependencies before importing the module
vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn().mockImplementation(async (url: string, opts: any) => {
    const headers = new Map<string, string>();
    headers.set("server", "Apache/2.4.41 (Ubuntu)");
    headers.set("x-powered-by", "PHP/7.4.3");
    headers.set("strict-transport-security", "max-age=31536000");
    headers.set("content-security-policy", "default-src 'self'");
    headers.set("x-frame-options", "SAMEORIGIN");
    headers.set("x-content-type-options", "nosniff");

    const html = `
      <html>
        <head><meta name="generator" content="WordPress 6.4.2" /></head>
        <body>
          <link rel="stylesheet" href="/wp-content/themes/astra/style.css" />
          <link rel="stylesheet" href="/wp-content/plugins/elementor/assets/css/frontend.css" />
          <link rel="stylesheet" href="/wp-content/plugins/contact-form-7/includes/css/styles.css" />
          <script src="https://www.google-analytics.com/analytics.js"></script>
          <script src="/wp-includes/js/jquery/jquery.min.js"></script>
        </body>
      </html>
    `;

    return {
      response: {
        status: 200,
        url: url,
        headers: {
          get: (key: string) => headers.get(key.toLowerCase()) || null,
        },
        text: async () => html,
      },
    };
  }),
}));

vi.mock("./moz-api", () => ({
  getMozMetrics: vi.fn().mockResolvedValue({
    domainAuthority: 42,
    pageAuthority: 38,
    spamScore: 5,
    rootDomainsToRootDomain: 150,
    externalPagesToRootDomain: 2500,
    pagesToRootDomain: 5000,
    linkPropensity: 0.3,
    lastCrawled: "2025-01-15",
    source: "moz",
  }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          overallSuccessProbability: 65,
          difficulty: "medium",
          riskLevel: "medium",
          detectionRisk: "medium",
          shouldProceed: true,
          proceedReason: "มี attack surface เพียงพอ WordPress พร้อม plugins ที่มีช่องโหว่",
          tacticalAnalysis: "เว็บนี้ใช้ WordPress 6.4.2 บน Apache/PHP 7.4 มี plugins ที่มีช่องโหว่ เช่น contact-form-7 และ elementor ไม่มี WAF ที่แข็งแกร่ง",
          recommendedMethods: [
            { method: "WordPress Plugin Exploit", probability: 70, reasoning: "มี plugins ที่มีช่องโหว่", priority: 1 },
            { method: "HTTP Direct Upload", probability: 50, reasoning: "Apache server ไม่มี WAF", priority: 2 },
          ],
          warnings: ["ระวัง security headers ที่ตั้งค่าไว้"],
          recommendations: ["ลองใช้ plugin exploit ก่อน"],
          estimatedTime: "3-5 minutes",
          bestApproach: "เริ่มจาก plugin exploit แล้วค่อย fallback ไป direct upload",
        }),
      },
    }],
  }),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    shodanApiKey: "test-shodan-key",
    mozAccessId: "test-moz-id",
    mozSecretKey: "test-moz-secret",
  },
}));

// Mock global fetch for DNS queries
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.includes("dns.google")) {
      if (url.includes("type=A")) {
        return {
          ok: true,
          json: async () => ({
            Answer: [{ data: "93.184.216.34", type: 1 }],
          }),
        };
      }
      if (url.includes("type=NS")) {
        return {
          ok: true,
          json: async () => ({
            Answer: [
              { data: "ns1.example.com.", type: 2 },
              { data: "ns2.example.com.", type: 2 },
            ],
          }),
        };
      }
      if (url.includes("type=MX")) {
        return {
          ok: true,
          json: async () => ({
            Answer: [{ data: "10 mail.example.com.", type: 15 }],
          }),
        };
      }
      if (url.includes("type=TXT")) {
        return {
          ok: true,
          json: async () => ({
            Answer: [{ data: "\"v=spf1 include:_spf.google.com ~all\"", type: 16 }],
          }),
        };
      }
    }
    if (typeof url === "string" && url.includes("shodan.io")) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { port: 80, product: "Apache" },
            { port: 443, product: "Apache" },
            { port: 22, product: "OpenSSH" },
          ],
          org: "DigitalOcean",
          isp: "DigitalOcean LLC",
        }),
      };
    }
    return { ok: false, status: 404, text: async () => "" };
  });
});

describe("AI Target Analysis", () => {
  it("runs full analysis and returns structured result", async () => {
    const { runAiTargetAnalysis } = await import("./ai-target-analysis");

    const steps: AnalysisStep[] = [];
    const onStep: AnalysisStepCallback = (step) => {
      steps.push({ ...step });
    };

    const result = await runAiTargetAnalysis("example.com", onStep);

    // Verify result structure
    expect(result).toBeDefined();
    expect(result.domain).toBe("example.com");
    expect(result.analyzedAt).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);

    // HTTP Fingerprint
    expect(result.httpFingerprint).toBeDefined();
    expect(result.httpFingerprint.serverType).toBe("Apache");
    expect(result.httpFingerprint.phpVersion).toBe("7.4.3");
    expect(result.httpFingerprint.statusCode).toBe(200);

    // DNS Info
    expect(result.dnsInfo).toBeDefined();
    expect(result.dnsInfo.ipAddress).toBe("93.184.216.34");
    expect(result.dnsInfo.nameservers.length).toBeGreaterThan(0);

    // Tech Stack
    expect(result.techStack).toBeDefined();
    expect(result.techStack.cms).toBe("WordPress");
    expect(result.techStack.cmsVersion).toBe("6.4.2");
    expect(result.techStack.plugins).toContain("elementor");
    expect(result.techStack.plugins).toContain("contact-form-7");
    expect(result.techStack.theme).toBe("astra");
    expect(result.techStack.jsLibraries).toContain("jQuery");

    // Security
    expect(result.security).toBeDefined();
    expect(result.security.hsts).toBe(true);
    expect(result.security.csp).toBe(true);
    expect(result.security.xFrameOptions).toBe(true);
    expect(result.security.securityScore).toBeGreaterThan(0);

    // SEO Metrics (Moz)
    expect(result.seoMetrics).toBeDefined();
    expect(result.seoMetrics.mozAvailable).toBe(true);
    expect(result.seoMetrics.domainAuthority).toBe(42);
    expect(result.seoMetrics.pageAuthority).toBe(38);
    expect(result.seoMetrics.spamScore).toBe(5);

    // AI Strategy
    expect(result.aiStrategy).toBeDefined();
    expect(result.aiStrategy.overallSuccessProbability).toBeGreaterThan(0);
    expect(result.aiStrategy.overallSuccessProbability).toBeLessThanOrEqual(100);
    expect(["easy", "medium", "hard", "very_hard"]).toContain(result.aiStrategy.difficulty);
    expect(result.aiStrategy.recommendedMethods.length).toBeGreaterThan(0);
    expect(result.aiStrategy.shouldProceed).toBeDefined();
    expect(result.aiStrategy.tacticalAnalysis).toBeTruthy();
  });

  it("streams progress steps via callback", async () => {
    const { runAiTargetAnalysis } = await import("./ai-target-analysis");

    const steps: AnalysisStep[] = [];
    const onStep: AnalysisStepCallback = (step) => {
      steps.push({ ...step });
    };

    await runAiTargetAnalysis("example.com", onStep);

    // Should have received multiple steps
    expect(steps.length).toBeGreaterThanOrEqual(8); // 8 analysis steps

    // Verify step IDs are present
    const stepIds = steps.map(s => s.stepId);
    expect(stepIds).toContain("http_fingerprint");
    expect(stepIds).toContain("dns_lookup");
    expect(stepIds).toContain("tech_detection");
    expect(stepIds).toContain("security_scan");
    expect(stepIds).toContain("moz_metrics");
    expect(stepIds).toContain("upload_surface");
    expect(stepIds).toContain("vuln_check");
    expect(stepIds).toContain("ai_strategy");

    // Each step should have required fields
    for (const step of steps) {
      expect(step.stepId).toBeTruthy();
      expect(step.stepName).toBeTruthy();
      expect(["running", "complete", "error", "skipped"]).toContain(step.status);
      expect(step.detail).toBeTruthy();
      expect(typeof step.progress).toBe("number");
    }

    // Final step should be at 100% progress
    const lastStep = steps[steps.length - 1];
    expect(lastStep.progress).toBe(100);
  });

  it("detects WordPress plugins and known CVEs", async () => {
    const { runAiTargetAnalysis } = await import("./ai-target-analysis");

    const result = await runAiTargetAnalysis("example.com");

    // Should detect contact-form-7 CVE
    const cf7Vuln = result.vulnerabilities.knownCVEs.find(v => v.cve === "CVE-2023-6449");
    expect(cf7Vuln).toBeDefined();
    expect(cf7Vuln?.severity).toBe("critical");

    // Should detect elementor CVE
    const elemVuln = result.vulnerabilities.knownCVEs.find(v => v.cve === "CVE-2023-48777");
    expect(elemVuln).toBeDefined();

    // Risk score should be > 0 due to vulnerabilities
    expect(result.vulnerabilities.totalRiskScore).toBeGreaterThan(0);
  });

  it("handles domain with https:// prefix", async () => {
    const { runAiTargetAnalysis } = await import("./ai-target-analysis");

    const result = await runAiTargetAnalysis("https://example.com/");

    expect(result.domain).toBe("example.com");
  });

  it("calculates security score based on headers", async () => {
    const { runAiTargetAnalysis } = await import("./ai-target-analysis");

    const result = await runAiTargetAnalysis("example.com");

    // With HSTS, CSP, X-Frame-Options, X-Content-Type-Options, and SSL
    // Score should be significant
    expect(result.security.securityScore).toBeGreaterThanOrEqual(20);
  });
});
