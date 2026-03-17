import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("dns-registrar-takeover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("lookupWhois", () => {
    it("should parse RDAP response correctly", async () => {
      const { lookupWhois } = await import("./dns-registrar-takeover");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: [
            {
              roles: ["registrar"],
              vcardArray: [null, [["fn", {}, "text", "GoDaddy.com, LLC"]]],
              handle: "GoDaddy",
            },
            {
              roles: ["registrant"],
              vcardArray: [null, [["email", {}, "text", "admin@example.com"]]],
            },
          ],
          nameservers: [
            { ldhName: "ns1.cloudflare.com" },
            { ldhName: "ns2.cloudflare.com" },
          ],
          events: [
            { eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" },
            { eventAction: "expiration", eventDate: "2025-01-01T00:00:00Z" },
          ],
          status: ["active"],
        }),
      });

      const result = await lookupWhois("example.com");

      expect(result.registrar).toBe("GoDaddy.com, LLC");
      expect(result.nameservers).toContain("ns1.cloudflare.com");
      expect(result.nameservers).toContain("ns2.cloudflare.com");
      expect(result.registrantEmail).toBe("admin@example.com");
      expect(result.creationDate).toBe("2020-01-01T00:00:00Z");
      expect(result.expirationDate).toBe("2025-01-01T00:00:00Z");
    });

    it("should handle RDAP failure gracefully", async () => {
      const { lookupWhois } = await import("./dns-registrar-takeover");

      // RDAP fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Fallback WHOIS API also fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await lookupWhois("nonexistent.xyz");

      expect(result.registrar).toBeNull();
      expect(result.nameservers).toEqual([]);
    });

    it("should use fallback WHOIS API when RDAP has no registrar", async () => {
      const { lookupWhois } = await import("./dns-registrar-takeover");

      // RDAP returns but no registrar info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: [],
          nameservers: [],
          events: [],
        }),
      });

      // Fallback WHOIS API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          registrar: "Namecheap, Inc.",
          nameservers: ["dns1.namecheaphosting.com"],
          registrant_email: "hidden@whoisguard.com",
        }),
      });

      const result = await lookupWhois("example.com");

      expect(result.registrar).toBe("Namecheap, Inc.");
      expect(result.nameservers).toContain("dns1.namecheaphosting.com");
    });
  });

  describe("executeRegistrarTakeover", () => {
    it("should try GoDaddy API when registrar is GoDaddy", async () => {
      const { executeRegistrarTakeover } = await import("./dns-registrar-takeover");

      let callIdx = 0;
      mockFetch.mockImplementation(async (url: string) => {
        callIdx++;
        const urlStr = typeof url === "string" ? url : url.toString();

        // RDAP lookup
        if (urlStr.includes("rdap.org")) {
          return {
            ok: true,
            json: async () => ({
              entities: [
                {
                  roles: ["registrar"],
                  vcardArray: [null, [["fn", {}, "text", "GoDaddy.com, LLC"]]],
                },
              ],
              nameservers: [{ ldhName: "ns1.godaddy.com" }],
              events: [],
              status: ["active"],
            }),
          };
        }

        // GoDaddy API - domain info
        if (urlStr.includes("api.godaddy.com/v1/domains/")) {
          return { ok: true, json: async () => ({ domain: "example.com" }) };
        }

        // GoDaddy API - update records
        if (urlStr.includes("api.godaddy.com/v1/domains/") && urlStr.includes("records")) {
          return { ok: true, json: async () => ({}) };
        }

        return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
      });

      const logs: string[] = [];
      const result = await executeRegistrarTakeover({
        domain: "example.com",
        targetPath: "/",
        ourRedirectUrl: "https://our-site.com/",
        credentials: [{ email: "admin@godaddy.com", password: "apikey123" }],
        onProgress: (_phase, detail) => logs.push(detail),
      });

      // Should have tried GoDaddy
      expect(logs.some(l => l.includes("GoDaddy"))).toBe(true);
    });

    it("should try all registrar APIs when WHOIS is unknown", async () => {
      const { executeRegistrarTakeover } = await import("./dns-registrar-takeover");

      // All calls fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ success: false }),
        text: async () => "Forbidden",
      });

      const logs: string[] = [];
      const result = await executeRegistrarTakeover({
        domain: "unknown-registrar.com",
        targetPath: "/",
        ourRedirectUrl: "https://our-site.com/",
        credentials: [{ email: "user@test.com", password: "pass123" }],
        onProgress: (_phase, detail) => logs.push(detail),
      });

      expect(result.success).toBe(false);
      expect(result.method).toBe("none");
      // Should have tried all APIs
      expect(logs.some(l => l.includes("ลองทุก registrar API"))).toBe(true);
    });

    it("should return whois info even on failure", async () => {
      const { executeRegistrarTakeover } = await import("./dns-registrar-takeover");

      let callIdx = 0;
      mockFetch.mockImplementation(async (url: string) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("rdap.org")) {
          return {
            ok: true,
            json: async () => ({
              entities: [
                {
                  roles: ["registrar"],
                  vcardArray: [null, [["fn", {}, "text", "Cloudflare, Inc."]]],
                },
              ],
              nameservers: [
                { ldhName: "ns1.cloudflare.com" },
                { ldhName: "ns2.cloudflare.com" },
              ],
              events: [],
              status: ["active"],
            }),
          };
        }

        return {
          ok: false,
          status: 403,
          json: async () => ({ success: false }),
          text: async () => "Forbidden",
        };
      });

      const result = await executeRegistrarTakeover({
        domain: "example.com",
        targetPath: "/",
        ourRedirectUrl: "https://our-site.com/",
        credentials: [{ email: "user@test.com", password: "pass123" }],
      });

      expect(result.success).toBe(false);
      expect(result.whoisInfo).toBeDefined();
      expect(result.whoisInfo?.registrar).toBe("Cloudflare, Inc.");
      expect(result.whoisInfo?.nameservers).toContain("ns1.cloudflare.com");
    });
  });
});
