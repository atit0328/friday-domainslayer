import { describe, expect, it, vi, beforeEach } from "vitest";
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
            aiSummary: "Domain shows moderate SEO health with room for improvement.",
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
      anchorTextDistribution: [],
      riskFactors: [],
    },
    competitorInsights: {
      nicheCompetition: "medium",
      topCompetitors: [],
      avgCompetitorDA: 45,
    },
    overallHealth: 72,
    riskLevel: "medium",
    aiSummary: "Domain shows moderate SEO health.",
  }),
  generateStrategy: vi.fn().mockResolvedValue({
    phases: [
      {
        phase: 1,
        name: "Foundation",
        description: "Build technical SEO foundation",
        priority: "critical",
        estimatedDuration: "2 weeks",
        actions: ["Technical audit", "Fix crawl errors"],
      },
      {
        phase: 2,
        name: "Content",
        description: "Create quality content",
        priority: "high",
        estimatedDuration: "4 weeks",
        actions: ["Keyword research", "Content creation"],
      },
    ],
    backlinkPlan: {
      tier1: [{ type: "Guest Post", count: 10, targetDA: 30 }],
      tier2: [{ type: "Web 2.0", count: 50 }],
      monthlyTarget: 60,
    },
    riskAssessment: {
      penaltyRisk: "low",
      detectionRisk: "medium",
      mitigationSteps: ["Diversify anchor text", "Natural link velocity"],
    },
    aiRecommendation: "Focus on quality content first, then build links gradually.",
  }),
  researchKeywords: vi.fn().mockResolvedValue({
    primaryKeywords: [
      { keyword: "best crypto wallet", searchVolume: 12000, difficulty: 45, cpc: 2.5, intent: "informational" },
      { keyword: "crypto exchange", searchVolume: 8000, difficulty: 60, cpc: 5.0, intent: "transactional" },
    ],
    longTailKeywords: [
      { keyword: "best crypto wallet for beginners 2026", searchVolume: 800, difficulty: 20, cpc: 1.5, intent: "informational" },
    ],
    aiInsights: "Focus on informational keywords first to build authority.",
  }),
  analyzeRankings: vi.fn().mockResolvedValue({
    overallTrend: "improving",
    aiSummary: "Rankings are showing positive momentum.",
    keywordAnalysis: [],
    nextActions: ["Continue content creation", "Build more tier 1 links"],
  }),
  analyzeBacklinks: vi.fn().mockResolvedValue({
    profileHealth: 75,
    aiSummary: "Backlink profile is healthy with good diversity.",
    recommendations: ["Add more edu/gov links", "Diversify anchor text"],
    riskFactors: [],
    distribution: { dofollow: 70, nofollow: 30 },
  }),
  generateSEOContent: vi.fn().mockResolvedValue({
    title: "Best Crypto Wallets in 2026",
    metaDescription: "Discover the best crypto wallets for secure storage.",
    content: "# Best Crypto Wallets\n\nContent here...",
    wordCount: 1500,
    targetKeyword: "best crypto wallet",
    secondaryKeywords: ["crypto storage", "digital wallet"],
  }),
  analyzeAlgorithm: vi.fn().mockResolvedValue({
    updateType: "minor_core",
    impactLevel: "minor",
    aiAnalysis: "Minor algorithm fluctuation detected. No major impact expected.",
    affectedAreas: ["content quality"],
    recommendations: ["Continue current strategy"],
  }),
}));

// Mock the db module — add SEO-specific mocks
vi.mock("./db", () => ({
  // Existing mocks
  createScan: vi.fn().mockResolvedValue({ id: 1, domain: "test.com" }),
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
      id: 1,
      userId: 1,
      domain: "test.com",
      name: "test.com",
      niche: "crypto",
      strategy: "grey_hat",
      aggressiveness: 5,
      status: "active",
      currentDA: 35,
      currentDR: 40,
      currentSpamScore: 5,
      currentBacklinks: 1200,
      currentReferringDomains: 180,
      currentTrustFlow: 25,
      currentCitationFlow: 30,
      currentOrganicTraffic: 5000,
      currentOrganicKeywords: 350,
      aiHealthScore: 72,
      aiRiskLevel: "medium",
      aiLastAnalysis: "Domain shows moderate SEO health.",
      totalBacklinksBuilt: 50,
      totalContentCreated: 10,
      overallTrend: "improving",
      daTrend: 2,
      backlinkTrend: 15,
      targetKeywords: ["crypto wallet", "bitcoin"],
      autoBacklink: true,
      autoContent: false,
      autoPbn: false,
    },
  ]),
  getSeoProjectById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    domain: "test.com",
    name: "test.com",
    niche: "crypto",
    strategy: "grey_hat",
    aggressiveness: 5,
    status: "active",
    currentDA: 35,
    currentDR: 40,
    currentSpamScore: 5,
    currentBacklinks: 1200,
    currentReferringDomains: 180,
    currentTrustFlow: 25,
    currentCitationFlow: 30,
    currentOrganicTraffic: 5000,
    currentOrganicKeywords: 350,
    aiHealthScore: 72,
    aiRiskLevel: "medium",
    aiLastAnalysis: "Domain shows moderate SEO health.",
    totalBacklinksBuilt: 50,
    totalContentCreated: 10,
    overallTrend: "improving",
    targetKeywords: ["crypto wallet"],
    autoBacklink: true,
    autoContent: false,
    autoPbn: false,
    daTrend: 2,
    backlinkTrend: 15,
  }),
  createSeoProject: vi.fn().mockResolvedValue({
    id: 2,
    domain: "newsite.com",
    status: "analyzing",
  }),
  updateSeoProject: vi.fn().mockResolvedValue(undefined),
  deleteSeoProject: vi.fn().mockResolvedValue(undefined),
  getProjectBacklinks: vi.fn().mockResolvedValue([
    {
      id: 1,
      projectId: 1,
      sourceDomain: "blog.example.com",
      sourceUrl: "https://blog.example.com/post",
      targetUrl: "https://test.com",
      anchorText: "crypto wallet",
      linkType: "dofollow",
      sourceType: "guest_post",
      sourceDA: 45,
      status: "active",
    },
  ]),
  getBacklinkStats: vi.fn().mockResolvedValue({
    total: 50,
    active: 45,
    lost: 5,
    dofollow: 35,
    nofollow: 15,
    pbn: 10,
    avgDA: 30,
  }),
  addBacklink: vi.fn().mockResolvedValue({ id: 2 }),
  updateBacklink: vi.fn().mockResolvedValue(undefined),
  deleteBacklink: vi.fn().mockResolvedValue(undefined),
  getProjectRankings: vi.fn().mockResolvedValue([
    {
      id: 1,
      projectId: 1,
      keyword: "crypto wallet",
      position: 15,
      previousPosition: 22,
      positionChange: 7,
      searchVolume: 12000,
      keywordDifficulty: 45,
      cpc: "2.5",
      trend: "rising",
    },
  ]),
  getLatestRankings: vi.fn().mockResolvedValue([
    {
      keyword: "crypto wallet",
      position: 15,
      previousPosition: 22,
      searchVolume: 12000,
      keywordDifficulty: 45,
    },
  ]),
  getKeywordRankHistory: vi.fn().mockResolvedValue([
    { position: 22, checkedAt: new Date("2026-02-01") },
    { position: 15, checkedAt: new Date("2026-03-01") },
  ]),
  addRankEntry: vi.fn().mockResolvedValue({ id: 1 }),
  getProjectActions: vi.fn().mockResolvedValue([
    {
      id: 1,
      projectId: 1,
      actionType: "analysis",
      title: "Full domain analysis: test.com",
      status: "completed",
      createdAt: new Date(),
    },
  ]),
  addSeoAction: vi.fn().mockResolvedValue({ id: 1 }),
  updateSeoAction: vi.fn().mockResolvedValue(undefined),
  getProjectSnapshots: vi.fn().mockResolvedValue([
    {
      id: 1,
      projectId: 1,
      da: 35,
      dr: 40,
      aiHealthScore: 72,
      createdAt: new Date(),
    },
  ]),
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
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("SEO Projects Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("list should return user SEO projects", async () => {
    const result = await caller.seoProjects.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].domain).toBe("test.com");
    expect(result[0].currentDA).toBe(35);
    expect(result[0].aiHealthScore).toBe(72);
  });

  it("get should return project with full details", async () => {
    const result = await caller.seoProjects.get({ id: 1 });
    expect(result).toBeDefined();
    expect(result.project.domain).toBe("test.com");
    expect(result.blStats).toBeDefined();
    expect(result.blStats.total).toBe(50);
    expect(result.blStats.active).toBe(45);
    expect(result.snapshots).toBeDefined();
    expect(result.recentActions).toBeDefined();
    expect(result.rankings).toBeDefined();
  });

  it("create should create a new SEO project", async () => {
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

  it("update should update project settings", async () => {
    const result = await caller.seoProjects.update({
      id: 1,
      strategy: "black_hat",
      aggressiveness: 9,
    });
    expect(result).toEqual({ success: true });
  });

  it("delete should delete a project", async () => {
    const result = await caller.seoProjects.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("analyze should run AI domain analysis and return results", async () => {
    const result = await caller.seoProjects.analyze({ id: 1 });
    expect(result).toBeDefined();
    expect(result.domain).toBe("test.com");
    expect(result.currentState.estimatedDA).toBe(35);
    expect(result.overallHealth).toBe(72);
    expect(result.riskLevel).toBe("medium");
    expect(result.aiSummary).toBeTruthy();
  });

  it("generateStrategy should return a full SEO strategy", async () => {
    const result = await caller.seoProjects.generateStrategy({ id: 1 });
    expect(result).toBeDefined();
    expect(result.phases).toBeDefined();
    expect(result.phases.length).toBeGreaterThan(0);
    expect(result.phases[0].name).toBe("Foundation");
    expect(result.backlinkPlan).toBeDefined();
    expect(result.backlinkPlan.monthlyTarget).toBe(60);
    expect(result.riskAssessment).toBeDefined();
    expect(result.aiRecommendation).toBeTruthy();
  });

  it("researchKeywords should return keyword data", async () => {
    const result = await caller.seoProjects.researchKeywords({ id: 1 });
    expect(result).toBeDefined();
    expect(result.primaryKeywords.length).toBeGreaterThan(0);
    expect(result.primaryKeywords[0].keyword).toBe("best crypto wallet");
    expect(result.primaryKeywords[0].searchVolume).toBe(12000);
    expect(result.longTailKeywords.length).toBeGreaterThan(0);
    expect(result.aiInsights).toBeTruthy();
  });

  it("analyzeRankings should return rank analysis", async () => {
    const result = await caller.seoProjects.analyzeRankings({ id: 1 });
    expect(result).toBeDefined();
    expect(result.overallTrend).toBe("improving");
    expect(result.aiSummary).toBeTruthy();
    expect(result.nextActions.length).toBeGreaterThan(0);
  });

  it("analyzeBacklinks should return backlink analysis", async () => {
    const result = await caller.seoProjects.analyzeBacklinks({ id: 1 });
    expect(result).toBeDefined();
    expect(result.profileHealth).toBe(75);
    expect(result.aiSummary).toBeTruthy();
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("generateContent should return SEO content", async () => {
    const result = await caller.seoProjects.generateContent({
      id: 1,
      keyword: "best crypto wallet",
    });
    expect(result).toBeDefined();
    expect(result.title).toBeTruthy();
    expect(result.metaDescription).toBeTruthy();
    expect(result.content).toBeTruthy();
    expect(result.targetKeyword).toBe("best crypto wallet");
  });

  it("algorithmCheck should return algorithm analysis", async () => {
    const result = await caller.seoProjects.algorithmCheck();
    expect(result).toBeDefined();
    expect(result.updateType).toBe("minor_core");
    expect(result.impactLevel).toBe("minor");
    expect(result.aiAnalysis).toBeTruthy();
  });
});

describe("Backlinks Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("list should return project backlinks", async () => {
    const result = await caller.backlinks.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].sourceDomain).toBe("blog.example.com");
    expect(result[0].linkType).toBe("dofollow");
  });

  it("stats should return backlink statistics", async () => {
    const result = await caller.backlinks.stats({ projectId: 1 });
    expect(result).toBeDefined();
    expect(result.total).toBe(50);
    expect(result.active).toBe(45);
    expect(result.lost).toBe(5);
    expect(result.dofollow).toBe(35);
    expect(result.avgDA).toBe(30);
  });

  it("add should add a new backlink", async () => {
    const result = await caller.backlinks.add({
      projectId: 1,
      sourceUrl: "https://blog.example.com/new-post",
      sourceDomain: "blog.example.com",
      targetUrl: "https://test.com/page",
      anchorText: "crypto guide",
      linkType: "dofollow",
      sourceType: "guest_post",
      sourceDA: 40,
    });
    expect(result).toBeDefined();
  });

  it("update should update backlink status", async () => {
    const result = await caller.backlinks.update({
      id: 1,
      status: "lost",
    });
    expect(result).toEqual({ success: true });
  });

  it("delete should delete a backlink", async () => {
    const result = await caller.backlinks.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("Rankings Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    vi.clearAllMocks();
  });

  it("list should return project rankings", async () => {
    const result = await caller.rankings.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].keyword).toBe("crypto wallet");
    expect(result[0].position).toBe(15);
    expect(result[0].positionChange).toBe(7);
  });

  it("history should return keyword rank history", async () => {
    const result = await caller.rankings.history({ projectId: 1, keyword: "crypto wallet" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it("add should add a new rank entry", async () => {
    const result = await caller.rankings.add({
      projectId: 1,
      keyword: "bitcoin exchange",
      position: 25,
      searchVolume: 8000,
      keywordDifficulty: 55,
    });
    expect(result).toBeDefined();
  });
});

describe("Actions Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("list should return project actions", async () => {
    const result = await caller.seoActions.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].actionType).toBe("analysis");
    expect(result[0].status).toBe("completed");
  });
});

describe("Snapshots Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("list should return project snapshots", async () => {
    const result = await caller.snapshots.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].da).toBe(35);
    expect(result[0].aiHealthScore).toBe(72);
  });
});
