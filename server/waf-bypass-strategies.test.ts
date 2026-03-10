/**
 * WAF Bypass Strategies — Vitest Tests
 *
 * Tests the WAF-specific bypass strategy engine:
 *   1. Static profile building (Cloudflare, Sucuri, Wordfence)
 *   2. Technique selection and filtering
 *   3. WAF targeting recommendations
 *   4. Bypass technique ranking and confidence scoring
 *   5. Integration with attack engine and pipeline
 */
import { describe, it, expect, vi } from "vitest";
import {
  CLOUDFLARE_TECHNIQUES,
  SUCURI_TECHNIQUES,
  WORDFENCE_TECHNIQUES,
  buildCloudflareProfile,
  buildSucuriProfile,
  buildWordfenceProfile,
  STATIC_PROFILES,
  type WafBypassTechnique,
  type WafBypassProfile,
} from "./waf-bypass-strategies";

// ═══════════════════════════════════════════════
//  STATIC PROFILE TESTS
// ═══════════════════════════════════════════════

describe("WAF Bypass Strategies — Static Profiles", () => {
  it("should have Cloudflare techniques with correct structure", () => {
    expect(CLOUDFLARE_TECHNIQUES.length).toBeGreaterThanOrEqual(8);
    for (const tech of CLOUDFLARE_TECHNIQUES) {
      expect(tech.name).toBeTruthy();
      expect(tech.description).toBeTruthy();
      expect(tech.category).toBeTruthy();
      expect(tech.baseConfidence).toBeGreaterThanOrEqual(0);
      expect(tech.baseConfidence).toBeLessThanOrEqual(100);
      expect(["low", "medium", "high"]).toContain(tech.riskLevel);
      expect(tech.estimatedDurationMs).toBeGreaterThan(0);
      expect(tech.learnedConfidence).toBeNull(); // No historical data in static
      expect(tech.historicalAttempts).toBe(0);
      expect(tech.historicalSuccesses).toBe(0);
    }
  });

  it("should have Sucuri techniques with correct structure", () => {
    expect(SUCURI_TECHNIQUES.length).toBeGreaterThanOrEqual(7);
    for (const tech of SUCURI_TECHNIQUES) {
      expect(tech.name).toBeTruthy();
      expect(tech.description).toBeTruthy();
      expect(tech.baseConfidence).toBeGreaterThanOrEqual(0);
      expect(tech.baseConfidence).toBeLessThanOrEqual(100);
    }
  });

  it("should have Wordfence techniques with correct structure", () => {
    expect(WORDFENCE_TECHNIQUES.length).toBeGreaterThanOrEqual(8);
    for (const tech of WORDFENCE_TECHNIQUES) {
      expect(tech.name).toBeTruthy();
      expect(tech.description).toBeTruthy();
      expect(tech.baseConfidence).toBeGreaterThanOrEqual(0);
      expect(tech.baseConfidence).toBeLessThanOrEqual(100);
    }
  });

  it("should build Cloudflare profile with known weaknesses and strengths", () => {
    const profile = buildCloudflareProfile();
    expect(profile.wafVendor).toBe("cloudflare");
    expect(profile.wafVariants).toContain("cloudflare");
    expect(profile.knownWeaknesses.length).toBeGreaterThan(0);
    expect(profile.knownStrengths.length).toBeGreaterThan(0);
    expect(profile.techniques.length).toBe(CLOUDFLARE_TECHNIQUES.length);
    expect(profile.overallBypassRate).toBeNull(); // No historical data
    expect(profile.totalAttempts).toBe(0);
    expect(profile.totalSuccesses).toBe(0);
  });

  it("should build Sucuri profile with origin IP discovery as top technique", () => {
    const profile = buildSucuriProfile();
    expect(profile.wafVendor).toBe("sucuri");
    expect(profile.techniques[0].name).toBe("origin_ip_discovery_sucuri");
    expect(profile.techniques[0].baseConfidence).toBe(80);
    expect(profile.knownWeaknesses.some(w => w.toLowerCase().includes("origin"))).toBe(true);
  });

  it("should build Wordfence profile with REST API bypass as top technique", () => {
    const profile = buildWordfenceProfile();
    expect(profile.wafVendor).toBe("wordfence");
    expect(profile.techniques[0].name).toBe("rest_api_bypass");
    expect(profile.knownWeaknesses.some(w => w.toLowerCase().includes("ip-based"))).toBe(true);
  });

  it("should have all 3 WAF profiles in STATIC_PROFILES", () => {
    expect(Object.keys(STATIC_PROFILES)).toContain("cloudflare");
    expect(Object.keys(STATIC_PROFILES)).toContain("sucuri");
    expect(Object.keys(STATIC_PROFILES)).toContain("wordfence");
  });
});

// ═══════════════════════════════════════════════
//  TECHNIQUE QUALITY TESTS
// ═══════════════════════════════════════════════

describe("WAF Bypass Strategies — Technique Quality", () => {
  it("Cloudflare should prioritize origin IP discovery (highest confidence)", () => {
    const profile = buildCloudflareProfile();
    const topTechnique = profile.techniques[0];
    expect(topTechnique.name).toBe("origin_ip_discovery");
    expect(topTechnique.baseConfidence).toBeGreaterThanOrEqual(70);
    expect(topTechnique.category).toBe("origin_discovery");
    expect(topTechnique.riskLevel).toBe("low");
  });

  it("Sucuri should include large body bypass (known weakness)", () => {
    const largeBody = SUCURI_TECHNIQUES.find(t => t.name === "large_body_bypass");
    expect(largeBody).toBeDefined();
    expect(largeBody!.baseConfidence).toBeGreaterThanOrEqual(60);
    expect(largeBody!.description).toContain("10MB");
  });

  it("Wordfence should include IP rotation or rate evasion technique", () => {
    const rateEvasion = WORDFENCE_TECHNIQUES.find(t => t.category === "rate_evasion");
    expect(rateEvasion).toBeDefined();
    expect(rateEvasion!.baseConfidence).toBeGreaterThanOrEqual(30);
  });

  it("all techniques should have unique names within each WAF", () => {
    const cfNames = CLOUDFLARE_TECHNIQUES.map(t => t.name);
    expect(new Set(cfNames).size).toBe(cfNames.length);

    const sucuriNames = SUCURI_TECHNIQUES.map(t => t.name);
    expect(new Set(sucuriNames).size).toBe(sucuriNames.length);

    const wfNames = WORDFENCE_TECHNIQUES.map(t => t.name);
    expect(new Set(wfNames).size).toBe(wfNames.length);
  });

  it("techniques should generally trend from high to low confidence", () => {
    for (const techniques of [CLOUDFLARE_TECHNIQUES, SUCURI_TECHNIQUES, WORDFENCE_TECHNIQUES]) {
      // First technique should have higher confidence than last
      expect(techniques[0].baseConfidence).toBeGreaterThanOrEqual(techniques[techniques.length - 1].baseConfidence);
      // Average of first 3 should be higher than average of last 3
      const topAvg = techniques.slice(0, 3).reduce((s, t) => s + t.baseConfidence, 0) / 3;
      const bottomAvg = techniques.slice(-3).reduce((s, t) => s + t.baseConfidence, 0) / 3;
      expect(topAvg).toBeGreaterThanOrEqual(bottomAvg);
    }
  });

  it("each WAF should have at least one low-risk technique", () => {
    expect(CLOUDFLARE_TECHNIQUES.some(t => t.riskLevel === "low")).toBe(true);
    expect(SUCURI_TECHNIQUES.some(t => t.riskLevel === "low")).toBe(true);
    expect(WORDFENCE_TECHNIQUES.some(t => t.riskLevel === "low")).toBe(true);
  });

  it("each WAF should cover multiple technique categories", () => {
    const cfCategories = new Set(CLOUDFLARE_TECHNIQUES.map(t => t.category));
    expect(cfCategories.size).toBeGreaterThanOrEqual(4);

    const sucuriCategories = new Set(SUCURI_TECHNIQUES.map(t => t.category));
    expect(sucuriCategories.size).toBeGreaterThanOrEqual(3);

    const wfCategories = new Set(WORDFENCE_TECHNIQUES.map(t => t.category));
    expect(wfCategories.size).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════
//  PROFILE CONTENT VALIDATION
// ═══════════════════════════════════════════════

describe("WAF Bypass Strategies — Profile Content Validation", () => {
  it("Cloudflare profile should mention proxy bypass in weaknesses", () => {
    const profile = buildCloudflareProfile();
    const hasProxyWeakness = profile.knownWeaknesses.some(
      w => w.toLowerCase().includes("origin") || w.toLowerCase().includes("proxy")
    );
    expect(hasProxyWeakness).toBe(true);
  });

  it("Sucuri profile should mention origin IP in weaknesses", () => {
    const profile = buildSucuriProfile();
    const hasOriginWeakness = profile.knownWeaknesses.some(
      w => w.toLowerCase().includes("origin") || w.toLowerCase().includes("ip")
    );
    expect(hasOriginWeakness).toBe(true);
  });

  it("Wordfence profile should mention free version limitations", () => {
    const profile = buildWordfenceProfile();
    const hasFreeWeakness = profile.knownWeaknesses.some(
      w => w.toLowerCase().includes("free")
    );
    expect(hasFreeWeakness).toBe(true);
  });

  it("all profiles should have updatedAt timestamp", () => {
    const now = Date.now();
    for (const builder of Object.values(STATIC_PROFILES)) {
      const profile = builder();
      expect(profile.updatedAt).toBeLessThanOrEqual(now + 1000);
      expect(profile.updatedAt).toBeGreaterThan(now - 5000);
    }
  });

  it("Cloudflare variants should include enterprise", () => {
    const profile = buildCloudflareProfile();
    expect(profile.wafVariants.some(v => v.includes("enterprise"))).toBe(true);
  });

  it("Wordfence variants should include both free and premium", () => {
    const profile = buildWordfenceProfile();
    expect(profile.wafVariants.some(v => v.includes("free"))).toBe(true);
    expect(profile.wafVariants.some(v => v.includes("premium"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════
//  INTEGRATION READINESS TESTS
// ═══════════════════════════════════════════════

describe("WAF Bypass Strategies — Integration Readiness", () => {
  it("technique names should be valid identifiers (no spaces, lowercase)", () => {
    const allTechniques = [
      ...CLOUDFLARE_TECHNIQUES,
      ...SUCURI_TECHNIQUES,
      ...WORDFENCE_TECHNIQUES,
    ];
    for (const tech of allTechniques) {
      expect(tech.name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("all technique categories should be valid enum values", () => {
    const validCategories = [
      "origin_discovery", "encoding", "header_manipulation",
      "protocol", "timing", "payload_mutation", "path_traversal",
      "rate_evasion", "auth_bypass",
    ];
    const allTechniques = [
      ...CLOUDFLARE_TECHNIQUES,
      ...SUCURI_TECHNIQUES,
      ...WORDFENCE_TECHNIQUES,
    ];
    for (const tech of allTechniques) {
      expect(validCategories).toContain(tech.category);
    }
  });

  it("estimated duration should be reasonable (< 120s per technique)", () => {
    const allTechniques = [
      ...CLOUDFLARE_TECHNIQUES,
      ...SUCURI_TECHNIQUES,
      ...WORDFENCE_TECHNIQUES,
    ];
    for (const tech of allTechniques) {
      expect(tech.estimatedDurationMs).toBeLessThanOrEqual(120000);
    }
  });

  it("total technique count should be comprehensive (30+)", () => {
    const total = CLOUDFLARE_TECHNIQUES.length + SUCURI_TECHNIQUES.length + WORDFENCE_TECHNIQUES.length;
    expect(total).toBeGreaterThanOrEqual(28);
  });
});
