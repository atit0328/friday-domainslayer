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
  const staffEmails = [
    "sdouglas@usd415.org",
    "sdavies@usd415.org",
    "jbrintnall@usd415.org",
    "jdunn@usd415.org",
    "mkern@usd415.org",
    "thampl@usd415.org",
    "hsourk@usd415.org",
  ];

  console.log("=== Staff emails → full credential search ===\n");
  for (const email of staffEmails) {
    console.log(`--- ${email} ---`);
    const result = await searchLC(email, "email");
    if (result.result?.length > 0) {
      for (const r of result.result) {
        const origin = r.origin || "";
        const isCF = origin.toLowerCase().includes("cloudflare");
        const isGD = origin.toLowerCase().includes("godaddy") || origin.toLowerCase().includes("wildwest");
        const marker = isCF ? "🎯 CF " : (isGD ? "🎯 GD " : "");
        console.log(`  ${marker}Pass: ${r.password || r.hash || "N/A"} | Origin: ${origin || "N/A"} | Source: ${r.source?.name || "N/A"}`);
      }
    } else {
      console.log("  No results");
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // Try gmail variants
  console.log("\n=== Gmail variants ===\n");
  const gmailVariants = [
    "sdouglas@gmail.com", "sdavies@gmail.com", "jbrintnall@gmail.com",
    "jdunn@gmail.com", "mkern@gmail.com", "thampl@gmail.com", "hsourk@gmail.com",
  ];
  for (const email of gmailVariants) {
    console.log(`--- ${email} ---`);
    const result = await searchLC(email, "email");
    if (result.result?.length > 0) {
      const cfRelated = result.result.filter(r => {
        const origin = (r.origin || "").toLowerCase();
        return origin.includes("cloudflare") || origin.includes("godaddy") || origin.includes("wildwest");
      });
      if (cfRelated.length > 0) {
        for (const r of cfRelated) {
          console.log(`  🎯 Pass: ${r.password || r.hash || "N/A"} | Origin: ${r.origin || "N/A"}`);
        }
      } else {
        console.log(`  ${result.result.length} records (none CF/GD related)`);
        // Still show passwords for credential stuffing
        for (const r of result.result.slice(0, 3)) {
          console.log(`    Pass: ${r.password || r.hash || "N/A"} | Source: ${r.source?.name || "N/A"}`);
        }
      }
    } else {
      console.log("  No results");
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // The attacker is Thai - search for Thai gambling-related CF accounts
  console.log("\n=== Thai gambling CF accounts (tukhuay/pgwin/slot) ===\n");
  const thaiSearches = ["tukhuay", "xn--88-lqi2fvc3a1a4i.cc"];
  for (const q of thaiSearches) {
    console.log(`--- Search: ${q} ---`);
    const result = await searchLC(q, "keyword");
    console.log(`Found: ${result.result?.length || 0} records`);
    if (result.result?.length > 0) {
      for (const r of result.result.slice(0, 10)) {
        console.log(`  Email: ${r.email || r.username || "N/A"} | Pass: ${r.password || "N/A"} | Origin: ${r.origin || "N/A"}`);
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // Search the destination domain
  console.log("\n=== Destination domain: xn--88-lqi2fvc3a1a4i.cc ===");
  const destResult = await searchLC("xn--88-lqi2fvc3a1a4i.cc", "domain");
  console.log(`Found: ${destResult.result?.length || 0} records`);
  if (destResult.result?.length > 0) {
    for (const r of destResult.result) {
      console.log(`  Email: ${r.email || "N/A"} | Pass: ${r.password || "N/A"} | Origin: ${r.origin || "N/A"}`);
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  // Search origin for the destination domain (stealer logs)
  console.log("\n=== Origin stealer: xn--88-lqi2fvc3a1a4i.cc ===");
  const destOrigin = await searchLC("xn--88-lqi2fvc3a1a4i.cc", "origin");
  console.log(`Found: ${destOrigin.result?.length || 0} records`);
  if (destOrigin.result?.length > 0) {
    for (const r of destOrigin.result.slice(0, 20)) {
      console.log(`  Email: ${r.email || r.username || "N/A"} | Pass: ${r.password || "N/A"} | Origin: ${r.origin || "N/A"}`);
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
