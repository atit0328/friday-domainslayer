import { describe, it, expect } from "vitest";
import {
  generateParasiteSeoPhp,
  generateParasiteSeoHtml,
  generateParasiteSeoBundle,
  getDefaultKeywords,
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

describe("parasite-seo-injector", () => {
  describe("generateParasiteSeoPhp", () => {
    it("generates PHP payload with bot cloaking and rich SEO content", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      
      expect(result.shell).toBeDefined();
      expect(result.shell.type).toBe("seo_parasite");
      expect(result.shell.filename).toMatch(/\.php$/);
      expect(result.shell.contentType).toBe("application/x-php");
      
      const content = result.shell.content as string;
      // Has PHP bot cloaking
      expect(content).toContain("<?php");
      expect(content).toContain("googlebot");
      expect(content).toContain("header(\"Location:");
      
      // Has rich HTML content
      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("สล็อตเว็บตรง");
      expect(content).toContain(BASE_CONFIG.redirectUrl);
    });
    
    it("includes schema markup when enabled", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      const content = result.shell.content as string;
      
      expect(result.hasSchema).toBe(true);
      expect(content).toContain("application/ld+json");
      expect(content).toContain("FAQPage");
      expect(content).toContain("Article");
    });
    
    it("includes FAQ section when enabled", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      const content = result.shell.content as string;
      
      expect(result.hasFaq).toBe(true);
      expect(content).toContain("คำถามที่พบบ่อย");
    });
    
    it("includes comparison table when enabled", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      const content = result.shell.content as string;
      
      expect(result.hasComparisonTable).toBe(true);
      expect(content).toContain("<table");
      expect(content).toContain("RTP");
    });
    
    it("includes conditional JS redirect when enabled", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      const content = result.shell.content as string;
      
      expect(result.hasConditionalRedirect).toBe(true);
      expect(content).toContain("atob(");
      expect(content).toContain("fromSearch");
      expect(content).toContain("isMobile");
    });
    
    it("has reasonable SEO score", () => {
      const result = generateParasiteSeoPhp(BASE_CONFIG);
      expect(result.seoScore).toBeGreaterThanOrEqual(80);
      expect(result.wordCount).toBeGreaterThan(200);
    });
    
    it("generates short content variant", () => {
      const result = generateParasiteSeoPhp({ ...BASE_CONFIG, contentLength: "short" });
      const fullResult = generateParasiteSeoPhp(BASE_CONFIG);
      expect(result.wordCount).toBeLessThan(fullResult.wordCount);
    });
  });
  
  describe("generateParasiteSeoHtml", () => {
    it("generates HTML-only payload without PHP", () => {
      const result = generateParasiteSeoHtml(BASE_CONFIG);
      const content = result.shell.content as string;
      
      expect(result.shell.type).toBe("redirect_html");
      expect(result.shell.filename).toMatch(/\.html$/);
      expect(content).not.toContain("<?php");
      expect(content).toContain("atob("); // Has JS conditional redirect
      expect(content).toContain("<!DOCTYPE html>");
    });
  });
  
  describe("generateParasiteSeoBundle", () => {
    it("generates multiple payload variants", () => {
      const bundle = generateParasiteSeoBundle(
        "https://pgwin828b.com/register",
        ["สล็อตเว็บตรง", "เว็บพนันออนไลน์"],
      );
      
      expect(bundle.length).toBe(4);
      
      // Should have both PHP and HTML variants
      const types = bundle.map(p => p.shell.type);
      expect(types).toContain("seo_parasite");
      expect(types).toContain("redirect_html");
      
      // All should have unique IDs
      const ids = bundle.map(p => p.shell.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
  
  describe("getDefaultKeywords", () => {
    it("returns Thai gambling keywords for gambling style", () => {
      const keywords = getDefaultKeywords("gambling");
      expect(keywords.length).toBeGreaterThanOrEqual(5);
      expect(keywords.some(k => k.includes("สล็อต") || k.includes("เว็บ"))).toBe(true);
    });
    
    it("returns English keywords for generic style", () => {
      const keywords = getDefaultKeywords("generic");
      expect(keywords.length).toBeGreaterThanOrEqual(3);
    });
  });
});
