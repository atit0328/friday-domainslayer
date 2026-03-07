/**
 * AI SEO Analysis Engine
 * Uses LLM to evaluate domain SEO potential based on domain name characteristics,
 * GoDaddy availability data, and user-defined criteria.
 * 
 * The AI analyzes:
 * - Domain name quality (brandability, keyword relevance, length)
 * - TLD value for SEO
 * - Estimated SEO metrics (DA, DR, Spam Score, etc.)
 * - Backlink potential
 * - Market value assessment
 * - Risk factors
 */

import { invokeLLM } from "./_core/llm";

export interface SEOCriteria {
  minDA: number;
  minDR: number;
  maxSpamScore: number;
  minBacklinks: number;
  minReferringDomains: number;
  minTrustFlow: number;
  minCitationFlow: number;
  minDomainAge?: number | null;
  maxDomainAge?: number | null;
  useCase: string;
  bidStrategy: string;
  maxBidPerDomain: number;
}

export interface SEOAnalysisResult {
  // Overall score
  seoScore: number;           // 0-100
  aiVerdict: "STRONG_BUY" | "BUY" | "CONDITIONAL_BUY" | "HOLD" | "PASS";
  aiConfidence: number;       // 0-100
  aiReasoning: string;
  
  // Estimated metrics
  estimatedDA: number;
  estimatedDR: number;
  estimatedSpamScore: number;
  estimatedBacklinks: number;
  estimatedReferringDomains: number;
  estimatedTrustFlow: number;
  estimatedCitationFlow: number;
  estimatedAge: string;
  
  // Additional analysis
  brandability: number;       // 0-100
  keywordRelevance: number;   // 0-100
  tldValue: number;           // 0-100
  marketValue: number;        // Estimated market value in USD
  riskFactors: string[];
  strengths: string[];
  seoOpportunities: string[];
  
  // Price analysis
  priceVsValue: "undervalued" | "fair" | "overvalued";
  recommendedMaxBid: number;
  
  // Pass/fail against criteria
  meetsCriteria: boolean;
  criteriaDetails: {
    metric: string;
    required: number | string;
    estimated: number | string;
    pass: boolean;
  }[];
}

/**
 * Analyze a single domain for SEO value using AI
 */
export async function analyzeDomainSEO(
  domain: string,
  askPrice: number,
  available: boolean,
  criteria: SEOCriteria,
  keyword?: string,
): Promise<SEOAnalysisResult> {
  const systemPrompt = `You are an expert SEO domain analyst and domain investor. You evaluate domain names for their SEO potential, market value, and investment worthiness.

You must analyze domains based on:
1. **Domain Name Quality**: Length, memorability, brandability, keyword presence, hyphens, numbers
2. **TLD Value**: .com is king, then .net/.org, then country codes, then new gTLDs
3. **SEO Metrics Estimation**: Based on domain characteristics, estimate realistic DA, DR, Spam Score, etc.
   - For NEW/available domains: DA and DR will be 0-1 (fresh domains have no authority yet)
   - For domains with keyword value: estimate potential DA/DR after 6-12 months of SEO work
   - Spam Score for new domains: typically 1-5 (low)
4. **Backlink Potential**: How likely the domain is to attract natural backlinks
5. **Market Value**: What the domain would sell for on aftermarket
6. **Risk Assessment**: Spam history, trademark issues, penalty risk

IMPORTANT: Be realistic with metrics. A brand new available domain has DA=0, DR=0. The value is in the domain NAME itself and its SEO potential, not current metrics.

For the use case "${criteria.useCase}":
- "hold_flip": Focus on resale value and market demand
- "seo_build": Focus on keyword relevance and SEO buildability  
- "brand": Focus on brandability and memorability
- "pbn": Focus on aged domains with existing authority (new domains score low here)

Respond ONLY with valid JSON matching the exact schema provided.`;

  const userPrompt = `Analyze this domain for SEO investment potential:

**Domain**: ${domain}
**Ask Price**: $${askPrice.toFixed(2)}
**Available**: ${available ? "Yes (new registration)" : "No (aftermarket/taken)"}
**Search Keyword**: ${keyword || "N/A"}
**Use Case**: ${criteria.useCase}
**Bid Strategy**: ${criteria.bidStrategy} (conservative=strict criteria, moderate=balanced, aggressive=more lenient)

**User's Minimum Criteria**:
- Min DA: ${criteria.minDA}
- Min DR: ${criteria.minDR}
- Max Spam Score: ${criteria.maxSpamScore}
- Min Backlinks: ${criteria.minBacklinks}
- Min Referring Domains: ${criteria.minReferringDomains}
- Min Trust Flow: ${criteria.minTrustFlow}
- Min Citation Flow: ${criteria.minCitationFlow}
${criteria.minDomainAge ? `- Min Domain Age: ${criteria.minDomainAge} years` : ""}
${criteria.maxDomainAge ? `- Max Domain Age: ${criteria.maxDomainAge} years` : ""}
- Max Bid Per Domain: $${criteria.maxBidPerDomain}

Provide your analysis as JSON with this exact structure:
{
  "seoScore": <0-100>,
  "aiVerdict": "<STRONG_BUY|BUY|CONDITIONAL_BUY|HOLD|PASS>",
  "aiConfidence": <0-100>,
  "aiReasoning": "<2-3 sentence explanation>",
  "estimatedDA": <0-100>,
  "estimatedDR": <0-100>,
  "estimatedSpamScore": <0-100>,
  "estimatedBacklinks": <number>,
  "estimatedReferringDomains": <number>,
  "estimatedTrustFlow": <0-100>,
  "estimatedCitationFlow": <0-100>,
  "estimatedAge": "<e.g. 'New' or '5 years'>",
  "brandability": <0-100>,
  "keywordRelevance": <0-100>,
  "tldValue": <0-100>,
  "marketValue": <estimated USD value>,
  "riskFactors": ["<risk1>", "<risk2>"],
  "strengths": ["<strength1>", "<strength2>"],
  "seoOpportunities": ["<opportunity1>", "<opportunity2>"],
  "priceVsValue": "<undervalued|fair|overvalued>",
  "recommendedMaxBid": <USD amount>
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "seo_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              seoScore: { type: "integer", description: "Overall SEO score 0-100" },
              aiVerdict: { type: "string", enum: ["STRONG_BUY", "BUY", "CONDITIONAL_BUY", "HOLD", "PASS"] },
              aiConfidence: { type: "integer", description: "Confidence level 0-100" },
              aiReasoning: { type: "string", description: "2-3 sentence explanation" },
              estimatedDA: { type: "integer" },
              estimatedDR: { type: "integer" },
              estimatedSpamScore: { type: "integer" },
              estimatedBacklinks: { type: "integer" },
              estimatedReferringDomains: { type: "integer" },
              estimatedTrustFlow: { type: "integer" },
              estimatedCitationFlow: { type: "integer" },
              estimatedAge: { type: "string" },
              brandability: { type: "integer" },
              keywordRelevance: { type: "integer" },
              tldValue: { type: "integer" },
              marketValue: { type: "number" },
              riskFactors: { type: "array", items: { type: "string" } },
              strengths: { type: "array", items: { type: "string" } },
              seoOpportunities: { type: "array", items: { type: "string" } },
              priceVsValue: { type: "string", enum: ["undervalued", "fair", "overvalued"] },
              recommendedMaxBid: { type: "number" },
            },
            required: [
              "seoScore", "aiVerdict", "aiConfidence", "aiReasoning",
              "estimatedDA", "estimatedDR", "estimatedSpamScore",
              "estimatedBacklinks", "estimatedReferringDomains",
              "estimatedTrustFlow", "estimatedCitationFlow", "estimatedAge",
              "brandability", "keywordRelevance", "tldValue", "marketValue",
              "riskFactors", "strengths", "seoOpportunities",
              "priceVsValue", "recommendedMaxBid",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("Empty LLM response");
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

    const analysis = JSON.parse(content);

    // Evaluate against user criteria
    const criteriaDetails = evaluateCriteria(analysis, criteria);
    const meetsCriteria = criteriaDetails.every(c => c.pass);

    return {
      ...analysis,
      meetsCriteria,
      criteriaDetails,
    };
  } catch (error: any) {
    console.error("[SEO Analyzer] Failed to analyze domain:", domain, error.message);
    // Return a conservative fallback
    return createFallbackAnalysis(domain, askPrice, criteria);
  }
}

/**
 * Batch analyze multiple domains (processes sequentially to avoid rate limits)
 */
export async function batchAnalyzeDomains(
  domains: { domain: string; price: number; available: boolean }[],
  criteria: SEOCriteria,
  keyword?: string,
  maxConcurrent = 3,
): Promise<Map<string, SEOAnalysisResult>> {
  const results = new Map<string, SEOAnalysisResult>();

  // Process in batches
  for (let i = 0; i < domains.length; i += maxConcurrent) {
    const batch = domains.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map(d => analyzeDomainSEO(d.domain, d.price, d.available, criteria, keyword))
    );

    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results.set(batch[j].domain, result.value);
      } else {
        results.set(batch[j].domain, createFallbackAnalysis(batch[j].domain, batch[j].price, criteria));
      }
    }
  }

  return results;
}

/**
 * Quick pre-filter: check if domain name characteristics might pass criteria
 * (without calling LLM - for fast filtering)
 */
export function quickPreFilter(
  domain: string,
  price: number,
  criteria: SEOCriteria,
): { pass: boolean; reason?: string } {
  // Price check
  if (price > criteria.maxBidPerDomain) {
    return { pass: false, reason: `Price $${price} exceeds max bid $${criteria.maxBidPerDomain}` };
  }

  // Domain name quality checks
  const parts = domain.split(".");
  const name = parts[0];
  const tld = parts.slice(1).join(".");

  // Too long domain names are usually bad for SEO
  if (name.length > 30) {
    return { pass: false, reason: "Domain name too long (>30 chars)" };
  }

  // Excessive hyphens
  const hyphenCount = (name.match(/-/g) || []).length;
  if (hyphenCount > 2) {
    return { pass: false, reason: "Too many hyphens in domain name" };
  }

  // Numbers in domain (usually lower value)
  if (criteria.bidStrategy === "conservative" && /\d{3,}/.test(name)) {
    return { pass: false, reason: "Domain contains 3+ consecutive numbers" };
  }

  return { pass: true };
}

function evaluateCriteria(
  analysis: any,
  criteria: SEOCriteria,
): { metric: string; required: number | string; estimated: number | string; pass: boolean }[] {
  const details = [];

  // For new domains, DA/DR criteria should be evaluated against potential, not current
  // The AI already considers this in its estimates
  details.push({
    metric: "Domain Authority (DA)",
    required: criteria.minDA,
    estimated: analysis.estimatedDA,
    pass: analysis.estimatedDA >= criteria.minDA,
  });

  details.push({
    metric: "Domain Rating (DR)",
    required: criteria.minDR,
    estimated: analysis.estimatedDR,
    pass: analysis.estimatedDR >= criteria.minDR,
  });

  details.push({
    metric: "Spam Score",
    required: `≤ ${criteria.maxSpamScore}`,
    estimated: analysis.estimatedSpamScore,
    pass: analysis.estimatedSpamScore <= criteria.maxSpamScore,
  });

  details.push({
    metric: "Backlinks",
    required: criteria.minBacklinks,
    estimated: analysis.estimatedBacklinks,
    pass: analysis.estimatedBacklinks >= criteria.minBacklinks,
  });

  details.push({
    metric: "Referring Domains",
    required: criteria.minReferringDomains,
    estimated: analysis.estimatedReferringDomains,
    pass: analysis.estimatedReferringDomains >= criteria.minReferringDomains,
  });

  details.push({
    metric: "Trust Flow",
    required: criteria.minTrustFlow,
    estimated: analysis.estimatedTrustFlow,
    pass: analysis.estimatedTrustFlow >= criteria.minTrustFlow,
  });

  details.push({
    metric: "Citation Flow",
    required: criteria.minCitationFlow,
    estimated: analysis.estimatedCitationFlow,
    pass: analysis.estimatedCitationFlow >= criteria.minCitationFlow,
  });

  // Price check
  details.push({
    metric: "Price",
    required: `≤ $${criteria.maxBidPerDomain}`,
    estimated: `$${analysis.recommendedMaxBid || 0}`,
    pass: true, // Price is checked separately
  });

  return details;
}

function createFallbackAnalysis(domain: string, askPrice: number, criteria: SEOCriteria): SEOAnalysisResult {
  return {
    seoScore: 30,
    aiVerdict: "HOLD",
    aiConfidence: 20,
    aiReasoning: "Unable to perform full AI analysis. Manual review recommended.",
    estimatedDA: 0,
    estimatedDR: 0,
    estimatedSpamScore: 5,
    estimatedBacklinks: 0,
    estimatedReferringDomains: 0,
    estimatedTrustFlow: 0,
    estimatedCitationFlow: 0,
    estimatedAge: "Unknown",
    brandability: 50,
    keywordRelevance: 50,
    tldValue: 50,
    marketValue: askPrice,
    riskFactors: ["AI analysis unavailable - manual review needed"],
    strengths: [],
    seoOpportunities: [],
    priceVsValue: "fair",
    recommendedMaxBid: askPrice * 0.8,
    meetsCriteria: false,
    criteriaDetails: [{
      metric: "AI Analysis",
      required: "Complete",
      estimated: "Unavailable",
      pass: false,
    }],
  };
}
