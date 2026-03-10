/**
 * ═══════════════════════════════════════════════════════════════
 *  KEYWORD PERFORMANCE TRACKER PAGE
 *
 *  Tracks which keywords actually rank after attacks.
 *  Shows performance stats, ROI rankings, recent entries,
 *  and allows processing pending rank checks.
 * ═══════════════════════════════════════════════════════════════
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, BarChart3, Activity, CheckCircle2,
  Clock, Loader2, RefreshCw, Target, Zap, Hash, Trophy,
  ArrowUpRight, ArrowDownRight, Minus, Eye, DollarSign,
} from "lucide-react";

// ─── Status config ───
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-zinc-400", bg: "bg-zinc-500/20" },
  tracking: { label: "Tracking", color: "text-blue-400", bg: "bg-blue-500/20" },
  peaked: { label: "Peaked", color: "text-amber-400", bg: "bg-amber-500/20" },
  stable: { label: "Stable", color: "text-emerald-400", bg: "bg-emerald-500/20" },
  lost: { label: "Lost", color: "text-red-400", bg: "bg-red-500/20" },
  completed: { label: "Completed", color: "text-violet-400", bg: "bg-violet-500/20" },
};

export default function KeywordPerformancePage() {
  const [activeTab, setActiveTab] = useState("overview");

  // ─── Queries ───
  const stats = trpc.keywordPerformance.getStats.useQuery(undefined, { refetchInterval: 10000 });
  const roi = trpc.keywordPerformance.getROI.useQuery(undefined, { refetchInterval: 30000 });
  const recent = trpc.keywordPerformance.getRecent.useQuery({ limit: 50 }, { refetchInterval: 15000 });

  // ─── Mutations ───
  const processChecks = trpc.keywordPerformance.processChecks.useMutation({
    onSuccess: (r) => toast.success(`Processed ${r.processed} checks — ${r.improved} improved`),
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const s = stats.data;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-400" />
            Keyword Performance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ติดตามอันดับ keywords หลังโจมตี — AI เรียนรู้ว่า keyword ไหนมีค่าที่สุด
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => processChecks.mutate()} disabled={processChecks.isPending}
            className="bg-emerald-600 hover:bg-emerald-700">
            {processChecks.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Process Rank Checks
          </Button>
        </div>
      </div>

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatsCard title="Total Tracked" value={s?.totalTracked || 0} icon={<Hash className="w-4 h-4 text-blue-400" />} />
        <StatsCard title="Tracking" value={s?.tracking || 0} icon={<Activity className="w-4 h-4 text-blue-400" />} />
        <StatsCard title="On Page 1" value={s?.onPage1Count || 0} icon={<Trophy className="w-4 h-4 text-amber-400" />} />
        <StatsCard title="In Top 3" value={s?.inTop3Count || 0} icon={<Zap className="w-4 h-4 text-emerald-400" />} />
        <StatsCard title="Avg Improvement" value={s?.avgRankImprovement || 0} icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} suffix=" pos" />
        <StatsCard title="Pending Checks" value={s?.pending || 0} icon={<Clock className="w-4 h-4 text-zinc-400" />} />
      </div>

      {/* ─── Status Distribution ─── */}
      <Card className="border-zinc-800">
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap">
            {(["pending", "tracking", "peaked", "stable", "lost", "completed"] as const).map(status => {
              const count = s ? s[status] || 0 : 0;
              const cfg = STATUS_CONFIG[status];
              return (
                <div key={status} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cfg.bg}`}>
                  <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-sm font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900/50 border border-zinc-800">
          <TabsTrigger value="overview" className="text-xs">Best & Worst</TabsTrigger>
          <TabsTrigger value="roi" className="text-xs">ROI Rankings</TabsTrigger>
          <TabsTrigger value="recent" className="text-xs">Recent Entries</TabsTrigger>
        </TabsList>

        {/* ─── Best & Worst Tab ─── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Best Performers */}
            <Card className="border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Best Performers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {s?.bestPerformers && s.bestPerformers.length > 0 ? (
                  <div className="space-y-2">
                    {s.bestPerformers.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-800">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono truncate">{p.keyword}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.targetDomain}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-2">
                          {p.bestRank && (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">
                              #{p.bestRank}
                            </Badge>
                          )}
                          {p.rankImprovement != null && p.rankImprovement > 0 && (
                            <span className="text-xs text-emerald-400 flex items-center">
                              <ArrowUpRight className="w-3 h-3" /> +{p.rankImprovement}
                            </span>
                          )}
                          <span className="text-xs font-mono text-muted-foreground">
                            {p.performanceScore}pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">ยังไม่มีข้อมูล</p>
                )}
              </CardContent>
            </Card>

            {/* Worst Performers */}
            <Card className="border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  Worst Performers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {s?.worstPerformers && s.worstPerformers.length > 0 ? (
                  <div className="space-y-2">
                    {s.worstPerformers.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-800">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono truncate">{p.keyword}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.targetDomain}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-2">
                          {p.currentRank && (
                            <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-400">
                              #{p.currentRank}
                            </Badge>
                          )}
                          {p.rankImprovement != null && p.rankImprovement < 0 && (
                            <span className="text-xs text-red-400 flex items-center">
                              <ArrowDownRight className="w-3 h-3" /> {p.rankImprovement}
                            </span>
                          )}
                          <span className="text-xs font-mono text-muted-foreground">
                            {p.performanceScore}pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">ยังไม่มีข้อมูล</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── ROI Rankings Tab ─── */}
        <TabsContent value="roi" className="space-y-4 mt-4">
          <Card className="border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                Keyword ROI Rankings
                <Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px]"
                  onClick={() => roi.refetch()}>
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {roi.data && roi.data.length > 0 ? (
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">#</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Keyword</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Category</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Attacks</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Avg Rank +/-</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Best Rank</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Est. Traffic</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Est. Value</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">ROI Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roi.data.map((r, i) => (
                        <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-1.5 px-2 font-mono max-w-[200px] truncate">{r.keyword}</td>
                          <td className="py-1.5 px-2">
                            {r.category ? (
                              <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">{r.totalAttacks}</td>
                          <td className="py-1.5 px-2 text-right">
                            <RankChange value={r.avgRankImprovement} />
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">
                            {r.bestRank ? `#${r.bestRank}` : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">{r.estimatedMonthlyTraffic.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">${r.estimatedMonthlyValue.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right">
                            <span className={`font-bold ${r.roiScore >= 70 ? "text-emerald-400" : r.roiScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                              {r.roiScore.toFixed(0)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <DollarSign className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล ROI</p>
                  <p className="text-xs text-muted-foreground mt-1">ระบบจะเริ่มคำนวณเมื่อมี keyword ที่ถูก track</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Recent Entries Tab ─── */}
        <TabsContent value="recent" className="space-y-4 mt-4">
          <Card className="border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-400" />
                Recent Tracked Keywords ({recent.data?.length || 0})
                <Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px]"
                  onClick={() => recent.refetch()}>
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recent.data && recent.data.length > 0 ? (
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Keyword</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Target</th>
                        <th className="text-center py-2 px-2 text-muted-foreground font-medium">Status</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Before</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Current</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Best</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Change</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Score</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Checks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.data.map((entry: any, i: number) => {
                        const statusCfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.pending;
                        return (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="py-1.5 px-2 font-mono max-w-[150px] truncate">{entry.keyword}</td>
                            <td className="py-1.5 px-2 max-w-[120px] truncate text-muted-foreground">{entry.targetDomain}</td>
                            <td className="py-1.5 px-2 text-center">
                              <Badge variant="outline" className={`text-[10px] ${statusCfg.color}`}>
                                {statusCfg.label}
                              </Badge>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono">{entry.rankBefore ?? "—"}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{entry.currentRank ?? "—"}</td>
                            <td className="py-1.5 px-2 text-right font-mono">
                              {entry.bestRank ? (
                                <span className="text-emerald-400">#{entry.bestRank}</span>
                              ) : "—"}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              <RankChange value={entry.rankImprovement} />
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono">{entry.performanceScore}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">{entry.totalChecks}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Target className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">ยังไม่มี keyword ที่ถูก track</p>
                  <p className="text-xs text-muted-foreground mt-1">ระบบจะเริ่ม track อัตโนมัติหลังโจมตีสำเร็จ</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Helper Components ───

function StatsCard({ title, value, icon, suffix }: {
  title: string; value: number; icon: React.ReactNode; suffix?: string;
}) {
  return (
    <Card className="border-zinc-800">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{title}</span>
          {icon}
        </div>
        <div className="text-xl font-bold">{value.toLocaleString()}{suffix || ""}</div>
      </CardContent>
    </Card>
  );
}

function RankChange({ value }: { value: number | null | undefined }) {
  if (value == null || value === 0) {
    return <span className="text-zinc-500 flex items-center justify-end"><Minus className="w-3 h-3" /> 0</span>;
  }
  if (value > 0) {
    return (
      <span className="text-emerald-400 flex items-center justify-end">
        <ArrowUpRight className="w-3 h-3" /> +{value}
      </span>
    );
  }
  return (
    <span className="text-red-400 flex items-center justify-end">
      <ArrowDownRight className="w-3 h-3" /> {value}
    </span>
  );
}
