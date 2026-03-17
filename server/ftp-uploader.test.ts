import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock basic-ftp
const mockFtpClient = {
  ftp: { verbose: false },
  access: vi.fn(),
  pwd: vi.fn().mockResolvedValue("/"),
  cd: vi.fn(),
  list: vi.fn(),
  uploadFrom: vi.fn(),
  close: vi.fn(),
};

vi.mock("basic-ftp", () => ({
  Client: vi.fn(() => mockFtpClient),
  FTPError: class FTPError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "FTPError";
    }
  },
}));

import { ftpUploadRedirect, ftpBruteForceUpload, type FTPCredential } from "./ftp-uploader";

describe("FTP Uploader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFtpClient.access.mockResolvedValue(undefined);
    mockFtpClient.pwd.mockResolvedValue("/");
    mockFtpClient.cd.mockResolvedValue(undefined);
    mockFtpClient.list.mockResolvedValue([]);
    mockFtpClient.uploadFrom.mockResolvedValue(undefined);
    mockFtpClient.close.mockReturnValue(undefined);
  });

  describe("ftpUploadRedirect", () => {
    it("should successfully upload a redirect file when web root is found", async () => {
      // First cd to /public_html succeeds and has web files
      mockFtpClient.cd.mockResolvedValue(undefined);
      mockFtpClient.list
        .mockResolvedValueOnce([
          { name: "index.php" },
          { name: ".htaccess" },
          { name: "wp-config.php" },
        ]) // web root detection
        .mockResolvedValueOnce([
          { name: "index.php" },
          { name: ".htaccess" },
        ]); // .htaccess check

      const progressMessages: string[] = [];
      const result = await ftpUploadRedirect({
        credential: {
          host: "example.com",
          username: "admin",
          password: "pass123",
          port: 21,
        },
        redirectUrl: "https://target.com",
        targetDomain: "example.com",
        onProgress: (msg) => progressMessages.push(msg),
      });

      expect(result.success).toBe(true);
      expect(result.url).toContain("https://example.com/");
      expect(result.method).toBe("ftps"); // tries FTPS first
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Should have tried to connect
      expect(mockFtpClient.access).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "example.com",
          port: 21,
          user: "admin",
          password: "pass123",
          secure: true,
        })
      );

      // Should have uploaded a file
      expect(mockFtpClient.uploadFrom).toHaveBeenCalled();

      // Should have progress messages
      expect(progressMessages.some(m => m.includes("Connecting"))).toBe(true);
      expect(progressMessages.some(m => m.includes("login success"))).toBe(true);
      expect(progressMessages.some(m => m.includes("web root"))).toBe(true);
    });

    it("should fall back to plain FTP when FTPS fails", async () => {
      // FTPS fails, FTP succeeds
      let callCount = 0;
      mockFtpClient.access.mockImplementation(async (opts: any) => {
        callCount++;
        if (opts.secure === true) {
          throw new Error("TLS connection failed");
        }
        return undefined;
      });

      // No web root found, use current dir
      mockFtpClient.list.mockResolvedValue([]);

      const result = await ftpUploadRedirect({
        credential: {
          host: "example.com",
          username: "admin",
          password: "pass123",
        },
        redirectUrl: "https://target.com",
        targetDomain: "example.com",
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe("ftp");
      expect(callCount).toBe(2); // FTPS + FTP
    });

    it("should fail when credentials are wrong (530 error)", async () => {
      const { FTPError } = await import("basic-ftp");
      mockFtpClient.access.mockRejectedValue(new FTPError("530 Login incorrect"));

      const result = await ftpUploadRedirect({
        credential: {
          host: "example.com",
          username: "wrong",
          password: "wrong",
        },
        redirectUrl: "https://target.com",
        targetDomain: "example.com",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("All FTP methods failed");
    });

    it("should skip .htaccess upload when one already exists", async () => {
      mockFtpClient.list
        .mockResolvedValueOnce([{ name: "index.php" }]) // web root detection
        .mockResolvedValueOnce([{ name: ".htaccess" }, { name: "index.php" }]); // .htaccess exists

      const progressMessages: string[] = [];
      const result = await ftpUploadRedirect({
        credential: {
          host: "example.com",
          username: "admin",
          password: "pass123",
        },
        redirectUrl: "https://target.com",
        targetDomain: "example.com",
        onProgress: (msg) => progressMessages.push(msg),
      });

      expect(result.success).toBe(true);
      // Should mention skipping .htaccess
      expect(progressMessages.some(m => m.includes(".htaccess exists"))).toBe(true);
    });

    it("should use custom filename when provided", async () => {
      mockFtpClient.list.mockResolvedValue([{ name: "index.html" }]);

      const result = await ftpUploadRedirect({
        credential: {
          host: "example.com",
          username: "admin",
          password: "pass123",
        },
        redirectUrl: "https://target.com",
        targetDomain: "example.com",
        filename: "custom-file.php",
      });

      expect(result.success).toBe(true);
      expect(result.url).toContain("custom-file.php");
    });
  });

  describe("ftpBruteForceUpload", () => {
    it("should try multiple credentials and return first success", async () => {
      let attemptCount = 0;
      mockFtpClient.access.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error("530 Login incorrect");
        }
        return undefined;
      });

      mockFtpClient.list.mockResolvedValue([{ name: "index.php" }]);

      const credentials: FTPCredential[] = [
        { host: "example.com", username: "user1", password: "pass1" },
        { host: "example.com", username: "user2", password: "pass2" },
        { host: "example.com", username: "user3", password: "pass3" },
      ];

      const progressMessages: string[] = [];
      const result = await ftpBruteForceUpload(
        credentials,
        "https://target.com",
        "example.com",
        (msg) => progressMessages.push(msg),
      );

      expect(result.success).toBe(true);
      expect(progressMessages.some(m => m.includes("Trying 3 FTP credential"))).toBe(true);
    });

    it("should stop when connection is refused", async () => {
      mockFtpClient.access.mockRejectedValue(new Error("ECONNREFUSED"));

      const credentials: FTPCredential[] = [
        { host: "example.com", username: "user1", password: "pass1" },
        { host: "example.com", username: "user2", password: "pass2" },
      ];

      const progressMessages: string[] = [];
      const result = await ftpBruteForceUpload(
        credentials,
        "https://target.com",
        "example.com",
        (msg) => progressMessages.push(msg),
      );

      expect(result.success).toBe(false);
      // After ECONNREFUSED on first cred, should stop trying remaining creds
      expect(progressMessages.some(m => m.includes("not reachable") || m.includes("ECONNREFUSED"))).toBe(true);
    });

    it("should return failure when all credentials fail", async () => {
      mockFtpClient.access.mockRejectedValue(new Error("530 Login incorrect"));

      const credentials: FTPCredential[] = [
        { host: "example.com", username: "user1", password: "pass1" },
      ];

      const result = await ftpBruteForceUpload(
        credentials,
        "https://target.com",
        "example.com",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("1 FTP credentials failed");
    });
  });
});
