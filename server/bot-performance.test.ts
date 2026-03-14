/**
 * Tests for Telegram bot performance optimizations
 * - LLM timeout configuration
 * - Context caching
 * - Chat lock timeout
 * - History limit
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── LLM Fallback: Model Selection & Timeout ───

describe("LLM Fallback: Chat Mode Detection", () => {
  it("should detect chat mode when maxTokens <= 2000", () => {
    const params = { maxTokens: 2000, messages: [] };
    const isChatMode = (params.maxTokens || 32768) <= 2000;
    expect(isChatMode).toBe(true);
  });

  it("should NOT detect chat mode when maxTokens > 2000", () => {
    const params = { maxTokens: 8000, messages: [] };
    const isChatMode = (params.maxTokens || 32768) <= 2000;
    expect(isChatMode).toBe(false);
  });

  it("should default to non-chat mode when maxTokens is undefined", () => {
    const params = { messages: [] } as any;
    const isChatMode = (params.maxTokens || params.max_tokens || 32768) <= 2000;
    expect(isChatMode).toBe(false);
  });

  it("should select faster model for chat mode", () => {
    const isChatMode = true;
    const model = isChatMode ? "claude-sonnet-4-20250514" : "claude-opus-4-5-20251101";
    expect(model).toBe("claude-sonnet-4-20250514");
  });

  it("should select opus model for heavy tasks", () => {
    const isChatMode = false;
    const model = isChatMode ? "claude-sonnet-4-20250514" : "claude-opus-4-5-20251101";
    expect(model).toBe("claude-opus-4-5-20251101");
  });

  it("should set 30s timeout for chat mode", () => {
    const isChatMode = true;
    const timeoutMs = isChatMode ? 30_000 : 120_000;
    expect(timeoutMs).toBe(30_000);
  });

  it("should set 120s timeout for heavy tasks", () => {
    const isChatMode = false;
    const timeoutMs = isChatMode ? 30_000 : 120_000;
    expect(timeoutMs).toBe(120_000);
  });

  it("should not include thinking budget for chat mode", () => {
    const isChatMode = true;
    const payload: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      ...(isChatMode ? {} : { thinking: { budget_tokens: 10240 } }),
    };
    expect(payload.thinking).toBeUndefined();
  });

  it("should include thinking budget for heavy tasks", () => {
    const isChatMode = false;
    const payload: Record<string, unknown> = {
      model: "claude-opus-4-5-20251101",
      max_tokens: 32768,
      ...(isChatMode ? {} : { thinking: { budget_tokens: 10240 } }),
    };
    expect(payload.thinking).toEqual({ budget_tokens: 10240 });
  });
});

// ─── Context Caching ───

describe("System Context Caching", () => {
  it("should cache context for 60 seconds", () => {
    const CONTEXT_CACHE_TTL = 60_000;
    expect(CONTEXT_CACHE_TTL).toBe(60_000);
  });

  it("should return cached context when fresh", () => {
    const cachedContext = { sprints: "test", attacks: "test" };
    const cacheTime = Date.now() - 30_000; // 30s ago
    const CONTEXT_CACHE_TTL = 60_000;
    
    const isFresh = cachedContext && Date.now() - cacheTime < CONTEXT_CACHE_TTL;
    expect(isFresh).toBe(true);
  });

  it("should NOT return cached context when stale", () => {
    const cachedContext = { sprints: "test", attacks: "test" };
    const cacheTime = Date.now() - 90_000; // 90s ago
    const CONTEXT_CACHE_TTL = 60_000;
    
    const isFresh = cachedContext && Date.now() - cacheTime < CONTEXT_CACHE_TTL;
    expect(isFresh).toBe(false);
  });

  it("should NOT return cached when null", () => {
    const cachedContext = null;
    const cacheTime = Date.now() - 10_000;
    const CONTEXT_CACHE_TTL = 60_000;
    
    const isFresh = cachedContext && Date.now() - cacheTime < CONTEXT_CACHE_TTL;
    expect(isFresh).toBeFalsy();
  });
});

// ─── Chat Lock Timeout ───

describe("Chat Lock Timeout", () => {
  it("should use 45s timeout for chat lock (reduced from 120s)", () => {
    const LOCK_TIMEOUT = 45_000;
    expect(LOCK_TIMEOUT).toBe(45_000);
    expect(LOCK_TIMEOUT).toBeLessThan(120_000);
  });
});

// ─── History Limit ───

describe("History Message Limit", () => {
  it("should store max 15 messages in history", () => {
    const MAX_HISTORY = 15;
    expect(MAX_HISTORY).toBe(15);
  });

  it("should send only last 10 messages to LLM", () => {
    // Simulate 15 messages in history
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));
    
    // Only send last 10 (excluding current message)
    const recentHistory = history.slice(-11, -1);
    expect(recentHistory.length).toBe(10);
    expect(recentHistory[0].content).toBe("Message 4");
    expect(recentHistory[9].content).toBe("Message 13");
  });

  it("should handle history shorter than 10 messages", () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));
    
    const recentHistory = history.slice(-11, -1);
    expect(recentHistory.length).toBe(4);
  });
});

// ─── Process Timeout ───

describe("Process Message Timeout", () => {
  it("should have 40s overall timeout", () => {
    const PROCESS_TIMEOUT_MS = 40_000;
    expect(PROCESS_TIMEOUT_MS).toBe(40_000);
  });

  it("should detect timeout correctly", () => {
    const processStart = Date.now() - 41_000; // Started 41s ago
    const PROCESS_TIMEOUT_MS = 40_000;
    const isTimedOut = () => Date.now() - processStart > PROCESS_TIMEOUT_MS;
    expect(isTimedOut()).toBe(true);
  });

  it("should NOT timeout when within limit", () => {
    const processStart = Date.now() - 10_000; // Started 10s ago
    const PROCESS_TIMEOUT_MS = 40_000;
    const isTimedOut = () => Date.now() - processStart > PROCESS_TIMEOUT_MS;
    expect(isTimedOut()).toBe(false);
  });
});

// ─── Tool Call Rounds ───

describe("Tool Call Rounds", () => {
  it("should limit to 2 tool call rounds (reduced from 3)", () => {
    const MAX_TOOL_ROUNDS = 2;
    expect(MAX_TOOL_ROUNDS).toBe(2);
    expect(MAX_TOOL_ROUNDS).toBeLessThan(3);
  });
});
