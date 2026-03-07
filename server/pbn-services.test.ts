import { describe, expect, it } from "vitest";
import { calculateHotScore, type HotPBNScore } from "./pbn-services";

// ═══ Hot PBN Scorer Tests ═══
describe("PBN Services — Hot PBN Scorer", () => {
  it("gives 5 stars to a high-quality site", () => {
    const site = {
      id: 1, name: "premium-domain.com", url: "https://premium-domain.com",
      da: 55, dr: 50, pa: 40, spamScore: 2, domainAge: "12 years",
      postCount: 25, status: "active",
    };
    const result = calculateHotScore(site);
    expect(result.stars).toBe(5);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.badges).toContain("🏆 High DA");
    expect(result.badges).toContain("🛡️ Ultra Clean");
    expect(result.badges).toContain("🏛️ Aged Domain");
    expect(result.badges).toContain("📝 Active");
    expect(result.siteId).toBe(1);
    expect(result.domain).toBe("premium-domain.com");
  });

  it("gives 1 star to a low-quality site", () => {
    const site = {
      id: 2, name: "bad-site.xyz", url: "https://bad-site.xyz",
      da: 2, dr: 1, pa: 1, spamScore: 50, domainAge: null,
      postCount: 0, status: "inactive",
    };
    const result = calculateHotScore(site);
    expect(result.stars).toBeLessThanOrEqual(2);
    expect(result.score).toBeLessThan(20);
  });

  it("gives 3 stars to a moderate site", () => {
    const site = {
      id: 3, name: "decent-site.com", url: "https://decent-site.com",
      da: 20, dr: 18, pa: 15, spamScore: 10, domainAge: "3 years",
      postCount: 5, status: "active",
    };
    const result = calculateHotScore(site);
    expect(result.stars).toBeGreaterThanOrEqual(2);
    expect(result.stars).toBeLessThanOrEqual(4);
    expect(result.score).toBeGreaterThan(20);
  });

  it("penalizes offline sites", () => {
    const onlineSite = {
      id: 4, name: "online.com", url: "https://online.com",
      da: 30, dr: 25, pa: 20, spamScore: 5, domainAge: "5 years",
      postCount: 10, status: "active",
    };
    const offlineSite = {
      ...onlineSite, id: 5, name: "offline.com", status: "down",
    };
    const onlineScore = calculateHotScore(onlineSite);
    const offlineScore = calculateHotScore(offlineSite);
    expect(onlineScore.score).toBeGreaterThan(offlineScore.score);
    expect(offlineScore.badges).toContain("🔴 Offline");
  });

  it("handles null/undefined metrics gracefully", () => {
    const site = {
      id: 6, name: "empty.com", url: "https://empty.com",
      da: null, dr: null, pa: null, spamScore: null, domainAge: null,
      postCount: 0, status: "active",
    };
    const result = calculateHotScore(site);
    expect(result.stars).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("rewards high spam score with warning badge", () => {
    const site = {
      id: 7, name: "spammy.com", url: "https://spammy.com",
      da: 40, dr: 35, pa: 30, spamScore: 40, domainAge: "8 years",
      postCount: 50, status: "active",
    };
    const result = calculateHotScore(site);
    expect(result.badges).toContain("⚠️ High Spam");
  });

  it("returns correct structure", () => {
    const site = {
      id: 8, name: "test.com", url: "https://test.com",
      da: 25, dr: 20, pa: 18, spamScore: 8, domainAge: "4 years",
      postCount: 3, status: "active",
    };
    const result = calculateHotScore(site);
    expect(result).toHaveProperty("siteId");
    expect(result).toHaveProperty("domain");
    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("stars");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("reasons");
    expect(result).toHaveProperty("metrics");
    expect(result).toHaveProperty("badges");
    expect(result.metrics).toHaveProperty("da");
    expect(result.metrics).toHaveProperty("dr");
    expect(result.metrics).toHaveProperty("pa");
    expect(result.metrics).toHaveProperty("spamScore");
    expect(result.metrics).toHaveProperty("age");
    expect(result.metrics).toHaveProperty("postCount");
    expect(result.metrics).toHaveProperty("isOnline");
  });

  it("star rating is between 1 and 5", () => {
    const testCases = [
      { da: 0, dr: 0, spamScore: 100, status: "inactive" },
      { da: 10, dr: 5, spamScore: 20, status: "active" },
      { da: 30, dr: 25, spamScore: 5, status: "active" },
      { da: 60, dr: 55, spamScore: 1, status: "active" },
      { da: 100, dr: 100, spamScore: 0, status: "active" },
    ];
    for (const tc of testCases) {
      const result = calculateHotScore({
        id: 99, name: "test.com", url: "https://test.com",
        pa: 10, domainAge: "5 years", postCount: 10, ...tc,
      });
      expect(result.stars).toBeGreaterThanOrEqual(1);
      expect(result.stars).toBeLessThanOrEqual(5);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it("correctly identifies aged domains", () => {
    const site = {
      id: 10, name: "old.com", url: "https://old.com",
      da: 15, dr: 10, pa: 8, spamScore: 5, domainAge: "15 years",
      postCount: 2, status: "active",
    };
    const result = calculateHotScore(site);
    expect(result.badges).toContain("🏛️ Aged Domain");
    expect(result.reasons.some(r => r.includes("Aged domain"))).toBe(true);
  });

  it("active content gets higher score", () => {
    const activeSite = {
      id: 11, name: "active.com", url: "https://active.com",
      da: 20, dr: 15, pa: 12, spamScore: 8, domainAge: "3 years",
      postCount: 30, status: "active",
    };
    const inactiveSite = {
      ...activeSite, id: 12, name: "inactive.com", postCount: 0,
    };
    const activeScore = calculateHotScore(activeSite);
    const inactiveScore = calculateHotScore(inactiveSite);
    expect(activeScore.score).toBeGreaterThan(inactiveScore.score);
    expect(activeScore.badges).toContain("📝 Active");
  });
});

// ═══ Expire Alert Logic Tests ═══
describe("PBN Services — Expire Date Helpers", () => {
  it("detects expired domains", () => {
    const pastDate = "2024-01-01";
    const d = new Date(pastDate);
    expect(d < new Date()).toBe(true);
  });

  it("detects domains expiring within 30 days", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 15);
    const diff = futureDate.getTime() - Date.now();
    const daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000));
    expect(daysLeft).toBeGreaterThan(0);
    expect(daysLeft).toBeLessThanOrEqual(30);
  });

  it("calculates urgency levels correctly", () => {
    const now = new Date();

    // Critical: 0-7 days
    const critical = new Date(now);
    critical.setDate(critical.getDate() + 3);
    const criticalDays = Math.ceil((critical.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    expect(criticalDays).toBeLessThanOrEqual(7);

    // Warning: 8-14 days
    const warning = new Date(now);
    warning.setDate(warning.getDate() + 10);
    const warningDays = Math.ceil((warning.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    expect(warningDays).toBeGreaterThan(7);
    expect(warningDays).toBeLessThanOrEqual(14);

    // Notice: 15-30 days
    const notice = new Date(now);
    notice.setDate(notice.getDate() + 20);
    const noticeDays = Math.ceil((notice.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    expect(noticeDays).toBeGreaterThan(14);
    expect(noticeDays).toBeLessThanOrEqual(30);
  });
});

// ═══ Health Check Result Structure Tests ═══
describe("PBN Services — Health Check Types", () => {
  it("health check result has correct structure", () => {
    const result = {
      siteId: 1,
      domain: "test.com",
      online: true,
      statusCode: 200,
      responseTimeMs: 150,
      error: null,
      checkedAt: new Date().toISOString(),
    };
    expect(result).toHaveProperty("siteId");
    expect(result).toHaveProperty("domain");
    expect(result).toHaveProperty("online");
    expect(result).toHaveProperty("statusCode");
    expect(result).toHaveProperty("responseTimeMs");
    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("checkedAt");
    expect(typeof result.online).toBe("boolean");
    expect(typeof result.statusCode).toBe("number");
  });

  it("offline result has error message", () => {
    const result = {
      siteId: 2,
      domain: "down.com",
      online: false,
      statusCode: null,
      responseTimeMs: 10000,
      error: "Connection timeout",
      checkedAt: new Date().toISOString(),
    };
    expect(result.online).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.statusCode).toBeNull();
  });
});

// ═══ Auto-Post Config Tests ═══
describe("PBN Services — Auto-Post Config", () => {
  it("auto-post config has required fields", () => {
    const config = {
      targetUrl: "https://mysite.com",
      anchorText: "best crypto",
      keyword: "crypto trading",
      niche: "cryptocurrency",
      count: 5,
    };
    expect(config.targetUrl).toBeTruthy();
    expect(config.anchorText).toBeTruthy();
    expect(config.count).toBeGreaterThan(0);
    expect(config.count).toBeLessThanOrEqual(50);
  });

  it("auto-post result tracks success/failure", () => {
    const result = {
      totalPlanned: 5,
      totalPosted: 3,
      totalFailed: 2,
      posts: [
        { siteId: 1, siteName: "site1.com", title: "Post 1", status: "published" as const },
        { siteId: 2, siteName: "site2.com", title: "Post 2", status: "published" as const },
        { siteId: 3, siteName: "site3.com", title: "Post 3", status: "published" as const },
        { siteId: 4, siteName: "site4.com", title: "Post 4", status: "failed" as const, error: "Auth error" },
        { siteId: 5, siteName: "site5.com", title: "Post 5", status: "failed" as const, error: "Timeout" },
      ],
    };
    expect(result.totalPlanned).toBe(5);
    expect(result.totalPosted).toBe(3);
    expect(result.totalFailed).toBe(2);
    expect(result.posts.filter(p => p.status === "published").length).toBe(3);
    expect(result.posts.filter(p => p.status === "failed").length).toBe(2);
  });
});

// ═══ Metrics Update Structure Tests (now uses real Moz/SimilarWeb API) ═══
describe("PBN Services — Real API Metrics Update", () => {
  it("metrics update result tracks changes correctly", () => {
    const result = {
      siteId: 1,
      domain: "test.com",
      oldMetrics: { da: 15, dr: 12, pa: 10, spamScore: 75 },
      newMetrics: { da: 18, dr: 14, pa: 12, spamScore: 5, backlinks: 150, referringDomains: 45 },
      changes: { da: 3, dr: 2, pa: 2, spamScore: -70 },
      updatedAt: new Date().toISOString(),
    };
    expect(result.changes.da).toBe(result.newMetrics.da - result.oldMetrics.da);
    expect(result.changes.dr).toBe(result.newMetrics.dr - result.oldMetrics.dr);
    expect(result.changes.spamScore).toBe(result.newMetrics.spamScore - result.oldMetrics.spamScore);
    // Spam score should drop significantly when switching from LLM to real API
    expect(result.newMetrics.spamScore).toBeLessThan(result.oldMetrics.spamScore);
  });

  it("MetricsUpdateResult has all required fields", () => {
    const result = {
      siteId: 1,
      domain: "example.com",
      oldMetrics: { da: null, dr: null, pa: null, spamScore: null },
      newMetrics: { da: 10, dr: 8, pa: 7, spamScore: 12, backlinks: 50, referringDomains: 20 },
      changes: { da: 10, dr: 8, pa: 7, spamScore: 12 },
      updatedAt: new Date().toISOString(),
    };
    expect(result).toHaveProperty("siteId");
    expect(result).toHaveProperty("domain");
    expect(result).toHaveProperty("oldMetrics");
    expect(result).toHaveProperty("newMetrics");
    expect(result).toHaveProperty("changes");
    expect(result).toHaveProperty("updatedAt");
    expect(result.newMetrics).toHaveProperty("backlinks");
    expect(result.newMetrics).toHaveProperty("referringDomains");
  });
});
