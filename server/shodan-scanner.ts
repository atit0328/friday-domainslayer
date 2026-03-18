/**
 * Shodan Port Scanner Module
 * Uses Shodan API to scan target IPs for open ports and services.
 * Provides pre-login intelligence: which ports are open before trying credentials.
 */

import { ENV } from "./_core/env";

export interface ShodanHostResult {
  ip: string;
  hostnames: string[];
  org?: string;
  isp?: string;
  os?: string;
  ports: number[];
  /** Detailed service info per port */
  services: ShodanService[];
  /** Domains sharing this IP (from Shodan reverse DNS) */
  sharedDomains: string[];
  /** Country code */
  country?: string;
  /** Last update time */
  lastUpdate?: string;
  /** Vulnerabilities found */
  vulns: string[];
}

export interface ShodanService {
  port: number;
  transport: string; // tcp | udp
  product?: string;
  version?: string;
  module?: string; // http, ftp, ssh, etc.
  banner?: string;
  /** Whether SSL/TLS is enabled */
  ssl?: boolean;
  /** HTTP title if web service */
  httpTitle?: string;
  /** HTTP server header */
  httpServer?: string;
}

export interface PortIntelligence {
  /** Is FTP (21) open? */
  ftpOpen: boolean;
  ftpService?: ShodanService;
  /** Is SSH (22) open? */
  sshOpen: boolean;
  sshService?: ShodanService;
  /** Is HTTP (80) open? */
  httpOpen: boolean;
  /** Is HTTPS (443) open? */
  httpsOpen: boolean;
  /** Is cPanel (2083) open? */
  cpanelOpen: boolean;
  /** Is WHM (2087) open? */
  whmOpen: boolean;
  /** Is DirectAdmin (2222) open? */
  directAdminOpen: boolean;
  /** Is Plesk (8443) open? */
  pleskOpen: boolean;
  /** Is MySQL (3306) open? */
  mysqlOpen: boolean;
  /** Is phpMyAdmin common ports open? */
  phpMyAdminLikely: boolean;
  /** Is Webmin (10000) open? */
  webminOpen: boolean;
  /** Is SMTP (25/587) open? */
  smtpOpen: boolean;
  /** All open ports */
  allPorts: number[];
  /** Server type detected from HTTP headers */
  serverType?: string;
  /** Operating system */
  os?: string;
  /** Vulnerabilities */
  vulns: string[];
  /** Shared hosting domains */
  sharedDomains: string[];
  /** Raw Shodan result */
  raw: ShodanHostResult;
}

const SHODAN_BASE = "https://api.shodan.io";

/**
 * Resolve domain to IP address
 */
async function resolveIP(domain: string): Promise<string | null> {
  try {
    // Use Shodan DNS resolve endpoint
    const resp = await fetch(
      `${SHODAN_BASE}/dns/resolve?hostnames=${encodeURIComponent(domain)}&key=${ENV.shodanApiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, string | null>;
    return data[domain] || null;
  } catch {
    return null;
  }
}

/**
 * Resolve IP using Node.js DNS as fallback
 */
async function resolveIPFallback(domain: string): Promise<string | null> {
  try {
    const dns = await import("dns");
    const { promisify } = await import("util");
    const resolve4 = promisify(dns.resolve4);
    const ips = await resolve4(domain);
    return ips[0] || null;
  } catch {
    return null;
  }
}

/**
 * Get Shodan host information for an IP
 */
async function shodanHostLookup(ip: string): Promise<ShodanHostResult | null> {
  try {
    const resp = await fetch(
      `${SHODAN_BASE}/shodan/host/${ip}?key=${ENV.shodanApiKey}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) {
      if (resp.status === 404) {
        // No data for this IP
        return {
          ip,
          hostnames: [],
          ports: [],
          services: [],
          sharedDomains: [],
          vulns: [],
        };
      }
      return null;
    }

    const data = await resp.json() as any;

    const services: ShodanService[] = (data.data || []).map((svc: any) => ({
      port: svc.port,
      transport: svc.transport || "tcp",
      product: svc.product,
      version: svc.version,
      module: svc._shodan?.module,
      banner: svc.data?.substring(0, 500),
      ssl: !!svc.ssl,
      httpTitle: svc.http?.title,
      httpServer: svc.http?.server,
    }));

    return {
      ip: data.ip_str || ip,
      hostnames: data.hostnames || [],
      org: data.org,
      isp: data.isp,
      os: data.os,
      ports: data.ports || [],
      services,
      sharedDomains: data.hostnames || [],
      country: data.country_code,
      lastUpdate: data.last_update,
      vulns: data.vulns || [],
    };
  } catch {
    return null;
  }
}

/**
 * Get reverse DNS for an IP to find shared hosting domains
 */
async function shodanReverseDNS(ip: string): Promise<string[]> {
  try {
    const resp = await fetch(
      `${SHODAN_BASE}/dns/reverse?ips=${ip}&key=${ENV.shodanApiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return [];
    const data = await resp.json() as Record<string, string[]>;
    return data[ip] || [];
  } catch {
    return [];
  }
}

/**
 * Main function: Scan a domain and return port intelligence
 */
export async function scanDomainPorts(
  domain: string,
  onProgress?: (msg: string) => void,
): Promise<PortIntelligence | null> {
  if (!ENV.shodanApiKey) {
    onProgress?.("⚠️ Shodan API key not configured");
    return null;
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  onProgress?.(`🔍 Resolving IP for ${cleanDomain}...`);

  // Resolve IP
  let ip = await resolveIP(cleanDomain);
  if (!ip) {
    onProgress?.("⚠️ Shodan DNS resolve failed, trying fallback...");
    ip = await resolveIPFallback(cleanDomain);
  }
  if (!ip) {
    onProgress?.(`❌ Cannot resolve IP for ${cleanDomain}`);
    return null;
  }

  onProgress?.(`📡 IP: ${ip} — Querying Shodan...`);

  // Get host info
  const hostResult = await shodanHostLookup(ip);
  if (!hostResult) {
    onProgress?.(`❌ Shodan lookup failed for ${ip}`);
    return null;
  }

  // Get reverse DNS for shared domains
  const reverseDomains = await shodanReverseDNS(ip);
  hostResult.sharedDomains = Array.from(new Set([...hostResult.sharedDomains, ...reverseDomains]));

  const ports = hostResult.ports;
  const findService = (port: number) => hostResult.services.find(s => s.port === port);

  // Detect server type from HTTP services
  const httpService = findService(80) || findService(443) || findService(8080);
  const serverType = httpService?.httpServer || httpService?.product;

  const intelligence: PortIntelligence = {
    ftpOpen: ports.includes(21),
    ftpService: findService(21),
    sshOpen: ports.includes(22),
    sshService: findService(22),
    httpOpen: ports.includes(80),
    httpsOpen: ports.includes(443),
    cpanelOpen: ports.includes(2083) || ports.includes(2082),
    whmOpen: ports.includes(2087) || ports.includes(2086),
    directAdminOpen: ports.includes(2222),
    pleskOpen: ports.includes(8443) || ports.includes(8880),
    mysqlOpen: ports.includes(3306),
    phpMyAdminLikely: ports.includes(80) || ports.includes(443) || ports.includes(8080),
    webminOpen: ports.includes(10000),
    smtpOpen: ports.includes(25) || ports.includes(587) || ports.includes(465),
    allPorts: ports,
    serverType,
    os: hostResult.os || undefined,
    vulns: hostResult.vulns,
    sharedDomains: hostResult.sharedDomains.filter(d => d !== cleanDomain),
    raw: hostResult,
  };

  // Log summary
  const openServices: string[] = [];
  if (intelligence.ftpOpen) openServices.push("FTP:21");
  if (intelligence.sshOpen) openServices.push("SSH:22");
  if (intelligence.httpOpen) openServices.push("HTTP:80");
  if (intelligence.httpsOpen) openServices.push("HTTPS:443");
  if (intelligence.cpanelOpen) openServices.push("cPanel:2083");
  if (intelligence.whmOpen) openServices.push("WHM:2087");
  if (intelligence.directAdminOpen) openServices.push("DirectAdmin:2222");
  if (intelligence.pleskOpen) openServices.push("Plesk:8443");
  if (intelligence.mysqlOpen) openServices.push("MySQL:3306");
  if (intelligence.webminOpen) openServices.push("Webmin:10000");
  if (intelligence.smtpOpen) openServices.push("SMTP");

  onProgress?.(`✅ Shodan scan: ${ports.length} ports open — ${openServices.join(", ") || "none relevant"}`);

  if (hostResult.vulns.length > 0) {
    onProgress?.(`🔴 CVEs found: ${hostResult.vulns.slice(0, 5).join(", ")}${hostResult.vulns.length > 5 ? ` +${hostResult.vulns.length - 5} more` : ""}`);
  }

  if (intelligence.sharedDomains.length > 0) {
    onProgress?.(`🏠 Shared hosting: ${intelligence.sharedDomains.length} other domain(s) on same IP`);
  }

  if (serverType) {
    onProgress?.(`🖥️ Server: ${serverType}${intelligence.os ? ` (${intelligence.os})` : ""}`);
  }

  return intelligence;
}

/**
 * Format Shodan results for Telegram display
 */
export function formatShodanForTelegram(intel: PortIntelligence): string {
  const lines: string[] = [];
  lines.push(`📡 <b>Shodan Port Scan</b>`);
  lines.push(`IP: <code>${intel.raw.ip}</code>`);

  if (intel.serverType) lines.push(`Server: ${intel.serverType}`);
  if (intel.os) lines.push(`OS: ${intel.os}`);
  if (intel.raw.org) lines.push(`Org: ${intel.raw.org}`);

  lines.push("");
  lines.push(`<b>Open Ports (${intel.allPorts.length}):</b>`);

  const portLabels: [boolean, string][] = [
    [intel.ftpOpen, `✅ FTP (21)${intel.ftpService?.product ? ` — ${intel.ftpService.product} ${intel.ftpService.version || ""}` : ""}`],
    [intel.sshOpen, `✅ SSH (22)${intel.sshService?.product ? ` — ${intel.sshService.product} ${intel.sshService.version || ""}` : ""}`],
    [intel.httpOpen, "✅ HTTP (80)"],
    [intel.httpsOpen, "✅ HTTPS (443)"],
    [intel.cpanelOpen, "✅ cPanel (2083)"],
    [intel.whmOpen, "✅ WHM (2087)"],
    [intel.directAdminOpen, "✅ DirectAdmin (2222)"],
    [intel.pleskOpen, "✅ Plesk (8443)"],
    [intel.mysqlOpen, "✅ MySQL (3306)"],
    [intel.webminOpen, "✅ Webmin (10000)"],
    [intel.smtpOpen, "✅ SMTP"],
  ];

  for (const [open, label] of portLabels) {
    if (open) lines.push(label);
  }

  if (intel.vulns.length > 0) {
    lines.push("");
    lines.push(`<b>🔴 Vulnerabilities (${intel.vulns.length}):</b>`);
    lines.push(intel.vulns.slice(0, 10).join(", "));
  }

  if (intel.sharedDomains.length > 0) {
    lines.push("");
    lines.push(`<b>🏠 Shared Hosting (${intel.sharedDomains.length}):</b>`);
    lines.push(intel.sharedDomains.slice(0, 10).join(", "));
    if (intel.sharedDomains.length > 10) {
      lines.push(`+${intel.sharedDomains.length - 10} more`);
    }
  }

  return lines.join("\n");
}
