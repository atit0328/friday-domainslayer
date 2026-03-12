import { z } from "zod";
import { router, protectedProcedure, adminProcedure, isAdminUser } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { isGoDaddyConfigured, searchMarketplace, checkAvailability, validateCredentials, purchaseDomain, getAgreements, validatePurchase } from "../godaddy";
import { analyzeDomainSEO, quickPreFilter, batchAnalyzeDomains, type SEOCriteria } from "../seo-analyzer";
import * as pbnBridge from "../pbn-bridge";
import * as pbnServices from "../pbn-services";
import * as pbnAutoSetup from "../pbn-auto-setup";

// ═══ Orders Router ═══
export const ordersRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const userId = isAdminUser(ctx.user) ? undefined : ctx.user.id;
      return db.getUserOrders(userId as any, input?.status, input?.limit ?? 50);
    }),

  create: protectedProcedure
    .input(z.object({
      domain: z.string().min(1),
      provider: z.string().min(1),
      action: z.string().default("buy_now"),
      amount: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.createOrder(ctx.user.id, input);
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateOrder(input.id, { status: "cancelled" });
      return { success: true };
    }),
});

// ═══ Auto-Bid Router (AI-Powered SEO Analysis + GoDaddy Purchase) ═══
export const autobidRouter = router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = isAdminUser(ctx.user) ? undefined : ctx.user.id;
      return db.getUserAutobidRules(userId as any);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getAutobidRuleById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().default("My Auto-Bid Rule"),
      keyword: z.string().default(""),
      tld: z.string().default(""),
      maxBidPerDomain: z.string().default("100"),
      totalBudget: z.string().min(1, "Budget is required"),
      // SEO Criteria
      minDA: z.number().min(0).max(100).default(0),
      minDR: z.number().min(0).max(100).default(0),
      maxSpamScore: z.number().min(0).max(100).default(30),
      minBacklinks: z.number().min(0).default(0),
      minReferringDomains: z.number().min(0).default(0),
      minTrustFlow: z.number().min(0).max(100).default(0),
      minCitationFlow: z.number().min(0).max(100).default(0),
      minDomainAge: z.number().optional(),
      maxDomainAge: z.number().optional(),
      preferredTLDs: z.array(z.string()).optional(),
      excludePatterns: z.array(z.string()).optional(),
      // Link type filters
      requireWikiLink: z.boolean().default(false),
      linkTypeFilters: z.array(z.string()).optional(), // ["wiki", "edu", "gov", "news", "social", "forum"]
      checkRedirect: z.boolean().default(false),
      rejectRedirects: z.boolean().default(true),
      // Strategy
      useCase: z.string().default("hold_flip"),
      bidStrategy: z.string().default("conservative"),
      autoPurchase: z.boolean().default(false),
      requireApproval: z.boolean().default(true),
      // Legacy
      minTrustScore: z.number().default(50),
      minGrade: z.string().default("C"),
      maxRisk: z.string().default("MED"),
      requiredVerdict: z.string().default("CONDITIONAL_BUY"),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.createAutobidRule(ctx.user.id, input as any);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      status: z.string().optional(),
      keyword: z.string().optional(),
      tld: z.string().optional(),
      maxBidPerDomain: z.string().optional(),
      totalBudget: z.string().optional(),
      minDA: z.number().optional(),
      minDR: z.number().optional(),
      maxSpamScore: z.number().optional(),
      minBacklinks: z.number().optional(),
      minReferringDomains: z.number().optional(),
      minTrustFlow: z.number().optional(),
      minCitationFlow: z.number().optional(),
      minDomainAge: z.number().nullable().optional(),
      maxDomainAge: z.number().nullable().optional(),
      preferredTLDs: z.array(z.string()).optional(),
      excludePatterns: z.array(z.string()).optional(),
      // Link type filters
      requireWikiLink: z.boolean().optional(),
      linkTypeFilters: z.array(z.string()).optional(),
      checkRedirect: z.boolean().optional(),
      rejectRedirects: z.boolean().optional(),
      useCase: z.string().optional(),
      bidStrategy: z.string().optional(),
      autoPurchase: z.boolean().optional(),
      requireApproval: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateAutobidRule(id, data as any);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteAutobidRule(input.id);
      return { success: true };
    }),

  // Get bid history for a rule
  bidHistory: protectedProcedure
    .input(z.object({ ruleId: z.number().optional(), limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      if (input.ruleId) {
        return db.getBidHistoryForRule(input.ruleId, input.limit);
      }
      return db.getUserBidHistory(ctx.user.id, input.limit);
    }),

  // Analyze a single domain with AI SEO engine
  analyzeDomain: protectedProcedure
    .input(z.object({
      domain: z.string().min(1),
      askPrice: z.number().default(0),
      available: z.boolean().default(true),
      ruleId: z.number().optional(),
      keyword: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get rule criteria if ruleId provided, otherwise use defaults
      let criteria: SEOCriteria;
      if (input.ruleId) {
        const rule = await db.getAutobidRuleById(input.ruleId);
        if (!rule) throw new Error("Rule not found");
        criteria = {
          minDA: rule.minDA,
          minDR: rule.minDR,
          maxSpamScore: rule.maxSpamScore,
          minBacklinks: rule.minBacklinks,
          minReferringDomains: rule.minReferringDomains,
          minTrustFlow: rule.minTrustFlow,
          minCitationFlow: rule.minCitationFlow,
          minDomainAge: rule.minDomainAge,
          maxDomainAge: rule.maxDomainAge,
          useCase: rule.useCase,
          bidStrategy: rule.bidStrategy,
          maxBidPerDomain: Number(rule.maxBidPerDomain),
        };
      } else {
        criteria = {
          minDA: 0, minDR: 0, maxSpamScore: 30, minBacklinks: 0,
          minReferringDomains: 0, minTrustFlow: 0, minCitationFlow: 0,
          useCase: "hold_flip", bidStrategy: "moderate", maxBidPerDomain: 1000,
        };
      }

      const analysis = await analyzeDomainSEO(
        input.domain, input.askPrice, input.available, criteria, input.keyword
      );

      // Save to bid history
      const entry = await db.createBidHistoryEntry(ctx.user.id, {
        ruleId: input.ruleId || 0,
        domain: input.domain,
        action: "analyzed",
        askPrice: String(input.askPrice),
        seoScore: analysis.seoScore,
        estimatedDA: analysis.estimatedDA,
        estimatedDR: analysis.estimatedDR,
        estimatedSpamScore: analysis.estimatedSpamScore,
        estimatedBacklinks: analysis.estimatedBacklinks,
        estimatedReferringDomains: analysis.estimatedReferringDomains,
        estimatedTrustFlow: analysis.estimatedTrustFlow,
        estimatedCitationFlow: analysis.estimatedCitationFlow,
        estimatedAge: analysis.estimatedAge,
        aiVerdict: analysis.aiVerdict,
        aiConfidence: analysis.aiConfidence,
        aiReasoning: analysis.aiReasoning,
        seoAnalysis: analysis as any,
        available: input.available,
        provider: "godaddy",
      } as any);

      return { id: entry.id, ...analysis };
    }),

  // Run auto-bid: search GoDaddy → AI analyze → recommend/purchase
  run: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await db.getAutobidRuleById(input.id);
      if (!rule) throw new Error("Rule not found");
      if (rule.status !== "active") throw new Error("Rule is not active");

      const budget = Number(rule.totalBudget);
      const spent = Number(rule.spent);
      const remaining = budget - spent;
      if (remaining <= 0) {
        await db.updateAutobidRule(input.id, { status: "exhausted" });
        throw new Error("Budget exhausted");
      }

      const criteria: SEOCriteria = {
        minDA: rule.minDA,
        minDR: rule.minDR,
        maxSpamScore: rule.maxSpamScore,
        minBacklinks: rule.minBacklinks,
        minReferringDomains: rule.minReferringDomains,
        minTrustFlow: rule.minTrustFlow,
        minCitationFlow: rule.minCitationFlow,
        minDomainAge: rule.minDomainAge,
        maxDomainAge: rule.maxDomainAge,
        useCase: rule.useCase,
        bidStrategy: rule.bidStrategy,
        maxBidPerDomain: Number(rule.maxBidPerDomain),
      };

      // Step 1: Search GoDaddy for domains
      let domains: { domain: string; price: number; available: boolean }[] = [];
      if (isGoDaddyConfigured() && rule.keyword) {
        try {
          const gdResults = await searchMarketplace({
            keyword: rule.keyword,
            tld: rule.tld || undefined,
            limit: 20,
          });
          domains = gdResults
            .filter(d => d.available && d.price <= Number(rule.maxBidPerDomain))
            .map(d => ({ domain: d.domain, price: d.price, available: d.available }));
        } catch (err: any) {
          console.warn("[AutoBid] GoDaddy search failed:", err.message);
        }
      }

      if (domains.length === 0) {
        await db.updateAutobidRule(input.id, { lastRunAt: new Date() });
        return {
          scanned: 0, analyzed: 0, recommended: 0, purchased: 0,
          results: [],
          message: "No available domains found matching criteria.",
        };
      }

      // Step 2: Quick pre-filter
      const preFiltered = domains.filter(d => quickPreFilter(d.domain, d.price, criteria).pass);

      // Step 3: AI SEO Analysis (batch, max 5 at a time)
      const toAnalyze = preFiltered.slice(0, 10); // Limit to 10 for cost control
      const analysisMap = await batchAnalyzeDomains(toAnalyze, criteria, rule.keyword);

      // Step 4: Evaluate results and record
      const results: any[] = [];
      let recommended = 0;
      let purchased = 0;

      for (const d of toAnalyze) {
        const analysis = analysisMap.get(d.domain);
        if (!analysis) continue;

        const action = analysis.meetsCriteria
          ? (analysis.aiVerdict === "STRONG_BUY" || analysis.aiVerdict === "BUY")
            ? "recommended"
            : "analyzed"
          : "rejected";

        if (action === "recommended") recommended++;

        // Save bid history entry
        const entry = await db.createBidHistoryEntry(ctx.user.id, {
          ruleId: rule.id,
          domain: d.domain,
          action: action as any,
          askPrice: String(d.price),
          bidAmount: action === "recommended" ? String(Math.min(d.price, Number(rule.maxBidPerDomain))) : undefined,
          seoScore: analysis.seoScore,
          estimatedDA: analysis.estimatedDA,
          estimatedDR: analysis.estimatedDR,
          estimatedSpamScore: analysis.estimatedSpamScore,
          estimatedBacklinks: analysis.estimatedBacklinks,
          estimatedReferringDomains: analysis.estimatedReferringDomains,
          estimatedTrustFlow: analysis.estimatedTrustFlow,
          estimatedCitationFlow: analysis.estimatedCitationFlow,
          estimatedAge: analysis.estimatedAge,
          aiVerdict: analysis.aiVerdict,
          aiConfidence: analysis.aiConfidence,
          aiReasoning: analysis.aiReasoning,
          seoAnalysis: analysis as any,
          available: d.available,
          provider: "godaddy",
        } as any);

        // Auto-purchase if enabled and criteria met
        if (rule.autoPurchase && !rule.requireApproval && action === "recommended" && d.price <= remaining) {
          try {
            // Attempt GoDaddy purchase
            const tld = d.domain.split(".").slice(1).join(".");
            const agreements = await getAgreements([tld]);
            const agreementKeys = agreements.map((a: any) => a.agreementKey);

            const purchaseBody = {
              domain: d.domain,
              consent: {
                agreedAt: new Date().toISOString(),
                agreedBy: ctx.user.openId,
                agreementKeys,
              },
              period: 1,
              privacy: false,
              renewAuto: false,
            };

            // Validate first
            const validation = await validatePurchase(purchaseBody);
            if (!validation.valid) {
              await db.updateBidHistory(entry.id, {
                action: "failed" as any,
                errorMessage: `Validation failed: ${JSON.stringify(validation.errors)}`,
              });
              results.push({ domain: d.domain, action: "failed", analysis, error: "Validation failed" });
              continue;
            }

            // Execute purchase
            const purchaseResult = await purchaseDomain(purchaseBody);
            purchased++;

            await db.updateBidHistory(entry.id, {
              action: "purchased" as any,
              purchaseOrderId: String(purchaseResult.orderId),
              purchaseStatus: "completed",
              bidAmount: String(purchaseResult.total / 1000000),
            });

            // Create order record
            await db.createOrder(ctx.user.id, {
              domain: d.domain,
              provider: "godaddy",
              action: "buy_now",
              amount: String(purchaseResult.total / 1000000),
            });

            results.push({ domain: d.domain, action: "purchased", analysis, orderId: purchaseResult.orderId });
          } catch (err: any) {
            await db.updateBidHistory(entry.id, {
              action: "failed" as any,
              errorMessage: err.message,
            });
            results.push({ domain: d.domain, action: "failed", analysis, error: err.message });
          }
        } else {
          results.push({ domain: d.domain, action, analysis });
        }
      }

      // Update rule stats
      await db.updateAutobidRule(input.id, {
        lastRunAt: new Date(),
        domainsScanned: (rule.domainsScanned || 0) + toAnalyze.length,
        domainsBid: (rule.domainsBid || 0) + recommended,
        domainsWon: (rule.domainsWon || 0) + purchased,
      });

      return {
        scanned: toAnalyze.length,
        analyzed: toAnalyze.length,
        recommended,
        purchased,
        results,
        message: `Scanned ${toAnalyze.length} domains, ${recommended} recommended, ${purchased} purchased.`,
      };
    }),

  // Approve a recommended domain for purchase
  approvePurchase: protectedProcedure
    .input(z.object({ bidHistoryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const history = await db.getUserBidHistory(ctx.user.id, 1000);
      const entry = history.find(h => h.id === input.bidHistoryId);
      if (!entry) throw new Error("Bid history entry not found");
      if (entry.action !== "recommended") throw new Error("Only recommended domains can be approved");

      if (!isGoDaddyConfigured()) throw new Error("GoDaddy API not configured");

      try {
        const tld = entry.domain.split(".").slice(1).join(".");
        const agreements = await getAgreements([tld]);
        const agreementKeys = agreements.map((a: any) => a.agreementKey);

        const purchaseBody = {
          domain: entry.domain,
          consent: {
            agreedAt: new Date().toISOString(),
            agreedBy: ctx.user.openId,
            agreementKeys,
          },
          period: 1,
          privacy: false,
          renewAuto: false,
        };

        const validation = await validatePurchase(purchaseBody);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${JSON.stringify(validation.errors)}`);
        }

        const purchaseResult = await purchaseDomain(purchaseBody);

        await db.updateBidHistory(input.bidHistoryId, {
          action: "purchased" as any,
          purchaseOrderId: String(purchaseResult.orderId),
          purchaseStatus: "completed",
          bidAmount: String(purchaseResult.total / 1000000),
        });

        await db.createOrder(ctx.user.id, {
          domain: entry.domain,
          provider: "godaddy",
          action: "buy_now",
          amount: String(purchaseResult.total / 1000000),
        });

        // Update rule stats if applicable
        if (entry.ruleId) {
          const rule = await db.getAutobidRuleById(entry.ruleId);
          if (rule) {
            await db.updateAutobidRule(entry.ruleId, {
              domainsWon: (rule.domainsWon || 0) + 1,
              spent: String(Number(rule.spent) + (purchaseResult.total / 1000000)),
            });
          }
        }

        return { success: true, orderId: purchaseResult.orderId, domain: entry.domain };
      } catch (err: any) {
        await db.updateBidHistory(input.bidHistoryId, {
          action: "failed" as any,
          errorMessage: err.message,
        });
        throw new Error(`Purchase failed: ${err.message}`);
      }
    }),

  // Reject a recommended domain
  rejectBid: protectedProcedure
    .input(z.object({ bidHistoryId: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateBidHistory(input.bidHistoryId, { action: "rejected" as any });
      return { success: true };
    }),
});

// ═══ Watchlist Router ═══
export const watchlistRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = isAdminUser(ctx.user) ? undefined : ctx.user.id;
      return db.getUserWatchlist(userId as any, input?.status);
    }),

  add: protectedProcedure
    .input(z.object({
      domain: z.string().min(1),
      provider: z.string().default(""),
      listingType: z.string().default("fixed"),
      initialPrice: z.string().optional(),
      currentPrice: z.string().optional(),
      targetPrice: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.addWatchlistItem(ctx.user.id, input as any);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      currentPrice: z.string().optional(),
      targetPrice: z.string().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateWatchlistItem(id, data as any);
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteWatchlistItem(input.id);
      return { success: true };
    }),

  alerts: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return db.getWatchlistAlerts(ctx.user.id, input?.limit ?? 50);
    }),
});

// ═══ PBN Router ═══
export const pbnRouter = router({
  listSites: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = isAdminUser(ctx.user) ? undefined : ctx.user.id;
      return db.getUserPbnSites(userId as any);
    }),

  addSite: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      url: z.string().min(1),
      username: z.string().min(1),
      appPassword: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.addPbnSite(ctx.user.id, input);
    }),

  updateSite: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      status: z.string().optional(),
      da: z.number().optional(),
      pa: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updatePbnSite(id, data as any);
      return { success: true };
    }),

  deleteSite: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deletePbnSite(input.id);
      return { success: true };
    }),

  // Post to PBN site using AI-generated content (with actual WordPress posting)
  post: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      targetUrl: z.string().min(1),
      anchorText: z.string().min(1),
      keyword: z.string().optional(),
      niche: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Generate content with PBN bridge
      const { title, content: articleContent, excerpt } = await pbnBridge.generatePBNContent(
        input.targetUrl, input.anchorText, input.keyword || input.anchorText, input.niche || "general", "",
      );

      // Save post record
      const post = await db.addPbnPost({
        siteId: input.siteId,
        title,
        content: articleContent,
        targetUrl: input.targetUrl,
        anchorText: input.anchorText,
        keyword: input.keyword,
        status: "pending",
      });

      // Get site credentials and try to post to WordPress
      const sites = await db.getUserPbnSites(ctx.user.id);
      const site = sites.find(s => s.id === input.siteId);

      if (site) {
        const wpResult = await pbnBridge.postToWordPress(
          site.url, site.username, site.appPassword, title, articleContent, excerpt,
        );

        if (wpResult.success) {
          // Update PBN site stats
          await db.updatePbnSite(site.id, {
            lastPost: new Date(),
            postCount: (site.postCount || 0) + 1,
          });
          return { id: post.id, title, content: articleContent, status: "published", wpPostUrl: wpResult.wpPostUrl };
        } else {
          return { id: post.id, title, content: articleContent, status: "failed", error: wpResult.error };
        }
      }

      return { id: post.id, title, content: articleContent, status: "pending" };
    }),

  // ═══ PBN-SEO Integration ═══

  // Score PBN sites for a SEO project
  scoreSites: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");
      return pbnBridge.scorePBNSites(ctx.user.id, project.domain, project.niche, project.strategy);
    }),

  // Generate anchor text plan for a project
  anchorPlan: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      linkCount: z.number().min(1).max(50).default(10),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");
      const keywords = (project.targetKeywords as string[]) || [project.domain];
      return pbnBridge.generateAnchorPlan(
        project.domain, keywords, project.niche || "general", input.linkCount, project.strategy,
      );
    }),

  // Execute full PBN backlink building campaign
  buildLinks: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      linkCount: z.number().min(1).max(20).default(5),
    }))
    .mutation(async ({ ctx, input }) => {
      return pbnBridge.executePBNBuild(ctx.user.id, input.projectId, input.linkCount);
    }),

  // Get posts for a site
  sitePosts: protectedProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input }) => {
      return db.getSitePosts(input.siteId);
    }),

  // ═══ NEW: Bulk Health Check ═══
  healthCheck: protectedProcedure
    .mutation(async ({ ctx }) => {
      return pbnServices.bulkHealthCheck(ctx.user.id);
    }),

  healthCheckSingle: protectedProcedure
    .input(z.object({ siteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sites = await db.getUserPbnSites(ctx.user.id);
      const site = sites.find((s: any) => s.id === input.siteId);
      if (!site) throw new Error("Site not found");
      const result = await pbnServices.checkSiteHealth({ id: site.id, url: site.url, name: site.name });
      await db.updatePbnSite(site.id, {
        status: result.online ? "active" : "down",
        lastCheckedAt: new Date(),
      } as any);
      return result;
    }),

  // ═══ NEW: Auto-Post Scheduler ═══
  autoPost: protectedProcedure
    .input(z.object({
      targetUrl: z.string().min(1),
      anchorText: z.string().min(1),
      keyword: z.string().default(""),
      niche: z.string().default("general"),
      siteIds: z.array(z.number()).optional(),
      count: z.number().min(1).max(50).default(5),
      contentType: z.string().default("article"),
      writingTone: z.string().default("professional"),
    }))
    .mutation(async ({ ctx, input }) => {
      return pbnServices.runAutoPost(ctx.user.id, {
        ...input,
        contentType: input.contentType,
        writingTone: input.writingTone,
      });
    }),

  // ═══ NEW: Expire Alert System ═══
  expireAlerts: protectedProcedure
    .query(async ({ ctx }) => {
      return pbnServices.checkExpireAlerts(ctx.user.id);
    }),

  sendExpireNotifications: protectedProcedure
    .mutation(async ({ ctx }) => {
      return pbnServices.sendExpireNotifications(ctx.user.id);
    }),

  // ═══ NEW: AI Auto-Update Metrics ═══
  aiUpdateMetrics: protectedProcedure
    .input(z.object({
      siteIds: z.array(z.number()).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      return pbnServices.aiUpdateMetrics(ctx.user.id, input?.siteIds);
    }),

  // ═══ NEW: Hot PBN Ranking ═══
  hotRanking: protectedProcedure
    .query(async ({ ctx }) => {
      return pbnServices.getHotPBNRanking(ctx.user.id);
    }),

  // ═══ PBN Auto-Setup Pipeline ═══

  // Run full auto-setup for a PBN site (non-blocking)
  autoSetup: adminProcedure
    .input(z.object({
      siteId: z.number(),
      niche: z.string().min(1),
      brandKeyword: z.string().min(1),
      targetUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sites = await db.getUserPbnSites(ctx.user.id);
      const site = sites.find((s: any) => s.id === input.siteId);
      if (!site) throw new Error("Site not found");
      if (!site.username || !site.appPassword) throw new Error("Missing WordPress credentials (username + application password)");

      pbnAutoSetup.startAutoSetup({
        siteId: site.id,
        siteUrl: site.url,
        siteName: site.name,
        username: site.username,
        appPassword: site.appPassword,
        niche: input.niche,
        brandKeyword: input.brandKeyword,
        targetUrl: input.targetUrl,
      });

      return { started: true, siteId: site.id, siteName: site.name };
    }),

  // Get auto-setup progress for a site
  autoSetupProgress: protectedProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input }) => {
      return pbnAutoSetup.getSetupProgress(input.siteId) || null;
    }),

  // Get all active auto-setup progresses
  autoSetupAll: protectedProcedure
    .query(async () => {
      return pbnAutoSetup.getAllSetupProgress();
    }),

  // Run individual setup steps (for retry/manual control)
  autoSetupStep: adminProcedure
    .input(z.object({
      siteId: z.number(),
      step: z.enum(["theme", "basic_settings", "plugins", "homepage", "reading_settings", "onpage_content"]),
      niche: z.string().min(1),
      brandKeyword: z.string().min(1),
      targetUrl: z.string().optional(),
      homepageId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sites = await db.getUserPbnSites(ctx.user.id);
      const site = sites.find((s: any) => s.id === input.siteId);
      if (!site) throw new Error("Site not found");

      const config: pbnAutoSetup.PBNSetupConfig = {
        siteId: site.id,
        siteUrl: site.url,
        siteName: site.name,
        username: site.username,
        appPassword: site.appPassword,
        niche: input.niche,
        brandKeyword: input.brandKeyword,
        targetUrl: input.targetUrl,
      };

      switch (input.step) {
        case "theme": return pbnAutoSetup.setupTheme(config);
        case "basic_settings": return pbnAutoSetup.setupBasicSettings(config);
        case "plugins": return pbnAutoSetup.setupPlugins(config);
        case "homepage": return pbnAutoSetup.setupHomepage(config);
        case "reading_settings":
          if (!input.homepageId) throw new Error("homepageId required for reading_settings step");
          return pbnAutoSetup.setupReadingSettings(config, input.homepageId);
        case "onpage_content": return pbnAutoSetup.setupOnPageContent(config);
      }
    }),
});

// ═══ Algorithm Intel Router ═══
export const algoRouter = router({
  // Get latest algorithm intel
  latest: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }).optional())
    .query(async ({ input }) => {
      return db.getLatestAlgoIntel(input?.limit ?? 10);
    }),

  // Scan for algorithm changes
  scan: protectedProcedure
    .mutation(async ({ ctx }) => {
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `คุณคือ Friday AI Algorithm Intelligence Monitor ปี 2026
วิเคราะห์สถานการณ์ Google Algorithm ล่าสุด ให้ข้อมูล:
1. Algorithm updates ล่าสุดที่ตรวจพบ
2. สัญญาณการเปลี่ยนแปลง ranking
3. ผลกระทบต่อ SEO strategies
4. คำแนะนำในการปรับตัว
ตอบภาษาไทย`
          },
          {
            role: "user",
            content: "สแกนและวิเคราะห์ Google Algorithm changes ล่าสุด ให้ข้อมูลครบถ้วน"
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "algo_intel",
            strict: true,
            schema: {
              type: "object",
              properties: {
                signals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      severity: { type: "string" },
                      description: { type: "string" },
                      impact: { type: "string" },
                      recommendation: { type: "string" },
                    },
                    required: ["name", "severity", "description", "impact", "recommendation"],
                    additionalProperties: false,
                  },
                },
                analysis: { type: "string" },
                overall_risk: { type: "string" },
              },
              required: ["signals", "analysis", "overall_risk"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : { signals: [], analysis: "No data", overall_risk: "UNKNOWN" };

      const intel = await db.addAlgoIntel(ctx.user.id, parsed.signals, parsed.analysis);

      return { id: intel.id, ...parsed };
    }),
});

// ═══ Marketplace Router ═══
export const marketplaceRouter = router({
  // Search marketplace — tries GoDaddy API first, falls back to AI
  search: protectedProcedure
    .input(z.object({
      keyword: z.string().optional(),
      tld: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      limit: z.number().default(20),
    }))
    .mutation(async ({ ctx, input }) => {
      let domains: any[] = [];
      let source = "ai";

      // Try GoDaddy API first if configured
      if (isGoDaddyConfigured() && input.keyword) {
        try {
          const gdResults = await searchMarketplace({
            keyword: input.keyword,
            tld: input.tld,
            limit: input.limit,
          });

          if (gdResults && gdResults.length > 0) {
            source = "godaddy";
            // Map GoDaddy results to our format and apply price filters
            domains = gdResults
              .map(r => ({
                domain: r.domain,
                price: r.price,
                provider: "godaddy",
                tld: "." + (r.domain.split(".").pop() || "com"),
                age: "New Registration",
                da: 0,
                backlinks: 0,
                listing_type: r.available ? "available" : "taken",
                available: r.available,
                currency: r.currency,
                period: r.period,
                source: "godaddy" as const,
              }))
              .filter(d => {
                if (input.minPrice && d.price < input.minPrice) return false;
                if (input.maxPrice && d.price > input.maxPrice) return false;
                return true;
              });
          }
        } catch (err: any) {
          console.warn("[Marketplace] GoDaddy API error, falling back to AI:", err.message);
          // Fall through to AI fallback
        }
      }

      // AI Fallback — if GoDaddy returned nothing or errored
      if (domains.length === 0) {
        source = "ai";
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `คุณคือ DomainSlayer Marketplace AI ปี 2026
สร้างรายการโดเมนที่น่าสนใจจาก marketplace ตาม criteria ที่ระบุ
ให้ข้อมูลที่สมจริง realistic pricing และ metrics`
            },
            {
              role: "user",
              content: `ค้นหาโดเมนใน marketplace:
${input.keyword ? `Keyword: ${input.keyword}` : ""}
${input.tld ? `TLD: ${input.tld}` : ""}
${input.minPrice ? `Min Price: $${input.minPrice}` : ""}
${input.maxPrice ? `Max Price: $${input.maxPrice}` : ""}
Limit: ${input.limit}

ตอบเป็น JSON array ของโดเมน แต่ละตัวมี: domain, price, provider, tld, age, da, backlinks, listing_type`
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "marketplace_results",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  domains: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        domain: { type: "string" },
                        price: { type: "number" },
                        provider: { type: "string" },
                        tld: { type: "string" },
                        age: { type: "string" },
                        da: { type: "integer" },
                        backlinks: { type: "integer" },
                        listing_type: { type: "string" },
                      },
                      required: ["domain", "price", "provider", "tld", "age", "da", "backlinks", "listing_type"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["domains"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = result.choices[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : { domains: [] };
        domains = (parsed.domains || []).map((d: any) => ({ ...d, source: "ai", available: true }));
      }

      // Save search
      await db.saveMarketplaceSearch(ctx.user.id, {
        keyword: input.keyword,
        tld: input.tld,
        minPrice: input.minPrice?.toString(),
        maxPrice: input.maxPrice?.toString(),
        results: domains as any,
        resultCount: domains.length,
      });

      return { domains, source };
    }),

  // Check single domain availability via GoDaddy
  checkDomain: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .mutation(async ({ input }) => {
      if (!isGoDaddyConfigured()) {
        return { available: null, domain: input.domain, price: null, message: "GoDaddy API not configured" };
      }
      try {
        const result = await checkAvailability(input.domain, "FAST");
        return {
          available: result.available,
          domain: result.domain,
          price: result.price ? result.price / 1000000 : null,
          currency: result.currency || "USD",
          period: result.period || 1,
          definitive: result.definitive,
        };
      } catch (err: any) {
        return { available: null, domain: input.domain, price: null, message: err.message };
      }
    }),

  // Check GoDaddy API status
  apiStatus: protectedProcedure
    .query(async () => {
      if (!isGoDaddyConfigured()) {
        return { configured: false, valid: false, message: "GoDaddy API keys not set" };
      }
      const result = await validateCredentials();
      return { configured: true, ...result };
    }),
});

// ═══ Dashboard Stats Router ═══
export const dashboardRouter = router({
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = isAdminUser(ctx.user) ? undefined : ctx.user.id;
      return db.getDashboardStats(userId as any);
    }),
});
