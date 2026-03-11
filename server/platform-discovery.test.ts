import { describe, it, expect, beforeEach } from "vitest";
import {
  getPlatformStats,
  getAllPlatforms,
  discoverNewPlatforms,
  getPostHistory,
} from "./platform-discovery-engine";

describe("Platform Discovery Engine", () => {
  describe("getPlatformStats", () => {
    it("should return stats with all required fields", () => {
      const stats = getPlatformStats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("byType");
      expect(stats).toHaveProperty("byAuth");
      expect(stats).toHaveProperty("byLinkType");
      expect(stats).toHaveProperty("avgDA");
      expect(stats).toHaveProperty("totalPosts");
      expect(stats).toHaveProperty("totalIndexed");
      expect(stats).toHaveProperty("topPerformers");
      expect(stats).toHaveProperty("recentDiscoveries");
    });

    it("should have 45+ seed platforms", () => {
      const stats = getPlatformStats();
      expect(stats.total).toBeGreaterThanOrEqual(45);
    });

    it("should have multiple platform types", () => {
      const stats = getPlatformStats();
      const types = Object.keys(stats.byType);
      expect(types.length).toBeGreaterThanOrEqual(3);
    });

    it("should have positive average DA", () => {
      const stats = getPlatformStats();
      expect(stats.avgDA).toBeGreaterThan(0);
    });
  });

  describe("getAllPlatforms", () => {
    it("should return an array of platforms", () => {
      const platforms = getAllPlatforms();
      expect(Array.isArray(platforms)).toBe(true);
      expect(platforms.length).toBeGreaterThanOrEqual(45);
    });

    it("each platform should have required fields", () => {
      const platforms = getAllPlatforms();
      const first = platforms[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("url");
      expect(first).toHaveProperty("type");
      expect(first).toHaveProperty("estimatedDA");
      expect(first).toHaveProperty("linkType");
      expect(first).toHaveProperty("authMethod");
      expect(first).toHaveProperty("isAlive");
      expect(first).toHaveProperty("priorityScore");
    });

    it("should have platforms with different types", () => {
      const platforms = getAllPlatforms();
      const types = new Set(platforms.map(p => p.type));
      expect(types.size).toBeGreaterThanOrEqual(3);
    });

    it("should include paste, blog, wiki, and forum platforms", () => {
      const platforms = getAllPlatforms();
      const types = new Set(platforms.map(p => p.type));
      expect(types.has("paste")).toBe(true);
      expect(types.has("blog")).toBe(true);
    });
  });

  describe("discoverNewPlatforms", () => {
    it("should discover platforms for a given niche", async () => {
      const result = await discoverNewPlatforms("gambling", 3);
      expect(result).toHaveProperty("discovered");
      expect(result).toHaveProperty("newPlatforms");
      expect(Array.isArray(result.discovered)).toBe(true);
    });
  });

  describe("getPostHistory", () => {
    it("should return an array", () => {
      const history = getPostHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
