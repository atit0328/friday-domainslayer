# Analysis: che.buet.ac.bd Redirect Technique

## Summary
เว็บ che.buet.ac.bd (WordPress 6.9.1) ถูก hack ด้วยเทคนิค **Dual-Layer Cloaking** — แยก content ตาม User-Agent + Geo-IP redirect ตามประเทศ

## Redirect Chain
1. User เปิด https://che.buet.ac.bd/
2. Browser execute JS: `fetch("https://api.country.is")` → ได้ country code
3. ถ้า country = TH, LA, SG, VN → `window.location.href = "https://slot.ccg.rest"`
4. slot.ccg.rest (Cloudflare: 104.21.87.219) → HTTP 301 → https://xn--82c3cctqd6o.com/register?token=8525422a161a87b
5. xn--82c3cctqd6o.com = เว็บพนัน/หวยออนไลน์

## Technique Details

### Layer 1: User-Agent Cloaking (Server-Side)
- **Googlebot** เห็น: เว็บหวยออนไลน์ภาษาไทย (title: "หวยออนไลน์ BUET แทงหวยออนไลน์")
  - ใช้ WordPress theme อื่น (Elementor + wpcb-lotto plugin)
  - มี SEO spam content ภาษาไทยเต็มหน้า
  - ไม่มี redirect script
- **Normal browser** เห็น: เว็บ Chemical Engineering ปกติ (WordPress theme: bizrins)
  - แต่มี redirect script inject ก่อน <!doctype html>

### Layer 2: Geo-IP Redirect (Client-Side JavaScript)
- Script inject **ก่อน** <!doctype html> (prepend injection)
- ใช้ `fetch("https://api.country.is")` เพื่อตรวจ country code
- Target countries: TH, LA, SG, VN (เอเชียตะวันออกเฉียงใต้)
- Redirect ไป: https://slot.ccg.rest → https://xn--82c3cctqd6o.com/register?token=...

### Injection Method
- Script ถูก inject ที่ **WordPress theme output** (ไม่ใช่ .htaccess)
- อยู่ก่อน <!doctype html> → น่าจะ inject ผ่าน:
  1. `functions.php` ของ theme/child-theme (wp_head hook)
  2. หรือ malicious plugin
  3. หรือ `wp-config.php` / `wp-settings.php` prepend
- wp-login.php ไม่มี script → ไม่ใช่ .htaccess หรือ Apache prepend
- ทุก frontend page มี script → inject ผ่าน theme header

### Infrastructure
- che.buet.ac.bd: 103.159.2.215 (Bangladesh, Apache server)
- slot.ccg.rest: 104.21.87.219 (Cloudflare CDN)
- xn--82c3cctqd6o.com: Cloudflare CDN

## Key Observations
1. **wp-login.php ไม่มี script** → injection อยู่ใน theme layer ไม่ใช่ server config
2. **Googlebot เห็น content ต่างจาก user** → User-Agent based cloaking (server-side PHP)
3. **Redirect เฉพาะ TH/LA/SG/VN** → Geo-IP targeting ผ่าน client-side API
4. **ใช้ external API (api.country.is)** → ไม่ต้อง GeoIP database บน server
5. **Redirect chain 2 ขั้น** → slot.ccg.rest (301) → xn--82c3cctqd6o.com (เปลี่ยน redirect URL ได้ง่าย)
