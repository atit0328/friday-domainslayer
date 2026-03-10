/**
 * LLM Fallback System Tests
 * Tests both API key validation and the fallback module exports/behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── API Key Validation Tests (live) ───
describe("LLM API Key Validation", () => {
  it("should have OPENAI_API_KEY configured", () => {
    const key = process.env.OPENAI_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(10);
    expect(key!.startsWith("sk-")).toBe(true);
  });

  it("should have ANTHROPIC_API_KEY configured", () => {
    const key = process.env.ANTHROPIC_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(10);
    expect(key!.startsWith("sk-ant-")).toBe(true);
  });

  it("should validate OpenAI API key with a lightweight call", async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return; // Skip if not configured
    
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${key}` },
    });
    // 200 = valid key, 401 = invalid key
    expect(response.status).toBe(200);
  });

  it("should validate Anthropic API key with a lightweight call", async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return; // Skip if not configured

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    // 200 = valid key, 401 = invalid key, 529 = overloaded (but key is valid)
    expect([200, 529]).toContain(response.status);
  });
});

// ─── Module Export Tests ───
describe("LLM Fallback Module Exports", () => {
  it("should export invokeLLMWithFallback function", async () => {
    const mod = await import("./llm-fallback");
    expect(mod.invokeLLMWithFallback).toBeDefined();
    expect(typeof mod.invokeLLMWithFallback).toBe("function");
  });

  it("should export getLLMProviderStatus function", async () => {
    const mod = await import("./llm-fallback");
    expect(mod.getLLMProviderStatus).toBeDefined();
    expect(typeof mod.getLLMProviderStatus).toBe("function");
  });

  it("should export resetProviderHealth function", async () => {
    const mod = await import("./llm-fallback");
    expect(mod.resetProviderHealth).toBeDefined();
    expect(typeof mod.resetProviderHealth).toBe("function");
  });

  it("should export getActiveProvider function", async () => {
    const mod = await import("./llm-fallback");
    expect(mod.getActiveProvider).toBeDefined();
    expect(typeof mod.getActiveProvider).toBe("function");
  });
});

// ─── Provider Status Tests ───
describe("LLM Provider Status", () => {
  it("getLLMProviderStatus should return array of 3 providers", async () => {
    const { getLLMProviderStatus } = await import("./llm-fallback");
    const status = getLLMProviderStatus();
    expect(Array.isArray(status)).toBe(true);
    expect(status.length).toBe(3);
    
    const names = status.map(s => s.name);
    expect(names).toContain("builtin");
    expect(names).toContain("openai");
    expect(names).toContain("anthropic");
  });

  it("each provider should have required fields", async () => {
    const { getLLMProviderStatus } = await import("./llm-fallback");
    const status = getLLMProviderStatus();
    
    for (const provider of status) {
      expect(provider).toHaveProperty("name");
      expect(provider).toHaveProperty("label");
      expect(provider).toHaveProperty("isConfigured");
      expect(provider).toHaveProperty("isHealthy");
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.label).toBe("string");
      expect(typeof provider.isConfigured).toBe("boolean");
      expect(typeof provider.isHealthy).toBe("boolean");
    }
  });

  it("getActiveProvider should return a valid provider name or null", async () => {
    const { getActiveProvider } = await import("./llm-fallback");
    const active = getActiveProvider();
    expect(["builtin", "openai", "anthropic", null]).toContain(active);
  });

  it("builtin provider should be available when BUILT_IN_FORGE_API_KEY is set", async () => {
    const { getLLMProviderStatus } = await import("./llm-fallback");
    const status = getLLMProviderStatus();
    const builtin = status.find(s => s.name === "builtin");
    
    if (process.env.BUILT_IN_FORGE_API_KEY) {
      expect(builtin?.isConfigured).toBe(true);
    }
  });
});

// ─── Health Reset Tests ───
describe("LLM Provider Health Reset", () => {
  it("resetProviderHealth should not throw when called without args", async () => {
    const { resetProviderHealth } = await import("./llm-fallback");
    expect(() => resetProviderHealth()).not.toThrow();
  });

  it("resetProviderHealth should not throw for specific providers", async () => {
    const { resetProviderHealth } = await import("./llm-fallback");
    expect(() => resetProviderHealth("builtin")).not.toThrow();
    expect(() => resetProviderHealth("openai")).not.toThrow();
    expect(() => resetProviderHealth("anthropic")).not.toThrow();
  });

  it("after reset, all providers should be healthy", async () => {
    const { resetProviderHealth, getLLMProviderStatus } = await import("./llm-fallback");
    resetProviderHealth();
    const status = getLLMProviderStatus();
    for (const provider of status) {
      if (provider.isConfigured) {
        expect(provider.isHealthy).toBe(true);
      }
    }
  });
});

// ─── Router Tests ───
describe("LLM Provider Router", () => {
  it("should export llmProviderRouter", async () => {
    const mod = await import("./routers/llm-provider");
    expect(mod.llmProviderRouter).toBeDefined();
  });
});
