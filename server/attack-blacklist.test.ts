import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB with factory function (hoisted) ───
const mockDbFns = vi.hoisted(() => {
  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  const mockValues = vi.fn().mockResolvedValue([]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  const mockSetWhere = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  const mockSet = vi.fn().mockReturnValue({ where: mockSetWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
  const mockDeleteWhere = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

  return {
    mockSelect, mockFrom, mockWhere, mockLimit, mockOrderBy,
    mockInsert, mockValues,
    mockUpdate, mockSet, mockSetWhere,
    mockDelete, mockDeleteWhere,
  };
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockDbFns.mockSelect,
    insert: mockDbFns.mockInsert,
    update: mockDbFns.mockUpdate,
    delete: mockDbFns.mockDelete,
  }),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a: any[]) => a),
  and: vi.fn((...a: any[]) => a),
  or: vi.fn((...a: any[]) => a),
  isNull: vi.fn((c: any) => c),
  gt: vi.fn((...a: any[]) => a),
  sql: vi.fn((s: any, ...v: any[]) => ({ s, v })),
  desc: vi.fn((c: any) => c),
}));

vi.mock("../drizzle/schema", () => ({
  attackBlacklist: {
    id: "id", domain: "domain", failCount: "failCount",
    isPermaBanned: "isPermaBanned", cooldownUntil: "cooldownUntil",
    reason: "reason", lastFailedAt: "lastFailedAt", errors: "errors",
    totalAttempts: "totalAttempts", totalDurationMs: "totalDurationMs",
    cms: "cms", serverType: "serverType", waf: "waf",
  },
}));

import {
  isBlacklisted,
  isOwnRedirectUrl,
  recordFailedAttack,
  recordSuccessfulAttack,
  filterTargets,
  getBlacklistStats,
  unblockDomain,
} from "./attack-blacklist";

describe("attack-blacklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default returns
    mockDbFns.mockLimit.mockResolvedValue([]);
    mockDbFns.mockFrom.mockReturnValue({ where: mockDbFns.mockWhere, orderBy: mockDbFns.mockOrderBy });
    mockDbFns.mockWhere.mockReturnValue({ limit: mockDbFns.mockLimit, orderBy: mockDbFns.mockOrderBy });
    mockDbFns.mockOrderBy.mockReturnValue({ limit: mockDbFns.mockLimit });
    mockDbFns.mockSelect.mockReturnValue({ from: mockDbFns.mockFrom });
    mockDbFns.mockInsert.mockReturnValue({ values: mockDbFns.mockValues });
    mockDbFns.mockUpdate.mockReturnValue({ set: mockDbFns.mockSet });
    mockDbFns.mockSet.mockReturnValue({ where: mockDbFns.mockSetWhere });
    mockDbFns.mockDelete.mockReturnValue({ where: mockDbFns.mockDeleteWhere });
  });

  describe("isBlacklisted", () => {
    it("should return not blacklisted for unknown domain", async () => {
      mockDbFns.mockLimit.mockResolvedValueOnce([]);
      const result = await isBlacklisted("https://example.com/path");
      expect(result.blacklisted).toBe(false);
    });

    it("should return blacklisted for perma-banned domain", async () => {
      mockDbFns.mockLimit.mockResolvedValueOnce([{
        domain: "example.com", failCount: 10, isPermaBanned: true,
        reason: "Too many failures", cooldownUntil: null,
      }]);
      const result = await isBlacklisted("example.com");
      expect(result.blacklisted).toBe(true);
      expect(result.isPermaBanned).toBe(true);
    });

    it("should return not blacklisted when cooldown expired", async () => {
      const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      mockDbFns.mockLimit.mockResolvedValueOnce([{
        domain: "example.com", failCount: 3, isPermaBanned: false,
        reason: "Failures", cooldownUntil: pastDate,
      }]);
      const result = await isBlacklisted("example.com");
      expect(result.blacklisted).toBe(false);
    });

    it("should return blacklisted when fail count exceeds threshold", async () => {
      const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
      mockDbFns.mockLimit.mockResolvedValueOnce([{
        domain: "example.com", failCount: 3, isPermaBanned: false,
        reason: "Multiple failures", cooldownUntil: futureDate,
      }]);
      const result = await isBlacklisted("example.com");
      expect(result.blacklisted).toBe(true);
      expect(result.failCount).toBe(3);
    });

    it("should extract domain from URL with port and path", async () => {
      mockDbFns.mockLimit.mockResolvedValueOnce([]);
      await isBlacklisted("https://static.vnpt.vn:8089/some/path");
      expect(mockDbFns.mockSelect).toHaveBeenCalled();
    });
  });

  describe("isOwnRedirectUrl", () => {
    it("should detect exact domain match", async () => {
      expect(await isOwnRedirectUrl("https://hkt956.org/", ["https://hkt956.org/"])).toBe(true);
    });

    it("should detect subdomain match", async () => {
      expect(await isOwnRedirectUrl("https://www.hkt956.org/", ["https://hkt956.org/"])).toBe(true);
    });

    it("should not match different domains", async () => {
      expect(await isOwnRedirectUrl("https://target.com/", ["https://hkt956.org/"])).toBe(false);
    });

    it("should handle domain with port", async () => {
      expect(await isOwnRedirectUrl("https://hkt956.org:8080/", ["https://hkt956.org/"])).toBe(true);
    });
  });

  describe("recordFailedAttack", () => {
    it("should create new entry for first failure", async () => {
      mockDbFns.mockLimit.mockResolvedValueOnce([]);
      const result = await recordFailedAttack({
        domain: "https://hard-target.com",
        reason: "All methods failed",
        errors: ["DNS timeout", "Config exploit timeout"],
        durationMs: 435000,
        cms: "WordPress", waf: "Cloudflare",
      });
      expect(mockDbFns.mockInsert).toHaveBeenCalled();
      expect(result.failCount).toBe(1);
    });

    it("should increment fail count for existing entry", async () => {
      mockDbFns.mockLimit.mockResolvedValueOnce([{
        id: 1, domain: "hard-target.com", failCount: 2,
        totalAttempts: 2, totalDurationMs: 800000,
        cms: "WordPress", serverType: "nginx", waf: "Cloudflare",
      }]);
      const result = await recordFailedAttack({
        domain: "hard-target.com",
        reason: "All methods failed again",
        errors: ["DNS timeout"], durationMs: 300000,
      });
      expect(mockDbFns.mockUpdate).toHaveBeenCalled();
      expect(result.failCount).toBe(3);
    });

    it("should perma-ban after 5 failures", async () => {
      mockDbFns.mockLimit.mockResolvedValueOnce([{
        id: 1, domain: "impossible-target.com", failCount: 4,
        totalAttempts: 4, totalDurationMs: 2000000,
        cms: null, serverType: null, waf: null,
      }]);
      const result = await recordFailedAttack({
        domain: "impossible-target.com",
        reason: "5th failure",
        errors: ["Everything failed"], durationMs: 500000,
      });
      expect(result.permaBanned).toBe(true);
      expect(result.failCount).toBe(5);
    });
  });

  describe("recordSuccessfulAttack", () => {
    it("should remove domain from blacklist on success", async () => {
      await recordSuccessfulAttack("https://now-vulnerable.com/");
      expect(mockDbFns.mockDelete).toHaveBeenCalled();
    });
  });

  describe("filterTargets", () => {
    it("should filter out self-redirect targets", async () => {
      const targets = [
        { domain: "target1.com", url: "https://target1.com" },
        { domain: "hkt956.org", url: "https://hkt956.org" },
        { domain: "target2.com", url: "https://target2.com" },
      ];
      const result = await filterTargets(targets, ["https://hkt956.org/"]);
      expect(result.blocked.length).toBe(1);
      expect(result.blocked[0].reason).toContain("Self-attack protection");
      expect(result.allowed.length).toBe(2);
    });

    it("should filter out blacklisted targets", async () => {
      mockDbFns.mockLimit
        .mockResolvedValueOnce([{
          domain: "target1.com", failCount: 5, isPermaBanned: true,
          reason: "Banned", cooldownUntil: null,
        }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const targets = [
        { domain: "target1.com", url: "https://target1.com" },
        { domain: "target2.com", url: "https://target2.com" },
      ];
      const result = await filterTargets(targets, ["https://mysite.com/"]);
      expect(result.blocked.length).toBe(1);
      expect(result.blocked[0].reason).toContain("Blacklisted");
      expect(result.allowed.length).toBe(1);
    });
  });

  describe("unblockDomain", () => {
    it("should delete domain from blacklist", async () => {
      const result = await unblockDomain("https://example.com");
      expect(result).toBe(true);
      expect(mockDbFns.mockDelete).toHaveBeenCalled();
    });
  });

  describe("getBlacklistStats", () => {
    it("should return stats from DB", async () => {
      const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
      const mockData = [
        { domain: "a.com", failCount: 3, isPermaBanned: true, reason: "Banned", lastFailedAt: new Date(), cooldownUntil: null },
        { domain: "b.com", failCount: 2, isPermaBanned: false, reason: "Temp", lastFailedAt: new Date(), cooldownUntil: futureDate },
      ];
      // getBlacklistStats uses: select().from().orderBy().limit(100)
      // The chain is: select -> from -> orderBy -> limit
      const mockLimitForStats = vi.fn().mockResolvedValueOnce(mockData);
      const mockOrderByForStats = vi.fn().mockReturnValue({ limit: mockLimitForStats });
      const mockFromForStats = vi.fn().mockReturnValue({ where: mockDbFns.mockWhere, orderBy: mockOrderByForStats });
      mockDbFns.mockSelect.mockReturnValueOnce({ from: mockFromForStats });

      const stats = await getBlacklistStats();
      expect(stats.totalBlacklisted).toBe(2);
      expect(stats.permaBanned).toBe(1);
      expect(stats.inCooldown).toBe(1);
      expect(stats.recentFailures.length).toBe(2);
    });
  });
});
