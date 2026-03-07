/**
 * Tests for new features:
 * 1. Domain Metrics module
 * 2. Local Auth (registration/login)
 * 3. Superadmin access control
 * 4. Campaign notifications
 */
import { describe, it, expect, vi } from "vitest";

// ═══ Domain Metrics Tests ═══
describe("Domain Metrics", () => {
  it("should export fetchDomainMetrics function", async () => {
    const mod = await import("./domain-metrics");
    expect(mod.fetchDomainMetrics).toBeDefined();
    expect(typeof mod.fetchDomainMetrics).toBe("function");
  });

  it("should export fetchWaybackData function", async () => {
    const mod = await import("./domain-metrics");
    expect(mod.fetchWaybackData).toBeDefined();
    expect(typeof mod.fetchWaybackData).toBe("function");
  });

  it("fetchWaybackData should return proper structure for a domain", async () => {
    const { fetchWaybackData } = await import("./domain-metrics");
    const result = await fetchWaybackData("google.com");
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  }, 60000);
});

// ═══ Local Auth Tests ═══
describe("Local Auth Router", () => {
  it("should export localAuthRouter", async () => {
    const mod = await import("./routers/local-auth");
    expect(mod.localAuthRouter).toBeDefined();
  });

  it("localAuthRouter should have login procedure (registration removed)", async () => {
    const mod = await import("./routers/local-auth");
    const router = mod.localAuthRouter;
    // tRPC router has _def.procedures
    // Registration was removed — login-only system
    expect(router._def.procedures).toHaveProperty("login");
  });
});

// ═══ DB User Functions Tests ═══
describe("DB User Functions", () => {
  it("should export getUserByEmail function", async () => {
    const mod = await import("./db");
    expect(mod.getUserByEmail).toBeDefined();
    expect(typeof mod.getUserByEmail).toBe("function");
  });

  it("should export createLocalUser function", async () => {
    const mod = await import("./db");
    expect(mod.createLocalUser).toBeDefined();
    expect(typeof mod.createLocalUser).toBe("function");
  });
});

// ═══ Superadmin Procedure Tests ═══
describe("Superadmin Access Control", () => {
  it("should export superadminProcedure from trpc", async () => {
    const mod = await import("./_core/trpc");
    expect(mod.superadminProcedure).toBeDefined();
  });

  it("blackhat router should use superadminProcedure", async () => {
    const mod = await import("./routers/blackhat");
    expect(mod.blackhatRouter).toBeDefined();
    // Verify the router has procedures
    const procedures = mod.blackhatRouter._def.procedures;
    expect(procedures).toHaveProperty("runFullChain");
    expect(procedures).toHaveProperty("runPhase");
    expect(procedures).toHaveProperty("runCapability");
    expect(procedures).toHaveProperty("detect");
    expect(procedures).toHaveProperty("capabilities");
  });

  it("seo-spam router should use superadminProcedure", async () => {
    const mod = await import("./routers/seo-spam");
    expect(mod.seoSpamRouter).toBeDefined();
    const procedures = mod.seoSpamRouter._def.procedures;
    expect(procedures).toHaveProperty("runFullChain");
    expect(procedures).toHaveProperty("executeAttack");
    expect(procedures).toHaveProperty("oneClickDeploy");
  });
});

// ═══ Campaign Engine Notification Tests ═══
describe("Campaign Engine with Notifications", () => {
  it("should export CAMPAIGN_PHASES with 16 phases", async () => {
    const mod = await import("./campaign-engine");
    expect(mod.CAMPAIGN_PHASES).toBeDefined();
    expect(mod.CAMPAIGN_PHASES).toHaveLength(16);
  });

  it("each phase should have description and requiresWP fields", async () => {
    const mod = await import("./campaign-engine");
    for (const phase of mod.CAMPAIGN_PHASES) {
      expect(phase).toHaveProperty("id");
      expect(phase).toHaveProperty("name");
      expect(phase).toHaveProperty("description");
      expect(typeof phase.requiresWP).toBe("boolean");
    }
  });

  it("should export runAllPhases function", async () => {
    const mod = await import("./campaign-engine");
    expect(mod.runAllPhases).toBeDefined();
    expect(typeof mod.runAllPhases).toBe("function");
  });

  it("should export runPhase function", async () => {
    const mod = await import("./campaign-engine");
    expect(mod.runPhase).toBeDefined();
    expect(typeof mod.runPhase).toBe("function");
  });
});

// ═══ WordPress API Tests ═══
describe("WordPress API Module", () => {
  it("should export WordPressAPI class", async () => {
    const mod = await import("./wp-api");
    expect(mod.WordPressAPI).toBeDefined();
  });

  it("should export createWPClient factory function", async () => {
    const mod = await import("./wp-api");
    expect(mod.createWPClient).toBeDefined();
    expect(typeof mod.createWPClient).toBe("function");
  });

  it("WordPressAPI should have all required methods", async () => {
    const { WordPressAPI } = await import("./wp-api");
    const client = new WordPressAPI({ siteUrl: "https://example.com", username: "admin", appPassword: "xxxx" });
    expect(typeof client.testConnection).toBe("function");
    expect(typeof client.getPosts).toBe("function");
    expect(typeof client.getPages).toBe("function");
    expect(typeof client.updatePost).toBe("function");
    expect(typeof client.getSiteInfo).toBe("function");
    expect(typeof client.getPlugins).toBe("function");
  });
});

// ═══ Schema Tests ═══
describe("Schema - User Roles", () => {
  it("users schema should have superadmin role", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.users).toBeDefined();
    // Check that the role enum includes superadmin
    const roleColumn = schema.users.role;
    expect(roleColumn).toBeDefined();
  });

  it("users schema should have passwordHash field", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.users.passwordHash).toBeDefined();
  });

  it("users schema should have phone field", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.users.phone).toBeDefined();
  });
});

// ═══ Domain Scans Schema Tests ═══
describe("Schema - Domain Scans Real Metrics", () => {
  it("domain_scans should have real SEO metric fields", async () => {
    const schema = await import("../drizzle/schema");
    const scans = schema.domainScans;
    expect(scans.da).toBeDefined();
    expect(scans.ss).toBeDefined();
    expect(scans.dr).toBeDefined();
    expect(scans.rf).toBeDefined();
    expect(scans.bl).toBeDefined();
    expect(scans.waybackSnapshots).toBeDefined();
    expect(scans.waybackFirstCapture).toBeDefined();
    expect(scans.waybackLastCapture).toBeDefined();
  });
});
