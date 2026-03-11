import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════
//  SERP Harvester — Unit Tests
// ═══════════════════════════════════════════════

describe("SERP Harvester — Niche Management", () => {
  it("getNiches returns all niches", async () => {
    const { getNiches } = await import("./serp-harvester");
    const niches = getNiches();
    expect(niches.length).toBeGreaterThan(0);
    expect(niches[0]).toHaveProperty("id");
    expect(niches[0]).toHaveProperty("name");
    expect(niches[0]).toHaveProperty("seedKeywords");
  });

  it("getEnabledNiches returns only enabled niches", async () => {
    const { getEnabledNiches, getNiches } = await import("./serp-harvester");
    const all = getNiches();
    const enabled = getEnabledNiches();
    expect(enabled.length).toBeLessThanOrEqual(all.length);
    for (const n of enabled) {
      expect(n.enabled).toBe(true);
    }
  });

  it("toggleNiche enables/disables a niche", async () => {
    const { toggleNiche, getNiches } = await import("./serp-harvester");
    const niches = getNiches();
    const firstNiche = niches[0];

    // Disable
    const result1 = toggleNiche(firstNiche.id, false);
    expect(result1).toBe(true);
    const updated = getNiches().find(n => n.id === firstNiche.id);
    expect(updated?.enabled).toBe(false);

    // Re-enable
    const result2 = toggleNiche(firstNiche.id, true);
    expect(result2).toBe(true);
    const restored = getNiches().find(n => n.id === firstNiche.id);
    expect(restored?.enabled).toBe(true);
  });

  it("toggleNiche returns false for unknown niche", async () => {
    const { toggleNiche } = await import("./serp-harvester");
    const result = toggleNiche("nonexistent_niche_xyz", true);
    expect(result).toBe(false);
  });

  it("addNiche adds a new niche", async () => {
    const { addNiche, getNiches } = await import("./serp-harvester");
    const before = getNiches().length;

    const success = addNiche({
      id: "test_niche_" + Date.now(),
      name: "Test Niche",
      nameEn: "Test Niche",
      description: "Test description",
      seedKeywords: ["test1", "test2"],
      language: "th",
      country: "th",
      enabled: true,
    });

    expect(success).toBe(true);
    expect(getNiches().length).toBe(before + 1);
  });

  it("addNiche prevents duplicate niche IDs", async () => {
    const { addNiche, getNiches } = await import("./serp-harvester");
    const existing = getNiches()[0];

    const success = addNiche({
      id: existing.id,
      name: "Duplicate",
      nameEn: "Duplicate",
      description: "Dup",
      seedKeywords: ["dup"],
      language: "th",
      country: "th",
      enabled: true,
    });

    expect(success).toBe(false);
  });
});

describe("SERP Harvester — Default Niches", () => {
  it("has gambling niche with Thai keywords", async () => {
    const { getNiches } = await import("./serp-harvester");
    const gambling = getNiches().find(n => n.id === "gambling");
    expect(gambling).toBeDefined();
    expect(gambling!.language).toBe("th");
    expect(gambling!.country).toBe("th");
    expect(gambling!.seedKeywords.length).toBeGreaterThan(0);
    expect(gambling!.enabled).toBe(true);
  });

  it("has lottery niche", async () => {
    const { getNiches } = await import("./serp-harvester");
    const lottery = getNiches().find(n => n.id === "lottery");
    expect(lottery).toBeDefined();
    expect(lottery!.seedKeywords.length).toBeGreaterThan(0);
  });

  it("has forex niche", async () => {
    const { getNiches } = await import("./serp-harvester");
    const forex = getNiches().find(n => n.id === "forex");
    expect(forex).toBeDefined();
    expect(forex!.enabled).toBe(true);
  });

  it("adult niche is disabled by default", async () => {
    const { getNiches } = await import("./serp-harvester");
    const adult = getNiches().find(n => n.id === "adult");
    expect(adult).toBeDefined();
    expect(adult!.enabled).toBe(false);
  });
});

describe("SERP Harvester — scrapeGoogleThailand", () => {
  it("returns structured result even without API key", async () => {
    const { scrapeGoogleThailand } = await import("./serp-harvester");
    const result = await scrapeGoogleThailand("test keyword", "test_niche", 10);

    expect(result).toHaveProperty("keyword", "test keyword");
    expect(result).toHaveProperty("niche", "test_niche");
    expect(result).toHaveProperty("domains");
    expect(result).toHaveProperty("relatedSearches");
    expect(Array.isArray(result.domains)).toBe(true);
    expect(Array.isArray(result.relatedSearches)).toBe(true);
  });
});

describe("SERP Harvester — generateKeywordsForNiche", () => {
  it("falls back to seed keywords when LLM unavailable", async () => {
    const { generateKeywordsForNiche, getNiches } = await import("./serp-harvester");
    const niche = getNiches().find(n => n.id === "gambling")!;

    // Without valid LLM key, should fall back to seed keywords
    const keywords = await generateKeywordsForNiche(niche, 3);
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.length).toBeLessThanOrEqual(5); // seed keywords count
  });
});

describe("SERP Harvester — History & Stats", () => {
  it("getHarvestHistory returns array", async () => {
    const { getHarvestHistory } = await import("./serp-harvester");
    const history = getHarvestHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it("getHarvestStats returns stats object", async () => {
    const { getHarvestStats } = await import("./serp-harvester");
    const stats = getHarvestStats();
    expect(stats).toHaveProperty("totalHarvests");
    expect(stats).toHaveProperty("totalDomainsImported");
    expect(stats).toHaveProperty("totalKeywordsSearched");
    expect(stats).toHaveProperty("averageDomainsPerHarvest");
    expect(stats).toHaveProperty("lastHarvestAt");
    expect(stats).toHaveProperty("nicheStats");
    expect(typeof stats.totalHarvests).toBe("number");
    expect(typeof stats.totalDomainsImported).toBe("number");
  });
});

describe("SERP Harvester — runHarvestCycle", () => {
  it("returns error when no enabled niches", async () => {
    const mod = await import("./serp-harvester");
    // Disable all niches
    const niches = mod.getNiches();
    const originalStates = niches.map(n => ({ id: n.id, enabled: n.enabled }));

    for (const n of niches) {
      mod.toggleNiche(n.id, false);
    }

    const result = await mod.runHarvestCycle({ nicheIds: ["nonexistent_xyz"] });
    expect(result.status).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);

    // Restore
    for (const s of originalStates) {
      mod.toggleNiche(s.id, s.enabled);
    }
  });

  it("harvest result has correct structure", async () => {
    const { runHarvestCycle } = await import("./serp-harvester");
    // Run with minimal config (will likely fail due to no API key, but structure should be correct)
    const result = await runHarvestCycle({
      keywordsPerNiche: 1,
      maxResultsPerKeyword: 3,
      telegramNotify: false,
      triggeredBy: "test",
    });

    expect(result).toHaveProperty("harvestId");
    expect(result).toHaveProperty("startedAt");
    expect(result).toHaveProperty("completedAt");
    expect(result).toHaveProperty("duration");
    expect(result).toHaveProperty("nichesProcessed");
    expect(result).toHaveProperty("keywordsGenerated");
    expect(result).toHaveProperty("keywordsSearched");
    expect(result).toHaveProperty("rawDomainsFound");
    expect(result).toHaveProperty("uniqueDomainsFound");
    expect(result).toHaveProperty("newDomainsImported");
    expect(result).toHaveProperty("duplicatesSkipped");
    expect(result).toHaveProperty("blacklistedSkipped");
    expect(result).toHaveProperty("domainsPerNiche");
    expect(result).toHaveProperty("topDomains");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("status");
    expect(result.harvestId).toMatch(/^harvest-/);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
