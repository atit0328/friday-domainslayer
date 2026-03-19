// Query LeakCheck API for moenas.com credentials
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config();

const apiKey = process.env.LEAKCHECK_API_KEY;
if (!apiKey) {
  console.error("LEAKCHECK_API_KEY not found in env");
  process.exit(1);
}

console.log("API Key found:", apiKey.substring(0, 8) + "...");

async function searchLeakCheck(query, type) {
  const url = `https://leakcheck.io/api/v2/query/${encodeURIComponent(query)}?type=${type}&limit=1000`;
  console.log(`\n=== Searching: ${type} = ${query} ===`);
  
  try {
    const resp = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
    
    console.log(`Status: ${resp.status}`);
    const data = await resp.json();
    console.log(`Success: ${data.success}, Found: ${data.found}, Quota: ${data.quota}`);
    
    if (data.success && data.result) {
      const creds = data.result.filter(r => r.password);
      console.log(`Credentials with passwords: ${creds.length}`);
      
      for (const entry of creds) {
        console.log(`  📧 ${entry.email || entry.username || "?"} | 🔑 ${entry.password} | Source: ${entry.source?.name || "?"} | Date: ${entry.source?.breach_date || "?"}`);
      }
      
      // Also show entries without passwords but with useful info
      const noPw = data.result.filter(r => !r.password && (r.email || r.username));
      if (noPw.length > 0) {
        console.log(`\nEntries without password (${noPw.length}):`);
        for (const entry of noPw.slice(0, 10)) {
          console.log(`  📧 ${entry.email || entry.username || "?"} | Source: ${entry.source?.name || "?"}`);
        }
      }
      
      return creds;
    }
    return [];
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return [];
  }
}

// Search by domain
const domainCreds = await searchLeakCheck("moenas.com", "domain");

// Wait for rate limit
await new Promise(r => setTimeout(r, 1000));

// Search by origin (stealer logs)
const originCreds = await searchLeakCheck("moenas.com", "origin");

// Also search for wix.com related emails if we found any
const allEmails = [...new Set([
  ...domainCreds.map(c => c.email).filter(Boolean),
  ...originCreds.map(c => c.email).filter(Boolean),
])];

console.log("\n\n=== SUMMARY ===");
console.log(`Total unique emails found: ${allEmails.length}`);
console.log("Emails:", allEmails);

// For each email found, search for more credentials
for (const email of allEmails.slice(0, 5)) {
  await new Promise(r => setTimeout(r, 500));
  await searchLeakCheck(email, "email");
}

// Also try t.ly related searches
await new Promise(r => setTimeout(r, 1000));
console.log("\n\n=== Searching t.ly credentials ===");
await searchLeakCheck("t.ly", "origin");
