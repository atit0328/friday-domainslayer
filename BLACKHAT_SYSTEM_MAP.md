# Blackhat Mode — Full System Map

## 18 Autonomous Agents (Orchestrator)

| Agent | Interval | Purpose | Engine |
|-------|----------|---------|--------|
| attack | 1h | Auto-attack vulnerable targets | agentic-attack-engine |
| seo | 4h | Run SEO daily jobs for all projects | seo-scheduler |
| scan | 6h | Vulnerability scanning | scan-scheduler |
| research | 8h | Discover new attack vectors | autonomous-research-engine |
| learning | 6h | Adaptive learning from successes/failures | adaptive-learning |
| cve | 24h | Update CVE database | cve-scheduler |
| keyword_discovery | 3h | SerpAPI keyword + target discovery | keyword-target-discovery |
| gambling_brain | 4h | Full gambling SEO lifecycle | gambling-ai-brain |
| cms_scan | 2h | Auto-detect CMS on targets | cms-vuln-scanner |
| blackhat_brain | 3h | LLM-driven blackhat operations | agentic-blackhat-brain |
| sprint_engine | 24h | 7-day aggressive SEO sprints | seven-day-sprint |
| ctr_engine | 12h | CTR manipulation via social | ctr-manipulation-engine |
| freshness_engine | 48h | Content freshness updates | content-freshness-engine |
| gap_analyzer | 24h | Competitor gap analysis | competitor-gap-analyzer |
| serp_hijacker | 12h | SERP feature hijacking | serp-feature-hijacker |
| serp_harvester | 2h | Harvest domains from Google SERP | serp-harvester |
| content_distributor | 3h | Multi-platform content distribution | multi-platform-distributor |
| persistence_monitor | 4h | Check if redirects are still alive | persistence-monitor |

## 50+ Engines by Category

### A. Target Discovery & Intelligence
1. **serp-harvester** — Harvest competitor domains from Google SERP via SerpAPI
2. **mass-target-discovery** — Shodan + Google Dorks mass target finding
3. **keyword-target-discovery** — SerpAPI keyword search + target extraction
4. **gambling-keyword-intel** — AI keyword discovery, scoring, clustering for Thai gambling
5. **gambling-ai-brain** — Full autonomous gambling SEO lifecycle controller
6. **smart-target-discovery** — Intelligent target selection with scoring

### B. Vulnerability Analysis & Scanning
7. **cms-vuln-scanner** — Multi-CMS detection + CVE matching + exploit execution
8. **wp-vuln-scanner** — WordPress plugin/theme vulnerability scanning
9. **ai-target-analysis** — AI-powered target profiling
10. **ai-vuln-analyzer** — AI vulnerability assessment
11. **ai-prescreening** — Quick pre-scan before full attack
12. **waf-detector** — WAF detection and classification
13. **config-exploitation** — Discover exposed configs, backups, .env files
14. **dns-domain-attacks** — DNS recon, subdomain takeover, origin IP discovery

### C. Attack & Exploitation
15. **unified-attack-pipeline** — Master attack chain (35+ sub-engines)
16. **agentic-attack-engine** — Autonomous multi-phase attack system
17. **agentic-blackhat-brain** — LLM-driven technique selection + execution
18. **ai-attack-strategist** — AI retry brain for failed attacks
19. **ai-exploit-generator** — LLM-generated CMS-specific exploits
20. **indirect-attack-engine** — SQLi, LFI, RFI, SSRF, deserialization
21. **non-wp-exploits** — Laravel, Magento, Nginx, Apache exploits
22. **comprehensive-attack-vectors** — 29 attack vectors (SSTI, IDOR, JWT, etc.)
23. **wp-brute-force** — WordPress login brute-force
24. **wp-admin-takeover** — WP admin panel takeover via multiple methods
25. **wp-db-injection** — WordPress database injection
26. **shellless-attack-engine** — Attacks without file upload (open redirect, cache poison, etc.)

### D. Upload & Deployment
27. **one-click-deploy** — Enterprise-grade file deployment with WAF bypass
28. **enhanced-upload-engine** — Multi-vector parallel upload with polymorphic shells
29. **waf-bypass-engine** — WAF bypass for file uploads
30. **alt-upload-methods** — Alternative upload vectors
31. **ai-shell-generator** — AI-generated shell payloads

### E. SEO Content & Cloaking
32. **cloaking-shell-generator** — Cloaking package (bot vs human content)
33. **cloaking-content-engine** — AI gambling content generation
34. **php-injector** — Inject cloaking/redirect code into PHP files
35. **blackhat-engine** — Full-spectrum: doorway pages, link spam, meta hijack, etc.
36. **payload-arsenal** — Post-upload SEO payloads (sitemap poison, doorway, etc.)
37. **seo-spam-engine** — Full-auto exploit chain for SEO spamming
38. **seo-spam-executor** — SEO spam execution engine

### F. Parasite SEO & Content Distribution
39. **parasite-seo-blitz** — Telegraph + entity stacking mass deployment
40. **parasite-templates** — 6 ready-made Thai SEO templates
41. **multi-platform-distributor** — Multi-platform content posting
42. **external-backlink-builder** — Web 2.0, social, forum, article directory links
43. **pbn-bridge** — PBN site content + backlink posting
44. **web2-authenticated-platforms** — Authenticated platform posting

### G. SEO Optimization
45. **schema-markup-injector** — JSON-LD structured data injection
46. **internal-linking-ai** — Intelligent internal linking network
47. **keyword-sniper-engine** — Low-competition keyword finding + velocity planning
48. **serp-feature-hijacker** — Featured snippet, PAA, Knowledge Panel hijacking
49. **competitor-gap-analyzer** — Content gap analysis vs competitors
50. **content-freshness-engine** — Auto-refresh stale content + re-index
51. **ctr-manipulation-engine** — Social CTR signal generation

### H. Indexing & Verification
52. **rapid-indexing-engine** — IndexNow, Google Ping, sitemap ping, social crawl
53. **redirect-takeover** — Detect + overwrite competitor redirects
54. **takeover-verifier** — Multi-stage redirect verification
55. **persistence-monitor** — Check if deployed redirects are still alive

### I. Support & Infrastructure
56. **proxy-pool** — Proxy rotation for all requests
57. **attack-blacklist** — Prevent re-attacking failed domains
58. **attack-logger** — Log all attack events
59. **exploit-tracker** — Track exploit attempts + WAF detections
60. **adaptive-learning** — Learn from successes/failures
61. **waf-bypass-strategies** — AI-learned WAF bypass patterns
62. **background-daemon** — Task queue + execution
63. **telegram-notifier** — Telegram notifications
64. **serp-api** — SerpAPI wrapper
65. **serp-tracker** — Track keyword rankings over time

## Missing Capabilities (To Add)
1. **Query Parameter Parasite** — Inject gambling keywords via search/query parameters on high-DA sites (like naugachia.com example)
2. **Cross-Agent Intelligence Sharing** — Agents don't share findings with each other efficiently
3. **Speed Optimization** — Many intervals too slow for 1-3 day ranking goal
