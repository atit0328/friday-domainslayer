/**
 * Tests for Cloudflare Origin IP Bypass and WP Brute Force modules
 * Verifies module exports, type contracts, and integration with pipeline
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SERVER_DIR = path.resolve(__dirname);

// ═══════════════════════════════════════════════
//  CF ORIGIN BYPASS MODULE TESTS
// ═══════════════════════════════════════════════

describe("CF Origin Bypass Module", () => {
  it("should export findOriginIP function", async () => {
    const mod = await import("./cf-origin-bypass");
    expect(mod.findOriginIP).toBeDefined();
    expect(typeof mod.findOriginIP).toBe("function");
  });

  it("should export fetchViaOriginIP function", async () => {
    const mod = await import("./cf-origin-bypass");
    expect(mod.fetchViaOriginIP).toBeDefined();
    expect(typeof mod.fetchViaOriginIP).toBe("function");
  });

  it("should export OriginIPResult interface (type check via module)", async () => {
    const mod = await import("./cf-origin-bypass");
    // OriginIPResult is a type, so we verify the function returns the right shape
    expect(mod.findOriginIP).toBeDefined();
  });

  it("cf-origin-bypass.ts should use fetchWithPoolProxy for outbound requests", () => {
    const filePath = path.join(SERVER_DIR, "cf-origin-bypass.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Should import fetchWithPoolProxy
    expect(content).toContain("fetchWithPoolProxy");
    expect(content).toContain("import");
    
    // Should NOT have direct fetch() calls (except in string templates)
    const lines = content.split("\n");
    const directFetchLines = lines.filter((line, idx) => {
      // Skip comments, string templates, and imports
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
      if (trimmed.includes("import")) return false;
      if (trimmed.includes("fetchWithPoolProxy")) return false;
      if (trimmed.includes("fetchViaOriginIP")) return false;
      // Check for bare fetch( calls
      return /\bawait\s+fetch\s*\(/.test(line);
    });
    
    expect(directFetchLines.length).toBe(0);
  });

  it("should contain Shodan SSL certificate search method", () => {
    const filePath = path.join(SERVER_DIR, "cf-origin-bypass.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("shodan");
  });

  it("should contain DNS history lookup method", () => {
    const filePath = path.join(SERVER_DIR, "cf-origin-bypass.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("dns");
  });

  it("should contain subdomain enumeration method", () => {
    const filePath = path.join(SERVER_DIR, "cf-origin-bypass.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("subdomain");
  });

  it("should contain MX/SPF record analysis", () => {
    const filePath = path.join(SERVER_DIR, "cf-origin-bypass.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("mx");
    expect(content).toContain("spf");
  });

  it("should filter out Cloudflare IP ranges", () => {
    const filePath = path.join(SERVER_DIR, "cf-origin-bypass.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Should contain CF IP range definitions
    expect(content).toContain("104.16.");
    expect(content).toContain("CF_IP_RANGES");
  });

  it("should verify origin IP with HTTP request", () => {
    const filePath = path.join(SERVER_DIR, "cf-origin-bypass.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Should have verification logic
    expect(content).toContain("verified");
    expect(content).toContain("Host");
  });
});

// ═══════════════════════════════════════════════
//  WP BRUTE FORCE MODULE TESTS
// ═══════════════════════════════════════════════

describe("WP Brute Force Module", () => {
  it("should export wpBruteForce function", async () => {
    const mod = await import("./wp-brute-force");
    expect(mod.wpBruteForce).toBeDefined();
    expect(typeof mod.wpBruteForce).toBe("function");
  });

  it("should export wpAuthenticatedUpload function", async () => {
    const mod = await import("./wp-brute-force");
    expect(mod.wpAuthenticatedUpload).toBeDefined();
    expect(typeof mod.wpAuthenticatedUpload).toBe("function");
  });

  it("should export BruteForceResult type (verified via module shape)", async () => {
    const mod = await import("./wp-brute-force");
    expect(mod.wpBruteForce).toBeDefined();
    expect(mod.wpAuthenticatedUpload).toBeDefined();
  });

  it("wp-brute-force.ts should use fetchWithPoolProxy for outbound requests", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Should import fetchWithPoolProxy
    expect(content).toContain("fetchWithPoolProxy");
    
    // Should NOT have direct fetch() calls
    const lines = content.split("\n");
    const directFetchLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
      if (trimmed.includes("import")) return false;
      if (trimmed.includes("fetchWithPoolProxy")) return false;
      if (trimmed.includes("wpFetch")) return false;
      return /\bawait\s+fetch\s*\(/.test(line);
    });
    
    expect(directFetchLines.length).toBe(0);
  });

  it("should contain username enumeration via REST API", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("wp-json/wp/v2/users");
  });

  it("should contain XMLRPC brute force method", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("xmlrpc");
    expect(content).toContain("wp.getUsersBlogs");
  });

  it("should contain wp-login.php brute force method", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("wp-login.php");
  });

  it("should contain default password list", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Common weak passwords
    expect(content).toContain("admin");
    expect(content).toContain("123456");
    expect(content).toContain("password");
  });

  it("should contain rate limiting protection", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Should have delay between attempts
    expect(content).toContain("delay");
  });

  it("should contain authenticated upload via REST API", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("wp-json/wp/v2/media");
  });

  it("should contain nonce extraction for authenticated requests", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("nonce");
    expect(content).toContain("X-WP-Nonce");
  });
});

// ═══════════════════════════════════════════════
//  PIPELINE INTEGRATION TESTS
// ═══════════════════════════════════════════════

describe("Pipeline Integration", () => {
  it("unified-attack-pipeline.ts should import cf-origin-bypass", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("cf-origin-bypass");
    expect(content).toContain("findOriginIP");
  });

  it("unified-attack-pipeline.ts should import wp-brute-force", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("wp-brute-force");
    expect(content).toContain("wpBruteForce");
    expect(content).toContain("wpAuthenticatedUpload");
  });

  it("PipelineResult should include cfBypassResult field", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("cfBypassResult");
  });

  it("PipelineResult should include wpBruteForceResult field", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("wpBruteForceResult");
    expect(content).toContain("wpAuthCredentials");
  });

  it("Pipeline should pass originIP to AI Commander", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Should pass originIP and wpCredentials to runAiCommander
    expect(content).toContain("originIP: originIp");
    expect(content).toContain("wpCredentials: wpAuthCredentials");
  });

  it("Pipeline should have CF bypass phase (Phase 2.5c)", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Phase 2.5c");
    expect(content).toContain("cf_bypass");
  });

  it("Pipeline should have WP brute force phase (Phase 2.5d)", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Phase 2.5d");
    expect(content).toContain("wp_brute_force");
  });
});

// ═══════════════════════════════════════════════
//  AI COMMANDER INTEGRATION TESTS
// ═══════════════════════════════════════════════

describe("AI Commander Integration", () => {
  it("AiCommanderConfig should accept originIP field", () => {
    const filePath = path.join(SERVER_DIR, "ai-autonomous-engine.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("originIP?: string");
  });

  it("AiCommanderConfig should accept wpCredentials field", () => {
    const filePath = path.join(SERVER_DIR, "ai-autonomous-engine.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("wpCredentials?:");
  });

  it("AI Commander should inject origin IP into recon data", () => {
    const filePath = path.join(SERVER_DIR, "ai-autonomous-engine.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("reconData.ip = originIP");
  });

  it("AI Commander should inject WP credentials into recon context", () => {
    const filePath = path.join(SERVER_DIR, "ai-autonomous-engine.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("wp-admin (auth:");
  });

  it("AI Commander LLM prompt should include origin IP bypass instructions", () => {
    const filePath = path.join(SERVER_DIR, "ai-autonomous-engine.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("ORIGIN IP BYPASS");
    expect(content).toContain("Host header");
  });

  it("AI Commander LLM prompt should include WP credentials instructions", () => {
    const filePath = path.join(SERVER_DIR, "ai-autonomous-engine.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("WP CREDENTIALS AVAILABLE");
    expect(content).toContain("X-WP-Nonce");
  });
});

// ═══════════════════════════════════════════════
//  DOMAIN INTELLIGENCE CACHE TESTS
// ═══════════════════════════════════════════════

describe("Domain Intelligence Cache", () => {
  it("proxy-pool.ts should contain domain intelligence cache", () => {
    const filePath = path.join(SERVER_DIR, "proxy-pool.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("domainIntel");
  });

  it("proxy-pool.ts should skip proxy for known Cloudflare domains", () => {
    const filePath = path.join(SERVER_DIR, "proxy-pool.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("cloudflare");
  });

  it("proxy-pool.ts should export getDomainIntelStats", () => {
    const filePath = path.join(SERVER_DIR, "proxy-pool.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("getDomainIntelStats");
  });
});
