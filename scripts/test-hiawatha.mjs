import { ProxyAgent } from "undici";

const TARGET_URL = "https://www.hiawathaschools.org/events";

// Thai proxy list from proxy-pool.ts
const THAI_PROXIES = [
  "http://thproxy1:thpass1@th-proxy-pool.example.com:8080", // placeholder — will use actual ones
];

// Read actual Thai proxy from the proxy-pool.ts
const RAW_THAI_PROXIES = [
  { host: "103.126.86.68", port: 8080 },
  { host: "171.6.72.126", port: 8080 },
  { host: "49.228.96.221", port: 8080 },
  { host: "171.6.78.42", port: 8080 },
  { host: "49.228.166.255", port: 8080 },
];

// Residential proxy (from proxy-pool.ts)
const RESIDENTIAL_PROXY = "http://spxz8z4gfp:RNW78Fm5a5G8lMmrT7_country-th@gate.nodemaven.com:8080";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function fetchWithProxy(url, proxyUrl, options = {}) {
  const dispatcher = new ProxyAgent(proxyUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 15000);
  
  try {
    const resp = await fetch(url, {
      ...options,
      dispatcher,
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
        ...(options.headers || {}),
      },
    });
    clearTimeout(timer);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function traceRedirectChain(url, proxyUrl) {
  const chain = [];
  let currentUrl = url;
  let maxHops = 10;
  
  while (maxHops-- > 0) {
    try {
      const resp = await fetchWithProxy(currentUrl, proxyUrl, { redirect: "manual" });
      const status = resp.status;
      const location = resp.headers.get("location");
      const body = await resp.text();
      
      const hop = {
        url: currentUrl,
        status,
        location: location || null,
        redirectType: null,
        bodyLength: body.length,
        bodySnippet: null,
        jsRedirect: null,
        metaRedirect: null,
      };
      
      // Check for server-side redirect (301/302/307/308)
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        hop.redirectType = `HTTP ${status}`;
        chain.push(hop);
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }
      
      // Check for meta refresh redirect
      const metaMatch = body.match(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']?\d+;\s*url=([^"'\s>]+)/i);
      if (metaMatch) {
        hop.redirectType = "Meta Refresh";
        hop.metaRedirect = metaMatch[1];
        chain.push(hop);
        currentUrl = new URL(metaMatch[1], currentUrl).href;
        continue;
      }
      
      // Check for JavaScript redirects
      const jsPatterns = [
        /window\.location\s*(?:\.href)?\s*=\s*["']([^"']+)["']/i,
        /window\.location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
        /document\.location\s*(?:\.href)?\s*=\s*["']([^"']+)["']/i,
        /location\.href\s*=\s*["']([^"']+)["']/i,
        /window\.open\s*\(\s*["']([^"']+)["']/i,
        /top\.location\s*=\s*["']([^"']+)["']/i,
      ];
      
      let jsRedirectFound = null;
      for (const pattern of jsPatterns) {
        const match = body.match(pattern);
        if (match) {
          jsRedirectFound = match[1];
          break;
        }
      }
      
      if (jsRedirectFound) {
        hop.redirectType = "JavaScript";
        hop.jsRedirect = jsRedirectFound;
        chain.push(hop);
        currentUrl = new URL(jsRedirectFound, currentUrl).href;
        continue;
      }
      
      // Check for iframe-based redirect
      const iframeMatch = body.match(/<iframe[^>]*src\s*=\s*["']([^"']+)["'][^>]*(?:style\s*=\s*["'][^"']*(?:width\s*:\s*100|height\s*:\s*100)[^"']*["'])?/i);
      if (iframeMatch) {
        hop.redirectType = "iframe";
        hop.jsRedirect = iframeMatch[1];
      }
      
      // Save body snippet for analysis
      hop.bodySnippet = body.substring(0, 3000);
      chain.push(hop);
      break; // No more redirects
      
    } catch (err) {
      chain.push({
        url: currentUrl,
        status: 0,
        error: err.message,
        redirectType: "error",
      });
      break;
    }
  }
  
  return chain;
}

async function analyzeBody(body) {
  const findings = [];
  
  // Check for gambling/SEO spam content
  const gamblingPatterns = [
    /สล็อต/i, /บาคาร่า/i, /คาสิโน/i, /แทงบอล/i, /เว็บตรง/i,
    /pgwin/i, /pg\s*slot/i, /joker/i, /betflix/i, /fafa/i, /sawa/i,
    /slot/i, /casino/i, /gambling/i, /betting/i,
  ];
  
  for (const pattern of gamblingPatterns) {
    const matches = body.match(new RegExp(pattern.source, "gi"));
    if (matches && matches.length > 0) {
      findings.push({ type: "gambling_content", pattern: pattern.source, count: matches.length });
    }
  }
  
  // Check for hidden links
  const hiddenLinkPattern = /<a[^>]*style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|font-size\s*:\s*0|position\s*:\s*absolute[^"']*left\s*:\s*-\d+)[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = hiddenLinkPattern.exec(body)) !== null) {
    findings.push({ type: "hidden_link", url: match[1] });
  }
  
  // Check for cloaking scripts
  if (body.includes("navigator.userAgent") || body.includes("document.referrer")) {
    findings.push({ type: "possible_cloaking", detail: "UA/referrer detection found" });
  }
  
  // Check for external scripts
  const scriptPattern = /<script[^>]*src\s*=\s*["']([^"']+)["']/gi;
  const externalScripts = [];
  while ((match = scriptPattern.exec(body)) !== null) {
    if (!match[1].includes("hiawathaschools.org") && !match[1].startsWith("/")) {
      externalScripts.push(match[1]);
    }
  }
  if (externalScripts.length > 0) {
    findings.push({ type: "external_scripts", scripts: externalScripts });
  }
  
  return findings;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  REDIRECT ANALYSIS: hiawathaschools.org/events");
  console.log("═══════════════════════════════════════════════════════");
  
  // Test 1: Direct fetch (no proxy) with redirect: manual
  console.log("\n─── Test 1: Direct fetch (no proxy) ───");
  try {
    const resp = await fetch(TARGET_URL, {
      redirect: "manual",
      headers: { "User-Agent": UA, "Accept-Language": "th-TH,th;q=0.9" },
    });
    console.log(`Status: ${resp.status}`);
    console.log(`Location: ${resp.headers.get("location") || "none"}`);
    const body = await resp.text();
    console.log(`Body length: ${body.length}`);
    
    // Check for redirects in body
    const jsRedirect = body.match(/window\.location[^;]*=\s*["']([^"']+)["']/i);
    const metaRedirect = body.match(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']?\d+;\s*url=([^"'\s>]+)/i);
    if (jsRedirect) console.log(`JS Redirect: ${jsRedirect[1]}`);
    if (metaRedirect) console.log(`Meta Redirect: ${metaRedirect[1]}`);
    if (!jsRedirect && !metaRedirect && resp.status === 200) {
      console.log("No redirect detected (direct)");
      console.log(`Title: ${body.match(/<title[^>]*>([^<]+)/i)?.[1] || "N/A"}`);
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
  
  // Test 2: Thai residential proxy
  console.log("\n─── Test 2: Thai Residential Proxy ───");
  try {
    const chain = await traceRedirectChain(TARGET_URL, RESIDENTIAL_PROXY);
    console.log(`Redirect chain (${chain.length} hops):`);
    for (let i = 0; i < chain.length; i++) {
      const hop = chain[i];
      console.log(`  [${i + 1}] ${hop.url}`);
      console.log(`      Status: ${hop.status} | Type: ${hop.redirectType || "final"}`);
      if (hop.location) console.log(`      Location: ${hop.location}`);
      if (hop.jsRedirect) console.log(`      JS/iframe: ${hop.jsRedirect}`);
      if (hop.metaRedirect) console.log(`      Meta: ${hop.metaRedirect}`);
      if (hop.error) console.log(`      Error: ${hop.error}`);
      
      // Analyze final page body
      if (hop.bodySnippet && !hop.redirectType) {
        console.log(`      Body length: ${hop.bodyLength}`);
        console.log(`      Title: ${hop.bodySnippet.match(/<title[^>]*>([^<]+)/i)?.[1] || "N/A"}`);
        
        const findings = await analyzeBody(hop.bodySnippet);
        if (findings.length > 0) {
          console.log(`      Findings:`);
          for (const f of findings) {
            console.log(`        - ${f.type}: ${JSON.stringify(f).substring(0, 150)}`);
          }
        }
        
        // Save full body for analysis
        const fs = await import("fs");
        fs.writeFileSync("/tmp/hiawatha_body.html", hop.bodySnippet);
        console.log("      (Body saved to /tmp/hiawatha_body.html)");
      }
    }
    
    // Final destination
    const finalHop = chain[chain.length - 1];
    console.log(`\n  Final destination: ${finalHop.url}`);
    
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
  
  // Test 3: Compare with non-Thai IP (direct)
  console.log("\n─── Test 3: Follow all redirects (Thai proxy) ───");
  try {
    const resp = await fetchWithProxy(TARGET_URL, RESIDENTIAL_PROXY, { redirect: "follow" });
    console.log(`Final URL: ${resp.url}`);
    console.log(`Status: ${resp.status}`);
    const body = await resp.text();
    console.log(`Body length: ${body.length}`);
    console.log(`Title: ${body.match(/<title[^>]*>([^<]+)/i)?.[1] || "N/A"}`);
    
    // Check for gambling content
    const gamblingWords = ["สล็อต", "บาคาร่า", "คาสิโน", "pgwin", "slot", "casino", "betting", "เว็บตรง"];
    const found = gamblingWords.filter(w => body.toLowerCase().includes(w.toLowerCase()));
    if (found.length > 0) {
      console.log(`⚠️ Gambling content detected: ${found.join(", ")}`);
    }
    
    // Save full body
    const fs = await import("fs");
    fs.writeFileSync("/tmp/hiawatha_full.html", body);
    console.log("(Full body saved to /tmp/hiawatha_full.html)");
    
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
  
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ANALYSIS COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
}

main().catch(console.error);
