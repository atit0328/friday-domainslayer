import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ENV
vi.mock("./_core/env", () => ({
  ENV: {
    shodanApiKey: "test-shodan-key-123",
  },
}));

// We'll test the module's logic by importing after mocks
import { scanDomainPorts, formatShodanForTelegram, type PortIntelligence, type ShodanHostResult } from "./shodan-scanner";

describe("Shodan Scanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("scanDomainPorts", () => {
    it("should return null when Shodan API key is not configured", async () => {
      // Temporarily override ENV
      const envModule = await import("./_core/env");
      const originalKey = envModule.ENV.shodanApiKey;
      (envModule.ENV as any).shodanApiKey = "";

      const result = await scanDomainPorts("example.com");
      expect(result).toBeNull();

      (envModule.ENV as any).shodanApiKey = originalKey;
    });

    it("should clean domain input correctly", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("test"));

      // Should strip protocol, path, and www
      await scanDomainPorts("https://www.example.com/path/page");

      // First call should be DNS resolve
      expect(fetchSpy).toHaveBeenCalled();
      const firstCallUrl = fetchSpy.mock.calls[0][0] as string;
      expect(firstCallUrl).toContain("hostnames=example.com");
      expect(firstCallUrl).not.toContain("www.");
      expect(firstCallUrl).not.toContain("https://www.");

      fetchSpy.mockRestore();
    });

    it("should handle DNS resolution failure gracefully", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as any);

      // DNS fallback will also fail in test environment
      const result = await scanDomainPorts("nonexistent-domain-xyz.com");
      // Should return null since DNS fails
      expect(result).toBeNull();

      fetchSpy.mockRestore();
    });

    it("should handle successful Shodan lookup with open ports", async () => {
      const mockDnsResponse = { "example.com": "1.2.3.4" };
      const mockHostResponse = {
        ip_str: "1.2.3.4",
        hostnames: ["example.com"],
        org: "Example Org",
        isp: "Example ISP",
        os: "Linux",
        ports: [21, 22, 80, 443, 2083, 3306],
        data: [
          { port: 21, transport: "tcp", product: "vsftpd", version: "3.0.3", _shodan: { module: "ftp" } },
          { port: 22, transport: "tcp", product: "OpenSSH", version: "8.2p1", _shodan: { module: "ssh" } },
          { port: 80, transport: "tcp", http: { title: "Example Site", server: "Apache/2.4" }, _shodan: { module: "http" } },
          { port: 443, transport: "tcp", http: { server: "Apache/2.4" }, ssl: { cert: {} }, _shodan: { module: "https" } },
          { port: 2083, transport: "tcp", _shodan: { module: "https" } },
          { port: 3306, transport: "tcp", product: "MySQL", version: "5.7", _shodan: { module: "mysql" } },
        ],
        vulns: ["CVE-2021-44228", "CVE-2022-1234"],
        country_code: "TH",
        last_update: "2026-03-15",
      };
      const mockReverseDns = { "1.2.3.4": ["example.com", "other-site.com"] };

      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockDnsResponse) } as any)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockHostResponse) } as any)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockReverseDns) } as any);

      const progressMessages: string[] = [];
      const result = await scanDomainPorts("example.com", (msg) => progressMessages.push(msg));

      expect(result).not.toBeNull();
      expect(result!.ftpOpen).toBe(true);
      expect(result!.sshOpen).toBe(true);
      expect(result!.httpOpen).toBe(true);
      expect(result!.httpsOpen).toBe(true);
      expect(result!.cpanelOpen).toBe(true);
      expect(result!.mysqlOpen).toBe(true);
      expect(result!.directAdminOpen).toBe(false);
      expect(result!.pleskOpen).toBe(false);
      expect(result!.allPorts).toEqual([21, 22, 80, 443, 2083, 3306]);
      expect(result!.vulns).toEqual(["CVE-2021-44228", "CVE-2022-1234"]);
      expect(result!.serverType).toBe("Apache/2.4");
      expect(result!.os).toBe("Linux");

      // Check progress messages
      expect(progressMessages.some(m => m.includes("Resolving IP"))).toBe(true);
      expect(progressMessages.some(m => m.includes("1.2.3.4"))).toBe(true);
      expect(progressMessages.some(m => m.includes("ports open"))).toBe(true);
      expect(progressMessages.some(m => m.includes("CVE"))).toBe(true);

      fetchSpy.mockRestore();
    });

    it("should handle Shodan 404 (no data for IP)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ "example.com": "5.6.7.8" }) } as any)
        .mockResolvedValueOnce({ ok: false, status: 404 } as any)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ "5.6.7.8": [] }) } as any);

      const result = await scanDomainPorts("example.com");

      expect(result).not.toBeNull();
      expect(result!.allPorts).toEqual([]);
      expect(result!.ftpOpen).toBe(false);
      expect(result!.sshOpen).toBe(false);

      fetchSpy.mockRestore();
    });
  });

  describe("formatShodanForTelegram", () => {
    it("should format port intelligence for Telegram display", () => {
      const intel: PortIntelligence = {
        ftpOpen: true,
        ftpService: { port: 21, transport: "tcp", product: "vsftpd", version: "3.0.3" },
        sshOpen: true,
        sshService: { port: 22, transport: "tcp", product: "OpenSSH", version: "8.2p1" },
        httpOpen: true,
        httpsOpen: true,
        cpanelOpen: true,
        whmOpen: false,
        directAdminOpen: false,
        pleskOpen: false,
        mysqlOpen: true,
        phpMyAdminLikely: true,
        smtpOpen: false,
        allPorts: [21, 22, 80, 443, 2083, 3306],
        serverType: "Apache/2.4",
        os: "Linux",
        vulns: ["CVE-2021-44228"],
        sharedDomains: ["other-site.com"],
        raw: {
          ip: "1.2.3.4",
          hostnames: ["example.com"],
          org: "Example Org",
          ports: [21, 22, 80, 443, 2083, 3306],
          services: [],
          sharedDomains: ["other-site.com"],
          vulns: ["CVE-2021-44228"],
        },
      };

      const formatted = formatShodanForTelegram(intel);

      expect(formatted).toContain("Shodan Port Scan");
      expect(formatted).toContain("1.2.3.4");
      expect(formatted).toContain("Apache/2.4");
      expect(formatted).toContain("Linux");
      expect(formatted).toContain("FTP (21)");
      expect(formatted).toContain("vsftpd 3.0.3");
      expect(formatted).toContain("SSH (22)");
      expect(formatted).toContain("OpenSSH 8.2p1");
      expect(formatted).toContain("cPanel (2083)");
      expect(formatted).toContain("MySQL (3306)");
      expect(formatted).toContain("CVE-2021-44228");
      expect(formatted).toContain("other-site.com");
    });

    it("should handle empty results gracefully", () => {
      const intel: PortIntelligence = {
        ftpOpen: false,
        sshOpen: false,
        httpOpen: false,
        httpsOpen: false,
        cpanelOpen: false,
        whmOpen: false,
        directAdminOpen: false,
        pleskOpen: false,
        mysqlOpen: false,
        phpMyAdminLikely: false,
        smtpOpen: false,
        allPorts: [],
        vulns: [],
        sharedDomains: [],
        raw: {
          ip: "10.0.0.1",
          hostnames: [],
          ports: [],
          services: [],
          sharedDomains: [],
          vulns: [],
        },
      };

      const formatted = formatShodanForTelegram(intel);
      expect(formatted).toContain("10.0.0.1");
      expect(formatted).toContain("Open Ports (0)");
      expect(formatted).not.toContain("Vulnerabilities");
      expect(formatted).not.toContain("Shared Hosting");
    });
  });
});
