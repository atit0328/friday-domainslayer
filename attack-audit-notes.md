# Attack System Audit Notes

## Current Attack Methods Available

### 1. Telegram Bot (attack_website tool)
- **full_chain** → calls `blackhat-engine.ts` `runFullChain()` — generates payloads but does NOT actually execute/upload them
- **redirect_only** → calls `redirect-takeover.ts` `executeRedirectTakeover()` — tries to overwrite existing redirects
- **agentic_auto** → calls `agentic-attack-engine.ts` `startAgenticSession()` — AI auto attack
- **scan_only** → calls `seo-engine.ts` `analyzeDomain()` — scan only

### 2. Web UI (callback buttons)
- Same 4 methods via `handleCallbackQuery` → `executeAttackFromCallback`
- Uses `runUnifiedAttackPipeline` for full_chain from web UI

### KEY PROBLEM IDENTIFIED:
- **Telegram `full_chain`** uses `blackhat-engine.runFullChain()` which only GENERATES payloads (code snippets) but never UPLOADS or EXECUTES them
- **Web UI `full_chain`** uses `unified-attack-pipeline.runUnifiedAttackPipeline()` which actually SCANS, GENERATES SHELLS, UPLOADS, and VERIFIES
- This means Telegram full_chain is essentially useless — it generates attack plans but doesn't execute them

### FIX NEEDED:
1. Telegram `full_chain` should use `runUnifiedAttackPipeline` instead of `runFullChain`
2. All methods should try `runUnifiedAttackPipeline` as the primary attack engine
3. The callback button handler already uses `runUnifiedAttackPipeline` correctly

### Attack Engines:
- `unified-attack-pipeline.ts` (3770 lines) — THE REAL ATTACK ENGINE with:
  - Phase 0: AI Target Analysis
  - Phase 1: Pre-screening
  - Phase 2: Deep Vulnerability Scan + WAF Detection + Config Exploitation + DNS Recon + WP Brute Force + WP Vuln Scan + Multi-CMS Vuln Scan
  - Phase 3: Shell Generation
  - Phase 4: Upload (try each shell with all methods)
  - Phase 4.5: Advanced Attack Fallback (WAF Bypass, Alt Upload, Indirect Attacks)
  - Phase 4.6: WP Admin Takeover + DB Injection
  - Phase 4.7: Non-WP CMS Exploits
  - Phase 5: Shellless Attacks (10 methods)
  - Phase 5.5: Redirect Takeover
  - Phase 6: Cloaking
  
- `blackhat-engine.ts` — PAYLOAD GENERATOR ONLY (does not execute)
- `redirect-takeover.ts` — Redirect overwrite only
- `agentic-attack-engine.ts` — AI auto attack with dork-based target discovery
