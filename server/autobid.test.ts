import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { quickPreFilter, type SEOCriteria } from "./seo-analyzer";

// ═══ Mock LLM ═══
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            seoScore: 78,
            aiVerdict: "BUY",
            aiConfidence: 82,
            aiReasoning: "Strong keyword relevance with good brandability",
            estimatedDA: 25,
            estimatedDR: 30,
            estimatedSpamScore: 5,
            estimatedBacklinks: 150,
            estimatedReferringDomains: 40,
            estimatedTrustFlow: 35,
            estimatedCitationFlow: 28,
            estimatedAge: "New registration",
            brandability: 75,
            keywordRelevance: 85,
            tldValue: 90,
            marketValue: 200,
            riskFactors: ["New domain"],
            strengths: ["Strong keyword", "Premium TLD"],
            seoOpportunities: ["Build authority site"],
            priceVsValue: "undervalued",
            recommendedMaxBid: 150,
          }),
        },
      },
    ],
  }),
}));

// ═══ Mock GoDaddy ═══
vi.mock("./godaddy", () => ({
  isGoDaddyConfigured: vi.fn().mockReturnValue(true),
  searchMarketplace: vi.fn().mockResolvedValue([
    { domain: "cryptoworld.com", price: 12.99, available: true, source: "godaddy" },
    { domain: "cryptomarket.net", price: 9.99, available: true, source: "godaddy" },
    { domain: "cryptohub.io", price: 45.00, available: true, source: "godaddy" },
    { domain: "superlongdomainnamethatisbadforseocrypto.com", price: 5.99, available: true, source: "godaddy" },
  ]),
  checkAvailability: vi.fn().mockResolvedValue({ available: true, price: 12.99 }),
  validateCredentials: vi.fn().mockResolvedValue(true),
  purchaseDomain: vi.fn().mockResolvedValue({ orderId: 12345, total: 12990000, currency: "USD" }),
  getAgreements: vi.fn().mockResolvedValue([{ agreementKey: "DNRA", title: "Domain Registration Agreement" }]),
  validatePurchase: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
}));

// ═══ Mock DB ═══
const mockBidHistoryEntries: any[] = [];
let bidHistoryIdCounter = 1;

vi.mock("./db", () => ({
  // User helpers
  upsertUser: vi.fn(),
  // Autobid rules
  getUserAutobidRules: vi.fn().mockResolvedValue([
    {
      id: 1, name: "Crypto Domains", keyword: "crypto", tld: ".com",
      maxBidPerDomain: "50", totalBudget: "500", spent: "0",
      minDA: 10, minDR: 10, maxSpamScore: 20, minBacklinks: 0,
      minReferringDomains: 0, minTrustFlow: 0, minCitationFlow: 0,
      minDomainAge: null, maxDomainAge: null,
      useCase: "seo_build", bidStrategy: "moderate",
      autoPurchase: false, requireApproval: true,
      status: "active", domainsScanned: 0, domainsBid: 0, domainsWon: 0,
      lastRunAt: null,
    },
  ]),
  getAutobidRuleById: vi.fn().mockImplementation((id: number) => {
    if (id === 1) return Promise.resolve({
      id: 1, name: "Crypto Domains", keyword: "crypto", tld: ".com",
      maxBidPerDomain: "50", totalBudget: "500", spent: "0",
      minDA: 10, minDR: 10, maxSpamScore: 20, minBacklinks: 0,
      minReferringDomains: 0, minTrustFlow: 0, minCitationFlow: 0,
      minDomainAge: null, maxDomainAge: null,
      useCase: "seo_build", bidStrategy: "moderate",
      autoPurchase: false, requireApproval: true,
      status: "active", domainsScanned: 0, domainsBid: 0, domainsWon: 0,
    });
    if (id === 2) return Promise.resolve({
      id: 2, name: "Auto-Buy Rule", keyword: "tech", tld: "",
      maxBidPerDomain: "100", totalBudget: "1000", spent: "0",
      minDA: 0, minDR: 0, maxSpamScore: 30, minBacklinks: 0,
      minReferringDomains: 0, minTrustFlow: 0, minCitationFlow: 0,
      minDomainAge: null, maxDomainAge: null,
      useCase: "hold_flip", bidStrategy: "aggressive",
      autoPurchase: true, requireApproval: false,
      status: "active", domainsScanned: 0, domainsBid: 0, domainsWon: 0,
    });
    return Promise.resolve(null);
  }),
  createAutobidRule: vi.fn().mockResolvedValue({ id: 3 }),
  updateAutobidRule: vi.fn().mockResolvedValue(undefined),
  deleteAutobidRule: vi.fn().mockResolvedValue(undefined),
  // Bid history
  createBidHistoryEntry: vi.fn().mockImplementation((_userId: number, data: any) => {
    const entry = { id: bidHistoryIdCounter++, ...data, createdAt: new Date() };
    mockBidHistoryEntries.push(entry);
    return Promise.resolve(entry);
  }),
  getBidHistoryForRule: vi.fn().mockImplementation((ruleId: number) => {
    return Promise.resolve(mockBidHistoryEntries.filter(e => e.ruleId === ruleId));
  }),
  getUserBidHistory: vi.fn().mockImplementation(() => {
    return Promise.resolve(mockBidHistoryEntries);
  }),
  updateBidHistory: vi.fn().mockImplementation((id: number, data: any) => {
    const entry = mockBidHistoryEntries.find(e => e.id === id);
    if (entry) Object.assign(entry, data);
    return Promise.resolve(undefined);
  }),
  getActiveAutobidRules: vi.fn().mockResolvedValue([]),
  // Other required mocks
  createScan: vi.fn().mockResolvedValue({ id: 1, domain: "test.com" }),
  updateScan: vi.fn(),
  getScanById: vi.fn().mockResolvedValue({ id: 1, domain: "test.com", status: "completed" }),
  getUserScans: vi.fn().mockResolvedValue([]),
  getUserOrders: vi.fn().mockResolvedValue([]),
  createOrder: vi.fn().mockResolvedValue({ id: 1 }),
  updateOrder: vi.fn(),
  getUserWatchlist: vi.fn().mockResolvedValue([]),
  addWatchlistItem: vi.fn().mockResolvedValue({ id: 1 }),
  updateWatchlistItem: vi.fn(),
  deleteWatchlistItem: vi.fn(),
  getWatchlistAlerts: vi.fn().mockResolvedValue([]),
  getUserCampaigns: vi.fn().mockResolvedValue([]),
  getCampaignById: vi.fn().mockResolvedValue(null),
  createCampaign: vi.fn().mockResolvedValue({ id: 1 }),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  addCampaignLog: vi.fn(),
  getCampaignLogs: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({ totalScans: 0, totalOrders: 0, watchlistCount: 0, campaignCount: 0 }),
  addChatMessage: vi.fn(),
  getUserChatHistory: vi.fn().mockResolvedValue([]),
  clearUserChat: vi.fn(),
  getUserPbnSites: vi.fn().mockResolvedValue([]),
  addPbnSite: vi.fn().mockResolvedValue({ id: 1 }),
  updatePbnSite: vi.fn(),
  deletePbnSite: vi.fn(),
  addPbnPost: vi.fn().mockResolvedValue({ id: 1 }),
  getSitePosts: vi.fn().mockResolvedValue([]),
  getLatestAlgoIntel: vi.fn().mockResolvedValue([]),
  addAlgoIntel: vi.fn().mockResolvedValue({ id: 1 }),
  createModuleExecution: vi.fn().mockResolvedValue({ id: 1 }),
  updateModuleExecution: vi.fn(),
  getUserModuleExecutions: vi.fn().mockResolvedValue([]),
  saveMarketplaceSearch: vi.fn(),
}));

// ═══ Test Context ═══
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-autobid",
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

// ═══ Tests ═══

describe("quickPreFilter (unit)", () => {
  const baseCriteria: SEOCriteria = {
    minDA: 10, minDR: 10, maxSpamScore: 20,
    minBacklinks: 0, minReferringDomains: 0,
    minTrustFlow: 0, minCitationFlow: 0,
    useCase: "seo_build", bidStrategy: "moderate",
    maxBidPerDomain: 50,
  };

  it("should pass a good domain under budget", () => {
    const result = quickPreFilter("crypto.com", 25, baseCriteria);
    expect(result.pass).toBe(true);
  });

  it("should reject a domain over max bid price", () => {
    const result = quickPreFilter("crypto.com", 100, baseCriteria);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("exceeds max bid");
  });

  it("should reject a domain name that is too long", () => {
    const result = quickPreFilter("this-is-a-very-long-domain-name-that-exceeds-thirty-chars.com", 10, baseCriteria);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("too long");
  });

  it("should reject a domain with too many hyphens", () => {
    const result = quickPreFilter("my-crypto-domain-name.com", 10, baseCriteria);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("hyphens");
  });

  it("should reject domains with 3+ consecutive numbers in conservative mode", () => {
    const conservativeCriteria = { ...baseCriteria, bidStrategy: "conservative" };
    const result = quickPreFilter("crypto123domain.com", 10, conservativeCriteria);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("numbers");
  });

  it("should pass domains with numbers in non-conservative mode", () => {
    const aggressiveCriteria = { ...baseCriteria, bidStrategy: "aggressive" };
    const result = quickPreFilter("crypto123domain.com", 10, aggressiveCriteria);
    expect(result.pass).toBe(true);
  });
});

describe("autobid.list", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    mockBidHistoryEntries.length = 0;
    bidHistoryIdCounter = 1;
  });

  it("should return autobid rules for the user", async () => {
    const result = await caller.autobid.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Crypto Domains");
    expect(result[0].keyword).toBe("crypto");
  });
});

describe("autobid.create", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("should create a new autobid rule with SEO criteria", async () => {
    const result = await caller.autobid.create({
      name: "AI Domains",
      keyword: "artificial intelligence",
      tld: ".com",
      maxBidPerDomain: "75",
      totalBudget: "1000",
      minDA: 15,
      minDR: 20,
      maxSpamScore: 10,
      minBacklinks: 50,
      minReferringDomains: 10,
      minTrustFlow: 15,
      minCitationFlow: 10,
      useCase: "seo_build",
      bidStrategy: "moderate",
      autoPurchase: false,
      requireApproval: true,
    });
    expect(result).toBeDefined();
    expect(result.id).toBe(3);
  });

  it("should require keyword", async () => {
    await expect(
      caller.autobid.create({
        name: "No Keyword",
        keyword: "",
        tld: ".com",
      })
    ).rejects.toThrow();
  });
});

describe("autobid.update", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("should update rule status", async () => {
    const result = await caller.autobid.update({ id: 1, status: "paused" });
    expect(result).toEqual({ success: true });
  });

  it("should update SEO criteria", async () => {
    const result = await caller.autobid.update({
      id: 1,
      minDA: 25,
      minDR: 30,
      maxSpamScore: 5,
    });
    expect(result).toEqual({ success: true });
  });
});

describe("autobid.delete", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
  });

  it("should delete a rule", async () => {
    const result = await caller.autobid.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("autobid.analyzeDomain", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    mockBidHistoryEntries.length = 0;
    bidHistoryIdCounter = 1;
  });

  it("should analyze a domain and return SEO metrics", async () => {
    const result = await caller.autobid.analyzeDomain({
      domain: "cryptoworld.com",
      askPrice: 12.99,
      available: true,
    });

    expect(result).toBeDefined();
    expect(result.seoScore).toBe(78);
    expect(result.aiVerdict).toBe("BUY");
    expect(result.aiConfidence).toBe(82);
    expect(result.estimatedDA).toBe(25);
    expect(result.estimatedDR).toBe(30);
    expect(result.estimatedSpamScore).toBe(5);
    expect(result.estimatedTrustFlow).toBe(35);
    expect(result.estimatedCitationFlow).toBe(28);
    expect(result.brandability).toBe(75);
    expect(result.marketValue).toBe(200);
    expect(result.priceVsValue).toBe("undervalued");
    expect(result.meetsCriteria).toBeDefined();
  });

  it("should use rule criteria when ruleId is provided", async () => {
    const result = await caller.autobid.analyzeDomain({
      domain: "cryptoworld.com",
      askPrice: 12.99,
      available: true,
      ruleId: 1,
    });

    expect(result).toBeDefined();
    expect(result.seoScore).toBe(78);
    // Should have saved to bid history
    expect(mockBidHistoryEntries.length).toBe(1);
    expect(mockBidHistoryEntries[0].ruleId).toBe(1);
    expect(mockBidHistoryEntries[0].action).toBe("analyzed");
  });

  it("should throw if ruleId is invalid", async () => {
    await expect(
      caller.autobid.analyzeDomain({
        domain: "test.com",
        askPrice: 10,
        available: true,
        ruleId: 999,
      })
    ).rejects.toThrow("Rule not found");
  });
});

describe("autobid.bidHistory", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    mockBidHistoryEntries.length = 0;
    bidHistoryIdCounter = 1;
  });

  it("should return empty bid history initially", async () => {
    const result = await caller.autobid.bidHistory({ limit: 100 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return bid history for a specific rule", async () => {
    const result = await caller.autobid.bidHistory({ ruleId: 1, limit: 50 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("autobid.run", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    mockBidHistoryEntries.length = 0;
    bidHistoryIdCounter = 1;
  });

  it("should run auto-bid scan and return results", async () => {
    const result = await caller.autobid.run({ id: 1 });

    expect(result).toBeDefined();
    expect(result.scanned).toBeGreaterThanOrEqual(0);
    expect(result.message).toBeDefined();
    expect(typeof result.recommended).toBe("number");
    expect(typeof result.purchased).toBe("number");
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("should throw for non-existent rule", async () => {
    await expect(caller.autobid.run({ id: 999 }).catch(e => { throw e; })).rejects.toThrow();
  });
});

describe("autobid.rejectBid", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext());
    mockBidHistoryEntries.length = 0;
    bidHistoryIdCounter = 1;
  });

  it("should reject a bid entry", async () => {
    // First create a mock entry
    mockBidHistoryEntries.push({
      id: 1, ruleId: 1, domain: "test.com", action: "recommended",
      seoScore: 78, askPrice: "12.99", createdAt: new Date(),
    });

    const result = await caller.autobid.rejectBid({ bidHistoryId: 1 });
    expect(result).toEqual({ success: true });
  });
});
