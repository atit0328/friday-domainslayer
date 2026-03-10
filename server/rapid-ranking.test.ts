import { describe, expect, it, vi } from "vitest";

// ═══════════════════════════════════════════════
//  Keyword Sniper Engine Tests
// ═══════════════════════════════════════════════

describe("Keyword Sniper Engine", () => {
  it("generates velocity plan with correct day structure", async () => {
    const { generateVelocityPlan, calculatePlanTotals } = await import("./keyword-sniper-engine");
    
    const plan = generateVelocityPlan("test keyword", 30, "aggressive");
    
    expect(plan).toHaveLength(7);
    expect(plan[0].day).toBe(1);
    expect(plan[6].day).toBe(7);
    
    const day1Links = plan[0].tier1Links + plan[0].tier2Links + plan[0].tier3Links;
    expect(day1Links).toBeGreaterThan(0);
    
    const totals = calculatePlanTotals(plan);
    expect(totals.grandTotal).toBeGreaterThan(0);
    expect(totals.peakDay).toBeGreaterThanOrEqual(1);
    expect(totals.peakDay).toBeLessThanOrEqual(7);
  });

  it("generates extreme velocity plan with more links", async () => {
    const { generateVelocityPlan, calculatePlanTotals } = await import("./keyword-sniper-engine");
    
    const extremePlan = generateVelocityPlan("test keyword", 20, "extreme");
    const moderatePlan = generateVelocityPlan("test keyword", 20, "moderate");
    
    const extremeTotal = calculatePlanTotals(extremePlan).grandTotal;
    const moderateTotal = calculatePlanTotals(moderatePlan).grandTotal;
    
    expect(extremeTotal).toBeGreaterThan(moderateTotal);
  });

  it("adjusts plan based on difficulty", async () => {
    const { generateVelocityPlan, calculatePlanTotals } = await import("./keyword-sniper-engine");
    
    const easyPlan = generateVelocityPlan("easy keyword", 10, "aggressive");
    const hardPlan = generateVelocityPlan("hard keyword", 80, "aggressive");
    
    const easyTotal = calculatePlanTotals(easyPlan).grandTotal;
    const hardTotal = calculatePlanTotals(hardPlan).grandTotal;
    
    expect(hardTotal).toBeGreaterThan(easyTotal);
  });

  it("selectAnchorText returns valid strings", async () => {
    const { selectAnchorText } = await import("./keyword-sniper-engine");
    
    const distribution = { exact: 30, partial: 25, branded: 20, generic: 15, naked: 10 };
    const anchor = selectAnchorText("test keyword", "example.com", distribution);
    
    expect(typeof anchor).toBe("string");
    expect(anchor.length).toBeGreaterThan(0);
  });

  it("getDayPlan returns correct day", async () => {
    const { generateVelocityPlan, getDayPlan } = await import("./keyword-sniper-engine");
    
    const plan = generateVelocityPlan("test", 30, "aggressive");
    const campaign = { velocityPlan: plan };
    
    const day3 = getDayPlan(campaign as any, 3);
    expect(day3).toBeDefined();
    expect(day3?.day).toBe(3);
    
    const day8 = getDayPlan(campaign as any, 8);
    expect(day8).toBeNull();
  });
});

// ═══════════════════════════════════════════════
//  Rapid Indexing Engine Tests
// ═══════════════════════════════════════════════

describe("Rapid Indexing Engine", () => {
  it("rapidIndexUrl handles network failures gracefully", async () => {
    const { rapidIndexUrl } = await import("./rapid-indexing-engine");
    
    const results = await rapidIndexUrl({
      url: "https://example.com/test-page",
      domain: "example.com",
      keywords: ["test"],
      priority: "normal",
    });
    
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(typeof r.success).toBe("boolean");
      expect(typeof r.method).toBe("string");
    }
  }, 30000);

  it("rapidIndexBulk processes multiple URLs", async () => {
    const { rapidIndexBulk } = await import("./rapid-indexing-engine");
    
    const requests = [
      { url: "https://example.com/page1", domain: "example.com", keywords: ["test1"], priority: "high" as const },
      { url: "https://example.com/page2", domain: "example.com", keywords: ["test2"], priority: "normal" as const },
    ];
    
    const report = await rapidIndexBulk(requests);
    
    expect(report).toBeDefined();
    expect(typeof report.totalUrls).toBe("number");
    expect(typeof report.successCount).toBe("number");
    expect(typeof report.failCount).toBe("number");
    expect(report.totalUrls).toBe(2);
  }, 60000);
});

// ═══════════════════════════════════════════════
//  Parasite SEO Blitz Tests
// ═══════════════════════════════════════════════

describe("Parasite SEO Blitz", () => {
  it("generateParasiteContent returns valid content structure", async () => {
    vi.mock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "Test Article About SEO",
              content: "<p>This is a test article about SEO.</p><h2>Section 1</h2><p>More content here.</p>",
              metaDescription: "Test meta description for SEO article",
              tags: ["seo", "test", "guide"],
            }),
          },
        }],
      }),
    }));
    
    const { generateParasiteContent } = await import("./parasite-seo-blitz");
    
    const content = await generateParasiteContent(
      "test keyword",
      "https://example.com",
      "Telegraph",
      "en",
      0
    );
    
    expect(content).toBeDefined();
    expect(typeof content.title).toBe("string");
    expect(typeof content.content).toBe("string");
    expect(typeof content.metaDescription).toBe("string");
    expect(Array.isArray(content.tags)).toBe(true);
    
    vi.restoreAllMocks();
  });
});

// ═══════════════════════════════════════════════
//  7-Day Sprint Orchestrator Tests
// ═══════════════════════════════════════════════

describe("7-Day Sprint Orchestrator", () => {
  it("getActiveSprints returns empty array initially", async () => {
    const { getActiveSprints, getSprintSummary } = await import("./seven-day-sprint");
    
    const sprints = getActiveSprints();
    expect(Array.isArray(sprints)).toBe(true);
    
    const summary = getSprintSummary();
    expect(summary).toBeDefined();
    expect(typeof summary.activeSprints).toBe("number");
    expect(typeof summary.completedSprints).toBe("number");
    expect(typeof summary.totalFirstPageKeywords).toBe("number");
  });

  it("getSprintState returns null for non-existent sprint", async () => {
    const { getSprintState } = await import("./seven-day-sprint");
    
    const state = getSprintState("non_existent_sprint");
    expect(state).toBeNull();
  });

  it("orchestratorTick handles no active sprints", async () => {
    const { orchestratorTick } = await import("./seven-day-sprint");
    
    const result = await orchestratorTick();
    expect(result).toBeDefined();
    expect(typeof result.sprintsProcessed).toBe("number");
    expect(Array.isArray(result.reportsGenerated)).toBe(true);
    expect(result.sprintsProcessed).toBe(0);
  });
});

// ═══════════════════════════════════════════════
//  Sprint Router Tests
// ═══════════════════════════════════════════════

describe("Sprint Router", () => {
  it("sprint router is registered in appRouter", async () => {
    const { appRouter } = await import("./routers");
    
    expect(appRouter._def.procedures).toBeDefined();
    
    const procedureKeys = Object.keys(appRouter._def.procedures);
    expect(procedureKeys).toContain("sprint.getActive");
    expect(procedureKeys).toContain("sprint.getSummary");
    expect(procedureKeys).toContain("sprint.rapidIndex");
    expect(procedureKeys).toContain("sprint.findKeywords");
  });
});
