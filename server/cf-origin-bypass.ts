/**
 * Cloudflare Origin IP Bypass
 * 
 * เมื่อเจอ target ที่ใช้ Cloudflare WAF จะพยายามหา IP จริงของ server
 * เพื่อ bypass WAF โดยเชื่อมต่อตรงไปที่ origin server
 * 
 * วิธีการ:
 *   1. Shodan API — ค้นหา SSL cert fingerprint → หา origin IP
 *   2. DNS History — หา IP เก่าก่อนย้ายมา Cloudflare
 *   3. Subdomain Enumeration — mail., ftp., cpanel. ที่อาจไม่ผ่าน CF
 *   4. MX/SPF/TXT Records — mail server มักชี้ไป origin IP
 *   5. Direct IP Verification — ทดสอบว่า IP จริงตอบกลับถูกต้อง
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import { ENV } from "./_core/env";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface OriginIPResult {
  found: boolean;
  originIP: string | null;
  method: string;            // shodan_ssl, dns_history, subdomain, mx_record, spf_record
  confidence: number;        // 0-100
  verified: boolean;         // IP ตอบกลับ HTTP ถูกต้อง
  allCandidates: OriginCandidate[];
  cloudflareIPs: string[];   // CF IPs ที่ต้อง exclude
  duration: number;
}

export interface OriginCandidate {
  ip: string;
  source: string;
  confidence: number;
  verified: boolean;
  responseStatus?: number;
  serverHeader?: string;
}

// ═══════════════════════════════════════════════
//  CLOUDFLARE IP RANGES (for filtering)
// ═══════════════════════════════════════════════

const CF_IP_RANGES = [
  "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "104.16.0.0/13", "104.24.0.0/14",
  "108.162.192.0/18", "131.0.72.0/22",
  "141.101.64.0/18", "162.158.0.0/15",
  "172.64.0.0/13", "173.245.48.0/20",
  "188.114.96.0/20", "190.93.240.0/20",
  "197.234.240.0/22", "198.41.128.0/17",
];

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isCloudflareIP(ip: string): boolean {
  const ipLong = ipToLong(ip);
  for (const range of CF_IP_RANGES) {
    const [base, bits] = range.split("/");
    const baseLong = ipToLong(base);
    const mask = (~0 << (32 - parseInt(bits))) >>> 0;
    if ((ipLong & mask) === (baseLong & mask)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════
//  COMMON SUBDOMAINS TO CHECK
// ═══════════════════════════════════════════════

const SUBDOMAIN_LIST = [
  "mail", "webmail", "smtp", "pop", "imap",
  "ftp", "sftp", "cpanel", "whm", "plesk",
  "direct", "origin", "server", "host",
  "dev", "staging", "stage", "test",
  "api", "backend", "admin", "panel",
  "ns1", "ns2", "dns",
  "vpn", "remote", "ssh",
  "db", "database", "mysql", "phpmyadmin",
  "old", "backup", "bak",
  "m", "mobile",
];

// ═══════════════════════════════════════════════
//  MAIN FUNCTION
// ═══════════════════════════════════════════════

export async function findOriginIP(
  domain: string,
  onProgress?: (msg: string) => void
): Promise<OriginIPResult> {
  const startTime = Date.now();
  const log = (msg: string) => onProgress?.(`[CF-Bypass] ${msg}`);
  
  const result: OriginIPResult = {
    found: false,
    originIP: null,
    method: "",
    confidence: 0,
    verified: false,
    allCandidates: [],
    cloudflareIPs: [],
    duration: 0,
  };

  log(`เริ่มค้นหา Origin IP ของ ${domain}...`);

  // Run all methods in parallel for speed
  const methods = await Promise.allSettled([
    method1_ShodanSSL(domain, log),
    method2_DNSHistory(domain, log),
    method3_SubdomainEnum(domain, log),
    method4_MXSPFRecords(domain, log),
    method5_ShodanHostSearch(domain, log),
    method6_CertTransparency(domain, log),
    method7_FaviconHash(domain, log),
    method8_CensysSearch(domain, log),
    method9_SecurityTrails(domain, log),
  ]);

  // Collect all candidates
  for (const m of methods) {
    if (m.status === "fulfilled" && m.value.length > 0) {
      result.allCandidates.push(...m.value);
    }
  }

  // Filter out Cloudflare IPs
  const cfIPs: string[] = [];
  const realCandidates: OriginCandidate[] = [];
  for (const c of result.allCandidates) {
    if (isCloudflareIP(c.ip)) {
      cfIPs.push(c.ip);
    } else {
      realCandidates.push(c);
    }
  }
  result.cloudflareIPs = Array.from(new Set(cfIPs));

  // Deduplicate by IP
  const uniqueIPs = new Map<string, OriginCandidate>();
  for (const c of realCandidates) {
    const existing = uniqueIPs.get(c.ip);
    if (!existing || c.confidence > existing.confidence) {
      uniqueIPs.set(c.ip, c);
    }
  }

  log(`พบ ${uniqueIPs.size} candidate IPs (ไม่รวม ${cfIPs.length} Cloudflare IPs)`);

  // Verify each candidate — does it serve the same site?
  const candidates = Array.from(uniqueIPs.values());
  if (candidates.length > 0) {
    log(`กำลัง verify ${candidates.length} candidate IPs...`);
    await Promise.allSettled(
      candidates.map(c => verifyOriginIP(domain, c, log))
    );

    // Sort by confidence (verified first, then highest confidence)
    candidates.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return b.confidence - a.confidence;
    });

    // Pick best candidate
    const best = candidates[0];
    if (best.verified || best.confidence >= 60) {
      result.found = true;
      result.originIP = best.ip;
      result.method = best.source;
      result.confidence = best.confidence;
      result.verified = best.verified;
      log(`✅ พบ Origin IP: ${best.ip} (${best.source}, confidence: ${best.confidence}%, verified: ${best.verified})`);
    } else {
      log(`⚠️ พบ candidates แต่ confidence ต่ำ — best: ${best.ip} (${best.confidence}%)`);
    }
  } else {
    log(`❌ ไม่พบ candidate IPs ที่ไม่ใช่ Cloudflare`);
  }

  result.allCandidates = candidates;
  result.duration = Date.now() - startTime;
  return result;
}

// ═══════════════════════════════════════════════
//  METHOD 1: Shodan SSL Certificate Search
// ═══════════════════════════════════════════════

async function method1_ShodanSSL(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  if (!ENV.shodanApiKey) {
    log("Shodan SSL: ❌ ไม่มี API key");
    return [];
  }

  try {
    log("Shodan SSL: ค้นหา SSL cert ที่ match domain...");
    
    // Search for hosts with SSL cert matching the domain
    const query = encodeURIComponent(`ssl.cert.subject.cn:${domain}`);
    const { response } = await fetchWithPoolProxy(
      `https://api.shodan.io/shodan/host/search?key=${ENV.shodanApiKey}&query=${query}&minify=true`,
      { signal: AbortSignal.timeout(20000) },
      { targetDomain: "api.shodan.io", timeout: 20000 }
    );

    if (!response.ok) {
      log(`Shodan SSL: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as {
      matches?: { ip_str: string; port: number; org?: string }[];
      total?: number;
    };

    const candidates: OriginCandidate[] = [];
    if (data.matches) {
      for (const match of data.matches) {
        if (!isCloudflareIP(match.ip_str)) {
          candidates.push({
            ip: match.ip_str,
            source: "shodan_ssl",
            confidence: 85,
            verified: false,
          });
        }
      }
    }

    log(`Shodan SSL: พบ ${candidates.length} non-CF IPs จาก ${data.total || 0} results`);
    return candidates;
  } catch (e: any) {
    log(`Shodan SSL: ❌ ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════
//  METHOD 2: DNS History (via free APIs)
// ═══════════════════════════════════════════════

async function method2_DNSHistory(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  const candidates: OriginCandidate[] = [];

  try {
    log("DNS History: ค้นหา IP เก่าจาก DNS history...");

    // Method 2a: ViewDNS.info (free, no API key needed)
    try {
      const { response } = await fetchWithPoolProxy(
        `https://viewdns.info/iphistory/?domain=${domain}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
          },
          signal: AbortSignal.timeout(15000),
        },
        { targetDomain: "viewdns.info", timeout: 15000 }
      );

      if (response.ok) {
        const html = await response.text();
        // Extract IPs from the history table
        const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
        const ips = new Set<string>();
        let match;
        while ((match = ipRegex.exec(html)) !== null) {
          const ip = match[1];
          if (!isCloudflareIP(ip) && !ip.startsWith("127.") && !ip.startsWith("0.")) {
            ips.add(ip);
          }
        }
        for (const ip of Array.from(ips)) {
          candidates.push({
            ip,
            source: "dns_history_viewdns",
            confidence: 65,
            verified: false,
          });
        }
        log(`DNS History (ViewDNS): พบ ${ips.size} unique IPs`);
      }
    } catch { /* ignore */ }

    // Method 2b: SecurityTrails-style lookup via Google DNS over HTTPS
    try {
      // Check if there's a "direct" subdomain
      const { response: dnsRes } = await fetchWithPoolProxy(
        `https://dns.google/resolve?name=direct.${domain}&type=A`,
        { signal: AbortSignal.timeout(10000) },
        { targetDomain: "dns.google", timeout: 10000 }
      );
      if (dnsRes.ok) {
        const dnsData = await dnsRes.json() as { Answer?: { data: string }[] };
        if (dnsData.Answer) {
          for (const a of dnsData.Answer) {
            if (!isCloudflareIP(a.data) && /^\d+\.\d+\.\d+\.\d+$/.test(a.data)) {
              candidates.push({
                ip: a.data,
                source: "dns_direct_subdomain",
                confidence: 80,
                verified: false,
              });
            }
          }
        }
      }
    } catch { /* ignore */ }

    // Method 2c: Check "origin" subdomain
    try {
      const { response: originRes } = await fetchWithPoolProxy(
        `https://dns.google/resolve?name=origin.${domain}&type=A`,
        { signal: AbortSignal.timeout(10000) },
        { targetDomain: "dns.google", timeout: 10000 }
      );
      if (originRes.ok) {
        const originData = await originRes.json() as { Answer?: { data: string }[] };
        if (originData.Answer) {
          for (const a of originData.Answer) {
            if (!isCloudflareIP(a.data) && /^\d+\.\d+\.\d+\.\d+$/.test(a.data)) {
              candidates.push({
                ip: a.data,
                source: "dns_origin_subdomain",
                confidence: 90,
                verified: false,
              });
            }
          }
        }
      }
    } catch { /* ignore */ }

    log(`DNS History: รวม ${candidates.length} candidates`);
  } catch (e: any) {
    log(`DNS History: ❌ ${e.message}`);
  }

  return candidates;
}

// ═══════════════════════════════════════════════
//  METHOD 3: Subdomain Enumeration
// ═══════════════════════════════════════════════

async function method3_SubdomainEnum(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  const candidates: OriginCandidate[] = [];

  log(`Subdomain Enum: ตรวจสอบ ${SUBDOMAIN_LIST.length} subdomains...`);

  // Batch DNS lookups (5 at a time)
  const batchSize = 8;
  for (let i = 0; i < SUBDOMAIN_LIST.length; i += batchSize) {
    const batch = SUBDOMAIN_LIST.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (sub) => {
        try {
          const { response } = await fetchWithPoolProxy(
            `https://dns.google/resolve?name=${sub}.${domain}&type=A`,
            { signal: AbortSignal.timeout(8000) },
            { targetDomain: "dns.google", timeout: 8000 }
          );
          if (response.ok) {
            const data = await response.json() as { Answer?: { data: string }[] };
            if (data.Answer) {
              for (const a of data.Answer) {
                if (/^\d+\.\d+\.\d+\.\d+$/.test(a.data) && !isCloudflareIP(a.data)) {
                  return { ip: a.data, sub };
                }
              }
            }
          }
        } catch { /* ignore */ }
        return null;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        const confidenceMap: Record<string, number> = {
          mail: 75, webmail: 75, smtp: 80, pop: 75, imap: 75,
          ftp: 70, cpanel: 85, whm: 85, plesk: 85,
          direct: 90, origin: 90, server: 80, host: 80,
          dev: 60, staging: 60, api: 65, backend: 70,
        };
        candidates.push({
          ip: r.value.ip,
          source: `subdomain_${r.value.sub}`,
          confidence: confidenceMap[r.value.sub] || 55,
          verified: false,
        });
      }
    }
  }

  log(`Subdomain Enum: พบ ${candidates.length} non-CF IPs`);
  return candidates;
}

// ═══════════════════════════════════════════════
//  METHOD 4: MX / SPF / TXT Records
// ═══════════════════════════════════════════════

async function method4_MXSPFRecords(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  const candidates: OriginCandidate[] = [];

  try {
    log("MX/SPF Records: ค้นหา mail server IPs...");

    // MX Records
    try {
      const { response: mxRes } = await fetchWithPoolProxy(
        `https://dns.google/resolve?name=${domain}&type=MX`,
        { signal: AbortSignal.timeout(10000) },
        { targetDomain: "dns.google", timeout: 10000 }
      );
      if (mxRes.ok) {
        const mxData = await mxRes.json() as { Answer?: { data: string }[] };
        if (mxData.Answer) {
          for (const a of mxData.Answer) {
            // MX record format: "10 mail.domain.com."
            const mxHost = a.data.split(" ").pop()?.replace(/\.$/, "");
            if (mxHost && mxHost.endsWith(domain)) {
              // Resolve MX hostname to IP
              try {
                const { response: aRes } = await fetchWithPoolProxy(
                  `https://dns.google/resolve?name=${mxHost}&type=A`,
                  { signal: AbortSignal.timeout(8000) },
                  { targetDomain: "dns.google", timeout: 8000 }
                );
                if (aRes.ok) {
                  const aData = await aRes.json() as { Answer?: { data: string }[] };
                  if (aData.Answer) {
                    for (const aa of aData.Answer) {
                      if (/^\d+\.\d+\.\d+\.\d+$/.test(aa.data) && !isCloudflareIP(aa.data)) {
                        candidates.push({
                          ip: aa.data,
                          source: "mx_record",
                          confidence: 70,
                          verified: false,
                        });
                      }
                    }
                  }
                }
              } catch { /* ignore */ }
            }
          }
        }
      }
    } catch { /* ignore */ }

    // SPF Records — often contain "ip4:x.x.x.x"
    try {
      const { response: txtRes } = await fetchWithPoolProxy(
        `https://dns.google/resolve?name=${domain}&type=TXT`,
        { signal: AbortSignal.timeout(10000) },
        { targetDomain: "dns.google", timeout: 10000 }
      );
      if (txtRes.ok) {
        const txtData = await txtRes.json() as { Answer?: { data: string }[] };
        if (txtData.Answer) {
          for (const a of txtData.Answer) {
            // Look for ip4: in SPF records
            const spfMatch = a.data.match(/ip4:(\d+\.\d+\.\d+\.\d+)/g);
            if (spfMatch) {
              for (const m of Array.from(spfMatch)) {
                const ip = m.replace("ip4:", "");
                if (!isCloudflareIP(ip)) {
                  candidates.push({
                    ip,
                    source: "spf_record",
                    confidence: 75,
                    verified: false,
                  });
                }
              }
            }
          }
        }
      }
    } catch { /* ignore */ }

    log(`MX/SPF Records: พบ ${candidates.length} candidates`);
  } catch (e: any) {
    log(`MX/SPF Records: ❌ ${e.message}`);
  }

  return candidates;
}

// ═══════════════════════════════════════════════
//  METHOD 5: Shodan Host Search (by org/hostname)
// ═══════════════════════════════════════════════

async function method5_ShodanHostSearch(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  if (!ENV.shodanApiKey) return [];

  try {
    log("Shodan Host Search: ค้นหา hostname match...");

    const query = encodeURIComponent(`hostname:${domain}`);
    const { response } = await fetchWithPoolProxy(
      `https://api.shodan.io/shodan/host/search?key=${ENV.shodanApiKey}&query=${query}&minify=true`,
      { signal: AbortSignal.timeout(20000) },
      { targetDomain: "api.shodan.io", timeout: 20000 }
    );

    if (!response.ok) return [];

    const data = await response.json() as {
      matches?: { ip_str: string; port: number; hostnames?: string[] }[];
    };

    const candidates: OriginCandidate[] = [];
    if (data.matches) {
      for (const match of data.matches) {
        if (!isCloudflareIP(match.ip_str)) {
          candidates.push({
            ip: match.ip_str,
            source: "shodan_hostname",
            confidence: 80,
            verified: false,
          });
        }
      }
    }

    log(`Shodan Host Search: พบ ${candidates.length} non-CF IPs`);
    return candidates;
  } catch (e: any) {
    log(`Shodan Host Search: ❌ ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════
//  VERIFY ORIGIN IP
// ═══════════════════════════════════════════════

async function verifyOriginIP(
  domain: string,
  candidate: OriginCandidate,
  log: (msg: string) => void
): Promise<void> {
  try {
    // Send HTTP request directly to the IP with Host header set to domain
    const { response } = await fetchWithPoolProxy(
      `http://${candidate.ip}/`,
      {
        headers: {
          "Host": domain,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      },
      { targetDomain: candidate.ip, timeout: 10000 }
    );

    candidate.responseStatus = response.status;
    candidate.serverHeader = response.headers.get("server") || undefined;

    // Check if it responds with the expected content
    if (response.status >= 200 && response.status < 400) {
      const body = await response.text();
      
      // If it contains the domain name or WordPress markers, it's likely the origin
      if (body.includes(domain) || body.includes("wp-content") || body.includes("wordpress")) {
        candidate.verified = true;
        candidate.confidence = Math.min(candidate.confidence + 20, 100);
        log(`✅ Verified: ${candidate.ip} (${candidate.source}) — responds with domain content`);
      } else if (response.status === 200) {
        // Responds but different content — might be shared hosting
        candidate.confidence = Math.max(candidate.confidence - 10, 30);
        log(`⚠️ ${candidate.ip} responds but content doesn't match domain`);
      }
    } else if (response.status === 301 || response.status === 302) {
      // Redirect — check if it redirects to the domain
      const location = response.headers.get("location") || "";
      if (location.includes(domain)) {
        candidate.verified = true;
        candidate.confidence = Math.min(candidate.confidence + 15, 95);
        log(`✅ Verified: ${candidate.ip} redirects to ${domain}`);
      }
    }

    // Also try HTTPS
    if (!candidate.verified) {
      try {
        const { response: httpsRes } = await fetchWithPoolProxy(
          `https://${candidate.ip}/`,
          {
            headers: {
              "Host": domain,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
          },
          { targetDomain: candidate.ip, timeout: 10000 }
        );

        if (httpsRes.status >= 200 && httpsRes.status < 400) {
          const body = await httpsRes.text();
          if (body.includes(domain) || body.includes("wp-content")) {
            candidate.verified = true;
            candidate.confidence = Math.min(candidate.confidence + 20, 100);
            log(`✅ Verified (HTTPS): ${candidate.ip} — responds with domain content`);
          }
        }
      } catch { /* SSL error is expected if cert doesn't match */ }
    }
  } catch (e: any) {
    // Connection refused or timeout — IP might not be the right one
    candidate.confidence = Math.max(candidate.confidence - 20, 10);
  }
}

// ═══════════════════════════════════════════════
//  METHOD 6: Certificate Transparency Logs (crt.sh)
// ═══════════════════════════════════════════════

async function method6_CertTransparency(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  const candidates: OriginCandidate[] = [];

  try {
    log("CT Logs: ค้นหา certificates จาก crt.sh...");

    // crt.sh returns certificates issued for this domain
    // Some certificates include IP addresses in SAN fields
    const { response } = await fetchWithPoolProxy(
      `https://crt.sh/?q=${domain}&output=json`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      },
      { targetDomain: "crt.sh", timeout: 15000 }
    );

    if (response.ok) {
      const certs = await response.json() as Array<{ name_value: string; common_name: string; issuer_name: string }>;
      
      // Extract unique subdomains from certificates
      const subdomains = new Set<string>();
      for (const cert of certs.slice(0, 100)) {
        const names = cert.name_value?.split("\n") || [];
        for (const name of names) {
          const clean = name.trim().replace(/^\*\./, "");
          if (clean.endsWith(domain) && clean !== domain && !clean.startsWith("*")) {
            subdomains.add(clean);
          }
        }
      }

      log(`CT Logs: พบ ${subdomains.size} unique subdomains จาก certificates`);

      // Resolve subdomains to IPs
      const subList = Array.from(subdomains).slice(0, 30);
      const batchSize = 8;
      for (let i = 0; i < subList.length; i += batchSize) {
        const batch = subList.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (sub) => {
            try {
              const { response: dnsResp } = await fetchWithPoolProxy(
                `https://dns.google/resolve?name=${sub}&type=A`,
                { signal: AbortSignal.timeout(5000) },
                { targetDomain: "dns.google", timeout: 5000 }
              );
              if (dnsResp.ok) {
                const data = await dnsResp.json() as { Answer?: { data: string }[] };
                if (data.Answer) {
                  for (const a of data.Answer) {
                    if (/^\d+\.\d+\.\d+\.\d+$/.test(a.data) && !isCloudflareIP(a.data)) {
                      return { ip: a.data, sub };
                    }
                  }
                }
              }
            } catch { /* ignore */ }
            return null;
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            // Subdomains from CT logs that resolve to non-CF IPs are high-confidence
            const confidenceMap: Record<string, number> = {
              mail: 80, smtp: 85, imap: 80, pop: 75,
              ftp: 75, cpanel: 90, whm: 90, plesk: 85,
              direct: 95, origin: 95, server: 85,
              dev: 65, staging: 65, api: 70, backend: 75,
              admin: 70, panel: 70,
            };
            const subPrefix = r.value.sub.split(".")[0];
            candidates.push({
              ip: r.value.ip,
              source: `ct_logs_${subPrefix}`,
              confidence: confidenceMap[subPrefix] || 60,
              verified: false,
            });
          }
        }
      }

      log(`CT Logs: พบ ${candidates.length} non-CF IPs จาก ${subdomains.size} subdomains`);
    }
  } catch (e: any) {
    log(`CT Logs: ❌ ${e.message}`);
  }

  return candidates;
}

// ═══════════════════════════════════════════════
//  METHOD 7: Favicon Hash Matching
// ═══════════════════════════════════════════════

async function method7_FaviconHash(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  const candidates: OriginCandidate[] = [];

  try {
    log("Favicon Hash: ดาวน์โหลด favicon เพื่อคำนวณ hash...");

    // Step 1: Download favicon from the domain
    let faviconData: ArrayBuffer | null = null;
    const faviconPaths = ["/favicon.ico", "/favicon.png", "/apple-touch-icon.png"];

    for (const path of faviconPaths) {
      try {
        const { response } = await fetchWithPoolProxy(
          `https://${domain}${path}`,
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(8000),
          },
          { targetDomain: domain, timeout: 8000 }
        );
        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("image") || contentType.includes("icon") || path.endsWith(".ico")) {
            faviconData = await response.arrayBuffer();
            if (faviconData.byteLength > 0) {
              log(`Favicon Hash: ดาวน์โหลด favicon จาก ${path} (${faviconData.byteLength} bytes)`);
              break;
            }
          }
        }
      } catch { /* continue */ }
    }

    if (!faviconData || faviconData.byteLength === 0) {
      log("Favicon Hash: ไม่พบ favicon");
      return candidates;
    }

    // Step 2: Calculate MurmurHash3 (Shodan uses this for favicon search)
    // Simplified: use base64 of favicon as search key in Shodan
    const base64Favicon = Buffer.from(faviconData).toString("base64");
    
    // Calculate a simple hash for Shodan http.favicon.hash search
    // Shodan uses MurmurHash3 of the base64-encoded favicon
    let hash = 0;
    for (let i = 0; i < base64Favicon.length; i++) {
      const chr = base64Favicon.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }

    log(`Favicon Hash: hash = ${hash}, ค้นหาใน Shodan...`);

    // Step 3: Search Shodan for this favicon hash
    if (ENV.shodanApiKey) {
      try {
        const { response: shodanResp } = await fetchWithPoolProxy(
          `https://api.shodan.io/shodan/host/search?key=${ENV.shodanApiKey}&query=http.favicon.hash:${hash}`,
          { signal: AbortSignal.timeout(15000) },
          { targetDomain: "api.shodan.io", timeout: 15000 }
        );

        if (shodanResp.ok) {
          const data = await shodanResp.json() as { matches?: Array<{ ip_str: string; hostnames?: string[] }> };
          if (data.matches) {
            for (const match of data.matches) {
              if (!isCloudflareIP(match.ip_str)) {
                // Check if this IP is related to our domain
                const hostnames = match.hostnames || [];
                const isRelated = hostnames.some(h => h.includes(domain.split(".").slice(-2).join(".")));
                candidates.push({
                  ip: match.ip_str,
                  source: "favicon_hash_shodan",
                  confidence: isRelated ? 85 : 50,
                  verified: false,
                });
              }
            }
            log(`Favicon Hash: พบ ${candidates.length} IPs จาก Shodan favicon search`);
          }
        }
      } catch (e: any) {
        log(`Favicon Hash (Shodan): ❌ ${e.message}`);
      }
    }
  } catch (e: any) {
    log(`Favicon Hash: ❌ ${e.message}`);
  }

  return candidates;
}

// ═══════════════════════════════════════════════
//  METHOD 8: Censys Certificate Search
// ═══════════════════════════════════════════════

async function method8_CensysSearch(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  const candidates: OriginCandidate[] = [];

  try {
    log("Censys: ค้นหา certificates และ hosts...");

    // Use Censys free search API (no API key needed for basic search)
    // Search for hosts serving certificates for this domain
    try {
      const { response } = await fetchWithPoolProxy(
        `https://search.censys.io/api/v2/hosts/search?q=services.tls.certificates.leaf.names:${domain}&per_page=25`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(15000),
        },
        { targetDomain: "search.censys.io", timeout: 15000 }
      );

      if (response.ok) {
        const data = await response.json() as { result?: { hits?: Array<{ ip: string; services?: Array<{ port: number }> }> } };
        if (data.result?.hits) {
          for (const hit of data.result.hits) {
            if (!isCloudflareIP(hit.ip)) {
              candidates.push({
                ip: hit.ip,
                source: "censys_cert_search",
                confidence: 75,
                verified: false,
              });
            }
          }
          log(`Censys: พบ ${candidates.length} non-CF IPs จาก certificate search`);
        }
      }
    } catch (e: any) {
      log(`Censys search: ❌ ${e.message}`);
    }
  } catch (e: any) {
    log(`Censys: ❌ ${e.message}`);
  }

  return candidates;
}

// ═══════════════════════════════════════════════
//  METHOD 9: SecurityTrails DNS History
// ═══════════════════════════════════════════════

async function method9_SecurityTrails(domain: string, log: (msg: string) => void): Promise<OriginCandidate[]> {
  const candidates: OriginCandidate[] = [];

  try {
    log("SecurityTrails: ค้นหา DNS history...");

    // SecurityTrails free tier allows some lookups
    // Also try alternative free DNS history sources

    // Method 9a: DNSTrails (SecurityTrails free endpoint)
    try {
      const { response } = await fetchWithPoolProxy(
        `https://securitytrails.com/domain/${domain}/dns`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
          },
          signal: AbortSignal.timeout(15000),
        },
        { targetDomain: "securitytrails.com", timeout: 15000 }
      );

      if (response.ok) {
        const html = await response.text();
        // Extract IPs from the page
        const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
        const ips = new Set<string>();
        let match;
        while ((match = ipRegex.exec(html)) !== null) {
          const ip = match[1];
          if (!isCloudflareIP(ip) && !ip.startsWith("127.") && !ip.startsWith("0.") && !ip.startsWith("10.") && !ip.startsWith("192.168.")) {
            ips.add(ip);
          }
        }
        for (const ip of Array.from(ips)) {
          candidates.push({
            ip,
            source: "securitytrails_dns",
            confidence: 70,
            verified: false,
          });
        }
        log(`SecurityTrails: พบ ${ips.size} unique IPs จาก DNS history`);
      }
    } catch { /* ignore */ }

    // Method 9b: RapidDNS (free, no API key)
    try {
      const { response } = await fetchWithPoolProxy(
        `https://rapiddns.io/subdomain/${domain}?full=1`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
          },
          signal: AbortSignal.timeout(15000),
        },
        { targetDomain: "rapiddns.io", timeout: 15000 }
      );

      if (response.ok) {
        const html = await response.text();
        const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
        const ips = new Set<string>();
        let match;
        while ((match = ipRegex.exec(html)) !== null) {
          const ip = match[1];
          if (!isCloudflareIP(ip) && !ip.startsWith("127.") && !ip.startsWith("0.") && !ip.startsWith("10.") && !ip.startsWith("192.168.")) {
            ips.add(ip);
          }
        }
        for (const ip of Array.from(ips)) {
          // Only add if not already found
          if (!candidates.some(c => c.ip === ip)) {
            candidates.push({
              ip,
              source: "rapiddns_subdomain",
              confidence: 60,
              verified: false,
            });
          }
        }
        log(`RapidDNS: พบ ${ips.size} additional IPs`);
      }
    } catch { /* ignore */ }

    // Method 9c: DNSdumpster
    try {
      const { response } = await fetchWithPoolProxy(
        `https://api.hackertarget.com/hostsearch/?q=${domain}`,
        {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10000),
        },
        { targetDomain: "api.hackertarget.com", timeout: 10000 }
      );

      if (response.ok) {
        const text = await response.text();
        const lines = text.split("\n").filter(l => l.includes(","));
        for (const line of lines) {
          const [, ip] = line.split(",");
          if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip.trim()) && !isCloudflareIP(ip.trim())) {
            if (!candidates.some(c => c.ip === ip.trim())) {
              candidates.push({
                ip: ip.trim(),
                source: "hackertarget_hostsearch",
                confidence: 65,
                verified: false,
              });
            }
          }
        }
        log(`HackerTarget: พบ ${lines.length} host entries`);
      }
    } catch { /* ignore */ }

    log(`SecurityTrails+: รวม ${candidates.length} candidates จากทุก source`);
  } catch (e: any) {
    log(`SecurityTrails: ❌ ${e.message}`);
  }

  return candidates;
}

// ═══════════════════════════════════════════════
//  HELPER: Make request to origin IP directly
// ═══════════════════════════════════════════════

/**
 * ส่ง HTTP request ไปที่ origin IP โดยตรง (bypass Cloudflare)
 * ใช้ Host header เพื่อให้ server ตอบกลับเหมือนเข้าผ่าน domain ปกติ
 */
export async function fetchViaOriginIP(
  originIP: string,
  domain: string,
  path: string,
  init?: RequestInit & { timeout?: number }
): Promise<{ response: Response; usedOriginBypass: boolean }> {
  const timeout = init?.timeout || 15000;
  const url = `http://${originIP}${path}`;
  
  const headers = {
    ...(init?.headers as Record<string, string> || {}),
    "Host": domain,
    "X-Forwarded-For": "1.1.1.1", // Pretend to come from Cloudflare
    "X-Real-IP": "1.1.1.1",
  };

  try {
    const { response } = await fetchWithPoolProxy(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeout),
    }, { targetDomain: originIP, timeout });

    return { response, usedOriginBypass: true };
  } catch {
    // Fallback to HTTPS
    const httpsUrl = `https://${originIP}${path}`;
    const { response } = await fetchWithPoolProxy(httpsUrl, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeout),
    }, { targetDomain: originIP, timeout });

    return { response, usedOriginBypass: true };
  }
}
