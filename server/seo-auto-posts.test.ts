/**
 * Tests for Auto-Generate SEO Posts Engine
 */
import { describe, it, expect } from "vitest";
import {
  generateSeoPosts,
  getPostTopicsForCategory,
} from "./seo-auto-posts";

describe("seo-auto-posts", () => {
  describe("getPostTopicsForCategory", () => {
    it("should return topics for slots category", () => {
      const topics = getPostTopicsForCategory("slots");
      expect(topics.length).toBeGreaterThan(0);
      topics.forEach(t => {
        expect(t.slug).toBeTruthy();
        expect(t.title).toBeTruthy();
        expect(t.focusKeyword).toBeTruthy();
        expect(t.outline.length).toBeGreaterThan(0);
      });
    });

    it("should return topics for lottery category", () => {
      const topics = getPostTopicsForCategory("lottery");
      expect(topics.length).toBeGreaterThan(0);
      topics.forEach(t => {
        expect(t.slug).toBeTruthy();
        expect(t.focusKeyword).toBeTruthy();
      });
    });

    it("should return topics for baccarat category", () => {
      const topics = getPostTopicsForCategory("baccarat");
      expect(topics.length).toBeGreaterThan(0);
    });

    it("topics should have secondary keywords", () => {
      const topics = getPostTopicsForCategory("slots");
      topics.forEach(t => {
        expect(t.secondaryKeywords.length).toBeGreaterThan(0);
      });
    });
  });

  describe("generateSeoPosts", () => {
    it("should generate 15 posts by default", () => {
      const result = generateSeoPosts({
        domain: "test-slots.com",
        siteName: "TestSlots",
        category: "slots",
      });
      expect(result.posts.length).toBe(15);
      expect(result.totalWordCount).toBeGreaterThan(0);
      expect(result.totalInternalLinks).toBeGreaterThan(0);
    });

    it("should generate custom number of posts", () => {
      const result = generateSeoPosts({
        domain: "test-lottery.com",
        siteName: "TestLottery",
        category: "lottery",
        postCount: 5,
      });
      expect(result.posts.length).toBe(5);
    });

    it("should generate posts with correct structure", () => {
      const result = generateSeoPosts({
        domain: "test-baccarat.com",
        siteName: "TestBaccarat",
        category: "baccarat",
        postCount: 3,
      });
      result.posts.forEach(post => {
        expect(post.title).toBeTruthy();
        expect(post.slug).toBeTruthy();
        expect(post.html).toContain("<");
        expect(post.focusKeyword).toBeTruthy();
        expect(post.wordCount).toBeGreaterThan(100);
        expect(post.excerpt).toBeTruthy();
        expect(post.categories.length).toBeGreaterThan(0);
        expect(post.tags.length).toBeGreaterThan(0);
      });
    });

    it("should generate internal links pointing to homepage", () => {
      const domain = "my-slots-site.com";
      const result = generateSeoPosts({
        domain,
        siteName: "MySlots",
        category: "slots",
        postCount: 3,
      });
      result.posts.forEach(post => {
        expect(post.internalLinks.length).toBeGreaterThan(0);
        // At least one link should point to homepage
        const hasHomepageLink = post.internalLinks.some(link =>
          link.url.includes(domain) && (link.url.endsWith("/") || link.url === `https://${domain}`)
        );
        expect(hasHomepageLink).toBe(true);
      });
    });

    it("should include schema markup in posts", () => {
      const result = generateSeoPosts({
        domain: "test.com",
        siteName: "Test",
        category: "slots",
        postCount: 2,
      });
      result.posts.forEach(post => {
        expect(post.html).toContain("application/ld+json");
      });
    });

    it("should include meta description in posts", () => {
      const result = generateSeoPosts({
        domain: "test.com",
        siteName: "Test",
        category: "lottery",
        postCount: 2,
      });
      result.posts.forEach(post => {
        expect(post.title).toBeTruthy();
        expect(post.metaDescription).toBeTruthy();
        expect(post.metaDescription.length).toBeLessThanOrEqual(200);
      });
    });

    it("should generate internal links in all posts", () => {
      const result = generateSeoPosts({
        domain: "test.com",
        siteName: "Test",
        category: "baccarat",
        postCount: 5,
      });
      // All posts should have internal links
      result.posts.forEach(post => {
        expect(post.internalLinks.length).toBeGreaterThan(0);
      });
      expect(result.totalInternalLinks).toBeGreaterThan(0);
    });

    it("should include custom keywords when provided", () => {
      const customKeywords = ["สล็อตเว็บตรง", "สล็อต888"];
      const result = generateSeoPosts({
        domain: "test.com",
        siteName: "Test",
        category: "slots",
        postCount: 3,
        customKeywords,
      });
      // At least one post should contain a custom keyword
      const allHtml = result.posts.map(p => p.html).join(" ");
      const hasCustomKeyword = customKeywords.some(kw => allHtml.includes(kw));
      expect(hasCustomKeyword).toBe(true);
    });

    it("should return categories and tags arrays", () => {
      const result = generateSeoPosts({
        domain: "test.com",
        siteName: "Test",
        category: "slots",
        postCount: 5,
      });
      expect(result.categories.length).toBeGreaterThan(0);
      expect(result.tags.length).toBeGreaterThan(0);
    });

    it("should handle max posts based on available topics", () => {
      const topics = getPostTopicsForCategory("lottery");
      const maxCount = Math.min(20, topics.length);
      const result = generateSeoPosts({
        domain: "test.com",
        siteName: "Test",
        category: "lottery",
        postCount: maxCount,
      });
      expect(result.posts.length).toBe(maxCount);
      expect(result.totalWordCount).toBeGreaterThan(5000);
    });

    it("should export deployPostsToWordPress function", async () => {
      const mod = await import("./seo-auto-posts");
      expect(typeof mod.deployPostsToWordPress).toBe("function");
    });

    it("should export rewritePostWithLLM function", async () => {
      const mod = await import("./seo-auto-posts");
      expect(typeof mod.rewritePostWithLLM).toBe("function");
    });
  });
});
