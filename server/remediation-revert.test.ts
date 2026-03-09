/**
 * Vitest tests for Remediation Revert Engine
 * Tests snapshot capture, revert logic, fix history, and batch revert
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ─────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("./wp-api", () => ({
  createWPClient: vi.fn().mockReturnValue({
    testConnection: vi.fn().mockResolvedValue({ connected: true }),
    getSiteSettings: vi.fn().mockResolvedValue({
      x_frame_options: "SAMEORIGIN",
      content_security_policy: "default-src 'self'",
      strict_transport_security: "max-age=31536000",
      url: "https://example.com",
      home: "https://example.com",
      cookie_httponly: true,
      cookie_secure: true,
      cookie_samesite: "Lax",
      wp_debug: false,
      wp_debug_display: false,
      wp_debug_log: false,
      users_can_register: false,
      default_role: "subscriber",
    }),
    updateSiteSettings: vi.fn().mockResolvedValue(true),
    getPlugins: vi.fn().mockResolvedValue([
      { plugin: "headers-security-advanced/plugin.php", name: "Headers Security", status: "active" },
      { plugin: "really-simple-ssl/rlrsssl-really-simple-ssl.php", name: "Really Simple SSL", status: "active" },
      { plugin: "akismet/akismet.php", name: "Akismet", status: "active" },
    ]),
    activatePlugin: vi.fn().mockResolvedValue({ success: true }),
    deactivatePlugin: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

vi.mock("./auto-remediation", () => ({
  getWPCredentialsForDomain: vi.fn().mockResolvedValue({
    siteUrl: "https://example.com",
    username: "admin",
    appPassword: "xxxx",
  }),
  ALL_FIX_CATEGORIES: [
    { id: "security_headers", label: "Security Headers", description: "Add missing security headers", wpRequired: true },
    { id: "ssl_tls", label: "SSL/TLS", description: "Fix SSL issues", wpRequired: true },
    { id: "clickjacking", label: "Clickjacking", description: "Fix clickjacking", wpRequired: false },
  ],
}));

vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("../drizzle/schema", () => ({
  remediationHistory: { id: "id", userId: "userId", domain: "domain" },
  seoProjects: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

// ─── Import after mocks ────────────────────────
import {
  captureBeforeSnapshot,
  captureAfterSnapshot,
  saveFixToHistory,
  revertFix,
  revertAllFixes,
  getFixHistory,
  getFixDetail,
  type StateSnapshot,
  type RevertResult,
} from "./remediation-revert";
import { createWPClient } from "./wp-api";

describe("Remediation Revert Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════
  //  SNAPSHOT CAPTURE TESTS
  // ═══════════════════════════════════════════════

  describe("captureBeforeSnapshot", () => {
    it("should return empty snapshot when no WP client", async () => {
      const snapshot = await captureBeforeSnapshot("example.com", "security_headers", null);
      expect(snapshot).toBeDefined();
      expect(snapshot.capturedAt).toBeDefined();
      expect(snapshot.settings).toBeUndefined();
      expect(snapshot.plugins).toBeUndefined();
    });

    it("should capture security headers settings and plugins", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "security_headers", wp);
      expect(snapshot.capturedAt).toBeDefined();
      expect(snapshot.settings).toBeDefined();
      expect(snapshot.settings?.x_frame_options).toBe("SAMEORIGIN");
      expect(snapshot.settings?.content_security_policy).toBe("default-src 'self'");
      // Should capture security-related plugins
      expect(snapshot.plugins).toBeDefined();
      expect(snapshot.plugins!.length).toBeGreaterThan(0);
      expect(snapshot.plugins![0].slug).toContain("headers-security");
    });

    it("should capture SSL/TLS settings with URLs", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "ssl_tls", wp);
      expect(snapshot.settings?.strict_transport_security).toBe("max-age=31536000");
      expect(snapshot.siteUrl).toBe("https://example.com");
      expect(snapshot.homeUrl).toBe("https://example.com");
    });

    it("should capture session security settings", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "session_security", wp);
      expect(snapshot.settings?.cookie_httponly).toBe(true);
      expect(snapshot.settings?.cookie_secure).toBe(true);
      expect(snapshot.settings?.cookie_samesite).toBe("Lax");
    });

    it("should capture plugin management state", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "plugin_management", wp);
      expect(snapshot.plugins).toBeDefined();
      expect(snapshot.plugins!.length).toBe(3); // All plugins captured
      expect(snapshot.plugins![0].status).toBe("active");
    });

    it("should capture information disclosure settings", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "information_disclosure", wp);
      expect(snapshot.settings?.wp_debug).toBe(false);
      expect(snapshot.settings?.wp_debug_display).toBe(false);
    });

    it("should capture misconfiguration settings", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "misconfiguration", wp);
      expect(snapshot.settings?.users_can_register).toBe(false);
      expect(snapshot.settings?.default_role).toBe("subscriber");
    });

    it("should capture mixed content plugin state", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "mixed_content", wp);
      expect(snapshot.plugins).toBeDefined();
      // Should only capture SSL-related plugins
      expect(snapshot.plugins!.some(p => p.slug.includes("really-simple-ssl"))).toBe(true);
    });

    it("should capture clickjacking state (same as security_headers)", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "clickjacking", wp);
      expect(snapshot.settings?.x_frame_options).toBe("SAMEORIGIN");
    });

    it("should handle unknown category with generic settings capture", async () => {
      const wp = createWPClient({
        siteUrl: "https://example.com",
        username: "admin",
        appPassword: "xxxx",
      });
      const snapshot = await captureBeforeSnapshot("example.com", "unknown_category", wp);
      expect(snapshot.settings).toBeDefined();
    });
  });

  describe("captureAfterSnapshot", () => {
    it("should call same logic as captureBeforeSnapshot", async () => {
      const snapshot = await captureAfterSnapshot("example.com", "security_headers", null);
      expect(snapshot.capturedAt).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════
  //  SAVE FIX TO HISTORY TESTS
  // ═══════════════════════════════════════════════

  describe("saveFixToHistory", () => {
    it("should return null when database is unavailable", async () => {
      const result = await saveFixToHistory({
        userId: 1,
        scanId: 1,
        scanResultId: 1,
        domain: "example.com",
        fix: {
          vector: "Missing X-Frame-Options",
          category: "clickjacking",
          severity: "medium",
          finding: "X-Frame-Options header not set",
          fixStrategy: "add_security_header",
          action: "added_x_frame_options",
          detail: "Added X-Frame-Options: DENY",
          status: "fixed",
          revertible: true,
          revertAction: "remove_x_frame_options",
        },
        beforeState: { capturedAt: new Date().toISOString() },
        afterState: { capturedAt: new Date().toISOString() },
      });
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════
  //  REVERT FIX TESTS
  // ═══════════════════════════════════════════════

  describe("revertFix", () => {
    it("should return error when database is unavailable", async () => {
      const result = await revertFix(1, 1);
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.detail).toContain("Database unavailable");
      expect(result.id).toBe(1);
    });

    it("should return proper RevertResult structure", async () => {
      const result = await revertFix(999, 1);
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("action");
      expect(result).toHaveProperty("detail");
      expect(result).toHaveProperty("previousStatus");
      expect(result).toHaveProperty("newStatus");
    });
  });

  describe("revertAllFixes", () => {
    it("should return error when database is unavailable", async () => {
      const result = await revertAllFixes(1, 1);
      expect(result).toBeDefined();
      expect(result.total).toBe(0);
      expect(result.reverted).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.results).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════
  //  GET FIX HISTORY TESTS
  // ═══════════════════════════════════════════════

  describe("getFixHistory", () => {
    it("should return empty result when database is unavailable", async () => {
      const result = await getFixHistory({ userId: 1 });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it("should accept filter parameters", async () => {
      const result = await getFixHistory({
        userId: 1,
        domain: "example.com",
        status: "applied",
        limit: 10,
        offset: 0,
      });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe("getFixDetail", () => {
    it("should return null when database is unavailable", async () => {
      const result = await getFixDetail(1, 1);
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════
  //  TYPE VALIDATION TESTS
  // ═══════════════════════════════════════════════

  describe("Type Validation", () => {
    it("StateSnapshot should have required fields", () => {
      const snapshot: StateSnapshot = {
        capturedAt: new Date().toISOString(),
      };
      expect(snapshot.capturedAt).toBeDefined();
      expect(snapshot.settings).toBeUndefined();
      expect(snapshot.plugins).toBeUndefined();
    });

    it("StateSnapshot should accept all optional fields", () => {
      const snapshot: StateSnapshot = {
        capturedAt: new Date().toISOString(),
        settings: { key: "value" },
        plugins: [{ slug: "test/test.php", name: "Test", status: "active" }],
        siteUrl: "https://example.com",
        homeUrl: "https://example.com",
        specificData: { custom: true },
      };
      expect(snapshot.plugins!.length).toBe(1);
      expect(snapshot.siteUrl).toBe("https://example.com");
    });

    it("RevertResult should have all required fields", () => {
      const result: RevertResult = {
        id: 1,
        success: true,
        action: "revert_headers",
        detail: "Reverted security headers",
        previousStatus: "applied",
        newStatus: "reverted",
      };
      expect(result.id).toBe(1);
      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe("applied");
      expect(result.newStatus).toBe("reverted");
    });
  });

  // ═══════════════════════════════════════════════
  //  EDGE CASE TESTS
  // ═══════════════════════════════════════════════

  describe("Edge Cases", () => {
    it("should handle WP API errors gracefully during snapshot", async () => {
      const faultyWP = {
        ...createWPClient({
          siteUrl: "https://example.com",
          username: "admin",
          appPassword: "xxxx",
        }),
        getSiteSettings: vi.fn().mockRejectedValue(new Error("Connection refused")),
        getPlugins: vi.fn().mockRejectedValue(new Error("Connection refused")),
      };
      const snapshot = await captureBeforeSnapshot("example.com", "security_headers", faultyWP as any);
      // Should not throw, just return partial snapshot
      expect(snapshot.capturedAt).toBeDefined();
    });

    it("should handle empty domain in snapshot", async () => {
      const snapshot = await captureBeforeSnapshot("", "security_headers", null);
      expect(snapshot.capturedAt).toBeDefined();
    });

    it("should handle concurrent revert calls gracefully", async () => {
      // Both should return DB unavailable without crashing
      const [result1, result2] = await Promise.all([
        revertFix(1, 1),
        revertFix(2, 1),
      ]);
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
    });
  });
});
