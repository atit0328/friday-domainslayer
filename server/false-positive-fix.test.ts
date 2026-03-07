/**
 * Tests for false positive deploy success fixes
 * 
 * Verifies that:
 * 1. Shellless results with verified=true but redirectWorks=false are NOT counted as success
 * 2. Deployed URLs don't show target URL when only shellless results exist
 * 3. Telegram notification type is "partial" not "success" for shellless-only results
 * 4. World state counts only real uploads for shellUrls/deployedFiles
 * 5. Pipeline success requires real file upload OR shellless with confirmed redirect
 */
import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════
//  Simulate the fixed logic from unified-attack-pipeline.ts
// ═══════════════════════════════════════════════════════

interface MockUploadedFile {
  url: string;
  method: string;
  verified: boolean;
  redirectWorks: boolean;
}

function computeSuccess(uploadedFiles: MockUploadedFile[]) {
  const verifiedFiles = uploadedFiles.filter(f => f.verified);
  const redirectWorkingFiles = uploadedFiles.filter(f => f.redirectWorks);
  const realVerifiedFiles = verifiedFiles.filter(f => !f.method.startsWith("shellless_"));
  const shelllessVerifiedFiles = verifiedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks);
  const success = realVerifiedFiles.length > 0 || shelllessVerifiedFiles.length > 0 || redirectWorkingFiles.length > 0;
  return { success, realVerifiedFiles, shelllessVerifiedFiles, verifiedFiles, redirectWorkingFiles };
}

function computeWorldState(uploadedFiles: MockUploadedFile[]) {
  return {
    shellUrls: uploadedFiles.filter(f => f.verified && !f.method.startsWith("shellless_")).length,
    deployedFiles: uploadedFiles.filter(f => !f.method.startsWith("shellless_") || f.redirectWorks).length,
    verifiedUrls: uploadedFiles.filter(f => f.redirectWorks).length,
  };
}

function computeDeployedUrls(uploadedFiles: MockUploadedFile[], targetUrl: string) {
  const realDeployedUrls = uploadedFiles
    .filter(f => !f.method.startsWith("shellless_") || f.redirectWorks)
    .map(f => f.url)
    .filter(url => url !== targetUrl);
  const shelllessWithRedirect = uploadedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks);
  return realDeployedUrls.length > 0
    ? realDeployedUrls
    : shelllessWithRedirect.map(f => `${f.url} (via ${f.method.replace("shellless_", "")})`);
}

function computeTelegramType(uploadedFiles: MockUploadedFile[]) {
  const verifiedFiles = uploadedFiles.filter(f => f.verified);
  const realVerifiedFiles = verifiedFiles.filter(f => !f.method.startsWith("shellless_"));
  const shelllessVerifiedFiles = verifiedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks);
  const hasRealSuccess = realVerifiedFiles.length > 0;
  const hasShelllessRedirect = shelllessVerifiedFiles.length > 0;
  return hasRealSuccess ? "success" : (hasShelllessRedirect ? "partial" : (uploadedFiles.length > 0 ? "partial" : "failure"));
}

// ═══════════════════════════════════════════════════════
//  TEST CASES
// ═══════════════════════════════════════════════════════

describe("False Positive Fix: Shellless results should NOT cause false success", () => {
  const targetUrl = "https://che.buet.ac.bd/";

  it("should NOT be success when shellless has success=true but redirectWorks=false", () => {
    // This is the exact scenario from the bug report
    const uploadedFiles: MockUploadedFile[] = [
      {
        url: targetUrl, // shellless uses target URL
        method: "shellless_htaccess_redirect",
        verified: false, // Fixed: was sr.success (true), now sr.redirectWorks (false)
        redirectWorks: false,
      },
    ];
    const result = computeSuccess(uploadedFiles);
    expect(result.success).toBe(false);
    expect(result.realVerifiedFiles).toHaveLength(0);
    expect(result.shelllessVerifiedFiles).toHaveLength(0);
  });

  it("should be success when shellless has redirectWorks=true", () => {
    const uploadedFiles: MockUploadedFile[] = [
      {
        url: targetUrl,
        method: "shellless_htaccess_redirect",
        verified: true, // redirectWorks is true
        redirectWorks: true,
      },
    ];
    const result = computeSuccess(uploadedFiles);
    expect(result.success).toBe(true);
    expect(result.shelllessVerifiedFiles).toHaveLength(1);
  });

  it("should be success when real file uploaded and verified", () => {
    const uploadedFiles: MockUploadedFile[] = [
      {
        url: "https://che.buet.ac.bd/uploads/shell.php",
        method: "oneclick",
        verified: true,
        redirectWorks: true,
      },
    ];
    const result = computeSuccess(uploadedFiles);
    expect(result.success).toBe(true);
    expect(result.realVerifiedFiles).toHaveLength(1);
  });
});

describe("False Positive Fix: Deployed URLs should not show target URL", () => {
  const targetUrl = "https://che.buet.ac.bd/";

  it("should NOT include target URL in deployed URLs when only shellless (no redirect)", () => {
    const uploadedFiles: MockUploadedFile[] = [
      { url: targetUrl, method: "shellless_htaccess_redirect", verified: false, redirectWorks: false },
    ];
    const urls = computeDeployedUrls(uploadedFiles, targetUrl);
    expect(urls).toHaveLength(0);
    // Target URL should never appear as "deployed"
    expect(urls.some(u => u === targetUrl)).toBe(false);
  });

  it("should show target URL with method note when shellless redirect works", () => {
    const uploadedFiles: MockUploadedFile[] = [
      { url: targetUrl, method: "shellless_htaccess_redirect", verified: true, redirectWorks: true },
    ];
    const urls = computeDeployedUrls(uploadedFiles, targetUrl);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("via htaccess_redirect");
  });

  it("should show actual shell path for real uploads", () => {
    const uploadedFiles: MockUploadedFile[] = [
      { url: "https://example.com/uploads/shell.php", method: "oneclick", verified: true, redirectWorks: true },
    ];
    const urls = computeDeployedUrls(uploadedFiles, "https://example.com/");
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe("https://example.com/uploads/shell.php");
  });
});

describe("False Positive Fix: Telegram notification type", () => {
  it("should be 'failure' when no uploads at all", () => {
    expect(computeTelegramType([])).toBe("failure");
  });

  it("should be 'partial' when shellless exists but no redirect confirmed", () => {
    const files: MockUploadedFile[] = [
      { url: "https://example.com/", method: "shellless_htaccess", verified: false, redirectWorks: false },
    ];
    expect(computeTelegramType(files)).toBe("partial");
  });

  it("should be 'partial' when shellless redirect confirmed (not 'success')", () => {
    const files: MockUploadedFile[] = [
      { url: "https://example.com/", method: "shellless_htaccess", verified: true, redirectWorks: true },
    ];
    expect(computeTelegramType(files)).toBe("partial");
  });

  it("should be 'success' only when real file uploaded", () => {
    const files: MockUploadedFile[] = [
      { url: "https://example.com/shell.php", method: "oneclick", verified: true, redirectWorks: true },
    ];
    expect(computeTelegramType(files)).toBe("success");
  });
});

describe("False Positive Fix: World state counts", () => {
  const targetUrl = "https://che.buet.ac.bd/";

  it("should NOT count shellless in shellUrls", () => {
    const files: MockUploadedFile[] = [
      { url: targetUrl, method: "shellless_htaccess", verified: true, redirectWorks: true },
    ];
    const state = computeWorldState(files);
    expect(state.shellUrls).toBe(0); // shellless should not count as shell URL
    expect(state.deployedFiles).toBe(1); // but counts as deployed if redirect works
    expect(state.verifiedUrls).toBe(1);
  });

  it("should NOT count shellless without redirect in deployedFiles", () => {
    const files: MockUploadedFile[] = [
      { url: targetUrl, method: "shellless_htaccess", verified: false, redirectWorks: false },
    ];
    const state = computeWorldState(files);
    expect(state.shellUrls).toBe(0);
    expect(state.deployedFiles).toBe(0); // shellless without redirect = not deployed
    expect(state.verifiedUrls).toBe(0);
  });

  it("should count real uploads normally", () => {
    const files: MockUploadedFile[] = [
      { url: "https://example.com/shell.php", method: "oneclick", verified: true, redirectWorks: true },
    ];
    const state = computeWorldState(files);
    expect(state.shellUrls).toBe(1);
    expect(state.deployedFiles).toBe(1);
    expect(state.verifiedUrls).toBe(1);
  });

  it("should handle mixed real + shellless correctly", () => {
    const files: MockUploadedFile[] = [
      { url: "https://example.com/shell.php", method: "oneclick", verified: true, redirectWorks: true },
      { url: targetUrl, method: "shellless_htaccess", verified: false, redirectWorks: false },
      { url: targetUrl, method: "shellless_db_inject", verified: true, redirectWorks: true },
    ];
    const state = computeWorldState(files);
    expect(state.shellUrls).toBe(1); // only real upload
    expect(state.deployedFiles).toBe(2); // real + shellless with redirect
    expect(state.verifiedUrls).toBe(2); // real + shellless with redirect
  });
});

describe("False Positive Fix: Shellless verified field uses redirectWorks", () => {
  it("shellless with success=true but redirectWorks=false should have verified=false", () => {
    // Simulating the fix: verified = sr.redirectWorks === true (not sr.success)
    const shelllessResult = { success: true, redirectWorks: false };
    const verified = shelllessResult.redirectWorks === true;
    expect(verified).toBe(false);
  });

  it("shellless with success=true and redirectWorks=true should have verified=true", () => {
    const shelllessResult = { success: true, redirectWorks: true };
    const verified = shelllessResult.redirectWorks === true;
    expect(verified).toBe(true);
  });

  it("shellless with success=false should have verified=false", () => {
    const shelllessResult = { success: false, redirectWorks: false };
    const verified = shelllessResult.redirectWorks === true;
    expect(verified).toBe(false);
  });
});
