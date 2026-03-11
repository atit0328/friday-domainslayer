/**
 * Design: Obsidian Intelligence — Algorithm Intelligence Center
 * Deep Google algorithm knowledge base with 200+ ranking factors,
 * content scoring, strategy analysis, and penalty avoidance.
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Shield, Loader2, Radio, AlertTriangle, RefreshCw, Activity, Zap,
  Brain, Target, Search, FileText, BarChart3, ChevronDown, ChevronUp,
  TrendingUp, Lock, Eye, ExternalLink, Crosshair, Flame, BookOpen,
  AlertCircle, CheckCircle2, XCircle, ArrowRight, Gauge,
} from "lucide-react";

// ─── Color Maps ───
const IMPACT_COLORS: Record<string, string> = {
  critical: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  high: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  minimal: "bg-zinc-700/20 text-zinc-500 border-zinc-700/30",
};

const CATEGORY_COLORS: Record<string, string> = {
  domain: "text-emerald-400",
  page_level: "text-violet-400",
  site_level: "text-blue-400",
  backlink: "text-amber-400",
  user_interaction: "text-cyan-400",
  special_algorithm: "text-rose-400",
  brand_signal: "text-pink-400",
  on_site_spam: "text-red-500",
  off_site_spam: "text-orange-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  domain: "Domain Factors",
  page_level: "Page-Level Factors",
  site_level: "Site-Level Factors",
  backlink: "Backlink Factors",
  user_interaction: "User Interaction",
  special_algorithm: "Special Algorithms",
  brand_signal: "Brand Signals",
  on_site_spam: "On-Site Spam",
  off_site_spam: "Off-Site Spam",
};

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-rose/20 text-rose border-rose/30",
  CRITICAL: "bg-rose/20 text-rose border-rose/30",
  MEDIUM: "bg-amber/20 text-amber border-amber/30",
  MED: "bg-amber/20 text-amber border-amber/30",
  LOW: "bg-emerald/20 text-emerald border-emerald/30",
};

const RISK_COLORS: Record<string, string> = {
  HIGH: "text-rose",
  CRITICAL: "text-rose",
  MEDIUM: "text-amber",
  MED: "text-amber",
  LOW: "text-emerald",
  UNKNOWN: "text-muted-foreground",
};

function ScoreBar({ score, label, color = "emerald" }: { score: number; label: string; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
    blue: "bg-blue-500",
    cyan: "bg-cyan-500",
  };
  const barColor = score >= 70 ? colorMap.emerald : score >= 40 ? colorMap.amber : colorMap.rose;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold">{score}/100</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function AlgorithmIntel() {
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedFactor, setExpandedFactor] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [exploitableOnly, setExploitableOnly] = useState(false);

  // Content Scorer state
  const [scoreTitle, setScoreTitle] = useState("");
  const [scoreContent, setScoreContent] = useState("");
  const [scoreKeyword, setScoreKeyword] = useState("");

  // Strategy Analyzer state
  const [strategyKeyword, setStrategyKeyword] = useState("");

  const utils = trpc.useUtils();

  // ─── Data Queries ───
  const { data: overview, isLoading: overviewLoading } = trpc.algorithmIntelligence.getOverview.useQuery();
  const { data: factorsData, isLoading: factorsLoading } = trpc.algorithmIntelligence.getFactors.useQuery();
  const { data: strategies } = trpc.algorithmIntelligence.getStrategies.useQuery();
  const { data: penaltyRules } = trpc.algorithmIntelligence.getPenaltyRules.useQuery();
  const { data: history = [], isLoading: historyLoading } = trpc.algo.latest.useQuery({ limit: 10 });

  // ─── Mutations ───
  const scoreMutation = trpc.algorithmIntelligence.scoreContent.useMutation({
    onSuccess: () => toast.success("Content scored!"),
    onError: (err: any) => toast.error(err.message),
  });

  const analyzeKeywordMutation = trpc.algorithmIntelligence.analyzeKeyword.useMutation({
    onSuccess: () => toast.success("Strategy analysis complete!"),
    onError: (err: any) => toast.error(err.message),
  });

  const scanMutation = trpc.algo.scan.useMutation({
    onSuccess: () => {
      toast.success("Algorithm scan completed!");
      utils.algo.latest.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Filter factors ───
  const filteredFactors = useMemo(() => {
    if (!factorsData?.factors) return [];
    let factors = factorsData.factors;
    if (categoryFilter !== "all") {
      factors = factors.filter((f: any) => f.category === categoryFilter);
    }
    if (exploitableOnly) {
      factors = factors.filter((f: any) => f.exploitable);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      factors = factors.filter((f: any) =>
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        (f.exploitTactics || []).some((t: string) => t.toLowerCase().includes(q))
      );
    }
    return factors;
  }, [factorsData, categoryFilter, exploitableOnly, searchQuery]);

  // ─── Algo scan data ───
  const latestScan: any = history.length > 0 ? history[0] : null;
  const signals: any[] = latestScan?.signals
    ? (typeof latestScan.signals === "string" ? JSON.parse(latestScan.signals) : latestScan.signals)
    : [];
  const analysis: string = latestScan?.analysis || "";
  const overallRisk: string = latestScan?.overallRisk || "UNKNOWN";

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-violet rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">Algorithm Intelligence</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-violet/30 text-violet">
            {overview?.totalFactors || 0} Factors
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
            {scanMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Radio className="w-3.5 h-3.5 mr-1" />}
            Scan Algorithm
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border border-border/50 flex-wrap h-auto gap-0.5 p-1">
          <TabsTrigger value="overview" className="text-xs gap-1.5 data-[state=active]:bg-violet/15 data-[state=active]:text-violet">
            <BarChart3 className="w-3.5 h-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="factors" className="text-xs gap-1.5 data-[state=active]:bg-violet/15 data-[state=active]:text-violet">
            <BookOpen className="w-3.5 h-3.5" /> Ranking Factors
          </TabsTrigger>
          <TabsTrigger value="scorer" className="text-xs gap-1.5 data-[state=active]:bg-emerald/15 data-[state=active]:text-emerald">
            <Gauge className="w-3.5 h-3.5" /> Content Scorer
          </TabsTrigger>
          <TabsTrigger value="strategy" className="text-xs gap-1.5 data-[state=active]:bg-amber/15 data-[state=active]:text-amber">
            <Crosshair className="w-3.5 h-3.5" /> Strategy Analyzer
          </TabsTrigger>
          <TabsTrigger value="penalties" className="text-xs gap-1.5 data-[state=active]:bg-rose/15 data-[state=active]:text-rose">
            <AlertTriangle className="w-3.5 h-3.5" /> Penalty Rules
          </TabsTrigger>
          <TabsTrigger value="monitor" className="text-xs gap-1.5 data-[state=active]:bg-cyan/15 data-[state=active]:text-cyan">
            <Activity className="w-3.5 h-3.5" /> Live Monitor
          </TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW TAB ═══ */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {overviewLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet" /></div>
          ) : overview ? (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <BookOpen className="w-5 h-5 text-violet mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Total Factors</p>
                    <p className="text-xl font-bold font-mono text-violet">{overview.totalFactors}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <Target className="w-5 h-5 text-emerald mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Exploitable</p>
                    <p className="text-xl font-bold font-mono text-emerald">{overview.exploitable}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <Flame className="w-5 h-5 text-rose mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Critical</p>
                    <p className="text-xl font-bold font-mono text-rose">{overview.critical}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <Zap className="w-5 h-5 text-amber mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Fast-Rank (8+)</p>
                    <p className="text-xl font-bold font-mono text-amber">{overview.highFastRank}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <Brain className="w-5 h-5 text-cyan mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Strategies</p>
                    <p className="text-xl font-bold font-mono text-cyan">{overview.strategies}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <Shield className="w-5 h-5 text-pink-400 mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Penalty Rules</p>
                    <p className="text-xl font-bold font-mono text-pink-400">{overview.penaltyRules}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Category Breakdown */}
              <Card className="glass-card border-violet/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet" /> Factor Categories
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overview.categoryBreakdown.map((cat: any) => (
                    <div key={cat.category} className="flex items-center gap-3">
                      <span className={`text-xs font-mono w-36 truncate ${CATEGORY_COLORS[cat.category] || "text-muted-foreground"}`}>
                        {CATEGORY_LABELS[cat.category] || cat.category}
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cat.category === "backlink" ? "bg-amber-500" : cat.category === "page_level" ? "bg-violet-500" : "bg-emerald-500"}`}
                          style={{ width: `${(cat.count / overview.totalFactors) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{cat.count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Impact Breakdown */}
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald" /> Impact Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3 flex-wrap">
                    {overview.impactBreakdown.map((imp: any) => (
                      <Badge key={imp.impact} className={`${IMPACT_COLORS[imp.impact] || "bg-muted"} text-xs font-mono`}>
                        {imp.impact.toUpperCase()}: {imp.count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Strategies */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {strategies?.map((s: any) => (
                  <Card key={s.name} className="glass-card border-border/50 hover:border-violet/30 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-semibold">{s.name}</h3>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {s.timeframe}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">{s.description}</p>
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-muted-foreground">Risk:</span>
                        <span className={s.riskLevel <= 3 ? "text-emerald" : s.riskLevel <= 5 ? "text-amber" : "text-rose"}>
                          {s.riskLevel}/10
                        </span>
                        <span className="text-muted-foreground ml-2">Success:</span>
                        <span className="text-violet">{s.successRate}</span>
                      </div>
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        Exploits {s.exploitedFactors.length} factors
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : null}
        </TabsContent>

        {/* ═══ RANKING FACTORS TAB ═══ */}
        <TabsContent value="factors" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search factors, tactics, descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-muted/30"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 px-3 text-xs rounded-md border border-border bg-muted/30 text-foreground"
            >
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant={exploitableOnly ? "default" : "outline"}
              onClick={() => setExploitableOnly(!exploitableOnly)}
              className={exploitableOnly ? "bg-emerald text-white" : ""}
            >
              <Target className="w-3.5 h-3.5 mr-1" />
              Exploitable Only
            </Button>
          </div>

          <p className="text-xs text-muted-foreground font-mono">
            Showing {filteredFactors.length} of {factorsData?.total || 0} factors
          </p>

          {factorsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet" /></div>
          ) : (
            <div className="space-y-2">
              {filteredFactors.map((factor: any) => (
                <Card
                  key={factor.id}
                  className={`glass-card border-border/50 hover:border-violet/20 transition-all cursor-pointer ${expandedFactor === factor.id ? "border-violet/40" : ""}`}
                  onClick={() => setExpandedFactor(expandedFactor === factor.id ? null : factor.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center shrink-0 text-xs font-mono font-bold text-violet">
                          {factor.id}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold">{factor.name}</h3>
                            {factor.exploitable && (
                              <Badge className="bg-emerald/15 text-emerald border-emerald/30 text-[9px]">EXPLOITABLE</Badge>
                            )}
                            {factor.confirmed && (
                              <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[9px]">CONFIRMED</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{factor.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={`${IMPACT_COLORS[factor.impact]} text-[9px]`}>
                          {factor.impact.toUpperCase()}
                        </Badge>
                        <div className="flex items-center gap-1" title="Fast-rank relevance">
                          <Zap className="w-3 h-3 text-amber" />
                          <span className="text-[10px] font-mono font-bold text-amber">{factor.fastRankRelevance}</span>
                        </div>
                        {expandedFactor === factor.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {expandedFactor === factor.id && (
                      <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                          <div>
                            <span className="text-muted-foreground">Category:</span>
                            <span className={`ml-1 font-semibold ${CATEGORY_COLORS[factor.category]}`}>
                              {CATEGORY_LABELS[factor.category]}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Impact:</span>
                            <span className="ml-1 font-semibold">{factor.impact}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fast-Rank:</span>
                            <span className="ml-1 font-semibold text-amber">{factor.fastRankRelevance}/10</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Exploit:</span>
                            <span className={`ml-1 font-semibold ${factor.exploitable ? "text-emerald" : "text-rose"}`}>
                              {factor.exploitable ? `Yes (${factor.exploitDifficulty})` : "No"}
                            </span>
                          </div>
                        </div>

                        {factor.exploitTactics && factor.exploitTactics.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono text-emerald/70 uppercase tracking-wider mb-1">Exploit Tactics</p>
                            <ul className="space-y-1">
                              {factor.exploitTactics.map((tactic: string, i: number) => (
                                <li key={i} className="text-xs text-emerald flex items-start gap-1.5">
                                  <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                                  {tactic}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {factor.penaltyTriggers && factor.penaltyTriggers.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono text-rose/70 uppercase tracking-wider mb-1">Penalty Triggers</p>
                            <ul className="space-y-1">
                              {factor.penaltyTriggers.map((trigger: string, i: number) => (
                                <li key={i} className="text-xs text-rose flex items-start gap-1.5">
                                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                  {trigger}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {factor.evasionTips && factor.evasionTips.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider mb-1">Evasion Tips</p>
                            <ul className="space-y-1">
                              {factor.evasionTips.map((tip: string, i: number) => (
                                <li key={i} className="text-xs text-cyan-400 flex items-start gap-1.5">
                                  <Eye className="w-3 h-3 mt-0.5 shrink-0" />
                                  {tip}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ CONTENT SCORER TAB ═══ */}
        <TabsContent value="scorer" className="space-y-4 mt-4">
          <Card className="glass-card border-emerald/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald" /> Content Score Against Google Ranking Factors
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Paste your content to see how well it's optimized for Google's 200+ ranking factors
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  placeholder="Target keyword (e.g., สล็อตเว็บตรง)"
                  value={scoreKeyword}
                  onChange={(e) => setScoreKeyword(e.target.value)}
                  className="h-9 text-sm bg-muted/30"
                />
                <Input
                  placeholder="Page title"
                  value={scoreTitle}
                  onChange={(e) => setScoreTitle(e.target.value)}
                  className="h-9 text-sm bg-muted/30"
                />
              </div>
              <Textarea
                placeholder="Paste your content here..."
                value={scoreContent}
                onChange={(e) => setScoreContent(e.target.value)}
                className="min-h-[200px] text-sm bg-muted/30"
              />
              <Button
                onClick={() => {
                  if (!scoreKeyword || !scoreTitle || !scoreContent) {
                    toast.error("กรุณากรอกข้อมูลให้ครบ");
                    return;
                  }
                  scoreMutation.mutate({
                    title: scoreTitle,
                    content: scoreContent,
                    keyword: scoreKeyword,
                  });
                }}
                disabled={scoreMutation.isPending}
                className="bg-emerald text-white hover:bg-emerald/90"
              >
                {scoreMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Gauge className="w-4 h-4 mr-1" />}
                Score Content
              </Button>
            </CardContent>
          </Card>

          {/* Score Results */}
          {scoreMutation.data && (
            <div className="space-y-4">
              {/* Overall Score */}
              <Card className="glass-card border-emerald/20">
                <CardContent className="p-6 text-center">
                  <div className={`text-5xl font-bold font-mono ${
                    scoreMutation.data.overall >= 70 ? "text-emerald" :
                    scoreMutation.data.overall >= 40 ? "text-amber" : "text-rose"
                  }`}>
                    {scoreMutation.data.overall}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Overall Algorithm Score</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {scoreMutation.data.overall >= 80 ? "Excellent — ready for deployment" :
                     scoreMutation.data.overall >= 60 ? "Good — minor improvements needed" :
                     scoreMutation.data.overall >= 40 ? "Fair — significant optimization needed" :
                     "Poor — major rewrite recommended"}
                  </p>
                </CardContent>
              </Card>

              {/* Score Breakdown */}
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Score Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ScoreBar score={scoreMutation.data.titleOptimization} label="Title Optimization (Factor #10-11)" />
                  <ScoreBar score={scoreMutation.data.keywordPlacement} label="Keyword Placement (Factor #14, 30, 31)" />
                  <ScoreBar score={scoreMutation.data.contentLength} label="Content Length (Factor #15)" />
                  <ScoreBar score={scoreMutation.data.lsiCoverage} label="LSI Coverage (Factor #17-18)" />
                  <ScoreBar score={scoreMutation.data.topicDepth} label="Topic Depth (Factor #19)" />
                  <ScoreBar score={scoreMutation.data.freshness} label="Freshness (Factor #27-29, 142)" />
                  <ScoreBar score={scoreMutation.data.schemaMarkup} label="Schema Markup (Factor #124)" />
                  <ScoreBar score={scoreMutation.data.readability} label="Readability" />
                  <ScoreBar score={scoreMutation.data.uniqueness} label="Uniqueness (Factor #24, 35)" />
                  <ScoreBar score={scoreMutation.data.eAtSignals} label="E-A-T Signals (Factor #75)" />
                </CardContent>
              </Card>

              {/* Recommendations */}
              {scoreMutation.data.recommendations.length > 0 && (
                <Card className="glass-card border-amber/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amber" /> Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {scoreMutation.data.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber mt-0.5 shrink-0" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Penalty Risks */}
              {scoreMutation.data.penaltyRisks.length > 0 && (
                <Card className="glass-card border-rose/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose" /> Penalty Risks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {scoreMutation.data.penaltyRisks.map((risk: string, i: number) => (
                        <li key={i} className="text-xs flex items-start gap-2 text-rose">
                          <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══ STRATEGY ANALYZER TAB ═══ */}
        <TabsContent value="strategy" className="space-y-4 mt-4">
          <Card className="glass-card border-amber/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-amber" /> AI Keyword Strategy Analyzer
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                AI analyzes your keyword against all 200+ ranking factors and creates an optimal attack strategy
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Enter target keyword (e.g., สล็อตเว็บตรง 2026)"
                value={strategyKeyword}
                onChange={(e) => setStrategyKeyword(e.target.value)}
                className="h-9 text-sm bg-muted/30"
              />
              <Button
                onClick={() => {
                  if (!strategyKeyword) {
                    toast.error("กรุณากรอก keyword");
                    return;
                  }
                  analyzeKeywordMutation.mutate({ keyword: strategyKeyword, niche: "gambling" });
                }}
                disabled={analyzeKeywordMutation.isPending}
                className="bg-amber text-black hover:bg-amber/90"
              >
                {analyzeKeywordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Brain className="w-4 h-4 mr-1" />}
                Analyze Strategy
              </Button>
            </CardContent>
          </Card>

          {/* Strategy Results */}
          {analyzeKeywordMutation.data && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] font-mono text-muted-foreground">Competition</p>
                    <p className={`text-lg font-bold font-mono ${
                      analyzeKeywordMutation.data.competitionLevel === "low" ? "text-emerald" :
                      analyzeKeywordMutation.data.competitionLevel === "medium" ? "text-amber" :
                      "text-rose"
                    }`}>
                      {analyzeKeywordMutation.data.competitionLevel.toUpperCase()}
                    </p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] font-mono text-muted-foreground">Strategy</p>
                    <p className="text-xs font-bold text-violet mt-1">{analyzeKeywordMutation.data.recommendedStrategy}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] font-mono text-muted-foreground">Est. Time</p>
                    <p className="text-lg font-bold font-mono text-cyan-400">{analyzeKeywordMutation.data.estimatedRankingTime}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] font-mono text-muted-foreground">Confidence</p>
                    <p className={`text-lg font-bold font-mono ${
                      analyzeKeywordMutation.data.confidenceScore >= 60 ? "text-emerald" :
                      analyzeKeywordMutation.data.confidenceScore >= 30 ? "text-amber" : "text-rose"
                    }`}>
                      {analyzeKeywordMutation.data.confidenceScore}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Content Guidelines */}
              <Card className="glass-card border-violet/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-violet" /> Content Guidelines
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-muted-foreground">Min Words</p>
                      <p className="font-bold font-mono text-lg">{analyzeKeywordMutation.data.contentGuidelines.minWords}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-muted-foreground">Keyword Density</p>
                      <p className="font-bold font-mono text-lg">{analyzeKeywordMutation.data.contentGuidelines.keywordDensity}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-muted-foreground">Schema Types</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {analyzeKeywordMutation.data.contentGuidelines.schemaTypes.map((s: string) => (
                          <Badge key={s} variant="outline" className="text-[9px]">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Required Elements</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analyzeKeywordMutation.data.contentGuidelines.requiredElements.map((el: string, i: number) => (
                        <Badge key={i} className="bg-violet/10 text-violet border-violet/20 text-[10px]">{el}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Anchor Text Distribution</p>
                    <div className="grid grid-cols-5 gap-2">
                      {Object.entries(analyzeKeywordMutation.data.contentGuidelines.anchorTextPlan).map(([type, pct]) => (
                        <div key={type} className="text-center bg-muted/30 rounded p-2">
                          <p className="text-[10px] text-muted-foreground capitalize">{type}</p>
                          <p className="font-bold font-mono text-sm">{pct as number}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Link Building Plan */}
              <Card className="glass-card border-amber/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-amber" /> 7-Day Link Building Plan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-7 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                      const count = (analyzeKeywordMutation.data.linkBuildingPlan as any)[`day${day}`];
                      const maxCount = Math.max(
                        ...([1, 2, 3, 4, 5, 6, 7].map(d => (analyzeKeywordMutation.data.linkBuildingPlan as any)[`day${d}`]))
                      );
                      return (
                        <div key={day} className="text-center">
                          <div className="bg-muted/30 rounded-lg p-2 relative overflow-hidden">
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-amber/20 transition-all"
                              style={{ height: `${(count / maxCount) * 100}%` }}
                            />
                            <p className="text-[10px] text-muted-foreground relative">Day {day}</p>
                            <p className="font-bold font-mono text-lg relative">{count}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total Links:</span>
                    <span className="font-bold font-mono text-amber">{analyzeKeywordMutation.data.linkBuildingPlan.totalLinks}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Platform Mix</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(analyzeKeywordMutation.data.linkBuildingPlan.platformMix).map(([platform, pct]) => (
                        <Badge key={platform} variant="outline" className="text-[10px] font-mono capitalize">
                          {platform}: {pct as number}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Exploited Factors */}
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald" /> Top Exploited Factors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analyzeKeywordMutation.data.exploitableFactors.slice(0, 8).map((f: any) => (
                      <div key={f.id} className="flex items-center gap-3 text-xs">
                        <span className="font-mono text-violet w-6">#{f.id}</span>
                        <span className="font-semibold flex-1">{f.name}</span>
                        <Badge className={`${IMPACT_COLORS[f.impact]} text-[9px]`}>{f.impact}</Badge>
                        <span className="font-mono text-amber">⚡{f.fastRankRelevance}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══ PENALTY RULES TAB ═══ */}
        <TabsContent value="penalties" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">
            Critical penalty rules to avoid when executing SEO campaigns. Violating these can result in de-indexing.
          </p>
          {penaltyRules?.map((rule: any) => (
            <Card key={rule.name} className={`glass-card ${rule.severity === "critical" ? "border-rose/30" : "border-amber/20"}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      rule.severity === "critical" ? "bg-rose/10 border border-rose/20" : "bg-amber/10 border border-amber/20"
                    }`}>
                      <AlertTriangle className={`w-4 h-4 ${rule.severity === "critical" ? "text-rose" : "text-amber"}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{rule.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                    </div>
                  </div>
                  <Badge className={`${rule.severity === "critical" ? "bg-rose/20 text-rose border-rose/30" : "bg-amber/20 text-amber border-amber/30"} text-[9px]`}>
                    {rule.severity.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-mono text-rose/70 uppercase tracking-wider mb-1">Triggers</p>
                    <ul className="space-y-1">
                      {rule.triggers.map((t: string, i: number) => (
                        <li key={i} className="text-xs text-rose flex items-start gap-1.5">
                          <XCircle className="w-3 h-3 mt-0.5 shrink-0" /> {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-emerald/70 uppercase tracking-wider mb-1">Avoidance</p>
                    <ul className="space-y-1">
                      {rule.avoidance.map((a: string, i: number) => (
                        <li key={i} className="text-xs text-emerald flex items-start gap-1.5">
                          <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /> {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground">
                  Related factors: {rule.relatedFactors.map((id: number) => `#${id}`).join(", ")}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ═══ LIVE MONITOR TAB ═══ */}
        <TabsContent value="monitor" className="space-y-4 mt-4">
          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="glass-card border-border/50">
              <CardContent className="p-4 text-center">
                <Activity className="w-6 h-6 text-emerald mx-auto mb-2" />
                <p className="text-xs font-mono text-muted-foreground">Overall Risk</p>
                <p className={`text-2xl font-bold font-mono mt-1 ${RISK_COLORS[overallRisk] || RISK_COLORS.UNKNOWN}`}>
                  {overallRisk}
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/50">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="w-6 h-6 text-amber mx-auto mb-2" />
                <p className="text-xs font-mono text-muted-foreground">Signals Detected</p>
                <p className="text-2xl font-bold font-mono mt-1">{signals.length}</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/50">
              <CardContent className="p-4 text-center">
                <Zap className="w-6 h-6 text-violet mx-auto mb-2" />
                <p className="text-xs font-mono text-muted-foreground">Total Scans</p>
                <p className="text-2xl font-bold font-mono mt-1">{history.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Analysis */}
          {analysis && (
            <Card className="glass-card border-violet/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-violet" /> AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed whitespace-pre-wrap">
                  {analysis}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Signals */}
          {signals.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Detected Signals</h2>
              {signals.map((signal: any, i: number) => (
                <Card key={i} className="glass-card border-border/50">
                  <CardContent className="p-3 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-violet shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold">{signal.name}</h3>
                      <p className="text-xs text-muted-foreground">{signal.description}</p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${SEVERITY_COLORS[signal.severity] || SEVERITY_COLORS.LOW}`}>
                      {signal.severity}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!historyLoading && !latestScan && (
            <div className="text-center py-12 text-muted-foreground">
              <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">ยังไม่มีข้อมูล — กด "Scan Algorithm" เพื่อเริ่มวิเคราะห์</p>
            </div>
          )}

          {historyLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-violet" />
            </div>
          )}

          {/* History */}
          {history.length > 1 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Scan History</h2>
              {history.slice(1).map((scan: any) => (
                <Card key={scan.id} className="glass-card border-border/50">
                  <CardContent className="p-3 flex items-center justify-between">
                    <Badge className={`text-[10px] ${SEVERITY_COLORS[scan.overallRisk] || "bg-muted text-muted-foreground"}`}>
                      {scan.overallRisk || "—"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {scan.createdAt ? new Date(scan.createdAt).toLocaleString("th-TH") : "—"}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
