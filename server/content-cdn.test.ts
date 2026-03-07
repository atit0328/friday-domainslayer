import { describe, it, expect, vi } from "vitest";
import type { CdnUploadConfig, CdnUploadResult } from "./content-cdn";

// Mock storagePut since we don't want to actually upload to S3 in tests
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "test-key",
    url: "https://cdn.example.com/test-key",
  }),
}));

describe("Content CDN", () => {
  it("should export uploadContentToCdn function", async () => {
    const mod = await import("./content-cdn");
    expect(typeof mod.uploadContentToCdn).toBe("function");
  });

  it("should export CdnUploadConfig type", async () => {
    // Type check - if this compiles, the type exists
    const config: CdnUploadConfig = {
      primaryKeyword: "สล็อต",
      keywords: ["สล็อต", "บาคาร่า"],
      brandName: "SlotXO",
      redirectUrl: "https://gambling.com",
      targetDomain: "example.com",
      htmlContent: "<html><body>Test</body></html>",
    };
    expect(config.primaryKeyword).toBe("สล็อต");
  });

  it("should upload main page content to CDN", async () => {
    const { uploadContentToCdn } = await import("./content-cdn");
    
    const config: CdnUploadConfig = {
      primaryKeyword: "สล็อต",
      keywords: ["สล็อต", "บาคาร่า"],
      brandName: "SlotXO",
      redirectUrl: "https://gambling.com",
      targetDomain: "example.com",
      htmlContent: "<html><body><h1>สล็อตออนไลน์</h1></body></html>",
    };

    const result = await uploadContentToCdn(config);
    
    expect(result.success).toBe(true);
    expect(result.mainPageUrl).toBeTruthy();
    expect(result.allUrls.length).toBeGreaterThan(0);
  });

  it("should upload doorway pages to CDN", async () => {
    const { uploadContentToCdn } = await import("./content-cdn");
    
    const config: CdnUploadConfig = {
      primaryKeyword: "สล็อต",
      keywords: ["สล็อต", "บาคาร่า"],
      brandName: "SlotXO",
      redirectUrl: "https://gambling.com",
      targetDomain: "example.com",
      htmlContent: "<html><body>Main</body></html>",
      doorwayPages: [
        { slug: "signup", html: "<html><body>สมัคร</body></html>" },
        { slug: "bonus", html: "<html><body>โบนัส</body></html>" },
      ],
    };

    const result = await uploadContentToCdn(config);
    
    expect(result.success).toBe(true);
    expect(result.doorwayPageUrls.length).toBe(2);
    expect(result.doorwayPageUrls[0].slug).toBe("signup");
    expect(result.doorwayPageUrls[1].slug).toBe("bonus");
  });

  it("should generate unique content key prefix", async () => {
    const { uploadContentToCdn } = await import("./content-cdn");
    
    const config: CdnUploadConfig = {
      primaryKeyword: "บาคาร่า",
      keywords: ["บาคาร่า"],
      brandName: "TestBrand",
      redirectUrl: "https://test.com",
      targetDomain: "target.com",
      htmlContent: "<html>Test</html>",
    };

    const result1 = await uploadContentToCdn(config);
    const result2 = await uploadContentToCdn(config);
    
    // Each upload should have a unique prefix
    expect(result1.contentKeyPrefix).not.toBe(result2.contentKeyPrefix);
  });

  it("should handle upload errors gracefully", async () => {
    // Re-mock with error
    const storage = await import("./storage");
    vi.mocked(storage.storagePut).mockRejectedValueOnce(new Error("S3 upload failed"));
    
    const { uploadContentToCdn } = await import("./content-cdn");
    
    const config: CdnUploadConfig = {
      primaryKeyword: "หวย",
      keywords: ["หวย"],
      brandName: "LottoBrand",
      redirectUrl: "https://lotto.com",
      targetDomain: "target.com",
      htmlContent: "<html>Test</html>",
    };

    const result = await uploadContentToCdn(config);
    
    // Should not throw, but may have errors
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
  });
});
