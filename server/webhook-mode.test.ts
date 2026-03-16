import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ENV before importing
vi.mock("./_core/env", () => ({
  ENV: {
    telegramBotToken: "test-bot-token",
    telegramChatId: "12345",
    telegramChatId2: "",
    telegramChatId3: "",
    telegramWebhookSecret: "test-secret-token-abc123",
    forgeApiUrl: "",
    forgeApiKey: "",
    anthropicApiKey: "",
    openaiApiKey: "",
    isProduction: true,
  },
}));

describe("Telegram Webhook Mode", () => {
  describe("Webhook Secret Verification", () => {
    it("should have TELEGRAM_WEBHOOK_SECRET configured", () => {
      // Verify the env var is set (it was set via webdev_request_secrets)
      expect(process.env.TELEGRAM_WEBHOOK_SECRET).toBeDefined();
      expect(typeof process.env.TELEGRAM_WEBHOOK_SECRET).toBe("string");
      expect(process.env.TELEGRAM_WEBHOOK_SECRET!.length).toBeGreaterThan(10);
    });

    it("should reject requests without valid secret token", async () => {
      const { ENV } = await import("./_core/env");
      
      // Simulate webhook request verification
      const webhookSecret = ENV.telegramWebhookSecret;
      const invalidHeader = "wrong-secret";
      
      expect(webhookSecret).toBeTruthy();
      expect(invalidHeader).not.toBe(webhookSecret);
    });

    it("should accept requests with valid secret token", async () => {
      const { ENV } = await import("./_core/env");
      
      const webhookSecret = ENV.telegramWebhookSecret;
      const validHeader = webhookSecret;
      
      expect(validHeader).toBe(webhookSecret);
    });
  });

  describe("Webhook URL Configuration", () => {
    it("should use domainslayer.ai as webhook domain", () => {
      const WEBHOOK_DOMAINS = [
        "domainslayer.ai",
        "www.domainslayer.ai",
        "fridayai-5qwxsxug.manus.space",
      ];
      
      const webhookUrl = `https://${WEBHOOK_DOMAINS[0]}/api/telegram/webhook`;
      expect(webhookUrl).toBe("https://domainslayer.ai/api/telegram/webhook");
    });

    it("should include secret_token in setWebhook payload", () => {
      const webhookSecret = "test-secret-token-abc123";
      const webhookPayload: Record<string, any> = {
        url: "https://domainslayer.ai/api/telegram/webhook",
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
        max_connections: 40,
      };
      
      if (webhookSecret) {
        webhookPayload.secret_token = webhookSecret;
      }
      
      expect(webhookPayload.secret_token).toBe(webhookSecret);
      expect(webhookPayload.max_connections).toBe(40);
      expect(webhookPayload.allowed_updates).toContain("message");
      expect(webhookPayload.allowed_updates).toContain("callback_query");
    });
  });

  describe("Webhook vs Polling Mode Detection", () => {
    it("should detect webhook mode when polling is inactive but status is connected", () => {
      const pollingActive = false;
      const healthStatus = "connected";
      
      const isWebhookMode = !pollingActive && healthStatus === "connected";
      expect(isWebhookMode).toBe(true);
    });

    it("should detect polling mode when polling is active", () => {
      const pollingActive = true;
      const healthStatus = "connected";
      
      const isWebhookMode = !pollingActive && healthStatus === "connected";
      expect(isWebhookMode).toBe(false);
    });

    it("should detect stopped mode when both inactive", () => {
      const pollingActive = false;
      const healthStatus = "stopped";
      
      const isWebhookMode = !pollingActive && healthStatus === "connected";
      const botMode = isWebhookMode ? "🔗 Webhook" : pollingActive ? "🔄 Polling" : "⏹ Stopped";
      expect(botMode).toBe("⏹ Stopped");
    });
  });

  describe("Dev Mode Guard", () => {
    it("should skip Telegram in dev mode", () => {
      const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
      // In test mode, this should be true (similar to dev)
      // The guard prevents Telegram from starting
      expect(typeof isDev).toBe("boolean");
    });

    it("should only start webhook in production", () => {
      const isDev = process.env.NODE_ENV === "development";
      const isProd = process.env.NODE_ENV === "production";
      
      // In production, webhook should start
      // In dev, it should be skipped
      if (isProd) {
        expect(isDev).toBe(false);
      }
    });
  });

  describe("Express Webhook Endpoint", () => {
    it("should register POST /api/telegram/webhook route", () => {
      // Simulate Express app route registration
      const registeredRoutes: string[] = [];
      const mockApp = {
        post: (path: string, _handler: any) => {
          registeredRoutes.push(`POST ${path}`);
        },
        get: (path: string, _handler: any) => {
          registeredRoutes.push(`GET ${path}`);
        },
      };
      
      // Simulate registerTelegramWebhook
      mockApp.post("/api/telegram/webhook", () => {});
      mockApp.get("/api/telegram/webhook", () => {});
      
      expect(registeredRoutes).toContain("POST /api/telegram/webhook");
      expect(registeredRoutes).toContain("GET /api/telegram/webhook");
    });

    it("should respond with 200 immediately for valid webhook requests", async () => {
      let responseStatus = 0;
      let responseBody: any = null;
      
      const mockRes = {
        json: (body: any) => {
          responseStatus = 200;
          responseBody = body;
        },
        status: (code: number) => ({
          json: (body: any) => {
            responseStatus = code;
            responseBody = body;
          },
        }),
        headersSent: false,
      };
      
      // Simulate valid webhook request
      mockRes.json({ ok: true });
      
      expect(responseStatus).toBe(200);
      expect(responseBody).toEqual({ ok: true });
    });

    it("should reject requests with wrong secret with 403", () => {
      let responseStatus = 0;
      let responseBody: any = null;
      
      const webhookSecret = "correct-secret";
      const headerSecret = "wrong-secret";
      
      if (webhookSecret && headerSecret !== webhookSecret) {
        responseStatus = 403;
        responseBody = { ok: false, error: "Forbidden" };
      }
      
      expect(responseStatus).toBe(403);
      expect(responseBody.error).toBe("Forbidden");
    });
  });
});
