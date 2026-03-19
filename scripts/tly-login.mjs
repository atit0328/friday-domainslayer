import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { ProxyAgent, fetch: undiciFetch, CookieJar, Cookie } = require("undici");

const EMAIL = "natawat24190@gmail.com";
const PASSWORD = "grin160455";

// Try multiple proxies
const proxies = [
  "http://ujk6929555692eb1:QFaweUht0yMm92zj8t@154.91.201.64:44001",
  "http://leX68a3123f423e2:Oz1QnyM0a9vKufm7wD@62.112.141.247:44001",
  "http://fQk693944a3949e9:m08iLaGXYWoMSqnH1N@62.112.140.202:44001",
  "http://rNP69227b09ca64b:S3FIHAYVBsqyvdaWRZ@62.112.140.52:44001",
  "http://mYn68fef2f3099bd:zMekDComOUXH7ZbR6f@62.112.140.145:44001",
  "http://f7y69227b0a3ac2a:nrz5wXZEkh9ie3DURe@62.112.140.182:44001",
  "http://fqo6915f84e4f8a3:Y3vSHfVX5yUmgcKe6U@62.112.140.147:44001",
  "http://v8Q691de857ed872:KFBRw59Gzhv7bgae8P@62.112.141.27:44001",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function tryProxy(proxyUrl) {
  const proxyHost = proxyUrl.split("@")[1];
  console.log(`\n=== Trying proxy: ${proxyHost} ===`);
  
  const agent = new ProxyAgent({ uri: proxyUrl });
  let allCookies = "";
  
  // Step 1: GET login page
  try {
    const loginPage = await undiciFetch("https://t.ly/login", {
      dispatcher: agent,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: AbortSignal.timeout(20000),
    });
    
    console.log("GET /login status:", loginPage.status);
    
    if (loginPage.status === 403) {
      const body = await loginPage.text();
      if (body.includes("Just a moment") || body.includes("cf_chl")) {
        console.log("❌ Cloudflare challenge - skip this proxy");
        return null;
      }
    }
    
    // Collect cookies
    const setCookies = loginPage.headers.getSetCookie?.() || [];
    allCookies = setCookies.map(c => c.split(";")[0]).join("; ");
    console.log("Cookies:", allCookies.substring(0, 100));
    
    const html = await loginPage.text();
    
    // Extract CSRF token
    const csrfMatch = html.match(/name="_token"\s+value="([^"]+)"/);
    const csrf = csrfMatch?.[1];
    console.log("CSRF:", csrf ? csrf.substring(0, 30) + "..." : "NOT FOUND");
    
    if (!csrf) {
      console.log("Page content (first 500):", html.substring(0, 500));
      return null;
    }
    
    // Step 2: POST login
    console.log(`\nPOST /login with ${EMAIL}...`);
    const loginResp = await undiciFetch("https://t.ly/login", {
      method: "POST",
      dispatcher: agent,
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": allCookies,
        "Referer": "https://t.ly/login",
        "Origin": "https://t.ly",
      },
      body: `_token=${encodeURIComponent(csrf)}&email=${encodeURIComponent(EMAIL)}&password=${encodeURIComponent(PASSWORD)}`,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    
    console.log("POST status:", loginResp.status);
    console.log("Location:", loginResp.headers.get("location"));
    
    // Collect new cookies
    const newCookies = loginResp.headers.getSetCookie?.() || [];
    const allNewCookies = [...setCookies, ...newCookies].map(c => c.split(";")[0]).join("; ");
    
    if (loginResp.status === 302) {
      const location = loginResp.headers.get("location");
      if (location?.includes("dashboard") || location === "https://t.ly/dashboard" || location === "/dashboard") {
        console.log("🎯🎯🎯 LOGIN SUCCESS! 🎯🎯🎯");
        
        // Step 3: Access dashboard to find links
        const dashResp = await undiciFetch(location.startsWith("http") ? location : `https://t.ly${location}`, {
          dispatcher: agent,
          headers: {
            "User-Agent": UA,
            "Accept": "text/html",
            "Cookie": allNewCookies,
          },
          signal: AbortSignal.timeout(20000),
        });
        
        console.log("\nDashboard status:", dashResp.status);
        const dashHtml = await dashResp.text();
        
        // Search for pgw828 link
        const pgwMatch = dashHtml.match(/pgw828/gi);
        console.log("pgw828 found in dashboard:", !!pgwMatch);
        
        // Search for API key
        const apiKeyMatch = dashHtml.match(/api[_-]?key[^"]*"([^"]+)"/i) || dashHtml.match(/Bearer\s+([a-zA-Z0-9]+)/);
        console.log("API key found:", apiKeyMatch ? apiKeyMatch[1].substring(0, 20) + "..." : "not found");
        
        // Save dashboard HTML
        const fs = require("fs");
        fs.writeFileSync("/tmp/tly_dashboard.html", dashHtml);
        console.log("Dashboard HTML saved to /tmp/tly_dashboard.html");
        
        // Try to access links list
        const linksResp = await undiciFetch("https://t.ly/dashboard/links", {
          dispatcher: agent,
          headers: {
            "User-Agent": UA,
            "Accept": "text/html",
            "Cookie": allNewCookies,
          },
          signal: AbortSignal.timeout(20000),
        });
        console.log("\nLinks page status:", linksResp.status);
        const linksHtml = await linksResp.text();
        
        // Search for pgw828
        const pgwInLinks = linksHtml.match(/pgw828/gi);
        console.log("pgw828 in links page:", !!pgwInLinks);
        
        // Save links HTML
        fs.writeFileSync("/tmp/tly_links.html", linksHtml);
        console.log("Links HTML saved to /tmp/tly_links.html");
        
        // Also try API endpoint
        const apiResp = await undiciFetch("https://t.ly/api/v1/link/list", {
          dispatcher: agent,
          headers: {
            "User-Agent": UA,
            "Accept": "application/json",
            "Cookie": allNewCookies,
          },
          signal: AbortSignal.timeout(20000),
        });
        console.log("\nAPI links list status:", apiResp.status);
        const apiText = await apiResp.text();
        console.log("API response:", apiText.substring(0, 500));
        
        return { success: true, cookies: allNewCookies };
      } else if (location?.includes("login")) {
        console.log("❌ Redirected back to login - wrong credentials");
        // Check for error message
        const body = await loginResp.text();
        const errorMatch = body.match(/class="alert[^"]*"[^>]*>([^<]+)/);
        console.log("Error:", errorMatch?.[1] || "unknown");
      }
    } else {
      const body = await loginResp.text();
      console.log("Response body (first 300):", body.substring(0, 300));
    }
    
    return null;
  } catch (e) {
    console.error("Error:", e.message);
    return null;
  }
}

// Try each proxy until one works
for (const proxy of proxies) {
  const result = await tryProxy(proxy);
  if (result?.success) {
    console.log("\n\n✅ Successfully logged in! Cookies saved.");
    break;
  }
}
