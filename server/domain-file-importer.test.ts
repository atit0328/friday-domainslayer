import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════
//  Domain File Importer — Unit Tests
// ═══════════════════════════════════════════════

describe("Domain File Importer — parseDomainList", () => {
  it("parses simple domain list (one per line)", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `example.com
test.org
mysite.net`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(3);
    expect(result.domains).toContain("example.com");
    expect(result.domains).toContain("test.org");
    expect(result.domains).toContain("mysite.net");
    expect(result.invalid).toHaveLength(0);
  });

  it("handles URLs with protocol", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `https://example.com
http://test.org
https://www.mysite.net/page/path?q=1`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(3);
    expect(result.domains).toContain("example.com");
    expect(result.domains).toContain("test.org");
    expect(result.domains).toContain("mysite.net");
  });

  it("strips www. prefix", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `www.example.com
www.test.org`;

    const result = parseDomainList(text);
    expect(result.domains).toContain("example.com");
    expect(result.domains).toContain("test.org");
  });

  it("skips comments and empty lines", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `# This is a comment
example.com

// Another comment

test.org
# Skip this too
mysite.net`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(3);
    expect(result.domains).toContain("example.com");
    expect(result.domains).toContain("test.org");
    expect(result.domains).toContain("mysite.net");
  });

  it("handles comma-separated domains", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `example.com, test.org, mysite.net`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(3);
  });

  it("handles tab-separated domains", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `example.com\ttest.org\tmysite.net`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(3);
  });

  it("deduplicates domains (case-insensitive)", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `example.com
Example.COM
EXAMPLE.com
test.org
TEST.ORG`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(2);
    expect(result.domains).toContain("example.com");
    expect(result.domains).toContain("test.org");
  });

  it("removes port numbers", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `example.com:8080
test.org:443`;

    const result = parseDomainList(text);
    expect(result.domains).toContain("example.com");
    expect(result.domains).toContain("test.org");
  });

  it("identifies invalid entries", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `example.com
not-a-domain
just_text
123
test.org`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(2);
    expect(result.invalid.length).toBeGreaterThan(0);
  });

  it("handles quoted domains", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `"example.com"
'test.org'`;

    const result = parseDomainList(text);
    expect(result.domains).toContain("example.com");
    expect(result.domains).toContain("test.org");
  });

  it("handles Windows-style line endings (CRLF)", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = "example.com\r\ntest.org\r\nmysite.net\r\n";

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(3);
  });

  it("handles large domain lists efficiently", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const domains = Array.from({ length: 500 }, (_, i) => `site${i}.com`);
    const text = domains.join("\n");

    const start = Date.now();
    const result = parseDomainList(text);
    const elapsed = Date.now() - start;

    expect(result.domains).toHaveLength(500);
    expect(elapsed).toBeLessThan(1000); // Should be fast
  });

  it("handles mixed format input", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `# Target domains for attack
https://competitor1.com/page
http://www.competitor2.net
competitor3.org:8080
"competitor4.io"
competitor5.co.th, competitor6.com

# More targets
www.competitor7.com`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(7);
    expect(result.domains).toContain("competitor1.com");
    expect(result.domains).toContain("competitor2.net");
    expect(result.domains).toContain("competitor3.org");
    expect(result.domains).toContain("competitor4.io");
    expect(result.domains).toContain("competitor5.co.th");
    expect(result.domains).toContain("competitor6.com");
    expect(result.domains).toContain("competitor7.com");
  });
});

describe("Domain File Importer — Import Summary", () => {
  it("returns correct initial summary", async () => {
    const { getImportSummary } = await import("./domain-file-importer");

    const summary = getImportSummary();
    expect(summary).toHaveProperty("totalImports");
    expect(summary).toHaveProperty("totalDomainsImported");
    expect(summary).toHaveProperty("totalDuplicatesSkipped");
    expect(summary).toHaveProperty("totalInvalid");
    expect(summary).toHaveProperty("lastImportAt");
  });
});

describe("Domain File Importer — Import History", () => {
  it("returns array of import results", async () => {
    const { getImportHistory } = await import("./domain-file-importer");

    const history = getImportHistory();
    expect(Array.isArray(history)).toBe(true);
  });
});

describe("Domain File Importer — Blacklist", () => {
  it("filters out blacklisted domains from parse results", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    // These should parse fine (blacklist is checked at import, not parse)
    const text = `google.com
facebook.com
competitor.com`;

    const result = parseDomainList(text);
    // parseDomainList doesn't filter blacklist — that's done at import level
    expect(result.domains).toHaveLength(3);
  });
});

describe("Domain File Importer — Edge Cases", () => {
  it("handles empty input", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const result = parseDomainList("");
    expect(result.domains).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
  });

  it("handles only comments", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `# Comment 1
# Comment 2
// Comment 3`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(0);
  });

  it("handles only whitespace", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `   
  
    `;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(0);
  });

  it("handles domains with subdomains", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `sub.example.com
deep.sub.example.com
api.test.org`;

    const result = parseDomainList(text);
    expect(result.domains).toHaveLength(3);
    expect(result.domains).toContain("sub.example.com");
    expect(result.domains).toContain("deep.sub.example.com");
    expect(result.domains).toContain("api.test.org");
  });

  it("handles trailing dots in domains", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `example.com.
test.org..`;

    const result = parseDomainList(text);
    expect(result.domains).toContain("example.com");
    expect(result.domains).toContain("test.org");
  });

  it("validates TLD requirement", async () => {
    const { parseDomainList } = await import("./domain-file-importer");

    const text = `nodot
localhost`;

    const result = parseDomainList(text);
    // These should be invalid (no TLD)
    expect(result.domains).toHaveLength(0);
    expect(result.invalid).toHaveLength(2);
  });
});
