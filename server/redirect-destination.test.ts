import { describe, it, expect } from "vitest";

/**
 * Tests for redirect destination verification logic.
 * These test the urlsMatchDestination helper and VerificationResult interface
 * used by the unified-attack-pipeline.
 */

// ─── urlsMatchDestination logic (replicated for unit testing) ───

function urlsMatchDestination(actual: string, expected: string): boolean {
  try {
    const a = new URL(actual);
    const e = new URL(expected);
    if (a.hostname.toLowerCase() !== e.hostname.toLowerCase()) return false;
    const normPath = (p: string) => p.replace(/\/+$/, "") || "/";
    if (normPath(a.pathname) !== normPath(e.pathname) && normPath(e.pathname) !== "/") return false;
    return true;
  } catch {
    return actual.includes(expected) || expected.includes(actual);
  }
}

describe("urlsMatchDestination", () => {
  it("should match exact same URL", () => {
    expect(urlsMatchDestination("https://example.com/page", "https://example.com/page")).toBe(true);
  });

  it("should match with trailing slash difference", () => {
    expect(urlsMatchDestination("https://example.com/page/", "https://example.com/page")).toBe(true);
    expect(urlsMatchDestination("https://example.com/page", "https://example.com/page/")).toBe(true);
  });

  it("should match different protocols (http vs https)", () => {
    expect(urlsMatchDestination("http://example.com/page", "https://example.com/page")).toBe(true);
  });

  it("should match with query params in actual (expected is root)", () => {
    expect(urlsMatchDestination("https://example.com/?ref=123", "https://example.com")).toBe(true);
  });

  it("should NOT match different hostnames", () => {
    expect(urlsMatchDestination("https://evil.com/page", "https://example.com/page")).toBe(false);
  });

  it("should NOT match different paths", () => {
    expect(urlsMatchDestination("https://example.com/wrong", "https://example.com/page")).toBe(false);
  });

  it("should match when expected path is root (any path on same host)", () => {
    expect(urlsMatchDestination("https://example.com/any/path", "https://example.com/")).toBe(true);
    expect(urlsMatchDestination("https://example.com/any/path", "https://example.com")).toBe(true);
  });

  it("should be case-insensitive for hostname", () => {
    expect(urlsMatchDestination("https://EXAMPLE.COM/page", "https://example.com/page")).toBe(true);
  });

  it("should handle subdomain differences", () => {
    expect(urlsMatchDestination("https://www.example.com/page", "https://example.com/page")).toBe(false);
  });

  it("should fallback to string containment for invalid URLs", () => {
    expect(urlsMatchDestination("not-a-url-but-contains-example.com", "example.com")).toBe(true);
    expect(urlsMatchDestination("completely-different", "example.com")).toBe(false);
  });
});

// ─── VerificationResult interface tests ───

interface VerificationResult {
  verified: boolean;
  redirectWorks: boolean;
  redirectDestinationMatch: boolean;
  finalDestination: string;
  httpStatus: number;
  phpNotExecuting?: boolean;
  redirectChain?: string[];
}

describe("VerificationResult classification", () => {
  it("full success: redirect works + destination matches", () => {
    const result: VerificationResult = {
      verified: true,
      redirectWorks: true,
      redirectDestinationMatch: true,
      finalDestination: "https://target.com",
      httpStatus: 301,
      redirectChain: ["https://victim.com/shell.php?r=1", "https://target.com"],
    };
    expect(result.redirectWorks && result.redirectDestinationMatch).toBe(true);
  });

  it("partial success: redirect works but wrong destination", () => {
    const result: VerificationResult = {
      verified: true,
      redirectWorks: true,
      redirectDestinationMatch: false,
      finalDestination: "https://wrong-site.com",
      httpStatus: 302,
      redirectChain: ["https://victim.com/shell.php?r=1", "https://wrong-site.com"],
    };
    expect(result.redirectWorks).toBe(true);
    expect(result.redirectDestinationMatch).toBe(false);
  });

  it("file deployed but no redirect", () => {
    const result: VerificationResult = {
      verified: true,
      redirectWorks: false,
      redirectDestinationMatch: false,
      finalDestination: "",
      httpStatus: 200,
    };
    expect(result.verified).toBe(true);
    expect(result.redirectWorks).toBe(false);
  });

  it("PHP not executing detection", () => {
    const result: VerificationResult = {
      verified: true,
      redirectWorks: false,
      redirectDestinationMatch: false,
      finalDestination: "",
      httpStatus: 200,
      phpNotExecuting: true,
    };
    expect(result.phpNotExecuting).toBe(true);
    expect(result.redirectWorks).toBe(false);
  });

  it("complete failure: file not accessible", () => {
    const result: VerificationResult = {
      verified: false,
      redirectWorks: false,
      redirectDestinationMatch: false,
      finalDestination: "",
      httpStatus: 404,
    };
    expect(result.verified).toBe(false);
  });
});

// ─── Pipeline success determination logic ───

interface UploadedFile {
  url: string;
  method: string;
  verified: boolean;
  redirectWorks: boolean;
  redirectDestinationMatch: boolean;
  finalDestination: string;
  httpStatus: number;
}

function determineSuccess(uploadedFiles: UploadedFile[]) {
  const verifiedFiles = uploadedFiles.filter(f => f.verified);
  const redirectWorkingFiles = uploadedFiles.filter(f => f.redirectWorks);
  const destinationMatchFiles = uploadedFiles.filter(f => f.redirectWorks && f.redirectDestinationMatch);
  const realVerifiedFiles = verifiedFiles.filter(f => !f.method.startsWith("shellless_"));
  const shelllessVerifiedFiles = verifiedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks && f.redirectDestinationMatch);

  const fullSuccess = destinationMatchFiles.length > 0;
  const partialSuccess = !fullSuccess && redirectWorkingFiles.length > 0;
  const fileDeployed = !fullSuccess && !partialSuccess && realVerifiedFiles.length > 0;
  const success = fullSuccess || partialSuccess || fileDeployed;

  return { fullSuccess, partialSuccess, fileDeployed, success };
}

describe("Pipeline success determination", () => {
  it("fullSuccess when redirect matches destination", () => {
    const files: UploadedFile[] = [{
      url: "https://victim.com/shell.php",
      method: "form_upload",
      verified: true,
      redirectWorks: true,
      redirectDestinationMatch: true,
      finalDestination: "https://target.com",
      httpStatus: 301,
    }];
    const result = determineSuccess(files);
    expect(result.fullSuccess).toBe(true);
    expect(result.partialSuccess).toBe(false);
    expect(result.success).toBe(true);
  });

  it("partialSuccess when redirect works but wrong destination", () => {
    const files: UploadedFile[] = [{
      url: "https://victim.com/shell.php",
      method: "form_upload",
      verified: true,
      redirectWorks: true,
      redirectDestinationMatch: false,
      finalDestination: "https://wrong.com",
      httpStatus: 302,
    }];
    const result = determineSuccess(files);
    expect(result.fullSuccess).toBe(false);
    expect(result.partialSuccess).toBe(true);
    expect(result.success).toBe(true);
  });

  it("fileDeployed when file accessible but no redirect", () => {
    const files: UploadedFile[] = [{
      url: "https://victim.com/shell.php",
      method: "form_upload",
      verified: true,
      redirectWorks: false,
      redirectDestinationMatch: false,
      finalDestination: "",
      httpStatus: 200,
    }];
    const result = determineSuccess(files);
    expect(result.fullSuccess).toBe(false);
    expect(result.partialSuccess).toBe(false);
    expect(result.fileDeployed).toBe(true);
    expect(result.success).toBe(true);
  });

  it("failure when nothing works", () => {
    const files: UploadedFile[] = [];
    const result = determineSuccess(files);
    expect(result.fullSuccess).toBe(false);
    expect(result.partialSuccess).toBe(false);
    expect(result.fileDeployed).toBe(false);
    expect(result.success).toBe(false);
  });

  it("shellless with redirect but wrong destination = NOT fullSuccess", () => {
    const files: UploadedFile[] = [{
      url: "https://victim.com",
      method: "shellless_server_config_injection",
      verified: false,
      redirectWorks: true,
      redirectDestinationMatch: false,
      finalDestination: "https://wrong.com",
      httpStatus: 200,
    }];
    const result = determineSuccess(files);
    expect(result.fullSuccess).toBe(false);
    expect(result.partialSuccess).toBe(true);
    expect(result.success).toBe(true);
  });

  it("shellless with redirect AND correct destination = fullSuccess", () => {
    const files: UploadedFile[] = [{
      url: "https://victim.com",
      method: "shellless_server_config_injection",
      verified: true,
      redirectWorks: true,
      redirectDestinationMatch: true,
      finalDestination: "https://target.com",
      httpStatus: 301,
    }];
    const result = determineSuccess(files);
    expect(result.fullSuccess).toBe(true);
    expect(result.success).toBe(true);
  });

  it("multiple files: one matches, one doesn't = fullSuccess", () => {
    const files: UploadedFile[] = [
      {
        url: "https://victim.com/shell1.php",
        method: "form_upload",
        verified: true,
        redirectWorks: true,
        redirectDestinationMatch: false,
        finalDestination: "https://wrong.com",
        httpStatus: 302,
      },
      {
        url: "https://victim.com/shell2.html",
        method: "form_upload_php_fallback",
        verified: true,
        redirectWorks: true,
        redirectDestinationMatch: true,
        finalDestination: "https://target.com",
        httpStatus: 200,
      },
    ];
    const result = determineSuccess(files);
    expect(result.fullSuccess).toBe(true);
    expect(result.success).toBe(true);
  });

  it("file verified but 403 = not verified", () => {
    const files: UploadedFile[] = [{
      url: "https://victim.com/shell.php",
      method: "form_upload",
      verified: false,
      redirectWorks: false,
      redirectDestinationMatch: false,
      finalDestination: "",
      httpStatus: 403,
    }];
    const result = determineSuccess(files);
    expect(result.success).toBe(false);
  });
});

// ─── Redirect chain tests ───

describe("Redirect chain analysis", () => {
  it("single hop redirect chain", () => {
    const chain = ["https://victim.com/shell.php?r=1", "https://target.com"];
    expect(chain.length).toBe(2);
    expect(chain[chain.length - 1]).toBe("https://target.com");
  });

  it("multi-hop redirect chain", () => {
    const chain = [
      "https://victim.com/shell.php?r=1",
      "https://intermediate.com/redirect",
      "https://target.com",
    ];
    expect(chain.length).toBe(3);
    expect(chain[chain.length - 1]).toBe("https://target.com");
  });

  it("no redirect (single entry)", () => {
    const chain = ["https://victim.com/shell.php?r=1"];
    expect(chain.length).toBe(1);
    // No redirect happened
  });

  it("destination match checks final URL in chain", () => {
    const chain = [
      "https://victim.com/shell.php?r=1",
      "https://cdn.target.com/landing",
      "https://target.com/",
    ];
    const finalUrl = chain[chain.length - 1];
    expect(urlsMatchDestination(finalUrl, "https://target.com")).toBe(true);
  });

  it("destination mismatch when chain ends at wrong host", () => {
    const chain = [
      "https://victim.com/shell.php?r=1",
      "https://evil.com/phishing",
    ];
    const finalUrl = chain[chain.length - 1];
    expect(urlsMatchDestination(finalUrl, "https://target.com")).toBe(false);
  });
});
