/**
 * Test to validate the Anthropic API key works
 */
import { describe, it, expect } from "vitest";

describe("Anthropic API Key Validation", () => {
  it("should have ANTHROPIC_API_KEY set", () => {
    const key = process.env.ANTHROPIC_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(10);
    expect(key!.startsWith("sk-ant-")).toBe(true);
  });

  it("should successfully call Anthropic API", async () => {
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
        max_tokens: 10,
        messages: [{ role: "user", content: "Say hi" }],
      }),
    });

    // 200 = success, 429 = rate limited (key is valid but rate limited)
    expect([200, 429]).toContain(response.status);
    
    if (response.status === 200) {
      const data = await response.json();
      expect(data.content).toBeDefined();
      expect(data.content.length).toBeGreaterThan(0);
    }
  }, 15000);
});
