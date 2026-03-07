import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module to avoid real API calls
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            trust_score: 75,
            grade: "B",
            verdict: "CONDITIONAL_BUY",
            risk_level: "LOW",
            estimated_value_usd: 5000,
            explanations: {
              reasons: ["Good TLD", "Short name"],
              red_flags: ["No history"],
              recommendations: ["Register quickly"],
            },
            metrics: {
              domain_age_estimate: "New",
              tld_quality: "HIGH",
              brandability: 7,
              seo_potential: 6,
              spam_risk: "LOW",
              keyword_relevance: "Good",
            },
          }),
        },
      },
    ],
  }),
}));

// Mock the db module
vi.mock("./db", () => ({
  createScan: vi.fn().mockResolvedValue({ id: 1, domain: "test.com", useCase: "hold_flip", status: "pending" }),
  updateScan: vi.fn().mockResolvedValue(undefined),
  getScanById: vi.fn().mockResolvedValue({
    id: 1,
    domain: "test.com",
    useCase: "hold_flip",
    status: "completed",
    trustScore: 75,
    grade: "B",
    verdict: "CONDITIONAL_BUY",
    riskLevel: "LOW",
  }),
  getUserScans: vi.fn().mockResolvedValue([
    { id: 1, domain: "test.com", status: "completed", trustScore: 75, grade: "B" },
  ]),
  getUserOrders: vi.fn().mockResolvedValue([
    { id: 1, domain: "test.com", provider: "godaddy", action: "buy_now", amount: "100", status: "pending" },
  ]),
  createOrder: vi.fn().mockResolvedValue({ id: 2, domain: "new.com", provider: "sedo", action: "buy_now", amount: "200", status: "pending" }),
  updateOrder: vi.fn().mockResolvedValue(undefined),
  getUserWatchlist: vi.fn().mockResolvedValue([
    { id: 1, domain: "watch.com", targetPrice: "500", status: "active" },
  ]),
  addWatchlistItem: vi.fn().mockResolvedValue({ id: 2, domain: "new-watch.com" }),
  updateWatchlistItem: vi.fn().mockResolvedValue(undefined),
  deleteWatchlistItem: vi.fn().mockResolvedValue(undefined),
  getWatchlistAlerts: vi.fn().mockResolvedValue([]),
  getUserAutobidRules: vi.fn().mockResolvedValue([]),
  getAutobidRuleById: vi.fn().mockResolvedValue({ id: 1, name: "Test Rule", domainsScanned: 0 }),
  createAutobidRule: vi.fn().mockResolvedValue({ id: 1 }),
  updateAutobidRule: vi.fn().mockResolvedValue(undefined),
  deleteAutobidRule: vi.fn().mockResolvedValue(undefined),
  getUserCampaigns: vi.fn().mockResolvedValue([]),
  getCampaignById: vi.fn().mockResolvedValue({
    id: 1, domain: "test.com", niche: "tech", currentPhase: 0, totalPhases: 16, status: "PENDING",
    keywords: "seo", targetPosition: 1, targetGeo: "global",
  }),
  createCampaign: vi.fn().mockResolvedValue({ id: 1 }),
  updateCampaign: vi.fn().mockResolvedValue(undefined),
  deleteCampaign: vi.fn().mockResolvedValue(undefined),
  addCampaignLog: vi.fn().mockResolvedValue(undefined),
  getCampaignLogs: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({
    totalScans: 10,
    totalOrders: 5,
    watchlistCount: 3,
    campaignCount: 2,
  }),
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

describe("scanner router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("scan should return a completed scan result", async () => {
    const result = await caller.scanner.scan({ domain: "test.com", useCase: "hold_flip" });
    expect(result).toBeDefined();
    expect(result?.domain).toBe("test.com");
    expect(result?.status).toBe("completed");
  }, 30000);

  it("list should return user scans", async () => {
    const result = await caller.scanner.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.domain).toBe("test.com");
  });
});

describe("orders router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("list should return user orders", async () => {
    const result = await caller.orders.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]?.domain).toBe("test.com");
  });

  it("create should create a new order", async () => {
    const result = await caller.orders.create({
      domain: "new.com",
      provider: "sedo",
      action: "buy_now",
      amount: "200",
    });
    expect(result).toBeDefined();
    expect(result?.domain).toBe("new.com");
  });

  it("cancel should cancel an order", async () => {
    const result = await caller.orders.cancel({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("watchlist router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("list should return watchlist items", async () => {
    const result = await caller.watchlist.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("add should add a watchlist item", async () => {
    const result = await caller.watchlist.add({ domain: "new-watch.com" });
    expect(result).toBeDefined();
  });

  it("remove should remove a watchlist item", async () => {
    const result = await caller.watchlist.remove({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("dashboard router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("stats should return dashboard statistics", async () => {
    const result = await caller.dashboard.stats();
    expect(result).toBeDefined();
    expect(result?.totalScans).toBe(10);
    expect(result?.totalOrders).toBe(5);
  });
});

describe("chat router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("send should return an AI response", async () => {
    const result = await caller.chat.send({ message: "Hello" });
    expect(result).toBeDefined();
    expect(result.provider).toBe("friday-ai");
    expect(typeof result.response).toBe("string");
  });

  it("history should return chat history", async () => {
    const result = await caller.chat.history({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("clear should clear chat history", async () => {
    const result = await caller.chat.clear();
    expect(result).toEqual({ success: true });
  });
});

describe("campaigns router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("list should return campaigns", async () => {
    const result = await caller.campaigns.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("delete should delete a campaign", async () => {
    const result = await caller.campaigns.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("modules router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("listModules should return available modules", async () => {
    const result = await caller.modules.listModules();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("description");
  });
});
