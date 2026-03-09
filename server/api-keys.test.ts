import { describe, expect, it } from "vitest";

describe("API Keys Validation", () => {
  it("Shodan API key is valid", async () => {
    const key = process.env.SHODAN_API_KEY;
    expect(key).toBeTruthy();
    const res = await fetch(`https://api.shodan.io/api-info?key=${key}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("query_credits");
  });

  it("SerpAPI key is valid", async () => {
    const key = process.env.SERPAPI_KEY_DEV;
    expect(key).toBeTruthy();
    const res = await fetch(`https://serpapi.com/account.json?api_key=${key}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("account_email");
  });

  it("Moz API credentials are valid", async () => {
    const accessId = process.env.MOZ_ACCESS_ID;
    const secretKey = process.env.MOZ_SECRET_KEY;
    expect(accessId).toBeTruthy();
    expect(secretKey).toBeTruthy();
    // Moz v2 API uses basic auth
    const auth = Buffer.from(`${accessId}:${secretKey}`).toString("base64");
    const res = await fetch("https://lsapi.seomoz.com/v2/url_metrics", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targets: ["moz.com"],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("results");
  });

  it("Telegram Bot Token is valid", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token).toBeTruthy();
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.result).toHaveProperty("username");
  });

  it("Telegram Chat ID is set", () => {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    expect(chatId).toBeTruthy();
    expect(Number(chatId)).toBeGreaterThan(0);
  });
});
