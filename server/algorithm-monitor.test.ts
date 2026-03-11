import { describe, it, expect } from "vitest";
import {
  getMonitorStatus,
  getAllUpdates,
  getVolatilityHistory,
  getUpdateTimeline,
} from "./algorithm-update-monitor";

describe("Algorithm Update Monitor", () => {
  describe("getMonitorStatus", () => {
    it("should return status with required fields", () => {
      const status = getMonitorStatus();
      expect(status).toHaveProperty("totalUpdates");
      expect(status).toHaveProperty("currentVolatility");
      expect(status).toHaveProperty("lastCheck");
      expect(status).toHaveProperty("volatilityTrend");
      expect(status).toHaveProperty("activeAlerts");
    });

    it("should have numeric values", () => {
      const status = getMonitorStatus();
      expect(typeof status.totalUpdates).toBe("number");
      expect(typeof status.currentVolatility).toBe("number");
      expect(["rising", "stable", "falling"]).toContain(status.volatilityTrend);
    });
  });

  describe("getAllUpdates", () => {
    it("should return an array", () => {
      const updates = getAllUpdates();
      expect(Array.isArray(updates)).toBe(true);
    });

    it("each update should have required fields", () => {
      const updates = getAllUpdates();
      if (updates.length > 0) {
        const first = updates[0];
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("name");
        expect(first).toHaveProperty("severity");
        expect(first).toHaveProperty("category");
      }
    });
  });

  describe("getVolatilityHistory", () => {
    it("should return an array", () => {
      const volatility = getVolatilityHistory();
      expect(Array.isArray(volatility)).toBe(true);
    });
  });

  describe("getUpdateTimeline", () => {
    it("should return an array", () => {
      const timeline = getUpdateTimeline();
      expect(Array.isArray(timeline)).toBe(true);
    });
  });
});
