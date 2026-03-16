import { describe, it, expect, vi } from "vitest";
import {
  generateEvasionVariants,
  type CfBypassConfig,
  type CfBypassResult,
  type BypassFetchOptions,
  type WafEvasionTechnique,
} from "./cf-bypass";

describe("cf-bypass", () => {
  describe("generateEvasionVariants", () => {
    it("generates multiple evasion variants for a URL", () => {
      const variants = generateEvasionVariants(
        "https://example.com/wp-content/uploads/shell.php",
        { "Content-Type": "application/octet-stream" },
      );

      expect(Array.isArray(variants)).toBe(true);
      expect(variants.length).toBeGreaterThan(0);

      // Each variant should have url, headers, and technique name
      for (const v of variants) {
        expect(typeof v.url).toBe("string");
        expect(typeof v.headers).toBe("object");
        expect(typeof v.technique).toBe("string");
        expect(v.url.length).toBeGreaterThan(0);
        expect(v.technique.length).toBeGreaterThan(0);
      }
    });

    it("includes encoding-based evasion techniques", () => {
      const variants = generateEvasionVariants(
        "https://example.com/admin/upload.php",
        {},
      );

      // Should have at least some URL-encoded variants
      const hasEncodedVariant = variants.some(
        (v) => v.url.includes("%") || v.url !== "https://example.com/admin/upload.php"
      );
      expect(hasEncodedVariant).toBe(true);
    });

    it("transforms body when provided", () => {
      const variants = generateEvasionVariants(
        "https://example.com/upload",
        { "Content-Type": "multipart/form-data" },
        "file_content_here",
      );

      // Some variants should have transformed body
      const hasBody = variants.some((v) => v.body !== undefined);
      expect(hasBody).toBe(true);
    });

    it("preserves original headers while adding evasion headers", () => {
      const originalHeaders = {
        "Content-Type": "application/x-php",
        "Authorization": "Basic dGVzdDp0ZXN0",
      };

      const variants = generateEvasionVariants(
        "https://example.com/upload",
        originalHeaders,
      );

      // At least some variants should preserve Content-Type
      const preservesContentType = variants.some(
        (v) => v.headers["Content-Type"] === "application/x-php"
      );
      expect(preservesContentType).toBe(true);
    });
  });

  describe("CfBypassConfig type", () => {
    it("accepts minimal config", () => {
      const config: CfBypassConfig = {
        targetUrl: "https://example.com",
      };
      expect(config.targetUrl).toBe("https://example.com");
      expect(config.enableOriginDiscovery).toBeUndefined();
    });

    it("accepts full config with all options", () => {
      const config: CfBypassConfig = {
        targetUrl: "https://example.com",
        timeout: 30000,
        enableOriginDiscovery: true,
        enableHeaderManipulation: true,
        enableCacheBypass: true,
        enableWafEvasion: true,
        onProgress: (technique, detail) => {
          // progress callback
        },
      };
      expect(config.timeout).toBe(30000);
      expect(config.enableOriginDiscovery).toBe(true);
    });
  });

  describe("CfBypassResult type", () => {
    it("has correct structure", () => {
      const result: CfBypassResult = {
        bypassed: true,
        techniques: [
          {
            name: "origin_ip_discovery",
            success: true,
            detail: "Found origin IP: 1.2.3.4",
            duration: 5000,
          },
        ],
        originIp: "1.2.3.4",
        bypassHeaders: {
          "Host": "example.com",
          "X-Forwarded-For": "127.0.0.1",
        },
        bestTechnique: "origin_ip_discovery",
        wafDetection: null,
        evasionStrategy: null,
        duration: 5000,
      };

      expect(result.bypassed).toBe(true);
      expect(result.originIp).toBe("1.2.3.4");
      expect(result.techniques.length).toBe(1);
      expect(result.bestTechnique).toBe("origin_ip_discovery");
    });
  });

  describe("BypassFetchOptions type", () => {
    it("supports all HTTP methods", () => {
      const getOpts: BypassFetchOptions = { method: "GET" };
      const postOpts: BypassFetchOptions = { method: "POST", body: "data" };
      const putOpts: BypassFetchOptions = { method: "PUT", body: Buffer.from("data") };

      expect(getOpts.method).toBe("GET");
      expect(postOpts.method).toBe("POST");
      expect(putOpts.method).toBe("PUT");
    });
  });
});
