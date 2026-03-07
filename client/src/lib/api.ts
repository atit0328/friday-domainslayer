/**
 * API helper — connects to DomainSlayer backend and Friday AI backend
 * All calls are proxied through the configured URLs
 */

function getDcUrl(): string {
  return localStorage.getItem("dc_url") || "";
}

function getFridayUrl(): string {
  return localStorage.getItem("friday_url") || "";
}

function getAiKeys() {
  return JSON.parse(localStorage.getItem("ai_keys") || "{}");
}

// ─── Generic Fetch ───
async function dcFetch(path: string, options: RequestInit = {}) {
  const base = getDcUrl();
  if (!base) throw new Error("DomainSlayer URL not configured. Go to Settings.");
  const url = `${base}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers as Record<string, string> },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

async function fridayFetch(path: string, options: RequestInit = {}) {
  const base = getFridayUrl();
  if (!base) throw new Error("Friday AI URL not configured. Go to Settings.");
  const url = `${base}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers as Record<string, string> },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || body.error || `API error ${res.status}`);
  }
  return res.json();
}

// ═══ DomainSlayer APIs ═══

export const domainSlayer = {
  // Health
  health: () => dcFetch("/healthz"),

  // Scan
  startScan: (domain: string, useCase: string) =>
    dcFetch("/api/scan", { method: "POST", body: JSON.stringify({ domain, use_case: useCase }) }),
  getScan: (scanId: string) => dcFetch(`/api/scan/${scanId}`),
  getScans: (domain = "", limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (domain) params.set("domain", domain);
    return dcFetch(`/api/scans?${params}`);
  },
  startBulkScan: (domains: string[], useCase: string) =>
    dcFetch("/api/scan/bulk", { method: "POST", body: JSON.stringify({ domains, use_case: useCase }) }),
  getBulkJob: (bulkId: string) => dcFetch(`/api/bulk/${bulkId}`),

  // Marketplace
  getProviders: () => dcFetch("/api/marketplace/providers"),
  searchMarketplace: (params: {
    keyword?: string; tld?: string; min_price?: number; max_price?: number;
    limit?: number; providers?: string[]; sort_by?: string;
  }) => dcFetch("/api/marketplace/search", { method: "POST", body: JSON.stringify(params) }),

  // Orders
  createOrder: (data: { domain: string; provider: string; action: string; amount: number }) =>
    dcFetch("/api/orders", { method: "POST", body: JSON.stringify(data) }),
  getOrders: (status?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set("status", status);
    return dcFetch(`/api/orders?${params}`);
  },
  cancelOrder: (orderId: string) => dcFetch(`/api/orders/${orderId}`, { method: "DELETE" }),

  // Auto-Bid
  createAutoBidRule: (rule: Record<string, unknown>) =>
    dcFetch("/api/autobid", { method: "POST", body: JSON.stringify(rule) }),
  getAutoBidRules: () => dcFetch("/api/autobid"),
  getAutoBidRule: (ruleId: string) => dcFetch(`/api/autobid/${ruleId}`),
  updateAutoBidRule: (ruleId: string, updates: Record<string, unknown>) =>
    dcFetch(`/api/autobid/${ruleId}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteAutoBidRule: (ruleId: string) => dcFetch(`/api/autobid/${ruleId}`, { method: "DELETE" }),
  triggerAutoBid: (ruleId: string) => dcFetch(`/api/autobid/${ruleId}/run`, { method: "POST" }),

  // Watchlist
  addToWatchlist: (item: Record<string, unknown>) =>
    dcFetch("/api/watchlist", { method: "POST", body: JSON.stringify(item) }),
  getWatchlist: (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    return dcFetch(`/api/watchlist?${params}`);
  },
  updateWatchlistItem: (wid: string, updates: Record<string, unknown>) =>
    dcFetch(`/api/watchlist/${wid}`, { method: "PATCH", body: JSON.stringify(updates) }),
  removeFromWatchlist: (wid: string) => dcFetch(`/api/watchlist/${wid}`, { method: "DELETE" }),
  getWatchlistAlerts: (limit = 50) => dcFetch(`/api/watchlist/alerts?limit=${limit}`),

  // Export
  getExportCsvUrl: (domain = "") => {
    const base = getDcUrl();
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    return `${base}/api/export.csv?${params}`;
  },
  getExportJsonUrl: (domain = "") => {
    const base = getDcUrl();
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    return `${base}/api/export.json?${params}`;
  },
};

// ═══ Friday AI APIs ═══

export const fridayAi = {
  // Stats
  getStats: () => fridayFetch("/api/stats"),

  // Chat
  sendChat: (message: string, provider?: string) =>
    fridayFetch("/api/chat", { method: "POST", body: JSON.stringify({ message, provider }) }),
  getChatHistory: () => fridayFetch("/api/chat"),

  // Campaigns
  getCampaigns: () => fridayFetch("/api/campaigns"),
  createCampaign: (data: Record<string, unknown>) =>
    fridayFetch("/api/campaigns", { method: "POST", body: JSON.stringify(data) }),
  updateCampaign: (id: string, action: string) =>
    fridayFetch("/api/campaigns", { method: "PATCH", body: JSON.stringify({ id, action }) }),
  deleteCampaign: (id: string) =>
    fridayFetch("/api/campaigns", { method: "DELETE", body: JSON.stringify({ id }) }),
  getCampaignLogs: (campaignId: string) =>
    fridayFetch(`/api/campaigns/logs?campaignId=${campaignId}`),

  // Modules
  executeModule: (data: Record<string, unknown>) =>
    fridayFetch("/api/modules", { method: "POST", body: JSON.stringify(data) }),

  // PBN
  getPbnSites: () => fridayFetch("/api/pbn"),
  addPbnSite: (data: Record<string, unknown>) =>
    fridayFetch("/api/pbn", { method: "POST", body: JSON.stringify(data) }),
  updatePbnSite: (data: Record<string, unknown>) =>
    fridayFetch("/api/pbn", { method: "PATCH", body: JSON.stringify(data) }),
  deletePbnSite: (id: string) =>
    fridayFetch("/api/pbn", { method: "DELETE", body: JSON.stringify({ id }) }),
  postToPbn: (data: Record<string, unknown>) =>
    fridayFetch("/api/pbn/post", { method: "POST", body: JSON.stringify(data) }),

  // Algorithm Intel
  getAlgoReport: () => fridayFetch("/api/algo"),
  scanAlgo: () => fridayFetch("/api/algo", { method: "POST" }),

  // Settings
  getSettings: () => fridayFetch("/api/settings"),
  saveSettings: (data: Record<string, unknown>) =>
    fridayFetch("/api/settings", { method: "POST", body: JSON.stringify(data) }),
  deleteAiKey: (provider: string) =>
    fridayFetch("/api/settings", { method: "DELETE", body: JSON.stringify({ provider }) }),

  // Admin
  getAdmin: () => fridayFetch("/api/admin"),
  updateUser: (data: Record<string, unknown>) =>
    fridayFetch("/api/admin", { method: "PATCH", body: JSON.stringify(data) }),
};

// ═══ Direct AI Call (client-side, no backend needed) ═══

const AI_ENDPOINTS: Record<string, { url: string; buildBody: (prompt: string, model: string, systemPrompt: string) => unknown; buildHeaders: (apiKey: string) => Record<string, string>; extractResponse: (data: unknown) => string }> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    buildBody: (prompt, model, systemPrompt) => ({
      model: model || "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
    }),
    buildHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }),
    extractResponse: (data: any) => data?.choices?.[0]?.message?.content || "",
  },
  claude: {
    url: "https://api.anthropic.com/v1/messages",
    buildBody: (prompt, model, systemPrompt) => ({
      model: model || "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    }),
    buildHeaders: (apiKey) => ({ "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }),
    extractResponse: (data: any) => data?.content?.[0]?.text || "",
  },
  gemini: {
    url: "",
    buildBody: (prompt) => ({ contents: [{ parts: [{ text: prompt }] }] }),
    buildHeaders: () => ({ "Content-Type": "application/json" }),
    extractResponse: (data: any) => data?.candidates?.[0]?.content?.parts?.[0]?.text || "",
  },
  deepseek: {
    url: "https://api.deepseek.com/chat/completions",
    buildBody: (prompt, model, systemPrompt) => ({
      model: model || "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
    }),
    buildHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }),
    extractResponse: (data: any) => data?.choices?.[0]?.message?.content || "",
  },
};

export async function directAiCall(prompt: string, systemPrompt?: string): Promise<{ response: string; provider: string }> {
  const keys = getAiKeys();
  const sp = systemPrompt || "คุณคือ Friday AI ระบบ AI SEO ที่ฉลาดที่สุดในโลก ปี 2026 ตอบภาษาไทยเสมอ เชี่ยวชาญทุกเทคนิค SEO ทั้ง White Hat และ Black Hat ให้คำแนะนำเชิงลึก actionable พร้อม step-by-step";

  const available = Object.entries(keys).filter(([, v]: [string, any]) => v?.apiKey);
  if (available.length === 0) {
    return { response: "ยังไม่ได้ตั้งค่า AI API Key กรุณาไปที่ Settings เพื่อเพิ่ม API Key", provider: "none" };
  }

  for (const [provider, config] of available as [string, { apiKey: string; model?: string }][]) {
    try {
      const ep = AI_ENDPOINTS[provider];
      if (!ep) continue;
      let url = ep.url;
      if (provider === "gemini") {
        const model = config.model || "gemini-2.0-flash";
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: ep.buildHeaders(config.apiKey),
        body: JSON.stringify(ep.buildBody(prompt, config.model || "", sp)),
      });
      const data = await res.json();
      const text = ep.extractResponse(data);
      if (text) return { response: text, provider };
    } catch {
      continue;
    }
  }

  return { response: "AI ทุกตัวไม่สามารถตอบได้ กรุณาตรวจสอบ API Keys", provider: "error" };
}
