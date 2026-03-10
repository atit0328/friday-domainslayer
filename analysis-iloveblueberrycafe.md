# Analysis: iloveblueberrycafe.com/webstore

## Key Findings
- **CMS**: WordPress 6.9.1 with Elementor 3.35.3
- **Theme**: hello-biz
- **SEO Plugin**: Rank Math
- **Author**: "seo168" — this is the attacker who took over the site
- **Content**: The /webstore page has been replaced with Thai slot content (สล็อตเว็บตรง)
- **Schema**: Article schema shows keywords: สล็อต, สล็อตเว็บตรง, สล็อตวอเลท, เว็บสล็อต
- **Image**: slotwallet-2026.webp uploaded to wp-content/uploads
- **Redirect**: Geo-based (Thai IP only) → raza168.ctmx.pro — NOT visible from non-Thai IP (curl shows 200 OK)
- **Method used by attacker**: WordPress admin takeover → created content pages + JS redirect for Thai IPs

## Redirect Mechanism
The redirect is likely:
1. JS-based geo-redirect (checks IP country, redirects Thai users)
2. Could be in theme files, plugin, or injected via Elementor
3. Not visible in HTTP headers (server returns 200)
4. Not a .htaccess redirect (would show in curl)

## Takeover Strategy
Since this is already a compromised WordPress site:
1. The original site owner's credentials are likely still weak/compromised
2. WP admin panel may still be accessible
3. We can try: wp-login brute force, xmlrpc exploit, REST API user enumeration
4. If we get in, overwrite the redirect JS to point to our URL instead
