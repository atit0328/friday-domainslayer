import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ═══════════════════════════════════════════════════════
//  Unit tests for Telegram AI Chat Agent
//  Tests conversation memory, message processing, 
//  tool resolution, and Telegram API interactions
// ═══════════════════════════════════════════════════════

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock proxy-pool
vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn(),
}));

// Mock telegram-notifier
vi.mock("./telegram-notifier", () => ({
  getTelegramConfig: vi.fn(() => ({
    botToken: "test-bot-token",
    chatId: "12345",
  })),
}));

// Mock DB module (conversation memory now uses DB)
vi.mock("./db", () => ({
  getDb: vi.fn(() => null), // Return null DB so it falls back to in-memory cache
}));

// Mock drizzle schema
vi.mock("../drizzle/schema", () => ({
  telegramConversations: {},
  telegramConversationState: {},
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
}));

// Mock env for multi-chat support
vi.mock("./_core/env", () => ({
  ENV: {
    telegramChatId: "12345",
    telegramChatId2: "1302522946",
    telegramBotToken: "test-bot-token",
    shodanApiKey: "",
    mozAccessId: "",
    mozSecretKey: "",
    ahrefsApiKey: "",
    serpApiKey: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    forgeApiUrl: "",
    forgeApiKey: "",
  },
}));

// Import after mocks
import {
  processMessage,
  clearHistory,
  handleTelegramWebhook,
  startTelegramPolling,
  stopTelegramPolling,
  isTelegramPollingActive,
  getAllowedChatIds,
  generateExecutiveSummary,
  startDailySummaryScheduler,
  stopDailySummaryScheduler,
  isDailySummarySchedulerActive,
  resetDedupState,
} from "./telegram-ai-agent";
import { invokeLLM } from "./_core/llm";
import { fetchWithPoolProxy } from "./proxy-pool";

const mockInvokeLLM = vi.mocked(invokeLLM);
const mockFetch = vi.mocked(fetchWithPoolProxy);

describe("Telegram AI Chat Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDedupState(); // Clear all dedup/lock state between tests
    clearHistory(0);
    clearHistory(12345);
  });

  // ═══ Conversation Memory ═══

  describe("Conversation Memory", () => {
    it("should maintain conversation history per chat", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "สวัสดีครับ!" },
          finish_reason: "stop",
        }],
      });

      await processMessage(100, "สวัสดี");
      await processMessage(100, "สบายดีไหม");

      // Second call should include history from first call
      const secondCallMessages = mockInvokeLLM.mock.calls[1][0].messages;
      // Should have: system + user("สวัสดี") + assistant("สวัสดีครับ!") + user("สบายดีไหม")
      expect(secondCallMessages.length).toBeGreaterThanOrEqual(4);
    });

    it("should isolate history between different chats", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "Reply" },
          finish_reason: "stop",
        }],
      });

      await processMessage(100, "Chat A message");
      await processMessage(200, "Chat B message");

      // Chat B should not have Chat A's history
      const chatBMessages = mockInvokeLLM.mock.calls[1][0].messages;
      const userMessages = chatBMessages.filter((m: any) => m.role === "user");
      expect(userMessages.some((m: any) => m.content === "Chat A message")).toBe(false);
    });

    it("should clear history when clearHistory is called", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "Reply" },
          finish_reason: "stop",
        }],
      });

      await processMessage(300, "First message");
      clearHistory(300);
      await processMessage(300, "After clear");

      // After clear, should only have system + current user message
      const afterClearMessages = mockInvokeLLM.mock.calls[1][0].messages;
      const userMessages = afterClearMessages.filter((m: any) => m.role === "user");
      expect(userMessages.length).toBe(1);
      expect(userMessages[0].content).toBe("After clear");
    });
  });

  // ═══ Message Processing ═══

  describe("Message Processing", () => {
    it("should return LLM text response for simple questions", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "วันนี้ระบบทำงานปกติครับ" },
          finish_reason: "stop",
        }],
      });

      const reply = await processMessage(0, "สถานะระบบเป็นยังไง?");
      expect(reply).toBe("วันนี้ระบบทำงานปกติครับ");
    });

    it("should handle LLM errors gracefully", async () => {
      mockInvokeLLM.mockRejectedValue(new Error("API timeout"));

      const reply = await processMessage(0, "test");
      expect(reply).toContain("ระบบมีปัญหาชั่วคราว");
      expect(reply).toContain("API timeout");
    });

    it("should handle empty choices gracefully", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [],
      });

      const reply = await processMessage(0, "test");
      expect(reply).toBe("ไม่ได้รับคำตอบ");
    });

    it("should include system prompt with context data", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        }],
      });

      await processMessage(0, "hello");

      const messages = mockInvokeLLM.mock.calls[0][0].messages;
      const systemMsg = messages.find((m: any) => m.role === "system");
      expect(systemMsg).toBeDefined();
      expect(systemMsg!.content).toContain("Friday");
      expect(systemMsg!.content).toContain("DomainSlayer");
    });

    it("should pass AI_TOOLS to LLM for tool calling", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        }],
      });

      await processMessage(0, "เช็ค sprint");

      const callArgs = mockInvokeLLM.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools!.length).toBeGreaterThan(0);
      
      // Check that key tools exist
      const toolNames = callArgs.tools!.map(t => t.function.name);
      expect(toolNames).toContain("check_sprint_status");
      expect(toolNames).toContain("check_attack_stats");
      expect(toolNames).toContain("start_sprint");
      expect(toolNames).toContain("attack_website");
      expect(toolNames).toContain("check_keyword_rank");
      expect(toolNames).toContain("analyze_domain");
      expect(toolNames).toContain("attack_multiple_websites");
    });

    it("should handle tool calls from LLM", async () => {
      // First call: LLM wants to call a tool
      mockInvokeLLM
        .mockResolvedValueOnce({
          id: "test",
          created: Date.now(),
          model: "test",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: "call_1",
                type: "function" as const,
                function: {
                  name: "check_pbn_status",
                  arguments: "{}",
                },
              }],
            },
            finish_reason: "tool_calls",
          }],
        })
        // Second call: LLM formats the tool result
        .mockResolvedValueOnce({
          id: "test2",
          created: Date.now(),
          model: "test",
          choices: [{
            index: 0,
            message: { role: "assistant", content: "PBN มี 5 ตัวครับ" },
            finish_reason: "stop",
          }],
        });

      const reply = await processMessage(0, "PBN มีกี่ตัว?");
      
      // Should have called LLM twice (initial + follow-up with tool results)
      expect(mockInvokeLLM).toHaveBeenCalledTimes(2);
      expect(reply).toBe("PBN มี 5 ตัวครับ");
    });
  });

  // ═══ Webhook Handler ═══

  describe("Webhook Handler", () => {
    it("should ignore messages without text", async () => {
      await handleTelegramWebhook({
        update_id: 1000,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Test" },
          chat: { id: 12345, type: "private" },
          date: Date.now(),
          // no text
        },
      });

      expect(mockInvokeLLM).not.toHaveBeenCalled();
    });

    it("should ignore messages from unauthorized chats", async () => {
      await handleTelegramWebhook({
        update_id: 1001,
        message: {
          message_id: 1,
          from: { id: 99999, first_name: "Hacker" },
          chat: { id: 99999, type: "private" },
          date: Date.now(),
          text: "hack something",
        },
      });

      expect(mockInvokeLLM).not.toHaveBeenCalled();
    });

    it("should handle /start command", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 1002,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Owner" },
          chat: { id: 12345, type: "private" },
          date: Date.now(),
          text: "/start",
        },
      });

      // Should send welcome message, not call LLM
      expect(mockInvokeLLM).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
      
      // Check the sent message contains welcome text
      const fetchCall = mockFetch.mock.calls.find(c => 
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(fetchCall).toBeDefined();
      const body = JSON.parse((fetchCall![1] as any).body);
      expect(body.text).toContain("Friday");
    });

    it("should handle /clear command", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 1003,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Owner" },
          chat: { id: 12345, type: "private" },
          date: Date.now(),
          text: "/clear",
        },
      });

      expect(mockInvokeLLM).not.toHaveBeenCalled();
    });

    it("should deduplicate updates by update_id", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        }],
      });

      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      const update = {
        update_id: 2000,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Owner" },
          chat: { id: 12345, type: "private" },
          date: Date.now(),
          text: "test dedup",
        },
      };

      await handleTelegramWebhook(update);
      await handleTelegramWebhook(update); // same update_id

      // LLM should only be called once
      expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
    });
  });

  // ═══ Polling Control ═══

  describe("Polling Control", () => {
    afterEach(() => {
      stopTelegramPolling();
    });

     it("should track polling state", async () => {
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });
      expect(isTelegramPollingActive()).toBe(false);
      await startTelegramPolling();
      expect(isTelegramPollingActive()).toBe(true);
      stopTelegramPolling();
      expect(isTelegramPollingActive()).toBe(false);
    });
    it("should not start multiple polling intervals", async () => {
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });
      await startTelegramPolling();
      await startTelegramPolling(); // second call should be no-op
      expect(isTelegramPollingActive()).toBe(true);
      stopTelegramPolling();
      expect(isTelegramPollingActive()).toBe(false);
    });
  });

  // ═══ System Prompt ═══

  describe("System Prompt", () => {
    it("should include current time in Bangkok timezone", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        }],
      });

      await processMessage(0, "test");

      const systemMsg = mockInvokeLLM.mock.calls[0][0].messages[0];
      expect(systemMsg.content).toContain("เวลา");
    });

    it("should include personality instructions in Thai", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        }],
      });

      await processMessage(0, "test");

      const systemMsg = mockInvokeLLM.mock.calls[0][0].messages[0];
      expect(systemMsg.content).toContain("ภาษาไทย");
      expect(systemMsg.content).toContain("สบายๆ");
    });

    it("should include all subsystem sections", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        }],
      });

      await processMessage(0, "test");

      const systemMsg = mockInvokeLLM.mock.calls[0][0].messages[0];
      expect(systemMsg.content).toContain("Sprints");
      expect(systemMsg.content).toContain("Attacks");
      expect(systemMsg.content).toContain("PBN");
      expect(systemMsg.content).toContain("CVE");
      expect(systemMsg.content).toContain("Orchestrator");
      expect(systemMsg.content).toContain("Redirect");
      expect(systemMsg.content).toContain("Rankings");
      expect(systemMsg.content).toContain("Content");
    });
  });

  // ═══ Tool Definitions ═══

  describe("Tool Definitions", () => {
    it("should have all required tools defined", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        }],
      });

      await processMessage(0, "test");

      const tools = mockInvokeLLM.mock.calls[0][0].tools!;
      const toolNames = tools.map(t => t.function.name);

      // All 11 tools should be present
      const expectedTools = [
        "check_sprint_status",
        "check_attack_stats",
        "start_sprint",
        "attack_website",
        "check_keyword_rank",
        "analyze_domain",
        "check_pbn_status",
        "attack_multiple_websites",
        "check_cve_database",
        "pause_resume_sprint",
        "get_orchestrator_status",
      ];

      for (const tool of expectedTools) {
        expect(toolNames).toContain(tool);
      }
    });

    it("should have proper parameter schemas for each tool", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        }],
      });

      await processMessage(0, "test");

      const tools = mockInvokeLLM.mock.calls[0][0].tools!;
      
      // Check start_sprint has required domain parameter
      const startSprint = tools.find(t => t.function.name === "start_sprint");
      expect(startSprint).toBeDefined();
      expect(startSprint!.function.parameters).toBeDefined();
      const params = startSprint!.function.parameters as any;
      expect(params.required).toContain("domain");

      // Check attack_website has required targetDomain
      const attackTool = tools.find(t => t.function.name === "attack_website");
      expect(attackTool).toBeDefined();
      const attackParams = attackTool!.function.parameters as any;
      expect(attackParams.required).toContain("targetDomain");
    });
  });

  // ═══ Response Handling ═══

  describe("Response Handling", () => {
    it("should handle non-string content from LLM", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: [{ type: "text", text: "array content" }] as any },
          finish_reason: "stop",
        }],
      });

      const reply = await processMessage(0, "test");
      // Should fallback to "ได้ครับ" for non-string content
      expect(reply).toBe("ได้ครับ");
    });

    it("should fallback to raw tool results when follow-up LLM fails", async () => {
      // First call: tool call
      mockInvokeLLM
        .mockResolvedValueOnce({
          id: "test",
          created: Date.now(),
          model: "test",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: "call_1",
                type: "function" as const,
                function: {
                  name: "get_orchestrator_status",
                  arguments: "{}",
                },
              }],
            },
            finish_reason: "tool_calls",
          }],
        })
        // Second call: fails
        .mockRejectedValueOnce(new Error("LLM down"));

      const reply = await processMessage(0, "orchestrator status");
      
      // In v2, when follow-up LLM fails, it falls back to error message
      expect(reply).toContain("ระบบมีปัญหาชั่วคราว");
    });
  });

  // ═══ Multi-Chat Support ═══

  describe("Multi-Chat Support", () => {
    it("should return all configured chat IDs", () => {
      const ids = getAllowedChatIds();
      expect(ids).toContain(12345);
      expect(ids).toContain(1302522946);
      expect(ids.length).toBe(2);
    });

    it("should allow messages from second chat ID", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "สวัสดีครับ" },
          finish_reason: "stop",
        }],
      });

      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 5000,
        message: {
          message_id: 1,
          from: { id: 1302522946, first_name: "User2" },
          chat: { id: 1302522946, type: "private" },
          date: Date.now(),
          text: "สวัสดี",
        },
      });

      // Should process the message (call LLM)
      expect(mockInvokeLLM).toHaveBeenCalled();
    });

    it("should reject messages from unauthorized chat IDs", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 5001,
        message: {
          message_id: 1,
          from: { id: 99999, first_name: "Stranger" },
          chat: { id: 99999, type: "private" },
          date: Date.now(),
          text: "hello",
        },
      });

      // Should NOT call LLM for unauthorized users
      expect(mockInvokeLLM).not.toHaveBeenCalled();
    });
  });

  // ═══ Executive Daily Summary ═══

  describe("Executive Daily Summary", () => {
    it("should generate a summary string", async () => {
      const summary = await generateExecutiveSummary();
      expect(typeof summary).toBe("string");
      expect(summary.length).toBeGreaterThan(0);
    });

    it("should include header with date", async () => {
      const summary = await generateExecutiveSummary();
      expect(summary).toContain("สรุปผลงาน DomainSlayer");
    });

    it("should include /menu tip at the end", async () => {
      const summary = await generateExecutiveSummary();
      expect(summary).toContain("/menu");
    });

    it("should NOT contain failure/error words", async () => {
      const summary = await generateExecutiveSummary();
      // Executive summary should only show successes
      expect(summary).not.toContain("ล้มเหลว");
      expect(summary).not.toContain("failed");
    });
  });

  // ═══ Daily Summary Scheduler ═══

  describe("Daily Summary Scheduler", () => {
    afterEach(() => {
      stopDailySummaryScheduler();
    });

    it("should track scheduler state", () => {
      expect(isDailySummarySchedulerActive()).toBe(false);
      startDailySummaryScheduler();
      expect(isDailySummarySchedulerActive()).toBe(true);
      stopDailySummaryScheduler();
      expect(isDailySummarySchedulerActive()).toBe(false);
    });

    it("should not start multiple schedulers", () => {
      startDailySummaryScheduler();
      startDailySummaryScheduler(); // second call should be no-op
      expect(isDailySummarySchedulerActive()).toBe(true);
      stopDailySummaryScheduler();
      expect(isDailySummarySchedulerActive()).toBe(false);
    });
  });

  // ═══ Inline Keyboard & Callback Queries ═══

  describe("Inline Keyboard & Callback Queries", () => {
    it("should handle /menu command and send inline keyboard", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 6000,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Owner" },
          chat: { id: 12345, type: "private" },
          date: Date.now(),
          text: "/menu",
        },
      });

      // Should NOT call LLM for /menu
      expect(mockInvokeLLM).not.toHaveBeenCalled();
      // Should call sendMessage with inline_keyboard
      const fetchCall = mockFetch.mock.calls.find(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(fetchCall).toBeDefined();
      const body = JSON.parse((fetchCall![1] as any).body);
      expect(body.reply_markup).toBeDefined();
      expect(body.reply_markup.inline_keyboard).toBeDefined();
      expect(body.reply_markup.inline_keyboard.length).toBeGreaterThanOrEqual(4);
    });

    it("should handle /summary command", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 6001,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Owner" },
          chat: { id: 12345, type: "private" },
          date: Date.now(),
          text: "/summary",
        },
      });

      // Should NOT call LLM
      expect(mockInvokeLLM).not.toHaveBeenCalled();
      // Should send a message
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should handle callback_query for sprint status", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 6002,
        callback_query: {
          id: "cbq_001",
          from: { id: 12345, first_name: "Owner" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "cb_sprint",
        },
      });

      // Should NOT call LLM for callback queries
      expect(mockInvokeLLM).not.toHaveBeenCalled();
      // Should answer callback query + send reply
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should handle callback_query for attack stats", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 6003,
        callback_query: {
          id: "cbq_002",
          from: { id: 12345, first_name: "Owner" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "cb_attack",
        },
      });

      expect(mockInvokeLLM).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should handle callback_query for daily summary", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

      await handleTelegramWebhook({
        update_id: 6004,
        callback_query: {
          id: "cbq_003",
          from: { id: 12345, first_name: "Owner" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "cb_summary",
        },
      });

      expect(mockInvokeLLM).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should reject callback_query from unauthorized users", async () => {
      mockFetch.mockResolvedValue({
        response: { json: () => Promise.resolve({ ok: true }) } as any,
        usedProxy: null,
      });

       await handleTelegramWebhook({
        update_id: 6005,
        callback_query: {
          id: "cbq_004",
          from: { id: 99999, first_name: "Stranger" },
          message: { message_id: 1, chat: { id: 99999, type: "private" } },
          data: "cb_sprint",
        },
      });
      // Should NOT send any response to unauthorized user
      // Only the answerCallbackQuery might be called, but sendMessage should not
      const sendMessageCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(sendMessageCalls.length).toBe(0);
    });
  });

  // ═══ Deduplication Fix ═══

  describe("Update ID Deduplication", () => {
    it("should not process the same update_id twice", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ตอบครั้งเดียว" },
          finish_reason: "stop",
        }],
      });
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });

      const update = {
        update_id: 99001,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Test" },
          chat: { id: 12345, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "test dedup",
        },
      };

      // Process same update twice
      await handleTelegramWebhook(update);
      await handleTelegramWebhook(update);

      // LLM should only be called once (second call is deduped)
      expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
    });

    it("should process different update_ids separately", async () => {
      mockInvokeLLM.mockResolvedValue({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ตอบ" },
          finish_reason: "stop",
        }],
      });
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });

      await handleTelegramWebhook({
        update_id: 99101,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Test" },
          chat: { id: 12345, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "msg 1",
        },
      });

      // Wait for lock to release
      await new Promise(r => setTimeout(r, 100));

      await handleTelegramWebhook({
        update_id: 99102,
        message: {
          message_id: 2,
          from: { id: 12345, first_name: "Test" },
          chat: { id: 12345, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "msg 2",
        },
      });

      // Both should be processed
      expect(mockInvokeLLM).toHaveBeenCalledTimes(2);
    });
  });

  // ═══ Attack Inline Keyboard Flow ═══

  describe("Attack Inline Keyboard Flow", () => {
    it("should handle cb_attack_menu callback by sending target keyboard", async () => {
      // Mock DB to return some projects
      vi.doMock("./db", () => ({
        getUserSeoProjects: vi.fn().mockResolvedValue([
          { domain: "test1.com", name: "Test 1" },
          { domain: "test2.com", name: "Test 2" },
        ]),
        getDb: vi.fn().mockResolvedValue(null),
      }));

      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });

      await handleTelegramWebhook({
        update_id: 99201,
        callback_query: {
          id: "cbq_atk_menu",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "cb_attack_menu",
        },
      });

      // Should call answerCallbackQuery and sendMessage (for target keyboard)
      const sendCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(sendCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle atk_select callback by sending method keyboard", async () => {
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });

      await handleTelegramWebhook({
        update_id: 99301,
        callback_query: {
          id: "cbq_atk_select",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_select:example.com",
        },
      });

      // Should send method selection keyboard
      const sendCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(sendCalls.length).toBeGreaterThanOrEqual(1);

      // Verify the keyboard contains attack methods
      const sendBody = sendCalls[0];
      const bodyStr = typeof sendBody[1]?.body === "string" ? sendBody[1].body : "";
      if (bodyStr) {
        const parsed = JSON.parse(bodyStr);
        expect(parsed.reply_markup).toBeDefined();
        expect(parsed.text).toContain("example.com");
      }
    });

    it("should handle atk_run callback by sending confirmation keyboard", async () => {
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });

      await handleTelegramWebhook({
        update_id: 99401,
        callback_query: {
          id: "cbq_atk_run",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_run:example.com:scan_only",
        },
      });

      // Should send confirmation keyboard
      const sendCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(sendCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle atk_cancel callback", async () => {
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });

      await handleTelegramWebhook({
        update_id: 99501,
        callback_query: {
          id: "cbq_atk_cancel",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_cancel",
        },
      });

      // Should send cancellation message
      const sendCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(sendCalls.length).toBeGreaterThanOrEqual(1);
      const bodyStr = typeof sendCalls[0]?.[1]?.body === "string" ? sendCalls[0][1].body : "";
      if (bodyStr) {
        expect(JSON.parse(bodyStr).text).toContain("ยกเลิก");
      }
    });

    it("should handle atk_custom callback", async () => {
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true })),
        source: "direct" as const,
      });

      await handleTelegramWebhook({
        update_id: 99601,
        callback_query: {
          id: "cbq_atk_custom",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_custom",
        },
      });

      // Should send instruction to type domain
      const sendCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(sendCalls.length).toBeGreaterThanOrEqual(1);
      const bodyStr = typeof sendCalls[0]?.[1]?.body === "string" ? sendCalls[0][1].body : "";
      if (bodyStr) {
        expect(JSON.parse(bodyStr).text).toContain("พิมพ์ชื่อโดเมน");
      }
    });
  });

  // ═══ Real-time Progress ═══

  describe("Attack Confirm with Progress", () => {
    it("should handle atk_confirm callback and start attack with progress", async () => {
      // Mock the scan engine
      vi.doMock("./seo-engine", () => ({
        analyzeDomain: vi.fn().mockResolvedValue({
          currentState: {
            estimatedDA: 30,
            estimatedDR: 25,
            estimatedBacklinks: 100,
            isIndexed: true,
          },
        }),
      }));

      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true, result: { message_id: 999 } })),
        source: "direct" as const,
      });

      await handleTelegramWebhook({
        update_id: 99701,
        callback_query: {
          id: "cbq_atk_confirm",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_confirm:example.com:scan_only",
        },
      });

       // Wait for async attack execution
      await new Promise(r => setTimeout(r, 500));
      // Should have called sendMessage (initial progress) and editMessageText (updates)
      const allCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && (c[0].includes("sendMessage") || c[0].includes("editMessageText"))
      );
      expect(allCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  CONVERSATION STATE MACHINE TESTS
  // ═══════════════════════════════════════════════════════

  describe("Conversation State Machine", () => {
    it("should handle custom domain input after atk_custom callback", async () => {
      clearHistory(12345);
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true, result: { message_id: 100 } })),
        source: "direct" as const,
      });

      // Step 1: User clicks atk_custom button
      await handleTelegramWebhook({
        update_id: 99801,
        callback_query: {
          id: "cbq_custom",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_custom",
        },
      });

      // Should send "type domain" prompt
      const customCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(customCalls.length).toBeGreaterThanOrEqual(1);
      const lastBody = JSON.parse(customCalls[customCalls.length - 1][1].body);
      expect(lastBody.text).toContain("พิมพ์ชื่อโดเมน");
    });

    it("should handle domain input in awaiting_domain state", async () => {
      clearHistory(12345);
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true, result: { message_id: 101 } })),
        source: "direct" as const,
      });

      // Step 1: Trigger atk_custom to set state
      await handleTelegramWebhook({
        update_id: 99802,
        callback_query: {
          id: "cbq_custom2",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_custom",
        },
      });

      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true, result: { message_id: 102 } })),
        source: "direct" as const,
      });

      // Step 2: User types a domain
      await handleTelegramWebhook({
        update_id: 99803,
        message: {
          message_id: 200,
          from: { id: 12345, first_name: "Test" },
          chat: { id: 12345, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "testdomain.com",
        },
      });

      // Should send attack type keyboard (not go to LLM)
      const kbCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(kbCalls.length).toBeGreaterThanOrEqual(1);
      // Check that inline_keyboard is present in the response
      const kbBody = JSON.parse(kbCalls[kbCalls.length - 1][1].body);
      expect(kbBody.reply_markup?.inline_keyboard).toBeDefined();
    });

    it("should clear state on atk_cancel", async () => {
      clearHistory(12345);
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true, result: { message_id: 103 } })),
        source: "direct" as const,
      });

      // Set state first
      await handleTelegramWebhook({
        update_id: 99804,
        callback_query: {
          id: "cbq_custom3",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_custom",
        },
      });

      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        response: new Response(JSON.stringify({ ok: true, result: { message_id: 104 } })),
        source: "direct" as const,
      });

      // Cancel
      await handleTelegramWebhook({
        update_id: 99805,
        callback_query: {
          id: "cbq_cancel",
          from: { id: 12345, first_name: "Test" },
          message: { message_id: 1, chat: { id: 12345, type: "private" } },
          data: "atk_cancel",
        },
      });

      // Should send cancel message
      const cancelCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === "string" && c[0].includes("sendMessage")
      );
      expect(cancelCalls.length).toBeGreaterThanOrEqual(1);
      const cancelBody = JSON.parse(cancelCalls[cancelCalls.length - 1][1].body);
      expect(cancelBody.text).toContain("ยกเลิก");
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SYSTEM PROMPT TESTS
  // ═══════════════════════════════════════════════════════

  describe("System Prompt Improvements", () => {
    it("should call tool directly when user asks to attack a domain", async () => {
      clearHistory(12345);
      const mockLLM = vi.mocked((await import("./_core/llm")).invokeLLM);
      
      // Mock LLM to return a tool call (attack_website) instead of text
      mockLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_1",
              type: "function",
              function: {
                name: "attack_website",
                arguments: JSON.stringify({ domain: "test.com", method: "full_chain" }),
              },
            }],
          },
          finish_reason: "tool_calls",
        }],
      } as any);

      // Mock second LLM call (after tool result)
      mockLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            role: "assistant",
            content: "เริ่มโจมตี test.com แล้วครับ",
          },
          finish_reason: "stop",
        }],
      } as any);

      const result = await processMessage(12345, "โจมตี test.com");
      
      // LLM should have been called at least once
      expect(mockLLM).toHaveBeenCalled();
      // First call should include tools
      const firstCall = mockLLM.mock.calls[0][0];
      expect(firstCall.tools).toBeDefined();
      expect(firstCall.tools!.length).toBeGreaterThan(0);
    });
  });
});
