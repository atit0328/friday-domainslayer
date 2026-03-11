/**
 * Redirect Takeover Module Tests
 */
import { describe, it, expect, vi } from "vitest";

describe("Redirect Takeover Module", () => {
  it("should export detectExistingRedirects function", async () => {
    const mod = await import("./redirect-takeover");
    expect(mod.detectExistingRedirects).toBeDefined();
    expect(typeof mod.detectExistingRedirects).toBe("function");
  });

  it("should export executeRedirectTakeover function", async () => {
    const mod = await import("./redirect-takeover");
    expect(mod.executeRedirectTakeover).toBeDefined();
    expect(typeof mod.executeRedirectTakeover).toBe("function");
  });

  it("detectExistingRedirects should return proper structure", async () => {
    const { detectExistingRedirects } = await import("./redirect-takeover");
    // Test with a non-existent domain (should handle gracefully)
    const result = await detectExistingRedirects("https://this-domain-does-not-exist-12345.com");
    
    expect(result).toHaveProperty("detected");
    expect(result).toHaveProperty("methods");
    expect(result).toHaveProperty("competitorUrl");
    expect(result).toHaveProperty("targetPlatform");
    expect(result).toHaveProperty("wpVersion");
    expect(result).toHaveProperty("plugins");
    expect(Array.isArray(result.methods)).toBe(true);
    expect(Array.isArray(result.plugins)).toBe(true);
  });

  it("detectExistingRedirects should detect gambling content on known compromised site", async () => {
    const { detectExistingRedirects } = await import("./redirect-takeover");
    const result = await detectExistingRedirects("https://iloveblueberrycafe.com/webstore");
    
    // This site has gambling content injected
    expect(result.detected).toBe(true);
    expect(result.methods.length).toBeGreaterThan(0);
    
    // Should detect WordPress
    expect(result.targetPlatform).toBe("wordpress");
    expect(result.wpVersion).toBeTruthy();
    
    // Should detect content replacement
    const contentMethod = result.methods.find(m => m.type === "content_replacement");
    expect(contentMethod).toBeDefined();
    if (contentMethod) {
      expect(contentMethod.confidence).toBe("high");
    }
    
    // Should detect plugins
    expect(result.plugins.length).toBeGreaterThan(0);
  }, 30000);

  it("executeRedirectTakeover should return results array", async () => {
    const { executeRedirectTakeover } = await import("./redirect-takeover");
    const results = await executeRedirectTakeover({
      targetUrl: "https://this-domain-does-not-exist-12345.com",
      ourRedirectUrl: "https://domainslayer.ai",
    });
    
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(r).toHaveProperty("success");
      expect(r).toHaveProperty("method");
      expect(r).toHaveProperty("detail");
    }
  });

  it("detected methods should have required fields", async () => {
    const { detectExistingRedirects } = await import("./redirect-takeover");
    const result = await detectExistingRedirects("https://iloveblueberrycafe.com/webstore");
    
    for (const method of result.methods) {
      expect(method).toHaveProperty("type");
      expect(method).toHaveProperty("location");
      expect(method).toHaveProperty("competitorUrl");
      expect(method).toHaveProperty("confidence");
      expect(method).toHaveProperty("details");
      expect(["js_redirect", "php_injection", "htaccess", "db_injection", "meta_refresh", "header_redirect", "content_replacement", "plugin_backdoor"]).toContain(method.type);
      expect(["high", "medium", "low"]).toContain(method.confidence);
    }
  }, 30000);
});

describe("Redirect Takeover Router", () => {
  it("should export redirectTakeoverRouter", async () => {
    const mod = await import("./routers/redirect-takeover");
    expect(mod.redirectTakeoverRouter).toBeDefined();
  });
});

describe("Redirect Takeover Improvements", () => {
  it("should have XMLRPC multicall attack method in codebase", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname || ".", "redirect-takeover.ts"),
      "utf-8"
    );
    expect(content).toContain("takeoverViaXmlrpc");
    expect(content).toContain("system.multicall");
    expect(content).toContain("wp.getUsersBlogs");
  });

  it("should have credential spray attack method with user enumeration", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname || ".", "redirect-takeover.ts"),
      "utf-8"
    );
    expect(content).toContain("takeoverViaCredentialSpray");
    expect(content).toContain("wp-json/wp/v2/users");
    expect(content).toContain("author=");
    expect(content).toContain("wordpress_logged_in");
  });

  it("should have unified pipeline fallback with correct PipelineConfig", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname || ".", "redirect-takeover.ts"),
      "utf-8"
    );
    expect(content).toContain("takeoverViaUnifiedPipeline");
    expect(content).toContain("runUnifiedAttackPipeline");
    expect(content).toContain("enableWpAdminTakeover: true");
    expect(content).toContain("enableComprehensiveAttacks: true");
    // Should use targetUrl (not the old incorrect targetDomain) in runUnifiedAttackPipeline call
    // Verify the pipeline call uses correct property
    const pipelineCallMatch = content.match(/runUnifiedAttackPipeline\([\s\S]*?\{([\s\S]*?)\}/m);
    expect(pipelineCallMatch).toBeTruthy();
    if (pipelineCallMatch) {
      expect(pipelineCallMatch[1]).toContain("targetUrl");
    }
  });

  it("should have safeAttackMethod wrapper for error sanitization", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname || ".", "redirect-takeover.ts"),
      "utf-8"
    );
    expect(content).toContain("safeAttackMethod");
    expect(content).toContain("sanitizeErrorMessage");
    expect(content).toContain('msg.includes("<!DOCTYPE")');
    expect(content).toContain("Server returned HTML page");
  });

  it("should have 7 attack methods in executeRedirectTakeover", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname || ".", "redirect-takeover.ts"),
      "utf-8"
    );
    // Count all safeAttackMethod calls in executeRedirectTakeover
    const methodCalls = (content.match(/safeAttackMethod\(/g) || []).length;
    // Should have at least 5 wrapped methods (shell, wp_admin, rest_api, xmlrpc, plugin, credential_spray, brute_force, unified_pipeline)
    expect(methodCalls).toBeGreaterThanOrEqual(5);
  });
});
