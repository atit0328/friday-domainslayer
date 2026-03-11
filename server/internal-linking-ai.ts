/**
 * Internal Linking AI — Build Topical Authority via AI-Driven Link Structure
 *
 * Creates an intelligent internal linking network between:
 *   - Parasite pages (Telegraph, Web2.0)
 *   - Target domain pages
 *   - Entity stack pages
 *
 * Features:
 *   - Topical Cluster Mapping: groups content by topic/intent
 *   - Hub & Spoke Model: pillar pages link to cluster pages and vice versa
 *   - Link Equity Distribution: AI optimizes PageRank flow to priority pages
 *   - Anchor Text Optimization: natural anchor text distribution
 *   - Cross-Platform Linking: links between parasite platforms
 *   - Contextual Link Placement: AI finds natural insertion points
 */

import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface ContentNode {
  id: string;
  url: string;
  title: string;
  keyword: string;
  type: "pillar" | "cluster" | "parasite" | "entity" | "target";
  platform: string; // e.g. "telegraph", "target-domain", "web2.0"
  topicCluster: string;
  pageAuthority: number; // estimated 0-100
  existingInboundLinks: number;
  existingOutboundLinks: number;
  content?: string; // optional content for contextual placement
}

export interface InternalLink {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  anchorText: string;
  anchorType: "exact" | "partial" | "branded" | "generic" | "naked" | "contextual";
  placement: "in-content" | "sidebar" | "footer" | "navigation" | "related-posts";
  priority: number; // 1-10
  linkEquityWeight: number; // 0-1 (how much equity this link passes)
  created: Date;
  verified: boolean;
}

export interface TopicCluster {
  id: string;
  name: string;
  pillarKeyword: string;
  pillarNodeId: string | null;
  clusterKeywords: string[];
  clusterNodeIds: string[];
  linkDensity: number; // links per node
  equityScore: number; // total accumulated equity
}

export interface LinkingStrategy {
  domain: string;
  clusters: TopicCluster[];
  nodes: ContentNode[];
  links: InternalLink[];
  totalLinks: number;
  avgLinksPerNode: number;
  equityDistribution: Record<string, number>; // nodeId → equity score
  generatedAt: Date;
}

export interface LinkingConfig {
  domain: string;
  maxLinksPerPage: number;
  minLinksPerPage: number;
  anchorDistribution: {
    exact: number;    // % of exact match anchors
    partial: number;  // % of partial match
    branded: number;  // % of brand name
    generic: number;  // % of "click here", "read more"
    contextual: number; // % of contextual/natural
  };
  priorityPages: string[]; // URLs that should receive most equity
  enableCrossPlatform: boolean;
  enableContextualPlacement: boolean;
  hubSpokeModel: boolean;
}

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

const strategies = new Map<string, LinkingStrategy>();
const linkHistory: Array<{ domain: string; linksCreated: number; timestamp: Date }> = [];

// ═══════════════════════════════════════════════
//  GETTERS
// ═══════════════════════════════════════════════

export function getStrategy(domain: string): LinkingStrategy | null {
  return strategies.get(domain) || null;
}

export function getAllStrategies(): LinkingStrategy[] {
  return Array.from(strategies.values());
}

export function getLinkingSummary(): {
  totalDomains: number;
  totalNodes: number;
  totalLinks: number;
  totalClusters: number;
  avgLinksPerNode: number;
} {
  let totalNodes = 0;
  let totalLinks = 0;
  let totalClusters = 0;

  Array.from(strategies.values()).forEach(s => {
    totalNodes += s.nodes.length;
    totalLinks += s.links.length;
    totalClusters += s.clusters.length;
  });

  return {
    totalDomains: strategies.size,
    totalNodes,
    totalLinks,
    totalClusters,
    avgLinksPerNode: totalNodes > 0 ? totalLinks / totalNodes : 0,
  };
}

// ═══════════════════════════════════════════════
//  TOPIC CLUSTER MAPPING
// ═══════════════════════════════════════════════

/**
 * AI groups keywords into topical clusters
 */
export async function buildTopicClusters(
  keywords: string[],
  niche: string = "gambling",
): Promise<TopicCluster[]> {
  if (keywords.length === 0) return [];

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO expert specializing in topical authority. Group the following keywords into topical clusters. Each cluster should have a pillar keyword (main topic) and cluster keywords (subtopics). Group by search intent and topic similarity. Return JSON.`,
        },
        {
          role: "user",
          content: `Niche: ${niche}\nKeywords to cluster:\n${keywords.map((k, i) => `${i + 1}. ${k}`).join("\n")}\n\nGroup into 2-5 topical clusters.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "topic_clusters",
          strict: true,
          schema: {
            type: "object",
            properties: {
              clusters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Cluster name" },
                    pillarKeyword: { type: "string", description: "Main pillar keyword" },
                    clusterKeywords: {
                      type: "array",
                      items: { type: "string" },
                      description: "Supporting cluster keywords",
                    },
                  },
                  required: ["name", "pillarKeyword", "clusterKeywords"],
                  additionalProperties: false,
                },
              },
            },
            required: ["clusters"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) || "{}";
    const parsed = JSON.parse(content);

    return (parsed.clusters || []).map((c: any, i: number) => ({
      id: `cluster_${Date.now()}_${i}`,
      name: c.name,
      pillarKeyword: c.pillarKeyword,
      pillarNodeId: null,
      clusterKeywords: c.clusterKeywords || [],
      clusterNodeIds: [],
      linkDensity: 0,
      equityScore: 0,
    }));
  } catch (err: any) {
    console.error("[InternalLinkingAI] Cluster building failed:", err.message);
    // Fallback: one cluster per keyword
    return keywords.slice(0, 5).map((k, i) => ({
      id: `cluster_${Date.now()}_${i}`,
      name: k,
      pillarKeyword: k,
      pillarNodeId: null,
      clusterKeywords: [k],
      clusterNodeIds: [],
      linkDensity: 0,
      equityScore: 0,
    }));
  }
}

// ═══════════════════════════════════════════════
//  ANCHOR TEXT GENERATION
// ═══════════════════════════════════════════════

/**
 * AI generates natural anchor text variations
 */
export async function generateAnchorTexts(
  keyword: string,
  count: number = 10,
): Promise<Array<{ text: string; type: InternalLink["anchorType"] }>> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Generate ${count} anchor text variations for the keyword "${keyword}". Include a mix of: exact match, partial match, branded, generic ("click here", "learn more"), and contextual (natural sentence fragments). Return JSON array.`,
        },
        {
          role: "user",
          content: `Keyword: "${keyword}"\nGenerate ${count} diverse anchor texts.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "anchor_texts",
          strict: true,
          schema: {
            type: "object",
            properties: {
              anchors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    type: {
                      type: "string",
                      enum: ["exact", "partial", "branded", "generic", "contextual"],
                    },
                  },
                  required: ["text", "type"],
                  additionalProperties: false,
                },
              },
            },
            required: ["anchors"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) || "{}";
    const parsed = JSON.parse(content);

    return (parsed.anchors || []).map((a: any) => ({
      text: a.text,
      type: a.type as InternalLink["anchorType"],
    }));
  } catch (err: any) {
    console.error("[InternalLinkingAI] Anchor generation failed:", err.message);
    return [
      { text: keyword, type: "exact" as const },
      { text: `about ${keyword}`, type: "partial" as const },
      { text: "read more", type: "generic" as const },
      { text: "click here for details", type: "generic" as const },
      { text: `learn about ${keyword} here`, type: "contextual" as const },
    ];
  }
}

// ═══════════════════════════════════════════════
//  LINK EQUITY CALCULATOR
// ═══════════════════════════════════════════════

/**
 * Calculate link equity distribution using simplified PageRank
 */
export function calculateEquityDistribution(
  nodes: ContentNode[],
  links: InternalLink[],
  iterations: number = 10,
  dampingFactor: number = 0.85,
): Record<string, number> {
  const equity: Record<string, number> = {};
  const nodeCount = nodes.length;

  if (nodeCount === 0) return equity;

  // Initialize equal equity
  for (const node of nodes) {
    equity[node.id] = 1 / nodeCount;
  }

  // Build adjacency: sourceId → targetIds
  const outLinks = new Map<string, string[]>();
  for (const link of links) {
    const existing = outLinks.get(link.sourceNodeId) || [];
    existing.push(link.targetNodeId);
    outLinks.set(link.sourceNodeId, existing);
  }

  // Iterate PageRank
  for (let iter = 0; iter < iterations; iter++) {
    const newEquity: Record<string, number> = {};

    for (const node of nodes) {
      let incomingEquity = 0;

      // Sum equity from all nodes linking to this node
      for (const link of links) {
        if (link.targetNodeId === node.id) {
          const sourceOutCount = (outLinks.get(link.sourceNodeId) || []).length;
          if (sourceOutCount > 0) {
            incomingEquity += (equity[link.sourceNodeId] || 0) / sourceOutCount;
          }
        }
      }

      newEquity[node.id] = (1 - dampingFactor) / nodeCount + dampingFactor * incomingEquity;
    }

    // Update equity
    for (const node of nodes) {
      equity[node.id] = newEquity[node.id] || 0;
    }
  }

  return equity;
}

// ═══════════════════════════════════════════════
//  LINK GENERATION
// ═══════════════════════════════════════════════

/**
 * Generate internal links between nodes based on cluster relationships
 */
export async function generateInternalLinks(
  nodes: ContentNode[],
  clusters: TopicCluster[],
  config: LinkingConfig,
): Promise<InternalLink[]> {
  const links: InternalLink[] = [];
  const linkCount = new Map<string, { inbound: number; outbound: number }>();

  // Initialize counts
  for (const node of nodes) {
    linkCount.set(node.id, { inbound: 0, outbound: 0 });
  }

  // 1. Hub & Spoke: Pillar → Cluster links
  if (config.hubSpokeModel) {
    for (const cluster of clusters) {
      const pillarNode = nodes.find(n =>
        n.keyword.toLowerCase() === cluster.pillarKeyword.toLowerCase() &&
        (n.type === "pillar" || n.type === "target")
      );

      if (pillarNode) {
        cluster.pillarNodeId = pillarNode.id;

        // Pillar links to each cluster node
        const clusterNodes = nodes.filter(n =>
          cluster.clusterKeywords.some(ck =>
            n.keyword.toLowerCase().includes(ck.toLowerCase())
          ) && n.id !== pillarNode.id
        );

        for (const clusterNode of clusterNodes) {
          cluster.clusterNodeIds.push(clusterNode.id);
          const counts = linkCount.get(pillarNode.id)!;
          if (counts.outbound < config.maxLinksPerPage) {
            const anchorType = selectAnchorType(config.anchorDistribution);
            links.push({
              id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              sourceNodeId: pillarNode.id,
              targetNodeId: clusterNode.id,
              anchorText: generateSimpleAnchor(clusterNode.keyword, anchorType),
              anchorType,
              placement: "in-content",
              priority: 8,
              linkEquityWeight: 0.8,
              created: new Date(),
              verified: false,
            });
            counts.outbound++;
            linkCount.get(clusterNode.id)!.inbound++;
          }

          // Cluster links back to pillar
          const clusterCounts = linkCount.get(clusterNode.id)!;
          if (clusterCounts.outbound < config.maxLinksPerPage) {
            links.push({
              id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              sourceNodeId: clusterNode.id,
              targetNodeId: pillarNode.id,
              anchorText: generateSimpleAnchor(pillarNode.keyword, "partial"),
              anchorType: "partial",
              placement: "in-content",
              priority: 9,
              linkEquityWeight: 0.9,
              created: new Date(),
              verified: false,
            });
            clusterCounts.outbound++;
            linkCount.get(pillarNode.id)!.inbound++;
          }
        }
      }
    }
  }

  // 2. Cross-cluster links (connect different clusters)
  if (config.enableCrossPlatform && clusters.length > 1) {
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const clusterA = clusters[i];
        const clusterB = clusters[j];

        // Pick one node from each cluster to cross-link
        const nodeA = nodes.find(n => n.topicCluster === clusterA.name);
        const nodeB = nodes.find(n => n.topicCluster === clusterB.name);

        if (nodeA && nodeB) {
          const countsA = linkCount.get(nodeA.id)!;
          const countsB = linkCount.get(nodeB.id)!;

          if (countsA.outbound < config.maxLinksPerPage) {
            links.push({
              id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              sourceNodeId: nodeA.id,
              targetNodeId: nodeB.id,
              anchorText: generateSimpleAnchor(nodeB.keyword, "contextual"),
              anchorType: "contextual",
              placement: "related-posts",
              priority: 5,
              linkEquityWeight: 0.5,
              created: new Date(),
              verified: false,
            });
            countsA.outbound++;
            countsB.inbound++;
          }
        }
      }
    }
  }

  // 3. Priority page boosting — extra links to priority URLs
  for (const priorityUrl of config.priorityPages) {
    const priorityNode = nodes.find(n => n.url === priorityUrl);
    if (!priorityNode) continue;

    // Find nodes not yet linking to priority
    const linkingToTarget = new Set(
      links.filter(l => l.targetNodeId === priorityNode.id).map(l => l.sourceNodeId)
    );

    const potentialSources = nodes.filter(n =>
      n.id !== priorityNode.id &&
      !linkingToTarget.has(n.id) &&
      (linkCount.get(n.id)?.outbound || 0) < config.maxLinksPerPage
    );

    // Add up to 3 extra links to priority page
    for (const source of potentialSources.slice(0, 3)) {
      links.push({
        id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sourceNodeId: source.id,
        targetNodeId: priorityNode.id,
        anchorText: generateSimpleAnchor(priorityNode.keyword, "partial"),
        anchorType: "partial",
        placement: "in-content",
        priority: 10,
        linkEquityWeight: 0.95,
        created: new Date(),
        verified: false,
      });
      linkCount.get(source.id)!.outbound++;
      linkCount.get(priorityNode.id)!.inbound++;
    }
  }

  // 4. Ensure minimum links per page
  for (const node of nodes) {
    const counts = linkCount.get(node.id)!;
    if (counts.outbound < config.minLinksPerPage) {
      // Find nodes in same cluster not yet linked
      const sameCluster = nodes.filter(n =>
        n.topicCluster === node.topicCluster &&
        n.id !== node.id &&
        !links.some(l => l.sourceNodeId === node.id && l.targetNodeId === n.id)
      );

      const needed = config.minLinksPerPage - counts.outbound;
      for (const target of sameCluster.slice(0, needed)) {
        links.push({
          id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          sourceNodeId: node.id,
          targetNodeId: target.id,
          anchorText: generateSimpleAnchor(target.keyword, "contextual"),
          anchorType: "contextual",
          placement: "in-content",
          priority: 4,
          linkEquityWeight: 0.6,
          created: new Date(),
          verified: false,
        });
        counts.outbound++;
        linkCount.get(target.id)!.inbound++;
      }
    }
  }

  return links;
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function selectAnchorType(
  distribution: LinkingConfig["anchorDistribution"],
): InternalLink["anchorType"] {
  const rand = Math.random() * 100;
  let cumulative = 0;

  cumulative += distribution.exact;
  if (rand < cumulative) return "exact";

  cumulative += distribution.partial;
  if (rand < cumulative) return "partial";

  cumulative += distribution.branded;
  if (rand < cumulative) return "branded";

  cumulative += distribution.generic;
  if (rand < cumulative) return "generic";

  return "contextual";
}

function generateSimpleAnchor(keyword: string, type: InternalLink["anchorType"]): string {
  switch (type) {
    case "exact":
      return keyword;
    case "partial":
      return `best ${keyword}`;
    case "branded":
      return keyword.split(" ")[0] || keyword;
    case "generic":
      const generics = ["read more", "learn more", "click here", "find out more", "see details"];
      return generics[Math.floor(Math.random() * generics.length)];
    case "contextual":
      return `learn about ${keyword}`;
    case "naked":
      return keyword;
    default:
      return keyword;
  }
}

// ═══════════════════════════════════════════════
//  FULL LINKING PIPELINE
// ═══════════════════════════════════════════════

/**
 * Build complete internal linking strategy for a domain
 */
export async function buildLinkingStrategy(
  domain: string,
  contentNodes: ContentNode[],
  keywords: string[],
  config: LinkingConfig,
): Promise<LinkingStrategy> {
  console.log(`[InternalLinkingAI] Building strategy for ${domain} — ${contentNodes.length} nodes, ${keywords.length} keywords`);

  // 1. Build topic clusters
  const clusters = await buildTopicClusters(keywords);

  // 2. Assign nodes to clusters
  for (const node of contentNodes) {
    const matchingCluster = clusters.find(c =>
      c.pillarKeyword.toLowerCase() === node.keyword.toLowerCase() ||
      c.clusterKeywords.some(ck => node.keyword.toLowerCase().includes(ck.toLowerCase()))
    );
    if (matchingCluster) {
      node.topicCluster = matchingCluster.name;
    } else if (clusters.length > 0) {
      // Assign to first cluster as fallback
      node.topicCluster = clusters[0].name;
    }
  }

  // 3. Generate internal links
  const links = await generateInternalLinks(contentNodes, clusters, config);

  // 4. Calculate equity distribution
  const equityDistribution = calculateEquityDistribution(contentNodes, links);

  // 5. Update cluster stats
  for (const cluster of clusters) {
    const clusterLinks = links.filter(l => {
      const sourceNode = contentNodes.find(n => n.id === l.sourceNodeId);
      return sourceNode?.topicCluster === cluster.name;
    });
    cluster.linkDensity = cluster.clusterNodeIds.length > 0
      ? clusterLinks.length / cluster.clusterNodeIds.length
      : 0;

    cluster.equityScore = cluster.clusterNodeIds.reduce(
      (sum, id) => sum + (equityDistribution[id] || 0),
      0,
    );
  }

  const strategy: LinkingStrategy = {
    domain,
    clusters,
    nodes: contentNodes,
    links,
    totalLinks: links.length,
    avgLinksPerNode: contentNodes.length > 0 ? links.length / contentNodes.length : 0,
    equityDistribution,
    generatedAt: new Date(),
  };

  strategies.set(domain, strategy);
  linkHistory.push({
    domain,
    linksCreated: links.length,
    timestamp: new Date(),
  });

  console.log(`[InternalLinkingAI] Strategy built: ${links.length} links across ${clusters.length} clusters`);

  return strategy;
}

/**
 * Create default linking config
 */
export function createDefaultLinkingConfig(
  domain: string,
  priorityPages: string[] = [],
): LinkingConfig {
  return {
    domain,
    maxLinksPerPage: 8,
    minLinksPerPage: 2,
    anchorDistribution: {
      exact: 15,
      partial: 30,
      branded: 10,
      generic: 15,
      contextual: 30,
    },
    priorityPages,
    enableCrossPlatform: true,
    enableContextualPlacement: true,
    hubSpokeModel: true,
  };
}

/**
 * Generate link insertion HTML for a content page
 */
export function generateLinkInsertionHtml(
  nodeId: string,
  strategy: LinkingStrategy,
): string {
  const outboundLinks = strategy.links.filter(l => l.sourceNodeId === nodeId);
  if (outboundLinks.length === 0) return "";

  const lines: string[] = [];
  lines.push('<div class="internal-links" style="margin-top: 20px; padding: 15px; border-top: 1px solid #eee;">');
  lines.push('<h3>Related Articles</h3>');
  lines.push("<ul>");

  for (const link of outboundLinks) {
    const targetNode = strategy.nodes.find(n => n.id === link.targetNodeId);
    if (targetNode) {
      lines.push(`  <li><a href="${targetNode.url}" title="${targetNode.title}">${link.anchorText}</a></li>`);
    }
  }

  lines.push("</ul>");
  lines.push("</div>");

  return lines.join("\n");
}

/**
 * Get linking recommendations for a specific page
 */
export function getLinkRecommendations(
  nodeId: string,
  strategy: LinkingStrategy,
): Array<{
  targetUrl: string;
  targetTitle: string;
  suggestedAnchor: string;
  anchorType: string;
  priority: number;
  equityGain: number;
}> {
  const outboundLinks = strategy.links.filter(l => l.sourceNodeId === nodeId);

  return outboundLinks.map(link => {
    const targetNode = strategy.nodes.find(n => n.id === link.targetNodeId);
    return {
      targetUrl: targetNode?.url || "",
      targetTitle: targetNode?.title || "",
      suggestedAnchor: link.anchorText,
      anchorType: link.anchorType,
      priority: link.priority,
      equityGain: strategy.equityDistribution[link.targetNodeId] || 0,
    };
  }).sort((a, b) => b.priority - a.priority);
}
