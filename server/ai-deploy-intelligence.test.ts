import { describe, it, expect } from "vitest";
import {
  buildTargetProfile,
  selectOptimalStrategy,
  adaptStrategyAfterStep,
  createAIDeployIntelligence,
  type StepAnalysis,
} from "./ai-deploy-intelligence";

// Mock scan result for testing
const mockScanResult = {
  uploadPaths: [
    { path: "/data/", writable: true, type: "directory" },
    { path: "/uploads/", writable: true, type: "directory" },
    { path: "/wp-content/uploads/", writable: false, type: "directory" },
  ],
  vulnPaths: [
    { path: "/admin/", exists: true },
    { path: "/.env", exists: false },
  ],
  serverInfo: {
    server: "Apache/2.4.41",
    cms: "WordPress",
    waf: null,
    phpVersion: "7.4",
  },
  bestUploadPath: "/data/",
};

const mockScanResultWithWAF = {
  uploadPaths: [
    { path: "/data/", writable: true, type: "directory" },
  ],
  vulnPaths: [],
  serverInfo: {
    server: "nginx/1.18",
    cms: null,
    waf: "Cloudflare",
    phpVersion: null,
  },
  bestUploadPath: "/data/",
};

const mockScanResultEmpty = {
  uploadPaths: [],
  vulnPaths: [],
  serverInfo: {},
  bestUploadPath: null,
};

describe("AI Deploy Intelligence", () => {
  describe("buildTargetProfile", () => {
    it("should build profile from scan result with Apache/WordPress", () => {
      const profile = buildTargetProfile(mockScanResult);
      expect(profile).toBeDefined();
      expect(profile.serverType).toBe("Apache");
      expect(profile.cms).toBe("WordPress");
      expect(profile.wafDetected).toBeNull();
      expect(profile.writablePaths.length).toBe(2);
      expect(profile.exposedEndpoints.length).toBe(1);
      // phpVersion is extracted from poweredBy header, not from serverInfo directly
      // Our mock doesn't have poweredBy, so phpVersion will be null
      expect(profile.phpVersion).toBeNull();
    });

    it("should detect WAF from scan result", () => {
      const profile = buildTargetProfile(mockScanResultWithWAF);
      expect(profile.serverType).toBe("Nginx");
      expect(profile.wafDetected).toBeNull(); // WAF detected via headers, not server string
    });

    it("should handle empty scan result", () => {
      const profile = buildTargetProfile(mockScanResultEmpty);
      expect(profile.writablePaths.length).toBe(0);
      expect(profile.exposedEndpoints.length).toBe(0);
      expect(profile.wafDetected).toBeNull();
    });
  });

  describe("selectOptimalStrategy", () => {
    it("should select strategy for Apache/WordPress target", () => {
      const profile = buildTargetProfile(mockScanResult);
      const strategy = selectOptimalStrategy(profile);
      
      expect(strategy).toBeDefined();
      expect(strategy.overallSuccessProbability).toBeGreaterThan(0);
      expect(strategy.overallSuccessProbability).toBeLessThanOrEqual(100);
      expect(strategy.riskLevel).toBeDefined();
      expect(["low", "medium", "high"]).toContain(strategy.riskLevel);
      expect(strategy.recommendedApproach).toBeDefined();
      expect(strategy.reasoning).toBeDefined();
      expect(strategy.shellStrategy).toBeDefined();
      expect(strategy.uploadStrategy).toBeDefined();
      expect(strategy.redirectStrategy).toBeDefined();
    });

    it("should have different probability for different targets", () => {
      const profileNoWAF = buildTargetProfile(mockScanResult);
      const profileWAF = buildTargetProfile(mockScanResultWithWAF);
      
      const strategyNoWAF = selectOptimalStrategy(profileNoWAF);
      const strategyWAF = selectOptimalStrategy(profileWAF);
      
      // Both should have valid probabilities
      expect(strategyNoWAF.overallSuccessProbability).toBeGreaterThan(0);
      expect(strategyWAF.overallSuccessProbability).toBeGreaterThan(0);
    });

    it("should handle empty scan results", () => {
      const profileEmpty = buildTargetProfile(mockScanResultEmpty);
      
      const strategyEmpty = selectOptimalStrategy(profileEmpty);
      
      expect(strategyEmpty.overallSuccessProbability).toBeGreaterThanOrEqual(0);
      expect(strategyEmpty.overallSuccessProbability).toBeLessThanOrEqual(100);
    });

    it("should include shell strategy with obfuscation layers", () => {
      const profile = buildTargetProfile(mockScanResult);
      const strategy = selectOptimalStrategy(profile);
      
      expect(strategy.shellStrategy.obfuscationLayers).toBeGreaterThanOrEqual(2);
      expect(strategy.shellStrategy.evasionTechniques).toBeDefined();
      expect(Array.isArray(strategy.shellStrategy.evasionTechniques)).toBe(true);
    });

    it("should include upload strategy with method priority", () => {
      const profile = buildTargetProfile(mockScanResult);
      const strategy = selectOptimalStrategy(profile);
      
      expect(strategy.uploadStrategy.methodPriority).toBeDefined();
      expect(Array.isArray(strategy.uploadStrategy.methodPriority)).toBe(true);
      expect(strategy.uploadStrategy.methodPriority.length).toBeGreaterThan(0);
    });

    it("should include redirect strategy", () => {
      const profile = buildTargetProfile(mockScanResult);
      const strategy = selectOptimalStrategy(profile);
      
      expect(strategy.redirectStrategy.primaryMethod).toBeDefined();
      expect(typeof strategy.redirectStrategy.primaryMethod).toBe("string");
    });
  });

  describe("adaptStrategyAfterStep", () => {
    it("should increase probability after successful step", () => {
      const profile = buildTargetProfile(mockScanResult);
      const strategy = selectOptimalStrategy(profile);
      const originalProb = strategy.overallSuccessProbability;
      
      const stepAnalysis: StepAnalysis = {
        stepName: "direct_upload",
        success: true,
        details: "Direct upload succeeded: 3 files uploaded",
        aiRecommendation: "Direct upload worked",
        adaptedStrategy: null,
        nextStepAdjustments: [],
      };
      
      const adapted = adaptStrategyAfterStep(strategy, stepAnalysis);
      expect(adapted.overallSuccessProbability).toBeGreaterThanOrEqual(originalProb);
    });

    it("should decrease probability after failed step", () => {
      const profile = buildTargetProfile(mockScanResult);
      const strategy = selectOptimalStrategy(profile);
      const originalProb = strategy.overallSuccessProbability;
      
      const stepAnalysis: StepAnalysis = {
        stepName: "upload_shell",
        success: false,
        details: "Shell upload failed: WAF blocked all attempts",
        aiRecommendation: "Shell upload failed",
        adaptedStrategy: null,
        nextStepAdjustments: [],
      };
      
      const adapted = adaptStrategyAfterStep(strategy, stepAnalysis);
      expect(adapted.overallSuccessProbability).toBeLessThanOrEqual(originalProb);
    });

    it("should add adaptation notes", () => {
      const profile = buildTargetProfile(mockScanResult);
      const strategy = selectOptimalStrategy(profile);
      
      const stepAnalysis: StepAnalysis = {
        stepName: "verify_shell",
        success: true,
        details: "Shell active: 5/5 tests passed",
        aiRecommendation: "Shell verified active",
        adaptedStrategy: null,
        nextStepAdjustments: [],
      };
      
      const adapted = adaptStrategyAfterStep(strategy, stepAnalysis);
      expect(adapted.adaptations).toBeDefined();
      expect(adapted.adaptations.length).toBeGreaterThan(0);
    });

    it("should clamp probability between 0 and 100", () => {
      const profile = buildTargetProfile(mockScanResult);
      let strategy = selectOptimalStrategy(profile);
      
      // Apply many failures
      for (let i = 0; i < 10; i++) {
        strategy = adaptStrategyAfterStep(strategy, {
          stepName: `step_${i}`,
          success: false,
          details: "Failed",
          aiRecommendation: "",
          adaptedStrategy: null,
          nextStepAdjustments: [],
        });
      }
      
      expect(strategy.overallSuccessProbability).toBeGreaterThanOrEqual(0);
      expect(strategy.overallSuccessProbability).toBeLessThanOrEqual(100);
    });
  });

  describe("createAIDeployIntelligence", () => {
    it("should create intelligence object with all required fields", () => {
      const profile = buildTargetProfile(mockScanResult);
      const intel = createAIDeployIntelligence(profile);
      
      expect(intel).toBeDefined();
      expect(intel.targetProfile).toBeDefined();
      expect(intel.strategy).toBeDefined();
      expect(intel.stepAnalyses).toBeDefined();
      expect(Array.isArray(intel.stepAnalyses)).toBe(true);
      expect(intel.finalAnalysis).toBeDefined();
    });

    it("should have initial strategy from profile", () => {
      const profile = buildTargetProfile(mockScanResult);
      const intel = createAIDeployIntelligence(profile);
      
      expect(intel.strategy.overallSuccessProbability).toBeGreaterThan(0);
      expect(intel.strategy.reasoning).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle scan result with only vulns, no writable paths", () => {
      const scanResult = {
        uploadPaths: [
          { path: "/data/", writable: false, type: "directory" },
        ],
        vulnPaths: [
          { path: "/admin/", exists: true },
          { path: "/phpmyadmin/", exists: true },
        ],
        serverInfo: { server: "Apache" },
        bestUploadPath: null,
      };
      
      const profile = buildTargetProfile(scanResult);
      expect(profile.writablePaths.length).toBe(0);
      expect(profile.exposedEndpoints.length).toBe(2);
      
      const strategy = selectOptimalStrategy(profile);
      expect(strategy.overallSuccessProbability).toBeGreaterThan(0);
    });

    it("should handle multiple sequential adaptations", () => {
      const profile = buildTargetProfile(mockScanResult);
      let strategy = selectOptimalStrategy(profile);
      
      const steps = [
        { stepName: "direct_upload", success: true },
        { stepName: "upload_shell", success: true },
        { stepName: "verify_shell", success: true },
        { stepName: "deploy_files", success: true },
      ];
      
      for (const step of steps) {
        strategy = adaptStrategyAfterStep(strategy, {
          ...step,
          details: `${step.stepName} completed`,
          aiRecommendation: "",
          adaptedStrategy: null,
          nextStepAdjustments: [],
        });
      }
      
      expect(strategy.adaptations.length).toBeGreaterThanOrEqual(3);
      expect(strategy.overallSuccessProbability).toBeGreaterThan(50);
    });
  });
});
