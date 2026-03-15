import { describe, it, expect } from "vitest";

describe("TELEGRAM_CHAT_ID_3 configuration", () => {
  it("should have TELEGRAM_CHAT_ID_3 set in environment", () => {
    const chatId3 = process.env.TELEGRAM_CHAT_ID_3;
    expect(chatId3).toBeDefined();
    expect(chatId3).not.toBe("");
  });

  it("should be a valid numeric chat ID", () => {
    const chatId3 = process.env.TELEGRAM_CHAT_ID_3!;
    const parsed = parseInt(chatId3);
    expect(isNaN(parsed)).toBe(false);
    expect(parsed).toBe(6091112509);
  });

  it("should be included in getAllowedChatIds", async () => {
    const { getAllowedChatIds } = await import("./telegram-ai-agent");
    const ids = getAllowedChatIds();
    expect(ids).toContain(6091112509);
  });
});
