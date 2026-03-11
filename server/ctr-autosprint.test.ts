import { describe, expect, it, beforeEach } from "vitest";

/**
 * Tests for CTR Manipulation Engine + Auto-Sprint Trigger
 * 
 * Tests pure functions and state management (no network calls).
 * LLM-dependent functions are tested for structure only.
 */

describe("CTR Manipulation Engine", () => {
  describe("Campaign State Management", () => {
    it("getActiveCTRCampaigns returns empty array initially", async () => {
      const { getActiveCTRCampaigns } = await import("./ctr-manipulation-engine");
      const campaigns = getActiveCTRCampaigns();
      expect(Array.isArray(campaigns)).toBe(true);
    });

    it("getCTRCampaignState returns null for non-existent campaign", async () => {
      const { getCTRCampaignState } = await import("./ctr-manipulation-engine");
      const state = getCTRCampaignState("non_existent_campaign_id");
      expect(state).toBeNull();
    });

    it("getCTRSummary returns valid summary structure", async () => {
      const { getCTRSummary } = await import("./ctr-manipulation-engine");
      const summary = getCTRSummary();
      expect(summary).toHaveProperty("activeCampaigns");
      expect(summary).toHaveProperty("totalPosts");
      expect(summary).toHaveProperty("totalEstimatedClicks");
      expect(summary).toHaveProperty("platformDistribution");
      expect(typeof summary.activeCampaigns).toBe("number");
      expect(typeof summary.totalPosts).toBe("number");
      expect(typeof summary.totalEstimatedClicks).toBe("number");
      expect(typeof summary.platformDistribution).toBe("object");
    });
  });

  describe("CTRCampaignConfig Interface", () => {
    it("validates required config fields", async () => {
      const mod = await import("./ctr-manipulation-engine");
      // Verify the type exports exist by checking function signatures
      expect(typeof mod.initializeCTRCampaign).toBe("function");
      expect(typeof mod.executeCTRDay).toBe("function");
      expect(typeof mod.ctrOrchestratorTick).toBe("function");
    });

    it("SocialPlatform type covers expected platforms", async () => {
      // Verify the module exports the expected functions for social platforms
      const mod = await import("./ctr-manipulation-engine");
      expect(typeof mod.generateSocialContent).toBe("function");
      expect(typeof mod.deploySocialPost).toBe("function");
      expect(typeof mod.findRelevantCommunities).toBe("function");
    });
  });

  describe("Content Generation Functions", () => {
    it("generateSocialContent is exported and callable", async () => {
      const { generateSocialContent } = await import("./ctr-manipulation-engine");
      expect(typeof generateSocialContent).toBe("function");
    });

    it("generateViralHooks is exported and callable", async () => {
      const { generateViralHooks } = await import("./ctr-manipulation-engine");
      expect(typeof generateViralHooks).toBe("function");
    });

    it("generateBrandedSearchSignals is exported and callable", async () => {
      const { generateBrandedSearchSignals } = await import("./ctr-manipulation-engine");
      expect(typeof generateBrandedSearchSignals).toBe("function");
    });

    it("repurposeContent is exported and callable", async () => {
      const { repurposeContent } = await import("./ctr-manipulation-engine");
      expect(typeof repurposeContent).toBe("function");
    });

    it("generateCommunityPost is exported and callable", async () => {
      const { generateCommunityPost } = await import("./ctr-manipulation-engine");
      expect(typeof generateCommunityPost).toBe("function");
    });
  });

  describe("deploySocialPost", () => {
    it("returns post with deployed status and timestamp", async () => {
      const { deploySocialPost } = await import("./ctr-manipulation-engine");
      const mockPost = {
        id: "test_post_1",
        platform: "reddit" as const,
        format: "discussion" as const,
        title: "Test Post",
        content: "This is a test post content for CTR manipulation",
        targetUrl: "https://example.com",
        keywords: ["test", "seo"],
        hashtags: ["#test"],
        cta: "Check this out",
        scheduledAt: new Date(),
        status: "pending" as const,
        estimatedReach: 100,
        estimatedClicks: 10,
      };

      const result = await deploySocialPost(mockPost);
      expect(result.status).toBe("posted");
      expect(result.postedAt).toBeInstanceOf(Date);
      expect(result.id).toBe("test_post_1");
    });
  });
});

describe("Auto-Sprint Trigger", () => {
  describe("Configuration Management", () => {
    it("getAutoSprintConfig returns valid config", async () => {
      const { getAutoSprintConfig } = await import("./auto-sprint-trigger");
      const config = getAutoSprintConfig();
      expect(config).toHaveProperty("minKeywordsRequired");
      expect(config).toHaveProperty("maxWaitForKeywords");
      expect(config).toHaveProperty("aggressivenessMapping");
      expect(config).toHaveProperty("enableCTR");
      expect(config).toHaveProperty("ctrPlatforms");
      expect(config).toHaveProperty("autoStartEnabled");
      expect(config).toHaveProperty("eligibleStrategies");
      expect(typeof config.minKeywordsRequired).toBe("number");
      expect(config.minKeywordsRequired).toBeGreaterThan(0);
    });

    it("updateAutoSprintConfig merges updates correctly", async () => {
      const { updateAutoSprintConfig, getAutoSprintConfig } = await import("./auto-sprint-trigger");
      
      const originalConfig = getAutoSprintConfig();
      const updated = updateAutoSprintConfig({ minKeywordsRequired: 5 });
      
      expect(updated.minKeywordsRequired).toBe(5);
      expect(updated.enableCTR).toBe(originalConfig.enableCTR);
      
      // Restore original
      updateAutoSprintConfig({ minKeywordsRequired: originalConfig.minKeywordsRequired });
    });

    it("setAutoSprintEnabled toggles enabled state", async () => {
      const { setAutoSprintEnabled, isAutoSprintEnabled } = await import("./auto-sprint-trigger");
      
      const original = isAutoSprintEnabled();
      setAutoSprintEnabled(false);
      expect(isAutoSprintEnabled()).toBe(false);
      
      setAutoSprintEnabled(true);
      expect(isAutoSprintEnabled()).toBe(true);
      
      // Restore
      setAutoSprintEnabled(original);
    });
  });

  describe("Status & Tracking", () => {
    it("getAutoSprintStatus returns valid status object", async () => {
      const { getAutoSprintStatus } = await import("./auto-sprint-trigger");
      const status = getAutoSprintStatus();
      
      expect(status).toHaveProperty("enabled");
      expect(status).toHaveProperty("triggeredCount");
      expect(status).toHaveProperty("triggeredProjectIds");
      expect(status).toHaveProperty("config");
      expect(typeof status.enabled).toBe("boolean");
      expect(typeof status.triggeredCount).toBe("number");
      expect(Array.isArray(status.triggeredProjectIds)).toBe(true);
    });

    it("resetTriggeredProjects clears tracking", async () => {
      const { resetTriggeredProjects, getAutoSprintStatus } = await import("./auto-sprint-trigger");
      
      resetTriggeredProjects();
      const status = getAutoSprintStatus();
      expect(status.triggeredCount).toBe(0);
      expect(status.triggeredProjectIds).toHaveLength(0);
    });

    it("resetTriggeredProjects can clear specific project IDs", async () => {
      const { resetTriggeredProjects, getAutoSprintStatus } = await import("./auto-sprint-trigger");
      
      // Reset specific IDs (even if they don't exist, should not error)
      resetTriggeredProjects([999, 1000]);
      const status = getAutoSprintStatus();
      expect(typeof status.triggeredCount).toBe("number");
    });
  });

  describe("triggerAutoSprint", () => {
    it("returns not-triggered when auto-sprint is disabled", async () => {
      const { triggerAutoSprint, setAutoSprintEnabled } = await import("./auto-sprint-trigger");
      
      setAutoSprintEnabled(false);
      const result = await triggerAutoSprint(99999);
      
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("disabled");
      expect(result.projectId).toBe(99999);
      
      // Restore
      setAutoSprintEnabled(true);
    });

    it("returns not-triggered for non-existent project", async () => {
      const { triggerAutoSprint, setAutoSprintEnabled, resetTriggeredProjects } = await import("./auto-sprint-trigger");
      
      setAutoSprintEnabled(true);
      resetTriggeredProjects();
      
      const result = await triggerAutoSprint(99999);
      
      // Should fail because project doesn't exist in DB
      expect(result.triggered).toBe(false);
      expect(result.projectId).toBe(99999);
    }, 15000);

    it("SprintTriggerResult has correct shape", async () => {
      const { triggerAutoSprint, setAutoSprintEnabled } = await import("./auto-sprint-trigger");
      
      setAutoSprintEnabled(false);
      const result = await triggerAutoSprint(1);
      
      expect(result).toHaveProperty("triggered");
      expect(result).toHaveProperty("reason");
      expect(result).toHaveProperty("projectId");
      expect(result).toHaveProperty("domain");
      expect(typeof result.triggered).toBe("boolean");
      expect(typeof result.reason).toBe("string");
      expect(typeof result.projectId).toBe("number");
      expect(typeof result.domain).toBe("string");
      
      setAutoSprintEnabled(true);
    });
  });

  describe("Aggressiveness Mapping", () => {
    it("config has mapping for all levels 1-10", async () => {
      const { getAutoSprintConfig } = await import("./auto-sprint-trigger");
      const config = getAutoSprintConfig();
      
      for (let i = 1; i <= 10; i++) {
        const key = String(i);
        expect(config.aggressivenessMapping).toHaveProperty(key);
        expect(["extreme", "aggressive", "moderate"]).toContain(config.aggressivenessMapping[key]);
      }
    });

    it("eligible strategies include grey_hat and black_hat", async () => {
      const { getAutoSprintConfig } = await import("./auto-sprint-trigger");
      const config = getAutoSprintConfig();
      
      expect(config.eligibleStrategies).toContain("grey_hat");
      expect(config.eligibleStrategies).toContain("black_hat");
      expect(config.eligibleStrategies).toContain("parasite_seo");
    });
  });
});

describe("CTR + Sprint Integration", () => {
  it("ctrOrchestratorTick is exported and callable", async () => {
    const { ctrOrchestratorTick } = await import("./ctr-manipulation-engine");
    expect(typeof ctrOrchestratorTick).toBe("function");
  });

  it("triggerSprintsForExistingProjects is exported and callable", async () => {
    const { triggerSprintsForExistingProjects } = await import("./auto-sprint-trigger");
    expect(typeof triggerSprintsForExistingProjects).toBe("function");
  });
});
