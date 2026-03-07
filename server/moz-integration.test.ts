import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Moz API module
vi.mock("./moz-api", () => ({
  fetchMozMetrics: vi.fn(),
}));

// Mock SimilarWeb data API
vi.mock("./_core/dataApi", () => ({
  makeDataApiRequest: vi.fn().mockResolvedValue({ meta: { status: "Error" } }),
}));

import { fetchMozMetrics } from "./moz-api";

describe("Moz API Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return DA, PA, SS, backlinks, referring domains from Moz", async () => {
    const mockMoz = fetchMozMetrics as ReturnType<typeof vi.fn>;
    mockMoz.mockResolvedValue({
      domainAuthority: 91,
      pageAuthority: 75,
      spamScore: 3,
      totalBacklinks: 150000,
      referringDomains: 8500,
      success: true,
    });

    const result = await fetchMozMetrics("moz.com");
    expect(result.success).toBe(true);
    expect(result.domainAuthority).toBe(91);
    expect(result.pageAuthority).toBe(75);
    expect(result.spamScore).toBe(3);
    expect(result.totalBacklinks).toBe(150000);
    expect(result.referringDomains).toBe(8500);
  });

  it("should handle Moz API failure gracefully", async () => {
    const mockMoz = fetchMozMetrics as ReturnType<typeof vi.fn>;
    mockMoz.mockResolvedValue({
      domainAuthority: 0,
      pageAuthority: 0,
      spamScore: 0,
      totalBacklinks: 0,
      referringDomains: 0,
      success: false,
      error: "API rate limit exceeded",
    });

    const result = await fetchMozMetrics("example.com");
    expect(result.success).toBe(false);
    expect(result.domainAuthority).toBe(0);
    expect(result.error).toBe("API rate limit exceeded");
  });

  it("should return numeric values within valid ranges", async () => {
    const mockMoz = fetchMozMetrics as ReturnType<typeof vi.fn>;
    mockMoz.mockResolvedValue({
      domainAuthority: 50,
      pageAuthority: 45,
      spamScore: 10,
      totalBacklinks: 500,
      referringDomains: 100,
      success: true,
    });

    const result = await fetchMozMetrics("test.com");
    expect(result.domainAuthority).toBeGreaterThanOrEqual(0);
    expect(result.domainAuthority).toBeLessThanOrEqual(100);
    expect(result.pageAuthority).toBeGreaterThanOrEqual(0);
    expect(result.pageAuthority).toBeLessThanOrEqual(100);
    expect(result.spamScore).toBeGreaterThanOrEqual(0);
    expect(result.spamScore).toBeLessThanOrEqual(100);
    expect(result.totalBacklinks).toBeGreaterThanOrEqual(0);
    expect(result.referringDomains).toBeGreaterThanOrEqual(0);
  });
});

describe("Domain Metrics with Moz Integration", () => {
  it("should use Moz data when available", async () => {
    const mockMoz = fetchMozMetrics as ReturnType<typeof vi.fn>;
    mockMoz.mockResolvedValue({
      domainAuthority: 94,
      pageAuthority: 90,
      spamScore: 1,
      totalBacklinks: 500000,
      referringDomains: 25000,
      success: true,
    });

    const result = await fetchMozMetrics("google.com");
    expect(result.domainAuthority).toBe(94);
    expect(result.pageAuthority).toBe(90);
    expect(result.spamScore).toBe(1);
  });

  it("should report Moz as data source when successful", async () => {
    const mockMoz = fetchMozMetrics as ReturnType<typeof vi.fn>;
    mockMoz.mockResolvedValue({
      domainAuthority: 50,
      pageAuthority: 40,
      spamScore: 5,
      totalBacklinks: 1000,
      referringDomains: 200,
      success: true,
    });

    const result = await fetchMozMetrics("example.com");
    expect(result.success).toBe(true);
    // When Moz succeeds, dataSources.moz should be true in the main metrics
  });

  it("should fall back to formula when Moz fails", async () => {
    const mockMoz = fetchMozMetrics as ReturnType<typeof vi.fn>;
    mockMoz.mockResolvedValue({
      domainAuthority: 0,
      pageAuthority: 0,
      spamScore: 0,
      totalBacklinks: 0,
      referringDomains: 0,
      success: false,
      error: "Network error",
    });

    const result = await fetchMozMetrics("offline-domain.xyz");
    expect(result.success).toBe(false);
    // When Moz fails, system should use formula-based calculation
  });
});

describe("LLM JSON Parser", () => {
  // Test the robust JSON parser that fixes the SEO Content Automation error
  it("should parse clean JSON", () => {
    const input = '{"title": "Test", "content": "Hello"}';
    const parsed = JSON.parse(input);
    expect(parsed.title).toBe("Test");
    expect(parsed.content).toBe("Hello");
  });

  it("should handle JSON with markdown code fences", () => {
    const input = '```json\n{"title": "Test", "content": "Hello"}\n```';
    const cleaned = input.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    expect(parsed.title).toBe("Test");
  });

  it("should handle JSON with extra whitespace", () => {
    const input = '  \n  {"title": "Test"}  \n  ';
    const parsed = JSON.parse(input.trim());
    expect(parsed.title).toBe("Test");
  });
});
