import { describe, expect, it } from "vitest";
import { createWPClient, type WordPressAPI, type WPUpdateResult } from "./wp-api";

describe("createWPClient", () => {
  it("creates a client with all expected methods", () => {
    const client = createWPClient({
      siteUrl: "https://example.com",
      username: "admin",
      appPassword: "xxxx xxxx xxxx xxxx",
    });

    expect(client).toBeDefined();
    expect(typeof client.testConnection).toBe("function");
    expect(typeof client.getPosts).toBe("function");
    expect(typeof client.getPages).toBe("function");
    expect(typeof client.updatePost).toBe("function");
    expect(typeof client.createPost).toBe("function");
    expect(typeof client.updateSiteBranding).toBe("function");
    expect(typeof client.auditAllContent).toBe("function");
    expect(typeof client.injectSchemaMarkup).toBe("function");
    expect(typeof client.addInternalLinks).toBe("function");
    expect(typeof client.fixImageAltTexts).toBe("function");
  });

  it("handles siteUrl with trailing slash", () => {
    const client = createWPClient({
      siteUrl: "https://example.com/",
      username: "admin",
      appPassword: "xxxx",
    });
    expect(client).toBeDefined();
  });

  it("handles siteUrl without protocol", () => {
    // The client should still be created even if the URL format is unusual
    const client = createWPClient({
      siteUrl: "example.com",
      username: "admin",
      appPassword: "xxxx",
    });
    expect(client).toBeDefined();
  });
});

describe("WPUpdateResult type", () => {
  it("can construct a success result", () => {
    const result: WPUpdateResult = {
      success: true,
      action: "update_title",
      detail: "Updated title for post 123",
    };
    expect(result.success).toBe(true);
    expect(result.action).toBe("update_title");
    expect(result.detail).toBeTruthy();
  });

  it("can construct a failure result with error", () => {
    const result: WPUpdateResult = {
      success: false,
      action: "update_meta",
      detail: "Failed to update meta",
      error: "401 Unauthorized",
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe("401 Unauthorized");
  });
});
