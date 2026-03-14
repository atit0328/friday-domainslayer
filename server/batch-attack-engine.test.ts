import { describe, expect, it } from "vitest";
import {
  parseDomainList,
  formatBatchSummary,
  formatDomainResult,
  getActiveBatch,
  getAllActiveBatches,
  cancelBatch,
  type BatchStatus,
  type DomainResult,
} from "./batch-attack-engine";

// ═══════════════════════════════════════════════════════
//  parseDomainList
// ═══════════════════════════════════════════════════════

describe("parseDomainList", () => {
  it("parses simple domain list (one per line)", () => {
    const input = `example.com
test-site.org
another.net`;
    const result = parseDomainList(input);
    expect(result).toEqual(["example.com", "test-site.org", "another.net"]);
  });

  it("skips empty lines and comments", () => {
    const input = `# This is a comment
example.com

// Another comment
; Semicolon comment
test.org

`;
    const result = parseDomainList(input);
    expect(result).toEqual(["example.com", "test.org"]);
  });

  it("handles full URLs and strips paths", () => {
    const input = `https://example.com/some/path
http://test.org/page?query=1
https://www.another.net/`;
    const result = parseDomainList(input);
    expect(result).toEqual(["example.com", "test.org", "another.net"]);
  });

  it("deduplicates domains (case-insensitive)", () => {
    const input = `example.com
Example.COM
EXAMPLE.com
test.org`;
    const result = parseDomainList(input);
    expect(result).toEqual(["example.com", "test.org"]);
  });

  it("deduplicates www vs non-www", () => {
    const input = `www.example.com
example.com`;
    const result = parseDomainList(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("example.com");
  });

  it("rejects invalid domains", () => {
    const input = `not-a-domain
a.b
123
@invalid
example.com`;
    const result = parseDomainList(input);
    expect(result).toEqual(["example.com"]);
  });

  it("handles Windows-style line endings (CRLF)", () => {
    const input = "example.com\r\ntest.org\r\nanother.net";
    const result = parseDomainList(input);
    expect(result).toEqual(["example.com", "test.org", "another.net"]);
  });

  it("strips port numbers", () => {
    const input = `example.com:8080
test.org:443`;
    const result = parseDomainList(input);
    expect(result).toEqual(["example.com", "test.org"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseDomainList("")).toEqual([]);
    expect(parseDomainList("   ")).toEqual([]);
    expect(parseDomainList("# only comments")).toEqual([]);
  });

  it("handles subdomains correctly", () => {
    const input = `sub.example.com
deep.sub.test.org`;
    const result = parseDomainList(input);
    expect(result).toEqual(["sub.example.com", "deep.sub.test.org"]);
  });

  it("handles large domain lists efficiently", () => {
    const domains = Array.from({ length: 500 }, (_, i) => `domain${i}.com`);
    const input = domains.join("\n");
    const start = Date.now();
    const result = parseDomainList(input);
    const elapsed = Date.now() - start;
    expect(result).toHaveLength(500);
    expect(elapsed).toBeLessThan(1000); // Should be fast
  });
});

// ═══════════════════════════════════════════════════════
//  formatBatchSummary
// ═══════════════════════════════════════════════════════

describe("formatBatchSummary", () => {
  it("formats a completed batch summary", () => {
    const status: BatchStatus = {
      batchId: "batch-test-12345678",
      startedAt: Date.now() - 120000, // 2 min ago
      completedAt: Date.now(),
      totalDomains: 5,
      pending: 0,
      running: 0,
      success: 3,
      failed: 2,
      skipped: 0,
      cancelled: false,
      redirectUrl: "https://redirect.example.com",
      domains: [
        makeDomainResult("a.com", "success", 30000, 2),
        makeDomainResult("b.com", "success", 45000, 1),
        makeDomainResult("c.com", "success", 60000, 3),
        makeDomainResult("d.com", "failed", 20000, 0, ["Connection timeout"]),
        makeDomainResult("e.com", "failed", 15000, 0, ["403 Forbidden"]),
      ],
      progressPercent: 100,
    };

    const summary = formatBatchSummary(status);

    expect(summary).toContain("Batch Attack Summary");
    expect(summary).toContain("batch-test-12345678");
    expect(summary).toContain("Success: 3");
    expect(summary).toContain("Failed: 2");
    expect(summary).toContain("60%"); // 3/5 = 60%
    expect(summary).toContain("a.com");
    expect(summary).toContain("Connection timeout");
  });

  it("includes cancelled note when batch was cancelled", () => {
    const status: BatchStatus = {
      batchId: "batch-cancelled-123",
      startedAt: Date.now() - 60000,
      totalDomains: 10,
      pending: 5,
      running: 0,
      success: 3,
      failed: 2,
      skipped: 0,
      cancelled: true,
      redirectUrl: "https://redirect.example.com",
      domains: [],
      progressPercent: 50,
    };

    const summary = formatBatchSummary(status);
    expect(summary).toContain("cancelled");
  });
});

// ═══════════════════════════════════════════════════════
//  formatDomainResult
// ═══════════════════════════════════════════════════════

describe("formatDomainResult", () => {
  it("formats a successful domain result", () => {
    const dr = makeDomainResult("example.com", "success", 30000, 2, [], 1);
    const result = formatDomainResult(dr);
    expect(result).toContain("✅");
    expect(result).toContain("example.com");
    expect(result).toContain("30s");
    expect(result).toContain("Verified: 2");
  });

  it("formats a failed domain result", () => {
    const dr = makeDomainResult("failed.com", "failed", 10000, 0, ["Connection refused"]);
    const result = formatDomainResult(dr);
    expect(result).toContain("❌");
    expect(result).toContain("failed.com");
    expect(result).toContain("Connection refused");
  });

  it("shows retry count when retries occurred", () => {
    const dr = makeDomainResult("retried.com", "success", 60000, 1, [], 2);
    dr.retryCount = 2;
    const result = formatDomainResult(dr);
    expect(result).toContain("2 retries");
  });
});

// ═══════════════════════════════════════════════════════
//  Active Batches Registry
// ═══════════════════════════════════════════════════════

describe("active batches registry", () => {
  it("returns null for non-existent batch", () => {
    const result = getActiveBatch("non-existent-batch-id");
    expect(result).toBeNull();
  });

  it("getAllActiveBatches returns array (may be empty)", () => {
    const result = getAllActiveBatches();
    expect(Array.isArray(result)).toBe(true);
  });

  it("cancelBatch returns false for non-existent batch", () => {
    const result = cancelBatch("non-existent-batch-id");
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════

function makeDomainResult(
  domain: string,
  status: DomainResult["status"],
  durationMs: number,
  verifiedRedirects: number,
  errors: string[] = [],
  retryCount = 0,
): DomainResult {
  return {
    domain,
    status,
    startedAt: Date.now() - durationMs,
    completedAt: Date.now(),
    durationMs,
    retryCount,
    redirectUrl: "https://redirect.example.com",
    verifiedRedirects,
    uploadedFiles: status === "success" ? 3 : 0,
    shellsGenerated: status === "success" ? 5 : 0,
    errors,
  };
}
