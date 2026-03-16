import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module before importing the tracker
vi.mock("./db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("../drizzle/schema", () => ({
  attackMethodStats: {
    methodId: "methodId",
    cmsType: "cmsType",
    wafType: "wafType",
    totalAttempts: "totalAttempts",
    successCount: "successCount",
    failCount: "failCount",
    timeoutCount: "timeoutCount",
    avgDurationMs: "avgDurationMs",
    lastSuccessAt: "lastSuccessAt",
    lastAttemptAt: "lastAttemptAt",
    successRate: "successRate",
  },
}));

import {
  recordMethodResult,
  type MethodResultInput,
} from "./attack-method-tracker";

describe("attack-method-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordMethodResult", () => {
    it("accepts valid method result input", async () => {
      const input: MethodResultInput = {
        methodId: "multipart_upload",
        cmsType: "wordpress",
        wafType: "cloudflare",
        success: true,
        durationMs: 1500,
      };

      // Should not throw
      await expect(recordMethodResult(input)).resolves.not.toThrow();
    });

    it("handles failure results with error message", async () => {
      const input: MethodResultInput = {
        methodId: "put_direct",
        cmsType: "wordpress",
        wafType: "none",
        success: false,
        durationMs: 5000,
        isTimeout: false,
        errorMessage: "403 Forbidden",
      };

      await expect(recordMethodResult(input)).resolves.not.toThrow();
    });

    it("handles timeout results", async () => {
      const input: MethodResultInput = {
        methodId: "webdav_put",
        cmsType: "joomla",
        wafType: "sucuri",
        success: false,
        durationMs: 30000,
        isTimeout: true,
      };

      await expect(recordMethodResult(input)).resolves.not.toThrow();
    });

    it("handles unknown CMS and WAF types", async () => {
      const input: MethodResultInput = {
        methodId: "origin_direct_upload",
        cmsType: "unknown",
        wafType: "none",
        success: true,
        durationMs: 800,
      };

      await expect(recordMethodResult(input)).resolves.not.toThrow();
    });
  });

  describe("MethodResultInput type validation", () => {
    it("requires all mandatory fields", () => {
      const input: MethodResultInput = {
        methodId: "test_method",
        cmsType: "wordpress",
        wafType: "cloudflare",
        success: true,
        durationMs: 100,
      };

      expect(input.methodId).toBe("test_method");
      expect(input.cmsType).toBe("wordpress");
      expect(input.wafType).toBe("cloudflare");
      expect(input.success).toBe(true);
      expect(input.durationMs).toBe(100);
    });

    it("supports optional fields", () => {
      const input: MethodResultInput = {
        methodId: "test_method",
        cmsType: "wordpress",
        wafType: "none",
        success: false,
        durationMs: 5000,
        isTimeout: true,
        errorMessage: "Connection refused",
      };

      expect(input.isTimeout).toBe(true);
      expect(input.errorMessage).toBe("Connection refused");
    });
  });
});
