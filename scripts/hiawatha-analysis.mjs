import dns from "dns";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function main() {
  // Check 1: DNS
  console.log("=== DNS Records ===");
  const resolver = new dns.Resolver();
  try {
    const a = await new Promise((res, rej) => resolver.resolve4("www.hiawathaschools.org", (err, addrs) => err ? rej(err) : res(addrs)));
    console.log("A records:", a);
  } catch (e) { console.log("A error:", e.message); }
  try {
    const ns = await new Promise((res, rej) => resolver.resolveNs("hiawathaschools.org", (err, addrs) => err ? rej(err) : res(addrs)));
    console.log("NS:", ns);
  } catch (e) { console.log("NS error:", e.message); }

  // Check 2: Response analysis
  console.log("\n=== Response Analysis ===");
  const resp = await fetch("https://www.hiawathaschools.org/events", {
    redirect: "manual",
    headers: { "User-Agent": UA }
  });
  console.log("Status:", resp.status);
  console.log("Server:", resp.headers.get("server"));
  console.log("CF-Ray:", resp.headers.get("cf-ray"));
  console.log("Content-Length:", resp.headers.get("content-length"));
  console.log("Location:", resp.headers.get("location"));

  if (resp.headers.get("server") === "cloudflare" && resp.headers.get("content-length") === "0") {
    console.log("\nVERDICT: CLOUDFLARE-LEVEL redirect (Page Rule or Redirect Rule)");
    console.log("The 302 is from Cloudflare, NOT the origin server");
  }

  // Check 3: Other paths
  console.log("\n=== Other Paths ===");
  const paths = ["/", "/about", "/contact", "/wp-admin", "/wp-login.php", "/administrator"];
  for (const path of paths) {
    try {
      const r = await fetch("https://www.hiawathaschools.org" + path, {
        redirect: "manual",
        headers: { "User-Agent": UA }
      });
      const loc = r.headers.get("location");
      const server = r.headers.get("server");
      const body = await r.text();
      console.log(`  ${path} -> ${r.status}${loc ? " -> " + loc : ""} [${server}] body:${body.length}`);
    } catch (e) {
      console.log(`  ${path} -> Error: ${e.message}`);
    }
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log("Target: www.hiawathaschools.org/events");
  console.log("Redirect: 302 -> https://xn--88-lqi2fvc3a1a4i.cc/");
  console.log("Destination: Thai lottery/gambling site (TUKHUAY - ตุ๊กหวย)");
  console.log("OG image: self-imagex.image-etc.co/TUKHUAY/...");
  console.log("Redirect method: Cloudflare Page Rule (server-side 302, empty body, CF headers)");
  console.log("Platform: Cloudflare DNS + CDN");
  console.log("\nTakeover vectors:");
  console.log("  1. Cloudflare account takeover (change Page Rule/Redirect Rule)");
  console.log("  2. DNS takeover (change nameservers)");
  console.log("  3. Domain registrar takeover (change DNS settings)");
}

main().catch(console.error);
