/**
 * Design: Obsidian Intelligence — Content Freshness Dashboard
 * Monitor and manage content freshness for Google's freshness ranking signals.
 * Tracks staleness, triggers AI-powered refreshes, and monitors cycle reports.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Loader2, Clock, AlertTriangle, CheckCircle2,
  BarChart3, Zap, FileText, Activity, Timer, TrendingUp,
  ExternalLink, Play, RotateCcw,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  fresh: "bg-emerald/20 text-emerald border-emerald/30",
  aging: "bg-amber/20 text-amber border-amber/30",
  stale: "bg-rose/20 text-rose border-rose/30",
  refreshing: "bg-violet/20 text-violet border-violet/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  fresh: CheckCircle2,
  aging: Clock,
  stale: AlertTriangle,
  refreshing: RefreshCw,
  error: AlertTriangle,
};

function StalenessBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-rose-500" : score >= 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono w-8 text-right">{score}</span>
    </div>
  );
}

export default function ContentFreshnessDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshDomain, setRefreshDomain] = useState("");
  const [refreshMax, setRefreshMax] = useState(5);

  const utils = trpc.useUtils();

  // ─── Queries ───
  const { data: summary, isLoading: summaryLoading } = trpc.contentFreshness.getSummary.useQuery();
  const { data: trackedData, isLoading: trackedLoading } = trpc.contentFreshness.getTracked.useQuery();
  const { data: staleData } = trpc.contentFreshness.getStale.useQuery();
  const { data: cycleReports } = trpc.contentFreshness.getCycleReports.useQuery();

  // ─── Mutations ───
  const recalcMutation = trpc.contentFreshness.recalculate.useMutation({
    onSuccess: () => {
      toast.success("Staleness scores recalculated!");
      utils.contentFreshness.getTracked.invalidate();
      utils.contentFreshness.getSummary.invalidate();
      utils.contentFreshness.getStale.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const runCycleMutation = trpc.contentFreshness.runCycle.useMutation({
    onSuccess: (data) => {
      toast.success(`Refresh cycle complete! Refreshed ${data?.refreshed || 0} pages`);
      utils.contentFreshness.getTracked.invalidate();
      utils.contentFreshness.getSummary.invalidate();
      utils.contentFreshness.getCycleReports.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const tickMutation = trpc.contentFreshness.tick.useMutation({
    onSuccess: () => {
      toast.success("Freshness tick completed!");
      utils.contentFreshness.getTracked.invalidate();
      utils.contentFreshness.getSummary.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const content = trackedData?.content || [];
  const staleContent = staleData?.content || [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-cyan-500 rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">Content Freshness</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-cyan-500/30 text-cyan-400">
            {content.length} Tracked
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
          >
            {recalcMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
            Recalculate
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border border-border/50 flex-wrap h-auto gap-0.5 p-1">
          <TabsTrigger value="overview" className="text-xs gap-1.5 data-[state=active]:bg-cyan/15 data-[state=active]:text-cyan-400">
            <BarChart3 className="w-3.5 h-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="content" className="text-xs gap-1.5 data-[state=active]:bg-violet/15 data-[state=active]:text-violet">
            <FileText className="w-3.5 h-3.5" /> All Content
          </TabsTrigger>
          <TabsTrigger value="stale" className="text-xs gap-1.5 data-[state=active]:bg-rose/15 data-[state=active]:text-rose">
            <AlertTriangle className="w-3.5 h-3.5" /> Stale Content
          </TabsTrigger>
          <TabsTrigger value="refresh" className="text-xs gap-1.5 data-[state=active]:bg-emerald/15 data-[state=active]:text-emerald">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Cycle
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5 data-[state=active]:bg-amber/15 data-[state=active]:text-amber">
            <Activity className="w-3.5 h-3.5" /> Cycle History
          </TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW TAB ═══ */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {summaryLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
          ) : summary ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <FileText className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Total Tracked</p>
                    <p className="text-xl font-bold font-mono text-cyan-400">{summary.totalTracked}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Fresh</p>
                    <p className="text-xl font-bold font-mono text-emerald">{summary.fresh}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <Clock className="w-5 h-5 text-amber mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Aging</p>
                    <p className="text-xl font-bold font-mono text-amber">{summary.aging}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <AlertTriangle className="w-5 h-5 text-rose mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Stale</p>
                    <p className="text-xl font-bold font-mono text-rose">{summary.stale}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-border/50">
                  <CardContent className="p-3 text-center">
                    <TrendingUp className="w-5 h-5 text-violet mx-auto mb-1" />
                    <p className="text-[10px] font-mono text-muted-foreground">Avg Staleness</p>
                    <p className="text-xl font-bold font-mono text-violet">{summary.avgStaleness?.toFixed(0) || 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Status Distribution */}
              <Card className="glass-card border-cyan/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" /> Freshness Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 h-24 items-end">
                    {[
                      { label: "Fresh", count: summary.fresh, color: "bg-emerald-500" },
                      { label: "Aging", count: summary.aging, color: "bg-amber-500" },
                      { label: "Stale", count: summary.stale, color: "bg-rose-500" },
                    ].map((item) => {
                      const maxCount = Math.max(summary.fresh, summary.aging, summary.stale, 1);
                      const height = (item.count / maxCount) * 100;
                      return (
                        <div key={item.label} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs font-mono font-bold">{item.count}</span>
                          <div className="w-full rounded-t-md relative" style={{ height: `${Math.max(height, 4)}%` }}>
                            <div className={`absolute inset-0 ${item.color} rounded-t-md opacity-80`} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="glass-card border-amber/20 cursor-pointer hover:border-amber/40 transition-all"
                  onClick={() => setActiveTab("stale")}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="w-8 h-8 text-amber" />
                    <div>
                      <h3 className="text-sm font-semibold">Stale Content Alert</h3>
                      <p className="text-xs text-muted-foreground">
                        {staleContent.length} pages need refreshing to maintain rankings
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="glass-card border-emerald/20 cursor-pointer hover:border-emerald/40 transition-all"
                  onClick={() => setActiveTab("refresh")}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <RefreshCw className="w-8 h-8 text-emerald" />
                    <div>
                      <h3 className="text-sm font-semibold">Run Refresh Cycle</h3>
                      <p className="text-xs text-muted-foreground">
                        AI-powered content refresh with auto-indexing
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No tracked content yet</p>
              <p className="text-xs mt-1">Content deployed by other engines will appear here automatically</p>
            </div>
          )}
        </TabsContent>

        {/* ═══ ALL CONTENT TAB ═══ */}
        <TabsContent value="content" className="space-y-4 mt-4">
          {trackedLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet" /></div>
          ) : content.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No tracked content</p>
            </div>
          ) : (
            <div className="space-y-2">
              {content.map((item: any) => {
                const StatusIcon = STATUS_ICONS[item.status] || Clock;
                return (
                  <Card key={item.id} className="glass-card border-border/50 hover:border-violet/20 transition-all">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center shrink-0">
                          <StatusIcon className="w-4 h-4 text-violet" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold truncate">{item.title}</h3>
                            <Badge className={`${STATUS_COLORS[item.status]} text-[9px]`}>{item.status}</Badge>
                            <Badge variant="outline" className="text-[9px] font-mono">{item.platform}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            <span className="font-mono">{item.keyword}</span>
                            <span>•</span>
                            <span>{item.domain}</span>
                            {item.currentRank && (
                              <>
                                <span>•</span>
                                <span className="text-emerald font-semibold">Rank #{item.currentRank}</span>
                              </>
                            )}
                          </div>
                          <div className="mt-2">
                            <StalenessBar score={item.stalenessScore || 0} />
                          </div>
                          <div className="flex items-center gap-4 mt-1.5 text-[10px] text-muted-foreground">
                            <span>Refreshed: {item.refreshCount || 0}x</span>
                            <span>Priority: {item.priority || 0}/10</span>
                            <span>Last: {item.lastRefreshedAt ? new Date(item.lastRefreshedAt).toLocaleString("th-TH") : "Never"}</span>
                          </div>
                        </div>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ STALE CONTENT TAB ═══ */}
        <TabsContent value="stale" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {staleContent.length} pages need refreshing
            </p>
          </div>

          {staleContent.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald" />
              <p className="text-sm">All content is fresh!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {staleContent.map((item: any) => (
                <Card key={item.id} className="glass-card border-rose/20">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-rose/10 border border-rose/20 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4 text-rose" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate">{item.title}</h3>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span className="font-mono">{item.keyword}</span>
                          <span>•</span>
                          <span>Staleness: <span className="text-rose font-semibold">{item.stalenessScore}</span></span>
                          <span>•</span>
                          <span>Priority: <span className="text-amber font-semibold">{item.priority}/10</span></span>
                        </div>
                        <div className="mt-1.5">
                          <StalenessBar score={item.stalenessScore || 0} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ REFRESH CYCLE TAB ═══ */}
        <TabsContent value="refresh" className="space-y-4 mt-4">
          <Card className="glass-card border-emerald/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald" /> Run Manual Refresh Cycle
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                AI rewrites stale content with fresh data, updates dates, expands word count, and triggers re-indexing
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  placeholder="Domain to refresh"
                  value={refreshDomain}
                  onChange={(e) => setRefreshDomain(e.target.value)}
                  className="h-9 text-sm bg-muted/30"
                />
                <Input
                  type="number"
                  placeholder="Max pages to refresh"
                  value={refreshMax}
                  onChange={(e) => setRefreshMax(parseInt(e.target.value) || 5)}
                  className="h-9 text-sm bg-muted/30"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (!refreshDomain) { toast.error("กรุณากรอก domain"); return; }
                    runCycleMutation.mutate({ domain: refreshDomain, maxRefreshes: refreshMax });
                  }}
                  disabled={runCycleMutation.isPending}
                  className="bg-emerald text-white hover:bg-emerald/90"
                >
                  {runCycleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                  Run Full Cycle
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!refreshDomain) { toast.error("กรุณากรอก domain"); return; }
                    tickMutation.mutate({ domain: refreshDomain });
                  }}
                  disabled={tickMutation.isPending}
                >
                  {tickMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
                  Quick Tick
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cycle Results */}
          {runCycleMutation.data && (
            <Card className="glass-card border-emerald/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald" /> Cycle Report
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Refreshed</p>
                    <p className="text-xl font-bold font-mono text-emerald">{runCycleMutation.data.refreshed}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                    <p className="text-xl font-bold font-mono text-rose">{runCycleMutation.data.failed}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Words Added</p>
                    <p className="text-xl font-bold font-mono text-violet">{runCycleMutation.data.totalWordsAdded}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Re-indexed</p>
                    <p className="text-xl font-bold font-mono text-cyan-400">{runCycleMutation.data.reindexed}</p>
                  </div>
                </div>
                {runCycleMutation.data.results?.length > 0 && (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {runCycleMutation.data.results.map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/20">
                        {r.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose shrink-0" />
                        )}
                        <span className="font-mono truncate flex-1">{r.keyword}</span>
                        <span className="text-muted-foreground">+{r.wordsAdded}w</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ CYCLE HISTORY TAB ═══ */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {cycleReports && cycleReports.length > 0 ? (
            <div className="space-y-3">
              {cycleReports.map((report: any, i: number) => (
                <Card key={i} className="glass-card border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold font-mono">{report.cycleId}</h3>
                          <Badge variant="outline" className="text-[9px]">{report.domain}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {report.completedAt ? new Date(report.completedAt).toLocaleString("th-TH") : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Tracked</p>
                        <p className="font-bold font-mono">{report.totalTracked}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Refreshed</p>
                        <p className="font-bold font-mono text-emerald">{report.refreshed}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Words Added</p>
                        <p className="font-bold font-mono text-violet">{report.totalWordsAdded}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Re-indexed</p>
                        <p className="font-bold font-mono text-cyan-400">{report.reindexed}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No cycle reports yet</p>
              <p className="text-xs mt-1">Run a refresh cycle to see reports here</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
