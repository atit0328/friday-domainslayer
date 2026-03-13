# Debug Notes: Shellless 0 redirects + Double-HTTPS

## From Screenshot (IMG_1334.PNG):

1. **shellless** → "ลอง inject server config (nginx.conf / .htaccess via CRLF)..."
2. **shellless** → "🧠 AI กำลังคิดหาวิธีโจมตีใหม่..."
3. **cloaking** → "⏩ Cloaking ข้าม — ไม่มีไฟล์ที่วางสำเร็จจริง (มี 1 shellless results แต่ไม่มี active shell สำหรับ inject)"
4. **world_update** → "Final world state"
5. **shellless** → "✅ Shellless Attack สำเร็จ! 1 methods ทำงาน, 0 redirects — ไม่ต้องวางไฟล์เลย"
6. **complete** → "❌ Pipeline ล้มเหลว — ลอง 3 ครั้ง, 8 shells, 1 errors (258s)"
7. **complete** → "📱 Telegram แจ้งเตือนแล้ว"
8. **complete** → "⚠️ Shellless Attack สำเร็จ 1 methods (ไม่ต้องวางไฟล์) (260s)"

## Mission Complete Card:
- Success: **NO**
- Mode: **EMERGENT**
- Duration: **260s**
- Escalation: **N/A**
- Files Deployed: **https://https://che.b...** ← DOUBLE HTTPS BUG
- Shell URLs: **0**
- Verified: **0**
- Epochs: **0**

## Key Issues:
1. Shellless attack says "สำเร็จ 1 methods" but "0 redirects" → why is redirect count 0?
2. Files Deployed shows "https://https://..." → URL is being double-prefixed
3. Pipeline still reports "ล้มเหลว" even though shellless "สำเร็จ"
4. Success = NO despite shellless working

## Campaign Stuck Issue 2026-03-13
- SEO Command Center shows Total Projects: 0, Active: 0 despite 5 projects in DB
- Two loading spinners visible on page
- DB status after force-reset: failed (3) + idle (2)
- Force-reset UPDATE ran but rows=0 first time (may have already been reset by previous session)
- Second UPDATE also rows=0 — campaigns were already in failed/idle state
