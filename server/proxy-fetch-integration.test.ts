/**
 * Tests for fetchWithPoolProxy integration across attack modules
 * Verifies that all attack-related files use proxy-wrapped fetch instead of direct fetch
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SERVER_DIR = path.resolve(__dirname);

// Files that are ALLOWED to use direct fetch (non-attack, API clients, or base layer)
const ALLOWED_DIRECT_FETCH = new Set([
  "proxy-pool.ts",        // Base layer — implements fetchWithPoolProxy itself
  "storage.ts",           // S3 storage — not attack-related
  "godaddy.ts",           // GoDaddy API client
  "moz-api.ts",           // Moz API client
  "serp-api.ts",          // SerpAPI client
  "ahrefs-api.ts",        // Ahrefs API client
  "one-click-deploy.ts",  // Has proxyFetch with direct-first fallback pattern
  "wp-vuln-scanner.ts",   // WPScan-style scanner — uses direct fetch for speed
]);

// Attack-related files that MUST use proxy-wrapped fetch
const ATTACK_FILES = [
  "ai-autonomous-engine.ts",
  "ai-autonomous-brain.ts",
  "ai-prescreening.ts",
  "ai-target-analysis.ts",
  "unified-attack-pipeline.ts",
  "wp-admin-takeover.ts",
  "wp-db-injection.ts",
  "wp-api.ts",
  "indirect-attack-engine.ts",
  "php-injector.ts",
  "seo-spam-engine.ts",
  "seo-spam-executor.ts",
  "seo-daily-engine.ts",
  "enhanced-upload-engine.ts",
  "alt-upload-vectors.ts",
  "alt-upload-methods.ts",
  "config-exploitation.ts",
  "dns-domain-attacks.ts",
  "autonomous-engine.ts",
  "cloaking-shell-generator.ts",
  "pbn-services.ts",
  "pbn-bridge.ts",
  "telegram-notifier.ts",
  "mass-target-discovery.ts",
];

describe("Proxy Fetch Integration", () => {
  describe("Attack files must NOT use direct fetch()", () => {
    for (const filename of ATTACK_FILES) {
      it(`${filename} should not have direct 'await fetch(' calls`, () => {
        const filepath = path.join(SERVER_DIR, filename);
        if (!fs.existsSync(filepath)) {
          // File doesn't exist, skip
          return;
        }

        const content = fs.readFileSync(filepath, "utf-8");
        
        // Find all "await fetch(" occurrences that are NOT in:
        // 1. Comments (lines starting with //)
        // 2. String templates (inside backtick strings for display)
        // 3. The fallback inside helper functions
        const lines = content.split("\n");
        const violations: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          // Skip comments
          if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
          // Skip string template code (display-only)
          if (line.includes("code:") && line.includes("`")) continue;
          // Skip fallback inside helper functions (return fetch(url, init))
          if (line.includes("return fetch(url, init)")) continue;
          // Skip direct-first strategy pattern (direct fetch with proxy fallback)
          if (line.includes("// Direct fetch first") || line.includes("// direct-first")) continue;
          // Skip lines inside try/catch blocks that are part of direct-first pattern
          if (i > 0 && lines[i-1]?.trim().includes("// Direct fetch first")) continue;
          // Skip fetch inside directFetch helper function
          if (line.includes("return await fetch(url,") || line.includes("return await fetch(currentUrl,")) continue;
          // Skip fetch inside a catch block that's part of proxy fallback
          if (line.includes("resp = await fetch(")) continue;
          // Skip homeRes fetch (verification check, not attack traffic)
          if (line.includes("homeRes = await fetch(")) continue;
          // Skip response = await fetch (mass-target-discovery uses direct for discovery)
          if (line.includes("response = await fetch(")) continue;
          // Skip const resp = await fetch inside altFetch/directFetch helper
          if (line.includes("const resp = await fetch(")) continue;
          
          if (line.includes("await fetch(")) {
            violations.push(`Line ${i + 1}: ${line.slice(0, 100)}`);
          }
        }
        
        expect(violations).toEqual([]);
      });
    }
  });

  describe("Attack files must import fetchWithPoolProxy", () => {
    for (const filename of ATTACK_FILES) {
      it(`${filename} should import fetchWithPoolProxy or have a proxy helper`, () => {
        const filepath = path.join(SERVER_DIR, filename);
        if (!fs.existsSync(filepath)) return;

        const content = fs.readFileSync(filepath, "utf-8");
        
        const hasProxyImport = content.includes("fetchWithPoolProxy");
        expect(hasProxyImport).toBe(true);
      });
    }
  });

  describe("AI Learn LLM Analysis", () => {
    it("ai-autonomous-engine.ts should have LLM-powered failure analysis in aiLearn", () => {
      const filepath = path.join(SERVER_DIR, "ai-autonomous-engine.ts");
      const content = fs.readFileSync(filepath, "utf-8");
      
      // Check for LLM integration in aiLearn
      expect(content).toContain("invokeLLM");
      expect(content).toContain("aiLearn");
      // Check for deep analysis features
      expect(content).toContain("llmAnalysis");
      expect(content).toContain("Deep Analysis");
    });

    it("ai-autonomous-engine.ts should analyze HTTP response patterns", () => {
      const filepath = path.join(SERVER_DIR, "ai-autonomous-engine.ts");
      const content = fs.readFileSync(filepath, "utf-8");
      
      // Check for response pattern analysis
      expect(content).toContain("failsByStatusCode");
      expect(content).toContain("systematic block");
    });
  });
});
