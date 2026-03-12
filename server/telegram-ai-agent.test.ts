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

// Import after mocks
import {
  processMessage,
  clearHistory,
  handleTelegramWebhook,
  startTelegramPolling,
  stopTelegramPolling,
  isTelegramPollingActive,
} from "./telegram-ai-agent";
import { invokeLLM } from "./_core/llm";
import { fetchWithPoolProxy } from "./proxy-pool";

const mockInvokeLLM = vi.mocked(invokeLLM);
const mockFetch = vi.mocked(fetchWithPoolProxy);

describe("Telegram AI Chat Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(reply).toContain("ระบบ AI มีปัญหาชั่วคราว");
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
      expect(reply).toBe("ไม่ได้รับคำตอบจาก AI");
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
      expect(toolNames).toContain("run_blackhat_chain");
      expect(toolNames).toContain("check_keyword_rank");
      expect(toolNames).toContain("analyze_domain");
      expect(toolNames).toContain("redirect_takeover");
      expect(toolNames).toContain("start_agentic_attack");
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

    it("should track polling state", () => {
      expect(isTelegramPollingActive()).toBe(false);
      startTelegramPolling();
      expect(isTelegramPollingActive()).toBe(true);
      stopTelegramPolling();
      expect(isTelegramPollingActive()).toBe(false);
    });

    it("should not start multiple polling intervals", () => {
      startTelegramPolling();
      startTelegramPolling(); // second call should be no-op
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
      expect(systemMsg.content).toContain("เวลาปัจจุบัน");
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
      expect(systemMsg.content).toContain("SEO Sprints");
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

      // All 12 tools should be present
      const expectedTools = [
        "check_sprint_status",
        "check_attack_stats",
        "start_sprint",
        "run_blackhat_chain",
        "check_keyword_rank",
        "analyze_domain",
        "check_pbn_status",
        "start_agentic_attack",
        "redirect_takeover",
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

      // Check redirect_takeover has required targetUrl
      const takeover = tools.find(t => t.function.name === "redirect_takeover");
      expect(takeover).toBeDefined();
      const takeoverParams = takeover!.function.parameters as any;
      expect(takeoverParams.required).toContain("targetUrl");
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
      
      // Should contain raw tool result
      expect(reply).toContain("get_orchestrator_status");
    });
  });
});
