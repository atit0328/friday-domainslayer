/**
 * DNS Hijack / Subdomain Takeover Analysis for hiawathaschools.org
 * 
 * Checks:
 * 1. Full DNS record enumeration (A, AAAA, CNAME, MX, NS, TXT, SOA)
 * 2. Subdomain enumeration via common wordlist
 * 3. Dangling CNAME detection (points to unclaimed service)
 * 4. NS delegation check
 * 5. Zone transfer attempt (AXFR)
 */

import { execSync } from "child_process";

const TARGET = "hiawathaschools.org";

// Common subdomains to check
const SUBDOMAINS = [
  "www", "mail", "ftp", "smtp", "pop", "imap", "webmail",
  "admin", "portal", "vpn", "remote", "owa", "exchange",
  "autodiscover", "lyncdiscover", "sip", "sipfederationtls",
  "enterpriseregistration", "enterpriseenrollment",
  "msoid", "_dmarc", "_domainkey",
  "dev", "staging", "test", "beta", "demo",
  "api", "app", "cdn", "static", "assets", "media", "img",
  "blog", "shop", "store", "forum", "wiki", "docs",
  "ns1", "ns2", "dns", "dns1", "dns2",
  "cpanel", "whm", "webdisk", "cpcalendars", "cpcontacts",
  "calendar", "events", "news", "staff", "students",
  "library", "moodle", "canvas", "blackboard", "schoology",
  "powerschool", "infinite", "skyward", "aeries",
  "google._domainkey", "default._domainkey",
  "selector1._domainkey", "selector2._domainkey",
  "_acme-challenge", "_amazonses", "_github-challenge",
  "em", "em1", "em2", "em3", "em4", "em5",
  "link", "links", "go", "redirect", "r", "track", "click",
  "old", "new", "legacy", "archive",
];

// Services known for subdomain takeover
const DANGLING_FINGERPRINTS = {
  "github.io": { service: "GitHub Pages", check: "There isn't a GitHub Pages site here" },
  "herokuapp.com": { service: "Heroku", check: "no-such-app" },
  "herokudns.com": { service: "Heroku DNS", check: "no-such-app" },
  "azurewebsites.net": { service: "Azure", check: "" },
  "cloudapp.net": { service: "Azure Cloud", check: "" },
  "trafficmanager.net": { service: "Azure Traffic Manager", check: "" },
  "blob.core.windows.net": { service: "Azure Blob", check: "BlobNotFound" },
  "s3.amazonaws.com": { service: "AWS S3", check: "NoSuchBucket" },
  "s3-website": { service: "AWS S3 Website", check: "NoSuchBucket" },
  "elasticbeanstalk.com": { service: "AWS Elastic Beanstalk", check: "" },
  "shopify.com": { service: "Shopify", check: "Sorry, this shop is currently unavailable" },
  "myshopify.com": { service: "Shopify", check: "" },
  "wpengine.com": { service: "WP Engine", check: "" },
  "pantheonsite.io": { service: "Pantheon", check: "404 error unknown site" },
  "zendesk.com": { service: "Zendesk", check: "Help Center Closed" },
  "freshdesk.com": { service: "Freshdesk", check: "" },
  "ghost.io": { service: "Ghost", check: "" },
  "netlify.app": { service: "Netlify", check: "Not Found" },
  "fly.dev": { service: "Fly.io", check: "" },
  "vercel.app": { service: "Vercel", check: "" },
  "surge.sh": { service: "Surge", check: "project not found" },
  "bitbucket.io": { service: "Bitbucket", check: "Repository not found" },
  "readme.io": { service: "ReadMe", check: "" },
  "statuspage.io": { service: "Statuspage", check: "" },
  "uservoice.com": { service: "UserVoice", check: "" },
  "helpscoutdocs.com": { service: "HelpScout", check: "" },
  "cargo.site": { service: "Cargo", check: "" },
  "feedpress.me": { service: "FeedPress", check: "" },
  "unbouncepages.com": { service: "Unbounce", check: "" },
  "launchrock.com": { service: "LaunchRock", check: "" },
  "tictail.com": { service: "Tictail", check: "" },
  "cargocollective.com": { service: "Cargo", check: "" },
  "smartling.com": { service: "Smartling", check: "" },
  "acquia-sites.com": { service: "Acquia", check: "" },
  "proposify.biz": { service: "Proposify", check: "" },
  "simplebooklet.com": { service: "SimpleBooklet", check: "" },
};

function dig(subdomain, type = "A") {
  try {
    const cmd = `dig +short ${subdomain} ${type} 2>/dev/null`;
    return execSync(cmd, { timeout: 10000 }).toString().trim();
  } catch {
    return "";
  }
}

function digFull(subdomain, type = "ANY") {
  try {
    const cmd = `dig ${subdomain} ${type} +noall +answer 2>/dev/null`;
    return execSync(cmd, { timeout: 10000 }).toString().trim();
  } catch {
    return "";
  }
}

async function checkHttp(url) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const body = await resp.text().catch(() => "");
    return { status: resp.status, headers: Object.fromEntries(resp.headers), body: body.substring(0, 500) };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

async function main() {
  console.log(`\n🔍 DNS Hijack Analysis: ${TARGET}\n`);
  console.log("=".repeat(70));

  // 1. Full DNS records for root domain
  console.log("\n📋 ROOT DOMAIN DNS RECORDS:");
  for (const type of ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA"]) {
    const result = dig(TARGET, type);
    if (result) {
      console.log(`  ${type}: ${result.replace(/\n/g, ", ")}`);
    }
  }

  // 2. Nameserver check
  console.log("\n🌐 NAMESERVERS:");
  const ns = dig(TARGET, "NS");
  console.log(`  ${ns.replace(/\n/g, "\n  ")}`);

  // 3. Check if NS is delegated to Cloudflare
  const nsLower = ns.toLowerCase();
  const isCF = nsLower.includes("cloudflare");
  console.log(`  Cloudflare NS: ${isCF ? "YES ⚡" : "NO"}`);

  // 4. Zone transfer attempt
  console.log("\n🔓 ZONE TRANSFER ATTEMPT (AXFR):");
  const nsServers = ns.split("\n").filter(Boolean);
  for (const nsServer of nsServers.slice(0, 2)) {
    try {
      const axfr = execSync(`dig @${nsServer.replace(/\.$/, "")} ${TARGET} AXFR +short 2>/dev/null`, { timeout: 10000 }).toString().trim();
      if (axfr && !axfr.includes("Transfer failed") && !axfr.includes("; Transfer")) {
        console.log(`  ✅ AXFR from ${nsServer}: SUCCESS!`);
        console.log(`  ${axfr.substring(0, 500)}`);
      } else {
        console.log(`  ❌ AXFR from ${nsServer}: denied`);
      }
    } catch {
      console.log(`  ❌ AXFR from ${nsServer}: failed/denied`);
    }
  }

  // 5. Subdomain enumeration
  console.log("\n🔎 SUBDOMAIN ENUMERATION:");
  const findings = [];

  for (const sub of SUBDOMAINS) {
    const fqdn = `${sub}.${TARGET}`;
    
    // Check CNAME first
    const cname = dig(fqdn, "CNAME");
    const a = dig(fqdn, "A");
    
    if (cname || a) {
      const entry = { subdomain: sub, fqdn, cname: cname || null, a: a || null, dangling: false, service: null };
      
      // Check for dangling CNAME
      if (cname) {
        const cnameLower = cname.toLowerCase();
        for (const [pattern, info] of Object.entries(DANGLING_FINGERPRINTS)) {
          if (cnameLower.includes(pattern)) {
            // Verify the CNAME target resolves
            const targetA = dig(cname.replace(/\.$/, ""), "A");
            if (!targetA) {
              entry.dangling = true;
              entry.service = info.service;
              console.log(`  🎯 DANGLING! ${fqdn} → CNAME ${cname} (${info.service}) — TARGET DOES NOT RESOLVE`);
            } else {
              console.log(`  ⚠️  ${fqdn} → CNAME ${cname} (${info.service}) — resolves OK`);
            }
            break;
          }
        }
        if (!entry.dangling && !entry.service) {
          console.log(`  📍 ${fqdn} → CNAME ${cname} | A: ${a || "none"}`);
        }
      } else if (a) {
        // Check if A record points to a known service IP
        console.log(`  📍 ${fqdn} → A ${a.replace(/\n/g, ", ")}`);
      }
      
      findings.push(entry);
    }
  }

  // 6. Check specific paths on found subdomains for unclaimed services
  console.log("\n🌐 HTTP PROBE ON FOUND SUBDOMAINS:");
  const danglingFindings = findings.filter(f => f.dangling);
  const cnameFindings = findings.filter(f => f.cname && !f.dangling);

  if (danglingFindings.length > 0) {
    console.log("\n  🎯 DANGLING CNAME TARGETS (TAKEOVER POSSIBLE):");
    for (const f of danglingFindings) {
      console.log(`    ${f.fqdn} → ${f.cname} (${f.service})`);
      const httpResult = await checkHttp(`http://${f.fqdn}`);
      const httpsResult = await checkHttp(`https://${f.fqdn}`);
      console.log(`    HTTP: ${httpResult.status} | HTTPS: ${httpsResult.status}`);
      if (httpResult.body) console.log(`    Body: ${httpResult.body.substring(0, 100)}`);
    }
  }

  // 7. Check for NS delegation issues
  console.log("\n🔍 NS DELEGATION ANALYSIS:");
  if (isCF) {
    console.log("  Domain uses Cloudflare NS — redirect rules are in CF dashboard");
    console.log("  Possible attacks:");
    console.log("    1. CF account takeover (already tried — failed)");
    console.log("    2. If CF free plan → limited Page Rules → might be using Workers");
    
    // Check if there's a CF Worker
    console.log("\n  Checking for CF Workers...");
    const workerCheck = await checkHttp(`https://${TARGET}/cdn-cgi/trace`);
    if (workerCheck.status === 200) {
      console.log(`    CF trace: ${workerCheck.body.substring(0, 200)}`);
    }
  }

  // 8. Check for email-related takeover (SPF, DMARC, DKIM)
  console.log("\n📧 EMAIL SECURITY RECORDS:");
  const spf = dig(TARGET, "TXT");
  const dmarc = dig(`_dmarc.${TARGET}`, "TXT");
  console.log(`  SPF/TXT: ${spf.replace(/\n/g, "\n         ")}`);
  console.log(`  DMARC: ${dmarc || "NONE ⚠️"}`);

  // 9. Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 SUMMARY:");
  console.log(`  Total subdomains found: ${findings.length}`);
  console.log(`  Dangling CNAMEs: ${danglingFindings.length}`);
  console.log(`  CNAME records: ${cnameFindings.length}`);
  console.log(`  Cloudflare NS: ${isCF}`);
  
  if (danglingFindings.length > 0) {
    console.log("\n  🎯 TAKEOVER OPPORTUNITIES:");
    for (const f of danglingFindings) {
      console.log(`    → ${f.fqdn} via ${f.service} (claim ${f.cname})`);
    }
  } else {
    console.log("\n  ❌ No direct subdomain takeover found");
    console.log("  Alternative approaches:");
    console.log("    1. GoDaddy registrar takeover (change NS away from CF)");
    console.log("    2. CF password reset on staff emails");
    console.log("    3. Social engineering CF support");
    console.log("    4. Wait for domain expiry");
  }
}

main().catch(console.error);
