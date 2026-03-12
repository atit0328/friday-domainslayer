/**
 * Tests for Campaign Restart/Resume procedures
 * Verifies that the seo-automation router has proper restart/resume/reset procedures
 */
import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "{}" } }],
  }),
}));

// Mock db module
vi.mock("./db", () => ({
  getSeoProjectById: vi.fn(),
  updateSeoProject: vi.fn().mockResolvedValue(undefined),
  addSeoAction: vi.fn().mockResolvedValue({ id: 1 }),
  listSeoProjects: vi.fn().mockResolvedValue([]),
}));

// Mock campaign-engine
vi.mock("./campaign-engine", () => ({
  runPhase: vi.fn().mockResolvedValue({
    phase: 0,
    phaseName: "Technical Audit",
    thaiName: "ตรวจสอบเทคนิค",
    status: "completed",
    actions: [],
    aiAnalysis: "OK",
    detail: "OK",
    wpChanges: 0,
    duration: 1000,
  }),
  runAllPhases: vi.fn().mockResolvedValue({
    results: [],
    summary: { completed: 16, failed: 0, skipped: 0, totalWpChanges: 0 },
  }),
  recoverStaleCampaigns: vi.fn().mockResolvedValue(0),
  CAMPAIGN_PHASES: Array.from({ length: 16 }, (_, i) => ({
    id: i,
    name: `Phase ${i}`,
    icon: "Settings",
    thaiName: `เฟส ${i}`,
    description: `Phase ${i} description`,
    requiresWP: false,
  })),
}));

// Mock telegram-notifier
vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue(true),
}));

const mockDb = vi.mocked(await import("./db"));

const mockCtx: TrpcContext = {
  user: {
    id: 1,
    openId: "test-open-id",
    name: "Test User",
    role: "admin",
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    email: null,
  },
};

const caller = appRouter.createCaller(mockCtx);

describe("Campaign Restart/Resume Procedures", () => {
  describe("resumeCampaign", () => {
    it("should resume a failed campaign from current phase", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 5,
        campaignStatus: "failed",
        campaignEnabled: true,
        campaignStartedAt: new Date(),
      } as any);

      const result = await caller.seoProjects.resumeCampaign({ id: 1 });
      expect(result.resumed).toBe(true);
      expect(result.fromPhase).toBe(5);
      expect(result.restarted).toBe(false);
    });

    it("should restart a completed campaign (phase >= 16) from phase 0", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 16,
        campaignStatus: "completed",
        campaignEnabled: true,
        campaignStartedAt: new Date(),
      } as any);

      const result = await caller.seoProjects.resumeCampaign({ id: 1 });
      expect(result.resumed).toBe(true);
      expect(result.fromPhase).toBe(0);
      expect(result.restarted).toBe(true);
    });

    it("should throw error when campaign is currently running", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 3,
        campaignStatus: "running",
        campaignEnabled: true,
      } as any);

      await expect(
        caller.seoProjects.resumeCampaign({ id: 1 }),
      ).rejects.toThrow();
    });

    it("should resume an idle campaign", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 2,
        campaignStatus: "idle",
        campaignEnabled: false,
      } as any);

      const result = await caller.seoProjects.resumeCampaign({ id: 1 });
      expect(result.resumed).toBe(true);
      expect(result.fromPhase).toBe(2);
    });

    it("should throw error when project not found", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce(null as any);

      await expect(
        caller.seoProjects.resumeCampaign({ id: 999 }),
      ).rejects.toThrow("Project not found");
    });
  });

  describe("restartCampaign", () => {
    it("should restart a failed campaign from phase 0", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 8,
        campaignStatus: "failed",
        campaignEnabled: true,
      } as any);

      const result = await caller.seoProjects.restartCampaign({ id: 1 });
      expect(result.restarted).toBe(true);
      expect(result.fromPhase).toBe(0);
      expect(result.totalPhases).toBe(16);
    });

    it("should restart a completed campaign", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 16,
        campaignStatus: "completed",
        campaignEnabled: true,
      } as any);

      const result = await caller.seoProjects.restartCampaign({ id: 1 });
      expect(result.restarted).toBe(true);
      expect(result.fromPhase).toBe(0);
    });

    it("should throw error when campaign is currently running", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 5,
        campaignStatus: "running",
        campaignEnabled: true,
      } as any);

      await expect(
        caller.seoProjects.restartCampaign({ id: 1 }),
      ).rejects.toThrow();
    });

    it("should throw error when project not found", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce(null as any);

      await expect(
        caller.seoProjects.restartCampaign({ id: 999 }),
      ).rejects.toThrow("Project not found");
    });
  });

  describe("resetCampaign", () => {
    it("should reset a failed campaign to idle state", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 8,
        campaignStatus: "failed",
      } as any);

      const result = await caller.seoProjects.resetCampaign({ id: 1 });
      expect(result.success).toBe(true);

      // Verify updateSeoProject was called with correct reset values
      expect(mockDb.updateSeoProject).toHaveBeenCalledWith(1, expect.objectContaining({
        campaignPhase: 0,
        campaignProgress: 0,
        campaignStatus: "idle",
        campaignLastPhaseResult: null,
        campaignStartedAt: null,
        campaignCompletedAt: null,
        totalWpChanges: 0,
      }));
    });

    it("should throw error when campaign is running", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 3,
        campaignStatus: "running",
      } as any);

      await expect(
        caller.seoProjects.resetCampaign({ id: 1 }),
      ).rejects.toThrow();
    });

    it("should reset a completed campaign", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignPhase: 16,
        campaignStatus: "completed",
      } as any);

      const result = await caller.seoProjects.resetCampaign({ id: 1 });
      expect(result.success).toBe(true);
    });
  });

  describe("getCampaignStatus", () => {
    it("should return campaign status with phases", async () => {
      mockDb.getSeoProjectById.mockResolvedValueOnce({
        id: 1,
        domain: "test.com",
        campaignEnabled: true,
        campaignPhase: 5,
        campaignProgress: 31,
        campaignStatus: "failed",
        campaignStartedAt: new Date(),
        campaignCompletedAt: null,
        campaignLastPhaseResult: "SerpAPI quota exhausted",
        totalWpChanges: 3,
        wpConnected: true,
      } as any);

      const result = await caller.seoProjects.getCampaignStatus({ id: 1 });
      expect(result.enabled).toBe(true);
      expect(result.phase).toBe(5);
      expect(result.progress).toBe(31);
      expect(result.status).toBe("failed");
      expect(result.totalPhases).toBe(16);
      expect(result.phases).toHaveLength(16);
      // First 5 phases should be completed
      expect(result.phases[0].status).toBe("completed");
      expect(result.phases[4].status).toBe("completed");
      // Phase 5 should be pending (since campaign is failed, not running)
      expect(result.phases[5].status).toBe("pending");
    });
  });
});
