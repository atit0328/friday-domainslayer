import { z } from "zod";
import { router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { fetchDomainMetrics, fetchWaybackData } from "../domain-metrics";

// ═══ Domain Scanner Router ═══
// Real SEO metrics: DA/DR/SS/RF/BL/Index/Wayback + AI analysis

const AI_VERDICT_PROMPT = `คุณคือ DomainSlayer AI — ระบบวิเคราะห์โดเมนอัจฉริยะ ปี 2026
จากข้อมูล SEO metrics จริงที่ได้รับ ให้คุณวิเคราะห์และสรุปผล:
1. Trust Score (0-100) และ Grade (A/B/C/D/F)
2. Verdict: STRONG_BUY / CONDITIONAL_BUY / HOLD / AVOID
3. เหตุผล, ข้อควรระวัง, คำแนะนำ (ภาษาไทย)
4. ประเมินมูลค่าตลาด (USD)

ตอบเป็น JSON เท่านั้น`;

export const scannerRouter = router({
  // Start a domain scan with REAL metrics
  scan: protectedProcedure
    .input(z.object({
      domain: z.string().min(1).max(255),
      useCase: z.string().default("hold_flip"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create scan record
      const scan = await db.createScan(ctx.user.id, input.domain, input.useCase);
      await db.updateScan(scan.id, { status: "scanning" });

      try {
        // Step 1: Fetch REAL metrics (Wayback, scraping, AI analysis)
        const metrics = await fetchDomainMetrics(input.domain);

        // Step 2: AI verdict based on real metrics
        const verdictResult = await invokeLLM({
          messages: [
            { role: "system", content: AI_VERDICT_PROMPT },
            {
              role: "user",
              content: `โดเมน: ${input.domain}
Use Case: ${input.useCase}

ข้อมูล SEO Metrics จริง:
- DA: ${metrics.da} | PA: ${metrics.pa} | DR: ${metrics.dr} | Spam Score: ${metrics.ss}
- Backlinks: ${metrics.bl} | Referring Domains: ${metrics.rf}
- Trust Flow: ${metrics.tf} | Citation Flow: ${metrics.cf}
- Indexed Pages: ${metrics.indexedPages}
- Wayback Snapshots: ${metrics.waybackSnapshots}
- First Capture: ${metrics.waybackFirstCapture || "N/A"}
- Domain Age: ${metrics.domainAge}
- Is Live: ${metrics.isLive} | Has SSL: ${metrics.hasSSL}
- Load Time: ${metrics.loadTimeMs}ms
- Health Score: ${metrics.healthScore}
- Risk Level: ${metrics.riskLevel}
- Global Rank: ${metrics.globalRank}
- Total Visits: ${metrics.totalVisits}
- Bounce Rate: ${metrics.bounceRate}
- Word Count: ${metrics.wordCount}
- Data Sources: Moz=${metrics.dataSources.moz}, Ahrefs=${metrics.dataSources.ahrefs}, SimilarWeb=${metrics.dataSources.similarweb}, Wayback=${metrics.dataSources.wayback}, Scraping=${metrics.dataSources.scraping}

ตอบเป็น JSON:
{
  "trust_score": <0-100>,
  "grade": "<A/B/C/D/F>",
  "verdict": "<STRONG_BUY/CONDITIONAL_BUY/HOLD/AVOID>",
  "risk_level": "<LOW/MED/HIGH/CRITICAL>",
  "estimated_value_usd": <number>,
  "explanations": {
    "reasons": ["เหตุผล 1", "เหตุผล 2"],
    "red_flags": ["ข้อควรระวัง 1"],
    "recommendations": ["คำแนะนำ 1"]
  }
}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "domain_verdict",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  trust_score: { type: "integer" },
                  grade: { type: "string" },
                  verdict: { type: "string" },
                  risk_level: { type: "string" },
                  estimated_value_usd: { type: "number" },
                  explanations: {
                    type: "object",
                    properties: {
                      reasons: { type: "array", items: { type: "string" } },
                      red_flags: { type: "array", items: { type: "string" } },
                      recommendations: { type: "array", items: { type: "string" } },
                    },
                    required: ["reasons", "red_flags", "recommendations"],
                    additionalProperties: false,
                  },
                },
                required: ["trust_score", "grade", "verdict", "risk_level", "estimated_value_usd", "explanations"],
                additionalProperties: false,
              },
            },
          },
        });

        const verdictContent = verdictResult.choices[0]?.message?.content;
        const verdict = typeof verdictContent === "string" ? JSON.parse(verdictContent) : null;

        // Step 3: Save everything
        await db.updateScan(scan.id, {
          status: "completed",
          trustScore: verdict?.trust_score ?? metrics.healthScore,
          grade: verdict?.grade ?? "C",
          verdict: verdict?.verdict ?? "HOLD",
          riskLevel: verdict?.risk_level ?? metrics.riskLevel.toUpperCase(),
          explanations: verdict?.explanations ?? null,
          metrics: {
            domain_age_estimate: metrics.domainAge,
            tld_quality: metrics.tld === "com" ? "HIGH" : metrics.tld === "net" || metrics.tld === "org" ? "MED" : "LOW",
            brandability: Math.round(metrics.healthScore / 10),
            seo_potential: Math.round((metrics.da + metrics.dr) / 20),
            spam_risk: metrics.ss < 20 ? "LOW" : metrics.ss < 50 ? "MED" : "HIGH",
            keyword_relevance: metrics.scrapedData?.metaKeywords?.join(', ') || 'N/A',
          },
          rawSignals: { estimated_value_usd: verdict?.estimated_value_usd ?? 0 },
          // Real SEO metrics
          da: metrics.da,
          pa: metrics.pa,
          dr: metrics.dr,
          ss: metrics.ss,
          bl: metrics.bl,
          rf: metrics.rf,
          tf: metrics.tf,
          cf: metrics.cf,
          indexedPages: metrics.indexedPages,
          waybackSnapshots: metrics.waybackSnapshots,
          waybackFirstCapture: metrics.waybackFirstCapture,
          waybackLastCapture: metrics.waybackLastCapture,
          domainAge: metrics.domainAge,
          isLive: metrics.isLive,
          hasSSL: metrics.hasSSL,
          loadTimeMs: metrics.loadTimeMs,
          healthScore: metrics.healthScore,
            globalRank: metrics.globalRank,
            totalVisits: metrics.totalVisits,
        });
      } catch (error: any) {
        console.error("[Scanner] Real metrics scan failed:", error.message);
        await db.updateScan(scan.id, { status: "failed" });
      }

      return db.getScanById(scan.id);
    }),

  // Get scan by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getScanById(input.id);
    }),

  // List user's scans
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return db.getUserScans(ctx.user.id, input?.limit ?? 50);
    }),

  // Quick Wayback check (fast, no AI)
  waybackCheck: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .query(async ({ input }) => {
      return fetchWaybackData(input.domain);
    }),

  // Re-scan all existing domains with real metrics (Moz + SimilarWeb)
  rescanAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Get all existing scans
      const allScans = await db.getUserScans(ctx.user.id, 500);
      if (!allScans || allScans.length === 0) {
        return { total: 0, updated: 0, failed: 0, results: [] };
      }

      // Get unique domains (latest scan per domain)
      const domainMap = new Map<string, typeof allScans[0]>();
      for (const scan of allScans) {
        if (!domainMap.has(scan.domain)) {
          domainMap.set(scan.domain, scan);
        }
      }

      const uniqueScans = Array.from(domainMap.values());
      let updated = 0;
      let failed = 0;
      const results: { domain: string; status: string; da?: number; ss?: number }[] = [];

      for (const scan of uniqueScans) {
        try {
          await db.updateScan(scan.id, { status: "scanning" });
          const metrics = await fetchDomainMetrics(scan.domain);

          // AI verdict
          const verdictResult = await invokeLLM({
            messages: [
              { role: "system", content: AI_VERDICT_PROMPT },
              {
                role: "user",
                content: `โดเมน: ${scan.domain}\nUse Case: ${scan.useCase || "hold_flip"}\n\nข้อมูล SEO Metrics จริง:\n- DA: ${metrics.da} | PA: ${metrics.pa} | DR: ${metrics.dr} | Spam Score: ${metrics.ss}\n- Backlinks: ${metrics.bl} | Referring Domains: ${metrics.rf}\n- Trust Flow: ${metrics.tf} | Citation Flow: ${metrics.cf}\n- Global Rank: ${metrics.globalRank} | Total Visits: ${metrics.totalVisits}\n- Is Live: ${metrics.isLive} | Has SSL: ${metrics.hasSSL}\n- Data Sources: Moz=${metrics.dataSources.moz}, SimilarWeb=${metrics.dataSources.similarweb}\n\nตอบเป็น JSON:\n{"trust_score": <0-100>, "grade": "<A-F>", "verdict": "<STRONG_BUY/CONDITIONAL_BUY/HOLD/AVOID>", "risk_level": "<LOW/MED/HIGH/CRITICAL>", "estimated_value_usd": <number>, "explanations": {"reasons": [], "red_flags": [], "recommendations": []}}`,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "domain_verdict",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    trust_score: { type: "integer" },
                    grade: { type: "string" },
                    verdict: { type: "string" },
                    risk_level: { type: "string" },
                    estimated_value_usd: { type: "number" },
                    explanations: {
                      type: "object",
                      properties: {
                        reasons: { type: "array", items: { type: "string" } },
                        red_flags: { type: "array", items: { type: "string" } },
                        recommendations: { type: "array", items: { type: "string" } },
                      },
                      required: ["reasons", "red_flags", "recommendations"],
                      additionalProperties: false,
                    },
                  },
                  required: ["trust_score", "grade", "verdict", "risk_level", "estimated_value_usd", "explanations"],
                  additionalProperties: false,
                },
              },
            },
          });

          const verdictContent = verdictResult.choices[0]?.message?.content;
          const verdict = typeof verdictContent === "string" ? JSON.parse(verdictContent) : null;

          await db.updateScan(scan.id, {
            status: "completed",
            trustScore: verdict?.trust_score ?? metrics.healthScore,
            grade: verdict?.grade ?? "C",
            verdict: verdict?.verdict ?? "HOLD",
            riskLevel: verdict?.risk_level ?? metrics.riskLevel.toUpperCase(),
            explanations: verdict?.explanations ?? null,
            metrics: {
              domain_age_estimate: metrics.domainAge,
              tld_quality: metrics.tld === "com" ? "HIGH" : metrics.tld === "net" || metrics.tld === "org" ? "MED" : "LOW",
              brandability: Math.round(metrics.healthScore / 10),
              seo_potential: Math.round((metrics.da + metrics.dr) / 20),
              spam_risk: metrics.ss < 20 ? "LOW" : metrics.ss < 50 ? "MED" : "HIGH",
            },
            rawSignals: { estimated_value_usd: verdict?.estimated_value_usd ?? 0 },
            da: metrics.da,
            pa: metrics.pa,
            dr: metrics.dr,
            ss: metrics.ss,
            bl: metrics.bl,
            rf: metrics.rf,
            tf: metrics.tf,
            cf: metrics.cf,
            indexedPages: metrics.indexedPages,
            waybackSnapshots: metrics.waybackSnapshots,
            waybackFirstCapture: metrics.waybackFirstCapture,
            waybackLastCapture: metrics.waybackLastCapture,
            domainAge: metrics.domainAge,
            isLive: metrics.isLive,
            hasSSL: metrics.hasSSL,
            loadTimeMs: metrics.loadTimeMs,
            healthScore: metrics.healthScore,
            globalRank: metrics.globalRank,
            totalVisits: metrics.totalVisits,
          });

          updated++;
          results.push({ domain: scan.domain, status: "updated", da: metrics.da, ss: metrics.ss });
        } catch (error: any) {
          console.error(`[Scanner] Re-scan failed for ${scan.domain}:`, error.message);
          await db.updateScan(scan.id, { status: "failed" });
          failed++;
          results.push({ domain: scan.domain, status: "failed" });
        }
      }

      return { total: uniqueScans.length, updated, failed, results };
    }),

  // Bulk scan with real metrics
  bulkScan: protectedProcedure
    .input(z.object({
      domains: z.array(z.string()).min(1).max(50),
      useCase: z.string().default("hold_flip"),
    }))
    .mutation(async ({ ctx, input }) => {
      const results = [];
      for (const domain of input.domains) {
        const scan = await db.createScan(ctx.user.id, domain, input.useCase);
        results.push(scan);
      }

      // Process scans in background (first 5 immediately with real metrics)
      const toProcess = results.slice(0, 5);
      for (const scan of toProcess) {
        try {
          await db.updateScan(scan.id, { status: "scanning" });
          const metrics = await fetchDomainMetrics(scan.domain);
          await db.updateScan(scan.id, {
            status: "completed",
            trustScore: metrics.healthScore,
            grade: metrics.healthScore >= 80 ? "A" : metrics.healthScore >= 60 ? "B" : metrics.healthScore >= 40 ? "C" : metrics.healthScore >= 20 ? "D" : "F",
            verdict: metrics.healthScore >= 70 ? "STRONG_BUY" : metrics.healthScore >= 50 ? "CONDITIONAL_BUY" : metrics.healthScore >= 30 ? "HOLD" : "AVOID",
            riskLevel: metrics.riskLevel.toUpperCase(),
            da: metrics.da,
            dr: metrics.dr,
            ss: metrics.ss,
            bl: metrics.bl,
            rf: metrics.rf,
            tf: metrics.tf,
            cf: metrics.cf,
            indexedPages: metrics.indexedPages,
            waybackSnapshots: metrics.waybackSnapshots,
            waybackFirstCapture: metrics.waybackFirstCapture,
            waybackLastCapture: metrics.waybackLastCapture,
            domainAge: metrics.domainAge,
            isLive: metrics.isLive,
            hasSSL: metrics.hasSSL,
            loadTimeMs: metrics.loadTimeMs,
            healthScore: metrics.healthScore,
            globalRank: metrics.globalRank,
            totalVisits: metrics.totalVisits,
          });
        } catch {
          await db.updateScan(scan.id, { status: "failed" });
        }
      }

      return { count: results.length, scanIds: results.map(r => r.id) };
    }),
});
