import { describe, it, expect, vi } from "vitest";
import type { SSHCredential, SSHUploadResult, SSHUploadOptions } from "./ssh-uploader";

describe("SSH Uploader Module", () => {
  // ─── Type Tests ───
  describe("Type definitions", () => {
    it("SSHCredential has required fields", () => {
      const cred: SSHCredential = {
        host: "192.168.1.1",
        username: "admin",
        password: "pass123",
      };
      expect(cred.host).toBe("192.168.1.1");
      expect(cred.username).toBe("admin");
      expect(cred.password).toBe("pass123");
      expect(cred.port).toBeUndefined();
    });

    it("SSHCredential supports optional port", () => {
      const cred: SSHCredential = {
        host: "10.0.0.1",
        username: "root",
        password: "secret",
        port: 2222,
      };
      expect(cred.port).toBe(2222);
    });

    it("SSHUploadResult success shape", () => {
      const result: SSHUploadResult = {
        success: true,
        url: "https://example.com/wp-health.php",
        filePath: "/var/www/html/wp-health.php",
        method: "sftp",
        duration: 3500,
        webRoot: "/var/www/html",
        serverInfo: "Ubuntu 22.04",
      };
      expect(result.success).toBe(true);
      expect(result.url).toContain("wp-health.php");
      expect(result.method).toBe("sftp");
      expect(result.webRoot).toBe("/var/www/html");
    });

    it("SSHUploadResult failure shape", () => {
      const result: SSHUploadResult = {
        success: false,
        error: "Authentication failed",
        method: "sftp",
        duration: 1200,
      };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Authentication");
      expect(result.url).toBeUndefined();
    });

    it("SSHUploadOptions has required and optional fields", () => {
      const opts: SSHUploadOptions = {
        credential: { host: "test.com", username: "user", password: "pass" },
        redirectUrl: "https://redirect.com",
        targetDomain: "test.com",
        filename: "custom.php",
        timeout: 30000,
        onProgress: (msg) => console.log(msg),
      };
      expect(opts.credential.host).toBe("test.com");
      expect(opts.redirectUrl).toBe("https://redirect.com");
      expect(opts.filename).toBe("custom.php");
      expect(opts.timeout).toBe(30000);
    });
  });

  // ─── Connection Tests (real SSH connections will fail in test env) ───
  describe("sshUploadRedirect", () => {
    it("returns failure for unreachable host", async () => {
      const { sshUploadRedirect } = await import("./ssh-uploader");
      const result = await sshUploadRedirect({
        credential: {
          host: "192.0.2.1", // RFC 5737 TEST-NET — guaranteed unreachable
          username: "test",
          password: "test",
          port: 22,
        },
        redirectUrl: "https://example.com",
        targetDomain: "test.example.com",
        timeout: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe("number");
    }, 15000);

    it("returns failure for invalid credentials on localhost", async () => {
      const { sshUploadRedirect } = await import("./ssh-uploader");
      const result = await sshUploadRedirect({
        credential: {
          host: "127.0.0.1",
          username: "nonexistent_user_12345",
          password: "wrong_password",
          port: 22,
        },
        redirectUrl: "https://example.com",
        targetDomain: "localhost",
        timeout: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 15000);

    it("calls onProgress callback during execution", async () => {
      const { sshUploadRedirect } = await import("./ssh-uploader");
      const progressMessages: string[] = [];

      await sshUploadRedirect({
        credential: {
          host: "192.0.2.1",
          username: "test",
          password: "test",
          port: 22,
        },
        redirectUrl: "https://example.com",
        targetDomain: "test.example.com",
        timeout: 3000,
        onProgress: (msg) => progressMessages.push(msg),
      });

      // Should have at least one progress message (connecting...)
      expect(progressMessages.length).toBeGreaterThanOrEqual(1);
      expect(progressMessages[0]).toContain("SSH");
    }, 10000);
  });

  describe("sshBruteForceUpload", () => {
    it("returns failure when no credentials work", async () => {
      const { sshBruteForceUpload } = await import("./ssh-uploader");
      const result = await sshBruteForceUpload({
        host: "192.0.2.1",
        targetDomain: "test.example.com",
        redirectUrl: "https://example.com",
        credentials: [
          { host: "192.0.2.1", username: "admin", password: "admin" },
          { host: "192.0.2.1", username: "root", password: "root" },
        ],
        timeout: 3000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 20000);

    it("accepts empty credentials list gracefully", async () => {
      const { sshBruteForceUpload } = await import("./ssh-uploader");
      const result = await sshBruteForceUpload({
        host: "192.0.2.1",
        targetDomain: "test.example.com",
        redirectUrl: "https://example.com",
        credentials: [],
        timeout: 3000,
      });

      expect(result.success).toBe(false);
    }, 10000);
  });
});
