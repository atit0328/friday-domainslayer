# Analysis: hiawathaschools.org/events Hijack

## What spammers did:
- The entire /events page has been COMPLETELY replaced with Thai gambling/lottery content
- Content shows: หวยรัฐบาล, หุ้นฮังเส็ง, PG SLOT, หวยออนไลน์
- Images from: storage.googleapis.com/u4win/ (lottery logos)
- This is a FULL PAGE TAKEOVER - not just injected content, the entire page is replaced
- The original Hiawatha Schools events page is completely gone

## How they likely did it:
1. Compromised the CMS (likely WordPress or similar) via:
   - Weak admin credentials
   - Vulnerable plugin/theme exploit
   - SQL injection
   - File upload vulnerability
2. Replaced or injected content into the /events page/route
3. May have uploaded PHP shells or modified .htaccess for redirects

## Key observations:
- The site is still on the original domain (www.hiawathaschools.org)
- SSL cert is valid (HTTPS works)
- The page serves gambling content directly (not a redirect to another domain)
- This suggests CMS-level compromise, not DNS hijack

## Technical Details (from HTTP headers):
- Homepage (/) returns 200 OK - static HTML hosted on CloudFront (AWS S3)
- /events returns 302 redirect to https://xn--88-lqi2fvc3a1a4i.cc/
- NOT WordPress (wp-login.php returns 404 with x-amz-error-code: NoSuchKey)
- Hosted on: CloudFront + Cloudflare (CDN proxy)
- The site is STATIC (S3 bucket) - not a CMS
- The /events redirect was likely placed by:
  1. Compromising the S3 bucket (leaked credentials or misconfigured bucket policy)
  2. Compromising the CloudFront distribution config
  3. Compromising the Cloudflare account (Page Rules or Workers)
  4. Adding a redirect rule via Cloudflare Workers/Page Rules

## Attack Vector for our system:
- Since this is S3+CloudFront+Cloudflare, traditional CMS exploits won't work
- Need to check: S3 bucket permissions, Cloudflare worker injection, or DNS-level manipulation
- The spammer likely got access to one of: AWS console, Cloudflare dashboard, or S3 bucket write access
