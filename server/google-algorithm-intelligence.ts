/**
 * Google Algorithm Intelligence Engine
 * ═══════════════════════════════════════════════════════════════
 * 
 * Deep knowledge base encoding all 200+ Google ranking factors.
 * This engine informs EVERY SEO decision across the entire system:
 * - Content generation (what to write, how to structure)
 * - Backlink building (what links to build, anchor text distribution)
 * - Technical optimization (page speed, mobile, schema)
 * - Attack strategy (which targets are vulnerable, which methods work)
 * - Penalty avoidance (what triggers Google penalties)
 * 
 * Based on Backlinko's complete 206-factor list (2026 edition),
 * Google's official guidelines, and real-world blackhat experience.
 * ═══════════════════════════════════════════════════════════════
 */

import { invokeLLM } from "./_core/llm";
import {
  EXPANDED_DOMAIN_FACTORS,
  EXPANDED_PAGE_LEVEL_FACTORS,
  EXPANDED_SITE_LEVEL_FACTORS,
  EXPANDED_BACKLINK_FACTORS,
  EXPANDED_USER_INTERACTION_FACTORS,
  EXPANDED_SPECIAL_ALGORITHM_FACTORS,
  EXPANDED_BRAND_SIGNAL_FACTORS,
  EXPANDED_ON_SITE_SPAM_FACTORS,
  EXPANDED_OFF_SITE_SPAM_FACTORS,
} from "./ranking-factors-expansion";

// ═══════════════════════════════════════════════
//  RANKING FACTOR CATEGORIES
// ═══════════════════════════════════════════════

export type FactorCategory =
  | "domain"
  | "page_level"
  | "site_level"
  | "backlink"
  | "user_interaction"
  | "special_algorithm"
  | "brand_signal"
  | "on_site_spam"
  | "off_site_spam";

export type FactorImpact = "critical" | "high" | "medium" | "low" | "minimal";
export type ExploitDifficulty = "easy" | "moderate" | "hard" | "very_hard";

export interface RankingFactor {
  id: number;
  name: string;
  category: FactorCategory;
  description: string;
  impact: FactorImpact;
  /** Can this factor be exploited for blackhat SEO? */
  exploitable: boolean;
  /** How hard is it to exploit? */
  exploitDifficulty?: ExploitDifficulty;
  /** Specific blackhat tactics to exploit this factor */
  exploitTactics?: string[];
  /** What triggers a penalty related to this factor */
  penaltyTriggers?: string[];
  /** How to avoid detection when exploiting */
  evasionTips?: string[];
  /** Relevance to 1-3 day fast ranking (1-10) */
  fastRankRelevance: number;
  /** Whether this is confirmed by Google */
  confirmed: boolean;
}

// ═══════════════════════════════════════════════
//  COMPLETE 200+ RANKING FACTORS DATABASE
// ═══════════════════════════════════════════════

export const RANKING_FACTORS: RankingFactor[] = [
  // ─── DOMAIN FACTORS (1-9) ───
  {
    id: 1, name: "Domain Age", category: "domain",
    description: "Older domains may have more trust, though Google says age alone helps nothing",
    impact: "low", exploitable: false, fastRankRelevance: 2, confirmed: false,
  },
  {
    id: 2, name: "Keyword in TLD", category: "domain",
    description: "Keyword in domain name acts as relevancy signal (EMD)",
    impact: "low", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Register exact-match domains for target keywords", "Use keyword-rich subdomains on compromised sites"],
    fastRankRelevance: 3, confirmed: true,
  },
  {
    id: 3, name: "Domain Registration Length", category: "domain",
    description: "Legitimate domains registered for years ahead; doorway domains for 1 year",
    impact: "minimal", exploitable: false, fastRankRelevance: 1, confirmed: true,
  },
  {
    id: 4, name: "Keyword in Subdomain", category: "domain",
    description: "Keyword in subdomain boosts rankings",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Create keyword-rich subdomains on compromised sites", "Use subdomain takeover for SEO"],
    fastRankRelevance: 5, confirmed: true,
  },
  {
    id: 5, name: "Domain History", category: "domain",
    description: "Volatile ownership or drops may reset site history",
    impact: "medium", exploitable: false, fastRankRelevance: 1, confirmed: true,
  },
  {
    id: 6, name: "Exact Match Domain", category: "domain",
    description: "EMDs have little direct benefit; low-quality EMDs vulnerable to EMD update",
    impact: "low", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Use EMDs for parasite pages", "Register expired EMDs with existing backlinks"],
    penaltyTriggers: ["Low-quality content on EMD triggers EMD update penalty"],
    fastRankRelevance: 3, confirmed: true,
  },
  {
    id: 7, name: "Public vs Private WhoIs", category: "domain",
    description: "Private WhoIs may signal something to hide",
    impact: "minimal", exploitable: false, fastRankRelevance: 1, confirmed: false,
  },
  {
    id: 8, name: "Penalized WhoIs Owner", category: "domain",
    description: "Google scrutinizes other sites owned by identified spammers",
    impact: "medium", exploitable: false, fastRankRelevance: 1, confirmed: false,
    evasionTips: ["Use different registrant info for each domain", "Use privacy protection"],
  },
  {
    id: 9, name: "Country TLD", category: "domain",
    description: ".co.th helps rank in Thailand but limits global ranking",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Use .co.th domains for Thai gambling keywords", "Target country-specific TLDs for geo-targeting"],
    fastRankRelevance: 6, confirmed: true,
  },

  // ─── PAGE-LEVEL FACTORS (10-65) ───
  {
    id: 10, name: "Keyword in Title Tag", category: "page_level",
    description: "Title tag remains important on-page SEO signal",
    impact: "critical", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Front-load target keyword in title", "Use exact-match keyword in Telegraph/parasite titles"],
    fastRankRelevance: 10, confirmed: true,
  },
  {
    id: 11, name: "Title Tag Starts with Keyword", category: "page_level",
    description: "Titles starting with keyword perform better than keyword at end",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Always place primary keyword at start of title", "Format: 'Keyword - Supporting Text'"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 12, name: "Keyword in Meta Description", category: "page_level",
    description: "Not direct ranking signal but impacts CTR which is a ranking factor",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Include keyword + compelling CTA in meta description", "Use power words to boost CTR"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 13, name: "Keyword in H1 Tag", category: "page_level",
    description: "H1 is secondary relevancy signal after title tag",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Match H1 to title tag keyword", "Use H1 as exact-match keyword on parasite pages"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 14, name: "TF-IDF Keyword Density", category: "page_level",
    description: "Sophisticated keyword frequency analysis; more occurrences = more relevant",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Use keyword 2-3% density naturally", "Include LSI/related terms", "Use TF-IDF tools to optimize"],
    penaltyTriggers: ["Keyword stuffing (>5% density)", "Unnatural keyword placement"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 15, name: "Content Length", category: "page_level",
    description: "Average page 1 result is ~1400 words; longer content covers topic more thoroughly",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Generate 1500-2500 word articles for parasite pages", "Include comprehensive topic coverage"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 16, name: "Table of Contents", category: "page_level",
    description: "Linked TOC helps Google understand page structure; can trigger sitelinks",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Add anchor-linked TOC to all parasite content", "Use descriptive section headers"],
    fastRankRelevance: 6, confirmed: true,
  },
  {
    id: 17, name: "LSI Keywords", category: "page_level",
    description: "Latent Semantic Indexing keywords help Google understand topic context",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Use AI to generate LSI-rich content", "Include related terms, synonyms, co-occurring phrases"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 18, name: "LSI in Title/Description", category: "page_level",
    description: "LSI keywords in meta tags help disambiguate meaning",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Include 1-2 LSI terms in title and description"],
    fastRankRelevance: 6, confirmed: false,
  },
  {
    id: 19, name: "Topic Depth Coverage", category: "page_level",
    description: "Pages covering every angle of a topic rank higher",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Use AI to generate comprehensive topic coverage", "Include FAQ, how-to, comparisons, pros/cons"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 20, name: "Page Loading Speed", category: "page_level",
    description: "Google uses Chrome user data for speed evaluation; both Google and Bing use it",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Use fast platforms (Telegraph loads instantly)", "Avoid heavy JavaScript on parasite pages"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 22, name: "Entity Match", category: "page_level",
    description: "Content matching the entity user searches for gets ranking boost",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Create content that matches search entity exactly", "Use Google Entity Stacking"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 24, name: "Duplicate Content", category: "page_level",
    description: "Identical/similar content negatively influences visibility",
    impact: "critical", exploitable: false, fastRankRelevance: 9, confirmed: true,
    penaltyTriggers: ["Copied content from indexed pages", "Spun content that's too similar", "Same content on multiple URLs"],
    evasionTips: ["Use AI to generate truly unique content per page", "Vary structure, examples, data points", "Never copy-paste between parasite pages"],
  },
  {
    id: 27, name: "Content Recency/Freshness", category: "page_level",
    description: "Google Caffeine favors recently published/updated content for time-sensitive searches",
    impact: "critical", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Publish new content daily", "Update existing content every 2-3 days", "Add current dates/stats"],
    fastRankRelevance: 10, confirmed: true,
  },
  {
    id: 28, name: "Content Update Magnitude", category: "page_level",
    description: "Adding/removing entire sections is more significant than minor edits",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Add new sections with fresh data every refresh", "Don't just fix typos — add substantial content"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 29, name: "Historical Update Frequency", category: "page_level",
    description: "How often page has been updated over time affects freshness score",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Update parasite pages on 2-3 day cycle", "Maintain consistent update schedule"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 30, name: "Keyword Prominence", category: "page_level",
    description: "Keyword in first 100 words correlates with page 1 rankings",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Place primary keyword in first sentence/paragraph", "Use keyword within first 50 words"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 31, name: "Keyword in H2/H3", category: "page_level",
    description: "Keyword in subheadings is weak relevancy signal",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Include keyword variations in H2/H3 tags", "Use natural keyword placement in subheadings"],
    fastRankRelevance: 6, confirmed: true,
  },
  {
    id: 32, name: "Outbound Link Quality", category: "page_level",
    description: "Linking to authority sites sends trust signals",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Link to Wikipedia, government sites, authority sources from parasite pages"],
    fastRankRelevance: 5, confirmed: true,
  },
  {
    id: 33, name: "Outbound Link Theme", category: "page_level",
    description: "Content of pages you link to acts as relevancy signal (Hilltop Algorithm)",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Link to topically relevant authority pages", "Create thematic link neighborhoods"],
    fastRankRelevance: 5, confirmed: true,
  },
  {
    id: 35, name: "Syndicated/Original Content", category: "page_level",
    description: "Scraped/copied content won't rank; original content required",
    impact: "critical", exploitable: false, fastRankRelevance: 10, confirmed: true,
    penaltyTriggers: ["Scraped content from indexed pages", "Spun content detected as non-original"],
    evasionTips: ["Always generate fresh AI content", "Never scrape competitor content directly"],
  },
  {
    id: 36, name: "Mobile-Friendly", category: "page_level",
    description: "Mobilegeddon update rewards mobile-optimized pages",
    impact: "critical", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Use mobile-responsive platforms (Telegraph is mobile-friendly by default)"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 42, name: "Multimedia Content", category: "page_level",
    description: "Images, videos, multimedia act as content quality signals",
    impact: "medium", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Include relevant images in parasite content", "Add infographics, charts, embedded videos"],
    fastRankRelevance: 5, confirmed: false,
  },
  {
    id: 43, name: "Internal Links to Page", category: "page_level",
    description: "More internal links = more important page",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Cross-link between parasite pages", "Create hub pages linking to all content"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 49, name: "Domain Authority", category: "page_level",
    description: "Pages on authoritative domains rank higher",
    impact: "critical", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Deploy on high-DA platforms: Telegraph DA90, Medium DA95, Reddit DA99", "Parasite SEO on authority sites"],
    fastRankRelevance: 10, confirmed: true,
  },
  {
    id: 50, name: "PageRank", category: "page_level",
    description: "Pages with more link authority rank higher",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Build link pyramids to parasite pages", "Use tiered link building (Tier 1→2→3)"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 55, name: "Keyword in URL", category: "page_level",
    description: "Very small ranking factor but still a signal",
    impact: "low", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Include keyword in Telegraph/parasite URL slug"],
    fastRankRelevance: 4, confirmed: true,
  },
  {
    id: 62, name: "Page Age + Regular Updates", category: "page_level",
    description: "Older pages regularly updated can outperform newer pages",
    impact: "medium", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Update deployed content regularly", "Content freshness engine handles this"],
    fastRankRelevance: 6, confirmed: true,
  },

  // ─── SITE-LEVEL FACTORS (66-83) ───
  {
    id: 66, name: "Unique Value/Insights", category: "site_level",
    description: "Google penalizes sites without new/useful content; thin affiliate sites",
    impact: "high", exploitable: false, fastRankRelevance: 7, confirmed: true,
    penaltyTriggers: ["Thin content", "No unique value", "Pure affiliate with no original content"],
    evasionTips: ["Generate truly unique AI content with local data/stats", "Add original analysis"],
  },
  {
    id: 68, name: "TrustRank", category: "site_level",
    description: "Domain trust is massively important ranking factor",
    impact: "critical", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Leverage high-trust platforms (Telegraph, Medium, gov sites)", "Build links from trusted seed sites"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 69, name: "Site Architecture", category: "site_level",
    description: "Well-organized silo structure helps thematic organization",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Create topical silos on parasite platforms", "Interlink related content thematically"],
    fastRankRelevance: 5, confirmed: true,
  },
  {
    id: 74, name: "SSL Certificate", category: "site_level",
    description: "HTTPS is a ranking signal (tiebreaker)",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["All major platforms (Telegraph, Medium) use HTTPS by default"],
    fastRankRelevance: 3, confirmed: true,
  },
  {
    id: 75, name: "E-A-T (Expertise, Authority, Trust)", category: "site_level",
    description: "Google gives edge to sites with high E-A-T, especially YMYL topics",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Create author bios with credentials", "Link to authoritative sources", "Use expert language"],
    penaltyTriggers: ["YMYL content without expertise signals", "Gambling content on low-E-A-T sites"],
    evasionTips: ["Add fake but convincing author profiles", "Cite real statistics and studies"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 78, name: "Mobile Optimization", category: "site_level",
    description: "Google penalizes non-mobile-friendly sites; mobile-first indexing",
    impact: "critical", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Use inherently mobile-friendly platforms"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 83, name: "Core Web Vitals", category: "site_level",
    description: "CWV are 'more than a tiebreaker' for rankings",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Deploy on fast platforms with good CWV scores", "Telegraph has excellent CWV"],
    fastRankRelevance: 6, confirmed: true,
  },

  // ─── BACKLINK FACTORS (84-130) ───
  {
    id: 85, name: "Number of Referring Domains", category: "backlink",
    description: "One of THE most important ranking factors — unique linking domains",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Build links from many different domains", "Multi-platform distribution", "PBN network diversity"],
    fastRankRelevance: 10, confirmed: true,
  },
  {
    id: 86, name: "C-Class IP Diversity", category: "backlink",
    description: "Links from different IP ranges suggest wider link profile",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Use diverse hosting for PBN sites", "Distribute across many platforms"],
    penaltyTriggers: ["All links from same IP range = blog network detection"],
    evasionTips: ["Use different hosting providers", "Mix cloud providers"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 88, name: "Backlink Anchor Text", category: "backlink",
    description: "Keyword-rich anchor text is strong relevancy signal; over-optimization is spam signal",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Natural anchor text distribution: 30% branded, 25% partial match, 15% exact, 15% generic, 15% URL"],
    penaltyTriggers: ["Over-optimized anchor text (>30% exact match)", "Unnatural anchor text patterns"],
    evasionTips: ["Maintain natural-looking anchor text ratio", "Vary anchor text across links"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 91, name: "Authority of Linking Page", category: "backlink",
    description: "PageRank of referring page is extremely important since Google's early days",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Build links from high-authority pages", "Target pages with existing high PageRank"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 92, name: "Authority of Linking Domain", category: "backlink",
    description: "Referring domain's authority plays independent role in link value",
    impact: "critical", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Deploy on DA90+ platforms", "Build PBN links from high-DA domains"],
    fastRankRelevance: 10, confirmed: true,
  },
  {
    id: 100, name: "Link Type Diversity", category: "backlink",
    description: "Unnatural % from single source (forums, comments) = webspam; diverse sources = natural",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Mix link types: editorial, comment, profile, social, directory, web2.0"],
    penaltyTriggers: ["90%+ links from single type (e.g., all blog comments)"],
    evasionTips: ["Maintain diverse link profile across multiple platforms and types"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 102, name: "Contextual Links", category: "backlink",
    description: "Links inside page content are more powerful than sidebar/footer links",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Place links within article body text", "Avoid footer/sidebar link placement"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 109, name: "Linking Domain Relevancy", category: "backlink",
    description: "Link from topically relevant site is significantly more powerful",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Build links from gambling/casino-related content", "Create topically relevant parasite content"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 112, name: "Positive Link Velocity", category: "backlink",
    description: "Increasing link acquisition rate = increasing popularity = SERP boost",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Gradually increase link building pace", "Start slow, ramp up over 7 days"],
    penaltyTriggers: ["Sudden massive link spike looks unnatural"],
    evasionTips: ["Day 1: 5 links, Day 2: 10, Day 3: 20, Day 4: 30, Day 5: 50, Day 6: 40, Day 7: 30"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 117, name: "Co-Occurrences", category: "backlink",
    description: "Words appearing around backlinks help Google understand page topic",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Surround backlinks with topically relevant text", "Use keyword-rich surrounding paragraphs"],
    fastRankRelevance: 6, confirmed: true,
  },
  {
    id: 120, name: "Natural Link Profile", category: "backlink",
    description: "Natural-looking link profile ranks higher and is more durable to updates",
    impact: "critical", exploitable: true, exploitDifficulty: "hard",
    exploitTactics: ["Simulate natural link profile with mixed types, velocities, and anchor text"],
    penaltyTriggers: ["Obvious black hat link patterns", "All links built in same week"],
    evasionTips: ["Stagger link building over time", "Mix dofollow/nofollow", "Include some low-DA links"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 124, name: "Schema.org Microformats", category: "backlink",
    description: "Pages with schema markup may rank above those without; higher CTR from rich results",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Inject FAQ, HowTo, Article, Review schema into all content"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 128, name: "Word Count of Linking Content", category: "backlink",
    description: "Link from 1000-word post more valuable than from 25-word snippet",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Build links from long-form content (1000+ words)", "Avoid short profile/comment links only"],
    fastRankRelevance: 6, confirmed: true,
  },

  // ─── USER INTERACTION FACTORS (131-141) ───
  {
    id: 131, name: "RankBrain", category: "user_interaction",
    description: "Google's AI measures how users interact with search results",
    impact: "critical", exploitable: true, exploitDifficulty: "hard",
    exploitTactics: ["CTR manipulation via social signals", "Branded search campaigns", "Compelling titles/descriptions"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 132, name: "Organic CTR for Keyword", category: "user_interaction",
    description: "Pages clicked more get SERP boost for that keyword",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["CTR manipulation engine", "Social signal blasting to drive clicks", "Compelling meta descriptions"],
    fastRankRelevance: 9, confirmed: true,
  },
  {
    id: 134, name: "Bounce Rate", category: "user_interaction",
    description: "High bounce rate = poor result for keyword; correlated with lower rankings",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Create engaging content that keeps users on page", "Add interactive elements, long content"],
    fastRankRelevance: 7, confirmed: false,
  },
  {
    id: 135, name: "Direct Traffic", category: "user_interaction",
    description: "Sites with direct traffic are higher quality; confirmed via Chrome data",
    impact: "high", exploitable: true, exploitDifficulty: "hard",
    exploitTactics: ["Drive direct traffic via branded search campaigns", "Social media promotion"],
    fastRankRelevance: 6, confirmed: true,
  },
  {
    id: 137, name: "Pogosticking", category: "user_interaction",
    description: "Users clicking back and trying other results = significant ranking drop",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Create content that satisfies search intent immediately", "Answer the query in first paragraph"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 141, name: "Dwell Time", category: "user_interaction",
    description: "How long users spend on page from Google search; longer = better",
    impact: "critical", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Create long, engaging content", "Use multimedia, interactive elements", "Tell stories"],
    fastRankRelevance: 8, confirmed: true,
  },

  // ─── SPECIAL ALGORITHM RULES (142-160) ───
  {
    id: 142, name: "Query Deserves Freshness (QDF)", category: "special_algorithm",
    description: "Google gives newer pages a boost for certain time-sensitive searches",
    impact: "critical", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Publish content timed with trending topics", "Update content frequently for QDF boost"],
    fastRankRelevance: 10, confirmed: true,
  },
  {
    id: 146, name: "Featured Snippets", category: "special_algorithm",
    description: "Based on content length, formatting, page authority, HTTPS",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Format content for snippet capture: 40-60 word paragraphs, numbered lists, tables"],
    fastRankRelevance: 8, confirmed: true,
  },
  {
    id: 147, name: "Geo Targeting", category: "special_algorithm",
    description: "Google prefers sites with local server IP and country-specific TLD",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Target Thai-language content for .co.th", "Use geo-specific keywords"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 149, name: "YMYL Keywords", category: "special_algorithm",
    description: "Google has higher quality standards for Your Money Your Life keywords (gambling = YMYL)",
    impact: "critical", exploitable: false, fastRankRelevance: 8, confirmed: true,
    penaltyTriggers: ["Low-quality gambling content", "No expertise signals for YMYL topics"],
    evasionTips: ["Add expert-looking author bios", "Include disclaimers", "Cite statistics"],
  },
  {
    id: 155, name: "Big Brand Preference", category: "special_algorithm",
    description: "Vince Update gives big brands a boost for certain keywords",
    impact: "high", exploitable: true, exploitDifficulty: "hard",
    exploitTactics: ["Build brand signals: social profiles, branded searches, mentions"],
    fastRankRelevance: 5, confirmed: true,
  },
  {
    id: 160, name: "Payday Loans Update", category: "special_algorithm",
    description: "Special algorithm to clean up very spammy queries (gambling, payday loans, etc.)",
    impact: "critical", exploitable: false, fastRankRelevance: 9, confirmed: true,
    penaltyTriggers: ["Obvious spam for gambling/payday keywords", "Unnatural link patterns for spammy queries"],
    evasionTips: ["Make content look legitimate", "Avoid obvious spam patterns", "Use natural language"],
  },

  // ─── BRAND SIGNALS (161-171) ───
  {
    id: 161, name: "Brand Name Anchor Text", category: "brand_signal",
    description: "Branded anchor text is simple but strong brand signal",
    impact: "high", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Include branded anchor text in link profile", "Mix branded + keyword anchors"],
    fastRankRelevance: 6, confirmed: true,
  },
  {
    id: 162, name: "Branded Searches", category: "brand_signal",
    description: "People searching for your brand shows Google it's a real brand",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["CTR manipulation with branded search queries", "Social campaigns driving brand searches"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 163, name: "Brand + Keyword Searches", category: "brand_signal",
    description: "People searching 'brand + keyword' boosts non-branded keyword rankings",
    impact: "high", exploitable: true, exploitDifficulty: "moderate",
    exploitTactics: ["Drive 'brand + keyword' searches via social media"],
    fastRankRelevance: 7, confirmed: true,
  },
  {
    id: 170, name: "Unlinked Brand Mentions", category: "brand_signal",
    description: "Google looks at non-hyperlinked brand mentions as brand signal",
    impact: "medium", exploitable: true, exploitDifficulty: "easy",
    exploitTactics: ["Mention brand name in parasite content without linking", "Create brand mentions across platforms"],
    fastRankRelevance: 5, confirmed: false,
  },

  // ─── ON-SITE WEBSPAM FACTORS (172-187) ───
  {
    id: 172, name: "Panda Penalty", category: "on_site_spam",
    description: "Low-quality content farms get penalized",
    impact: "critical", exploitable: false, fastRankRelevance: 8, confirmed: true,
    penaltyTriggers: ["Thin content", "Content farms", "Low-quality mass-produced content"],
    evasionTips: ["Generate high-quality AI content", "Ensure each page has unique value"],
  },
  {
    id: 177, name: "Site Over-Optimization", category: "on_site_spam",
    description: "Google penalizes keyword stuffing, header tag stuffing, excessive keyword decoration",
    impact: "critical", exploitable: false, fastRankRelevance: 8, confirmed: true,
    penaltyTriggers: ["Keyword stuffing", "Header tag stuffing", "Excessive bold/italic keywords"],
    evasionTips: ["Keep keyword density natural (2-3%)", "Use variations and synonyms"],
  },
  {
    id: 178, name: "Gibberish/Auto-Generated Content", category: "on_site_spam",
    description: "Google can identify gibberish and auto-generated content for filtering",
    impact: "critical", exploitable: false, fastRankRelevance: 9, confirmed: true,
    penaltyTriggers: ["Spun content", "Obviously auto-generated text", "Gibberish/nonsensical content"],
    evasionTips: ["Use high-quality AI generation", "Always review for readability", "Add human-like touches"],
  },
  {
    id: 184, name: "Autogenerated Content Detection", category: "on_site_spam",
    description: "Google hates autogenerated content; can result in penalty or de-indexing",
    impact: "critical", exploitable: false, fastRankRelevance: 9, confirmed: true,
    penaltyTriggers: ["Detectable AI patterns", "Repetitive structure", "Lack of original insights"],
    evasionTips: ["Humanize AI content", "Add unique data points", "Vary writing style", "Include local references"],
  },

  // ─── OFF-SITE WEBSPAM FACTORS (188-206) ───
  {
    id: 189, name: "Unnatural Link Influx", category: "off_site_spam",
    description: "Sudden influx of links is sure-fire sign of phony links",
    impact: "critical", exploitable: false, fastRankRelevance: 9, confirmed: true,
    penaltyTriggers: ["100+ links built in 1 day", "Massive link spike from nowhere"],
    evasionTips: ["Gradual link velocity", "Start with 5-10 links/day, ramp up slowly"],
  },
  {
    id: 190, name: "Penguin Penalty", category: "off_site_spam",
    description: "Sites hit by Penguin are significantly less visible; targets link spam",
    impact: "critical", exploitable: false, fastRankRelevance: 9, confirmed: true,
    penaltyTriggers: ["Manipulative link building", "Link schemes", "Paid links"],
    evasionTips: ["Make links look natural", "Diverse anchor text", "Gradual velocity"],
  },
  {
    id: 191, name: "High % Low-Quality Links", category: "off_site_spam",
    description: "Lots of links from blog comments and forum profiles = gaming the system",
    impact: "high", exploitable: false, fastRankRelevance: 7, confirmed: true,
    penaltyTriggers: ["80%+ links from comments/forums/profiles"],
    evasionTips: ["Mix in high-quality editorial links", "Use diverse link sources"],
  },
  {
    id: 192, name: "Links from Unrelated Sites", category: "off_site_spam",
    description: "High % of backlinks from unrelated sites increases manual penalty odds",
    impact: "high", exploitable: false, fastRankRelevance: 7, confirmed: true,
    penaltyTriggers: ["Casino links from cooking blogs", "Irrelevant link neighborhoods"],
    evasionTips: ["Build links from topically relevant content", "Create gambling-related parasite content"],
  },
  {
    id: 196, name: "Same C-Class IP Links", category: "off_site_spam",
    description: "Unnatural links from same server IP = blog network detection",
    impact: "high", exploitable: false, fastRankRelevance: 7, confirmed: true,
    penaltyTriggers: ["All PBN links from same hosting provider"],
    evasionTips: ["Diversify PBN hosting across providers", "Use different IP ranges"],
  },
  {
    id: 198, name: "Unnatural Link Spike Detection", category: "off_site_spam",
    description: "Google patent describes identifying whether link influx is legitimate",
    impact: "critical", exploitable: false, fastRankRelevance: 9, confirmed: true,
    penaltyTriggers: ["Link spike doesn't match content/brand growth"],
    evasionTips: ["Correlate link building with content publishing", "Make it look organic"],
  },
  {
    id: 202, name: "Google Sandbox", category: "off_site_spam",
    description: "New sites with sudden link influx put in sandbox — temporarily limited visibility",
    impact: "critical", exploitable: false, fastRankRelevance: 10, confirmed: false,
    penaltyTriggers: ["New domain + massive links = sandbox"],
    evasionTips: ["Use established high-DA platforms instead of new domains", "Parasite SEO avoids sandbox"],
  },
];

// Merge expanded factors into the main array (84 base + 138 expanded = 222 total)
RANKING_FACTORS.push(
  ...EXPANDED_DOMAIN_FACTORS,
  ...EXPANDED_PAGE_LEVEL_FACTORS,
  ...EXPANDED_SITE_LEVEL_FACTORS,
  ...EXPANDED_BACKLINK_FACTORS,
  ...EXPANDED_USER_INTERACTION_FACTORS,
  ...EXPANDED_SPECIAL_ALGORITHM_FACTORS,
  ...EXPANDED_BRAND_SIGNAL_FACTORS,
  ...EXPANDED_ON_SITE_SPAM_FACTORS,
  ...EXPANDED_OFF_SITE_SPAM_FACTORS,
);

// ═══════════════════════════════════════════════
//  FAST-RANKING STRATEGY PROFILES
// ═══════════════════════════════════════════════

export interface RankingStrategy {
  name: string;
  description: string;
  timeframe: string;
  /** Factors this strategy exploits (by ID) */
  exploitedFactors: number[];
  /** Steps to execute */
  steps: string[];
  /** Risk level 1-10 */
  riskLevel: number;
  /** Expected success rate */
  successRate: string;
}

export const FAST_RANKING_STRATEGIES: RankingStrategy[] = [
  {
    name: "Parasite SEO Blitz",
    description: "Mass-deploy optimized content on DA90+ platforms to leverage their authority",
    timeframe: "1-3 days",
    exploitedFactors: [49, 92, 85, 10, 11, 13, 15, 27, 124, 142],
    steps: [
      "1. Generate AI content optimized for target keyword (1500-2500 words)",
      "2. Front-load keyword in title, H1, first 100 words",
      "3. Include LSI keywords, FAQ section, table of contents",
      "4. Inject FAQ + Article schema markup",
      "5. Deploy to Telegraph (DA90), JustPaste.it (DA72), Rentry (DA62)",
      "6. Build Tier 1 links from diverse platforms to parasite pages",
      "7. Trigger rapid indexing (IndexNow, Google Ping, social signals)",
      "8. Update content every 2-3 days for freshness signals",
    ],
    riskLevel: 3,
    successRate: "40-60% for low-competition keywords",
  },
  {
    name: "Entity Stacking + Link Pyramid",
    description: "Create interconnected Google properties + tiered link building",
    timeframe: "3-7 days",
    exploitedFactors: [22, 68, 85, 88, 91, 92, 100, 102, 112],
    steps: [
      "1. Create Google Entity Stack (Sites, Docs, Sheets, Maps)",
      "2. Interlink all Google properties pointing to target",
      "3. Build Tier 1 links from high-DA platforms",
      "4. Build Tier 2 links pointing to Tier 1 URLs",
      "5. Build Tier 3 links (pings, social, directories) to Tier 2",
      "6. Maintain natural anchor text distribution",
      "7. Gradually increase link velocity over 7 days",
    ],
    riskLevel: 5,
    successRate: "30-50% for medium-competition keywords",
  },
  {
    name: "CTR Manipulation + Social Signals",
    description: "Drive organic CTR and social engagement to boost rankings",
    timeframe: "2-5 days",
    exploitedFactors: [131, 132, 134, 135, 137, 141, 162, 163],
    steps: [
      "1. Deploy optimized content on parasite platforms",
      "2. Blast social signals (shares, likes, comments) across platforms",
      "3. Drive branded + keyword searches from social campaigns",
      "4. Create compelling meta titles/descriptions for high CTR",
      "5. Seed content in relevant communities for engagement",
      "6. Monitor dwell time and optimize content for engagement",
    ],
    riskLevel: 4,
    successRate: "25-40% for medium-competition keywords",
  },
  {
    name: "Content Velocity + Freshness Domination",
    description: "Overwhelm SERPs with fresh, high-quality content at high velocity",
    timeframe: "1-3 days",
    exploitedFactors: [27, 28, 29, 142, 15, 19, 17, 146],
    steps: [
      "1. Generate 10-20 unique articles per keyword per day",
      "2. Deploy across 8+ platforms simultaneously",
      "3. Update all content every 48 hours with new sections",
      "4. Target featured snippet format (40-60 word answers)",
      "5. Include current dates, statistics, trending data",
      "6. Cross-link between all deployed content",
      "7. Rapid index all URLs immediately after deployment",
    ],
    riskLevel: 4,
    successRate: "35-55% for low-competition keywords",
  },
  {
    name: "SERP Feature Hijacking",
    description: "Optimize content specifically to capture SERP features (snippets, PAA, etc.)",
    timeframe: "2-5 days",
    exploitedFactors: [146, 124, 15, 19, 10, 13, 49],
    steps: [
      "1. Analyze current SERP features for target keyword",
      "2. Generate content optimized for each feature type",
      "3. Format for featured snippets: paragraph (40-60 words), list, table",
      "4. Generate PAA-style Q&A pairs",
      "5. Inject comprehensive schema markup (FAQ, HowTo, Article)",
      "6. Deploy on high-DA platforms for authority",
      "7. Build contextual links with relevant anchor text",
    ],
    riskLevel: 3,
    successRate: "30-45% for featured snippet capture",
  },
];

// ═══════════════════════════════════════════════
//  PENALTY AVOIDANCE RULES
// ═══════════════════════════════════════════════

export interface PenaltyRule {
  name: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  triggers: string[];
  avoidance: string[];
  relatedFactors: number[];
}

export const PENALTY_RULES: PenaltyRule[] = [
  {
    name: "Unnatural Link Spike",
    description: "Building too many links too fast triggers Penguin/manual penalty",
    severity: "critical",
    triggers: ["100+ links in 1 day", "Massive link spike from zero", "All links same day"],
    avoidance: [
      "Day 1: 5-10 links, Day 2: 10-15, Day 3: 15-25, Day 4: 25-40, Day 5: 40-60",
      "Never build more than 60 links/day for a single target",
      "Stagger link building across multiple hours",
      "Mix link types and platforms each day",
    ],
    relatedFactors: [189, 198, 190],
  },
  {
    name: "Over-Optimized Anchor Text",
    description: "Too many exact-match anchors triggers Penguin penalty",
    severity: "critical",
    triggers: [">30% exact match anchor text", "Unnatural anchor text patterns"],
    avoidance: [
      "Target distribution: 30% branded, 25% partial match, 15% exact, 15% generic, 15% URL",
      "Vary anchor text across all links",
      "Include natural phrases like 'click here', 'learn more', 'this site'",
    ],
    relatedFactors: [88, 190],
  },
  {
    name: "Duplicate/Thin Content",
    description: "Mass-deploying similar content triggers Panda penalty",
    severity: "critical",
    triggers: ["Same content on multiple URLs", "Thin <300 word pages", "Spun content"],
    avoidance: [
      "Generate truly unique content for each deployment",
      "Minimum 1000 words per page",
      "Vary structure, examples, data points between pages",
      "Use different writing styles and formats",
    ],
    relatedFactors: [24, 172, 178, 184],
  },
  {
    name: "Blog Network Detection",
    description: "PBN links from same IP range triggers devaluation",
    severity: "high",
    triggers: ["Multiple links from same C-class IP", "Obvious PBN footprint"],
    avoidance: [
      "Diversify PBN hosting across 5+ providers",
      "Use different CMS themes and plugins",
      "Vary content types and posting schedules",
      "Don't interlink PBN sites",
    ],
    relatedFactors: [86, 196],
  },
  {
    name: "Payday Loans Algorithm",
    description: "Special algorithm for spammy queries (gambling, loans, pharma)",
    severity: "critical",
    triggers: ["Obvious spam for gambling keywords", "Low-quality gambling content", "Manipulative link patterns"],
    avoidance: [
      "Make content look legitimate and informative",
      "Add disclaimers, responsible gambling messaging",
      "Use natural language, avoid spam patterns",
      "Include genuine-looking author bios and credentials",
      "Cite real statistics and regulatory information",
    ],
    relatedFactors: [160, 149, 75],
  },
  {
    name: "Google Sandbox",
    description: "New domains with sudden link influx get sandboxed",
    severity: "high",
    triggers: ["New domain + massive links", "No history + aggressive SEO"],
    avoidance: [
      "USE PARASITE SEO: Deploy on established high-DA platforms to bypass sandbox entirely",
      "Telegraph, Medium, Reddit etc. are NOT new domains — no sandbox risk",
      "For target domains: build links gradually over weeks",
    ],
    relatedFactors: [202],
  },
];

// ═══════════════════════════════════════════════
//  CONTENT OPTIMIZATION SCORING
// ═══════════════════════════════════════════════

export interface ContentScore {
  overall: number; // 0-100
  titleOptimization: number;
  keywordPlacement: number;
  contentLength: number;
  lsiCoverage: number;
  topicDepth: number;
  freshness: number;
  schemaMarkup: number;
  readability: number;
  uniqueness: number;
  eAtSignals: number;
  recommendations: string[];
  penaltyRisks: string[];
}

/**
 * Score content against Google's ranking factors
 */
export function scoreContent(params: {
  title: string;
  content: string;
  keyword: string;
  metaDescription?: string;
  hasSchema?: boolean;
  hasImages?: boolean;
  hasTOC?: boolean;
  publishDate?: Date;
  lastUpdated?: Date;
}): ContentScore {
  const { title, content, keyword, metaDescription, hasSchema, hasImages, hasTOC, publishDate, lastUpdated } = params;
  const recommendations: string[] = [];
  const penaltyRisks: string[] = [];
  const lowerTitle = title.toLowerCase();
  const lowerContent = content.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const words = content.split(/\s+/).length;

  // 1. Title Optimization (factors 10, 11)
  let titleScore = 0;
  if (lowerTitle.includes(lowerKeyword)) {
    titleScore += 50;
    if (lowerTitle.startsWith(lowerKeyword) || lowerTitle.indexOf(lowerKeyword) < 10) {
      titleScore += 30; // Keyword at start
    }
  } else {
    recommendations.push("Add target keyword to title tag");
  }
  if (title.length >= 30 && title.length <= 65) titleScore += 20;
  else recommendations.push("Optimize title length to 30-65 characters");

  // 2. Keyword Placement (factors 14, 30, 31)
  let keywordScore = 0;
  const first100Words = lowerContent.split(/\s+/).slice(0, 100).join(" ");
  if (first100Words.includes(lowerKeyword)) {
    keywordScore += 30; // Keyword in first 100 words
  } else {
    recommendations.push("Place keyword in first 100 words of content");
  }
  
  // Keyword density
  const keywordCount = (lowerContent.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g")) || []).length;
  const density = (keywordCount / words) * 100;
  if (density >= 1 && density <= 3) {
    keywordScore += 40;
  } else if (density > 3 && density <= 5) {
    keywordScore += 20;
    recommendations.push("Reduce keyword density slightly (currently " + density.toFixed(1) + "%)");
  } else if (density > 5) {
    keywordScore += 0;
    penaltyRisks.push("Keyword stuffing detected (" + density.toFixed(1) + "% density) — risk of over-optimization penalty");
  } else {
    keywordScore += 10;
    recommendations.push("Increase keyword usage (currently " + density.toFixed(1) + "%)");
  }

  // H2/H3 keyword presence
  const hasKeywordInHeaders = lowerContent.includes("## " + lowerKeyword) || 
    lowerContent.includes("### " + lowerKeyword) ||
    lowerContent.includes("<h2>" + lowerKeyword) ||
    lowerContent.includes("<h3>" + lowerKeyword);
  if (hasKeywordInHeaders) keywordScore += 30;
  else recommendations.push("Include keyword in at least one H2/H3 subheading");

  // 3. Content Length (factor 15)
  let lengthScore = 0;
  if (words >= 2000) lengthScore = 100;
  else if (words >= 1500) lengthScore = 85;
  else if (words >= 1000) lengthScore = 65;
  else if (words >= 500) lengthScore = 40;
  else {
    lengthScore = 15;
    penaltyRisks.push("Thin content (" + words + " words) — risk of Panda penalty");
  }
  if (words < 1400) recommendations.push("Increase content to 1400+ words (avg page 1 result length)");

  // 4. LSI Coverage (factors 17, 18)
  let lsiScore = 50; // Default moderate — would need NLP analysis for accurate scoring
  // Check for common LSI indicators
  const hasVariations = lowerContent.includes(lowerKeyword.replace(/\s+/g, "-")) ||
    lowerContent.includes(lowerKeyword + "s") ||
    lowerContent.includes(lowerKeyword.split(" ").reverse().join(" "));
  if (hasVariations) lsiScore += 25;
  else recommendations.push("Add keyword variations and LSI terms throughout content");

  // 5. Topic Depth (factor 19)
  let depthScore = 0;
  const sections = (content.match(/#{2,3}\s/g) || []).length;
  if (sections >= 8) depthScore = 100;
  else if (sections >= 5) depthScore = 75;
  else if (sections >= 3) depthScore = 50;
  else {
    depthScore = 25;
    recommendations.push("Add more sections/subheadings for comprehensive topic coverage");
  }
  if (hasTOC) depthScore = Math.min(100, depthScore + 15);
  else recommendations.push("Add a table of contents for better structure");

  // 6. Freshness (factors 27, 28, 29, 142)
  let freshnessScore = 50;
  if (lastUpdated) {
    const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate <= 1) freshnessScore = 100;
    else if (daysSinceUpdate <= 3) freshnessScore = 85;
    else if (daysSinceUpdate <= 7) freshnessScore = 65;
    else if (daysSinceUpdate <= 30) freshnessScore = 40;
    else {
      freshnessScore = 15;
      recommendations.push("Content is " + Math.round(daysSinceUpdate) + " days old — update for freshness boost");
    }
  }
  if (publishDate) {
    const daysSincePublish = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePublish <= 3) freshnessScore = Math.max(freshnessScore, 90);
  }

  // 7. Schema Markup (factor 124)
  let schemaScore = hasSchema ? 100 : 0;
  if (!hasSchema) recommendations.push("Add FAQ + Article schema markup for rich snippet eligibility");

  // 8. Readability
  let readabilityScore = 50;
  const avgSentenceLength = words / (content.split(/[.!?]+/).length || 1);
  if (avgSentenceLength >= 10 && avgSentenceLength <= 20) readabilityScore = 85;
  else if (avgSentenceLength < 10) readabilityScore = 60;
  else readabilityScore = 40;
  
  const hasBullets = content.includes("- ") || content.includes("* ") || content.includes("1.");
  if (hasBullets) readabilityScore = Math.min(100, readabilityScore + 15);
  else recommendations.push("Add bullet points or numbered lists for better readability");

  // 9. Uniqueness (factors 24, 35)
  let uniquenessScore = 70; // Default — would need plagiarism check for accurate scoring
  // Basic check: if content is very short or repetitive
  if (words < 300) {
    uniquenessScore = 20;
    penaltyRisks.push("Content too short to be considered unique/valuable");
  }

  // 10. E-A-T Signals (factor 75)
  let eatScore = 30;
  if (lowerContent.includes("expert") || lowerContent.includes("author") || lowerContent.includes("credential")) eatScore += 20;
  if (lowerContent.includes("source") || lowerContent.includes("study") || lowerContent.includes("research")) eatScore += 20;
  if (lowerContent.includes("disclaimer") || lowerContent.includes("responsible")) eatScore += 15;
  if (hasImages) eatScore += 15;
  if (eatScore < 50) recommendations.push("Add author bio, citations, and expertise signals for E-A-T");

  // Calculate overall score (weighted)
  const overall = Math.round(
    titleScore * 0.15 +
    keywordScore * 0.15 +
    lengthScore * 0.12 +
    lsiScore * 0.10 +
    depthScore * 0.10 +
    freshnessScore * 0.12 +
    schemaScore * 0.08 +
    readabilityScore * 0.06 +
    uniquenessScore * 0.07 +
    eatScore * 0.05
  );

  return {
    overall,
    titleOptimization: titleScore,
    keywordPlacement: keywordScore,
    contentLength: lengthScore,
    lsiCoverage: lsiScore,
    topicDepth: depthScore,
    freshness: freshnessScore,
    schemaMarkup: schemaScore,
    readability: readabilityScore,
    uniqueness: uniquenessScore,
    eAtSignals: eatScore,
    recommendations,
    penaltyRisks,
  };
}

// ═══════════════════════════════════════════════
//  LINK PROFILE ANALYZER
// ═══════════════════════════════════════════════

export interface LinkProfileScore {
  overall: number;
  anchorTextDistribution: {
    branded: number;
    exactMatch: number;
    partialMatch: number;
    generic: number;
    nakedUrl: number;
  };
  anchorTextHealth: number;
  domainDiversity: number;
  linkVelocityHealth: number;
  linkTypeBalance: number;
  recommendations: string[];
  penaltyRisks: string[];
}

export function analyzeLinkProfile(links: Array<{
  anchorText: string;
  sourceDomain: string;
  sourceDA: number;
  linkType: string;
  createdAt: Date;
}>): LinkProfileScore {
  const recommendations: string[] = [];
  const penaltyRisks: string[] = [];

  if (links.length === 0) {
    return {
      overall: 0,
      anchorTextDistribution: { branded: 0, exactMatch: 0, partialMatch: 0, generic: 0, nakedUrl: 0 },
      anchorTextHealth: 0,
      domainDiversity: 0,
      linkVelocityHealth: 0,
      linkTypeBalance: 0,
      recommendations: ["No links found — start building links"],
      penaltyRisks: [],
    };
  }

  // Anchor text analysis
  const anchors = links.map(l => l.anchorText.toLowerCase());
  const totalAnchors = anchors.length;
  const genericPhrases = ["click here", "learn more", "read more", "this site", "here", "visit", "website"];
  const urlPattern = /^https?:\/\//;

  let branded = 0, exactMatch = 0, partialMatch = 0, generic = 0, nakedUrl = 0;
  for (const anchor of anchors) {
    if (urlPattern.test(anchor) || anchor.includes(".com") || anchor.includes(".th")) nakedUrl++;
    else if (genericPhrases.some(g => anchor.includes(g))) generic++;
    else branded++; // Simplified — in production would check against actual brand name
  }

  const distribution = {
    branded: Math.round((branded / totalAnchors) * 100),
    exactMatch: Math.round((exactMatch / totalAnchors) * 100),
    partialMatch: Math.round((partialMatch / totalAnchors) * 100),
    generic: Math.round((generic / totalAnchors) * 100),
    nakedUrl: Math.round((nakedUrl / totalAnchors) * 100),
  };

  // Anchor text health
  let anchorHealth = 70;
  if (distribution.exactMatch > 30) {
    anchorHealth -= 30;
    penaltyRisks.push("Exact match anchor text too high (" + distribution.exactMatch + "%) — Penguin risk");
  }
  if (distribution.branded < 20) {
    anchorHealth -= 15;
    recommendations.push("Increase branded anchor text to 20-30%");
  }

  // Domain diversity
  const uniqueDomains = new Set(links.map(l => l.sourceDomain)).size;
  const diversityRatio = uniqueDomains / totalAnchors;
  let domainDiversity = Math.min(100, Math.round(diversityRatio * 100 * 1.5));
  if (diversityRatio < 0.3) {
    recommendations.push("Increase referring domain diversity — too many links from same domains");
    penaltyRisks.push("Low domain diversity (" + uniqueDomains + " unique domains for " + totalAnchors + " links)");
  }

  // Link velocity
  let velocityHealth = 70;
  if (links.length >= 3) {
    const sorted = [...links].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstDate = sorted[0].createdAt.getTime();
    const lastDate = sorted[sorted.length - 1].createdAt.getTime();
    const daySpan = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
    const linksPerDay = links.length / Math.max(1, daySpan);
    
    if (linksPerDay > 50) {
      velocityHealth = 20;
      penaltyRisks.push("Link velocity too high (" + Math.round(linksPerDay) + " links/day) — unnatural spike risk");
    } else if (linksPerDay > 20) {
      velocityHealth = 50;
      recommendations.push("Consider slowing link building pace");
    } else if (linksPerDay >= 5 && linksPerDay <= 20) {
      velocityHealth = 90;
    }
  }

  // Link type balance
  const linkTypes = new Set(links.map(l => l.linkType));
  let typeBalance = Math.min(100, linkTypes.size * 25);
  if (linkTypes.size <= 1) {
    recommendations.push("Diversify link types (editorial, comment, social, directory, web2.0)");
    penaltyRisks.push("All links are same type — unnatural link profile");
  }

  const overall = Math.round(
    anchorHealth * 0.3 +
    domainDiversity * 0.25 +
    velocityHealth * 0.25 +
    typeBalance * 0.2
  );

  return {
    overall,
    anchorTextDistribution: distribution,
    anchorTextHealth: anchorHealth,
    domainDiversity,
    linkVelocityHealth: velocityHealth,
    linkTypeBalance: typeBalance,
    recommendations,
    penaltyRisks,
  };
}

// ═══════════════════════════════════════════════
//  AI-POWERED ALGORITHM ANALYSIS
// ═══════════════════════════════════════════════

export interface AlgorithmAnalysis {
  keyword: string;
  competitionLevel: "low" | "medium" | "high" | "extreme";
  recommendedStrategy: string;
  exploitableFactors: RankingFactor[];
  penaltyRisks: PenaltyRule[];
  contentGuidelines: {
    minWords: number;
    keywordDensity: string;
    requiredElements: string[];
    schemaTypes: string[];
    anchorTextPlan: Record<string, number>;
  };
  linkBuildingPlan: {
    day1: number;
    day2: number;
    day3: number;
    day4: number;
    day5: number;
    day6: number;
    day7: number;
    totalLinks: number;
    platformMix: Record<string, number>;
  };
  estimatedRankingTime: string;
  confidenceScore: number;
}

/**
 * AI-powered analysis of how to rank for a specific keyword
 * Uses all 200+ ranking factors to create optimal strategy
 */
export async function analyzeKeywordStrategy(keyword: string, niche: string = "gambling"): Promise<AlgorithmAnalysis> {
  // Get relevant factors for fast ranking
  const fastRankFactors = RANKING_FACTORS
    .filter(f => f.fastRankRelevance >= 7 && f.exploitable)
    .sort((a, b) => b.fastRankRelevance - a.fastRankRelevance);

  const relevantPenalties = PENALTY_RULES.filter(p => p.severity === "critical");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a Google algorithm expert. Analyze the keyword and create an optimal ranking strategy.
You deeply understand all 200+ Google ranking factors and how to exploit them for fast rankings.
Focus on factors most relevant to 1-3 day ranking achievement.
The niche is ${niche} (Thai language gambling keywords).
Return JSON only.`,
        },
        {
          role: "user",
          content: `Analyze this keyword for fast ranking strategy:
Keyword: "${keyword}"
Niche: ${niche}

Top exploitable ranking factors:
${fastRankFactors.slice(0, 15).map(f => `- ${f.name} (impact: ${f.impact}, relevance: ${f.fastRankRelevance}/10): ${f.exploitTactics?.[0] || f.description}`).join("\n")}

Critical penalty risks:
${relevantPenalties.map(p => `- ${p.name}: ${p.avoidance[0]}`).join("\n")}

Return JSON with:
{
  "competitionLevel": "low|medium|high|extreme",
  "recommendedStrategy": "strategy name from: Parasite SEO Blitz, Entity Stacking, CTR Manipulation, Content Velocity, SERP Feature Hijacking",
  "contentGuidelines": {
    "minWords": number,
    "keywordDensity": "X-Y%",
    "requiredElements": ["list of required content elements"],
    "schemaTypes": ["FAQ", "Article", etc],
    "anchorTextPlan": {"branded": 30, "partial": 25, "exact": 15, "generic": 15, "url": 15}
  },
  "linkBuildingPlan": {
    "day1": number, "day2": number, "day3": number, "day4": number, "day5": number, "day6": number, "day7": number,
    "totalLinks": number,
    "platformMix": {"telegraph": 20, "justpaste": 15, "rentry": 10, "web2": 15, "comments": 10, "social": 15, "pbn": 15}
  },
  "estimatedRankingTime": "X-Y days",
  "confidenceScore": 0-100
}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "keyword_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              competitionLevel: { type: "string", enum: ["low", "medium", "high", "extreme"] },
              recommendedStrategy: { type: "string" },
              contentGuidelines: {
                type: "object",
                properties: {
                  minWords: { type: "integer" },
                  keywordDensity: { type: "string" },
                  requiredElements: { type: "array", items: { type: "string" } },
                  schemaTypes: { type: "array", items: { type: "string" } },
                  anchorTextPlan: {
                    type: "object",
                    properties: {
                      branded: { type: "integer" },
                      partial: { type: "integer" },
                      exact: { type: "integer" },
                      generic: { type: "integer" },
                      url: { type: "integer" },
                    },
                    required: ["branded", "partial", "exact", "generic", "url"],
                    additionalProperties: false,
                  },
                },
                required: ["minWords", "keywordDensity", "requiredElements", "schemaTypes", "anchorTextPlan"],
                additionalProperties: false,
              },
              linkBuildingPlan: {
                type: "object",
                properties: {
                  day1: { type: "integer" },
                  day2: { type: "integer" },
                  day3: { type: "integer" },
                  day4: { type: "integer" },
                  day5: { type: "integer" },
                  day6: { type: "integer" },
                  day7: { type: "integer" },
                  totalLinks: { type: "integer" },
                  platformMix: {
                    type: "object",
                    properties: {
                      telegraph: { type: "integer" },
                      justpaste: { type: "integer" },
                      rentry: { type: "integer" },
                      web2: { type: "integer" },
                      comments: { type: "integer" },
                      social: { type: "integer" },
                      pbn: { type: "integer" },
                    },
                    required: ["telegraph", "justpaste", "rentry", "web2", "comments", "social", "pbn"],
                    additionalProperties: false,
                  },
                },
                required: ["day1", "day2", "day3", "day4", "day5", "day6", "day7", "totalLinks", "platformMix"],
                additionalProperties: false,
              },
              estimatedRankingTime: { type: "string" },
              confidenceScore: { type: "integer" },
            },
            required: ["competitionLevel", "recommendedStrategy", "contentGuidelines", "linkBuildingPlan", "estimatedRankingTime", "confidenceScore"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices[0].message.content;
    const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const analysis = JSON.parse(contentStr || "{}");

    return {
      keyword,
      competitionLevel: analysis.competitionLevel,
      recommendedStrategy: analysis.recommendedStrategy,
      exploitableFactors: fastRankFactors.slice(0, 10),
      penaltyRisks: relevantPenalties,
      contentGuidelines: analysis.contentGuidelines,
      linkBuildingPlan: analysis.linkBuildingPlan,
      estimatedRankingTime: analysis.estimatedRankingTime,
      confidenceScore: analysis.confidenceScore,
    };
  } catch (error) {
    // Fallback with default strategy
    return {
      keyword,
      competitionLevel: "medium",
      recommendedStrategy: "Parasite SEO Blitz",
      exploitableFactors: fastRankFactors.slice(0, 10),
      penaltyRisks: relevantPenalties,
      contentGuidelines: {
        minWords: 1500,
        keywordDensity: "2-3%",
        requiredElements: ["H1 with keyword", "TOC", "FAQ section", "Author bio", "Sources", "Images"],
        schemaTypes: ["FAQPage", "Article"],
        anchorTextPlan: { branded: 30, partial: 25, exact: 15, generic: 15, url: 15 },
      },
      linkBuildingPlan: {
        day1: 8, day2: 15, day3: 25, day4: 35, day5: 45, day6: 35, day7: 25,
        totalLinks: 188,
        platformMix: { telegraph: 20, justpaste: 15, rentry: 10, web2: 15, comments: 10, social: 15, pbn: 15 },
      },
      estimatedRankingTime: "3-5 days",
      confidenceScore: 45,
    };
  }
}

// ═══════════════════════════════════════════════
//  CONTENT GENERATION GUIDELINES
// ═══════════════════════════════════════════════

/**
 * Generate algorithm-optimized content prompt for any keyword
 * Encodes all relevant ranking factors into the AI prompt
 */
export function generateOptimizedContentPrompt(params: {
  keyword: string;
  niche: string;
  language: string;
  targetWordCount?: number;
  includeSchema?: boolean;
  contentGuidelines?: AlgorithmAnalysis["contentGuidelines"];
}): string {
  const { keyword, niche, language, targetWordCount = 1800, includeSchema = true, contentGuidelines } = params;
  
  const anchorPlan = contentGuidelines?.anchorTextPlan || { branded: 30, partial: 25, exact: 15, generic: 15, url: 15 };
  const requiredElements = contentGuidelines?.requiredElements || [
    "H1 with keyword at start",
    "Table of contents with anchor links",
    "Keyword in first 50 words",
    "FAQ section with 5+ Q&A pairs",
    "Author bio with credentials",
    "Sources/references section",
    "Bullet points and numbered lists",
    "Comparison table",
  ];

  return `Generate a comprehensive, SEO-optimized article in ${language} for the keyword: "${keyword}"

CRITICAL GOOGLE RANKING FACTOR REQUIREMENTS:
═══════════════════════════════════════════════

1. TITLE (Factor #10-11): Start title with exact keyword "${keyword}"
   Format: "${keyword} - [Compelling Supporting Text]"

2. CONTENT LENGTH (Factor #15): Write ${targetWordCount}+ words minimum
   Average page 1 result is 1400 words — aim higher for competitive edge

3. KEYWORD PLACEMENT (Factor #30): 
   - Use "${keyword}" in the FIRST SENTENCE
   - Keyword density: ${contentGuidelines?.keywordDensity || "2-3%"} (natural, not stuffed)
   - Include keyword in at least 2 H2 subheadings

4. LSI KEYWORDS (Factor #17): Include related terms, synonyms, and co-occurring phrases
   Use semantic variations throughout — don't repeat exact keyword robotically

5. TOPIC DEPTH (Factor #19): Cover EVERY angle of the topic:
   - What it is, how it works, benefits, risks, comparisons
   - Include expert analysis, statistics, and data points
   - Address common questions (People Also Ask format)

6. CONTENT STRUCTURE:
   ${requiredElements.map(e => `   - ${e}`).join("\n")}

7. E-A-T SIGNALS (Factor #75): 
   - Include author bio: "Written by [Expert Name], [Credentials]"
   - Cite 3+ authoritative sources with links
   - Add disclaimer for YMYL topics (gambling)
   - Use expert-level language and analysis

8. FRESHNESS (Factor #27): Include current date, latest statistics, recent developments

9. READABILITY (Factor #46):
   - Short paragraphs (2-4 sentences)
   - Mix of bullet points, numbered lists, and prose
   - Include comparison tables where relevant
   - Average sentence length: 12-18 words

10. OUTBOUND LINKS (Factor #32-33):
    - Link to 2-3 authority sources (Wikipedia, government sites, industry leaders)
    - All outbound links should be topically relevant

${includeSchema ? `
11. SCHEMA MARKUP: Include JSON-LD for:
    - FAQPage schema (from FAQ section)
    - Article schema (author, date, publisher)
` : ""}

PENALTY AVOIDANCE:
- Do NOT keyword stuff (>5% density)
- Do NOT copy/spin existing content — be 100% original
- Do NOT use gibberish or auto-generated-looking text
- Include genuine insights and analysis
- Write naturally, as a human expert would

NICHE: ${niche}
LANGUAGE: ${language}
TARGET: Google.co.th page 1 (positions 1-10)`;
}

// ═══════════════════════════════════════════════
//  OPTIMAL LINK VELOCITY CALCULATOR
// ═══════════════════════════════════════════════

/**
 * Calculate safe link building velocity based on Google's penalty rules
 * Returns recommended links per day for a 7-day campaign
 */
export function calculateLinkVelocity(params: {
  competitionLevel: "low" | "medium" | "high" | "extreme";
  existingLinks: number;
  domainAge: number; // days
  isParasiteSEO: boolean;
}): { daily: number[]; total: number; maxPerDay: number; warning?: string } {
  const { competitionLevel, existingLinks, domainAge, isParasiteSEO } = params;

  // Base velocity by competition level
  const baseVelocity: Record<string, number[]> = {
    low: [5, 8, 12, 15, 12, 8, 5],      // 65 total
    medium: [8, 15, 25, 35, 30, 20, 12], // 145 total
    high: [10, 20, 35, 50, 45, 30, 15],  // 205 total
    extreme: [15, 30, 50, 70, 60, 40, 20], // 285 total
  };

  let daily = [...(baseVelocity[competitionLevel] || baseVelocity.medium)];

  // Adjust for parasite SEO (can be more aggressive since platform has existing authority)
  if (isParasiteSEO) {
    daily = daily.map(d => Math.round(d * 1.3));
  }

  // Adjust for domain age (newer domains need slower velocity)
  if (!isParasiteSEO && domainAge < 90) {
    daily = daily.map(d => Math.round(d * 0.5));
  }

  // Adjust for existing links (more existing = can build faster)
  if (existingLinks > 100) {
    daily = daily.map(d => Math.round(d * 1.2));
  }

  const total = daily.reduce((a, b) => a + b, 0);
  const maxPerDay = Math.max(...daily);

  let warning: string | undefined;
  if (maxPerDay > 60) {
    warning = "Link velocity exceeds safe threshold — risk of unnatural link spike detection";
  }

  return { daily, total, maxPerDay, warning };
}

// ═══════════════════════════════════════════════
//  ANCHOR TEXT DISTRIBUTION GENERATOR
// ═══════════════════════════════════════════════

/**
 * Generate natural-looking anchor text distribution
 * Based on Google's penalty rules for over-optimized anchors
 */
export function generateAnchorTextPlan(params: {
  keyword: string;
  brandName: string;
  targetUrl: string;
  totalLinks: number;
  plan?: Record<string, number>;
}): Array<{ text: string; type: string; count: number }> {
  const { keyword, brandName, targetUrl, totalLinks, plan } = params;
  const distribution = plan || { branded: 30, partial: 25, exact: 15, generic: 15, url: 15 };

  const anchors: Array<{ text: string; type: string; count: number }> = [];
  const domain = new URL(targetUrl).hostname;

  // Branded anchors (30%)
  const brandedCount = Math.round(totalLinks * distribution.branded / 100);
  const brandedVariations = [brandName, domain, `${brandName} website`, `visit ${brandName}`];
  for (let i = 0; i < brandedCount; i++) {
    anchors.push({
      text: brandedVariations[i % brandedVariations.length],
      type: "branded",
      count: 1,
    });
  }

  // Partial match anchors (25%)
  const partialCount = Math.round(totalLinks * distribution.partial / 100);
  const keywordParts = keyword.split(" ");
  const partialVariations = [
    `best ${keyword}`,
    `${keyword} guide`,
    `top ${keyword}`,
    `${keyword} review`,
    `about ${keyword}`,
    keywordParts.length > 1 ? keywordParts.slice(0, -1).join(" ") : keyword,
  ];
  for (let i = 0; i < partialCount; i++) {
    anchors.push({
      text: partialVariations[i % partialVariations.length],
      type: "partial_match",
      count: 1,
    });
  }

  // Exact match anchors (15%)
  const exactCount = Math.round(totalLinks * distribution.exact / 100);
  for (let i = 0; i < exactCount; i++) {
    anchors.push({ text: keyword, type: "exact_match", count: 1 });
  }

  // Generic anchors (15%)
  const genericCount = Math.round(totalLinks * distribution.generic / 100);
  const genericVariations = ["click here", "learn more", "read more", "visit site", "check this out", "here", "this article"];
  for (let i = 0; i < genericCount; i++) {
    anchors.push({
      text: genericVariations[i % genericVariations.length],
      type: "generic",
      count: 1,
    });
  }

  // Naked URL anchors (15%)
  const urlCount = Math.round(totalLinks * distribution.url / 100);
  const urlVariations = [targetUrl, `https://${domain}`, domain, `www.${domain}`];
  for (let i = 0; i < urlCount; i++) {
    anchors.push({
      text: urlVariations[i % urlVariations.length],
      type: "naked_url",
      count: 1,
    });
  }

  return anchors;
}

// ═══════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════

export function getFactorsByCategory(category: FactorCategory): RankingFactor[] {
  return RANKING_FACTORS.filter(f => f.category === category);
}

export function getExploitableFactors(): RankingFactor[] {
  return RANKING_FACTORS.filter(f => f.exploitable).sort((a, b) => b.fastRankRelevance - a.fastRankRelevance);
}

export function getCriticalFactors(): RankingFactor[] {
  return RANKING_FACTORS.filter(f => f.impact === "critical");
}

export function getFastRankFactors(minRelevance: number = 7): RankingFactor[] {
  return RANKING_FACTORS.filter(f => f.fastRankRelevance >= minRelevance).sort((a, b) => b.fastRankRelevance - a.fastRankRelevance);
}

export function getFactorById(id: number): RankingFactor | undefined {
  return RANKING_FACTORS.find(f => f.id === id);
}

export function getAllStrategies(): RankingStrategy[] {
  return FAST_RANKING_STRATEGIES;
}

export function getAllPenaltyRules(): PenaltyRule[] {
  return PENALTY_RULES;
}

export function getStrategyByName(name: string): RankingStrategy | undefined {
  return FAST_RANKING_STRATEGIES.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
}
