# Telegram Bot Debug Analysis

## Issues Found

### 1. Bot goes silent after attack commands
- The log shows `Roger: "https://qec.numl.edu.pk/qec/ redirect เว็บนี้"` at 04:11:26 UTC
- Tool call `attack_website(redirect_only)` executed at 04:11:38 UTC
- Attack log saved as failed at 04:11:42 UTC
- **BUT no log of reply being sent back to Telegram**
- The `processMessage()` function returns the result, but `sendTelegramReply()` may be failing silently

### 2. Key problem areas:
a) **sendTelegramReply uses Markdown parse_mode** — if the attack result contains special chars like `*`, `_`, `[`, `]`, `(`, `)`, it will fail to parse
b) The retry without markdown only happens if `result.description?.includes("parse")` — but the error might be different
c) **No error logging when sendTelegramReply fails** — only `console.error` which may not show in devserver.log

### 3. Duplicate messages
- Server restarts multiple times (tsx watch) causing multiple polling instances
- `drop_pending_updates: true` on deleteWebhook helps but there's a race condition
- Multiple `Starting Telegram AI Chat Agent (polling mode)` entries seen

### 4. The "ทำมาแบบไหนก็ได้" message
- User said this after the redirect failed
- Bot should have processed this but no log of it being received
- Possible causes: message age > 30s check, or polling gap during server restart

## Root Causes
1. **Markdown parsing failure in sendTelegramReply** — attack results contain special chars
2. **No proper error handling/fallback** when Telegram API rejects the message
3. **Server restarts cause polling gaps** — messages during restart window are lost
4. **Chat lock contention** — if previous message processing is still locked, new messages get dropped after 2s wait

## Fixes Needed
1. Escape Markdown special chars in sendTelegramReply or use HTML parse_mode
2. Add comprehensive error logging for send failures
3. Increase message age threshold from 30s to 120s
4. Add message queue for when chat is locked instead of dropping
5. Ensure only one polling instance runs at a time
