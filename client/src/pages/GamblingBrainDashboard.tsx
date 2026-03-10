/**
 * ═══════════════════════════════════════════════════════════════
 *  GAMBLING AI BRAIN DASHBOARD
 *
 *  Real-time dashboard for the autonomous gambling SEO brain.
 *  Shows brain state, keyword intelligence, target discovery,
 *  attack progress, and continuous mode controls.
 * ═══════════════════════════════════════════════════════════════
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Brain, Play, Square, Zap, Activity, Target,
  Clock, CheckCircle2, XCircle, Loader2,
  BarChart3, Search, Globe, Crosshair, Repeat2, Eye,
  Sparkles, Cpu, RefreshCw,
  Hash, Layers, Swords,
} from "lucide-react";

// ─── Phase display config ───
const PHASE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  idle: { label: "รอคำสั่ง", icon: <Clock className="w-4 h-4" />, color: "text-zinc-400" },
  keywords: { label: "วิเคราะห์ Keywords", icon: <Search className="w-4 h-4" />, color: "text-blue-400" },
  discovery: { label: "ค้นหา Targets", icon: <Globe className="w-4 h-4" />, color: "text-cyan-400" },
  scoring: { label: "ให้คะแนน Targets", icon: <BarChart3 className="w-4 h-4" />, color: "text-amber-400" },
  attacking: { label: "กำลังโจมตี", icon: <Swords className="w-4 h-4" />, color: "text-red-400" },
  verifying: { label: "ตรวจสอบผล", icon: <Eye className="w-4 h-4" />, color: "text-violet-400" },
  learning: { label: "เรียนรู้", icon: <Sparkles className="w-4 h-4" />, color: "text-emerald-400" },
};

export default function GamblingBrainDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [cycleMode, setCycleMode] = useState("full_auto");
  const [maxAttacks, setMaxAttacks] = useState("3");

  // ─── Data queries ───
  const brainState = trpc.gamblingBrain.getState.useQuery(undefined, { refetchInterval: 3000 });
  const isContinuous = trpc.gamblingBrain.isContinuousRunning.useQuery(undefined, { refetchInterval: 5000 });
  const keywordStats = trpc.gamblingBrain.getKeywordStats.useQuery(undefined, { refetchInterval: 10000 });
  const discoveryStats = trpc.gamblingBrain.getDiscoveryStats.useQuery(undefined, { refetchInterval: 10000 });
  const keywordsData = trpc.gamblingBrain.getKeywords.useQuery(undefined, { refetchInterval: 15000 });

  // ─── Mutations ───
  const runCycle = trpc.gamblingBrain.runCycle.useMutation({
    onSuccess: (r) => {
      if ("error" in r && r.error) {
        toast.error(r.error);
      } else {
        toast.success(`Brain Cycle เริ่มแล้ว — cycleId: ${r.cycleId || "N/A"}`);
      }
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });
  const stopBrain = trpc.gamblingBrain.stop.useMutation({
    onSuccess: () => toast.info("Brain หยุดแล้ว"),
  });
  const startContinuous = trpc.gamblingBrain.startContinuous.useMutation({
    onSuccess: () => toast.success("Continuous Mode เริ่มทำงาน"),
    onError: (e) => toast.error(`Error: ${e.message}`),
  });
  const stopContinuous = trpc.gamblingBrain.stopContinuous.useMutation({
    onSuccess: () => toast.info("Continuous Mode หยุดแล้ว"),
  });
  const seedKeywords = trpc.gamblingBrain.seedKeywords.useMutation({
    onSuccess: (r) => toast.success(`เพิ่ม ${r.added} keywords แล้ว (existing: ${r.existing})`),
    onError: (e) => toast.error(`Error: ${e.message}`),
  });
  const runIntel = trpc.gamblingBrain.runIntelligenceCycle.useMutation({
    onSuccess: () => toast.success("Intelligence Cycle เสร็จ"),
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const state = brainState.data;
  const phase = state ? PHASE_CONFIG[state.currentPhase] || PHASE_CONFIG.idle : PHASE_CONFIG.idle;
  const successRate = state && state.totalAttacksLaunched > 0
    ? ((state.totalSuccesses / state.totalAttacksLaunched) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="w-7 h-7 text-violet-400" />
            Gambling AI Brain
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ระบบ AI อัตโนมัติค้นหา keywords พนัน, หาเว็บ target, และโจมตีเอง
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state?.isRunning ? (
            <Button variant="destructive" size="sm" onClick={() => stopBrain.mutate()}
              disabled={stopBrain.isPending}>
              <Square className="w-4 h-4 mr-1" /> หยุด
            </Button>
          ) : (
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => {
              runCycle.mutate({
                attackMode: cycleMode as "full_auto" | "discovery_and_attack" | "discovery_only",
                maxAttacksPerCycle: parseInt(maxAttacks) || 3,
              });
            }} disabled={runCycle.isPending}>
              {runCycle.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
              Run Cycle
            </Button>
          )}
           {isContinuous.data?.running ? (
            <Button variant="outline" size="sm" onClick={() => stopContinuous.mutate()}>
              <Square className="w-4 h-4 mr-1" /> Stop Continuous
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => {
              startContinuous.mutate({ intervalMinutes: 30, maxAttacksPerCycle: parseInt(maxAttacks) || 3 });
            }}>
              <Repeat2 className="w-4 h-4 mr-1" /> Continuous
            </Button>
          )}
        </div>
      </div>

      {/* ─── Brain Status Bar ─── */}
      <Card className="border-violet-500/30 bg-violet-950/10">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Phase indicator */}
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${state?.isRunning ? "bg-violet-500/20 animate-pulse" : "bg-zinc-800"}`}>
                {state?.isRunning ? <Cpu className="w-5 h-5 text-violet-400 animate-spin" /> : <Brain className="w-5 h-5 text-zinc-500" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${phase.color}`}>{phase.icon}</span>
                  <span className={`text-sm font-semibold ${phase.color}`}>{phase.label}</span>
                  {isContinuous.data?.running && (
                    <Badge variant="outline" className="text-[10px] border-violet-500/50 text-violet-400">
                      CONTINUOUS
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{state?.phaseDetail || "ไม่มีกิจกรรม"}</p>
              </div>
            </div>

            {/* Progress bar */}
            {state?.isRunning && (
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span>{state.progress}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500 rounded-full transition-all duration-500"
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="flex items-center gap-4 text-xs">
              <div className="text-center">
                <div className="text-lg font-bold text-foreground">{state?.totalCyclesCompleted || 0}</div>
                <div className="text-muted-foreground">Cycles</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-foreground">{state?.totalAttacksLaunched || 0}</div>
                <div className="text-muted-foreground">Attacks</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-400">{state?.totalSuccesses || 0}</div>
                <div className="text-muted-foreground">Success</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-foreground">{successRate}%</div>
                <div className="text-muted-foreground">Rate</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Config Row ─── */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={cycleMode} onValueChange={setCycleMode}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full_auto">Full Auto (ทุกขั้นตอน)</SelectItem>
            <SelectItem value="discovery_and_attack">Discovery + Attack</SelectItem>
            <SelectItem value="discovery_only">Discovery Only</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Max Attacks:</span>
          <Input
            type="number" min={1} max={20} value={maxAttacks}
            onChange={(e) => setMaxAttacks(e.target.value)}
            className="w-16 h-8 text-xs"
          />
        </div>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => seedKeywords.mutate()}
          disabled={seedKeywords.isPending}>
          {seedKeywords.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Hash className="w-3 h-3 mr-1" />}
          Seed Keywords
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => runIntel.mutate()}
          disabled={runIntel.isPending}>
          {runIntel.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          Run Intel Cycle
        </Button>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900/50 border border-zinc-800">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="keywords" className="text-xs">Keywords</TabsTrigger>
          <TabsTrigger value="discovery" className="text-xs">Discovery</TabsTrigger>
          <TabsTrigger value="lastCycle" className="text-xs">Last Cycle</TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ─── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Keyword Stats */}
            <StatsCard
              title="Keywords ทั้งหมด"
              value={keywordStats.data?.totalKeywords || 0}
              icon={<Hash className="w-4 h-4 text-blue-400" />}
              sub={`${keywordStats.data?.activeKeywords || 0} active`}
            />
            <StatsCard
              title="Keywords ค้นหาแล้ว"
              value={keywordStats.data?.searchedKeywords || 0}
              icon={<Search className="w-4 h-4 text-cyan-400" />}
              sub={`${keywordStats.data?.targetsFound || 0} targets found`}
            />
            {/* Discovery Stats */}
            <StatsCard
              title="Targets ค้นพบ"
              value={discoveryStats.data?.totalGamblingTargets || 0}
              icon={<Target className="w-4 h-4 text-amber-400" />}
              sub={`${discoveryStats.data?.highPriority || 0} high priority`}
            />
            <StatsCard
              title="Already Hacked"
              value={discoveryStats.data?.alreadyHacked || 0}
              icon={<Crosshair className="w-4 h-4 text-red-400" />}
              sub={`${discoveryStats.data?.successful || 0} successful`}
            />
          </div>

          {/* Category breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Keyword Categories */}
            <Card className="border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  Keyword Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                {keywordStats.data?.byCategory && Object.keys(keywordStats.data.byCategory).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(keywordStats.data.byCategory)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cat, count]) => (
                        <div key={cat} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500/60 rounded-full"
                                style={{ width: `${Math.min(100, (count / (keywordStats.data?.totalKeywords || 1)) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-foreground w-8 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มี keywords — กด Seed Keywords เพื่อเริ่ม</p>
                )}
              </CardContent>
            </Card>

            {/* Discovery Pipeline */}
            <Card className="border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Discovery Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <PipelineRow label="Queued" value={discoveryStats.data?.queued || 0} total={discoveryStats.data?.totalGamblingTargets || 1} color="bg-zinc-500" />
                  <PipelineRow label="High Priority" value={discoveryStats.data?.highPriority || 0} total={discoveryStats.data?.totalGamblingTargets || 1} color="bg-amber-500" />
                  <PipelineRow label="Already Hacked" value={discoveryStats.data?.alreadyHacked || 0} total={discoveryStats.data?.totalGamblingTargets || 1} color="bg-red-500" />
                  <PipelineRow label="Attacked" value={discoveryStats.data?.attacked || 0} total={discoveryStats.data?.totalGamblingTargets || 1} color="bg-violet-500" />
                  <PipelineRow label="Successful" value={discoveryStats.data?.successful || 0} total={discoveryStats.data?.totalGamblingTargets || 1} color="bg-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Keywords Tab ─── */}
        <TabsContent value="keywords" className="space-y-4 mt-4">
          <Card className="border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-400" />
                Gambling Keywords ({keywordsData.data?.total || 0})
                <span className="text-[10px] text-muted-foreground ml-1">({keywordsData.data?.categories.length || 0} categories)</span>
                <Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px]"
                  onClick={() => keywordsData.refetch()}>
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {keywordsData.data && keywordsData.data.total > 0 ? (
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Keyword</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(keywordsData.data.keywordsByCategory).flatMap(([cat, kws]) =>
                        kws.map((kw, i) => (
                          <tr key={`${cat}-${i}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="py-1.5 px-2 font-mono">{kw}</td>
                            <td className="py-1.5 px-2">
                              <Badge variant="outline" className="text-[10px]">
                                {cat.replace(/gambling_/g, "")}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Hash className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">ยังไม่มี gambling keywords</p>
                  <Button size="sm" className="mt-3" onClick={() => seedKeywords.mutate()}>
                    Seed Keywords
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Discovery Tab ─── */}
        <TabsContent value="discovery" className="space-y-4 mt-4">
          <Card className="border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                Discovery Stats by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              {discoveryStats.data?.byCategory && Object.keys(discoveryStats.data.byCategory).length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(discoveryStats.data.byCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, count]) => (
                      <div key={cat} className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                        <div className="text-lg font-bold">{count}</div>
                        <div className="text-xs text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Globe className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล discovery</p>
                  <p className="text-xs text-muted-foreground mt-1">Run Brain Cycle เพื่อเริ่มค้นหา targets</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Discovery summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatsCard
              title="Total Targets"
              value={discoveryStats.data?.totalGamblingTargets || 0}
              icon={<Target className="w-4 h-4 text-cyan-400" />}
            />
            <StatsCard
              title="Queued"
              value={discoveryStats.data?.queued || 0}
              icon={<Clock className="w-4 h-4 text-zinc-400" />}
            />
            <StatsCard
              title="Attacked"
              value={discoveryStats.data?.attacked || 0}
              icon={<Zap className="w-4 h-4 text-violet-400" />}
            />
            <StatsCard
              title="Successful"
              value={discoveryStats.data?.successful || 0}
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            />
          </div>
        </TabsContent>

        {/* ─── Last Cycle Tab ─── */}
        <TabsContent value="lastCycle" className="space-y-4 mt-4">
          {state?.lastCycleResult ? (
            <div className="space-y-4">
              {/* Cycle header */}
              <Card className="border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4 text-violet-400" />
                    Last Cycle: {state.lastCycleResult.cycleId}
                    <Badge variant={state.lastCycleResult.status === "completed" ? "default" : "destructive"} className="ml-2 text-[10px]">
                      {state.lastCycleResult.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{state.lastCycleResult.keywordsProcessed}</div>
                      <div className="text-xs text-muted-foreground">Keywords Processed</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-cyan-400">{state.lastCycleResult.targetsDiscovered}</div>
                      <div className="text-xs text-muted-foreground">Targets Discovered</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-violet-400">{state.lastCycleResult.attacksLaunched}</div>
                      <div className="text-xs text-muted-foreground">Attacks Launched</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-emerald-400">{state.lastCycleResult.attacksSucceeded}</div>
                      <div className="text-xs text-muted-foreground">Succeeded</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cycle details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Cycle Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <DetailRow label="Duration" value={`${(state.lastCycleResult.duration / 1000).toFixed(1)}s`} />
                    <DetailRow label="New Keywords" value={String(state.lastCycleResult.newKeywordsDiscovered)} />
                    <DetailRow label="High Priority Targets" value={String(state.lastCycleResult.highPriorityTargets)} />
                    <DetailRow label="Already Hacked Found" value={String(state.lastCycleResult.alreadyHackedFound)} />
                    <DetailRow label="Attacks Failed" value={String(state.lastCycleResult.attacksFailed)} />
                    <DetailRow label="Started" value={new Date(state.lastCycleResult.startedAt).toLocaleString("th-TH")} />
                    <DetailRow label="Completed" value={new Date(state.lastCycleResult.completedAt).toLocaleString("th-TH")} />
                  </CardContent>
                </Card>

                <Card className="border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Summary & Top Keywords</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">{state.lastCycleResult.summary}</p>
                    {state.lastCycleResult.topKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {state.lastCycleResult.topKeywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{kw}</Badge>
                        ))}
                      </div>
                    )}
                    {state.lastCycleResult.errors.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-red-400 font-medium">Errors:</p>
                        {state.lastCycleResult.errors.map((err, i) => (
                          <p key={i} className="text-[10px] text-red-400/70 font-mono">{err}</p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card className="border-zinc-800">
              <CardContent className="py-12 text-center">
                <Brain className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">ยังไม่มี cycle ที่เสร็จสมบูรณ์</p>
                <p className="text-xs text-muted-foreground mt-1">กด Run Cycle เพื่อเริ่มต้น</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Helper Components ───

function StatsCard({ title, value, icon, sub }: {
  title: string; value: number; icon: React.ReactNode; sub?: string;
}) {
  return (
    <Card className="border-zinc-800">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{title}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function PipelineRow({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28">{label}</span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-zinc-800/50">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
