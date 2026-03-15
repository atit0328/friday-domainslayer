/**
 * Tests for SEO Transform Pipeline types and structure
 */
import { describe, it, expect } from "vitest";
import type { SeoTransformConfig, SeoTransformResult, TransformStepResult } from "./seo-transform-pipeline";

describe("SEO Transform Pipeline Types", () => {
  it("should have correct SeoTransformConfig structure", () => {
    const config: SeoTransformConfig = {
      siteUrl: "https://example.com",
      username: "admin",
      appPassword: "pass123",
      primaryKeyword: "คาสิโนออนไลน์",
      secondaryKeywords: ["บาคาร่า", "สล็อต"],
      niche: "gambling",
      brandName: "TestBrand",
      language: "th",
      country: "TH",
      autoPublish: true,
    };

    expect(config.siteUrl).toBe("https://example.com");
    expect(config.primaryKeyword).toBe("คาสิโนออนไลน์");
    expect(config.secondaryKeywords).toHaveLength(2);
    expect(config.autoPublish).toBe(true);
    expect(config.language).toBe("th");
  });

  it("should have correct SeoTransformConfig with optional fields", () => {
    const config: SeoTransformConfig = {
      siteUrl: "https://example.com",
      username: "admin",
      appPassword: "pass123",
      primaryKeyword: "test",
      secondaryKeywords: [],
      niche: "gambling",
      brandName: "Brand",
      language: "th",
      country: "TH",
      autoPublish: false,
      themeSlug: "flavor",
      chatId: "12345",
      homepageId: 42,
      projectId: 7,
    };

    expect(config.themeSlug).toBe("flavor");
    expect(config.chatId).toBe("12345");
    expect(config.homepageId).toBe(42);
    expect(config.projectId).toBe(7);
  });

  it("should have correct TransformStepResult structure", () => {
    const step: TransformStepResult = {
      step: "Theme Analysis",
      stepNumber: 1,
      success: true,
      detail: "Theme: flavor. SEO Readiness: 65/100",
      duration: 3500,
      data: { theme: "flavor", seoReadiness: 65 },
    };

    expect(step.step).toBe("Theme Analysis");
    expect(step.stepNumber).toBe(1);
    expect(step.success).toBe(true);
    expect(step.duration).toBeGreaterThan(0);
    expect(step.data.theme).toBe("flavor");
  });

  it("should have correct SeoTransformResult structure", () => {
    const result: SeoTransformResult = {
      success: true,
      domain: "https://example.com",
      totalSteps: 10,
      completedSteps: 9,
      failedSteps: 1,
      steps: [
        { step: "Theme Analysis", stepNumber: 1, success: true, detail: "OK", duration: 1000 },
        { step: "Before Snapshot", stepNumber: 2, success: true, detail: "Score: 35/100", duration: 2000 },
        { step: "Layout Rebuild", stepNumber: 3, success: true, detail: "5 sections", duration: 5000 },
        { step: "On-Page SEO", stepNumber: 4, success: true, detail: "Score: 82/100", duration: 8000 },
        { step: "Support Pages", stepNumber: 5, success: true, detail: "3 pages", duration: 30000 },
        { step: "Internal Linking", stepNumber: 6, success: true, detail: "12 links", duration: 5000 },
        { step: "FAQ Section", stepNumber: 7, success: true, detail: "8 FAQs", duration: 4000 },
        { step: "Schema Markup", stepNumber: 8, success: true, detail: "5 schemas", duration: 1000 },
        { step: "SEO Validation", stepNumber: 9, success: true, detail: "35 → 82", duration: 3000 },
        { step: "Telegram Notification", stepNumber: 10, success: false, detail: "Error: timeout", duration: 5000 },
      ],
      beforeScore: 35,
      afterScore: 82,
      improvement: 47,
      totalDuration: 64000,
      notified: false,
    };

    expect(result.success).toBe(true);
    expect(result.totalSteps).toBe(10);
    expect(result.completedSteps).toBe(9);
    expect(result.failedSteps).toBe(1);
    expect(result.steps).toHaveLength(10);
    expect(result.beforeScore).toBe(35);
    expect(result.afterScore).toBe(82);
    expect(result.improvement).toBe(47);
    expect(result.totalDuration).toBeGreaterThan(0);
  });

  it("should handle result with no before/after scores", () => {
    const result: SeoTransformResult = {
      success: true,
      domain: "https://new-site.com",
      totalSteps: 10,
      completedSteps: 10,
      failedSteps: 0,
      steps: [],
      totalDuration: 30000,
      notified: true,
    };

    expect(result.beforeScore).toBeUndefined();
    expect(result.afterScore).toBeUndefined();
    expect(result.improvement).toBeUndefined();
    expect(result.preview).toBeUndefined();
    expect(result.notified).toBe(true);
  });
});

describe("SEO Transform Pipeline Module Exports", () => {
  it("should export runSeoTransformPipeline function", async () => {
    const mod = await import("./seo-transform-pipeline");
    expect(typeof mod.runSeoTransformPipeline).toBe("function");
  });
});

describe("SEO Theme Analyzer Module Exports", () => {
  it("should export analyzeInstalledTheme function", async () => {
    const mod = await import("./seo-theme-analyzer");
    expect(typeof mod.analyzeInstalledTheme).toBe("function");
    expect(typeof mod.quickAnalyzeHtml).toBe("function");
  });
});

describe("SEO Layout Rebuilder Module Exports", () => {
  it("should export rebuildHomepageLayout function", async () => {
    const mod = await import("./seo-layout-rebuilder");
    expect(typeof mod.rebuildHomepageLayout).toBe("function");
    expect(typeof mod.toWordPressBlockHtml).toBe("function");
    expect(typeof mod.generateSchemaMarkup).toBe("function");
  });
});

describe("SEO Content Engine Module Exports", () => {
  it("should export content generation functions", async () => {
    const mod = await import("./seo-content-engine");
    expect(typeof mod.generateSeoContent).toBe("function");
    expect(typeof mod.publishToWordPress).toBe("function");
    expect(typeof mod.planContentCluster).toBe("function");
    expect(typeof mod.generateContentBatch).toBe("function");
    expect(typeof mod.checkContentQuality).toBe("function");
  });
});

describe("SEO On-Page Optimizer Module Exports", () => {
  it("should export runFullOnPageOptimization function", async () => {
    const mod = await import("./seo-onpage-optimizer");
    expect(typeof mod.runFullOnPageOptimization).toBe("function");
  });
});

describe("SEO Linking & Schema Engine Module Exports", () => {
  it("should export all linking and schema functions", async () => {
    const mod = await import("./seo-linking-schema-engine");
    expect(typeof mod.buildInternalLinkingStrategy).toBe("function");
    expect(typeof mod.injectInternalLinks).toBe("function");
    expect(typeof mod.generateFaqSection).toBe("function");
    expect(typeof mod.generateComprehensiveSchema).toBe("function");
    expect(typeof mod.deploySchemaToWP).toBe("function");
    expect(typeof mod.deployFaqToWP).toBe("function");
  });
});

describe("SEO Validation Scorer Module Exports", () => {
  it("should export validation functions", async () => {
    const mod = await import("./seo-validation-scorer");
    expect(typeof mod.validateSeo).toBe("function");
    expect(typeof mod.compareSeoReports).toBe("function");
  });
});

describe("SEO Preview & Approval Module Exports", () => {
  it("should export preview functions", async () => {
    const mod = await import("./seo-preview-approval");
    expect(typeof mod.captureBeforeSnapshot).toBe("function");
    expect(typeof mod.createAfterSnapshot).toBe("function");
    expect(typeof mod.generatePreview).toBe("function");
    expect(typeof mod.formatPreviewForTelegram).toBe("function");
  });
});
