import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
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
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
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
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("attackLogs.timeline", () => {
  it("returns timeline data with correct structure for admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attackLogs.timeline({
      days: 30,
      limit: 10,
      offset: 0,
    });

    expect(result).toHaveProperty("attacks");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.attacks)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("supports domain filter", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attackLogs.timeline({
      days: 30,
      domain: "nonexistent-domain-xyz.com",
      limit: 10,
      offset: 0,
    });

    expect(result.attacks).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("supports status filter", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attackLogs.timeline({
      days: 7,
      status: "success",
      limit: 10,
      offset: 0,
    });

    expect(result).toHaveProperty("attacks");
    expect(Array.isArray(result.attacks)).toBe(true);
    // All returned attacks should be success
    for (const attack of result.attacks) {
      expect(attack.status).toBe("success");
    }
  });

  it("works for regular user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attackLogs.timeline({
      days: 30,
      limit: 10,
      offset: 0,
    });

    expect(result).toHaveProperty("attacks");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.attacks)).toBe(true);
  });
});

describe("attackLogs.methodStats", () => {
  it("returns method stats with correct structure", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attackLogs.methodStats({
      days: 30,
    });

    expect(Array.isArray(result)).toBe(true);
    // Each item should have method, total, successRate, avgDurationMs
    for (const item of result) {
      expect(item).toHaveProperty("method");
      expect(item).toHaveProperty("total");
      expect(item).toHaveProperty("successRate");
      expect(item).toHaveProperty("avgDurationMs");
      expect(typeof item.method).toBe("string");
      expect(typeof item.total).toBe("number");
      expect(typeof item.successRate).toBe("number");
      expect(item.successRate).toBeGreaterThanOrEqual(0);
      expect(item.successRate).toBeLessThanOrEqual(100);
    }
  });

  it("accepts different day ranges", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result7 = await caller.attackLogs.methodStats({ days: 7 });
    const result90 = await caller.attackLogs.methodStats({ days: 90 });

    expect(Array.isArray(result7)).toBe(true);
    expect(Array.isArray(result90)).toBe(true);
  });
});

describe("attackLogs.attackDetail", () => {
  it("returns detail for a valid deploy ID", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // First get a timeline entry to get a real deploy ID
    const timeline = await caller.attackLogs.timeline({
      days: 365,
      limit: 1,
      offset: 0,
    });

    if (timeline.attacks.length === 0) {
      // No attacks in DB — skip detail test
      return;
    }

    const deployId = timeline.attacks[0].id;
    const result = await caller.attackLogs.attackDetail({
      deployId,
    });

    expect(result).toHaveProperty("deploy");
    expect(result).toHaveProperty("methods");
    expect(result).toHaveProperty("logs");
    expect(result).toHaveProperty("phaseTimeline");
    expect(result.deploy).toHaveProperty("targetDomain");
    expect(result.deploy).toHaveProperty("status");
    expect(Array.isArray(result.methods)).toBe(true);
    expect(Array.isArray(result.logs)).toBe(true);
    expect(Array.isArray(result.phaseTimeline)).toBe(true);
  });

  it("returns null for non-existent deploy ID", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attackLogs.attackDetail({
      deployId: 999999999,
    });

    expect(result).toBeNull();
  });
});

describe("attackLogs.dashboardStats", () => {
  it("returns dashboard stats with correct structure", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attackLogs.dashboardStats({
      days: 30,
    });

    expect(result).toHaveProperty("deployStats");
    expect(result).toHaveProperty("successRate");
    expect(result).toHaveProperty("totalLogEvents");
    expect(typeof result.deployStats.total).toBe("number");
    expect(typeof result.successRate).toBe("number");
    expect(typeof result.totalLogEvents).toBe("number");
  });
});
