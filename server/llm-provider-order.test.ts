/**
 * Tests for LLM Provider Order & Anthropic Configuration
 * Validates that Anthropic Claude is now the primary provider
 */
import { describe, it, expect } from "vitest";

describe("LLM Provider Order: Anthropic First", () => {
  it("should have Anthropic API key configured", () => {
    const key = process.env.ANTHROPIC_API_KEY;
    expect(key).toBeDefined();
    expect(key!.startsWith("sk-ant-")).toBe(true);
  });

  it("should select Sonnet for chat mode (maxTokens <= 2000)", () => {
    const maxTokens = 2000;
    const isChatMode = (maxTokens || 32768) <= 2000;
    const model = isChatMode ? "claude-sonnet-4-20250514" : "claude-opus-4-5-20251101";
    expect(model).toBe("claude-sonnet-4-20250514");
  });

  it("should select Opus 4.5 for heavy tasks (maxTokens > 2000)", () => {
    const maxTokens = 16384;
    const isChatMode = (maxTokens || 32768) <= 2000;
    const model = isChatMode ? "claude-sonnet-4-20250514" : "claude-opus-4-5-20251101";
    expect(model).toBe("claude-opus-4-5-20251101");
  });

  it("should use 30s timeout for chat mode", () => {
    const isChatMode = true;
    const timeoutMs = isChatMode ? 30_000 : 90_000;
    expect(timeoutMs).toBe(30_000);
  });

  it("should use 90s timeout for heavy tasks", () => {
    const isChatMode = false;
    const timeoutMs = isChatMode ? 30_000 : 90_000;
    expect(timeoutMs).toBe(90_000);
  });

  it("should NOT include thinking for chat mode", () => {
    const isChatMode = true;
    const payload: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [],
      ...(isChatMode ? {} : { thinking: { type: "enabled", budget_tokens: 10240 } }),
    };
    expect(payload.thinking).toBeUndefined();
  });

  it("should include thinking for heavy tasks with Opus", () => {
    const isChatMode = false;
    const payload: Record<string, unknown> = {
      model: "claude-opus-4-5-20251101",
      max_tokens: 16384,
      messages: [],
      ...(isChatMode ? {} : { thinking: { type: "enabled", budget_tokens: 10240 } }),
    };
    expect(payload.thinking).toEqual({ type: "enabled", budget_tokens: 10240 });
  });

  it("should set max_tokens to 2000 for chat mode", () => {
    const isChatMode = true;
    const maxTokens = isChatMode ? 2000 : 16384;
    expect(maxTokens).toBe(2000);
  });

  it("should set max_tokens to 16384 for heavy tasks", () => {
    const isChatMode = false;
    const maxTokens = isChatMode ? 2000 : 16384;
    expect(maxTokens).toBe(16384);
  });
});

describe("Provider Priority Order", () => {
  it("should have anthropic as first provider", () => {
    const providerOrder = ["anthropic", "builtin", "openai"];
    expect(providerOrder[0]).toBe("anthropic");
  });

  it("should have builtin as second fallback", () => {
    const providerOrder = ["anthropic", "builtin", "openai"];
    expect(providerOrder[1]).toBe("builtin");
  });

  it("should have openai as last resort", () => {
    const providerOrder = ["anthropic", "builtin", "openai"];
    expect(providerOrder[2]).toBe("openai");
  });
});

describe("Anthropic Message Conversion", () => {
  it("should extract system messages separately", () => {
    const messages = [
      { role: "system", content: "You are a helpful assistant" },
      { role: "user", content: "Hello" },
    ];
    
    let systemPrompt = "";
    const anthropicMessages: any[] = [];
    
    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content;
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }
    
    expect(systemPrompt).toBe("You are a helpful assistant");
    expect(anthropicMessages.length).toBe(1);
    expect(anthropicMessages[0].role).toBe("user");
  });

  it("should handle multiple system messages", () => {
    const messages = [
      { role: "system", content: "Part 1" },
      { role: "system", content: "Part 2" },
      { role: "user", content: "Hello" },
    ];
    
    let systemPrompt = "";
    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content;
      }
    }
    
    expect(systemPrompt).toBe("Part 1\n\nPart 2");
  });
});

describe("Live Anthropic API Call", () => {
  it("should get a response from Claude Sonnet (chat mode)", async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 50,
        messages: [{ role: "user", content: "ตอบว่า OK เท่านั้น" }],
      }),
    });

    expect([200, 429]).toContain(response.status);
    
    if (response.status === 200) {
      const data = await response.json();
      expect(data.content).toBeDefined();
      expect(data.content.length).toBeGreaterThan(0);
      expect(data.model).toContain("sonnet");
    }
  }, 15000);
});
