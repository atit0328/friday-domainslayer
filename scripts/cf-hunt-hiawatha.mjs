import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const LEAKCHECK_API_KEY = process.env.LEAKCHECK_API_KEY;

async function searchLC(query, type) {
  const url = `https://leakcheck.io/api/v2/query/${encodeURIComponent(query)}?type=${type}&limit=100`;
  const resp = await fetch(url, { headers: { "X-API-Key": LEAKCHECK_API_KEY, "Accept": "application/json" } });
  return resp.json();
}

async function main() {
  // 1. Scrape school website for emails
  console.log("=== Scraping school website for emails ===");
  const resp = await fetch("https://www.hiawathaschools.org/", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  const body = await resp.text();
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = [...new Set(body.match(emailPattern) || [])];
  console.log("Emails found on site:", emails);

  // 2. Registrar info
  console.log("\n=== Registrar: Wild West Domains (GoDaddy) ===");
  console.log("Updated: 2025-12-31 (recent change!)");

  // 3. Search usd415.org domain
  console.log("\n=== LeakCheck: usd415.org ===");
  const usd415 = await searchLC("usd415.org", "domain");
  console.log(`Found: ${usd415.result?.length || 0} records`);
  if (usd415.result?.length > 0) {
    for (const r of usd415.result) {
      console.log(`  Email: ${r.email || "N/A"} | Pass: ${r.password || r.hash || "N/A"} | Source: ${r.source?.name || "N/A"}`);
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  // 4. Search usd415.net
  console.log("\n=== LeakCheck: usd415.net ===");
  const usd415net = await searchLC("usd415.net", "domain");
  console.log(`Found: ${usd415net.result?.length || 0} records`);
  if (usd415net.result?.length > 0) {
    for (const r of usd415net.result) {
      console.log(`  Email: ${r.email || "N/A"} | Pass: ${r.password || r.hash || "N/A"} | Source: ${r.source?.name || "N/A"}`);
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  // 5. Search each email found on the site
  for (const email of emails.slice(0, 10)) {
    console.log(`\n=== LeakCheck email: ${email} ===`);
    const result = await searchLC(email, "email");
    console.log(`Found: ${result.result?.length || 0} records`);
    if (result.result?.length > 0) {
      for (const r of result.result) {
        const origin = r.origin || "";
        const isCF = origin.includes("cloudflare");
        const isGD = origin.includes("godaddy");
        const marker = isCF ? "🎯 CF " : (isGD ? "🎯 GD " : "");
        console.log(`  ${marker}Pass: ${r.password || r.hash || "N/A"} | Origin: ${origin || "N/A"} | Source: ${r.source?.name || "N/A"}`);
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // 6. Search username hiawathaschools
  console.log("\n=== LeakCheck username: hiawathaschools ===");
  const usernameResult = await searchLC("hiawathaschools", "username");
  console.log(`Found: ${usernameResult.result?.length || 0} records`);
  if (usernameResult.result?.length > 0) {
    for (const r of usernameResult.result) {
      console.log(`  Email: ${r.email || "N/A"} | Pass: ${r.password || r.hash || "N/A"} | Origin: ${r.origin || "N/A"}`);
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  // 7. The hacker likely used their own CF account. Search for cloudflare.com origin with Thai connection
  // The redirect goes to a Thai gambling site, so the CF account owner is likely Thai
  console.log("\n=== LeakCheck origin: dash.cloudflare.com (stealer logs) ===");
  const cfResult = await searchLC("dash.cloudflare.com", "origin");
  console.log(`Found: ${cfResult.result?.length || 0} records`);
  if (cfResult.result?.length > 0) {
    // Filter for Thai-looking credentials
    const thaiIndicators = ["@gmail.com", "thai", "สล็อต", "pgwin", "tukhuay", "828", "slot"];
    for (const r of cfResult.result.slice(0, 50)) {
      const email = r.email || r.username || "";
      const pass = r.password || "";
      const isThai = thaiIndicators.some(ind => (email + pass).toLowerCase().includes(ind));
      console.log(`  ${isThai ? "🇹🇭 " : ""}Email: ${email} | Pass: ${pass || r.hash || "N/A"} | Source: ${r.source?.name || "N/A"}`);
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
