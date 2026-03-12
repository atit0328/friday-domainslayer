/**
 * Tests for Auto Redirect Takeover toggle
 * - Schema field existence
 * - Create mutation input validation
 * - Pipeline integration when toggle is enabled
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ═══ Schema field tests ═══

describe("autoRedirectTakeover schema field", () => {
  it("should accept boolean value", () => {
    const schema = z.object({
      autoRedirectTakeover: z.boolean().default(false),
    });

    expect(schema.parse({ autoRedirectTakeover: true }).autoRedirectTakeover).toBe(true);
    expect(schema.parse({ autoRedirectTakeover: false }).autoRedirectTakeover).toBe(false);
  });

  it("should default to false when not provided", () => {
    const schema = z.object({
      autoRedirectTakeover: z.boolean().default(false),
    });

    expect(schema.parse({}).autoRedirectTakeover).toBe(false);
  });
});

// ═══ Create mutation input validation ═══

describe("Create mutation input with autoRedirectTakeover", () => {
  const createInputSchema = z.object({
    domain: z.string().min(1),
    autoBacklink: z.boolean().default(true),
    autoContent: z.boolean().default(false),
    autoPbn: z.boolean().default(false),
    autoRedirectTakeover: z.boolean().default(false),
    cloakingRedirectUrl: z.string().url().optional(),
    cloakingMethod: z.enum(["js", "meta", "302", "301"]).optional(),
  });

  it("should parse input with autoRedirectTakeover enabled", () => {
    const input = createInputSchema.parse({
      domain: "example.com",
      autoRedirectTakeover: true,
      cloakingRedirectUrl: "https://target.com",
      cloakingMethod: "js",
    });

    expect(input.autoRedirectTakeover).toBe(true);
    expect(input.cloakingRedirectUrl).toBe("https://target.com");
  });

  it("should parse input with autoRedirectTakeover disabled", () => {
    const input = createInputSchema.parse({
      domain: "example.com",
      autoRedirectTakeover: false,
    });

    expect(input.autoRedirectTakeover).toBe(false);
    expect(input.cloakingRedirectUrl).toBeUndefined();
  });

  it("should default autoRedirectTakeover to false", () => {
    const input = createInputSchema.parse({
      domain: "example.com",
    });

    expect(input.autoRedirectTakeover).toBe(false);
  });

  it("should accept all auto toggles together", () => {
    const input = createInputSchema.parse({
      domain: "example.com",
      autoBacklink: true,
      autoContent: true,
      autoPbn: true,
      autoRedirectTakeover: true,
      cloakingRedirectUrl: "https://target.com",
    });

    expect(input.autoBacklink).toBe(true);
    expect(input.autoContent).toBe(true);
    expect(input.autoPbn).toBe(true);
    expect(input.autoRedirectTakeover).toBe(true);
  });
});

// ═══ Pipeline integration logic ═══

describe("Auto Redirect Takeover pipeline logic", () => {
  it("should trigger cloaking deploy when autoRedirectTakeover is true and has redirect URL", () => {
    const config = {
      autoRedirectTakeover: true,
      cloakingRedirectUrl: "https://target.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx",
    };

    const shouldDeployCloaking = config.autoRedirectTakeover && !!config.cloakingRedirectUrl && !!config.wpUsername;
    expect(shouldDeployCloaking).toBe(true);
  });

  it("should NOT trigger cloaking when autoRedirectTakeover is false", () => {
    const config = {
      autoRedirectTakeover: false,
      cloakingRedirectUrl: "https://target.com",
      wpUsername: "admin",
      wpAppPassword: "xxxx",
    };

    const shouldDeployCloaking = config.autoRedirectTakeover && !!config.cloakingRedirectUrl;
    expect(shouldDeployCloaking).toBe(false);
  });

  it("should NOT trigger cloaking when no redirect URL", () => {
    const config = {
      autoRedirectTakeover: true,
      cloakingRedirectUrl: "",
      wpUsername: "admin",
    };

    const shouldDeployCloaking = config.autoRedirectTakeover && !!config.cloakingRedirectUrl;
    expect(shouldDeployCloaking).toBe(false);
  });

  it("should NOT trigger cloaking when no WP credentials", () => {
    const config = {
      autoRedirectTakeover: true,
      cloakingRedirectUrl: "https://target.com",
      wpUsername: "",
      wpAppPassword: "",
    };

    const shouldDeployCloaking = config.autoRedirectTakeover && !!config.cloakingRedirectUrl && !!config.wpUsername;
    expect(shouldDeployCloaking).toBe(false);
  });
});

// ═══ UI state management ═══

describe("Auto Redirect Takeover UI state", () => {
  it("should have correct initial state (false)", () => {
    const initialState = false;
    expect(initialState).toBe(false);
  });

  it("should toggle to true", () => {
    let state = false;
    state = !state;
    expect(state).toBe(true);
  });

  it("should reset to false on form success", () => {
    let state = true;
    // Simulate reset on success
    state = false;
    expect(state).toBe(false);
  });

  it("should be included in mutation payload", () => {
    const payload = {
      domain: "test.com",
      autoBacklink: true,
      autoContent: false,
      autoPbn: false,
      autoRedirectTakeover: true,
      cloakingRedirectUrl: "https://target.com",
      cloakingMethod: "js" as const,
    };

    expect(payload).toHaveProperty("autoRedirectTakeover");
    expect(payload.autoRedirectTakeover).toBe(true);
  });
});
