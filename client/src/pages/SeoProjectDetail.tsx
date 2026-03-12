/**
 * SEO Project Detail — Full analytics dashboard for a single domain
 * Tabs: Overview, Dashboard, Backlinks, Rankings, PBN Builder, SERP Tracker, Actions, Report, Strategy
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Globe, ArrowLeft, TrendingUp, TrendingDown, Minus, Shield, AlertTriangle,
  Activity, Link2, BarChart3, Brain, Loader2, Play, Search, Target,
  FileText, Zap, RefreshCw, ChevronUp, ChevronDown, ExternalLink,
  Clock, CheckCircle, XCircle, AlertCircle, Sparkles, Network, Radar,
  Users, Award, Eye, ArrowUpDown, LayoutDashboard, ClipboardList,
  Calendar, Hash, MapPin, Bot, Wrench, Download
} from "lucide-react";
import SetupProgressPanel from "@/components/SetupProgressPanel";

export default function SeoProjectDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/seo/:id");
  const projectId = Number(params?.id);

  const [activeTab, setActiveTab] = useState("overview");
  const [showContentDialog, setShowContentDialog] = useState(false);
  const [contentKeyword, setContentKeyword] = useState("");
  const [pbnLinkCount, setPbnLinkCount] = useState([5]);
  const [singleKeyword, setSingleKeyword] = useState("");
  const [competitorDomains, setCompetitorDomains] = useState("");

  const { data, isLoading, refetch } = trpc.seoProjects.get.useQuery(
    { id: projectId },
    { enabled: !!projectId }
  );
  const { data: backlinks } = trpc.backlinks.list.useQuery(
    { projectId },
    { enabled: !!projectId && (activeTab === "backlinks" || activeTab === "pbn") }
  );
  const { data: blStats } = trpc.backlinks.stats.useQuery(
    { projectId },
    { enabled: !!projectId }
  );
  const { data: allRankings } = trpc.rankings.list.useQuery(
    { projectId },
    { enabled: !!projectId && (activeTab === "rankings" || activeTab === "overview" || activeTab === "serp" || activeTab === "dashboard" || activeTab === "report") }
  );
  const { data: actions } = trpc.seoActions.list.useQuery(
    { projectId },
    { enabled: !!projectId }
  );
  const { data: snapshots } = trpc.snapshots.list.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const utils = trpc.useUtils();

  // Existing mutations
  const analyzeMut = trpc.seoProjects.analyze.useMutation({
    onSuccess: () => {
      utils.seoProjects.get.invalidate({ id: projectId });
      utils.snapshots.list.invalidate({ projectId });
      toast.success("วิเคราะห์โดเมนเสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  const strategyMut = trpc.seoProjects.generateStrategy.useMutation({
    onSuccess: () => {
      utils.seoProjects.get.invalidate({ id: projectId });
      toast.success("สร้าง Strategy เสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  const keywordMut = trpc.seoProjects.researchKeywords.useMutation({
    onSuccess: () => {
      utils.seoProjects.get.invalidate({ id: projectId });
      utils.rankings.list.invalidate({ projectId });
      toast.success("วิจัย Keywords เสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  const rankAnalysisMut = trpc.seoProjects.analyzeRankings.useMutation({
    onSuccess: () => {
      utils.seoProjects.get.invalidate({ id: projectId });
      toast.success("วิเคราะห์อันดับเสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  const blAnalysisMut = trpc.seoProjects.analyzeBacklinks.useMutation({
    onSuccess: () => {
      toast.success("วิเคราะห์ Backlinks เสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  const contentMut = trpc.seoProjects.generateContent.useMutation({
    onSuccess: () => {
      utils.seoActions.list.invalidate({ projectId });
      setShowContentDialog(false);
      setContentKeyword("");
      toast.success("สร้างเนื้อหาเสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  // PBN Bridge mutations
  const pbnScoreMut = trpc.pbn.scoreSites.useMutation({
    onSuccess: (data) => {
      toast.success(`Score ${data.length} PBN sites เสร็จแล้ว!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const pbnAnchorMut = trpc.pbn.anchorPlan.useMutation({
    onSuccess: () => {
      toast.success("สร้าง Anchor Plan เสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  const pbnBuildMut = trpc.pbn.buildLinks.useMutation({
    onSuccess: (data) => {
      utils.backlinks.list.invalidate({ projectId });
      utils.backlinks.stats.invalidate({ projectId });
      utils.seoActions.list.invalidate({ projectId });
      toast.success(`สร้าง ${data.totalBuilt}/${data.totalPlanned} backlinks สำเร็จ!`);
    },
    onError: (err) => toast.error(err.message),
  });

  // SERP Tracker mutations
  const singleRankMut = trpc.rankings.checkRank.useMutation({
    onSuccess: (data) => {
      utils.rankings.list.invalidate({ projectId });
      utils.seoActions.list.invalidate({ projectId });
      const pos = data.position ? `#${data.position}` : "Not ranked";
      toast.success(`"${data.keyword}" → ${pos}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkRankMut = trpc.rankings.bulkCheck.useMutation({
    onSuccess: (data) => {
      utils.rankings.list.invalidate({ projectId });
      utils.seoProjects.get.invalidate({ id: projectId });
      utils.seoActions.list.invalidate({ projectId });
      utils.snapshots.list.invalidate({ projectId });
      toast.success(`เช็คอันดับ ${data.totalKeywords} keywords เสร็จ! Avg: #${data.avgPosition}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const serpFeaturesMut = trpc.rankings.serpFeatures.useMutation({
    onSuccess: () => {
      toast.success("วิเคราะห์ SERP Features เสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  const competitorMut = trpc.rankings.compareCompetitors.useMutation({
    onSuccess: () => {
      toast.success("เปรียบเทียบคู่แข่งเสร็จแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  // Full SEO Automation
  const fullAutoMut = trpc.seoProjects.runFullAutomation.useMutation({
    onSuccess: (result) => {
      utils.seoProjects.get.invalidate({ id: projectId });
      utils.seoActions.list.invalidate({ projectId });
      utils.backlinks.list.invalidate({ projectId });
      utils.backlinks.stats.invalidate({ projectId });
      utils.rankings.list.invalidate({ projectId });
      utils.snapshots.list.invalidate({ projectId });
      const { completed, failed, skipped } = result.summary;
      if (failed === 0) {
        toast.success(`SEO Automation สำเร็จ! ${completed}/4 ขั้นตอนเสร็จสมบูรณ์`);
      } else {
        toast.warning(`SEO Automation: ${completed} สำเร็จ, ${failed} ล้มเหลว, ${skipped} ข้าม`);
      }
      setActiveTab("dashboard");
    },
    onError: (err) => toast.error(`Automation ล้มเหลว: ${err.message}`),
  });

  const project = data?.project;
  const isAnyRunning = analyzeMut.isPending || strategyMut.isPending || keywordMut.isPending ||
    rankAnalysisMut.isPending || blAnalysisMut.isPending || contentMut.isPending ||
    pbnScoreMut.isPending || pbnAnchorMut.isPending || pbnBuildMut.isPending ||
    singleRankMut.isPending || bulkRankMut.isPending || serpFeaturesMut.isPending ||
    competitorMut.isPending || fullAutoMut.isPending;

  // Deduplicate rankings by keyword (latest entry per keyword)
  const latestRankings = useMemo(() => {
    if (!allRankings) return [];
    const seen = new Map<string, typeof allRankings[0]>();
    for (const r of allRankings) {
      if (!seen.has(r.keyword)) seen.set(r.keyword, r);
    }
    return Array.from(seen.values());
  }, [allRankings]);

  // Compute automation stats for Dashboard/Report
  const automationStats = useMemo(() => {
    if (!actions) return { total: 0, completed: 0, failed: 0, running: 0, byType: {} as Record<string, number>, timeline: [] as any[] };
    const byType: Record<string, number> = {};
    let completed = 0, failed = 0, running = 0;
    for (const a of actions) {
      byType[a.actionType] = (byType[a.actionType] || 0) + 1;
      if (a.status === "completed") completed++;
      else if (a.status === "failed") failed++;
      else if (a.status === "running") running++;
    }
    // Group by date for timeline
    const dateMap = new Map<string, { date: string; count: number; types: string[] }>();
    for (const a of actions) {
      const date = a.createdAt ? new Date(a.createdAt).toLocaleDateString("th-TH") : "ไม่ทราบ";
      if (!dateMap.has(date)) dateMap.set(date, { date, count: 0, types: [] });
      const entry = dateMap.get(date)!;
      entry.count++;
      if (!entry.types.includes(a.actionType)) entry.types.push(a.actionType);
    }
    return { total: actions.length, completed, failed, running, byType, timeline: Array.from(dateMap.values()) };
  }, [actions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">ไม่พบโปรเจค</p>
        <Button variant="outline" onClick={() => navigate("/seo")} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> กลับ
        </Button>
      </div>
    );
  }

  const getMetricColor = (value: number | null | undefined, thresholds: [number, number]) => {
    if (value == null) return "text-zinc-400";
    if (value >= thresholds[1]) return "text-emerald-400";
    if (value >= thresholds[0]) return "text-yellow-400";
    return "text-red-400";
  };

  const getActionIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "running": return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case "failed": return <XCircle className="w-4 h-4 text-red-400" />;
      case "pending": return <Clock className="w-4 h-4 text-zinc-400" />;
      default: return <AlertCircle className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getActionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      analysis: "วิเคราะห์โดเมน",
      keyword_research: "วิจัย Keywords",
      onpage_audit: "ตรวจ On-Page",
      backlink_build: "สร้าง Backlink",
      content_create: "สร้างเนื้อหา",
      pbn_post: "โพสต์ PBN",
      tier2_build: "สร้าง Tier 2",
      social_signal: "Social Signal",
      index_request: "ขอ Index",
      disavow: "Disavow Link",
      strategy_update: "อัพเดท Strategy",
      rank_check: "เช็คอันดับ",
      competitor_analysis: "วิเคราะห์คู่แข่ง",
      algorithm_check: "ตรวจ Algorithm",
      risk_assessment: "ประเมินความเสี่ยง",
    };
    return labels[type] || type;
  };

  const getActionTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      analysis: "bg-violet-500/20 text-violet-400 border-violet-500/30",
      keyword_research: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      backlink_build: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      content_create: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      pbn_post: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      rank_check: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      strategy_update: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      competitor_analysis: "bg-pink-500/20 text-pink-400 border-pink-500/30",
      algorithm_check: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return colors[type] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/seo")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{project.domain}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className={
                project.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                project.status === "analyzing" ? "bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse" :
                "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
              }>
                {project.status === "analyzing" ? "กำลัง Auto-Scan..." : project.status}
              </Badge>
              {project.niche && <Badge variant="outline" className="text-[10px]">{project.niche}</Badge>}
              {project.strategy && <Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30">{project.strategy}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => analyzeMut.mutate({ id: projectId })} disabled={isAnyRunning} className="bg-emerald-600 hover:bg-emerald-700">
            {analyzeMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
            วิเคราะห์
          </Button>
          <Button size="sm" variant="outline" onClick={() => strategyMut.mutate({ id: projectId })} disabled={isAnyRunning}>
            {strategyMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Target className="w-4 h-4 mr-1" />}
            Strategy
          </Button>
          <Button size="sm" variant="outline" onClick={() => keywordMut.mutate({ id: projectId })} disabled={isAnyRunning}>
            {keywordMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
            Keywords
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowContentDialog(true)} disabled={isAnyRunning}>
            <FileText className="w-4 h-4 mr-1" /> Content
          </Button>
        </div>
      </div>

      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 sm:gap-3">
        {[
          { label: "DA", value: project.currentDA, color: getMetricColor(project.currentDA, [20, 40]) },
          { label: "DR", value: project.currentDR, color: getMetricColor(project.currentDR, [20, 40]) },
          { label: "Spam", value: project.currentSpamScore, color: project.currentSpamScore != null ? ((project.currentSpamScore) <= 30 ? "text-emerald-400" : "text-red-400") : "text-zinc-400" },
          { label: "BL", value: project.currentBacklinks?.toLocaleString(), color: "text-amber-400" },
          { label: "RD", value: project.currentReferringDomains?.toLocaleString(), color: "text-blue-400" },
          { label: "TF", value: project.currentTrustFlow, color: getMetricColor(project.currentTrustFlow, [15, 30]) },
          { label: "CF", value: project.currentCitationFlow, color: getMetricColor(project.currentCitationFlow, [15, 30]) },
          { label: "Traffic", value: project.currentOrganicTraffic?.toLocaleString(), color: "text-violet-400" },
          { label: "Health", value: project.aiHealthScore, color: getMetricColor(project.aiHealthScore, [40, 70]) },
        ].map(m => (
          <Card key={m.label} className="bg-card/40">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
              <p className={`text-lg font-bold ${m.color}`}>{m.value ?? "—"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/50 border border-border/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="dashboard" className="text-emerald-400">
            <LayoutDashboard className="w-3 h-3 mr-1" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="backlinks">Backlinks</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="pbn" className="text-violet-400">
            <Network className="w-3 h-3 mr-1" /> PBN Builder
          </TabsTrigger>
          <TabsTrigger value="serp" className="text-cyan-400">
            <Radar className="w-3 h-3 mr-1" /> SERP Tracker
          </TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="report" className="text-amber-400">
            <ClipboardList className="w-3 h-3 mr-1" /> Report
          </TabsTrigger>
          <TabsTrigger value="strategy">Strategy</TabsTrigger>
          <TabsTrigger value="campaign" className="text-orange-400">
            <Zap className="w-3 h-3 mr-1" /> Campaign
          </TabsTrigger>
          <TabsTrigger value="wordpress" className="text-blue-400">
            <Wrench className="w-3 h-3 mr-1" /> WordPress
          </TabsTrigger>
          <TabsTrigger value="daily" className="text-rose-400">
            <Bot className="w-3 h-3 mr-1" /> Daily AI
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-sky-400">
            <Clock className="w-3 h-3 mr-1" /> Timeline
          </TabsTrigger>
          <TabsTrigger value="agent" className="text-amber-400 font-bold">
            <Sparkles className="w-3 h-3 mr-1" /> AI Agent
          </TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW TAB ═══ */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* WP Auto-Setup Progress — shown when pipeline is running or recently completed */}
          {project.wpUsername && project.wpAppPassword && (
            <SetupProgressPanel projectId={projectId} />
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* AI Analysis */}
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-400" /> AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {project.aiLastAnalysis ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{project.aiLastAnalysis}</p>
                ) : project.status === "analyzing" ? (
                  <div className="flex items-center gap-2 text-sm text-blue-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลัง Auto-Scan วิเคราะห์โดเมน...</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">กด "วิเคราะห์" เพื่อให้ AI วิเคราะห์โดเมนนี้</p>
                )}
              </CardContent>
            </Card>

            {/* Backlink Summary */}
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-amber-400" /> Backlink Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {blStats || data?.blStats ? (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { label: "Total", value: (blStats || data?.blStats)?.total || 0, color: "text-foreground" },
                      { label: "Active", value: (blStats || data?.blStats)?.active || 0, color: "text-emerald-400" },
                      { label: "Lost", value: (blStats || data?.blStats)?.lost || 0, color: "text-red-400" },
                      { label: "Dofollow", value: (blStats || data?.blStats)?.dofollow || 0, color: "text-blue-400" },
                      { label: "PBN", value: (blStats || data?.blStats)?.pbn || 0, color: "text-violet-400" },
                      { label: "Avg DA", value: (blStats || data?.blStats)?.avgDA || 0, color: "text-amber-400" },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        <p className={`text-base sm:text-lg font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">ยังไม่มีข้อมูล Backlink</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Rankings */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" /> Keyword Rankings
                {latestRankings.length > 0 && (
                  <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => rankAnalysisMut.mutate({ id: projectId })} disabled={isAnyRunning}>
                    {rankAnalysisMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Brain className="w-3 h-3 mr-1" />}
                    AI Analyze
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latestRankings.length > 0 ? (
                <div className="space-y-2">
                  {latestRankings.slice(0, 10).map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.keyword}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {r.searchVolume && <span>Vol: {r.searchVolume.toLocaleString()}</span>}
                          {r.keywordDifficulty != null && <span>KD: {r.keywordDifficulty}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className={`text-lg font-bold ${r.position ? (r.position <= 10 ? "text-emerald-400" : r.position <= 30 ? "text-yellow-400" : "text-red-400") : "text-zinc-500"}`}>
                          {r.position ? `#${r.position}` : "—"}
                        </p>
                        {r.positionChange != null && r.positionChange !== 0 && (
                          <div className={`flex items-center text-xs ${r.positionChange > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {r.positionChange > 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {Math.abs(r.positionChange)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {latestRankings.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">+{latestRankings.length - 10} more keywords</p>
                  )}
                </div>
              ) : project.status === "analyzing" ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-blue-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>กำลังวิจัย Keywords อัตโนมัติ...</span>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Search className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">กด "Keywords" เพื่อให้ AI วิจัย keywords</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Actions */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" /> Recent Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(actions || data?.recentActions)?.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-border/20 last:border-0">
                  {getActionIcon(a.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {a.createdAt ? new Date(a.createdAt).toLocaleString("th-TH") : "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${getActionTypeColor(a.actionType)}`}>
                    {getActionTypeLabel(a.actionType)}
                  </Badge>
                </div>
              )) || (
                <p className="text-sm text-muted-foreground italic py-4 text-center">ยังไม่มี actions</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ DASHBOARD TAB — SEO Automation Tracking ═══ */}
        <TabsContent value="dashboard" className="space-y-4 mt-4">
          {/* Dashboard Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-emerald-400" /> SEO Automation Dashboard
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">ตรวจสอบว่าระบบทำ SEO automation จริง — ทำอะไร ทำที่ไหน ทำยังไง</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className={`${
                  fullAutoMut.isPending
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30 cursor-wait"
                    : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30"
                } border font-semibold`}
                disabled={isAnyRunning}
                onClick={() => {
                  if (confirm(`เริ่ม SEO Automation เต็มรูปแบบสำหรับ ${project?.domain}?\n\n• สร้างกลยุทธ์ SEO\n• สร้าง Backlinks จาก PBN\n• สร้าง Content อัตโนมัติ\n• ตรวจสอบอันดับ Keywords`)) {
                    fullAutoMut.mutate({ id: projectId });
                  }
                }}
              >
                {fullAutoMut.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> กำลังทำ SEO...</>
                ) : (
                  <><Play className="w-4 h-4 mr-1" /> เริ่ม SEO Auto</>
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-1" /> รีเฟรช
              </Button>
            </div>
          </div>

          {/* Automation Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-card/50">
              <CardContent className="p-4 text-center">
                <Bot className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-emerald-400">{automationStats.total}</p>
                <p className="text-[10px] text-muted-foreground">Actions ทั้งหมด</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4 text-center">
                <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-emerald-400">{automationStats.completed}</p>
                <p className="text-[10px] text-muted-foreground">สำเร็จ</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4 text-center">
                <XCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-400">{automationStats.failed}</p>
                <p className="text-[10px] text-muted-foreground">ล้มเหลว</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4 text-center">
                <Loader2 className={`w-6 h-6 text-blue-400 mx-auto mb-1 ${automationStats.running > 0 ? "animate-spin" : ""}`} />
                <p className="text-2xl font-bold text-blue-400">{automationStats.running}</p>
                <p className="text-[10px] text-muted-foreground">กำลังทำงาน</p>
              </CardContent>
            </Card>
          </div>

          {/* Automation Breakdown by Type */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-400" /> ระบบทำอะไรบ้าง (แยกตามประเภท)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(automationStats.byType).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(automationStats.byType)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center gap-3 p-3 rounded-lg bg-card/30 border border-border/20">
                        <div className="flex-1 min-w-0">
                          <Badge variant="outline" className={`text-[10px] ${getActionTypeColor(type)}`}>
                            {getActionTypeLabel(type)}
                          </Badge>
                          <p className="text-lg font-bold mt-1">{count} ครั้ง</p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic text-center py-4">ยังไม่มีข้อมูล automation</p>
              )}
            </CardContent>
          </Card>

          {/* Automation Timeline */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" /> Timeline — ทำเมื่อไหร่
              </CardTitle>
            </CardHeader>
            <CardContent>
              {automationStats.timeline.length > 0 ? (
                <div className="space-y-2">
                  {automationStats.timeline.map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card/30 border border-border/20">
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{entry.date}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.types.map((t: string, j: number) => (
                            <Badge key={j} variant="outline" className={`text-[10px] ${getActionTypeColor(t)}`}>
                              {getActionTypeLabel(t)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <p className="text-lg font-bold text-foreground">{entry.count}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic text-center py-4">ยังไม่มีข้อมูล</p>
              )}
            </CardContent>
          </Card>

          {/* Detailed Action Log with full info */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-400" /> รายละเอียด — ทำยังไง (ล่าสุด 20 รายการ)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actions && actions.length > 0 ? (
                <div className="space-y-3">
                  {actions.slice(0, 20).map((a, i) => (
                    <div key={i} className="p-3 rounded-lg bg-card/30 border border-border/20">
                      <div className="flex items-start gap-3">
                        {getActionIcon(a.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{a.title}</p>
                            <Badge variant="outline" className={`text-[10px] ${getActionTypeColor(a.actionType)}`}>
                              {getActionTypeLabel(a.actionType)}
                            </Badge>
                            {a.impact && a.impact !== "unknown" && (
                              <Badge variant="outline" className={
                                a.impact === "positive" ? "text-emerald-400 border-emerald-500/30" :
                                a.impact === "negative" ? "text-red-400 border-red-500/30" : "text-zinc-400"
                              }>
                                {a.impact === "positive" ? "ผลดี" : a.impact === "negative" ? "ผลเสีย" : "ปกติ"}
                              </Badge>
                            )}
                          </div>
                          {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                          {a.errorMessage && <p className="text-xs text-red-400 mt-1">Error: {a.errorMessage}</p>}
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              เริ่ม: {a.createdAt ? new Date(a.createdAt).toLocaleString("th-TH") : "—"}
                            </span>
                            {a.completedAt && (
                              <span className="flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                เสร็จ: {new Date(a.completedAt).toLocaleString("th-TH")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic text-center py-4">ยังไม่มี actions</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ BACKLINKS TAB ═══ */}
        <TabsContent value="backlinks" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Backlink Profile</h3>
            <Button size="sm" variant="outline" onClick={() => blAnalysisMut.mutate({ id: projectId })} disabled={isAnyRunning}>
              {blAnalysisMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
              AI Analyze
            </Button>
          </div>

          {blAnalysisMut.data && (
            <Card className="bg-violet-500/5 border-violet-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold text-violet-400">AI Backlink Analysis</span>
                  <Badge variant="outline" className="ml-auto">Health: {blAnalysisMut.data.profileHealth}/100</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{blAnalysisMut.data.aiSummary}</p>
                {blAnalysisMut.data.recommendations.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-semibold text-violet-400">Recommendations:</p>
                    {blAnalysisMut.data.recommendations.map((r: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">• {r}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {backlinks && backlinks.length > 0 ? (
            <Card className="bg-card/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left p-3 text-xs text-muted-foreground">Source</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">DA</th>
                        <th className="text-left p-3 text-xs text-muted-foreground">Anchor</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">Type</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">Source</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backlinks.map((bl, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-card/30">
                          <td className="p-3 max-w-[200px] truncate">{bl.sourceDomain}</td>
                          <td className="p-3 text-center font-mono">{bl.sourceDA ?? "—"}</td>
                          <td className="p-3 max-w-[150px] truncate text-muted-foreground">{bl.anchorText || "—"}</td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className={bl.linkType === "dofollow" ? "text-emerald-400 border-emerald-500/30" : "text-zinc-400"}>
                              {bl.linkType}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className="text-[10px]">{bl.sourceType}</Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className={
                              bl.status === "active" ? "text-emerald-400 border-emerald-500/30" :
                              bl.status === "lost" ? "text-red-400 border-red-500/30" : "text-zinc-400"
                            }>{bl.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card/30 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Link2 className="w-12 h-12 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">ยังไม่มี Backlinks ในระบบ</p>
                <p className="text-xs text-muted-foreground mt-1">ใช้ PBN Builder เพื่อสร้าง backlinks อัตโนมัติ</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ RANKINGS TAB ═══ */}
        <TabsContent value="rankings" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Keyword Rankings ({latestRankings.length})</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => keywordMut.mutate({ id: projectId })} disabled={isAnyRunning}>
                {keywordMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
                Research More
              </Button>
              {latestRankings.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => rankAnalysisMut.mutate({ id: projectId })} disabled={isAnyRunning}>
                  {rankAnalysisMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
                  AI Analyze
                </Button>
              )}
            </div>
          </div>

          {rankAnalysisMut.data && (
            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">AI Rank Analysis</span>
                  <Badge variant="outline" className="ml-auto">{rankAnalysisMut.data.overallTrend}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{rankAnalysisMut.data.aiSummary}</p>
                {rankAnalysisMut.data.nextActions.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-semibold text-emerald-400">Next Actions:</p>
                    {rankAnalysisMut.data.nextActions.map((a: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">• {a}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {keywordMut.data && (
            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-semibold text-blue-400">Keyword Research Results</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{keywordMut.data.aiInsights}</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold mb-2">Primary Keywords</p>
                    {keywordMut.data.primaryKeywords.slice(0, 8).map((kw: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1">
                        <span className="truncate">{kw.keyword}</span>
                        <span className="text-muted-foreground ml-2">Vol:{kw.searchVolume} KD:{kw.difficulty}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2">Long-tail Keywords</p>
                    {keywordMut.data.longTailKeywords.slice(0, 8).map((kw: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1">
                        <span className="truncate">{kw.keyword}</span>
                        <span className="text-muted-foreground ml-2">Vol:{kw.searchVolume} KD:{kw.difficulty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {latestRankings.length > 0 ? (
            <Card className="bg-card/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left p-3 text-xs text-muted-foreground">Keyword</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">Position</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">Change</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">Volume</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">KD</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">CPC</th>
                        <th className="text-center p-3 text-xs text-muted-foreground">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestRankings.map((r, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-card/30">
                          <td className="p-3 max-w-[200px] truncate font-medium">{r.keyword}</td>
                          <td className="p-3 text-center">
                            <span className={`font-bold ${r.position ? (r.position <= 10 ? "text-emerald-400" : r.position <= 30 ? "text-yellow-400" : "text-red-400") : "text-zinc-500"}`}>
                              {r.position ? `#${r.position}` : "—"}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {r.positionChange != null && r.positionChange !== 0 ? (
                              <span className={`flex items-center justify-center gap-0.5 ${r.positionChange > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {r.positionChange > 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {Math.abs(r.positionChange)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-3 text-center text-muted-foreground">{r.searchVolume?.toLocaleString() || "—"}</td>
                          <td className="p-3 text-center text-muted-foreground">{r.keywordDifficulty ?? "—"}</td>
                          <td className="p-3 text-center text-muted-foreground">{r.cpc ? `$${r.cpc}` : "—"}</td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className={
                              r.trend === "rising" ? "text-emerald-400 border-emerald-500/30" :
                              r.trend === "falling" ? "text-red-400 border-red-500/30" : "text-zinc-400"
                            }>{r.trend || "new"}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card/30 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BarChart3 className="w-12 h-12 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">ยังไม่มี Keywords</p>
                <p className="text-xs text-muted-foreground mt-1">กด "Keywords" เพื่อให้ AI วิจัย keywords ที่เหมาะกับโดเมนนี้</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ PBN BUILDER TAB ═══ */}
        <TabsContent value="pbn" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Network className="w-4 h-4 text-violet-400" /> PBN Link Builder
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">สร้าง backlinks จาก PBN network อัตโนมัติ</p>
            </div>
          </div>

          {/* PBN Actions */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-violet-500/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-violet-400" />
                  <div>
                    <p className="text-sm font-semibold">Score PBN Sites</p>
                    <p className="text-[10px] text-muted-foreground">AI จัดอันดับ PBN ที่เหมาะกับโปรเจคนี้</p>
                  </div>
                </div>
                <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => pbnScoreMut.mutate({ projectId })} disabled={isAnyRunning}>
                  {pbnScoreMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
                  Score Sites
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-violet-500/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold">Anchor Plan</p>
                    <p className="text-[10px] text-muted-foreground">AI สร้างแผน anchor text ที่ดูเป็นธรรมชาติ</p>
                  </div>
                </div>
                <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => pbnAnchorMut.mutate({ projectId, linkCount: pbnLinkCount[0] })} disabled={isAnyRunning}>
                  {pbnAnchorMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Target className="w-4 h-4 mr-1" />}
                  Generate Plan
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-emerald-500/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold">Build Links</p>
                    <p className="text-[10px] text-muted-foreground">สร้าง backlinks จาก PBN ทันที</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">จำนวน links:</span>
                    <span className="font-bold text-emerald-400">{pbnLinkCount[0]}</span>
                  </div>
                  <Slider value={pbnLinkCount} onValueChange={setPbnLinkCount} min={1} max={20} step={1} className="w-full" />
                </div>
                <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => pbnBuildMut.mutate({ projectId, linkCount: pbnLinkCount[0] })} disabled={isAnyRunning}>
                  {pbnBuildMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
                  Build {pbnLinkCount[0]} Links
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* PBN Score Results */}
          {pbnScoreMut.data && (
            <Card className="bg-violet-500/5 border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-violet-400" /> PBN Site Scores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pbnScoreMut.data.slice(0, 10).map((site: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border/10 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{site.domain}</p>
                        <p className="text-[10px] text-muted-foreground">DA:{site.da} DR:{site.dr}</p>
                      </div>
                      <Badge variant="outline" className={site.score >= 70 ? "text-emerald-400 border-emerald-500/30" : site.score >= 40 ? "text-yellow-400 border-yellow-500/30" : "text-red-400 border-red-500/30"}>
                        Score: {site.score}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Anchor Plan Results */}
          {pbnAnchorMut.data && (
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-amber-400" /> Anchor Text Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-violet-400 mb-2">Distribution</p>
                    {(pbnAnchorMut.data.anchors || []).map((d: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs py-1">
                        <span>{d.type}: {d.text}</span>
                        <span className="text-muted-foreground">{d.percentage}%</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-400 mb-2">Planned Anchors</p>
                    {(pbnAnchorMut.data.anchors || []).slice(0, 10).map((a: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs py-1">
                        <span className="truncate">{a.text}</span>
                        <Badge variant="outline" className="text-[10px] ml-2">{a.type}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">{pbnAnchorMut.data.aiReasoning}</p>
              </CardContent>
            </Card>
          )}

          {/* Build Results */}
          {pbnBuildMut.data && (
            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" /> Build Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-400">{pbnBuildMut.data.totalBuilt}</p>
                    <p className="text-[10px] text-muted-foreground">Success</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{pbnBuildMut.data.totalFailed}</p>
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{pbnBuildMut.data.totalPlanned}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                </div>
                {pbnBuildMut.data.posts && (
                  <div className="space-y-1">
                    {pbnBuildMut.data.posts.map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1">
                        {r.status === "published" ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                        <span className="truncate">{r.siteName}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="truncate text-muted-foreground">{r.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ SERP TRACKER TAB ═══ */}
        <TabsContent value="serp" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Radar className="w-4 h-4 text-cyan-400" /> Live SERP Tracker
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">เช็คอันดับ keyword แบบ real-time ด้วย AI</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-cyan-500/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-cyan-400" />
                  <div>
                    <p className="text-sm font-semibold">Check Single Keyword</p>
                    <p className="text-[10px] text-muted-foreground">เช็คอันดับ keyword เดียวแบบละเอียด</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="e.g. best crypto wallet" value={singleKeyword} onChange={e => setSingleKeyword(e.target.value)} className="text-sm" />
                  <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 shrink-0" onClick={() => { if (!singleKeyword.trim()) return; singleRankMut.mutate({ projectId, keyword: singleKeyword.trim() }); }} disabled={isAnyRunning || !singleKeyword.trim()}>
                    {singleRankMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-cyan-500/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold">Bulk Rank Check</p>
                    <p className="text-[10px] text-muted-foreground">เช็คอันดับทุก keyword ที่ track อยู่ ({latestRankings.length} keywords)</p>
                  </div>
                </div>
                <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => bulkRankMut.mutate({ projectId })} disabled={isAnyRunning || latestRankings.length === 0}>
                  {bulkRankMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  Check All Rankings
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-cyan-500/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold">SERP Features</p>
                    <p className="text-[10px] text-muted-foreground">วิเคราะห์ SERP features (snippets, PAA, AI overview)</p>
                  </div>
                </div>
                <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => serpFeaturesMut.mutate({ projectId })} disabled={isAnyRunning || latestRankings.length === 0}>
                  {serpFeaturesMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
                  Analyze Features
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-cyan-500/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-violet-400" />
                  <div>
                    <p className="text-sm font-semibold">Competitor Compare</p>
                    <p className="text-[10px] text-muted-foreground">เปรียบเทียบอันดับกับคู่แข่ง</p>
                  </div>
                </div>
                <Input placeholder="competitor1.com, competitor2.com" value={competitorDomains} onChange={e => setCompetitorDomains(e.target.value)} className="text-sm" />
                <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => { const comps = competitorDomains.split(",").map(d => d.trim()).filter(Boolean); if (comps.length === 0) return toast.error("ใส่โดเมนคู่แข่งอย่างน้อย 1 ตัว"); competitorMut.mutate({ projectId, competitors: comps }); }} disabled={isAnyRunning || !competitorDomains.trim() || latestRankings.length === 0}>
                  {competitorMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Users className="w-4 h-4 mr-1" />}
                  Compare
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Single Rank Result */}
          {singleRankMut.data && (
            <Card className="bg-cyan-500/5 border-cyan-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="w-4 h-4 text-cyan-400" /> Rank Result: "{singleRankMut.data.keyword}"
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Position</p>
                    <p className={`text-2xl font-bold ${singleRankMut.data.position ? (singleRankMut.data.position <= 10 ? "text-emerald-400" : singleRankMut.data.position <= 30 ? "text-yellow-400" : "text-red-400") : "text-zinc-500"}`}>
                      {singleRankMut.data.position ? `#${singleRankMut.data.position}` : "N/A"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Change</p>
                    <p className={`text-2xl font-bold ${singleRankMut.data.change > 0 ? "text-emerald-400" : singleRankMut.data.change < 0 ? "text-red-400" : "text-zinc-400"}`}>
                      {singleRankMut.data.change > 0 ? `+${singleRankMut.data.change}` : singleRankMut.data.change || "—"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Search Volume</p>
                    <p className="text-2xl font-bold text-foreground">{singleRankMut.data.searchVolume?.toLocaleString() || "—"}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Difficulty</p>
                    <p className="text-2xl font-bold text-foreground">{singleRankMut.data.difficulty || "—"}</p>
                  </div>
                </div>
                {singleRankMut.data.url && (
                  <div className="mb-3 p-3 rounded-lg bg-card/30">
                    <p className="text-xs text-muted-foreground">Ranking URL</p>
                    <p className="text-sm text-cyan-400 truncate">{singleRankMut.data.url}</p>
                    {singleRankMut.data.title && <p className="text-xs text-muted-foreground mt-1">{singleRankMut.data.title}</p>}
                  </div>
                )}
                {singleRankMut.data.serpFeatures?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold mb-2">SERP Features</p>
                    <div className="flex flex-wrap gap-1">
                      {singleRankMut.data.serpFeatures.map((f: any, i: number) => (
                        <Badge key={i} variant="outline" className={f.ownsFeature ? "text-emerald-400 border-emerald-500/30" : "text-zinc-400"}>
                          {f.type.replace(/_/g, " ")} {f.ownsFeature && "✓"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {singleRankMut.data.competitors?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2">Top Competitors</p>
                    {singleRankMut.data.competitors.slice(0, 5).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1">
                        <span className="truncate">{c.domain}</span>
                        <span className="text-muted-foreground">#{c.position}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Bulk Check Result */}
          {bulkRankMut.data && (
            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" /> Bulk Check Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  {[
                    { label: "Keywords", value: bulkRankMut.data.totalKeywords, color: "text-foreground" },
                    { label: "Avg Position", value: `#${bulkRankMut.data.avgPosition}`, color: "text-blue-400" },
                    { label: "Top 10", value: bulkRankMut.data.top10, color: "text-emerald-400" },
                    { label: "Improved", value: bulkRankMut.data.improved, color: "text-emerald-400" },
                    { label: "Declined", value: bulkRankMut.data.declined, color: "text-red-400" },
                  ].map(m => (
                    <div key={m.label} className="text-center">
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* SERP Features Result */}
          {serpFeaturesMut.data && (
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4 text-amber-400" /> SERP Features Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {serpFeaturesMut.data.opportunities?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-amber-400 mb-1">Opportunities</p>
                    {serpFeaturesMut.data.opportunities.map((o: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground py-0.5">• {o}</p>
                    ))}
                  </div>
                )}
                {serpFeaturesMut.data.features && (
                  <div className="space-y-2">
                    {serpFeaturesMut.data.features.slice(0, 10).map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-border/10 last:border-0">
                        <span className="text-xs truncate">{f.keyword}</span>
                        <div className="flex gap-1">
                          {f.features.map((feat: any, j: number) => (
                            <Badge key={j} variant="outline" className={`text-[10px] ${feat.ownsFeature ? "text-emerald-400" : "text-zinc-400"}`}>
                              {feat.type.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {serpFeaturesMut.data.aiInsights && (
                  <p className="text-xs text-muted-foreground mt-3">{serpFeaturesMut.data.aiInsights}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Competitor Comparison Result */}
          {competitorMut.data && (
            <Card className="bg-violet-500/5 border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-violet-400" /> Competitor Comparison
                  <Badge variant="outline" className="ml-auto text-emerald-400">Winner: {competitorMut.data.overallWinner}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {competitorMut.data.comparison && (
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left p-2 text-muted-foreground">Keyword</th>
                          {competitorMut.data.comparison[0]?.positions.map((p: any, i: number) => (
                            <th key={i} className="text-center p-2 text-muted-foreground">{p.domain}</th>
                          ))}
                          <th className="text-center p-2 text-muted-foreground">Leader</th>
                        </tr>
                      </thead>
                      <tbody>
                        {competitorMut.data.comparison.slice(0, 15).map((row: any, i: number) => (
                          <tr key={i} className="border-b border-border/10">
                            <td className="p-2 truncate max-w-[150px]">{row.keyword}</td>
                            {row.positions.map((p: any, j: number) => (
                              <td key={j} className={`p-2 text-center font-mono ${p.position && p.position <= 10 ? "text-emerald-400" : p.position && p.position <= 30 ? "text-yellow-400" : "text-zinc-400"}`}>
                                {p.position ? `#${p.position}` : "—"}
                              </td>
                            ))}
                            <td className="p-2 text-center text-emerald-400 font-semibold">{row.leader}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {competitorMut.data.domainStrengths && competitorMut.data.domainStrengths.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-xs font-semibold text-emerald-400 mb-1">Strengths</p>
                      {competitorMut.data.domainStrengths.map((s: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">✓ {s}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-red-400 mb-1">Weaknesses</p>
                      {competitorMut.data.domainWeaknesses?.map((w: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">✗ {w}</p>
                      ))}
                    </div>
                  </div>
                )}
                {competitorMut.data.aiAnalysis && (
                  <p className="text-xs text-muted-foreground">{competitorMut.data.aiAnalysis}</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ ACTIONS LOG TAB ═══ */}
        <TabsContent value="actions" className="space-y-4 mt-4">
          <h3 className="text-sm font-semibold">AI Actions Log</h3>
          {actions && actions.length > 0 ? (
            <div className="space-y-2">
              {actions.map((a, i) => (
                <Card key={i} className="bg-card/40">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {getActionIcon(a.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{a.title}</p>
                          <Badge variant="outline" className={`text-[10px] ${getActionTypeColor(a.actionType)}`}>
                            {getActionTypeLabel(a.actionType)}
                          </Badge>
                          {a.impact && a.impact !== "unknown" && (
                            <Badge variant="outline" className={
                              a.impact === "positive" ? "text-emerald-400 border-emerald-500/30" :
                              a.impact === "negative" ? "text-red-400 border-red-500/30" : "text-zinc-400"
                            }>{a.impact === "positive" ? "ผลดี" : a.impact === "negative" ? "ผลเสีย" : "ปกติ"}</Badge>
                          )}
                        </div>
                        {a.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                        {a.errorMessage && <p className="text-xs text-red-400 mt-1">{a.errorMessage}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {a.createdAt ? new Date(a.createdAt).toLocaleString("th-TH") : ""}
                          {a.completedAt && ` → ${new Date(a.completedAt).toLocaleString("th-TH")}`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-card/30 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Activity className="w-12 h-12 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">ยังไม่มี actions</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ REPORT TAB — Enterprise SEO Report ═══ */}
        <TabsContent value="report" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-amber-400" /> SEO Automation Report
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">รายงานสรุป SEO automation ที่ตรวจสอบได้ — Enterprise Grade</p>
            </div>
          </div>

          {/* Report Summary */}
          <Card className="bg-gradient-to-br from-emerald-500/5 to-blue-500/5 border-emerald-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" /> สรุปภาพรวม — {project.domain}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 rounded-lg bg-card/30">
                  <p className="text-[10px] text-muted-foreground">สถานะ</p>
                  <Badge variant="outline" className={
                    project.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 mt-1" :
                    "bg-zinc-500/20 text-zinc-400 border-zinc-500/30 mt-1"
                  }>{project.status}</Badge>
                </div>
                <div className="text-center p-3 rounded-lg bg-card/30">
                  <p className="text-[10px] text-muted-foreground">Health Score</p>
                  <p className={`text-2xl font-bold ${getMetricColor(project.aiHealthScore, [40, 70])}`}>{project.aiHealthScore ?? "—"}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-card/30">
                  <p className="text-[10px] text-muted-foreground">ความเสี่ยง</p>
                  <Badge variant="outline" className={
                    project.aiRiskLevel === "low" ? "text-emerald-400 border-emerald-500/30 mt-1" :
                    project.aiRiskLevel === "medium" ? "text-yellow-400 border-yellow-500/30 mt-1" :
                    "text-red-400 border-red-500/30 mt-1"
                  }>{project.aiRiskLevel || "—"}</Badge>
                </div>
                <div className="text-center p-3 rounded-lg bg-card/30">
                  <p className="text-[10px] text-muted-foreground">วิเคราะห์ล่าสุด</p>
                  <p className="text-xs font-medium mt-1">{project.lastAnalyzedAt ? new Date(project.lastAnalyzedAt).toLocaleDateString("th-TH") : "ยังไม่ได้วิเคราะห์"}</p>
                </div>
              </div>

              {/* AI Summary */}
              {project.aiLastAnalysis && (
                <div className="p-3 rounded-lg bg-card/30 border border-border/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-semibold text-violet-400">AI วิเคราะห์</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{project.aiLastAnalysis}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SEO Metrics Report */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" /> ตัวชี้วัด SEO (Metrics)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left p-2 text-xs text-muted-foreground">Metric</th>
                      <th className="text-center p-2 text-xs text-muted-foreground">ค่าปัจจุบัน</th>
                      <th className="text-center p-2 text-xs text-muted-foreground">ระดับ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "Domain Authority (DA)", value: project.currentDA, good: 40, ok: 20 },
                      { name: "Domain Rating (DR)", value: project.currentDR, good: 40, ok: 20 },
                      { name: "Spam Score", value: project.currentSpamScore, good: 10, ok: 30, inverse: true },
                      { name: "Trust Flow (TF)", value: project.currentTrustFlow, good: 30, ok: 15 },
                      { name: "Citation Flow (CF)", value: project.currentCitationFlow, good: 30, ok: 15 },
                      { name: "Backlinks", value: project.currentBacklinks, good: 100, ok: 20 },
                      { name: "Referring Domains", value: project.currentReferringDomains, good: 50, ok: 10 },
                      { name: "Organic Traffic", value: project.currentOrganicTraffic, good: 1000, ok: 100 },
                    ].map((m, i) => {
                      const level = m.value == null ? "ไม่มีข้อมูล" :
                        m.inverse ? (m.value <= m.good ? "ดี" : m.value <= m.ok ? "ปานกลาง" : "ต้องปรับปรุง") :
                        (m.value >= m.good ? "ดี" : m.value >= m.ok ? "ปานกลาง" : "ต้องปรับปรุง");
                      const levelColor = level === "ดี" ? "text-emerald-400" : level === "ปานกลาง" ? "text-yellow-400" : level === "ต้องปรับปรุง" ? "text-red-400" : "text-zinc-400";
                      return (
                        <tr key={i} className="border-b border-border/10">
                          <td className="p-2 text-sm">{m.name}</td>
                          <td className="p-2 text-center font-mono font-bold">{m.value?.toLocaleString() ?? "—"}</td>
                          <td className={`p-2 text-center text-xs font-semibold ${levelColor}`}>{level}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Keyword Performance Report */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan-400" /> Keywords Performance ({latestRankings.length} keywords)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latestRankings.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="text-center p-2 rounded-lg bg-card/30">
                      <p className="text-[10px] text-muted-foreground">Top 10</p>
                      <p className="text-lg font-bold text-emerald-400">{latestRankings.filter(r => r.position && r.position <= 10).length}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-card/30">
                      <p className="text-[10px] text-muted-foreground">Top 30</p>
                      <p className="text-lg font-bold text-yellow-400">{latestRankings.filter(r => r.position && r.position <= 30).length}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-card/30">
                      <p className="text-[10px] text-muted-foreground">50+</p>
                      <p className="text-lg font-bold text-red-400">{latestRankings.filter(r => r.position && r.position > 50).length}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-card/30">
                      <p className="text-[10px] text-muted-foreground">Not Ranked</p>
                      <p className="text-lg font-bold text-zinc-400">{latestRankings.filter(r => !r.position).length}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left p-2 text-muted-foreground">Keyword</th>
                          <th className="text-center p-2 text-muted-foreground">อันดับ</th>
                          <th className="text-center p-2 text-muted-foreground">Volume</th>
                          <th className="text-center p-2 text-muted-foreground">KD</th>
                          <th className="text-center p-2 text-muted-foreground">Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestRankings.slice(0, 20).map((r, i) => (
                          <tr key={i} className="border-b border-border/10">
                            <td className="p-2 truncate max-w-[200px]">{r.keyword}</td>
                            <td className={`p-2 text-center font-bold ${r.position ? (r.position <= 10 ? "text-emerald-400" : r.position <= 30 ? "text-yellow-400" : "text-red-400") : "text-zinc-500"}`}>
                              {r.position ? `#${r.position}` : "—"}
                            </td>
                            <td className="p-2 text-center text-muted-foreground">{r.searchVolume?.toLocaleString() || "—"}</td>
                            <td className="p-2 text-center text-muted-foreground">{r.keywordDifficulty ?? "—"}</td>
                            <td className="p-2 text-center">
                              <Badge variant="outline" className={
                                r.trend === "rising" ? "text-emerald-400 border-emerald-500/30" :
                                r.trend === "falling" ? "text-red-400 border-red-500/30" : "text-zinc-400"
                              }>{r.trend || "new"}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic text-center py-4">ยังไม่มีข้อมูล Keywords</p>
              )}
            </CardContent>
          </Card>

          {/* Automation Activity Report */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" /> สรุป Automation Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="text-center p-2 rounded-lg bg-card/30">
                  <p className="text-[10px] text-muted-foreground">Actions ทั้งหมด</p>
                  <p className="text-lg font-bold text-foreground">{automationStats.total}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-card/30">
                  <p className="text-[10px] text-muted-foreground">สำเร็จ</p>
                  <p className="text-lg font-bold text-emerald-400">{automationStats.completed}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-card/30">
                  <p className="text-[10px] text-muted-foreground">ล้มเหลว</p>
                  <p className="text-lg font-bold text-red-400">{automationStats.failed}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-card/30">
                  <p className="text-[10px] text-muted-foreground">อัตราสำเร็จ</p>
                  <p className="text-lg font-bold text-blue-400">
                    {automationStats.total > 0 ? Math.round((automationStats.completed / automationStats.total) * 100) : 0}%
                  </p>
                </div>
              </div>

              {/* Action type breakdown table */}
              {Object.keys(automationStats.byType).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left p-2 text-muted-foreground">ประเภท Action</th>
                        <th className="text-center p-2 text-muted-foreground">จำนวน</th>
                        <th className="text-center p-2 text-muted-foreground">สัดส่วน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(automationStats.byType)
                        .sort(([, a], [, b]) => b - a)
                        .map(([type, count]) => (
                          <tr key={type} className="border-b border-border/10">
                            <td className="p-2">
                              <Badge variant="outline" className={`text-[10px] ${getActionTypeColor(type)}`}>
                                {getActionTypeLabel(type)}
                              </Badge>
                            </td>
                            <td className="p-2 text-center font-bold">{count}</td>
                            <td className="p-2 text-center text-muted-foreground">
                              {automationStats.total > 0 ? Math.round((count / automationStats.total) * 100) : 0}%
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Snapshots History */}
          {snapshots && snapshots.length > 0 && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-violet-400" /> ประวัติ Snapshots ({snapshots.length} records)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left p-2 text-muted-foreground">วันที่</th>
                        <th className="text-center p-2 text-muted-foreground">DA</th>
                        <th className="text-center p-2 text-muted-foreground">DR</th>
                        <th className="text-center p-2 text-muted-foreground">Spam</th>
                        <th className="text-center p-2 text-muted-foreground">BL</th>
                        <th className="text-center p-2 text-muted-foreground">Traffic</th>
                        <th className="text-center p-2 text-muted-foreground">Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.slice(0, 10).map((s, i) => (
                        <tr key={i} className="border-b border-border/10">
                          <td className="p-2">{s.snapshotDate ? new Date(s.snapshotDate).toLocaleDateString("th-TH") : "—"}</td>
                          <td className="p-2 text-center font-mono">{s.da ?? "—"}</td>
                          <td className="p-2 text-center font-mono">{s.dr ?? "—"}</td>
                          <td className="p-2 text-center font-mono">{s.spamScore ?? "—"}</td>
                          <td className="p-2 text-center font-mono">{s.backlinks ?? "—"}</td>
                          <td className="p-2 text-center font-mono">{s.organicTraffic ?? "—"}</td>
                          <td className="p-2 text-center">
                            <span className={`font-bold ${getMetricColor(s.aiHealthScore, [40, 70])}`}>{s.aiHealthScore ?? "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ STRATEGY TAB ═══ */}
        <TabsContent value="strategy" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">AI Strategy</h3>
            <Button size="sm" variant="outline" onClick={() => strategyMut.mutate({ id: projectId })} disabled={isAnyRunning}>
              {strategyMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Regenerate
            </Button>
          </div>

          {strategyMut.data ? (
            <div className="space-y-4">
              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Execution Phases</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {strategyMut.data.phases.map((phase: any, i: number) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg bg-card/30 border border-border/20">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-emerald-400">{phase.phase}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{phase.name}</p>
                          <Badge variant="outline" className={
                            phase.priority === "critical" ? "text-red-400 border-red-500/30" :
                            phase.priority === "high" ? "text-orange-400 border-orange-500/30" : "text-zinc-400"
                          }>{phase.priority}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">{phase.estimatedDuration}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{phase.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {phase.actions.map((a: string, j: number) => (
                            <Badge key={j} variant="outline" className="text-[10px]">{a}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Backlink Building Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-emerald-400 mb-2">Tier 1 Links</p>
                      {strategyMut.data.backlinkPlan.tier1.map((t: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs py-1">
                          <span>{t.type}</span>
                          <span className="text-muted-foreground">{t.count}x (DA {t.targetDA}+)</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-blue-400 mb-2">Tier 2 Links</p>
                      {strategyMut.data.backlinkPlan.tier2.map((t: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs py-1">
                          <span>{t.type}</span>
                          <span className="text-muted-foreground">{t.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Monthly target: <span className="text-foreground font-semibold">{strategyMut.data.backlinkPlan.monthlyTarget} links</span>
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" /> Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-red-400 mb-2">Risks</p>
                      {[strategyMut.data.riskAssessment.penaltyRisk, strategyMut.data.riskAssessment.detectionRisk].map((r: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground py-0.5">⚠ {i === 0 ? 'Penalty Risk' : 'Detection Risk'}: {r}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-emerald-400 mb-2">Mitigations</p>
                      {strategyMut.data.riskAssessment.mitigationSteps.map((m: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground py-0.5">✓ {m}</p>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">{(strategyMut.data as any).aiReasoning || ''}</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="bg-card/30 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className="w-12 h-12 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">กด "Strategy" เพื่อให้ AI สร้างแผน SEO</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ CAMPAIGN TAB ═══ */}
        <TabsContent value="campaign" className="space-y-4 mt-4">
          <CampaignTab projectId={projectId} project={project} />
        </TabsContent>

        {/* ═══ WORDPRESS TAB ═══ */}
        <TabsContent value="wordpress" className="space-y-4 mt-4">
          <WordPressTab projectId={projectId} project={project} />
        </TabsContent>

        {/* ═══ DAILY AI TAB ═══ */}
        <TabsContent value="daily" className="space-y-4 mt-4">
          <DailyAITab projectId={projectId} project={project} />
        </TabsContent>

        {/* ═══ TIMELINE TAB ═══ */}
        <TabsContent value="timeline" className="space-y-4 mt-4">
          <TimelineTab projectId={projectId} project={project} />
        </TabsContent>

        {/* ═══ AI AGENT TAB ═══ */}
        <TabsContent value="agent" className="space-y-4 mt-4">
          <AIAgentTab projectId={projectId} project={project} />
        </TabsContent>
      </Tabs>

      {/* Content Generation Dialog */}
      <Sheet open={showContentDialog} onOpenChange={setShowContentDialog}>
        <SheetContent side="bottom" className="max-w-md mx-auto px-6 pb-6">
          <SheetHeader>
            <SheetTitle>สร้างเนื้อหา SEO</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <Label>Target Keyword</Label>
              <Input placeholder="e.g. best crypto wallet 2024" value={contentKeyword} onChange={e => setContentKeyword(e.target.value)} />
            </div>
          </div>
          <SheetFooter className="flex-row gap-2 pt-4 border-t border-border">
            <Button variant="outline" className="flex-1" onClick={() => setShowContentDialog(false)}>ยกเลิก</Button>
            <Button onClick={() => contentMut.mutate({ id: projectId, keyword: contentKeyword })} disabled={!contentKeyword.trim() || contentMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
              {contentMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
              สร้างเนื้อหา
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}


// ═══ Campaign Tab Component ═══
function CampaignTab({ projectId, project }: { projectId: number; project: any }) {
  const utils = trpc.useUtils();

  const { data: campaignRaw, isLoading, refetch } = trpc.seoProjects.getCampaignStatus.useQuery(
    { id: projectId },
    { enabled: !!projectId, refetchInterval: (project as any)?.campaignStatus === "running" ? 5000 : false }
  );
  const campaign = campaignRaw as any;

  const runNextPhase = trpc.seoProjects.runNextPhase.useMutation({
    onSuccess: (result) => {
      refetch();
      utils.seoProjects.get.invalidate({ id: projectId });
      utils.seoActions.list.invalidate({ projectId });
      toast.success(`เฟส ${result.phase + 1} เสร็จ: ${result.phaseName}`, {
        description: `WP Changes: ${result.wpChanges}, Duration: ${Math.round(result.duration / 1000)}s`,
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const runAllPhases = trpc.seoProjects.runAllCampaignPhases.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("เริ่มรัน Campaign ทั้งหมดแล้ว! ระบบจะทำงานในพื้นหลัง", {
        description: "กลับมาดูความคืบหน้าได้ตลอด",
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const resetCampaign = trpc.seoProjects.resetCampaign.useMutation({
    onSuccess: () => {
      refetch();
      utils.seoProjects.get.invalidate({ id: projectId });
      toast.success("รีเซ็ต Campaign แล้ว — เริ่มใหม่ได้");
    },
  });

  const resumeCampaign = trpc.seoProjects.resumeCampaign.useMutation({
    onSuccess: (result) => {
      refetch();
      utils.seoProjects.get.invalidate({ id: projectId });
      toast.success(
        result.restarted
          ? "Restart Campaign แล้ว! รันใหม่จากเฟส 1"
          : `Resume Campaign แล้ว! ต่อจากเฟส ${result.fromPhase + 1}`,
        { description: "ระบบทำงานในพื้นหลัง กลับมาดูความคืบหน้าได้ตลอด" },
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const restartCampaign = trpc.seoProjects.restartCampaign.useMutation({
    onSuccess: () => {
      refetch();
      utils.seoProjects.get.invalidate({ id: projectId });
      toast.success("Restart Campaign จากเฟส 1 แล้ว!", {
        description: "ระบบรีเซ็ตและรันใหม่ทั้งหมดในพื้นหลัง",
      });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>;
  if (!campaign) return <div className="text-center py-12 text-muted-foreground">ไม่พบข้อมูล Campaign</div>;

  const phaseStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case "running": return <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />;
      default: return <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Campaign Header */}
      <Card className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Zap className="w-6 h-6 text-orange-400" />
                16-Phase SEO Campaign
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                AI รัน 16 เฟสครบวงจร — วิเคราะห์ + แก้ไข On-Page + สร้าง Backlinks + ติดตามอันดับ
              </p>
              {!campaign.wpConnected && (
                <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  ยังไม่ได้เชื่อมต่อ WordPress — เฟสที่ต้องแก้ไขเว็บจะถูกข้าม ไปที่แท็บ WordPress เพื่อเชื่อมต่อ
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center px-4 py-2 bg-card/50 rounded-lg border border-border/50">
                <p className="text-2xl font-bold text-orange-400">{campaign.progress}%</p>
                <p className="text-[10px] text-muted-foreground">Progress</p>
              </div>
              <div className="text-center px-4 py-2 bg-card/50 rounded-lg border border-border/50">
                <p className="text-2xl font-bold text-blue-400">{campaign.totalWpChanges}</p>
                <p className="text-[10px] text-muted-foreground">WP Changes</p>
              </div>
              <div className="text-center px-4 py-2 bg-card/50 rounded-lg border border-border/50">
                <p className="text-2xl font-bold text-emerald-400">{campaign.phase}/{campaign.totalPhases}</p>
                <p className="text-[10px] text-muted-foreground">Phases</p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="w-full bg-zinc-800 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-orange-500 to-amber-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${campaign.progress}%` }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mt-4">
            {/* Failed/Idle state: show Resume + Restart from scratch */}
            {(campaign.status === "failed" || campaign.status === "idle" || campaign.status === "paused") && campaign.phase < 16 && (
              <>
                <Button
                  onClick={() => {
                    if (campaign.phase > 0) {
                      resumeCampaign.mutate({ id: projectId });
                    } else {
                      runAllPhases.mutate({ id: projectId });
                    }
                  }}
                  disabled={resumeCampaign.isPending || runAllPhases.isPending}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {(resumeCampaign.isPending || runAllPhases.isPending) ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                  {campaign.phase > 0 ? `Resume จากเฟส ${campaign.phase + 1}/16` : "เริ่มรัน Campaign"}
                </Button>
                {campaign.phase > 0 && (
                  <Button
                    onClick={() => {
                      if (confirm("Restart Campaign จากเฟส 1 ใหม่? ข้อมูลเฟสเดิมจะถูกรีเซ็ต")) {
                        restartCampaign.mutate({ id: projectId });
                      }
                    }}
                    disabled={restartCampaign.isPending}
                    variant="outline"
                    className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  >
                    {restartCampaign.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                    Restart ใหม่ทั้งหมด
                  </Button>
                )}
              </>
            )}

            {/* Running state: show progress only */}
            {campaign.status === "running" && (
              <Badge variant="outline" className="text-sm py-2 px-4 bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                กำลังรันเฟส {campaign.phase + 1}/16...
              </Badge>
            )}

            {/* Completed state: show Restart from scratch */}
            {campaign.status === "completed" && (
              <Button
                onClick={() => {
                  if (confirm("Restart Campaign ใหม่ทั้งหมด? จะรีเซ็ตและรันจากเฟส 1 ใหม่")) {
                    restartCampaign.mutate({ id: projectId });
                  }
                }}
                disabled={restartCampaign.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {restartCampaign.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                รันใหม่ทั้งหมด
              </Button>
            )}

            {/* Run next phase button (for manual step-by-step) */}
            {campaign.status !== "completed" && campaign.status !== "running" && (
              <Button
                onClick={() => runNextPhase.mutate({ id: projectId })}
                disabled={runNextPhase.isPending}
                variant="outline"
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
              >
                {runNextPhase.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
                รันทีละเฟส
              </Button>
            )}

            {/* Reset button (stop without re-running) */}
            {campaign.phase > 0 && campaign.status !== "running" && (
              <Button
                onClick={() => {
                  if (confirm("รีเซ็ต Campaign? จะเริ่มนับเฟสใหม่จาก 0 (ไม่รันอัตโนมัติ)")) {
                    resetCampaign.mutate({ id: projectId });
                  }
                }}
                disabled={resetCampaign.isPending}
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <XCircle className="w-4 h-4 mr-1" /> รีเซ็ต
              </Button>
            )}
          </div>

          {/* Failed campaign alert */}
          {campaign.status === "failed" && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400">Campaign หยุดทำงาน</p>
                <p className="text-xs text-red-300/70 mt-1">
                  หยุดที่เฟส {campaign.phase}/16 — กด <strong>Resume</strong> เพื่อต่อจากเฟสที่ค้าง หรือ <strong>Restart ใหม่ทั้งหมด</strong> เพื่อรันใหม่จากเฟส 1
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase List */}
      <div className="space-y-2">
        {(campaign.phases as any[]).map((phase: any, i: number) => (
          <Card
            key={i}
            className={`border transition-colors ${
              phase.status === "completed" ? "bg-emerald-500/5 border-emerald-500/20" :
              phase.status === "running" ? "bg-amber-500/5 border-amber-500/30 ring-1 ring-amber-500/20" :
              "bg-card/30 border-border/30"
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 shrink-0">
                  {phaseStatusIcon(phase.status)}
                  <span className={`text-sm font-mono font-bold ${
                    phase.status === "completed" ? "text-emerald-400" :
                    phase.status === "running" ? "text-amber-400" :
                    "text-zinc-500"
                  }`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold text-sm ${
                    phase.status === "completed" ? "text-emerald-300" :
                    phase.status === "running" ? "text-amber-300" :
                    "text-zinc-400"
                  }`}>
                    {phase.name}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate">{phase.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {phase.requiresWP && (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                      WP
                    </Badge>
                  )}
                  <Badge variant="outline" className={`text-[10px] ${
                    phase.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    phase.status === "running" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                    "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                  }`}>
                    {phase.status === "completed" ? "Done" : phase.status === "running" ? "Running..." : "Pending"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Last Phase Result */}
      {campaign.lastPhaseResult && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              ผลลัพธ์เฟสล่าสุด
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-muted-foreground bg-zinc-900/50 p-3 rounded-lg overflow-auto max-h-48">
              {typeof campaign.lastPhaseResult === "string"
                ? campaign.lastPhaseResult
                : JSON.stringify(campaign.lastPhaseResult as any, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══ WordPress Tab Component ═══
function WordPressTab({ projectId, project }: { projectId: number; project: any }) {
  const [wpUser, setWpUser] = useState(project?.wpUsername || "");
  const [wpPass, setWpPass] = useState("");
  const utils = trpc.useUtils();

  const updateWP = trpc.seoProjects.updateWPCredentials.useMutation({
    onSuccess: (result) => {
      utils.seoProjects.get.invalidate({ id: projectId });
      toast.success(`เชื่อมต่อ WordPress สำเร็จ! Site: ${result.siteName}`, {
        description: result.seoPlugin ? `SEO Plugin: ${result.seoPlugin}` : "ไม่พบ SEO Plugin",
      });
      setWpPass("");
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: wpStatus, isLoading: wpLoading } = trpc.seoProjects.testWPConnection.useQuery(
    { id: projectId },
    { enabled: !!projectId && !!project?.wpConnected }
  );

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card className={`border ${project?.wpConnected ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card/50 border-border/50"}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-400" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zM3.443 12c0-1.477.383-2.866 1.054-4.074l5.808 15.91A8.565 8.565 0 013.443 12zm8.557 8.557c-.882 0-1.73-.143-2.524-.406l2.68-7.783 2.746 7.524c.018.044.04.085.063.124a8.513 8.513 0 01-2.965.541zm1.2-12.556c.538-.028 1.022-.085 1.022-.085.481-.057.425-.764-.057-.737 0 0-1.445.114-2.376.114-.876 0-2.35-.114-2.35-.114-.481-.028-.538.708-.057.737 0 0 .457.057.938.085l1.396 3.826-1.96 5.878L7.36 7.999c.538-.028 1.022-.085 1.022-.085.481-.057.425-.764-.057-.737 0 0-1.445.114-2.376.114-.167 0-.364-.004-.57-.012A8.533 8.533 0 0112 3.443c2.124 0 4.06.778 5.553 2.063-.035-.002-.069-.008-.105-.008-.876 0-1.497.764-1.497 1.583 0 .737.425 1.36.876 2.096.34.595.737 1.36.737 2.464 0 .764-.293 1.65-.68 2.886l-.89 2.974-3.794-11.46zm4.826 11.282l2.724-7.873c.51-1.273.68-2.29.68-3.196 0-.328-.021-.633-.061-.916A8.543 8.543 0 0120.557 12a8.546 8.546 0 01-2.531 6.083z"/></svg>
            WordPress Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {project?.wpConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">เชื่อมต่อแล้ว</span>
              </div>
              {wpLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : wpStatus?.connected ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-card/50 rounded-lg p-3 border border-border/50">
                    <p className="text-[10px] text-muted-foreground">Site Name</p>
                    <p className="font-semibold text-sm">{wpStatus.siteName}</p>
                  </div>
                  <div className="bg-card/50 rounded-lg p-3 border border-border/50">
                    <p className="text-[10px] text-muted-foreground">SEO Plugin</p>
                    <p className="font-semibold text-sm">{wpStatus.seoPlugin || "None"}</p>
                  </div>
                  <div className="bg-card/50 rounded-lg p-3 border border-border/50">
                    <p className="text-[10px] text-muted-foreground">Posts / Pages</p>
                    <p className="font-semibold text-sm">{wpStatus.totalPosts} / {wpStatus.totalPages}</p>
                  </div>
                  <div className="bg-card/50 rounded-lg p-3 border border-border/50">
                    <p className="text-[10px] text-muted-foreground">Issues Found</p>
                    <p className={`font-semibold text-sm ${(wpStatus.issues || 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {wpStatus.issues}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-400">Connection failed: {wpStatus?.reason}</p>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">ยังไม่ได้เชื่อมต่อ WordPress</p>
              <p className="text-xs text-muted-foreground mt-1">ใส่ Application Password เพื่อให้ AI แก้ไขเว็บไซต์จริง</p>
            </div>
          )}

          {/* Credentials Form */}
          <div className="pt-4 border-t border-border/50 space-y-3">
            <h4 className="font-semibold text-sm">{project?.wpConnected ? "อัปเดต Credentials" : "เชื่อมต่อ WordPress"}</h4>
            <div>
              <Label className="text-xs">WordPress Username</Label>
              <Input
                placeholder="admin"
                value={wpUser}
                onChange={e => setWpUser(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Application Password</Label>
              <Input
                type="password"
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                value={wpPass}
                onChange={e => setWpPass(e.target.value)}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                สร้างได้ที่ WordPress Admin &rarr; Users &rarr; Profile &rarr; Application Passwords
              </p>
            </div>
            <Button
              onClick={() => updateWP.mutate({ id: projectId, wpUsername: wpUser, wpAppPassword: wpPass })}
              disabled={!wpUser.trim() || !wpPass.trim() || updateWP.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateWP.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wrench className="w-4 h-4 mr-1" />}
              {project?.wpConnected ? "อัปเดต Connection" : "เชื่อมต่อ WordPress"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* What AI Can Do */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-400" />
            AI จะแก้ไขอะไรบ้างผ่าน WordPress?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { title: "SEO Title & Meta Description", desc: "ปรับ title tag และ meta description ให้ตรง keyword" },
              { title: "Content Optimization", desc: "เพิ่ม heading, keyword density, readability" },
              { title: "Schema Markup", desc: "เพิ่ม JSON-LD structured data (Article, FAQ, HowTo)" },
              { title: "Internal Linking", desc: "สร้าง internal links ระหว่างหน้าที่เกี่ยวข้อง" },
              { title: "Image Alt Text", desc: "เพิ่ม alt text ที่มี keyword ให้รูปภาพทุกรูป" },
              { title: "Open Graph Tags", desc: "ปรับ OG tags สำหรับ social sharing" },
              { title: "Heading Structure", desc: "จัดโครงสร้าง H1-H6 ให้ถูกต้อง" },
              { title: "Content Publishing", desc: "สร้างและเผยแพร่เนื้อหาใหม่อัตโนมัติ" },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 p-3 bg-zinc-900/30 rounded-lg border border-border/30">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


// ═══ DAILY AI TAB ═══
function DailyAITab({ projectId, project }: { projectId: number; project: any }) {
  const [showPlan, setShowPlan] = useState(false);
  const [dailyReport, setDailyReport] = useState<any>(null);

  const { data: status, refetch: refetchStatus } = trpc.seoDaily.status.useQuery(
    { projectId },
    { enabled: !!projectId }
  );
  const { data: verificationLog } = trpc.seoDaily.verificationLog.useQuery(
    { projectId, limit: 20 },
    { enabled: !!projectId }
  );

  const generatePlan = trpc.seoDaily.generatePlan.useMutation({
    onSuccess: (plan) => {
      setShowPlan(true);
      toast.success(`AI วางแผน ${plan.totalTasks} tasks สำหรับวันนี้`);
    },
    onError: (err) => toast.error(err.message),
  });

  const runDaily = trpc.seoDaily.runDaily.useMutation({
    onSuccess: (report) => {
      setDailyReport(report);
      refetchStatus();
      toast.success(`Daily AI เสร็จ: ${report.summary.completed}/${report.summary.total} tasks สำเร็จ`);
    },
    onError: (err) => toast.error(err.message),
  });

  const autoStart = trpc.seoDaily.autoStart.useMutation({
    onSuccess: () => {
      refetchStatus();
      toast.success("เริ่มทำ SEO อัตโนมัติแล้ว!");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateSchedule = trpc.seoDaily.updateSchedule.useMutation({
    onSuccess: (result) => {
      refetchStatus();
      toast.success(result.enabled ? `เปิด Daily SEO — ครั้งถัดไป: ${result.nextRunAt ? new Date(result.nextRunAt).toLocaleString("th-TH") : ""}` : "ปิด Daily SEO แล้ว");
    },
    onError: (err) => toast.error(err.message),
  });

  const DAY_NAMES = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const [selectedDays, setSelectedDays] = useState<number[]>(
    (status?.autoRunDays as number[]) || [0, 1, 2, 3, 4, 5, 6]
  );
  const [selectedHour, setSelectedHour] = useState(status?.autoRunHour ?? 3);

  const categoryColors: Record<string, string> = {
    on_page: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    off_page: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    content: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    technical: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    blackhat: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    monitoring: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    competitor: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  };

  const priorityColors: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400",
    high: "bg-orange-500/20 text-orange-400",
    medium: "bg-yellow-500/20 text-yellow-400",
    low: "bg-zinc-500/20 text-zinc-400",
  };

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <Card className="bg-gradient-to-r from-rose-950/30 to-violet-950/30 border-rose-500/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="font-semibold">Daily AI SEO Automation</h3>
                <p className="text-xs text-muted-foreground">
                  {status?.autoRunEnabled
                    ? `เปิดอยู่ — รันแล้ว ${status.autoRunCount} ครั้ง | ครั้งถัดไป: ${status.nextAutoRunAt ? new Date(status.nextAutoRunAt).toLocaleString("th-TH") : "กำลังคำนวณ"}`
                    : "ยังไม่เปิด — กดเปิดเพื่อให้ AI ทำ SEO ทุกวันอัตโนมัติ"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => generatePlan.mutate({ projectId })}
                disabled={generatePlan.isPending}
                className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              >
                {generatePlan.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Brain className="w-3 h-3 mr-1" />}
                ดูแผนวันนี้
              </Button>
              <Button
                size="sm"
                onClick={() => runDaily.mutate({ projectId })}
                disabled={runDaily.isPending}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {runDaily.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                รัน Daily AI ตอนนี้
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => autoStart.mutate({ projectId })}
                disabled={autoStart.isPending}
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              >
                {autoStart.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                Auto-Start
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Settings */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-400" />
            ตั้งเวลา Daily SEO
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((name, i) => (
              <button
                key={i}
                onClick={() => {
                  setSelectedDays(prev =>
                    prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i].sort()
                  );
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedDays.includes(i)
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                    : "bg-zinc-800/50 text-muted-foreground border border-border/30 hover:border-rose-500/30"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs">เวลา (UTC):</Label>
            <select
              value={selectedHour}
              onChange={e => setSelectedHour(Number(e.target.value))}
              className="bg-zinc-800 border border-border/50 rounded px-2 py-1 text-xs"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, "0")}:00 ({String((i + 7) % 24).padStart(2, "0")}:00 ICT)</option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => updateSchedule.mutate({
                projectId,
                enabled: true,
                days: selectedDays,
                hour: selectedHour,
              })}
              disabled={updateSchedule.isPending}
              className="bg-sky-600 hover:bg-sky-700"
            >
              {updateSchedule.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
              บันทึก
            </Button>
            {status?.autoRunEnabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateSchedule.mutate({ projectId, enabled: false, days: [], hour: 3 })}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                ปิด Auto-Run
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Daily Plan Preview */}
      {generatePlan.data && showPlan && (
        <Card className="bg-card/50 border-rose-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-rose-400" />
              แผน AI วันนี้ — {generatePlan.data.totalTasks} tasks
            </CardTitle>
            <p className="text-xs text-muted-foreground">{generatePlan.data.aiStrategy}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {generatePlan.data.tasks.map((task: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-zinc-900/30 rounded-lg border border-border/30">
                  <Badge className={`${categoryColors[task.category] || "bg-zinc-500/20"} text-[10px] shrink-0`}>
                    {task.category}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{task.title}</p>
                      <Badge className={`${priorityColors[task.priority] || ""} text-[10px]`}>
                        {task.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1 italic">{task.aiReasoning}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{task.estimatedMinutes}m</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Report (after running) */}
      {(dailyReport || runDaily.data) && (
        <Card className="bg-card/50 border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              ผลลัพธ์ Daily AI — {(dailyReport || runDaily.data).date}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const report = dailyReport || runDaily.data;
              return (
                <div className="space-y-3">
                  {/* Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2 bg-zinc-900/30 rounded text-center">
                      <p className="text-lg font-bold text-emerald-400">{report.summary.completed}</p>
                      <p className="text-[10px] text-muted-foreground">สำเร็จ</p>
                    </div>
                    <div className="p-2 bg-zinc-900/30 rounded text-center">
                      <p className="text-lg font-bold text-red-400">{report.summary.failed}</p>
                      <p className="text-[10px] text-muted-foreground">ล้มเหลว</p>
                    </div>
                    <div className="p-2 bg-zinc-900/30 rounded text-center">
                      <p className="text-lg font-bold text-amber-400">{report.summary.skipped}</p>
                      <p className="text-[10px] text-muted-foreground">ข้าม</p>
                    </div>
                    <div className="p-2 bg-zinc-900/30 rounded text-center">
                      <p className="text-lg font-bold">{Math.round(report.summary.totalDuration / 1000)}s</p>
                      <p className="text-[10px] text-muted-foreground">เวลาทั้งหมด</p>
                    </div>
                  </div>
                  {/* AI Summary */}
                  <div className="p-3 bg-rose-950/20 rounded-lg border border-rose-500/20">
                    <p className="text-xs">{report.aiSummary}</p>
                  </div>
                  {/* Execution Details */}
                  <div className="space-y-2">
                    {report.executions.map((exec: any, i: number) => (
                      <div key={i} className={`flex items-start gap-3 p-2 rounded-lg border ${
                        exec.status === "completed" ? "border-emerald-500/20 bg-emerald-950/10" :
                        exec.status === "failed" ? "border-red-500/20 bg-red-950/10" :
                        "border-amber-500/20 bg-amber-950/10"
                      }`}>
                        {exec.status === "completed" ? <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" /> :
                         exec.status === "failed" ? <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" /> :
                         <AlertCircle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{exec.task.title}</p>
                          <p className="text-[10px] text-muted-foreground">{exec.detail}</p>
                          {exec.proof?.type && (
                            <Badge className="mt-1 text-[9px] bg-zinc-800 text-zinc-400">
                              Proof: {exec.proof.type} {exec.proof.url ? `— ${exec.proof.url}` : ""}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Verification Log */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            Verification Log — ตรวจสอบได้ทุก Action
          </CardTitle>
        </CardHeader>
        <CardContent>
          {verificationLog && verificationLog.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {verificationLog.map((action: any) => (
                <div key={action.id} className="flex items-start gap-3 p-2 bg-zinc-900/30 rounded-lg border border-border/30">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    action.status === "completed" ? "bg-emerald-500/20" :
                    action.status === "failed" ? "bg-red-500/20" : "bg-amber-500/20"
                  }`}>
                    {action.status === "completed" ? <CheckCircle className="w-3 h-3 text-emerald-400" /> :
                     action.status === "failed" ? <XCircle className="w-3 h-3 text-red-400" /> :
                     <Clock className="w-3 h-3 text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-medium">{action.title}</p>
                      {action.hasProof && (
                        <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Verified
                        </Badge>
                      )}
                      {action.proofType && (
                        <Badge className="text-[9px] bg-zinc-800 text-zinc-400">
                          {action.proofType}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {action.executedAt ? new Date(action.executedAt).toLocaleString("th-TH") : ""}
                      {action.proofUrl && (
                        <> — <a href={action.proofUrl} target="_blank" rel="noopener" className="text-sky-400 hover:underline">{action.proofUrl}</a></>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มี action log — รัน Daily AI เพื่อเริ่มต้น</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══ TIMELINE TAB ═══
function TimelineTab({ projectId, project }: { projectId: number; project: any }) {
  const { data: timeline, isLoading, refetch } = trpc.seoDaily.timeline.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const difficultyColors: Record<string, string> = {
    easy: "text-emerald-400 bg-emerald-500/20",
    medium: "text-yellow-400 bg-yellow-500/20",
    hard: "text-orange-400 bg-orange-500/20",
    very_hard: "text-red-400 bg-red-500/20",
    extreme: "text-rose-400 bg-rose-500/20",
  };

  const confidenceColors: Record<string, string> = {
    high: "text-emerald-400",
    medium: "text-yellow-400",
    low: "text-red-400",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
        <span className="ml-2 text-sm text-muted-foreground">AI กำลังวิเคราะห์ timeline...</span>
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className="text-center py-12">
        <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล timeline — เพิ่ม keywords แล้วลองอีกครั้ง</p>
        <Button size="sm" onClick={() => refetch()} className="mt-3">
          <RefreshCw className="w-3 h-3 mr-1" /> โหลดใหม่
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Estimate */}
      <Card className="bg-gradient-to-r from-sky-950/30 to-indigo-950/30 border-sky-500/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center">
                <Target className="w-6 h-6 text-sky-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {timeline.overallEstimate.daysToFirstPage} วัน
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({timeline.overallEstimate.range.min}-{timeline.overallEstimate.range.max} วัน)
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">ประเมินเวลาเฉลี่ยถึงหน้าแรก Google</p>
              </div>
            </div>
            <Badge className={`${confidenceColors[timeline.overallEstimate.confidence]} bg-opacity-20`}>
              ความมั่นใจ: {timeline.overallEstimate.confidence}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-3">{timeline.aiStrategy}</p>
        </CardContent>
      </Card>

      {/* Keyword Timelines */}
      <div className="space-y-3">
        {timeline.keywords.map((kw: any, i: number) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold">{kw.keyword}</h4>
                    <Badge className={`text-[10px] ${difficultyColors[kw.difficulty] || ""}`}>
                      {kw.difficulty}
                    </Badge>
                    <Badge className={`text-[10px] ${confidenceColors[kw.confidence] || ""} bg-opacity-20`}>
                      {kw.confidence}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ปัจจุบัน: {kw.currentPosition ? `อันดับ #${kw.currentPosition}` : "ยังไม่ติดอันดับ"}
                    {" → "} เป้าหมาย: Top {kw.targetPosition}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-sky-400">{kw.estimatedDays}</p>
                  <p className="text-[10px] text-muted-foreground">วัน ({kw.estimatedRange.min}-{kw.estimatedRange.max})</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full transition-all"
                  style={{
                    width: `${kw.currentPosition
                      ? Math.max(5, Math.min(95, ((100 - kw.currentPosition) / 90) * 100))
                      : 5}%`,
                  }}
                />
              </div>

              {/* Milestones */}
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {kw.milestones?.map((ms: any, j: number) => (
                  <div key={j} className="shrink-0 p-2 bg-zinc-900/30 rounded-lg border border-border/30 min-w-[140px]">
                    <p className="text-[10px] text-sky-400 font-medium">Day {ms.day}</p>
                    <p className="text-xs font-medium">Top {ms.expectedPosition}</p>
                    <p className="text-[10px] text-muted-foreground">{ms.description}</p>
                  </div>
                ))}
              </div>

              {/* Factors */}
              <div className="mt-3 flex flex-wrap gap-1">
                {kw.factors?.map((f: any, j: number) => (
                  <Badge key={j} className={`text-[9px] ${
                    f.impact === "positive" ? "bg-emerald-500/10 text-emerald-400" :
                    f.impact === "negative" ? "bg-red-500/10 text-red-400" :
                    "bg-zinc-500/10 text-zinc-400"
                  }`}>
                    {f.impact === "positive" ? "+" : f.impact === "negative" ? "-" : "="} {f.factor}
                  </Badge>
                ))}
              </div>

              {/* AI Explanation */}
              <p className="text-[10px] text-muted-foreground/70 mt-2 italic">{kw.aiExplanation}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Required Actions Summary */}
      {timeline.keywords.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              สิ่งที่ต้องทำเพื่อขึ้นหน้าแรก
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-2">
              {timeline.keywords[0]?.requiredActions?.map((action: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-zinc-900/30 rounded-lg border border-border/30">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    action.priority === "critical" ? "bg-red-500/20" :
                    action.priority === "high" ? "bg-orange-500/20" : "bg-yellow-500/20"
                  }`}>
                    <Zap className={`w-3 h-3 ${
                      action.priority === "critical" ? "text-red-400" :
                      action.priority === "high" ? "text-orange-400" : "text-yellow-400"
                    }`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium">{action.action}</p>
                    <p className="text-[10px] text-muted-foreground">{action.frequency} — {action.estimatedImpact}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// ═══ AI AGENT TAB ═══
function AIAgentTab({ projectId, project }: { projectId: number; project: any }) {
  const utils = trpc.useUtils();
  const { data: agentStatus, isLoading } = trpc.seoAgent.getStatus.useQuery({ projectId });
  const { data: taskQueue } = trpc.seoAgent.getTaskQueue.useQuery({ projectId, limit: 50 });

  const generatePlan = trpc.seoAgent.generatePlan.useMutation({
    onSuccess: (result) => {
      utils.seoAgent.getStatus.invalidate({ projectId });
      utils.seoAgent.getTaskQueue.invalidate({ projectId });
      toast.success(`AI Plan สร้างเสร็จ! ประเมิน ${result.estimatedDays} วัน (${result.totalTasks} tasks)`);
    },
    onError: (err) => toast.error(`Plan failed: ${err.message}`),
  });

  const runTasks = trpc.seoAgent.runTasks.useMutation({
    onSuccess: (result) => {
      utils.seoAgent.getStatus.invalidate({ projectId });
      utils.seoAgent.getTaskQueue.invalidate({ projectId });
      toast.success(`รัน ${result.tasksExecuted} tasks — ${result.tasksCompleted} สำเร็จ, ${result.tasksFailed} ล้มเหลว`);
    },
    onError: (err) => toast.error(`Run failed: ${err.message}`),
  });

  const skipTask = trpc.seoAgent.skipTask.useMutation({
    onSuccess: () => {
      utils.seoAgent.getTaskQueue.invalidate({ projectId });
      toast.success("ข้าม task แล้ว");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        <span className="ml-2 text-muted-foreground">กำลังโหลด AI Agent...</span>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    idle: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    planning: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    executing: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    monitoring: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    completed: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const taskStatusIcons: Record<string, React.ReactNode> = {
    pending: <Clock className="w-4 h-4 text-zinc-400" />,
    running: <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />,
    completed: <CheckCircle className="w-4 h-4 text-emerald-400" />,
    failed: <XCircle className="w-4 h-4 text-red-400" />,
    skipped: <AlertCircle className="w-4 h-4 text-zinc-500" />,
  };

  const plan = agentStatus?.plan ? (typeof agentStatus.plan === "string" ? JSON.parse(agentStatus.plan) : agentStatus.plan) : null;

  return (
    <div className="space-y-4">
      {/* Agent Status Header */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Agent Status</span>
              <Badge variant="outline" className={statusColors[agentStatus?.status || "idle"]}>
                {(agentStatus?.status || "idle").toUpperCase()}
              </Badge>
            </div>
            <div className="text-2xl font-bold text-amber-400 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI Agent
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2">Target / Estimated</div>
            <div className="text-2xl font-bold">
              <span className="text-emerald-400">{agentStatus?.targetDays || project.targetDays || 30}</span>
              <span className="text-muted-foreground text-sm"> / </span>
              <span className="text-amber-400">{agentStatus?.estimatedDays || "?"}</span>
              <span className="text-xs text-muted-foreground ml-1">วัน</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2">Pending Tasks</div>
            <div className="text-2xl font-bold text-blue-400">{agentStatus?.pendingTasks || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2">Stats</div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div><span className="text-emerald-400 font-bold">{agentStatus?.stats?.totalBacklinksBuilt || 0}</span> backlinks</div>
              <div><span className="text-blue-400 font-bold">{agentStatus?.stats?.totalContentCreated || 0}</span> content</div>
              <div><span className="text-violet-400 font-bold">{agentStatus?.stats?.totalWpChanges || 0}</span> WP changes</div>
              <div><span className="text-amber-400 font-bold">{agentStatus?.stats?.totalActionsExecuted || 0}</span> actions</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => generatePlan.mutate({ projectId })}
          disabled={generatePlan.isPending}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {generatePlan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
          {plan ? "สร้างแผนใหม่" : "สร้างแผน AI"}
        </Button>
        <Button
          onClick={() => runTasks.mutate({ projectId, maxTasks: 5 })}
          disabled={runTasks.isPending || !plan}
          variant="outline"
          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
        >
          {runTasks.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          รัน Tasks (5)
        </Button>
        <Button
          onClick={() => runTasks.mutate({ projectId, maxTasks: 20 })}
          disabled={runTasks.isPending || !plan}
          variant="outline"
          className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
        >
          {runTasks.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
          รัน All (20)
        </Button>
      </div>

      {/* Error Display */}
      {agentStatus?.error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-400 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold text-sm">Agent Error</span>
            </div>
            <p className="text-xs text-red-300">{agentStatus.error}</p>
          </CardContent>
        </Card>
      )}

      {/* AI Plan Visualization */}
      {plan && (
        <Card className="border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-400" />
              AI Strategic Plan
              <Badge variant="outline" className="ml-auto text-xs">
                Confidence: {plan.confidence || 0}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reasoning */}
            {plan.reasoning && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs text-amber-200">{plan.reasoning}</p>
              </div>
            )}

            {/* Risk Assessment */}
            {plan.riskAssessment && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground mb-1">Penalty Risk</div>
                  <Badge variant="outline" className={
                    plan.riskAssessment.penaltyRisk === "low" ? "bg-emerald-500/20 text-emerald-400" :
                    plan.riskAssessment.penaltyRisk === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-red-500/20 text-red-400"
                  }>{plan.riskAssessment.penaltyRisk}</Badge>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground mb-1">Detection Risk</div>
                  <Badge variant="outline" className={
                    plan.riskAssessment.detectionRisk === "low" ? "bg-emerald-500/20 text-emerald-400" :
                    plan.riskAssessment.detectionRisk === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-red-500/20 text-red-400"
                  }>{plan.riskAssessment.detectionRisk}</Badge>
                </div>
              </div>
            )}

            {/* Phases Timeline */}
            {plan.phases && plan.phases.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-2">Phases</div>
                <div className="space-y-2">
                  {plan.phases.map((phase: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 bg-zinc-800/30 rounded-lg p-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        phase.priority === "critical" ? "bg-red-500/20 text-red-400" :
                        phase.priority === "high" ? "bg-orange-500/20 text-orange-400" :
                        phase.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-zinc-500/20 text-zinc-400"
                      }`}>
                        D{phase.day}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{phase.name}</span>
                          <Badge variant="outline" className="text-[10px]">{phase.priority}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{phase.description}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {phase.tasks?.map((t: string, j: number) => (
                            <Badge key={j} variant="outline" className="text-[10px] bg-zinc-800/50">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Task Queue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-400" />
            Task Queue
            <Badge variant="outline" className="ml-auto">{taskQueue?.length || 0} tasks</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!taskQueue || taskQueue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">ยังไม่มี tasks — กด "สร้างแผน AI" เพื่อเริ่มต้น</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {taskQueue.map((task: any) => (
                <div key={task.id} className="flex items-center gap-3 bg-zinc-800/30 rounded-lg p-3 group">
                  <div className="shrink-0">{taskStatusIcons[task.status] || taskStatusIcons.pending}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{task.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{task.taskType}</Badge>
                      {task.priority && (
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${
                          task.priority === "critical" ? "text-red-400" :
                          task.priority === "high" ? "text-orange-400" :
                          "text-zinc-400"
                        }`}>{task.priority}</Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                      <span>Day {task.scheduledDay || "?"}</span>
                      {task.completedAt && <span>Completed: {new Date(task.completedAt).toLocaleString()}</span>}
                    </div>
                  </div>
                  {task.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-red-400"
                      onClick={() => skipTask.mutate({ taskId: task.id, reason: "Manually skipped" })}
                    >
                      Skip
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last/Next Action */}
      {(agentStatus?.lastAction || agentStatus?.nextAction) && (
        <div className="grid md:grid-cols-2 gap-4">
          {agentStatus.lastAction && (
            <Card className="border-emerald-500/20">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Last Action</div>
                <p className="text-sm">{agentStatus.lastAction}</p>
              </CardContent>
            </Card>
          )}
          {agentStatus.nextAction && (
            <Card className="border-blue-500/20">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Next Action</div>
                <p className="text-sm">{agentStatus.nextAction}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
