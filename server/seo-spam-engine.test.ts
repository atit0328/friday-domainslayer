import { describe, it, expect } from "vitest";
import {
  discoverTargetsShodan,
  generateProxyRotation,
  generateShellPayloads,
  generateWafBypassPayloads,
  generateSeoSpamPayloads,
  generateRedirectPayloads,
  runPhase1,
  runPhase2,
  runPhase3,
  runPhase4,
  runPhase5,
  runPhase6,
  runSingleSpamPhase,
  runSingleSpamCapability,
} from "./seo-spam-engine";

const TEST_DOMAIN = "https://example.com";
const TEST_REDIRECT = "https://spam.example.com";

describe("SEO SPAM Engine", () => {
  // ─── Phase 1: Target Discovery ───
  describe("Phase 1: Target Discovery", () => {
    it("should generate Shodan + Google Dork payloads", () => {
      const payloads = discoverTargetsShodan(TEST_DOMAIN);
      expect(payloads.length).toBeGreaterThan(0);
      const types = payloads.map(p => p.type);
      expect(types).toContain("shodan_search");
      expect(types).toContain("google_dork");
      expect(types).toContain("path_enumeration");
    });

    it("should include domain in Shodan queries", () => {
      const payloads = discoverTargetsShodan(TEST_DOMAIN);
      const shodanPayloads = payloads.filter(p => p.type === "shodan_search");
      expect(shodanPayloads.length).toBeGreaterThan(0);
      shodanPayloads.forEach(p => {
        expect(p.code).toContain("example.com");
      });
    });

    it("runPhase1 should return correct phase structure", () => {
      const result = runPhase1(TEST_DOMAIN);
      expect(result.phase).toBe(1);
      expect(result.name).toBe("Target Discovery");
      expect(result.payloads.length).toBeGreaterThan(0);
      expect(result.stats.shodanQueries).toBeGreaterThan(0);
      expect(result.stats.googleDorks).toBeGreaterThan(0);
    });
  });

  // ─── Phase 2: Proxy Rotation ───
  describe("Phase 2: Proxy Rotation", () => {
    it("should generate proxy rotation payloads", () => {
      const payloads = generateProxyRotation();
      expect(payloads.length).toBe(3);
      const types = payloads.map(p => p.type);
      expect(types).toContain("proxy_rotation");
      expect(types).toContain("proxy_chain");
      expect(types).toContain("ua_rotation");
    });

    it("runPhase2 should return correct structure", () => {
      const result = runPhase2();
      expect(result.phase).toBe(2);
      expect(result.name).toBe("Proxy Rotation & Anonymization");
      expect(result.stats.totalProxies).toBeGreaterThan(0);
    });
  });

  // ─── Phase 3: Shell Generation ───
  describe("Phase 3: Shell Generation", () => {
    it("should generate multiple shell variants", () => {
      const payloads = generateShellPayloads(TEST_DOMAIN);
      expect(payloads.length).toBe(4);
      const types = payloads.map(p => p.type);
      expect(types).toContain("php_shell_basic");
      expect(types).toContain("php_shell_polymorphic");
      expect(types).toContain("htaccess_backdoor");
      expect(types).toContain("filename_bypass");
    });

    it("should include password in shell payloads", () => {
      const payloads = generateShellPayloads(TEST_DOMAIN);
      const shellPayloads = payloads.filter(p => p.type.startsWith("php_shell"));
      shellPayloads.forEach(p => {
        expect(p.password).toBeDefined();
        expect(typeof p.password).toBe("string");
        expect((p.password as string).length).toBeGreaterThan(5);
      });
    });

    it("should have high risk level for shells", () => {
      const result = runPhase3(TEST_DOMAIN);
      expect(result.riskLevel).toBeGreaterThanOrEqual(8);
    });
  });

  // ─── Phase 4: WAF Bypass ───
  describe("Phase 4: WAF Bypass + Upload", () => {
    it("should generate WAF bypass payloads", () => {
      const payloads = generateWafBypassPayloads(TEST_DOMAIN);
      expect(payloads.length).toBe(4);
      const types = payloads.map(p => p.type);
      expect(types).toContain("waf_header_bypass");
      expect(types).toContain("content_type_confusion");
      expect(types).toContain("chunked_bypass");
      expect(types).toContain("path_traversal");
    });

    it("should include GIF89a and PNG header techniques", () => {
      const payloads = generateWafBypassPayloads(TEST_DOMAIN);
      const ctPayload = payloads.find(p => p.type === "content_type_confusion");
      expect(ctPayload).toBeDefined();
      expect(ctPayload!.code).toContain("GIF89a");
      expect(ctPayload!.features).toContain("magic_bytes");
    });
  });

  // ─── Phase 5: SEO Spam Injection ───
  describe("Phase 5: SEO Spam Injection", () => {
    it("should generate all spam injection types", () => {
      const payloads = generateSeoSpamPayloads(TEST_DOMAIN, TEST_REDIRECT);
      expect(payloads.length).toBe(5);
      const types = payloads.map(p => p.type);
      expect(types).toContain("meta_tag_spam");
      expect(types).toContain("hidden_links");
      expect(types).toContain("doorway_content");
      expect(types).toContain("cloaked_canonical");
      expect(types).toContain("sitemap_poison");
    });

    it("should include redirect URL in spam payloads", () => {
      const payloads = generateSeoSpamPayloads(TEST_DOMAIN, TEST_REDIRECT);
      payloads.forEach(p => {
        expect(p.code).toContain("spam.example.com");
      });
    });

    it("should include JSON-LD in doorway content", () => {
      const payloads = generateSeoSpamPayloads(TEST_DOMAIN, TEST_REDIRECT);
      const doorway = payloads.find(p => p.type === "doorway_content");
      expect(doorway).toBeDefined();
      expect(doorway!.code).toContain("application/ld+json");
      expect(doorway!.code).toContain("schema.org");
    });
  });

  // ─── Phase 6: Auto Redirect ───
  describe("Phase 6: Auto Redirect", () => {
    it("should generate all redirect types", () => {
      const payloads = generateRedirectPayloads(TEST_DOMAIN, TEST_REDIRECT);
      expect(payloads.length).toBe(6);
      const types = payloads.map(p => p.type);
      expect(types).toContain("js_redirect_basic");
      expect(types).toContain("js_redirect_obfuscated");
      expect(types).toContain("php_redirect");
      expect(types).toContain("htaccess_redirect");
      expect(types).toContain("service_worker_redirect");
      expect(types).toContain("back_button_hijack");
    });

    it("should exclude search bots in redirects", () => {
      const payloads = generateRedirectPayloads(TEST_DOMAIN, TEST_REDIRECT);
      const jsRedirect = payloads.find(p => p.type === "js_redirect_basic");
      expect(jsRedirect).toBeDefined();
      expect(jsRedirect!.code).toContain("Googlebot");
      expect(jsRedirect!.code).toContain("Bingbot");
    });

    it("should include cookie tracking in PHP redirect", () => {
      const payloads = generateRedirectPayloads(TEST_DOMAIN, TEST_REDIRECT);
      const phpRedirect = payloads.find(p => p.type === "php_redirect");
      expect(phpRedirect).toBeDefined();
      expect(phpRedirect!.code).toContain("setcookie");
      expect(phpRedirect!.code).toContain("_visited");
    });
  });

  // ─── Single Phase Runner ───
  describe("runSingleSpamPhase", () => {
    it("should run each phase 1-6", () => {
      for (let i = 1; i <= 6; i++) {
        const result = runSingleSpamPhase(TEST_DOMAIN, i, TEST_REDIRECT);
        expect(result.phase).toBe(i);
        expect(result.payloads.length).toBeGreaterThan(0);
        expect(result.name).toBeTruthy();
      }
    });

    it("should throw for invalid phase", () => {
      expect(() => runSingleSpamPhase(TEST_DOMAIN, 0)).toThrow();
      expect(() => runSingleSpamPhase(TEST_DOMAIN, 7)).toThrow();
    });
  });

  // ─── Single Capability Runner ───
  describe("runSingleSpamCapability", () => {
    it("should run individual capabilities", () => {
      const caps = [
        "shodan_search", "google_dork", "proxy_rotation",
        "php_shell_basic", "waf_header_bypass", "meta_tag_spam",
        "js_redirect_basic", "back_button_hijack",
      ];
      for (const cap of caps) {
        const results = runSingleSpamCapability(TEST_DOMAIN, cap, TEST_REDIRECT);
        expect(results.length).toBeGreaterThan(0);
        results.forEach(r => {
          expect(r.type).toBe(cap);
          expect(r.code).toBeTruthy();
        });
      }
    });

    it("should throw for unknown capability", () => {
      expect(() => runSingleSpamCapability(TEST_DOMAIN, "nonexistent")).toThrow();
    });
  });

  // ─── Payload Structure ───
  describe("Payload Structure", () => {
    it("all payloads should have required fields", () => {
      const phases = [
        runPhase1(TEST_DOMAIN),
        runPhase2(),
        runPhase3(TEST_DOMAIN),
        runPhase4(TEST_DOMAIN),
        runPhase5(TEST_DOMAIN, TEST_REDIRECT),
        runPhase6(TEST_DOMAIN, TEST_REDIRECT),
      ];
      for (const phase of phases) {
        for (const payload of phase.payloads) {
          expect(payload.type).toBeTruthy();
          expect(payload.technique).toBeTruthy();
          expect(payload.code).toBeTruthy();
          expect(typeof payload.size).toBe("number");
          expect(payload.effect).toBeTruthy();
        }
      }
    });

    it("all phase results should have stats", () => {
      const phases = [
        runPhase1(TEST_DOMAIN),
        runPhase2(),
        runPhase3(TEST_DOMAIN),
        runPhase4(TEST_DOMAIN),
        runPhase5(TEST_DOMAIN, TEST_REDIRECT),
        runPhase6(TEST_DOMAIN, TEST_REDIRECT),
      ];
      for (const phase of phases) {
        expect(phase.stats).toBeDefined();
        expect(Object.keys(phase.stats).length).toBeGreaterThan(0);
      }
    });
  });
});
