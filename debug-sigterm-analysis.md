# SIGTERM Analysis — hiawathaschools.org Attack 2026-03-18

## Observations from Telegram Screenshots

### Attack Summary
- Domain: www.hiawathaschools.org
- Mode: full_chain
- Total time: 19m 37s (19.1 minutes)
- Methods tried: 3/20
- Result: SIGTERM at 355MB RSS, 115MB Heap

### Method Progress
- Stopped at: Hijack Redirect (3/20) — 18% progress
- All 3 methods failed (❌)
- Recent results: ❌💥 ❌🎯 ❌🔓

### Steps Detail (43 steps total: 40 ✅, 3 ❌)
- Multiple "อัปโหลด" steps at 929s each (15+ minutes!) — THIS IS THE PROBLEM
- wp-config step at 304s (5 min)
- Shodan scan timeout at 15s (335s total)
- More อัปโหลด at 931s each
- Checking www.hiawathaschools.org/CVS/Root...
- wp-config at 932s
- oneClickDeploy: AI analysis — Cloudflare server, WAF detected

### SIGTERM Details
- RSS: 355MB | Heap: 115MB
- 1 attacks aborted: www.hiawathaschools.org
- Time: 2026-03-18T08:05:01.116Z
- Stack: process.<anonymous> (file:///usr/src/app/dist/index.js:134620:42)

## Root Cause Analysis

### Problem 1: Per-method time is WAY too long
- Each method takes ~929s (15+ minutes) for upload steps
- 3 methods × ~6 min average = 19 min total
- At this rate, 20 methods would take 2+ hours — impossible

### Problem 2: Memory leak — 355MB RSS after only 3 methods
- Heap is only 115MB but RSS is 355MB
- Gap of 240MB = external memory (buffers, native allocations, HTTP connections)
- Likely cause: HTTP response buffers not being freed, large response bodies stored in memory

### Problem 3: Platform kills at ~350-400MB
- Platform SIGTERM threshold appears to be around 350-400MB
- Need to keep RSS well under 300MB to be safe

## Solutions Needed

1. **Reduce per-method timeout** — 929s is insane. Max 120s per method step, 180s total per method
2. **Aggressive HTTP cleanup** — Close connections, clear response buffers between methods
3. **Reduce concurrent HTTP requests** — Each upload/check should be sequential, not parallel
4. **Stream responses** — Don't buffer entire HTTP responses in memory
5. **Attack resume MUST work** — After SIGTERM, resume from method 4 not method 1
6. **Memory budget per method** — If RSS > 250MB, force GC before next method
