/**
 * DNS & Domain Level Attacks — Bypass CDN/WAF at the DNS/network layer
 * 
 * Vectors:
 * 1. Origin IP Discovery — find real IP behind Cloudflare/CDN, then attack directly
 * 2. Subdomain Takeover — find dangling CNAME records, claim abandoned subdomains
 * 3. DNS Rebinding — bypass same-origin policy to access internal services
 * 4. Subdomain Enumeration — discover hidden subdomains for more attack surface
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// Helper: wrap fetch with proxy pool
async function dnsFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  try {
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
    return response;
  } catch (e) {
    // Fallback to direct fetch if proxy fails
    return fetch(url, init);
  }
}


export interface DnsAttackResult {
  vector: string;
  success: boolean;
  detail: string;
  evidence: string;
  data?: {
    originIp?: string;
    subdomains?: string[];
    vulnerableSubdomains?: { subdomain: string; cname: string; service: string }[];
    dnsRecords?: Record<string, string[]>;
  };
}

export interface DnsAttackConfig {
  targetDomain: string;
  timeout?: number;
  onProgress?: (vector: string, detail: string) => void;
}

// ═══════════════════════════════════════════════════════
//  HELPER: DNS lookup via public DNS APIs
// ═══════════════════════════════════════════════════════

async function dnsLookup(domain: string, type: string = "A", timeout: number = 10000): Promise<string[]> {
  const providers = [
    `https://dns.google/resolve?name=${domain}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${domain}&type=${type}`,
    `https://dns.quad9.net:5053/dns-query?name=${domain}&type=${type}`,
  ];

  for (const url of providers) {
    try {
      const resp = await dnsFetch(url, {
        headers: { "Accept": "application/dns-json" },
        signal: AbortSignal.timeout(timeout),
      });
      const data = await resp.json();
      if (data.Answer) {
        return data.Answer.map((a: any) => a.data?.replace(/\.$/, "") || "").filter(Boolean);
      }
    } catch {
      continue;
    }
  }
  return [];
}

// ═══════════════════════════════════════════════════════
//  1. ORIGIN IP DISCOVERY
// ═══════════════════════════════════════════════════════

// Known Cloudflare IP ranges (partial list for detection)
const CLOUDFLARE_RANGES = [
  "173.245.48.", "103.21.244.", "103.22.200.", "103.31.4.",
  "141.101.", "108.162.", "190.93.", "188.114.",
  "197.234.", "198.41.", "162.158.", "104.16.",
  "104.17.", "104.18.", "104.19.", "104.20.",
  "104.21.", "104.22.", "104.23.", "104.24.",
  "104.25.", "104.26.", "104.27.", "172.64.",
  "172.65.", "172.66.", "172.67.",
];

function isCloudflareIp(ip: string): boolean {
  return CLOUDFLARE_RANGES.some(range => ip.startsWith(range));
}

async function discoverOriginIp(config: DnsAttackConfig): Promise<DnsAttackResult> {
  const log = config.onProgress || (() => {});
  const domain = config.targetDomain;
  const timeout = config.timeout || 15000;
  const candidateIps: Set<string> = new Set();

  // Method 1: Check if current IP is behind CDN
  log("origin_ip", "Resolving current A records...");
  const currentIps = await dnsLookup(domain, "A", timeout);
  const isBehindCdn = currentIps.some(ip => isCloudflareIp(ip));

  if (!isBehindCdn) {
    return {
      vector: "origin_ip",
      success: true,
      detail: `Domain is NOT behind CDN. Direct IP: ${currentIps.join(", ")}`,
      evidence: `A records: ${currentIps.join(", ")}`,
      data: { originIp: currentIps[0] },
    };
  }

  log("origin_ip", `Domain is behind Cloudflare (${currentIps[0]}). Searching for origin IP...`);

  // Method 2: Check common subdomains that might bypass CDN
  const bypassSubdomains = [
    `direct.${domain}`, `origin.${domain}`, `direct-connect.${domain}`,
    `mail.${domain}`, `smtp.${domain}`, `pop.${domain}`, `imap.${domain}`,
    `webmail.${domain}`, `email.${domain}`, `mx.${domain}`,
    `ftp.${domain}`, `sftp.${domain}`, `ssh.${domain}`,
    `cpanel.${domain}`, `whm.${domain}`, `plesk.${domain}`,
    `admin.${domain}`, `panel.${domain}`, `backend.${domain}`,
    `api.${domain}`, `dev.${domain}`, `staging.${domain}`, `test.${domain}`,
    `old.${domain}`, `backup.${domain}`, `legacy.${domain}`,
    `ns1.${domain}`, `ns2.${domain}`,
    `vpn.${domain}`, `remote.${domain}`,
    `db.${domain}`, `database.${domain}`, `mysql.${domain}`,
  ];

  for (const sub of bypassSubdomains) {
    try {
      const ips = await dnsLookup(sub, "A", 5000);
      for (const ip of ips) {
        if (!isCloudflareIp(ip) && ip !== "127.0.0.1" && !ip.startsWith("10.") && !ip.startsWith("192.168.")) {
          candidateIps.add(ip);
          log("origin_ip", `Found non-CDN IP via ${sub}: ${ip}`);
        }
      }
    } catch {
      continue;
    }
  }

  // Method 3: Check MX records (mail servers often reveal origin)
  log("origin_ip", "Checking MX records for origin IP...");
  const mxRecords = await dnsLookup(domain, "MX", timeout);
  for (const mx of mxRecords) {
    const mxDomain = mx.replace(/^\d+\s+/, "").replace(/\.$/, "");
    if (mxDomain.includes(domain)) {
      const mxIps = await dnsLookup(mxDomain, "A", 5000);
      for (const ip of mxIps) {
        if (!isCloudflareIp(ip)) {
          candidateIps.add(ip);
          log("origin_ip", `Found origin IP via MX (${mxDomain}): ${ip}`);
        }
      }
    }
  }

  // Method 4: Check TXT/SPF records for IP hints
  log("origin_ip", "Checking TXT/SPF records...");
  const txtRecords = await dnsLookup(domain, "TXT", timeout);
  for (const txt of txtRecords) {
    // Extract IPs from SPF records
    const ipMatches = txt.match(/ip4:(\d+\.\d+\.\d+\.\d+)/g);
    if (ipMatches) {
      for (const match of ipMatches) {
        const ip = match.replace("ip4:", "");
        if (!isCloudflareIp(ip)) {
          candidateIps.add(ip);
          log("origin_ip", `Found IP in SPF record: ${ip}`);
        }
      }
    }
  }

  // Method 5: Check historical DNS via online services
  log("origin_ip", "Checking SecurityTrails/ViewDNS for historical records...");
  const historyApis = [
    `https://api.securitytrails.com/v1/history/${domain}/dns/a`,
    `https://viewdns.info/iphistory/?domain=${domain}`,
  ];

  for (const apiUrl of historyApis) {
    try {
      const resp = await dnsFetch(apiUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(timeout),
      });
      const text = await resp.text();

      // Extract IPs from response
      const ipPattern = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
      let match;
      while ((match = ipPattern.exec(text)) !== null) {
        const ip = match[1];
        if (!isCloudflareIp(ip) && !ip.startsWith("10.") && !ip.startsWith("192.168.") && !ip.startsWith("127.")) {
          candidateIps.add(ip);
        }
      }
    } catch {
      continue;
    }
  }

  // Method 6: Check Shodan/Censys for the domain
  log("origin_ip", "Checking Shodan for exposed services...");
  try {
    const shodanUrl = `https://api.shodan.io/dns/resolve?hostnames=${domain}`;
    const resp = await dnsFetch(shodanUrl, {
      signal: AbortSignal.timeout(timeout),
    });
    if (resp.status === 200) {
      const data = await resp.json();
      if (data[domain]) {
        const ip = data[domain];
        if (!isCloudflareIp(ip)) {
          candidateIps.add(ip);
        }
      }
    }
  } catch {
    // Continue
  }

  // Verify candidate IPs by checking if they serve the same site
  log("origin_ip", `Found ${candidateIps.size} candidate IPs. Verifying...`);
  let verifiedOriginIp = "";

  for (const ip of Array.from(candidateIps)) {
    try {
      const resp = await dnsFetch(`http://${ip}/`, {
        headers: { "Host": domain },
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      const text = await resp.text();

      // Check if the response looks like the target site
      if (text.includes(domain) || resp.status === 200) {
        verifiedOriginIp = ip;
        log("origin_ip", `✅ Verified origin IP: ${ip} (responds to Host: ${domain})`);
        break;
      }
    } catch {
      continue;
    }
  }

  if (verifiedOriginIp) {
    return {
      vector: "origin_ip",
      success: true,
      detail: `Origin IP discovered: ${verifiedOriginIp} (bypasses Cloudflare WAF)`,
      evidence: `Verified: http://${verifiedOriginIp}/ with Host: ${domain} returns valid response`,
      data: { originIp: verifiedOriginIp },
    };
  }

  if (candidateIps.size > 0) {
    return {
      vector: "origin_ip",
      success: true,
      detail: `Found ${candidateIps.size} candidate origin IPs (unverified): ${Array.from(candidateIps).join(", ")}`,
      evidence: `Candidates from DNS/MX/SPF: ${Array.from(candidateIps).join(", ")}`,
      data: { originIp: Array.from(candidateIps)[0] },
    };
  }

  return {
    vector: "origin_ip",
    success: false,
    detail: "Could not discover origin IP behind CDN",
    evidence: `Current CDN IPs: ${currentIps.join(", ")}`,
  };
}

// ═══════════════════════════════════════════════════════
//  2. SUBDOMAIN TAKEOVER
// ═══════════════════════════════════════════════════════

// Services vulnerable to subdomain takeover
const TAKEOVER_FINGERPRINTS: { service: string; cnames: string[]; fingerprint: string }[] = [
  { service: "GitHub Pages", cnames: ["github.io"], fingerprint: "There isn't a GitHub Pages site here" },
  { service: "Heroku", cnames: ["herokuapp.com", "herokussl.com"], fingerprint: "No such app" },
  { service: "AWS S3", cnames: ["s3.amazonaws.com", "s3-website"], fingerprint: "NoSuchBucket" },
  { service: "Shopify", cnames: ["myshopify.com"], fingerprint: "Sorry, this shop is currently unavailable" },
  { service: "Tumblr", cnames: ["tumblr.com"], fingerprint: "There's nothing here" },
  { service: "WordPress.com", cnames: ["wordpress.com"], fingerprint: "Do you want to register" },
  { service: "Pantheon", cnames: ["pantheonsite.io"], fingerprint: "404 error unknown site" },
  { service: "Fastly", cnames: ["fastly.net"], fingerprint: "Fastly error: unknown domain" },
  { service: "Surge.sh", cnames: ["surge.sh"], fingerprint: "project not found" },
  { service: "Zendesk", cnames: ["zendesk.com"], fingerprint: "Help Center Closed" },
  { service: "Unbounce", cnames: ["unbouncepages.com"], fingerprint: "The requested URL was not found" },
  { service: "Azure", cnames: ["azurewebsites.net", "cloudapp.net", "trafficmanager.net"], fingerprint: "404 Web Site not found" },
  { service: "Bitbucket", cnames: ["bitbucket.io"], fingerprint: "Repository not found" },
  { service: "Netlify", cnames: ["netlify.app", "netlify.com"], fingerprint: "Not Found - Request ID" },
  { service: "Fly.io", cnames: ["fly.dev"], fingerprint: "404 Not Found" },
];

async function checkSubdomainTakeover(config: DnsAttackConfig): Promise<DnsAttackResult> {
  const log = config.onProgress || (() => {});
  const domain = config.targetDomain;
  const timeout = config.timeout || 10000;
  const vulnerableSubdomains: { subdomain: string; cname: string; service: string }[] = [];

  // Common subdomains to check
  const subdomains = [
    "www", "mail", "ftp", "admin", "blog", "shop", "store", "app",
    "api", "dev", "staging", "test", "beta", "demo", "cdn", "static",
    "assets", "media", "img", "images", "files", "docs", "help",
    "support", "status", "portal", "dashboard", "panel", "cpanel",
    "webmail", "remote", "vpn", "git", "ci", "jenkins", "jira",
    "confluence", "wiki", "forum", "community", "go", "link", "links",
    "redirect", "track", "analytics", "m", "mobile", "news",
    "events", "calendar", "chat", "slack", "teams",
  ];

  log("subdomain_takeover", `Checking ${subdomains.length} subdomains for takeover vulnerability...`);

  for (const sub of subdomains) {
    const fullDomain = `${sub}.${domain}`;

    try {
      // Check CNAME record
      const cnames = await dnsLookup(fullDomain, "CNAME", 5000);

      if (cnames.length === 0) continue;

      const cname = cnames[0];
      log("subdomain_takeover", `${fullDomain} → CNAME: ${cname}`);

      // Check if CNAME points to a vulnerable service
      for (const fp of TAKEOVER_FINGERPRINTS) {
        if (fp.cnames.some(c => cname.includes(c))) {
          // Verify by checking if the subdomain returns the fingerprint
          try {
            const resp = await dnsFetch(`http://${fullDomain}`, {
              redirect: "follow",
              signal: AbortSignal.timeout(5000),
            });
            const text = await resp.text();

            if (text.includes(fp.fingerprint) || resp.status === 404) {
              vulnerableSubdomains.push({
                subdomain: fullDomain,
                cname,
                service: fp.service,
              });
              log("subdomain_takeover", `🔓 VULNERABLE: ${fullDomain} → ${cname} (${fp.service})`);
            }
          } catch {
            // DNS resolves but HTTP fails — might still be takeover-able
            vulnerableSubdomains.push({
              subdomain: fullDomain,
              cname,
              service: `${fp.service} (unverified)`,
            });
          }
          break;
        }
      }

      // Check for dangling CNAME (CNAME exists but A record doesn't resolve)
      const aRecords = await dnsLookup(cname, "A", 5000);
      if (aRecords.length === 0) {
        vulnerableSubdomains.push({
          subdomain: fullDomain,
          cname,
          service: "Dangling CNAME (no A record)",
        });
        log("subdomain_takeover", `🔓 DANGLING CNAME: ${fullDomain} → ${cname} (no A record)`);
      }
    } catch {
      continue;
    }
  }

  if (vulnerableSubdomains.length > 0) {
    return {
      vector: "subdomain_takeover",
      success: true,
      detail: `Found ${vulnerableSubdomains.length} subdomains vulnerable to takeover`,
      evidence: vulnerableSubdomains.map(v => `${v.subdomain} → ${v.cname} (${v.service})`).join("; "),
      data: { vulnerableSubdomains },
    };
  }

  return {
    vector: "subdomain_takeover",
    success: false,
    detail: "No subdomain takeover vulnerabilities found",
    evidence: "",
  };
}

// ═══════════════════════════════════════════════════════
//  3. SUBDOMAIN ENUMERATION
// ═══════════════════════════════════════════════════════

async function enumerateSubdomains(config: DnsAttackConfig): Promise<DnsAttackResult> {
  const log = config.onProgress || (() => {});
  const domain = config.targetDomain;
  const timeout = config.timeout || 10000;
  const foundSubdomains: string[] = [];

  // Method 1: Certificate Transparency logs
  log("subdomain_enum", "Querying Certificate Transparency logs...");
  const ctApis = [
    `https://crt.sh/?q=%.${domain}&output=json`,
    `https://api.certspotter.com/v1/issuances?domain=${domain}&include_subdomains=true&expand=dns_names`,
  ];

  for (const apiUrl of ctApis) {
    try {
      const resp = await dnsFetch(apiUrl, {
        signal: AbortSignal.timeout(timeout),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const data = await resp.json();

      if (Array.isArray(data)) {
        for (const entry of data) {
          const names = entry.name_value || entry.common_name || "";
          const dnsNames = entry.dns_names || [];
          const allNames = [...names.split("\n"), ...dnsNames];

          for (const name of allNames) {
            const clean = name.replace(/^\*\./, "").trim().toLowerCase();
            if (clean.endsWith(domain) && clean !== domain && !foundSubdomains.includes(clean)) {
              foundSubdomains.push(clean);
            }
          }
        }
      }
    } catch {
      continue;
    }
  }

  // Method 2: DNS brute force (common subdomains)
  log("subdomain_enum", "Brute-forcing common subdomains...");
  const commonSubs = [
    "www", "mail", "ftp", "admin", "blog", "shop", "store", "app",
    "api", "dev", "staging", "test", "beta", "demo", "cdn", "static",
    "assets", "media", "img", "images", "files", "docs", "help",
    "support", "status", "portal", "dashboard", "panel", "cpanel",
    "webmail", "remote", "vpn", "git", "ci", "m", "mobile",
    "ns1", "ns2", "ns3", "mx", "smtp", "pop", "imap",
    "db", "database", "mysql", "redis", "mongo", "elastic",
    "grafana", "prometheus", "kibana", "jenkins", "gitlab",
  ];

  for (const sub of commonSubs) {
    const fullDomain = `${sub}.${domain}`;
    if (foundSubdomains.includes(fullDomain)) continue;

    try {
      const ips = await dnsLookup(fullDomain, "A", 3000);
      if (ips.length > 0) {
        foundSubdomains.push(fullDomain);
      }
    } catch {
      continue;
    }
  }

  log("subdomain_enum", `Found ${foundSubdomains.length} subdomains`);

  return {
    vector: "subdomain_enum",
    success: foundSubdomains.length > 0,
    detail: `Enumerated ${foundSubdomains.length} subdomains for ${domain}`,
    evidence: foundSubdomains.slice(0, 50).join(", "),
    data: { subdomains: foundSubdomains },
  };
}

// ═══════════════════════════════════════════════════════
//  4. DNS RECORDS ANALYSIS
// ═══════════════════════════════════════════════════════

async function analyzeDnsRecords(config: DnsAttackConfig): Promise<DnsAttackResult> {
  const log = config.onProgress || (() => {});
  const domain = config.targetDomain;
  const timeout = config.timeout || 10000;
  const records: Record<string, string[]> = {};

  const recordTypes = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA"];

  for (const type of recordTypes) {
    log("dns_analysis", `Querying ${type} records...`);
    const results = await dnsLookup(domain, type, timeout);
    if (results.length > 0) {
      records[type] = results;
    }
  }

  // Analyze for security issues
  const issues: string[] = [];

  // Check for missing SPF
  if (!records.TXT?.some(t => t.includes("v=spf1"))) {
    issues.push("Missing SPF record — email spoofing possible");
  }

  // Check for missing DMARC
  const dmarcRecords = await dnsLookup(`_dmarc.${domain}`, "TXT", timeout);
  if (!dmarcRecords.some(t => t.includes("v=DMARC1"))) {
    issues.push("Missing DMARC record — email spoofing possible");
  }

  // Check for zone transfer
  if (records.NS) {
    issues.push(`NS servers: ${records.NS.join(", ")} — check for zone transfer (AXFR)`);
  }

  return {
    vector: "dns_analysis",
    success: true,
    detail: `DNS analysis complete. ${Object.keys(records).length} record types found. ${issues.length} issues.`,
    evidence: issues.join("; ") || "No critical DNS issues found",
    data: { dnsRecords: records },
  };
}

// ═══════════════════════════════════════════════════════
//  MAIN EXPORT: Run all DNS/domain attacks
// ═══════════════════════════════════════════════════════

export async function runAllDnsAttacks(config: DnsAttackConfig): Promise<DnsAttackResult[]> {
  const results: DnsAttackResult[] = [];
  const log = config.onProgress || (() => {});

  // 1. Origin IP Discovery
  log("origin_ip", "🌐 Vector 1: Origin IP Discovery (bypass CDN/WAF)...");
  const originResult = await discoverOriginIp(config);
  results.push(originResult);

  // 2. Subdomain Enumeration
  log("subdomain_enum", "🔍 Vector 2: Subdomain Enumeration...");
  const enumResult = await enumerateSubdomains(config);
  results.push(enumResult);

  // 3. Subdomain Takeover
  log("subdomain_takeover", "🎯 Vector 3: Subdomain Takeover Check...");
  const takeoverResult = await checkSubdomainTakeover(config);
  results.push(takeoverResult);

  // 4. DNS Records Analysis
  log("dns_analysis", "📋 Vector 4: DNS Records Analysis...");
  const dnsResult = await analyzeDnsRecords(config);
  results.push(dnsResult);

  return results;
}

export { discoverOriginIp, checkSubdomainTakeover, enumerateSubdomains, analyzeDnsRecords, dnsLookup, isCloudflareIp };
