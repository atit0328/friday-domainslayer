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
            currentState: {
              estimatedDA: 35,
              estimatedDR: 40,
              estimatedSpamScore: 5,
              estimatedBacklinks: 1200,
              estimatedReferringDomains: 180,
              estimatedTrustFlow: 25,
              estimatedCitationFlow: 30,
              estimatedOrganicTraffic: 5000,
              estimatedOrganicKeywords: 350,
              domainAge: "3 years",
              tld: "com",
              isIndexed: true,
            },
            contentAudit: {
              hasContent: true,
              contentQuality: "medium",
              estimatedPages: 50,
              topicRelevance: 7,
            },
            backlinkProfile: {
              quality: "mixed",
              dofollowRatio: 65,
              anchorTextDistribution: [
                { type: "branded", percentage: 40 },
                { type: "exact_match", percentage: 20 },
              ],
              riskFactors: ["Some low-quality links detected"],
            },
            competitorInsights: {
              nicheCompetition: "medium",
              topCompetitors: ["competitor1.com", "competitor2.com"],
              avgCompetitorDA: 45,
            },
            overallHealth: 72,
            riskLevel: "medium",
            aiSummary: "โดเมนมีสุขภาพ SEO ปานกลาง ต้องปรับปรุงเพิ่มเติม",
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
    currentState: {
      estimatedDA: 35,
      estimatedDR: 40,
      estimatedSpamScore: 5,
      estimatedBacklinks: 1200,
      estimatedReferringDomains: 180,
      estimatedTrustFlow: 25,
      estimatedCitationFlow: 30,
      estimatedOrganicTraffic: 5000,
      estimatedOrganicKeywords: 350,
    },
    overallHealth: 72,
    riskLevel: "medium",
    aiSummary: "โดเมนมีสุขภาพ SEO ปานกลาง ต้องปรับปรุงเพิ่มเติม",
    extractedKeywords: ["crypto wallet", "bitcoin exchange"],
  }),
  generateStrategy: vi.fn().mockResolvedValue({
    phases: [{ phase: 1, name: "Foundation", description: "Technical audit", priority: "critical", estimatedDuration: "2 weeks", actions: ["Fix crawl errors"] }],
    backlinkPlan: { tier1: [{ type: "Guest Post", count: 10, targetDA: 30 }], tier2: [{ type: "Web 2.0", count: 50 }], monthlyTarget: 60 },
    riskAssessment: { penaltyRisk: "low", detectionRisk: "medium", mitigationSteps: ["Diversify anchor text"] },
    aiRecommendation: "เน้นสร้าง content คุณภาพก่อน แล้วค่อยสร้าง links",
  }),
  researchKeywords: vi.fn().mockResolvedValue({
    primaryKeywords: [
      { keyword: "best crypto wallet", searchVolume: 12000, difficulty: 45, cpc: 2.5, intent: "informational" },
    ],
    longTailKeywords: [
      { keyword: "best crypto wallet for beginners 2026", searchVolume: 800, difficulty: 20, cpc: 1.5, intent: "informational" },
    ],
    aiInsights: "เน้น keyword ที่เป็น informational ก่อนเพื่อสร้าง authority",
  }),
  analyzeRankings: vi.fn().mockResolvedValue({
    overallTrend: "improving",
    aiSummary: "อันดับกำลังดีขึ้น",
    keywordAnalysis: [],
    nextActions: ["สร้าง content เพิ่ม"],
  }),
  analyzeBacklinks: vi.fn().mockResolvedValue({
    profileHealth: 75,
    aiSummary: "Backlink profile สุขภาพดี",
    recommendations: ["เพิ่ม edu/gov links"],
    riskFactors: [],
    distribution: { dofollow: 70, nofollow: 30 },
  }),
  generateSEOContent: vi.fn().mockResolvedValue({
    title: "Best Crypto Wallets in 2026",
    metaDescription: "Discover the best crypto wallets.",
    content: "# Best Crypto Wallets\n\nContent here...",
    wordCount: 1500,
    targetKeyword: "best crypto wallet",
    secondaryKeywords: ["crypto storage"],
  }),
  analyzeAlgorithm: vi.fn().mockResolvedValue({
    updateType: "minor_core",
    impactLevel: "minor",
    aiAnalysis: "การเปลี่ยนแปลง algorithm เล็กน้อย ไม่มีผลกระทบมาก",
    affectedAreas: ["content quality"],
    recommendations: ["ทำต่อตามแผนเดิม"],
  }),
}));

// Mock serp-tracker
vi.mock("./serp-tracker", () => ({
  checkKeywordRank: vi.fn().mockResolvedValue({
    keyword: "crypto wallet",
    position: 12,
    previousPosition: 18,
    change: 6,
    url: "https://test.com/page",
    title: "Test Page",
    snippet: "Discover...",
    serpFeatures: [],
    competitors: [],
    aiAnalysis: "Ranking improved.",
    rankingFactors: { contentRelevance: 7, backlinkStrength: 6, domainAuthority: 5, userExperience: 7, technicalSEO: 6 },
    opportunities: [],
    checkedAt: new Date().toISOString(),
    country: "US",
    device: "desktop",
  }),
  bulkRankCheck: vi.fn().mockResolvedValue({
    totalKeywords: 5, rankedKeywords: 4, notRanked: 1, avgPosition: 15.5,
    top3: 0, top10: 1, top30: 3, top100: 4, improved: 3, declined: 1, unchanged: 1,
    results: [{ keyword: "crypto wallet", position: 12, previousPosition: 18, change: 6 }],
    aiSummary: "Overall positive trend.",
    checkedAt: new Date().toISOString(),
  }),
  analyzeSERPFeatures: vi.fn().mockResolvedValue({
    keywords: [], opportunities: [], aiAnalysis: "Multiple SERP features available.",
  }),
  compareCompetitorRanks: vi.fn().mockResolvedValue({
    domain: "test.com",
    competitors: ["competitor1.com"],
    keywords: [],
    overallComparison: { avgYourPosition: 12, avgCompetitorPosition: 6.5, keywordsWinning: 0, keywordsLosing: 1 },
    aiAnalysis: "Competitors outrank you.",
  }),
}));

// Mock the db module
vi.mock("./db", () => ({
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
  getUserPbnSites: vi.fn().mockResolvedValue([]),
  addPbnSite: vi.fn().mockResolvedValue({ id: 1 }),
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
    {
      id: 1, userId: 1, domain: "test.com", name: "test.com", niche: "crypto",
      strategy: "grey_hat", aggressiveness: 5, status: "active",
      currentDA: 35, currentDR: 40, currentSpamScore: 5, currentBacklinks: 1200,
      currentReferringDomains: 180, currentTrustFlow: 25, currentCitationFlow: 30,
      currentOrganicTraffic: 5000, currentOrganicKeywords: 350,
      aiHealthScore: 72, aiRiskLevel: "medium",
      aiLastAnalysis: "โดเมนมีสุขภาพ SEO ปานกลาง",
      totalBacklinksBuilt: 50, totalContentCreated: 10, overallTrend: "improving",
      daTrend: 2, backlinkTrend: 15,
      targetKeywords: ["crypto wallet", "bitcoin"],
      autoBacklink: true, autoContent: false, autoPbn: false,
    },
  ]),
  getSeoProjectById: vi.fn().mockResolvedValue({
    id: 1, userId: 1, domain: "test.com", name: "test.com", niche: "crypto",
    strategy: "grey_hat", aggressiveness: 5, status: "active",
    currentDA: 35, currentDR: 40, currentSpamScore: 5, currentBacklinks: 1200,
    currentReferringDomains: 180, currentTrustFlow: 25, currentCitationFlow: 30,
    currentOrganicTraffic: 5000, currentOrganicKeywords: 350,
    aiHealthScore: 72, aiRiskLevel: "medium",
    aiLastAnalysis: "โดเมนมีสุขภาพ SEO ปานกลาง",
    totalBacklinksBuilt: 50, totalContentCreated: 10, overallTrend: "improving",
    targetKeywords: ["crypto wallet"],
    autoBacklink: true, autoContent: false, autoPbn: false,
    daTrend: 2, backlinkTrend: 15,
  }),
  createSeoProject: vi.fn().mockResolvedValue({ id: 2, domain: "newsite.com", status: "analyzing" }),
  updateSeoProject: vi.fn().mockResolvedValue(undefined),
  deleteSeoProject: vi.fn().mockResolvedValue(undefined),
  getProjectBacklinks: vi.fn().mockResolvedValue([
    {
      id: 1, projectId: 1, sourceDomain: "blog.example.com",
      sourceUrl: "https://blog.example.com/post", targetUrl: "https://test.com",
      anchorText: "crypto wallet", linkType: "dofollow", sourceType: "guest_post",
      sourceDA: 45, status: "active",
    },
  ]),
  getBacklinkStats: vi.fn().mockResolvedValue({
    total: 50, active: 45, lost: 5, dofollow: 35, nofollow: 15, pbn: 10, avgDA: 30,
  }),
  addBacklink: vi.fn().mockResolvedValue({ id: 2 }),
  updateBacklink: vi.fn().mockResolvedValue(undefined),
  deleteBacklink: vi.fn().mockResolvedValue(undefined),
  getProjectRankings: vi.fn().mockResolvedValue([
    {
      id: 1, projectId: 1, keyword: "crypto wallet", position: 15,
      previousPosition: 22, positionChange: 7, searchVolume: 12000,
      keywordDifficulty: 45, cpc: "2.5", trend: "rising",
    },
  ]),
  getLatestRankings: vi.fn().mockResolvedValue([
    { keyword: "crypto wallet", position: 15, previousPosition: 22, searchVolume: 12000, keywordDifficulty: 45 },
  ]),
  getKeywordRankHistory: vi.fn().mockResolvedValue([
    { position: 22, checkedAt: new Date("2026-02-01") },
    { position: 15, checkedAt: new Date("2026-03-01") },
  ]),
  addRankEntry: vi.fn().mockResolvedValue({ id: 1 }),
  getProjectActions: vi.fn().mockResolvedValue([
    {
      id: 1, projectId: 1, actionType: "analysis",
      title: "Auto-scan: วิเคราะห์โดเมน test.com",
      description: "AI วิเคราะห์โดเมนอัตโนมัติ",
      status: "completed",
      createdAt: new Date("2026-03-01T10:00:00Z"),
      executedAt: new Date("2026-03-01T10:00:00Z"),
      completedAt: new Date("2026-03-01T10:01:00Z"),
      result: { overallHealth: 72, riskLevel: "medium" },
      impact: "positive",
    },
    {
      id: 2, projectId: 1, actionType: "keyword_research",
      title: "Auto-scan: วิจัย Keywords สำหรับ test.com",
      description: "AI วิจัย keywords อัตโนมัติ",
      status: "completed",
      createdAt: new Date("2026-03-01T10:01:00Z"),
      executedAt: new Date("2026-03-01T10:01:00Z"),
      completedAt: new Date("2026-03-01T10:02:00Z"),
      result: { primaryKeywords: [{ keyword: "crypto wallet" }] },
      impact: "positive",
    },
    {
      id: 3, projectId: 1, actionType: "backlink_build",
      title: "สร้าง Backlink ผ่าน Guest Post",
      status: "completed",
      createdAt: new Date("2026-03-02T14:00:00Z"),
      executedAt: new Date("2026-03-02T14:00:00Z"),
      completedAt: new Date("2026-03-02T14:05:00Z"),
      result: { totalBuilt: 3 },
      impact: "positive",
    },
  ]),
  addSeoAction: vi.fn().mockResolvedValue({ id: 10 }),
  updateSeoAction: vi.fn().mockResolvedValue(undefined),
  getProjectSnapshots: vi.fn().mockResolvedValue([
    { id: 1, projectId: 1, da: 33, dr: 38, aiHealthScore: 68, createdAt: new Date("2026-02-01") },
    { id: 2, projectId: 1, da: 35, dr: 40, aiHealthScore: 72, createdAt: new Date("2026-03-01") },
  ]),
  addSeoSnapshot: vi.fn().mockResolvedValue({ id: 3 }),
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
// Auto-scan on Create Tests
// ═══════════════════════════════════════════

describe("Auto-scan on Project Create", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("create should return project immediately with analyzing status", async () => {
    const result = await caller.seoProjects.create({
      domain: "newsite.com",
      niche: "finance",
      strategy: "grey_hat",
      aggressiveness: 7,
      autoBacklink: true,
      autoContent: false,
      autoPbn: false,
    });
    expect(result).toBeDefined();
    expect(result.domain).toBe("newsite.com");
    expect(result.status).toBe("analyzing");
  });

  it("create should log the creation action", async () => {
    const db = await import("./db");
    await caller.seoProjects.create({
      domain: "newsite.com",
      strategy: "grey_hat",
    });
    // First call to addSeoAction is the creation log
    expect(db.addSeoAction).toHaveBeenCalled();
    const firstCall = (db.addSeoAction as any).mock.calls[0];
    expect(firstCall[1].actionType).toBe("analysis");
    expect(firstCall[1].title).toContain("สร้างโปรเจค");
    expect(firstCall[1].title).toContain("newsite.com");
  });

  it("auto-scan should trigger analyzeDomain in background", async () => {
    const seoEngine = await import("./seo-engine");
    await caller.seoProjects.create({
      domain: "newsite.com",
      strategy: "grey_hat",
    });
    // Wait for background tasks
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(seoEngine.analyzeDomain).toHaveBeenCalledWith("newsite.com", undefined);
  });

  it("auto-scan should trigger researchKeywords after analysis", async () => {
    const seoEngine = await import("./seo-engine");
    await caller.seoProjects.create({
      domain: "newsite.com",
      niche: "finance",
      strategy: "grey_hat",
    });
    // Wait for background tasks
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(seoEngine.researchKeywords).toHaveBeenCalled();
  });

  it("auto-scan should update project with analysis results", async () => {
    const db = await import("./db");
    await caller.seoProjects.create({
      domain: "newsite.com",
      strategy: "grey_hat",
    });
    // Wait for background tasks
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(db.updateSeoProject).toHaveBeenCalled();
    // Check that it updates with DA, health score, etc.
    const updateCalls = (db.updateSeoProject as any).mock.calls;
    const analysisUpdate = updateCalls.find((c: any) => c[1].currentDA !== undefined);
    expect(analysisUpdate).toBeDefined();
    expect(analysisUpdate[1].currentDA).toBe(35);
    expect(analysisUpdate[1].aiHealthScore).toBe(72);
    expect(analysisUpdate[1].status).toBe("active");
  });
});

// ═══════════════════════════════════════════
// Thai AI Analysis Tests
// ═══════════════════════════════════════════

describe("Thai AI Analysis Output", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("analyze should return Thai aiSummary", async () => {
    const result = await caller.seoProjects.analyze({ id: 1 });
    expect(result).toBeDefined();
    expect(result.aiSummary).toBeTruthy();
    // The mock returns Thai text
    expect(result.aiSummary).toContain("โดเมน");
  });

  it("researchKeywords should return Thai aiInsights", async () => {
    const result = await caller.seoProjects.researchKeywords({ id: 1 });
    expect(result).toBeDefined();
    expect(result.aiInsights).toBeTruthy();
    expect(result.aiInsights).toContain("keyword");
  });

  it("analyzeRankings should return Thai summary", async () => {
    const result = await caller.seoProjects.analyzeRankings({ id: 1 });
    expect(result).toBeDefined();
    expect(result.aiSummary).toBeTruthy();
    expect(result.aiSummary).toContain("อันดับ");
  });

  it("algorithmCheck should return Thai analysis", async () => {
    const result = await caller.seoProjects.algorithmCheck();
    expect(result).toBeDefined();
    expect(result.aiAnalysis).toBeTruthy();
    expect(result.aiAnalysis).toContain("algorithm");
  });
});

// ═══════════════════════════════════════════
// Dashboard Data Tests
// ═══════════════════════════════════════════

describe("SEO Dashboard Data", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("get should return project with all dashboard data", async () => {
    const result = await caller.seoProjects.get({ id: 1 });
    expect(result).toBeDefined();
    expect(result.project).toBeDefined();
    expect(result.blStats).toBeDefined();
    expect(result.snapshots).toBeDefined();
    expect(result.recentActions).toBeDefined();
    expect(result.rankings).toBeDefined();
  });

  it("project should have health score and risk level", async () => {
    const result = await caller.seoProjects.get({ id: 1 });
    expect(result.project.aiHealthScore).toBe(72);
    expect(result.project.aiRiskLevel).toBe("medium");
    expect(result.project.overallTrend).toBe("improving");
  });

  it("backlink stats should have complete breakdown", async () => {
    const result = await caller.seoProjects.get({ id: 1 });
    expect(result.blStats.total).toBe(50);
    expect(result.blStats.active).toBe(45);
    expect(result.blStats.lost).toBe(5);
    expect(result.blStats.dofollow).toBe(35);
    expect(result.blStats.nofollow).toBe(15);
    expect(result.blStats.pbn).toBe(10);
    expect(result.blStats.avgDA).toBe(30);
  });

  it("snapshots should show historical data for trend tracking", async () => {
    const result = await caller.seoProjects.get({ id: 1 });
    expect(result.snapshots.length).toBe(2);
    expect(result.snapshots[0].da).toBe(33);
    expect(result.snapshots[1].da).toBe(35);
  });

  it("recentActions should show automation activity log", async () => {
    const result = await caller.seoProjects.get({ id: 1 });
    expect(result.recentActions.length).toBe(3);
    // Check action types are present
    const types = result.recentActions.map((a: any) => a.actionType);
    expect(types).toContain("analysis");
    expect(types).toContain("keyword_research");
    expect(types).toContain("backlink_build");
  });

  it("actions should have Thai titles from auto-scan", async () => {
    const result = await caller.seoProjects.get({ id: 1 });
    const analysisAction = result.recentActions.find((a: any) => a.actionType === "analysis");
    expect(analysisAction).toBeDefined();
    expect(analysisAction.title).toContain("Auto-scan");
    expect(analysisAction.title).toContain("วิเคราะห์");
  });

  it("rankings should have keyword position data", async () => {
    const result = await caller.seoProjects.get({ id: 1 });
    expect(result.rankings.length).toBeGreaterThan(0);
    expect(result.rankings[0].keyword).toBe("crypto wallet");
    expect(result.rankings[0].position).toBe(15);
  });
});

// ═══════════════════════════════════════════
// Actions & Report Tests
// ═══════════════════════════════════════════

describe("SEO Actions (Activity Log / Report)", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("list should return all project actions for audit trail", async () => {
    const result = await caller.seoActions.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);
  });

  it("actions should have status and timestamps for verification", async () => {
    const result = await caller.seoActions.list({ projectId: 1 });
    const action = result[0];
    expect(action.status).toBe("completed");
    expect(action.createdAt).toBeDefined();
    expect(action.executedAt).toBeDefined();
    expect(action.completedAt).toBeDefined();
  });

  it("actions should have result data for report generation", async () => {
    const result = await caller.seoActions.list({ projectId: 1 });
    const analysisAction = result.find((a: any) => a.actionType === "analysis");
    expect(analysisAction.result).toBeDefined();
    expect(analysisAction.result.overallHealth).toBe(72);
  });

  it("actions should have impact assessment", async () => {
    const result = await caller.seoActions.list({ projectId: 1 });
    const actions = result.filter((a: any) => a.impact);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].impact).toBe("positive");
  });
});

// ═══════════════════════════════════════════
// Clean Domain Row Tests (no long AI summary in list)
// ═══════════════════════════════════════════

describe("Clean Domain Row in Project List", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("list should return projects with metrics but aiLastAnalysis is short/Thai", async () => {
    const result = await caller.seoProjects.list();
    expect(result.length).toBeGreaterThan(0);
    const project = result[0];
    // Verify key metrics exist for the domain row
    expect(project.currentDA).toBeDefined();
    expect(project.currentDR).toBeDefined();
    expect(project.currentSpamScore).toBeDefined();
    expect(project.aiHealthScore).toBeDefined();
    expect(project.aiRiskLevel).toBeDefined();
    // The aiLastAnalysis should be in Thai
    expect(project.aiLastAnalysis).toContain("โดเมน");
  });
});
