import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"estimatedPosition": 15, "indexProbability": 0.7, "insight": "Test insight"}' } }],
  }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-deploy",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    plan: "FREE",
    company: null,
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

describe("deployHistory router", () => {
  it("list returns empty when DB is not available", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.deployHistory.list({ limit: 10, offset: 0 });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it("analytics returns zero stats when DB is not available", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.deployHistory.analytics({ days: 30 });
    expect(result.totalDeploys).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.topDomains).toEqual([]);
    expect(result.dailyStats).toEqual([]);
  });

  it("get returns null when DB is not available", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.deployHistory.get({ id: 1 });
    expect(result).toBeNull();
  });
});

describe("parasiteTemplates router", () => {
  it("list returns built-in templates even without DB", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.parasiteTemplates.list();
    expect(Array.isArray(result)).toBe(true);
    // Should have at least the built-in templates
    expect(result.length).toBeGreaterThanOrEqual(6);
    // Each template should have required fields
    for (const tpl of result) {
      expect(tpl.slug).toBeDefined();
      expect(tpl.category).toBeDefined();
      expect(tpl.isSystem).toBe(true);
    }
  });

  it("preview generates HTML from a template", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.parasiteTemplates.preview({
      slug: "news",
      keywords: ["test keyword"],
      redirectUrl: "https://example.com",
      targetDomain: "target.com",
      redirectDelay: 5,
    });
    expect(result.success).toBe(true);
    expect(result.html).toBeDefined();
    expect(result.html.length).toBeGreaterThan(100);
  });

  it("preview returns error for unknown template", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.parasiteTemplates.preview({
      slug: "nonexistent-template",
      keywords: ["test"],
      redirectUrl: "https://example.com",
      targetDomain: "target.com",
      redirectDelay: 5,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("keywordRanking router", () => {
  it("list returns empty when DB is not available", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.keywordRanking.list({ limit: 10, offset: 0 });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it("summary returns zero stats when DB is not available", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.keywordRanking.summary();
    expect(result.totalTracking).toBe(0);
    expect(result.indexed).toBe(0);
    expect(result.top10).toBe(0);
    expect(result.bestKeyword).toBeNull();
  });

  it("history returns empty when DB is not available", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.keywordRanking.history({ keywordId: 1 });
    expect(result).toEqual([]);
  });
});
