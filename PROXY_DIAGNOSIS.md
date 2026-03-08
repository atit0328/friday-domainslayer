# Proxy Pool Diagnosis

## Root Cause of "HTTP 0 — fetch failed (13ms)"

### Problem Analysis

1. **fetchWithPoolProxy() throws error on proxy failure** (line 527: `throw err`)
   - When proxy can't connect → error thrown → caller catches → "fetch failed"
   - NO fallback to direct fetch when proxy fails
   
2. **Proxy format: `http://user:pass@ip:port`** — these are HTTP CONNECT proxies
   - If proxy server is down/unreachable → undici ProxyAgent fails immediately
   - 13ms failure = TCP connection refused or DNS failure to proxy IP

3. **All 50 proxies may be dead** — no initial health check on startup
   - `startProxyHealthScheduler()` runs every 6 hours
   - First health check happens AFTER 6 hours, not on startup
   - All proxies assumed `healthy: true` until checked

4. **No fallback to direct fetch** — if proxy fails, the entire request fails
   - Line 524-527: catch block just throws, doesn't try direct

## Required Fixes

1. Add fallback to direct fetch when proxy fails
2. Run initial health check on startup (check a sample of 5)
3. Add retry with different proxy before falling back to direct
4. Better error reporting — include proxy failure reason in error
5. Add AI failure analysis that diagnoses the pattern of failures
