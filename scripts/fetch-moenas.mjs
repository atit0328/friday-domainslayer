// Fetch www.moenas.com/menus through residential proxy to bypass Cloudflare
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { ProxyAgent, fetch: undiciFetch } = require("undici");

const proxies = [
  "http://ujk6929555692eb1:QFaweUht0yMm92zj8t@154.91.201.64:44001",
  "http://leX68a3123f423e2:Oz1QnyM0a9vKufm7wD@62.112.141.247:44001",
  "http://fQk693944a3949e9:m08iLaGXYWoMSqnH1N@62.112.140.202:44001",
];

const url = "https://www.moenas.com/menus";
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

for (const proxyUrl of proxies) {
  console.log(`\n=== Trying proxy: ${proxyUrl.split('@')[1]} ===`);
  try {
    const agent = new ProxyAgent({ uri: proxyUrl });
    const resp = await undiciFetch(url, {
      dispatcher: agent,
      headers,
      redirect: "follow",
    });
    console.log(`Status: ${resp.status}`);
    
    const body = await resp.text();
    console.log(`Body length: ${body.length}`);
    
    // Check if CF challenge
    if (body.includes('Just a moment') || body.includes('cf_chl')) {
      console.log('⚠️ Cloudflare challenge - trying next proxy');
      continue;
    }
    
    console.log('✅ Got real page!');
    
    // Save body
    const fs = await import('fs');
    fs.writeFileSync('/tmp/moenas_proxy.html', body);
    console.log('Saved to /tmp/moenas_proxy.html');
    
    // Search for t.ly
    if (body.includes('t.ly')) {
      console.log('\n🎯 FOUND t.ly!');
      const matches = body.match(/https?:\/\/t\.ly\/[^\s"'<>)]+/g);
      console.log('URLs:', matches);
    }
    
    // Search for pgw828
    if (body.includes('pgw828')) {
      console.log('\n🎯 FOUND pgw828!');
      const idx = body.indexOf('pgw828');
      console.log('Context:', body.substring(Math.max(0, idx - 300), idx + 100));
    }
    
    // Search for any short URLs
    const shortUrls = body.match(/https?:\/\/(bit\.ly|t\.ly|tinyurl\.com|goo\.gl|is\.gd|rb\.gy|cutt\.ly|short\.io|ow\.ly)[^\s"'<>)]+/g);
    if (shortUrls) {
      console.log('\n🔗 Short URLs:', [...new Set(shortUrls)]);
    }
    
    // Find all external links
    const allHrefs = body.match(/href=["']([^"']+)["']/g) || [];
    const external = allHrefs
      .map(m => m.match(/href=["']([^"']+)["']/)?.[1])
      .filter(l => l && !l.includes('moenas.com') && !l.startsWith('#') && !l.startsWith('/') && !l.startsWith('javascript'));
    console.log('\nExternal links:', [...new Set(external)].slice(0, 30));
    
    // Find all script src
    const scriptSrcs = body.match(/src=["']([^"']+)["']/g) || [];
    const externalScripts = scriptSrcs
      .map(m => m.match(/src=["']([^"']+)["']/)?.[1])
      .filter(l => l && !l.includes('moenas.com') && !l.startsWith('/'));
    console.log('\nExternal scripts:', [...new Set(externalScripts)].slice(0, 20));
    
    // Look for redirect patterns in JS
    const redirectPatterns = [
      { name: 'window.location', regex: /window\.location[.\s]*=\s*["']([^"']+)["']/g },
      { name: 'location.href', regex: /location\.href\s*=\s*["']([^"']+)["']/g },
      { name: 'location.replace', regex: /location\.replace\s*\(\s*["']([^"']+)["']/g },
      { name: 'meta refresh', regex: /content=["']\d+;\s*url=([^"']+)["']/gi },
    ];
    
    for (const { name, regex } of redirectPatterns) {
      let match;
      while ((match = regex.exec(body)) !== null) {
        console.log(`\n🔀 ${name}: ${match[1]}`);
      }
    }
    
    // Print first 3000 chars
    console.log('\n=== First 3000 chars ===');
    console.log(body.substring(0, 3000));
    
    break;
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

// Also check t.ly/pgw828 directly
console.log('\n\n=== Checking t.ly/pgw828 directly ===');
try {
  const resp = await fetch('https://t.ly/pgw828', {
    redirect: 'manual',
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  console.log(`Status: ${resp.status}`);
  console.log(`Location: ${resp.headers.get('location')}`);
  const body = await resp.text();
  console.log(`Body (first 500):`, body.substring(0, 500));
} catch (err) {
  console.error(`t.ly error: ${err.message}`);
}
