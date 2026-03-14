/**
 * Auto-Generate SEO Posts Engine
 * 
 * Generates 10-20 SEO-optimized blog posts per domain
 * with internal links back to homepage and between posts.
 * 
 * Features:
 * - Category-specific post topics (slots/lottery/baccarat)
 * - Each post 800-1500 words with keyword spam
 * - Internal linking structure between posts + homepage
 * - Schema markup per post (Article, BreadcrumbList)
 * - SEO meta tags per post
 * - WordPress REST API batch deployment
 * - LLM-powered unique content generation (optional)
 */

import { invokeLLM } from "./_core/llm";
import { getKeywordsForCategory, type KeywordSet } from "./seo-homepage-generator";
import { THEME_SPECS, type ThemeSpec } from "./theme-engine";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface PostTemplate {
  slug: string;
  title: string;
  category: "slots" | "lottery" | "baccarat";
  focusKeyword: string;
  secondaryKeywords: string[];
  outline: string[];
}

export interface GeneratedPost {
  title: string;
  slug: string;
  html: string;
  excerpt: string;
  metaDescription: string;
  focusKeyword: string;
  tags: string[];
  categories: string[];
  wordCount: number;
  internalLinks: { url: string; anchor: string }[];
  schemaMarkup: string;
}

export interface AutoPostsInput {
  domain: string;
  siteName: string;
  category: "slots" | "lottery" | "baccarat";
  themeSlug?: string;
  postCount?: number; // default 15
  useLLM?: boolean; // use AI to generate unique content
  customKeywords?: string[];
}

export interface AutoPostsResult {
  posts: GeneratedPost[];
  totalWordCount: number;
  totalInternalLinks: number;
  categories: string[];
  tags: string[];
}

export interface DeployPostsResult {
  success: boolean;
  deployed: number;
  failed: number;
  details: { title: string; postId?: number; error?: string }[];
}

// ═══════════════════════════════════════════════
// Post Topic Templates per Category
// ═══════════════════════════════════════════════

const SLOTS_POST_TOPICS: PostTemplate[] = [
  { slug: "slot-online-guide-2026", title: "สล็อตออนไลน์ คู่มือเล่นสล็อตเว็บตรง 2026 ฉบับสมบูรณ์", category: "slots", focusKeyword: "สล็อตออนไลน์", secondaryKeywords: ["สล็อตเว็บตรง", "เว็บสล็อต", "สล็อต 2026"], outline: ["สล็อตออนไลน์คืออะไร", "วิธีเลือกเว็บสล็อตที่ดี", "สล็อตเว็บตรง vs เอเย่นต์", "เทคนิคเล่นสล็อตให้ได้เงิน", "สรุป"] },
  { slug: "pg-slot-top-games", title: "สล็อต PG เกมไหนแตกง่าย 2026 รวม 10 เกมยอดนิยม", category: "slots", focusKeyword: "สล็อต PG", secondaryKeywords: ["PG Soft", "สล็อต PG แตกง่าย", "เกมสล็อต PG"], outline: ["สล็อต PG Soft คืออะไร", "10 เกม PG แตกง่ายสุด", "RTP แต่ละเกม", "เทคนิคเล่น PG Slot", "สรุป"] },
  { slug: "slot-wallet-deposit", title: "สล็อต วอเลท ฝากถอนไม่มีขั้นต่ำ 2026 เว็บไหนดี", category: "slots", focusKeyword: "สล็อต วอเลท", secondaryKeywords: ["สล็อตฝากถอนวอเลท", "สล็อตไม่มีขั้นต่ำ", "True Wallet สล็อต"], outline: ["สล็อตวอเลทคืออะไร", "วิธีฝากถอนผ่านวอเลท", "เว็บสล็อตวอเลทที่ดีที่สุด", "ข้อดีของสล็อตวอเลท", "FAQ"] },
  { slug: "slot-free-credit", title: "สล็อต เครดิตฟรี 2026 รับเครดิตฟรีไม่ต้องฝากก่อน", category: "slots", focusKeyword: "สล็อต เครดิตฟรี", secondaryKeywords: ["เครดิตฟรี ไม่ต้องฝาก", "สล็อตฟรี", "โบนัสสล็อต"], outline: ["เครดิตฟรีคืออะไร", "วิธีรับเครดิตฟรี", "เว็บแจกเครดิตฟรี 2026", "เงื่อนไขเทิร์นโอเวอร์", "สรุป"] },
  { slug: "slot-rtp-high", title: "สล็อต RTP สูง 2026 เกมไหนจ่ายดีที่สุด อัตราคืนผู้เล่นสูง", category: "slots", focusKeyword: "สล็อต RTP สูง", secondaryKeywords: ["RTP สล็อต", "สล็อตจ่ายดี", "อัตราคืนผู้เล่น"], outline: ["RTP คืออะไร", "สล็อต RTP สูงสุด 2026", "วิธีเช็ค RTP", "เกม RTP 97%+", "สรุป"] },
  { slug: "slot-techniques-profit", title: "เทคนิคเล่นสล็อตให้ได้เงิน 2026 สูตรปั่นสล็อตแตกง่าย", category: "slots", focusKeyword: "เทคนิคเล่นสล็อต", secondaryKeywords: ["สูตรสล็อต", "สล็อตแตกง่าย", "วิธีเล่นสล็อต"], outline: ["เทคนิคพื้นฐาน", "สูตรปั่นสล็อต", "การจัดการเงินทุน", "เวลาที่ควรเล่น", "สรุป"] },
  { slug: "slot-pragmatic-play", title: "สล็อต Pragmatic Play 2026 เกมฮิตค่าย PP แตกหนัก", category: "slots", focusKeyword: "สล็อต Pragmatic Play", secondaryKeywords: ["ค่าย PP", "Pragmatic สล็อต", "Sweet Bonanza"], outline: ["Pragmatic Play คือค่ายอะไร", "เกมฮิตค่าย PP", "RTP และ Volatility", "เทคนิคเล่น PP", "สรุป"] },
  { slug: "slot-jili-review", title: "สล็อต JILI 2026 รีวิวเกมค่าย JILI แตกง่าย โบนัสแจกหนัก", category: "slots", focusKeyword: "สล็อต JILI", secondaryKeywords: ["JILI สล็อต", "ค่าย JILI", "เกม JILI"], outline: ["JILI คือค่ายอะไร", "เกมยอดนิยม JILI", "โบนัสและฟีเจอร์", "วิธีเล่น JILI", "สรุป"] },
  { slug: "slot-mobile-app", title: "สล็อตมือถือ 2026 เล่นสล็อตบนมือถือ iOS Android ลื่นไหล", category: "slots", focusKeyword: "สล็อตมือถือ", secondaryKeywords: ["สล็อต iOS", "สล็อต Android", "แอพสล็อต"], outline: ["สล็อตมือถือคืออะไร", "วิธีเล่นบนมือถือ", "แอพสล็อตที่ดีที่สุด", "เทคนิคเล่นบนมือถือ", "สรุป"] },
  { slug: "slot-new-games-2026", title: "สล็อตใหม่ล่าสุด 2026 เกมสล็อตเปิดใหม่ แตกง่าย ได้เงินจริง", category: "slots", focusKeyword: "สล็อตใหม่ล่าสุด", secondaryKeywords: ["สล็อตเปิดใหม่", "เกมสล็อตใหม่", "สล็อต 2026"], outline: ["สล็อตใหม่ 2026 มีอะไรบ้าง", "เกมเปิดใหม่ที่น่าเล่น", "ค่ายที่ออกเกมใหม่บ่อย", "รีวิวเกมใหม่", "สรุป"] },
  { slug: "slot-auto-deposit", title: "สล็อต ฝากถอนออโต้ 2026 ระบบอัตโนมัติ ไม่ต้องรอแอดมิน", category: "slots", focusKeyword: "สล็อต ฝากถอนออโต้", secondaryKeywords: ["ฝากถอนอัตโนมัติ", "สล็อตออโต้", "ฝากถอน 30 วินาที"], outline: ["ระบบฝากถอนออโต้คืออะไร", "ข้อดีของระบบออโต้", "เว็บสล็อตฝากถอนออโต้", "วิธีใช้งาน", "สรุป"] },
  { slug: "slot-free-trial", title: "สล็อตทดลองเล่นฟรี 2026 ทดลองเล่นสล็อต ไม่ต้องสมัคร ไม่ต้องฝาก", category: "slots", focusKeyword: "สล็อตทดลองเล่นฟรี", secondaryKeywords: ["ทดลองเล่นสล็อต", "สล็อตฟรี", "เล่นสล็อตฟรี"], outline: ["ทดลองเล่นสล็อตคืออะไร", "วิธีทดลองเล่น", "เว็บทดลองเล่นฟรี", "ข้อดีของการทดลองเล่น", "สรุป"] },
  { slug: "slot-jackpot-tips", title: "สล็อตแจ็คพอต 2026 วิธีลุ้นแจ็คพอตสล็อต เคล็ดลับได้เงินล้าน", category: "slots", focusKeyword: "สล็อตแจ็คพอต", secondaryKeywords: ["แจ็คพอตสล็อต", "Jackpot", "สล็อตเงินล้าน"], outline: ["แจ็คพอตสล็อตคืออะไร", "ประเภทแจ็คพอต", "วิธีลุ้นแจ็คพอต", "เกมแจ็คพอตยอดนิยม", "สรุป"] },
  { slug: "slot-promotions-bonus", title: "โปรโมชั่นสล็อต 2026 รวมโปรสล็อตสุดคุ้ม โบนัส 100% ฟรีสปิน", category: "slots", focusKeyword: "โปรโมชั่นสล็อต", secondaryKeywords: ["โบนัสสล็อต", "ฟรีสปิน", "โปรสล็อต"], outline: ["โปรโมชั่นสล็อตมีอะไรบ้าง", "โบนัสต้อนรับ 100%", "ฟรีสปินประจำวัน", "โปรคืนยอดเสีย", "สรุป"] },
  { slug: "slot-web-direct-2026", title: "สล็อตเว็บตรง 2026 ไม่ผ่านเอเย่นต์ ลิขสิทธิ์แท้ ปลอดภัย 100%", category: "slots", focusKeyword: "สล็อตเว็บตรง", secondaryKeywords: ["เว็บตรงไม่ผ่านเอเย่นต์", "สล็อตลิขสิทธิ์แท้", "สล็อตปลอดภัย"], outline: ["สล็อตเว็บตรงคืออะไร", "ข้อดีเว็บตรง", "วิธีเช็คเว็บตรง", "เว็บตรงที่ดีที่สุด 2026", "สรุป"] },
];

const LOTTERY_POST_TOPICS: PostTemplate[] = [
  { slug: "lottery-online-guide-2026", title: "หวยออนไลน์ คู่มือซื้อหวยออนไลน์ 2026 ครบทุกสำนัก", category: "lottery", focusKeyword: "หวยออนไลน์", secondaryKeywords: ["ซื้อหวยออนไลน์", "เว็บหวย", "หวย 2026"], outline: ["หวยออนไลน์คืออะไร", "วิธีซื้อหวยออนไลน์", "สำนักหวยยอดนิยม", "เทคนิคเลือกเลข", "สรุป"] },
  { slug: "lottery-lao-thai-hanoi", title: "หวยลาว หวยฮานอย หวยไทย 2026 ผลหวยวันนี้ เลขเด็ด", category: "lottery", focusKeyword: "หวยลาว", secondaryKeywords: ["หวยฮานอย", "หวยไทย", "ผลหวยวันนี้"], outline: ["หวยลาวคืออะไร", "หวยฮานอย ออกทุกวัน", "หวยไทย งวดล่าสุด", "เลขเด็ดวันนี้", "สรุป"] },
  { slug: "lottery-techniques-number", title: "เทคนิคเลือกเลขหวย 2026 สูตรหวยแม่นๆ วิเคราะห์สถิติ", category: "lottery", focusKeyword: "เทคนิคเลือกเลขหวย", secondaryKeywords: ["สูตรหวย", "วิเคราะห์หวย", "เลขเด็ด"], outline: ["สูตรหวยพื้นฐาน", "วิเคราะห์สถิติหวย", "เลขเด็ดจากสำนัก", "เทคนิคขั้นสูง", "สรุป"] },
  { slug: "lottery-yeekee-guide", title: "หวยยี่กี 2026 วิธีเล่นหวยยี่กี ออกทุก 15 นาที", category: "lottery", focusKeyword: "หวยยี่กี", secondaryKeywords: ["ยี่กี", "หวย 15 นาที", "วิธีเล่นยี่กี"], outline: ["หวยยี่กีคืออะไร", "กติกาการเล่น", "สูตรยี่กี", "เว็บหวยยี่กีที่ดี", "สรุป"] },
  { slug: "lottery-payout-rates", title: "อัตราจ่ายหวย 2026 เปรียบเทียบอัตราจ่ายทุกสำนัก", category: "lottery", focusKeyword: "อัตราจ่ายหวย", secondaryKeywords: ["หวยจ่ายเยอะ", "อัตราจ่ายหวยออนไลน์", "หวยบาทละ 900"], outline: ["อัตราจ่ายหวยคืออะไร", "เปรียบเทียบอัตราจ่าย", "เว็บจ่ายเยอะที่สุด", "วิธีคำนวณกำไร", "สรุป"] },
  { slug: "lottery-huay-online-safe", title: "เว็บหวยออนไลน์ ปลอดภัย 2026 จ่ายจริง ไม่โกง", category: "lottery", focusKeyword: "เว็บหวยออนไลน์", secondaryKeywords: ["หวยออนไลน์ปลอดภัย", "เว็บหวยจ่ายจริง", "หวยไม่โกง"], outline: ["วิธีเช็คเว็บหวยปลอดภัย", "เว็บหวยที่ดีที่สุด 2026", "สัญญาณเว็บหวยโกง", "รีวิวเว็บหวย", "สรุป"] },
  { slug: "lottery-statistics-analysis", title: "สถิติหวย 2026 วิเคราะห์ผลหวยย้อนหลัง สูตรหวยแม่นๆ", category: "lottery", focusKeyword: "สถิติหวย", secondaryKeywords: ["วิเคราะห์หวย", "ผลหวยย้อนหลัง", "สูตรหวย"], outline: ["สถิติหวยคืออะไร", "ผลหวยย้อนหลัง 5 ปี", "เลขที่ออกบ่อย", "สูตรจากสถิติ", "สรุป"] },
  { slug: "lottery-3-digit-2-digit", title: "หวย 3 ตัว 2 ตัว 2026 วิธีแทงหวย อัตราจ่ายสูงสุด", category: "lottery", focusKeyword: "หวย 3 ตัว", secondaryKeywords: ["หวย 2 ตัว", "แทงหวย", "หวยบน หวยล่าง"], outline: ["หวย 3 ตัวบน ล่าง", "หวย 2 ตัวบน ล่าง", "อัตราจ่าย", "เทคนิคแทง", "สรุป"] },
  { slug: "lottery-wallet-deposit", title: "หวยออนไลน์ วอเลท 2026 ซื้อหวยผ่าน True Wallet ง่ายๆ", category: "lottery", focusKeyword: "หวยออนไลน์ วอเลท", secondaryKeywords: ["ซื้อหวยวอเลท", "True Wallet หวย", "หวยฝากถอนวอเลท"], outline: ["ซื้อหวยผ่านวอเลทยังไง", "เว็บหวยรับวอเลท", "ข้อดีของวอเลท", "วิธีฝากถอน", "สรุป"] },
  { slug: "lottery-lucky-number-today", title: "เลขเด็ดวันนี้ 2026 หวยเด็ด เลขดัง เลขมงคลประจำวัน", category: "lottery", focusKeyword: "เลขเด็ดวันนี้", secondaryKeywords: ["หวยเด็ด", "เลขดัง", "เลขมงคล"], outline: ["เลขเด็ดวันนี้", "แหล่งเลขเด็ด", "วิธีวิเคราะห์เลข", "เลขมงคลประจำวัน", "สรุป"] },
  { slug: "lottery-government-result", title: "ผลหวยรัฐบาล 2026 ตรวจหวย ผลสลากกินแบ่งรัฐบาล", category: "lottery", focusKeyword: "ผลหวยรัฐบาล", secondaryKeywords: ["ตรวจหวย", "ผลสลากกินแบ่ง", "หวยรัฐบาล"], outline: ["ผลหวยรัฐบาลล่าสุด", "วิธีตรวจหวย", "ตารางออกหวย", "สถิติหวยรัฐบาล", "สรุป"] },
  { slug: "lottery-foreign-markets", title: "หวยต่างประเทศ 2026 หวยลาว หวยฮานอย หวยมาเลย์ หวยหุ้น", category: "lottery", focusKeyword: "หวยต่างประเทศ", secondaryKeywords: ["หวยลาว", "หวยฮานอย", "หวยมาเลย์", "หวยหุ้น"], outline: ["หวยต่างประเทศมีอะไรบ้าง", "หวยลาว", "หวยฮานอย", "หวยมาเลย์", "หวยหุ้น", "สรุป"] },
  { slug: "lottery-set-formula", title: "สูตรหวยชุด 2026 วิธีแทงหวยชุดให้ได้กำไร", category: "lottery", focusKeyword: "สูตรหวยชุด", secondaryKeywords: ["หวยชุด", "แทงหวยชุด", "สูตรหวย"], outline: ["หวยชุดคืออะไร", "วิธีคำนวณหวยชุด", "สูตรหวยชุดแม่นๆ", "ข้อดีข้อเสีย", "สรุป"] },
  { slug: "lottery-promotion-bonus", title: "โปรโมชั่นหวย 2026 รวมโปรหวยออนไลน์ ส่วนลด แจกเครดิตฟรี", category: "lottery", focusKeyword: "โปรโมชั่นหวย", secondaryKeywords: ["โปรหวย", "ส่วนลดหวย", "เครดิตฟรีหวย"], outline: ["โปรโมชั่นหวยมีอะไรบ้าง", "ส่วนลดแทงหวย", "เครดิตฟรี", "โปรคืนยอดเสีย", "สรุป"] },
  { slug: "lottery-dream-number", title: "ทำนายฝัน เลขเด็ด 2026 ฝันเห็นอะไร ได้เลขอะไร", category: "lottery", focusKeyword: "ทำนายฝัน เลขเด็ด", secondaryKeywords: ["ทำนายฝัน", "ฝันเห็น", "เลขเด็ดจากฝัน"], outline: ["ทำนายฝันคืออะไร", "ฝันเห็นงู", "ฝันเห็นน้ำ", "ตารางทำนายฝัน", "สรุป"] },
];

const BACCARAT_POST_TOPICS: PostTemplate[] = [
  { slug: "baccarat-online-guide-2026", title: "บาคาร่าออนไลน์ คู่มือเล่นบาคาร่า 2026 สูตรเดินเงิน", category: "baccarat", focusKeyword: "บาคาร่าออนไลน์", secondaryKeywords: ["เล่นบาคาร่า", "สูตรบาคาร่า", "บาคาร่า 2026"], outline: ["บาคาร่าคืออะไร", "กติกาบาคาร่า", "สูตรเดินเงิน", "เว็บบาคาร่าที่ดี", "สรุป"] },
  { slug: "baccarat-sa-gaming", title: "บาคาร่า SA Gaming 2026 รีวิวค่าย SA สมัครเล่นฟรี", category: "baccarat", focusKeyword: "บาคาร่า SA Gaming", secondaryKeywords: ["SA Gaming", "ค่าย SA", "บาคาร่า SA"], outline: ["SA Gaming คืออะไร", "ห้องบาคาร่า SA", "วิธีเล่น SA", "โปรโมชั่น SA", "สรุป"] },
  { slug: "baccarat-formula-money", title: "สูตรบาคาร่า 2026 สูตรเดินเงินบาคาร่า ได้เงินจริง", category: "baccarat", focusKeyword: "สูตรบาคาร่า", secondaryKeywords: ["สูตรเดินเงิน", "บาคาร่าได้เงินจริง", "เทคนิคบาคาร่า"], outline: ["สูตรบาคาร่าพื้นฐาน", "สูตรมาร์ติงเกล", "สูตร 1-3-2-6", "สูตร AI", "สรุป"] },
  { slug: "baccarat-sexy-gaming", title: "บาคาร่า Sexy Gaming 2026 เซ็กซี่บาคาร่า สาวสวยแจกไพ่สด", category: "baccarat", focusKeyword: "Sexy Gaming", secondaryKeywords: ["เซ็กซี่บาคาร่า", "Sexy Baccarat", "บาคาร่าสาวสวย"], outline: ["Sexy Gaming คืออะไร", "ห้องเกม Sexy", "วิธีเล่น", "โปรโมชั่น", "สรุป"] },
  { slug: "baccarat-live-casino", title: "คาสิโนสด 2026 บาคาร่าถ่ายทอดสด เล่นกับดีลเลอร์จริง", category: "baccarat", focusKeyword: "คาสิโนสด", secondaryKeywords: ["บาคาร่าถ่ายทอดสด", "ดีลเลอร์สด", "Live Casino"], outline: ["คาสิโนสดคืออะไร", "ค่ายคาสิโนสด", "วิธีเล่นสด", "ข้อดีคาสิโนสด", "สรุป"] },
  { slug: "baccarat-wallet-deposit", title: "บาคาร่า วอเลท 2026 ฝากถอนผ่าน True Wallet ไม่มีขั้นต่ำ", category: "baccarat", focusKeyword: "บาคาร่า วอเลท", secondaryKeywords: ["บาคาร่าฝากวอเลท", "True Wallet บาคาร่า", "บาคาร่าไม่มีขั้นต่ำ"], outline: ["บาคาร่าวอเลทคืออะไร", "วิธีฝากถอน", "เว็บบาคาร่าวอเลท", "ข้อดี", "สรุป"] },
  { slug: "baccarat-dragon-tiger", title: "เสือมังกร 2026 วิธีเล่นเสือมังกรออนไลน์ สูตรเดินเงิน", category: "baccarat", focusKeyword: "เสือมังกร", secondaryKeywords: ["เสือมังกรออนไลน์", "Dragon Tiger", "วิธีเล่นเสือมังกร"], outline: ["เสือมังกรคืออะไร", "กติกา", "สูตรเดินเงิน", "เว็บเสือมังกร", "สรุป"] },
  { slug: "baccarat-web-direct", title: "บาคาร่าเว็บตรง 2026 ไม่ผ่านเอเย่นต์ ปลอดภัย จ่ายจริง", category: "baccarat", focusKeyword: "บาคาร่าเว็บตรง", secondaryKeywords: ["เว็บตรงบาคาร่า", "บาคาร่าไม่ผ่านเอเย่นต์", "บาคาร่าปลอดภัย"], outline: ["บาคาร่าเว็บตรงคืออะไร", "ข้อดีเว็บตรง", "วิธีเช็ค", "เว็บตรงที่ดีที่สุด", "สรุป"] },
  { slug: "baccarat-free-trial", title: "บาคาร่าทดลองเล่นฟรี 2026 ทดลองเล่นบาคาร่า ไม่ต้องสมัคร", category: "baccarat", focusKeyword: "บาคาร่าทดลองเล่นฟรี", secondaryKeywords: ["ทดลองเล่นบาคาร่า", "บาคาร่าฟรี", "เล่นบาคาร่าฟรี"], outline: ["ทดลองเล่นบาคาร่าคืออะไร", "วิธีทดลอง", "เว็บทดลองเล่น", "ข้อดี", "สรุป"] },
  { slug: "baccarat-ai-formula", title: "สูตรบาคาร่า AI 2026 ใช้ปัญญาประดิษฐ์วิเคราะห์ไพ่แม่นๆ", category: "baccarat", focusKeyword: "สูตรบาคาร่า AI", secondaryKeywords: ["AI บาคาร่า", "สูตร AI", "วิเคราะห์ไพ่ AI"], outline: ["สูตร AI คืออะไร", "วิธีใช้สูตร AI", "ความแม่นยำ", "เว็บที่มีสูตร AI", "สรุป"] },
  { slug: "baccarat-evolution-gaming", title: "บาคาร่า Evolution Gaming 2026 ค่ายคาสิโนสดอันดับ 1 โลก", category: "baccarat", focusKeyword: "Evolution Gaming", secondaryKeywords: ["Evolution บาคาร่า", "EVO Gaming", "คาสิโนสด Evolution"], outline: ["Evolution Gaming คืออะไร", "ห้องเกม Evolution", "Lightning Baccarat", "วิธีเล่น", "สรุป"] },
  { slug: "baccarat-promotion-bonus", title: "โปรโมชั่นบาคาร่า 2026 รวมโปรบาคาร่า โบนัส 100% คืนยอดเสีย", category: "baccarat", focusKeyword: "โปรโมชั่นบาคาร่า", secondaryKeywords: ["โบนัสบาคาร่า", "โปรบาคาร่า", "คืนยอดเสีย"], outline: ["โปรโมชั่นบาคาร่ามีอะไรบ้าง", "โบนัสต้อนรับ", "คืนยอดเสีย", "โปรพิเศษ VIP", "สรุป"] },
  { slug: "baccarat-money-management", title: "การจัดการเงินทุนบาคาร่า 2026 เทคนิคเดินเงินไม่ให้เจ๊ง", category: "baccarat", focusKeyword: "การจัดการเงินทุนบาคาร่า", secondaryKeywords: ["เดินเงินบาคาร่า", "ทุนบาคาร่า", "เทคนิคเงินทุน"], outline: ["ทำไมต้องจัดการเงินทุน", "สูตรเดินเงิน", "กำหนดเป้าหมาย", "เมื่อไหร่ควรหยุด", "สรุป"] },
  { slug: "baccarat-vip-room", title: "บาคาร่า VIP 2026 ห้อง VIP บาคาร่า เดิมพันสูง สิทธิพิเศษ", category: "baccarat", focusKeyword: "บาคาร่า VIP", secondaryKeywords: ["VIP บาคาร่า", "ห้อง VIP", "บาคาร่าเดิมพันสูง"], outline: ["บาคาร่า VIP คืออะไร", "สิทธิพิเศษ VIP", "วิธีเป็น VIP", "ห้อง VIP ที่ดีที่สุด", "สรุป"] },
  { slug: "baccarat-roulette-sicbo", title: "รูเล็ต ไฮโล 2026 เกมคาสิโนสดยอดนิยม วิธีเล่น สูตรเดินเงิน", category: "baccarat", focusKeyword: "รูเล็ต ไฮโล", secondaryKeywords: ["รูเล็ตออนไลน์", "ไฮโลออนไลน์", "เกมคาสิโน"], outline: ["รูเล็ตคืออะไร", "ไฮโลออนไลน์", "สูตรเดินเงิน", "เว็บที่ดีที่สุด", "สรุป"] },
];

function getPostTopics(category: "slots" | "lottery" | "baccarat"): PostTemplate[] {
  switch (category) {
    case "lottery": return LOTTERY_POST_TOPICS;
    case "baccarat": return BACCARAT_POST_TOPICS;
    default: return SLOTS_POST_TOPICS;
  }
}

// ═══════════════════════════════════════════════
// Post Content Generator (Template-based)
// ═══════════════════════════════════════════════

function generatePostContent(
  template: PostTemplate,
  keywords: KeywordSet,
  siteName: string,
  domain: string,
  allPosts: PostTemplate[],
  theme: ThemeSpec,
  postIndex: number
): GeneratedPost {
  const siteUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const categoryName = template.category === "lottery" ? "หวยออนไลน์" : template.category === "baccarat" ? "บาคาร่าออนไลน์" : "สล็อตออนไลน์";
  const year = "2026";

  // Pick keywords for this post
  const pk = keywords.primary;
  const sk = keywords.secondary;
  const lsi = keywords.lsi;
  const brands = keywords.brands;
  const lt = keywords.longTail;

  // Generate internal links to other posts + homepage
  const internalLinks: { url: string; anchor: string }[] = [
    { url: `${siteUrl}/`, anchor: `${siteName} หน้าแรก` },
    { url: `${siteUrl}/`, anchor: `${pk[0]} ${siteName}` },
  ];

  // Add links to 3-5 other posts
  const otherPosts = allPosts.filter(p => p.slug !== template.slug);
  const linkedPosts = otherPosts.sort(() => Math.random() - 0.5).slice(0, Math.min(5, otherPosts.length));
  for (const lp of linkedPosts) {
    internalLinks.push({
      url: `${siteUrl}/${lp.slug}/`,
      anchor: lp.focusKeyword,
    });
  }

  // Generate sections based on outline
  const contentSections: string[] = [];

  // Intro paragraph
  contentSections.push(`
    <p><strong>${template.focusKeyword}</strong> — ${siteName} ขอนำเสนอบทความ${categoryName}ฉบับสมบูรณ์ ครอบคลุมทุกสิ่งที่คุณต้องรู้เกี่ยวกับ${template.focusKeyword} ในปี ${year} ไม่ว่าจะเป็นมือใหม่หรือมือเก๋า บทความนี้จะช่วยให้คุณเข้าใจ${template.secondaryKeywords[0]}อย่างลึกซึ้ง พร้อมเทคนิคและเคล็ดลับที่จะทำให้คุณประสบความสำเร็จ ${pk[postIndex % pk.length]} ที่${siteName} เป็นเว็บตรง ไม่ผ่านเอเย่นต์ ปลอดภัย 100% มีใบอนุญาตถูกกฎหมาย</p>
    <p>${lt[postIndex % lt.length]} เป็นสิ่งที่ผู้เล่นหลายคนค้นหา ${siteName} จึงรวบรวมข้อมูลทั้งหมดไว้ในบทความนี้ ครอบคลุมตั้งแต่พื้นฐานไปจนถึงเทคนิคขั้นสูง เพื่อให้คุณเล่น${categoryName}ได้อย่างมั่นใจ</p>
  `);

  // Generate content for each outline section
  for (let i = 0; i < template.outline.length; i++) {
    const section = template.outline[i];
    const sectionKw = pk[(postIndex + i) % pk.length];
    const sectionSk = sk[(postIndex + i) % sk.length];
    const sectionLsi = lsi[(postIndex + i) % lsi.length];
    const sectionBrand = brands[(postIndex + i) % brands.length];
    const linkedPost = linkedPosts[i % linkedPosts.length];

    contentSections.push(`
      <h2 id="section-${i}">${section}</h2>
      <p>${sectionKw}เป็นหัวข้อที่ได้รับความนิยมอย่างมากในปี ${year} โดยเฉพาะที่${siteName} ซึ่งเป็นเว็บ${categoryName}ชั้นนำ ให้บริการ${sectionSk}จากค่ายดังทั่วโลก รวมถึง${sectionBrand}ที่มีชื่อเสียง ระบบ${sectionLsi}ที่ทันสมัย ฝากถอนไม่มีขั้นต่ำ รองรับวอเลท ปลอดภัย 100%</p>
      <p>สำหรับ${section} ผู้เล่นจำเป็นต้องเข้าใจหลักการพื้นฐาน ${template.focusKeyword}ที่${siteName} มีระบบที่ออกแบบมาเพื่อผู้เล่นชาวไทยโดยเฉพาะ รองรับทั้งภาษาไทยและอังกฤษ มีทีมงานดูแลตลอด 24 ชั่วโมง พร้อม${sectionLsi}สำหรับสมาชิกทุกระดับ</p>
      <ul>
        <li><strong>${sectionKw}</strong> — ${siteName} ให้บริการ${sectionKw}ครบวงจร รวมทุกค่ายดัง</li>
        <li><strong>${sectionSk}</strong> — เลือกเล่น${sectionSk}ได้มากกว่า 1,000 รายการ</li>
        <li><strong>${sectionLsi}</strong> — ระบบ${sectionLsi}อัตโนมัติ รวดเร็วภายใน 30 วินาที</li>
        <li><strong>${sectionBrand}</strong> — ค่าย${sectionBrand}ชั้นนำ ลิขสิทธิ์แท้ 100%</li>
      </ul>
      <p>นอกจากนี้ ${siteName} ยังมี<a href="${linkedPost ? `${siteUrl}/${linkedPost.slug}/` : `${siteUrl}/`}">${linkedPost ? linkedPost.focusKeyword : categoryName}</a>ที่หลากหลาย ให้ผู้เล่นเลือกใช้งานได้ตามความต้องการ ไม่ว่าจะเป็น${pk[(postIndex + i + 1) % pk.length]} หรือ ${sk[(postIndex + i + 1) % sk.length]} ทุกอย่างพร้อมให้บริการที่${siteName}</p>
    `);
  }

  // Add comparison table
  contentSections.push(`
    <h2>ตารางเปรียบเทียบ${template.focusKeyword}</h2>
    <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
      <thead>
        <tr style="background:${theme.primaryColor}22;">
          <th style="padding:10px;border:1px solid ${theme.primaryColor}33;text-align:left;">รายการ</th>
          <th style="padding:10px;border:1px solid ${theme.primaryColor}33;text-align:center;">${siteName}</th>
          <th style="padding:10px;border:1px solid ${theme.primaryColor}33;text-align:center;">เว็บอื่น</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="padding:8px;border:1px solid ${theme.primaryColor}22;">${template.focusKeyword}</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;color:${theme.accentColor};">✓ ครบทุกค่าย</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;">บางค่าย</td></tr>
        <tr><td style="padding:8px;border:1px solid ${theme.primaryColor}22;">ฝากถอนออโต้</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;color:${theme.accentColor};">✓ 30 วินาที</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;">1-5 นาที</td></tr>
        <tr><td style="padding:8px;border:1px solid ${theme.primaryColor}22;">ขั้นต่ำ</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;color:${theme.accentColor};">✓ ไม่มีขั้นต่ำ</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;">100-300 บาท</td></tr>
        <tr><td style="padding:8px;border:1px solid ${theme.primaryColor}22;">วอเลท</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;color:${theme.accentColor};">✓ รองรับ</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;">ไม่รองรับ</td></tr>
        <tr><td style="padding:8px;border:1px solid ${theme.primaryColor}22;">ลิขสิทธิ์</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;color:${theme.accentColor};">✓ แท้ 100%</td><td style="padding:8px;border:1px solid ${theme.primaryColor}22;text-align:center;">ไม่แน่ใจ</td></tr>
      </tbody>
    </table>
  `);

  // Add internal links section
  contentSections.push(`
    <h2>บทความที่เกี่ยวข้อง — ${siteName}</h2>
    <ul>
      ${internalLinks.map(link => `<li><a href="${link.url}">${link.anchor}</a></li>`).join("\n")}
    </ul>
  `);

  // Conclusion with CTA
  contentSections.push(`
    <h2>สรุป — ${template.focusKeyword} ${siteName} ${year}</h2>
    <p>${template.focusKeyword}ที่${siteName} เป็นตัวเลือกอันดับ 1 สำหรับผู้เล่น${categoryName}ชาวไทย ด้วยระบบที่ทันสมัย ${template.secondaryKeywords.join(", ")} ครบวงจร ฝากถอนไม่มีขั้นต่ำ รองรับวอเลท ปลอดภัย 100% มีใบอนุญาตถูกกฎหมาย สมัครสมาชิกวันนี้ที่ <a href="${siteUrl}/">${siteName}</a> รับโบนัสทันที!</p>
    <p><strong>${lt[postIndex % lt.length]}</strong> — ทั้งหมดนี้พร้อมให้บริการที่${siteName} เว็บ${categoryName}เว็บตรง ไม่ผ่านเอเย่นต์ อันดับ 1 ของไทย ${year}</p>
  `);

  const fullContent = contentSections.join("\n");

  // Generate Schema markup
  const schemaMarkup = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${template.title.replace(/"/g, '\\"')}",
  "description": "${template.focusKeyword} ${siteName} ${year} — ${template.secondaryKeywords.slice(0, 3).join(", ")}",
  "author": { "@type": "Organization", "name": "${siteName}" },
  "publisher": { "@type": "Organization", "name": "${siteName}", "url": "${siteUrl}" },
  "datePublished": "${new Date().toISOString().split("T")[0]}",
  "dateModified": "${new Date().toISOString().split("T")[0]}",
  "mainEntityOfPage": { "@type": "WebPage", "@id": "${siteUrl}/${template.slug}/" },
  "keywords": "${[template.focusKeyword, ...template.secondaryKeywords].join(", ")}"
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "หน้าแรก", "item": "${siteUrl}/" },
    { "@type": "ListItem", "position": 2, "name": "${categoryName}", "item": "${siteUrl}/" },
    { "@type": "ListItem", "position": 3, "name": "${template.focusKeyword}", "item": "${siteUrl}/${template.slug}/" }
  ]
}
</script>`;

  // Build full HTML
  const html = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.title} — ${siteName}</title>
  <meta name="description" content="${template.focusKeyword} ${siteName} ${year} ${template.secondaryKeywords.join(" ")} เว็บ${categoryName}อันดับ 1 ฝากถอนไม่มีขั้นต่ำ">
  <meta name="keywords" content="${[template.focusKeyword, ...template.secondaryKeywords, ...pk.slice(0, 5)].join(", ")}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
  <link rel="canonical" href="${siteUrl}/${template.slug}/">
  <meta property="og:title" content="${template.title} — ${siteName}">
  <meta property="og:description" content="${template.focusKeyword} ${siteName} ${year}">
  <meta property="og:url" content="${siteUrl}/${template.slug}/">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${siteName}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${template.title}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=${theme.fontHeading}:wght@400;700;800&family=${theme.fontBody}:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: ${theme.primaryColor};
      --secondary: ${theme.secondaryColor};
      --accent: ${theme.accentColor};
      --bg: ${theme.bgColor};
      --text: ${theme.textColor};
      --font-heading: '${theme.fontHeading}', sans-serif;
      --font-body: '${theme.fontBody}', sans-serif;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--font-body); background: var(--bg); color: var(--text); line-height: 1.8; }
    h1, h2, h3 { font-family: var(--font-heading); font-weight: 700; margin: 1.5em 0 0.5em; }
    h1 { font-size: 2rem; } h2 { font-size: 1.6rem; } h3 { font-size: 1.3rem; }
    a { color: var(--primary); text-decoration: underline; }
    p { margin-bottom: 1rem; }
    ul, ol { margin: 1rem 0; padding-left: 2rem; }
    li { margin-bottom: 0.5rem; }
    strong { color: var(--primary); }
    .container { max-width: 900px; margin: 0 auto; padding: 0 1rem; }
    .breadcrumbs { padding: 0.75rem 0; font-size: 0.85rem; opacity: 0.7; }
    .breadcrumbs a { color: var(--primary); text-decoration: none; }
    .post-header { padding: 3rem 0 2rem; border-bottom: 1px solid ${theme.primaryColor}22; margin-bottom: 2rem; }
    .post-header h1 { color: var(--primary); }
    .post-meta { font-size: 0.9rem; opacity: 0.6; margin-top: 0.5rem; }
    .post-content { padding: 2rem 0; }
    .post-footer { border-top: 1px solid ${theme.primaryColor}22; padding: 2rem 0; margin-top: 2rem; }
    .cta-box { background: linear-gradient(135deg, var(--primary), var(--secondary)); padding: 2rem; border-radius: 12px; text-align: center; color: #fff; margin: 2rem 0; }
    .cta-box a { color: #fff; font-weight: 700; font-size: 1.2rem; }
    table { width: 100%; border-collapse: collapse; }
  </style>
  ${schemaMarkup}
</head>
<body>
  <header style="background:${theme.bgColor}ee;border-bottom:1px solid ${theme.primaryColor}22;padding:1rem 0;">
    <div class="container" style="display:flex;align-items:center;justify-content:space-between;">
      <a href="${siteUrl}/" style="font-family:var(--font-heading);font-size:1.5rem;font-weight:800;color:var(--primary);text-decoration:none;">${siteName}</a>
      <nav style="display:flex;gap:1.5rem;">
        <a href="${siteUrl}/" style="color:var(--text);text-decoration:none;">${categoryName}</a>
        <a href="${siteUrl}/" style="color:var(--text);text-decoration:none;">โปรโมชั่น</a>
        <a href="${siteUrl}/" style="color:var(--text);text-decoration:none;">สมัครสมาชิก</a>
      </nav>
    </div>
  </header>

  <main class="container">
    <div class="breadcrumbs">
      <a href="${siteUrl}/">หน้าแรก</a> <span>›</span>
      <a href="${siteUrl}/">${categoryName}</a> <span>›</span>
      <span>${template.focusKeyword}</span>
    </div>

    <article class="post-header">
      <h1>${template.title}</h1>
      <div class="post-meta">
        อัปเดตล่าสุด: ${new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })} | 
        โดย: ${siteName} | 
        หมวดหมู่: ${categoryName}
      </div>
    </article>

    <div class="post-content">
      <nav style="background:${theme.primaryColor}08;border:1px solid ${theme.primaryColor}20;border-radius:8px;padding:1.5rem;margin-bottom:2rem;">
        <h3 style="margin-top:0;">สารบัญ</h3>
        <ol>
          ${template.outline.map((item, i) => `<li><a href="#section-${i}">${item}</a></li>`).join("\n")}
        </ol>
      </nav>

      ${fullContent}

      <div class="cta-box">
        <p style="font-size:1.3rem;margin-bottom:1rem;">🎰 ${template.focusKeyword} ที่ ${siteName}</p>
        <a href="${siteUrl}/">สมัครสมาชิกวันนี้ รับโบนัสทันที →</a>
      </div>
    </div>

    <footer class="post-footer">
      <p style="opacity:0.5;font-size:0.85rem;">© ${year} ${siteName} — ${categoryName}เว็บตรง อันดับ 1 | ${template.focusKeyword} | ${template.secondaryKeywords.join(" | ")}</p>
    </footer>
  </main>
</body>
</html>`;

  // Calculate word count
  const textOnly = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = textOnly.split(/\s+/).length;

  // Generate excerpt
  const excerpt = `${template.focusKeyword} ${siteName} ${year} — ${template.secondaryKeywords.join(", ")} เว็บ${categoryName}อันดับ 1 ฝากถอนไม่มีขั้นต่ำ รองรับวอเลท`;

  return {
    title: template.title,
    slug: template.slug,
    html,
    excerpt,
    metaDescription: `${template.focusKeyword} ${siteName} ${year} ${template.secondaryKeywords.join(" ")} เว็บ${categoryName}อันดับ 1`,
    focusKeyword: template.focusKeyword,
    tags: [template.focusKeyword, ...template.secondaryKeywords, categoryName, siteName, year],
    categories: [categoryName, template.category],
    wordCount,
    internalLinks,
    schemaMarkup,
  };
}

// ═══════════════════════════════════════════════
// LLM-Powered Unique Content (Optional)
// ═══════════════════════════════════════════════

export async function rewritePostWithLLM(post: GeneratedPost, siteName: string, category: string): Promise<GeneratedPost> {
  try {
    const categoryName = category === "lottery" ? "หวยออนไลน์" : category === "baccarat" ? "บาคาร่าออนไลน์" : "สล็อตออนไลน์";
    
    // Extract just the content body (between post-content div)
    const contentMatch = post.html.match(/<div class="post-content">([\s\S]*?)<div class="cta-box">/);
    if (!contentMatch) return post;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณคือ SEO Content Writer มืออาชีพสำหรับเว็บ${categoryName} เขียนเนื้อหาภาษาไทยที่ unique 100% เน้น keyword spam สำหรับ Google ranking ตอบกลับเป็น HTML เท่านั้น`,
        },
        {
          role: "user",
          content: `เขียนเนื้อหาบทความ SEO ใหม่ทั้งหมดสำหรับหัวข้อ "${post.title}" ของเว็บ ${siteName}

Focus keyword: ${post.focusKeyword}
Secondary keywords: ${post.tags.slice(0, 5).join(", ")}

กฎ:
1. เขียนเนื้อหาใหม่ 100% ไม่ซ้ำกับเนื้อหาเดิม
2. รักษา HTML structure (h2, h3, p, ul, li, strong, a tags)
3. Keyword density 3-5% ของ focus keyword
4. ใส่ keywords ในทุก heading
5. เขียนอย่างน้อย 800 คำ
6. รักษา internal links ทั้งหมดที่มีอยู่
7. ใช้ชื่อเว็บ "${siteName}" อย่างน้อย 10 ครั้ง
8. ตอบกลับเป็น HTML เท่านั้น ไม่ต้องมี markdown code block

เนื้อหาเดิม (ใช้เป็น reference สำหรับ structure เท่านั้น):
${contentMatch[1].substring(0, 3000)}

ตอบกลับเป็น HTML ที่เขียนใหม่:`,
        },
      ],
    });

    const newContent = response.choices?.[0]?.message?.content;
    if (!newContent || typeof newContent !== "string") return post;

    // Clean markdown code blocks
    const cleaned = newContent.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    // Replace content in original HTML
    const newHtml = post.html.replace(
      /<div class="post-content">[\s\S]*?<div class="cta-box">/,
      `<div class="post-content">\n${cleaned}\n<div class="cta-box">`
    );

    const newTextOnly = newHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    return {
      ...post,
      html: newHtml,
      wordCount: newTextOnly.split(/\s+/).length,
    };
  } catch (err) {
    console.error(`[Auto Posts] LLM rewrite failed for ${post.slug}:`, err);
    return post;
  }
}

// ═══════════════════════════════════════════════
// Main Generator Function
// ═══════════════════════════════════════════════

export function generateSeoPosts(input: AutoPostsInput): AutoPostsResult {
  const { domain, siteName, category, themeSlug, postCount = 15, customKeywords } = input;
  
  const keywords = getKeywordsForCategory(category);
  const theme = THEME_SPECS.find(t => t.slug === themeSlug) || THEME_SPECS.find(t => t.category === category) || THEME_SPECS[0];
  
  // Get post topics for this category
  const allTopics = getPostTopics(category);
  const selectedTopics = allTopics.slice(0, Math.min(postCount, allTopics.length));

  // Generate all posts
  const posts: GeneratedPost[] = selectedTopics.map((topic, index) =>
    generatePostContent(topic, keywords, siteName, domain, selectedTopics, theme, index)
  );

  // Calculate totals
  const totalWordCount = posts.reduce((sum, p) => sum + p.wordCount, 0);
  const totalInternalLinks = posts.reduce((sum, p) => sum + p.internalLinks.length, 0);
  const allTags = Array.from(new Set(posts.flatMap(p => p.tags)));
  const allCategories = Array.from(new Set(posts.flatMap(p => p.categories)));

  return {
    posts,
    totalWordCount,
    totalInternalLinks,
    categories: allCategories,
    tags: allTags,
  };
}

// ═══════════════════════════════════════════════
// WordPress Batch Deployment
// ═══════════════════════════════════════════════

export async function deployPostsToWordPress(input: {
  domain: string;
  wpUsername: string;
  wpAppPassword: string;
  posts: GeneratedPost[];
  publishInterval?: number; // ms between posts, default 2000
}): Promise<DeployPostsResult> {
  const siteUrl = input.domain.startsWith("http") ? input.domain : `https://${input.domain}`;
  const auth = Buffer.from(`${input.wpUsername}:${input.wpAppPassword}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };
  const interval = input.publishInterval || 2000;

  const details: { title: string; postId?: number; error?: string }[] = [];
  let deployed = 0;
  let failed = 0;

  // First, ensure categories exist
  const categoryMap = new Map<string, number>();
  for (const post of input.posts) {
    for (const cat of post.categories) {
      if (!categoryMap.has(cat)) {
        try {
          // Check if category exists
          const catRes = await fetch(`${siteUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(cat)}&per_page=1`, { headers });
          if (catRes.ok) {
            const cats = await catRes.json();
            if (cats.length > 0) {
              categoryMap.set(cat, cats[0].id);
            } else {
              // Create category
              const newCatRes = await fetch(`${siteUrl}/wp-json/wp/v2/categories`, {
                method: "POST",
                headers,
                body: JSON.stringify({ name: cat, slug: cat.toLowerCase().replace(/\s+/g, "-") }),
              });
              if (newCatRes.ok) {
                const newCat = await newCatRes.json();
                categoryMap.set(cat, newCat.id);
              }
            }
          }
        } catch {
          // Skip category creation errors
        }
      }
    }
  }

  // Deploy posts one by one with interval
  for (const post of input.posts) {
    try {
      // Get category IDs
      const catIds = post.categories
        .map(c => categoryMap.get(c))
        .filter((id): id is number => id !== undefined);

      // Check if post already exists
      const existingRes = await fetch(`${siteUrl}/wp-json/wp/v2/posts?slug=${post.slug}&per_page=1`, { headers });
      let existingId: number | null = null;
      if (existingRes.ok) {
        const existing = await existingRes.json();
        if (existing.length > 0) existingId = existing[0].id;
      }

      const postData = {
        title: post.title,
        content: post.html,
        excerpt: post.excerpt,
        status: "publish",
        slug: post.slug,
        categories: catIds,
        meta: {
          _yoast_wpseo_focuskw: post.focusKeyword,
          _yoast_wpseo_metadesc: post.metaDescription,
        },
      };

      let res: Response;
      if (existingId) {
        res = await fetch(`${siteUrl}/wp-json/wp/v2/posts/${existingId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(postData),
        });
      } else {
        res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
          method: "POST",
          headers,
          body: JSON.stringify(postData),
        });
      }

      if (res.ok) {
        const result = await res.json();
        details.push({ title: post.title, postId: result.id });
        deployed++;
      } else {
        const err = await res.text();
        details.push({ title: post.title, error: `${res.status}: ${err.substring(0, 200)}` });
        failed++;
      }
    } catch (err: any) {
      details.push({ title: post.title, error: err.message });
      failed++;
    }

    // Wait between posts to avoid rate limiting
    if (interval > 0) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  return {
    success: failed === 0,
    deployed,
    failed,
    details,
  };
}

// ═══════════════════════════════════════════════
// Export post topics for UI
// ═══════════════════════════════════════════════

export function getPostTopicsForCategory(category: "slots" | "lottery" | "baccarat"): PostTemplate[] {
  return getPostTopics(category);
}
