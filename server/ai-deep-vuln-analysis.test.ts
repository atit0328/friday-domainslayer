import { describe, it, expect, vi } from "vitest";

// ─── Import the module under test ───
// We test the exported helper functions and types
import {
  runDeepVulnAnalysis,
  type DeepVulnAnalysis,
  type DeepVulnProgressCallback,
} from "./ai-deep-vuln-analysis";

// ─── Mock the LLM module ───
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          vulnerabilities: [
            {
              id: "VULN-001",
              name: "Unrestricted File Upload",
              category: "file_upload",
              severity: "critical",
              cvss: 9.1,
              description: "File upload endpoint accepts PHP files without validation",
              evidence: "/wp-content/uploads/ allows .php files",
              exploitable: true,
              exploitDifficulty: "easy",
              aiConfidence: 92,
              remediation: "Implement file type whitelist and rename uploaded files",
            },
            {
              id: "VULN-002",
              name: "Outdated WordPress Core",
              category: "outdated_software",
              severity: "high",
              cvss: 7.5,
              description: "WordPress 5.2.1 has known RCE vulnerabilities",
              evidence: "X-Powered-By: WordPress 5.2.1",
              exploitable: true,
              exploitDifficulty: "moderate",
              aiConfidence: 85,
              remediation: "Update WordPress to latest version",
            },
          ],
          exploitChains: [
            {
              id: "CHAIN-001",
              name: "File Upload → RCE → Shell",
              steps: [
                {
                  order: 1,
                  action: "Upload PHP webshell via media upload endpoint",
                  technique: "multipart/form-data upload",
                  target: "/wp-admin/upload.php",
                  expectedOutcome: "Shell file placed in /wp-content/uploads/",
                  fallbackAction: "Try alternative upload paths",
                  detectionRisk: "medium",
                },
                {
                  order: 2,
                  action: "Execute uploaded shell",
                  technique: "HTTP GET request",
                  target: "/wp-content/uploads/shell.php",
                  expectedOutcome: "Remote code execution",
                  fallbackAction: "Try encoded shell variants",
                  detectionRisk: "high",
                },
              ],
              totalSuccessProbability: 65,
              estimatedTime: "2-5 minutes",
              requiredConditions: ["File upload enabled", "No WAF blocking PHP uploads"],
              riskLevel: "medium",
              stealthLevel: "moderate",
              targetVulnerabilities: ["VULN-001"],
            },
          ],
          attackSurface: {
            overall: 72,
            categories: {
              fileUpload: 85,
              authentication: 45,
              serverConfig: 60,
              applicationLogic: 50,
              networkExposure: 70,
              informationLeakage: 55,
            },
            weakestPoint: "File upload validation is minimal",
            strongestDefense: "Authentication requires strong passwords",
          },
          decision: {
            proceed: true,
            confidence: 78,
            reasoning: "Multiple exploitable vulnerabilities found with high success probability",
            riskAssessment: "Medium risk — WAF may block some attempts",
            estimatedSuccessRate: 65,
            estimatedDuration: "5-10 minutes",
            recommendedApproach: "Start with file upload exploit chain, fall back to WP core vulnerabilities",
            alternativeApproaches: ["Brute force wp-admin", "Exploit outdated plugins"],
            criticalWarnings: ["WAF detected — may block uploads"],
            prerequisites: ["Valid upload endpoint accessible"],
          },
          methodVulnMap: [
            {
              method: "File Upload",
              exploitsVulnerabilities: ["VULN-001"],
              successProbability: 65,
              reasoning: "Direct exploit of unrestricted file upload",
            },
            {
              method: "WP Core Exploit",
              exploitsVulnerabilities: ["VULN-002"],
              successProbability: 40,
              reasoning: "Known CVE for WordPress 5.2.1",
            },
          ],
          aiNarrative: "Target shows significant vulnerability in file upload handling. Recommended approach is to exploit the unrestricted upload endpoint first.",
        }),
      },
    }],
  }),
}));

// ─── Tests ───

describe("AI Deep Vulnerability Analysis", () => {
  describe("runDeepVulnAnalysis", () => {
    it("should return a valid DeepVulnAnalysis object", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      expect(result).toBeDefined();
      expect(result.target).toBe("example.com");
      expect(result.analyzedAt).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should contain vulnerabilities array", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      expect(Array.isArray(result.vulnerabilities)).toBe(true);
    });

    it("should contain exploit chains array", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      expect(Array.isArray(result.exploitChains)).toBe(true);
    });

    it("should contain attack surface score", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      expect(result.attackSurface).toBeDefined();
      expect(typeof result.attackSurface.overall).toBe("number");
      expect(result.attackSurface.overall).toBeGreaterThanOrEqual(0);
      expect(result.attackSurface.overall).toBeLessThanOrEqual(100);
    });

    it("should contain a decision object", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      expect(result.decision).toBeDefined();
      expect(typeof result.decision.proceed).toBe("boolean");
      expect(typeof result.decision.confidence).toBe("number");
      expect(typeof result.decision.reasoning).toBe("string");
      expect(typeof result.decision.estimatedSuccessRate).toBe("number");
    });

    it("should contain method-vulnerability mapping", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      expect(Array.isArray(result.methodVulnMap)).toBe(true);
    });

    it("should call progress callback during analysis", async () => {
      const progressCalls: Array<{ stage: string; detail: string; progress: number }> = [];
      
      await runDeepVulnAnalysis(
        "example.com",
        null,
        null,
        null,
        (stage, detail, progress) => {
          progressCalls.push({ stage, detail, progress });
        },
      );
      
      expect(progressCalls.length).toBeGreaterThan(0);
      // Should have start event
      expect(progressCalls[0].stage).toBe("start");
      expect(progressCalls[0].progress).toBe(0);
    });

    it("should handle null prescreen and AI analysis gracefully", async () => {
      const result = await runDeepVulnAnalysis("test.com", null, null, null);
      
      expect(result).toBeDefined();
      expect(result.target).toBe("test.com");
      // Should still produce a valid result even without input data
      expect(result.decision).toBeDefined();
    });

    it("should have progress increasing over time", async () => {
      const progressValues: number[] = [];
      
      await runDeepVulnAnalysis(
        "example.com",
        null,
        null,
        null,
        (_stage, _detail, progress) => {
          progressValues.push(progress);
        },
      );
      
      // Progress should generally increase
      expect(progressValues.length).toBeGreaterThan(2);
      // Last progress should be higher than first
      expect(progressValues[progressValues.length - 1]).toBeGreaterThan(progressValues[0]);
    });
  });

  describe("DeepVulnAnalysis types", () => {
    it("vulnerability should have required fields", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      if (result.vulnerabilities.length > 0) {
        const vuln = result.vulnerabilities[0];
        expect(vuln.id).toBeDefined();
        expect(vuln.name).toBeDefined();
        expect(vuln.category).toBeDefined();
        expect(vuln.severity).toBeDefined();
        expect(["critical", "high", "medium", "low", "info"]).toContain(vuln.severity);
        expect(typeof vuln.cvss).toBe("number");
        expect(typeof vuln.exploitable).toBe("boolean");
      }
    });

    it("exploit chain should have valid steps", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      if (result.exploitChains.length > 0) {
        const chain = result.exploitChains[0];
        expect(chain.id).toBeDefined();
        expect(chain.name).toBeDefined();
        expect(Array.isArray(chain.steps)).toBe(true);
        expect(chain.totalSuccessProbability).toBeGreaterThanOrEqual(0);
        expect(chain.totalSuccessProbability).toBeLessThanOrEqual(100);
        
        if (chain.steps.length > 0) {
          const step = chain.steps[0];
          expect(step.order).toBeDefined();
          expect(step.action).toBeDefined();
          expect(step.technique).toBeDefined();
          expect(step.target).toBeDefined();
        }
      }
    });

    it("attack surface categories should all be numbers 0-100", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      const cats = result.attackSurface.categories;
      for (const key of Object.keys(cats)) {
        const val = cats[key as keyof typeof cats];
        expect(typeof val).toBe("number");
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      }
    });

    it("decision should have arrays for warnings and alternatives", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      expect(Array.isArray(result.decision.criticalWarnings)).toBe(true);
      expect(Array.isArray(result.decision.alternativeApproaches)).toBe(true);
      expect(Array.isArray(result.decision.prerequisites)).toBe(true);
    });

    it("method-vuln map should have valid probability", async () => {
      const result = await runDeepVulnAnalysis("example.com", null, null, null);
      
      if (result.methodVulnMap.length > 0) {
        const mapping = result.methodVulnMap[0];
        expect(mapping.method).toBeDefined();
        expect(typeof mapping.successProbability).toBe("number");
        expect(mapping.successProbability).toBeGreaterThanOrEqual(0);
        expect(mapping.successProbability).toBeLessThanOrEqual(100);
        expect(Array.isArray(mapping.exploitsVulnerabilities)).toBe(true);
      }
    });
  });
});
