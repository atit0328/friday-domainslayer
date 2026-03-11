import { describe, it, expect } from "vitest";

describe("Schema Markup Injector", () => {
  it("should generate Article schema with valid JSON-LD structure", async () => {
    const { generateArticleSchema } = await import("./schema-markup-injector");
    
    const schema = await generateArticleSchema(
      "Best Online Casinos 2026",
      "Comprehensive guide to the best online casinos",
      "https://example.com/best-casinos",
      "best online casinos",
      "Editorial Team",
      "Casino Guide",
    );

    expect(schema).toBeDefined();
    expect(schema.type).toBe("Article");
    expect(schema.jsonLd["@context"]).toBe("https://schema.org");
    expect(schema.jsonLd["@type"]).toBe("Article");
    expect(schema.jsonLd.headline).toBe("Best Online Casinos 2026");
    expect(schema.jsonLd.datePublished).toBeDefined();
    expect(schema.jsonLd.author).toBeDefined();
    expect(schema.jsonLd.author.name).toBe("Editorial Team");
    expect(schema.validated).toBe(true);
  });

  it("should generate Breadcrumb schema with correct structure", async () => {
    const { generateBreadcrumbSchema } = await import("./schema-markup-injector");

    const schema = generateBreadcrumbSchema(
      [
        { name: "Home", url: "https://example.com" },
        { name: "Casinos", url: "https://example.com/casinos" },
        { name: "Reviews", url: "https://example.com/casinos/reviews" },
      ],
      "https://example.com/casinos/reviews",
      "casino reviews",
    );

    expect(schema.type).toBe("BreadcrumbList");
    expect(schema.jsonLd["@type"]).toBe("BreadcrumbList");
    expect(schema.jsonLd.itemListElement).toHaveLength(3);
    expect(schema.jsonLd.itemListElement[0].position).toBe(1);
    expect(schema.jsonLd.itemListElement[2].name).toBe("Reviews");
    expect(schema.validated).toBe(true);
  });

  it("should generate Organization schema", async () => {
    const { generateOrganizationSchema } = await import("./schema-markup-injector");

    const schema = generateOrganizationSchema({
      domain: "example.com",
      keywords: ["casino"],
      brandName: "CasinoGuide",
      brandDescription: "Your trusted casino guide",
      brandLogo: "https://example.com/logo.png",
      enableFAQ: true,
      enableHowTo: true,
      enableArticle: true,
      enableBreadcrumb: true,
      enableOrganization: true,
      enableLocalBusiness: false,
      enableSearchAction: true,
    });

    expect(schema.type).toBe("Organization");
    expect(schema.jsonLd["@type"]).toBe("Organization");
    expect(schema.jsonLd.name).toBe("CasinoGuide");
    expect(schema.jsonLd.description).toBe("Your trusted casino guide");
    expect(schema.jsonLd.logo.url).toBe("https://example.com/logo.png");
  });

  it("should generate SearchAction schema", async () => {
    const { generateSearchActionSchema } = await import("./schema-markup-injector");

    const schema = generateSearchActionSchema("example.com");

    expect(schema.type).toBe("SearchAction");
    expect(schema.jsonLd["@type"]).toBe("WebSite");
    expect(schema.jsonLd.url).toBe("https://example.com");
    expect(schema.jsonLd.potentialAction["@type"]).toBe("SearchAction");
    expect(schema.jsonLd.potentialAction["query-input"]).toContain("search_term_string");
  });

  it("should generate WebPage schema", async () => {
    const { generateWebPageSchema } = await import("./schema-markup-injector");

    const schema = generateWebPageSchema(
      "Casino Reviews",
      "Best casino reviews online",
      "https://example.com/reviews",
      "casino reviews",
    );

    expect(schema.type).toBe("WebPage");
    expect(schema.jsonLd["@type"]).toBe("WebPage");
    expect(schema.jsonLd.name).toBe("Casino Reviews");
    expect(schema.jsonLd.url).toBe("https://example.com/reviews");
  });

  it("should convert schema to HTML script tag", async () => {
    const { generateWebPageSchema, schemaToHtml } = await import("./schema-markup-injector");

    const schema = generateWebPageSchema("Test", "Test desc", "https://test.com", "test");
    const html = schemaToHtml(schema);

    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain("</script>");
    expect(html).toContain('"@context": "https://schema.org"');
    expect(html).toContain('"@type": "WebPage"');
  });

  it("should inject schemas into HTML before </head>", async () => {
    const { generateWebPageSchema, injectSchemasIntoHtml } = await import("./schema-markup-injector");

    const schema = generateWebPageSchema("Test", "Test desc", "https://test.com", "test");
    const html = "<html><head><title>Test</title></head><body>Content</body></html>";
    const result = injectSchemasIntoHtml(html, [schema]);

    expect(result).toContain('<script type="application/ld+json">');
    expect(result.indexOf("application/ld+json")).toBeLessThan(result.indexOf("</head>"));
  });

  it("should validate schemas correctly", async () => {
    const { validateSchema } = await import("./schema-markup-injector");

    // Valid schema
    const validSchema = {
      id: "test",
      type: "Article" as const,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Test Article",
        datePublished: new Date().toISOString(),
        author: { "@type": "Person", name: "Test" },
      },
      targetUrl: "https://test.com",
      keyword: "test",
      generatedAt: new Date(),
      validated: true,
      validationErrors: [],
    };

    const errors = validateSchema(validSchema);
    expect(errors).toHaveLength(0);

    // Invalid schema (missing headline)
    const invalidSchema = {
      ...validSchema,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        datePublished: new Date().toISOString(),
        author: { "@type": "Person", name: "Test" },
      },
    };

    const errors2 = validateSchema(invalidSchema);
    expect(errors2.length).toBeGreaterThan(0);
  });

  it("should create default config", async () => {
    const { createDefaultConfig } = await import("./schema-markup-injector");

    const config = createDefaultConfig("example.com", "TestBrand", ["keyword1", "keyword2"]);

    expect(config.domain).toBe("example.com");
    expect(config.brandName).toBe("TestBrand");
    expect(config.keywords).toHaveLength(2);
    expect(config.enableFAQ).toBe(true);
    expect(config.enableArticle).toBe(true);
    expect(config.enableBreadcrumb).toBe(true);
  });

  it("should get schema summary", async () => {
    const { getSchemaSummary } = await import("./schema-markup-injector");

    const summary = getSchemaSummary();
    expect(summary).toHaveProperty("totalSchemas");
    expect(summary).toHaveProperty("byType");
    expect(summary).toHaveProperty("domains");
    expect(summary).toHaveProperty("validated");
  });

  it("should generate LocalBusiness schema with geo data", async () => {
    const { generateLocalBusinessSchema } = await import("./schema-markup-injector");

    const schema = generateLocalBusinessSchema({
      domain: "example.com",
      keywords: ["casino"],
      brandName: "Local Casino",
      geo: {
        latitude: 13.7563,
        longitude: 100.5018,
        region: "Bangkok",
        city: "Bangkok",
      },
      enableFAQ: true,
      enableHowTo: true,
      enableArticle: true,
      enableBreadcrumb: true,
      enableOrganization: true,
      enableLocalBusiness: true,
      enableSearchAction: true,
    });

    expect(schema.type).toBe("LocalBusiness");
    expect(schema.jsonLd.geo).toBeDefined();
    expect(schema.jsonLd.geo.latitude).toBe(13.7563);
    expect(schema.jsonLd.address).toBeDefined();
    expect(schema.jsonLd.address.addressLocality).toBe("Bangkok");
  });
});

describe("Internal Linking AI", () => {
  it("should create default linking config", async () => {
    const { createDefaultLinkingConfig } = await import("./internal-linking-ai");

    const config = createDefaultLinkingConfig("example.com", ["https://example.com/main"]);

    expect(config.domain).toBe("example.com");
    expect(config.maxLinksPerPage).toBe(8);
    expect(config.minLinksPerPage).toBe(2);
    expect(config.hubSpokeModel).toBe(true);
    expect(config.enableCrossPlatform).toBe(true);
    expect(config.priorityPages).toHaveLength(1);
    expect(config.anchorDistribution.exact).toBe(15);
    expect(config.anchorDistribution.partial).toBe(30);
  });

  it("should calculate equity distribution with simplified PageRank", async () => {
    const { calculateEquityDistribution } = await import("./internal-linking-ai");
    const { ContentNode, InternalLink } = await import("./internal-linking-ai");

    const nodes = [
      { id: "a", url: "https://a.com", title: "A", keyword: "a", type: "pillar" as const, platform: "telegraph", topicCluster: "main", pageAuthority: 90, existingInboundLinks: 0, existingOutboundLinks: 0 },
      { id: "b", url: "https://b.com", title: "B", keyword: "b", type: "cluster" as const, platform: "telegraph", topicCluster: "main", pageAuthority: 80, existingInboundLinks: 0, existingOutboundLinks: 0 },
      { id: "c", url: "https://c.com", title: "C", keyword: "c", type: "cluster" as const, platform: "telegraph", topicCluster: "main", pageAuthority: 70, existingInboundLinks: 0, existingOutboundLinks: 0 },
    ];

    const links = [
      { id: "l1", sourceNodeId: "a", targetNodeId: "b", anchorText: "test", anchorType: "exact" as const, placement: "in-content" as const, priority: 8, linkEquityWeight: 0.8, created: new Date(), verified: false },
      { id: "l2", sourceNodeId: "a", targetNodeId: "c", anchorText: "test", anchorType: "exact" as const, placement: "in-content" as const, priority: 8, linkEquityWeight: 0.8, created: new Date(), verified: false },
      { id: "l3", sourceNodeId: "b", targetNodeId: "a", anchorText: "test", anchorType: "partial" as const, placement: "in-content" as const, priority: 9, linkEquityWeight: 0.9, created: new Date(), verified: false },
    ];

    const equity = calculateEquityDistribution(nodes, links, 10);

    expect(equity).toHaveProperty("a");
    expect(equity).toHaveProperty("b");
    expect(equity).toHaveProperty("c");
    // Node A should have higher equity (receives link from B, central hub)
    expect(equity["a"]).toBeGreaterThan(0);
    expect(equity["b"]).toBeGreaterThan(0);
    expect(equity["c"]).toBeGreaterThan(0);
  });

  it("should generate internal links with hub-spoke model", async () => {
    const { generateInternalLinks, createDefaultLinkingConfig } = await import("./internal-linking-ai");

    const nodes = [
      { id: "pillar", url: "https://example.com/main", title: "Main Guide", keyword: "online casino", type: "pillar" as const, platform: "telegraph", topicCluster: "casino", pageAuthority: 90, existingInboundLinks: 0, existingOutboundLinks: 0 },
      { id: "cluster1", url: "https://example.com/slots", title: "Slots Guide", keyword: "online slots", type: "cluster" as const, platform: "telegraph", topicCluster: "casino", pageAuthority: 80, existingInboundLinks: 0, existingOutboundLinks: 0 },
      { id: "cluster2", url: "https://example.com/poker", title: "Poker Guide", keyword: "online poker", type: "cluster" as const, platform: "telegraph", topicCluster: "casino", pageAuthority: 75, existingInboundLinks: 0, existingOutboundLinks: 0 },
    ];

    const clusters = [
      {
        id: "c1",
        name: "casino",
        pillarKeyword: "online casino",
        pillarNodeId: null,
        clusterKeywords: ["online slots", "online poker"],
        clusterNodeIds: [],
        linkDensity: 0,
        equityScore: 0,
      },
    ];

    const config = createDefaultLinkingConfig("example.com", ["https://example.com/main"]);
    const links = await generateInternalLinks(nodes, clusters, config);

    expect(links.length).toBeGreaterThan(0);
    // Should have pillar → cluster links
    const pillarToCluster = links.filter(l => l.sourceNodeId === "pillar");
    expect(pillarToCluster.length).toBeGreaterThan(0);
    // Should have cluster → pillar links
    const clusterToPillar = links.filter(l => l.targetNodeId === "pillar" && l.sourceNodeId !== "pillar");
    expect(clusterToPillar.length).toBeGreaterThan(0);
  });

  it("should generate link insertion HTML", async () => {
    const { generateLinkInsertionHtml } = await import("./internal-linking-ai");

    const strategy = {
      domain: "example.com",
      clusters: [],
      nodes: [
        { id: "a", url: "https://a.com", title: "Page A", keyword: "a", type: "pillar" as const, platform: "telegraph", topicCluster: "main", pageAuthority: 90, existingInboundLinks: 0, existingOutboundLinks: 0 },
        { id: "b", url: "https://b.com", title: "Page B", keyword: "b", type: "cluster" as const, platform: "telegraph", topicCluster: "main", pageAuthority: 80, existingInboundLinks: 0, existingOutboundLinks: 0 },
      ],
      links: [
        { id: "l1", sourceNodeId: "a", targetNodeId: "b", anchorText: "Read about B", anchorType: "contextual" as const, placement: "in-content" as const, priority: 8, linkEquityWeight: 0.8, created: new Date(), verified: false },
      ],
      totalLinks: 1,
      avgLinksPerNode: 0.5,
      equityDistribution: { a: 0.5, b: 0.5 },
      generatedAt: new Date(),
    };

    const html = generateLinkInsertionHtml("a", strategy);

    expect(html).toContain("Related Articles");
    expect(html).toContain("https://b.com");
    expect(html).toContain("Read about B");
  });

  it("should get link recommendations", async () => {
    const { getLinkRecommendations } = await import("./internal-linking-ai");

    const strategy = {
      domain: "example.com",
      clusters: [],
      nodes: [
        { id: "a", url: "https://a.com", title: "Page A", keyword: "a", type: "pillar" as const, platform: "telegraph", topicCluster: "main", pageAuthority: 90, existingInboundLinks: 0, existingOutboundLinks: 0 },
        { id: "b", url: "https://b.com", title: "Page B", keyword: "b", type: "cluster" as const, platform: "telegraph", topicCluster: "main", pageAuthority: 80, existingInboundLinks: 0, existingOutboundLinks: 0 },
      ],
      links: [
        { id: "l1", sourceNodeId: "a", targetNodeId: "b", anchorText: "Read about B", anchorType: "contextual" as const, placement: "in-content" as const, priority: 8, linkEquityWeight: 0.8, created: new Date(), verified: false },
      ],
      totalLinks: 1,
      avgLinksPerNode: 0.5,
      equityDistribution: { a: 0.5, b: 0.5 },
      generatedAt: new Date(),
    };

    const recommendations = getLinkRecommendations("a", strategy);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].targetUrl).toBe("https://b.com");
    expect(recommendations[0].suggestedAnchor).toBe("Read about B");
    expect(recommendations[0].priority).toBe(8);
  });

  it("should get linking summary", async () => {
    const { getLinkingSummary } = await import("./internal-linking-ai");

    const summary = getLinkingSummary();
    expect(summary).toHaveProperty("totalDomains");
    expect(summary).toHaveProperty("totalNodes");
    expect(summary).toHaveProperty("totalLinks");
    expect(summary).toHaveProperty("totalClusters");
    expect(summary).toHaveProperty("avgLinksPerNode");
  });

  it("should handle empty equity calculation", async () => {
    const { calculateEquityDistribution } = await import("./internal-linking-ai");

    const equity = calculateEquityDistribution([], []);
    expect(Object.keys(equity)).toHaveLength(0);
  });

  it("should handle empty link generation with no nodes", async () => {
    const { generateLinkInsertionHtml } = await import("./internal-linking-ai");

    const strategy = {
      domain: "example.com",
      clusters: [],
      nodes: [],
      links: [],
      totalLinks: 0,
      avgLinksPerNode: 0,
      equityDistribution: {},
      generatedAt: new Date(),
    };

    const html = generateLinkInsertionHtml("nonexistent", strategy);
    expect(html).toBe("");
  });
});
