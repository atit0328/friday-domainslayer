import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            position: 12,
            url: "https://test.com/page",
            title: "Test Page - Best Crypto Wallet",
            snippet: "Discover the best crypto wallet for secure storage...",
            serpFeatures: [
              { type: "featured_snippet", position: 0, description: "AI overview snippet" },
              { type: "people_also_ask", position: 3, description: "Related questions" },
            ],
            competitors: [
              { domain: "competitor1.com", position: 5, title: "Competitor 1" },
              { domain: "competitor2.com", position: 8, title: "Competitor 2" },
            ],
            aiAnalysis: "Domain ranks at position 12 with room for improvement.",
            rankingFactors: {
              contentRelevance: 7,
              backlinkStrength: 6,
              domainAuthority: 5,
              userExperience: 7,
              technicalSEO: 6,
            },
            opportunities: ["Optimize content for featured snippet", "Build more tier 1 backlinks"],
          }),
        },
      },
    ],
  }),
}));

// Mock the seo-engine module
vi.mock("./seo-engine", () => ({
  analyzeDomain: vi.fn().mockResolvedValue({
    domain: "test.com",
    currentState: { estimatedDA: 35 },
    overallHealth: 72,
    riskLevel: "medium",
    aiSummary: "Test",
  }),
  generateStrategy: vi.fn().mockResolvedValue({ phases: [], backlinkPlan: {}, riskAssessment: {}, aiRecommendation: "" }),
  researchKeywords: vi.fn().mockResolvedValue({ primaryKeywords: [], longTailKeywords: [], aiInsights: "" }),
  analyzeRankings: vi.fn().mockResolvedValue({ overallTrend: "improving", aiSummary: "", keywordAnalysis: [], nextActions: [] }),
  analyzeBacklinks: vi.fn().mockResolvedValue({ profileHealth: 75, aiSummary: "", recommendations: [], riskFactors: [], distribution: {} }),
  generateSEOContent: vi.fn().mockResolvedValue({ title: "", content: "", metaDescription: "", wordCount: 0, targetKeyword: "" }),
  analyzeAlgorithm: vi.fn().mockResolvedValue({ updateType: "minor_core", impactLevel: "minor", aiAnalysis: "", affectedAreas: [], recommendations: [] }),
}));

// Mock pbn-bridge module
vi.mock("./pbn-bridge", () => ({
  generateAnchorPlan: vi.fn().mockResolvedValue({
    anchors: [
      { text: "best crypto wallet", type: "exact_match", percentage: 15 },
      { text: "test.com", type: "branded", percentage: 35 },
      { text: "click here", type: "generic", percentage: 20 },
      { text: "crypto wallet guide", type: "partial_match", percentage: 15 },
      { text: "https://test.com", type: "naked_url", percentage: 10 },
      { text: "secure digital wallet", type: "lsi", percentage: 5 },
    ],
    aiReasoning: "Distribution follows safe ratios for grey_hat strategy with branded anchors dominating.",
  }),
  executePBNBuild: vi.fn().mockResolvedValue({
    totalPlanned: 5,
    totalBuilt: 4,
    totalFailed: 1,
    posts: [
      { siteId: 1, siteName: "pbn-site1.com", postId: 101, title: "Best Crypto Wallets 2026", status: "published", backlinkId: 50 },
      { siteId: 2, siteName: "pbn-site2.com", postId: 102, title: "Digital Wallet Security Guide", status: "published", backlinkId: 51 },
      { siteId: 3, siteName: "pbn-site3.com", postId: 103, title: "Cryptocurrency Storage Tips", status: "published", backlinkId: 52 },
      { siteId: 4, siteName: "pbn-site4.com", postId: 104, title: "Secure Your Bitcoin", status: "published", backlinkId: 53 },
      { siteId: 5, siteName: "pbn-site5.com", postId: 0, title: "", status: "failed", error: "Connection timeout" },
    ],
    aiSummary: "PBN campaign executed: 4/5 backlinks successfully built across 4 PBN sites.",
  }),
  scorePBNSites: vi.fn().mockResolvedValue([
    { siteId: 1, domain: "pbn-site1.com", score: 85, reasons: ["High DA", "Relevant niche"] },
    { siteId: 2, domain: "pbn-site2.com", score: 72, reasons: ["Good metrics"] },
  ]),
}));

// Mock serp-tracker module
vi.mock("./serp-tracker", () => ({
  checkKeywordRank: vi.fn().mockResolvedValue({
    keyword: "crypto wallet",
    position: 12,
    previousPosition: 18,
    change: 6,
    url: "https://test.com/page",
    title: "Test Page - Best Crypto Wallet",
    snippet: "Discover the best crypto wallet...",
    serpFeatures: [
      { type: "featured_snippet", position: 0, description: "AI overview" },
    ],
    competitors: [
      { domain: "competitor1.com", position: 5, title: "Competitor 1" },
    ],
    aiAnalysis: "Ranking improved by 6 positions.",
    rankingFactors: {
      contentRelevance: 7,
      backlinkStrength: 6,
      domainAuthority: 5,
      userExperience: 7,
      technicalSEO: 6,
    },
    opportunities: ["Optimize for featured snippet"],
    checkedAt: new Date().toISOString(),
    country: "US",
    device: "desktop",
  }),
  bulkRankCheck: vi.fn().mockResolvedValue({
    totalKeywords: 5,
    rankedKeywords: 4,
    notRanked: 1,
    avgPosition: 15.5,
    top3: 0,
    top10: 1,
    top30: 3,
    top100: 4,
    improved: 3,
    declined: 1,
    unchanged: 1,
    results: [
      { keyword: "crypto wallet", position: 12, previousPosition: 18, change: 6 },
      { keyword: "bitcoin exchange", position: 8, previousPosition: 12, change: 4 },
    ],
    aiSummary: "Overall positive trend. 3 keywords improved.",
    checkedAt: new Date().toISOString(),
  }),
  analyzeSERPFeatures: vi.fn().mockResolvedValue({
    keywords: [
      {
        keyword: "crypto wallet",
        features: [
          { type: "featured_snippet", present: true, ownedByDomain: false },
          { type: "people_also_ask", present: true, ownedByDomain: false },
        ],
      },
    ],
    opportunities: ["Target featured snippet for 'crypto wallet'"],
    aiAnalysis: "Multiple SERP features available for targeting.",
  }),
  compareCompetitorRanks: vi.fn().mockResolvedValue({
    domain: "test.com",
    competitors: ["competitor1.com", "competitor2.com"],
    keywords: [
      {
        keyword: "crypto wallet",
        yourPosition: 12,
        competitorPositions: { "competitor1.com": 5, "competitor2.com": 8 },
      },
    ],
    overallComparison: {
      avgYourPosition: 12,
      avgCompetitorPosition: 6.5,
      keywordsWinning: 0,
      keywordsLosing: 1,
    },
    aiAnalysis: "Competitors outrank you on most keywords. Focus on content quality.",
  }),
}));

// Mock the db module
vi.mock("./db", () => ({
  // Existing mocks
  createScan: vi.fn().mockResolvedValue({ id: 1 }),
  updateScan: vi.fn().mockResolvedValue(undefined),
  getScanById: vi.fn().mockResolvedValue({ id: 1, domain: "test.com", status: "completed" }),
  getUserScans: vi.fn().mockResolvedValue([]),
  getUserOrders: vi.fn().mockResolvedValue([]),
  createOrder: vi.fn().mockResolvedValue({ id: 1 }),
  updateOrder: vi.fn().mockResolvedValue(undefined),
  getUserWatchlist: vi.fn().mockResolvedValue([]),
  addWatchlistItem: vi.fn().mockResolvedValue({ id: 1 }),
  updateWatchlistItem: vi.fn().mockResolvedValue(undefined),
  deleteWatchlistItem: vi.fn().mockResolvedValue(undefined),
  getWatchlistAlerts: vi.fn().mockResolvedValue([]),
  getUserAutobidRules: vi.fn().mockResolvedValue([]),
  getAutobidRuleById: vi.fn().mockResolvedValue({ id: 1 }),
  createAutobidRule: vi.fn().mockResolvedValue({ id: 1 }),
  updateAutobidRule: vi.fn().mockResolvedValue(undefined),
  deleteAutobidRule: vi.fn().mockResolvedValue(undefined),
  getUserCampaigns: vi.fn().mockResolvedValue([]),
  getCampaignById: vi.fn().mockResolvedValue({ id: 1, domain: "test.com" }),
  createCampaign: vi.fn().mockResolvedValue({ id: 1 }),
  updateCampaign: vi.fn().mockResolvedValue(undefined),
  deleteCampaign: vi.fn().mockResolvedValue(undefined),
  addCampaignLog: vi.fn().mockResolvedValue(undefined),
  getCampaignLogs: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({ totalScans: 0 }),
  addChatMessage: vi.fn().mockResolvedValue(undefined),
  getUserChatHistory: vi.fn().mockResolvedValue([]),
  clearUserChat: vi.fn().mockResolvedValue(undefined),
  getUserPbnSites: vi.fn().mockResolvedValue([
    { id: 1, domain: "pbn-site1.com", da: 35, dr: 40, spamScore: 5, status: "active", niche: "crypto", wpUrl: "https://pbn-site1.com/wp-json" },
    { id: 2, domain: "pbn-site2.com", da: 28, dr: 32, spamScore: 8, status: "active", niche: "finance", wpUrl: "https://pbn-site2.com/wp-json" },
    { id: 3, domain: "pbn-site3.com", da: 42, dr: 45, spamScore: 3, status: "active", niche: "tech", wpUrl: "https://pbn-site3.com/wp-json" },
  ]),
  addPbnSite: vi.fn().mockResolvedValue({ id: 4 }),
  updatePbnSite: vi.fn().mockResolvedValue(undefined),
  deletePbnSite: vi.fn().mockResolvedValue(undefined),
  addPbnPost: vi.fn().mockResolvedValue({ id: 1 }),
  getSitePosts: vi.fn().mockResolvedValue([]),
  getLatestAlgoIntel: vi.fn().mockResolvedValue([]),
  addAlgoIntel: vi.fn().mockResolvedValue({ id: 1 }),
  createModuleExecution: vi.fn().mockResolvedValue({ id: 1 }),
  updateModuleExecution: vi.fn().mockResolvedValue(undefined),
  getUserModuleExecutions: vi.fn().mockResolvedValue([]),
  saveMarketplaceSearch: vi.fn().mockResolvedValue(undefined),
  addBidHistory: vi.fn().mockResolvedValue({ id: 1 }),
  getUserBidHistory: vi.fn().mockResolvedValue([]),
  updateBidHistory: vi.fn().mockResolvedValue(undefined),

  // SEO Automation mocks
  getUserSeoProjects: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, domain: "test.com", name: "test.com", niche: "crypto", strategy: "grey_hat", aggressiveness: 5, status: "active", currentDA: 35, currentDR: 40, currentSpamScore: 5, currentBacklinks: 1200, currentReferringDomains: 180, currentTrustFlow: 25, currentCitationFlow: 30, currentOrganicTraffic: 5000, currentOrganicKeywords: 350, aiHealthScore: 72, aiRiskLevel: "medium", aiLastAnalysis: "Test", totalBacklinksBuilt: 50, totalContentCreated: 10, overallTrend: "improving", daTrend: 2, backlinkTrend: 15, targetKeywords: ["crypto wallet", "bitcoin"], autoBacklink: true, autoContent: false, autoPbn: false },
  ]),
  getSeoProjectById: vi.fn().mockResolvedValue({
    id: 1, userId: 1, domain: "test.com", name: "test.com", niche: "crypto", strategy: "grey_hat", aggressiveness: 5, status: "active", currentDA: 35, currentDR: 40, currentSpamScore: 5, currentBacklinks: 1200, currentReferringDomains: 180, currentTrustFlow: 25, currentCitationFlow: 30, currentOrganicTraffic: 5000, currentOrganicKeywords: 350, aiHealthScore: 72, aiRiskLevel: "medium", aiLastAnalysis: "Test", totalBacklinksBuilt: 50, totalContentCreated: 10, overallTrend: "improving", targetKeywords: ["crypto wallet"], autoBacklink: true, autoContent: false, autoPbn: false, daTrend: 2, backlinkTrend: 15,
  }),
  createSeoProject: vi.fn().mockResolvedValue({ id: 2, domain: "newsite.com", status: "analyzing" }),
  updateSeoProject: vi.fn().mockResolvedValue(undefined),
  deleteSeoProject: vi.fn().mockResolvedValue(undefined),
  getProjectBacklinks: vi.fn().mockResolvedValue([
    { id: 1, projectId: 1, sourceDomain: "blog.example.com", sourceUrl: "https://blog.example.com/post", targetUrl: "https://test.com", anchorText: "crypto wallet", linkType: "dofollow", sourceType: "guest_post", sourceDA: 45, status: "active" },
  ]),
  getBacklinkStats: vi.fn().mockResolvedValue({ total: 50, active: 45, lost: 5, dofollow: 35, nofollow: 15, pbn: 10, avgDA: 30 }),
  addBacklink: vi.fn().mockResolvedValue({ id: 2 }),
  updateBacklink: vi.fn().mockResolvedValue(undefined),
  deleteBacklink: vi.fn().mockResolvedValue(undefined),
  getProjectRankings: vi.fn().mockResolvedValue([
    { id: 1, projectId: 1, keyword: "crypto wallet", position: 15, previousPosition: 22, positionChange: 7, searchVolume: 12000, keywordDifficulty: 45, cpc: "2.5", trend: "rising" },
    { id: 2, projectId: 1, keyword: "bitcoin exchange", position: 25, previousPosition: 30, positionChange: 5, searchVolume: 8000, keywordDifficulty: 55, cpc: "5.0", trend: "rising" },
  ]),
  getLatestRankings: vi.fn().mockResolvedValue([
    { keyword: "crypto wallet", position: 15, previousPosition: 22, searchVolume: 12000, keywordDifficulty: 45 },
    { keyword: "bitcoin exchange", position: 25, previousPosition: 30, searchVolume: 8000, keywordDifficulty: 55 },
  ]),
  getKeywordRankHistory: vi.fn().mockResolvedValue([
    { position: 22, checkedAt: new Date("2026-02-01") },
    { position: 15, checkedAt: new Date("2026-03-01") },
  ]),
  addRankEntry: vi.fn().mockResolvedValue({ id: 1 }),
  getProjectActions: vi.fn().mockResolvedValue([]),
  addSeoAction: vi.fn().mockResolvedValue({ id: 1 }),
  updateSeoAction: vi.fn().mockResolvedValue(undefined),
  getProjectSnapshots: vi.fn().mockResolvedValue([]),
  addSeoSnapshot: vi.fn().mockResolvedValue({ id: 1 }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ═══════════════════════════════════════════
// PBN Bridge Integration Tests
// ═══════════════════════════════════════════

describe("PBN Bridge — Anchor Plan", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("anchorPlan should generate anchor text distribution", async () => {
    const result = await caller.pbn.anchorPlan({ projectId: 1, linkCount: 10 });
    expect(result).toBeDefined();
    expect(result.anchors).toBeDefined();
    expect(Array.isArray(result.anchors)).toBe(true);
    expect(result.anchors.length).toBeGreaterThan(0);
    expect(result.aiReasoning).toBeTruthy();
  });

  it("anchorPlan should include multiple anchor types", async () => {
    const result = await caller.pbn.anchorPlan({ projectId: 1, linkCount: 10 });
    const types = result.anchors.map((a: any) => a.type);
    expect(types).toContain("exact_match");
    expect(types).toContain("branded");
  });

  it("anchorPlan should have percentages summing to ~100", async () => {
    const result = await caller.pbn.anchorPlan({ projectId: 1, linkCount: 10 });
    const totalPct = result.anchors.reduce((sum: number, a: any) => sum + a.percentage, 0);
    expect(totalPct).toBeGreaterThanOrEqual(95);
    expect(totalPct).toBeLessThanOrEqual(105);
  });
});

describe("PBN Bridge — Build Links", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("buildLinks should execute PBN campaign and return results", async () => {
    const result = await caller.pbn.buildLinks({ projectId: 1, linkCount: 5 });
    expect(result).toBeDefined();
    expect(result.totalPlanned).toBe(5);
    expect(result.totalBuilt).toBe(4);
    expect(result.totalFailed).toBe(1);
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.posts)).toBe(true);
    expect(result.posts.length).toBe(5);
    expect(result.aiSummary).toBeTruthy();
  });

  it("buildLinks should have correct post status breakdown", async () => {
    const result = await caller.pbn.buildLinks({ projectId: 1, linkCount: 5 });
    const published = result.posts.filter((p: any) => p.status === "published");
    const failed = result.posts.filter((p: any) => p.status === "failed");
    expect(published.length).toBe(4);
    expect(failed.length).toBe(1);
    expect(failed[0].error).toBeTruthy();
  });

  it("buildLinks should include site names and post titles", async () => {
    const result = await caller.pbn.buildLinks({ projectId: 1, linkCount: 5 });
    const publishedPost = result.posts.find((p: any) => p.status === "published");
    expect(publishedPost.siteName).toBeTruthy();
    expect(publishedPost.title).toBeTruthy();
    expect(publishedPost.backlinkId).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// SERP Tracker Integration Tests
// ═══════════════════════════════════════════

describe("SERP Tracker — Single Keyword Check", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("checkRank should return rank data for a keyword", async () => {
    const result = await caller.rankings.checkRank({
      projectId: 1,
      keyword: "crypto wallet",
      country: "US",
      device: "desktop",
    });
    expect(result).toBeDefined();
    expect(result.keyword).toBe("crypto wallet");
    expect(result.position).toBe(12);
    expect(result.previousPosition).toBe(18);
    expect(result.change).toBe(6);
    expect(result.url).toBeTruthy();
    expect(result.aiAnalysis).toBeTruthy();
  });

  it("checkRank should include SERP features", async () => {
    const result = await caller.rankings.checkRank({
      projectId: 1,
      keyword: "crypto wallet",
    });
    expect(result.serpFeatures).toBeDefined();
    expect(Array.isArray(result.serpFeatures)).toBe(true);
    expect(result.serpFeatures.length).toBeGreaterThan(0);
    expect(result.serpFeatures[0].type).toBeTruthy();
  });

  it("checkRank should include ranking factors", async () => {
    const result = await caller.rankings.checkRank({
      projectId: 1,
      keyword: "crypto wallet",
    });
    expect(result.rankingFactors).toBeDefined();
    expect(result.rankingFactors.contentRelevance).toBeGreaterThan(0);
    expect(result.rankingFactors.backlinkStrength).toBeGreaterThan(0);
  });

  it("checkRank should include opportunities", async () => {
    const result = await caller.rankings.checkRank({
      projectId: 1,
      keyword: "crypto wallet",
    });
    expect(result.opportunities).toBeDefined();
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(result.opportunities.length).toBeGreaterThan(0);
  });
});

describe("SERP Tracker — Bulk Rank Check", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("bulkCheck should return aggregated rank data", async () => {
    const result = await caller.rankings.bulkCheck({
      projectId: 1,
      country: "US",
      device: "desktop",
    });
    expect(result).toBeDefined();
    expect(result.totalKeywords).toBe(5);
    expect(result.rankedKeywords).toBe(4);
    expect(result.notRanked).toBe(1);
    expect(result.avgPosition).toBeGreaterThan(0);
    expect(result.aiSummary).toBeTruthy();
  });

  it("bulkCheck should include position distribution", async () => {
    const result = await caller.rankings.bulkCheck({ projectId: 1 });
    expect(result.top3).toBeDefined();
    expect(result.top10).toBeDefined();
    expect(result.top30).toBeDefined();
    expect(result.top100).toBeDefined();
  });

  it("bulkCheck should track improvements and declines", async () => {
    const result = await caller.rankings.bulkCheck({ projectId: 1 });
    expect(result.improved).toBeDefined();
    expect(result.declined).toBeDefined();
    expect(result.unchanged).toBeDefined();
    expect(result.improved + result.declined + result.unchanged).toBeLessThanOrEqual(result.totalKeywords);
  });

  it("bulkCheck should include individual keyword results", async () => {
    const result = await caller.rankings.bulkCheck({ projectId: 1 });
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].keyword).toBeTruthy();
    expect(result.results[0].position).toBeDefined();
  });
});

describe("SERP Tracker — SERP Features Analysis", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("serpFeatures should analyze SERP features for tracked keywords", async () => {
    const result = await caller.rankings.serpFeatures({ projectId: 1 });
    expect(result).toBeDefined();
    expect(result.keywords).toBeDefined();
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(result.opportunities).toBeDefined();
    expect(result.aiAnalysis).toBeTruthy();
  });

  it("serpFeatures should include feature details per keyword", async () => {
    const result = await caller.rankings.serpFeatures({ projectId: 1 });
    if (result.keywords.length > 0) {
      const kw = result.keywords[0];
      expect(kw.keyword).toBeTruthy();
      expect(kw.features).toBeDefined();
      expect(Array.isArray(kw.features)).toBe(true);
    }
  });
});

describe("SERP Tracker — Competitor Comparison", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("compareCompetitors should return competitor rank comparison", async () => {
    const result = await caller.rankings.compareCompetitors({
      projectId: 1,
      competitors: ["competitor1.com", "competitor2.com"],
    });
    expect(result).toBeDefined();
    expect(result.domain).toBe("test.com");
    expect(result.competitors).toContain("competitor1.com");
    expect(result.competitors).toContain("competitor2.com");
    expect(result.keywords).toBeDefined();
    expect(result.overallComparison).toBeDefined();
    expect(result.aiAnalysis).toBeTruthy();
  });

  it("compareCompetitors should include position data per keyword", async () => {
    const result = await caller.rankings.compareCompetitors({
      projectId: 1,
      competitors: ["competitor1.com"],
    });
    if (result.keywords.length > 0) {
      const kw = result.keywords[0];
      expect(kw.keyword).toBeTruthy();
      expect(kw.yourPosition).toBeDefined();
      expect(kw.competitorPositions).toBeDefined();
    }
  });

  it("compareCompetitors should include overall comparison stats", async () => {
    const result = await caller.rankings.compareCompetitors({
      projectId: 1,
      competitors: ["competitor1.com"],
    });
    expect(result.overallComparison.avgYourPosition).toBeGreaterThan(0);
    expect(result.overallComparison.avgCompetitorPosition).toBeGreaterThan(0);
    expect(result.overallComparison.keywordsWinning).toBeDefined();
    expect(result.overallComparison.keywordsLosing).toBeDefined();
  });
});
