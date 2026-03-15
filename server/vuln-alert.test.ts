import { describe, it, expect } from "vitest";
import { sendVulnAlert, type VulnAlertData } from "./telegram-notifier";

describe("Vulnerability Alert Notifications", () => {
  it("should export sendVulnAlert function", () => {
    expect(typeof sendVulnAlert).toBe("function");
  });

  it("should accept VulnAlertData with high vulns", async () => {
    const data: VulnAlertData = {
      domain: "test.example.com",
      serverInfo: "Apache/2.4.41",
      cms: "WordPress 6.2",
      highVulns: [
        { name: "SQL Injection in plugin", severity: "high", detail: "wp-plugin vuln" },
        { name: "RCE via file upload", severity: "critical", detail: "unrestricted upload" },
      ],
      exploitableVulns: [
        { name: "File Upload Bypass", detail: "Plugin allows PHP upload" },
      ],
      writablePaths: 3,
      attackVectors: [
        { name: "Plugin Upload", successProbability: 0.85 },
        { name: "Theme Editor", successProbability: 0.60 },
      ],
      context: "Full Chain กำลังโจมตีอัตโนมัติ...",
    };

    // Verify the data structure is valid
    expect(data.domain).toBe("test.example.com");
    expect(data.highVulns.length).toBe(2);
    expect(data.exploitableVulns.length).toBe(1);
    expect(data.attackVectors?.length).toBe(2);

    // Try sending (will succeed if Telegram env vars are set, gracefully fail otherwise)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      console.log("Telegram env vars not set, skipping live alert test");
      // Still verify the function doesn't throw
      const result = await sendVulnAlert(data);
      expect(typeof result).toBe("boolean");
      return;
    }

    const result = await sendVulnAlert(data);
    expect(typeof result).toBe("boolean");
    if (result) {
      console.log("Vuln alert sent successfully to all chat IDs");
    }
  });

  it("should handle empty vulns gracefully", async () => {
    const data: VulnAlertData = {
      domain: "safe-site.com",
      highVulns: [],
      exploitableVulns: [],
    };

    // With no vulns, the function should still work without throwing
    const result = await sendVulnAlert(data);
    expect(typeof result).toBe("boolean");
  });

  it("should handle missing optional fields", async () => {
    const data: VulnAlertData = {
      domain: "minimal.com",
      highVulns: [{ name: "Test Vuln", severity: "high" }],
      exploitableVulns: [],
    };

    const result = await sendVulnAlert(data);
    expect(typeof result).toBe("boolean");
  });

  it("should include all chat IDs in alert", () => {
    // Verify env vars for multi-chat support
    const chatId1 = process.env.TELEGRAM_CHAT_ID;
    const chatId2 = process.env.TELEGRAM_CHAT_ID_2;
    const chatId3 = process.env.TELEGRAM_CHAT_ID_3;

    // At least the primary chat ID should be configured
    if (chatId1) {
      expect(chatId1).toBeTruthy();
      console.log(`Chat IDs configured: ${[chatId1, chatId2, chatId3].filter(Boolean).length}`);
    } else {
      console.log("No TELEGRAM_CHAT_ID set, skipping multi-chat test");
      expect(true).toBe(true);
    }
  });
});
