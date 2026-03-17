import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the proxy-pool module so safeFetch falls through to global.fetch
vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn().mockRejectedValue(new Error("mocked proxy fail")),
  proxyPool: { getProxy: vi.fn() },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("cloudflare-takeover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("detectCloudflareRedirect", () => {
    it("should detect CF-level redirect (302, no origin headers, content-length: 0)", async () => {
      const { detectCloudflareRedirect } = await import("./cloudflare-takeover");

      // Create a proper Headers object
      const headers = new Headers();
      headers.set("location", "https://evil-competitor.cc/");
      headers.set("content-length", "0");
      headers.set("cf-ray", "abc123-SIN");
      headers.set("server", "cloudflare");

      mockFetch.mockResolvedValueOnce({
        status: 302,
        redirected: false,
        headers,
        url: "https://example.com/events",
        text: async () => "",
      });

      const result = await detectCloudflareRedirect("https://example.com/events");

      expect(result.isCloudflareRedirect).toBe(true);
      expect(result.httpStatus).toBe(302);
      expect(result.redirectUrl).toBe("https://evil-competitor.cc/");
      expect(result.hasOriginHeaders).toBe(false);
      expect(result.hasCfHeaders || result.cfRay).toBeTruthy();
    });

    it("should detect origin-level redirect (has x-powered-by)", async () => {
      const { detectCloudflareRedirect } = await import("./cloudflare-takeover");

      const headers = new Headers();
      headers.set("location", "https://evil.cc/");
      headers.set("content-length", "150");
      headers.set("server", "Apache");
      headers.set("x-powered-by", "PHP/7.4");

      mockFetch.mockResolvedValueOnce({
        status: 301,
        redirected: false,
        headers,
        url: "https://example.com/page",
        text: async () => "<html>redirect</html>",
      });

      const result = await detectCloudflareRedirect("https://example.com/page");

      expect(result.isCloudflareRedirect).toBe(false);
      expect(result.hasOriginHeaders).toBe(true);
    });

    it("should handle non-redirect responses", async () => {
      const { detectCloudflareRedirect } = await import("./cloudflare-takeover");

      const headers = new Headers();
      headers.set("content-length", "5000");
      headers.set("server", "cloudflare");

      mockFetch.mockResolvedValueOnce({
        status: 200,
        redirected: false,
        headers,
        url: "https://example.com/",
        text: async () => "<html>normal page</html>",
      });

      const result = await detectCloudflareRedirect("https://example.com/");

      expect(result.isCloudflareRedirect).toBe(false);
      expect(result.httpStatus).toBe(200);
    });

    it("should handle fetch errors gracefully", async () => {
      const { detectCloudflareRedirect } = await import("./cloudflare-takeover");

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await detectCloudflareRedirect("https://unreachable.com/");

      expect(result.isCloudflareRedirect).toBe(false);
    });
  });

  describe("extractCfTokensFromCredentials", () => {
    it("should extract API tokens from credentials (37-45 char alphanumeric)", async () => {
      const { extractCfTokensFromCredentials } = await import("./cloudflare-takeover");

      const creds = [
        { email: "admin@example.com", password: "normalpassword123", username: "" },
        { email: "admin@example.com", password: "abcdefghijklmnopqrstuvwxyz1234567890abc", username: "" }, // 39 chars
        { email: "admin@example.com", password: "short", username: "ABCDEFGHIJKLMNOPQRSTUVWXYZ12345678901234" }, // 40 chars in username
      ];

      const tokens = extractCfTokensFromCredentials(creds as any);

      expect(tokens.length).toBeGreaterThanOrEqual(2);
      expect(tokens).toContain("abcdefghijklmnopqrstuvwxyz1234567890abc");
      expect(tokens).toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ12345678901234");
    });

    it("should return empty array for no matching tokens", async () => {
      const { extractCfTokensFromCredentials } = await import("./cloudflare-takeover");

      const creds = [
        { email: "user@example.com", password: "short", username: "bob" },
      ];

      const tokens = extractCfTokensFromCredentials(creds as any);
      expect(tokens).toEqual([]);
    });

    it("should deduplicate tokens", async () => {
      const { extractCfTokensFromCredentials } = await import("./cloudflare-takeover");

      const token = "abcdefghijklmnopqrstuvwxyz1234567890abc";
      const creds = [
        { email: "a@b.com", password: token, username: "" },
        { email: "c@d.com", password: token, username: "" },
      ];

      const tokens = extractCfTokensFromCredentials(creds as any);
      const unique = [...new Set(tokens)];
      expect(tokens.length).toBe(unique.length);
    });
  });

  describe("executeCloudfareTakeover", () => {
    it("should try API token auth and report failure when invalid", async () => {
      const { executeCloudfareTakeover } = await import("./cloudflare-takeover");

      // Mock all CF API calls to fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ success: false, errors: [{ message: "Invalid token" }] }),
        text: async () => "Forbidden",
      });

      const logs: string[] = [];
      const result = await executeCloudfareTakeover({
        targetUrl: "https://example.com/events",
        targetPath: "/events",
        ourRedirectUrl: "https://our-site.com/",
        credentials: [{ email: "admin@example.com", password: "badpassword" }],
        apiTokens: ["invalid_token_12345678901234567890abc"],
        onProgress: (_phase, detail) => logs.push(detail),
      });

      expect(result.success).toBe(false);
      expect(result.method).toBe("none");
      expect(logs.length).toBeGreaterThan(0);
    });

    it("should succeed when API token is valid and zone found", async () => {
      const { executeCloudfareTakeover } = await import("./cloudflare-takeover");

      mockFetch.mockImplementation(async (url: string | URL | Request, opts?: any) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        // Token verify
        if (urlStr.includes("/user/tokens/verify")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, result: { status: "active" } }),
          };
        }

        // List zones
        if (urlStr.includes("/zones?") && urlStr.includes("name=")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              result: [{ id: "zone123", name: "example.com" }],
            }),
          };
        }

        // List existing page rules
        if (urlStr.includes("/pagerules") && (!opts?.method || opts?.method === "GET")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              result: [{
                id: "competitor_rule",
                targets: [{ constraint: { value: "*example.com/events*" } }],
                actions: [{ id: "forwarding_url", value: { url: "https://evil.cc/" } }],
              }],
            }),
          };
        }

        // Delete page rule
        if (urlStr.includes("/pagerules/competitor_rule") && opts?.method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          };
        }

        // Create page rule
        if (urlStr.includes("/pagerules") && opts?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, result: { id: "our_rule_123" } }),
          };
        }

        // Rulesets
        if (urlStr.includes("/rulesets")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, result: { rules: [] } }),
          };
        }

        // Workers
        if (urlStr.includes("/workers")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, result: [] }),
          };
        }

        // Default
        return {
          ok: false,
          status: 404,
          json: async () => ({ success: false }),
          text: async () => "Not found",
        };
      });

      const logs: string[] = [];
      const result = await executeCloudfareTakeover({
        targetUrl: "https://example.com/events",
        targetPath: "/events",
        ourRedirectUrl: "https://our-site.com/",
        credentials: [],
        apiTokens: ["valid_token_abcdefghijklmnopqrstuvwxyz12"],
        onProgress: (_phase, detail) => logs.push(detail),
      });

      expect(result.success).toBe(true);
      expect(result.method).not.toBe("none");
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
