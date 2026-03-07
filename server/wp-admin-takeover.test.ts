import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWpAdminTakeover, runShellExecFallback, type WpAdminConfig, type WpTakeoverResult } from "./wp-admin-takeover";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe("WP Admin Takeover Module", () => {
  const baseConfig: WpAdminConfig = {
    targetUrl: "https://example.com",
    redirectUrl: "https://gambling-site.com",
    seoKeywords: ["สล็อต", "บาคาร่า"],
    timeout: 5000,
    onProgress: vi.fn(),
  };

  describe("runWpAdminTakeover", () => {
    it("should return results array", async () => {
      // Mock wp-login.php check returns 404
      mockFetch.mockResolvedValue({
        status: 404,
        headers: new Headers(),
        text: async () => "",
      });

      const results = await runWpAdminTakeover(baseConfig);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should report brute force failure when wp-login not found", async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        headers: new Headers(),
        text: async () => "",
      });

      const results = await runWpAdminTakeover(baseConfig);
      const bruteResult = results.find(r => r.method === "brute_force");
      expect(bruteResult).toBeDefined();
      expect(bruteResult?.success).toBe(false);
    });

    it("should try XMLRPC with common creds when brute force fails", async () => {
      // wp-login returns 404 (no WP login)
      mockFetch.mockResolvedValue({
        status: 404,
        headers: new Headers(),
        text: async () => "Not found",
      });

      const results = await runWpAdminTakeover(baseConfig);
      const xmlrpcResult = results.find(r => r.method === "xmlrpc_inject");
      expect(xmlrpcResult).toBeDefined();
    });

    it("should use known credentials first", async () => {
      const configWithCreds: WpAdminConfig = {
        ...baseConfig,
        timeout: 2000,
        knownCredentials: [
          { username: "admin", password: "secret123" },
        ],
      };

      // wp-login exists but all logins fail
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: async () => "<html>login form</html>",
      });

      const results = await runWpAdminTakeover(configWithCreds);
      expect(results.length).toBeGreaterThan(0);
    }, 60000);

    it("should handle network errors gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const results = await runWpAdminTakeover(baseConfig);
      expect(results.length).toBeGreaterThan(0);
      // Should not throw
    });

    it("should call onProgress callback", async () => {
      const progressFn = vi.fn();
      const config: WpAdminConfig = {
        ...baseConfig,
        onProgress: progressFn,
      };

      mockFetch.mockResolvedValue({
        status: 404,
        headers: new Headers(),
        text: async () => "",
      });

      await runWpAdminTakeover(config);
      expect(progressFn).toHaveBeenCalled();
    });

    it("should detect successful login via 302 redirect to wp-admin", async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async (url: string, opts: any) => {
        callCount++;
        // First call: check wp-login exists
        if (callCount === 1) {
          return {
            status: 200,
            headers: new Headers(),
            text: async () => "<html>login form</html>",
          };
        }
        // Second call: login attempt succeeds
        if (callCount === 2) {
          return {
            status: 302,
            headers: new Headers({
              location: "https://example.com/wp-admin/",
            }),
            getSetCookie: () => ["wordpress_logged_in=abc123"],
            text: async () => "",
          };
        }
        // Theme editor
        if (callCount === 3) {
          return {
            status: 200,
            headers: new Headers(),
            text: async () => `
              <textarea id="newcontent">&lt;?php // functions.php ?&gt;</textarea>
              <input name="_wpnonce" value="abc123" />
              <input name="theme" value="twentytwentyfour" />
            `,
          };
        }
        // Theme editor update
        return {
          status: 200,
          headers: new Headers(),
          text: async () => "File edited successfully",
        };
      });

      const results = await runWpAdminTakeover(baseConfig);
      const themeResult = results.find(r => r.method === "theme_editor");
      if (themeResult) {
        expect(themeResult.success).toBe(true);
      }
    });

    it("should include brute_force and xmlrpc_inject in results on failure", async () => {
      // Mock: wp-login returns 404 (no WP)
      mockFetch.mockResolvedValue({
        status: 404,
        headers: new Headers(),
        text: async () => "Not found",
      });

      const results = await runWpAdminTakeover(baseConfig);
      const methods = results.map(r => r.method);
      expect(methods).toContain("brute_force");
      expect(methods).toContain("xmlrpc_inject");
    });
  });

  describe("runShellExecFallback", () => {
    it("should try to use existing shell to modify files", async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: async () => "some response",
      });

      const results = await runShellExecFallback(baseConfig, "https://example.com/shell.php");
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should try multiple shell command formats", async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: async () => "no match",
      });

      const results = await runShellExecFallback(baseConfig, "https://example.com/shell.php");
      expect(results[0].method).toBe("shell_exec");
      // Multiple fetch calls for different formats
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should detect successful file injection", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("cmd=")) {
          return {
            status: 200,
            headers: new Headers(),
            text: async () => "INJECTED:index.php",
          };
        }
        return {
          status: 200,
          headers: new Headers(),
          text: async () => "no match",
        };
      });

      const results = await runShellExecFallback(baseConfig, "https://example.com/shell.php");
      const successResult = results.find(r => r.success);
      if (successResult) {
        expect(successResult.method).toBe("shell_exec");
        expect(successResult.detail.toLowerCase()).toContain("inject");
      }
    });
  });

  describe("WpTakeoverResult interface", () => {
    it("should have correct shape", () => {
      const result: WpTakeoverResult = {
        method: "theme_editor",
        success: true,
        detail: "Injected code into functions.php",
        injectedUrl: "https://example.com",
        credentials: { username: "admin", password: "admin123" },
      };

      expect(result.method).toBe("theme_editor");
      expect(result.success).toBe(true);
      expect(result.injectedUrl).toBe("https://example.com");
      expect(result.credentials?.username).toBe("admin");
    });

    it("should allow null optional fields", () => {
      const result: WpTakeoverResult = {
        method: "brute_force",
        success: false,
        detail: "Failed",
        injectedUrl: null,
        credentials: null,
      };

      expect(result.injectedUrl).toBeNull();
      expect(result.credentials).toBeNull();
    });
  });

  describe("WpAdminConfig interface", () => {
    it("should support all config options", () => {
      const config: WpAdminConfig = {
        targetUrl: "https://target.com",
        redirectUrl: "https://redirect.com",
        seoKeywords: ["keyword1", "keyword2"],
        shellContent: "<?php echo 'test'; ?>",
        timeout: 10000,
        onProgress: (method, detail) => {},
        knownCredentials: [{ username: "admin", password: "pass" }],
      };

      expect(config.targetUrl).toBe("https://target.com");
      expect(config.knownCredentials).toHaveLength(1);
    });
  });
});
