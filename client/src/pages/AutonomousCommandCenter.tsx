/**
 * ═══════════════════════════════════════════════════════════════
 *  AUTONOMOUS AI COMMAND CENTER
 *  
 *  Real-time dashboard for the Master AI Orchestrator.
 *  Shows OODA cycle status, decisions, task queue, and controls.
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOrchestratorSSE, type ActivityMessage } from "@/hooks/useOrchestratorSSE";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Brain,
  Play,
  Pause,
  Square,
  Zap,
  Activity,
  Target,
  Shield,
  Globe,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Settings2,
  Eye,
  Cpu,
  Network,
  BarChart3,
  ListTodo,
  Loader2,
  Repeat2,
} from "lucide-react";
import SubsystemDetailSheet from "@/components/SubsystemDetailSheet";

export default function AutonomousCommandCenter() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [detailSubsystem, setDetailSubsystem] = useState<"seo" | "attack" | "pbn" | "discovery" | "rank" | "autobid" | null>(null);

  // ─── Real-time SSE Connection ───
  const sse = useOrchestratorSSE({ enabled: true });

  // ─── Data Queries (SSE auto-invalidates, so longer intervals are fine) ───
  const stateQuery = trpc.orchestrator.getState.useQuery(undefined, {
    refetchInterval: 30000, // SSE handles real-time updates
  });
  const taskStatsQuery = trpc.orchestrator.getTaskStats.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const decisionsQuery = trpc.orchestrator.getDecisions.useQuery({ limit: 20 });
  const taskQueueQuery = trpc.orchestrator.getTaskQueue.useQuery({ limit: 30 });
  const worldStateQuery = trpc.orchestrator.getWorldState.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // ─── Mutations ───
  const startMutation = trpc.orchestrator.start.useMutation({
    onSuccess: () => {
      toast.success("🚀 Orchestrator Started", { description: "AI is now running autonomously" });
      stateQuery.refetch();
    },
    onError: (err) => toast.error("Error", { description: err.message }),
  });

  const stopMutation = trpc.orchestrator.stop.useMutation({
    onSuccess: () => {
      toast.success("⏹ Orchestrator Stopped", { description: "AI has been stopped" });
      stateQuery.refetch();
    },
  });

  const pauseMutation = trpc.orchestrator.pause.useMutation({
    onSuccess: () => {
      toast.success("⏸ Orchestrator Paused", { description: "AI is paused" });
      stateQuery.refetch();
    },
  });

  const runCycleMutation = trpc.orchestrator.runCycle.useMutation({
    onSuccess: (data) => {
      toast.success(`🧠 OODA Cycle #${data.cycle} Complete`, {
        description: `${data.decisions.length} decisions, ${data.tasksCreated} tasks created`,
      });
      stateQuery.refetch();
      taskStatsQuery.refetch();
      decisionsQuery.refetch();
      taskQueueQuery.refetch();
    },
    onError: (err) => toast.error("Cycle Error", { description: err.message }),
  });

  const updateSettingsMutation = trpc.orchestrator.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings Updated");
      stateQuery.refetch();
    },
  });

  const cancelTaskMutation = trpc.orchestrator.cancelTask.useMutation({
    onSuccess: () => {
      taskQueueQuery.refetch();
      taskStatsQuery.refetch();
    },
  });

  const state = stateQuery.data;
  const taskStats = taskStatsQuery.data;
  const worldState = worldStateQuery.data as Record<string, any> | null;

  const sseStatusDot = sse.status === "connected" ? "bg-emerald-400" : sse.status === "reconnecting" ? "bg-yellow-400 animate-pulse" : "bg-gray-500";

  const statusColor = {
    running: "bg-emerald-500",
    stopped: "bg-red-500",
    paused: "bg-yellow-500",
    error: "bg-red-600",
  }[state?.status || "stopped"] || "bg-gray-500";

  const statusLabel = {
    running: "AUTONOMOUS",
    stopped: "OFFLINE",
    paused: "PAUSED",
    error: "ERROR",
  }[state?.status || "stopped"] || "UNKNOWN";

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Brain className="h-10 w-10 text-emerald-400" />
            <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${statusColor} ${state?.status === "running" ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              AI Command Center
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={state?.status === "running" ? "default" : "secondary"} className={state?.status === "running" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}>
                {statusLabel}
              </Badge>
              {state?.currentCycle ? (
                <span className="text-xs text-muted-foreground">
                  Cycle #{state.currentCycle} | {state.totalCycles} total
                </span>
              ) : null}
              {/* SSE Status + Live Phase */}
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${sseStatusDot}`} />
                <span className="text-xs text-muted-foreground">
                  {sse.status === "connected" ? "Live" : sse.status === "reconnecting" ? "Reconnecting..." : "Offline"}
                </span>
                {sse.isCycleRunning && sse.currentPhase && (
                  <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 animate-pulse">
                    {sse.currentPhase.toUpperCase()}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCycleMutation.mutate()}
            disabled={runCycleMutation.isPending}
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            {runCycleMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-1" />
            )}
            Run OODA Cycle
          </Button>

          {state?.status === "running" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
                <Pause className="h-4 w-4 mr-1" /> Pause
              </Button>
              <Button variant="destructive" size="sm" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
                <Square className="h-4 w-4 mr-1" /> Stop
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {startMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Start AI
            </Button>
          )}
        </div>
      </div>

      {/* ═══ Stats Grid ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard icon={<ListTodo className="h-4 w-4" />} label="Queued" value={taskStats?.queued || 0} color="text-blue-400" />
        <StatCard icon={<Loader2 className="h-4 w-4 animate-spin" />} label="Running" value={taskStats?.running || 0} color="text-yellow-400" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Done Today" value={taskStats?.completedToday || 0} color="text-emerald-400" />
        <StatCard icon={<XCircle className="h-4 w-4" />} label="Failed Today" value={taskStats?.failedToday || 0} color="text-red-400" />
        <StatCard icon={<Brain className="h-4 w-4" />} label="Decisions" value={state?.totalDecisions || 0} color="text-purple-400" />
        <StatCard icon={<RotateCcw className="h-4 w-4" />} label="Total Cycles" value={state?.totalCycles || 0} color="text-cyan-400" />
      </div>

      {/* ═══ Tabs ═══ */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="overview" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
            <Eye className="h-4 w-4 mr-1" /> Overview
          </TabsTrigger>
          <TabsTrigger value="decisions" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
            <Brain className="h-4 w-4 mr-1" /> Decisions
          </TabsTrigger>
          <TabsTrigger value="tasks" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
            <ListTodo className="h-4 w-4 mr-1" /> Task Queue
          </TabsTrigger>
          <TabsTrigger value="live" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
            <Activity className="h-4 w-4 mr-1" /> Live Feed
            {sse.isCycleRunning && <span className="ml-1 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-zinc-500/20 data-[state=active]:text-zinc-300">
            <Settings2 className="h-4 w-4 mr-1" /> Settings
          </TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ─── */}
        <TabsContent value="overview" className="space-y-4">
          {/* World State */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <WorldStateCard
              title="SEO Engine"
              icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
              enabled={state?.seoEnabled}
              onClick={() => setDetailSubsystem("seo")}
              stats={[
                { label: "Active Projects", value: worldState?.seo?.activeProjects || 0 },
                { label: "Content Pending", value: worldState?.seo?.contentPending || 0 },
                { label: "Rank Changes", value: worldState?.seo?.recentRankChanges?.length || 0 },
              ]}
            />
            <WorldStateCard
              title="Attack Engine"
              icon={<Target className="h-5 w-5 text-red-400" />}
              enabled={state?.attackEnabled}
              onClick={() => setDetailSubsystem("attack")}
              stats={[
                { label: "Total Deploys", value: worldState?.attack?.totalDeploys || 0 },
                { label: "Successful", value: worldState?.attack?.successfulDeploys || 0 },
                { label: "Failed", value: worldState?.attack?.failedDeploys || 0 },
              ]}
            />
            <WorldStateCard
              title="PBN Network"
              icon={<Network className="h-5 w-5 text-blue-400" />}
              enabled={state?.pbnEnabled}
              onClick={() => setDetailSubsystem("pbn")}
              stats={[
                { label: "Active Sites", value: worldState?.pbn?.activeSites || 0 },
                { label: "Down Sites", value: worldState?.pbn?.downSites || 0 },
                { label: "Need Content", value: worldState?.pbn?.sitesNeedingContent?.length || 0 },
              ]}
            />
            <WorldStateCard
              title="Discovery"
              icon={<Globe className="h-5 w-5 text-cyan-400" />}
              enabled={state?.discoveryEnabled}
              onClick={() => setDetailSubsystem("discovery")}
              stats={[
                { label: "Found Today", value: worldState?.discovery?.targetsDiscoveredToday || 0 },
                { label: "High Value", value: worldState?.discovery?.highValueTargets || 0 },
              ]}
            />
            <WorldStateCard
              title="Rank Tracking"
              icon={<BarChart3 className="h-5 w-5 text-yellow-400" />}
              enabled={state?.rankTrackingEnabled}
              onClick={() => setDetailSubsystem("rank")}
              stats={[
                { label: "Total Tracked", value: worldState?.rank?.totalTracked || 0 },
                { label: "Improved", value: worldState?.rank?.improved || 0 },
                { label: "Declined", value: worldState?.rank?.declined || 0 },
              ]}
            />
            <WorldStateCard
              title="Auto-Bid"
              icon={<Shield className="h-5 w-5 text-orange-400" />}
              enabled={state?.autobidEnabled}
              onClick={() => setDetailSubsystem("autobid")}
              stats={[
                { label: "Active Rules", value: worldState?.autobid?.activeRules || 0 },
                { label: "Budget Left", value: `$${(worldState?.autobid?.totalBudgetRemaining || 0).toFixed(0)}` },
              ]}
            />
            <WorldStateCard
              title="Hacked Sites"
              icon={<Repeat2 className="h-5 w-5 text-rose-400" />}
              enabled={state?.attackEnabled}
              stats={[
                { label: "Detected", value: worldState?.hackedSites?.totalDetected || 0 },
                { label: "Awaiting Takeover", value: worldState?.hackedSites?.awaitingTakeover || 0 },
                { label: "Taken Over", value: worldState?.hackedSites?.takenOver || 0 },
                { label: "High Priority", value: worldState?.hackedSites?.highPriority || 0 },
              ]}
            />
          </div>

          {/* Next Cycle Info */}
          {state?.nextCycleAt && (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Next OODA Cycle: {new Date(state.nextCycleAt).toLocaleString("th-TH")}
                </div>
                <div className="text-sm text-muted-foreground">
                  Interval: {state.cycleIntervalMinutes} min | Aggressiveness: {state.aggressiveness}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Decisions Tab ─── */}
        <TabsContent value="decisions" className="space-y-3">
          {decisionsQuery.data?.length === 0 ? (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No AI decisions yet. Start the orchestrator or run a manual OODA cycle.</p>
              </CardContent>
            </Card>
          ) : (
            decisionsQuery.data?.map((d: any) => (
              <Card key={d.id} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          Cycle #{d.cycle}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${
                          d.phase === "observe" ? "border-blue-500/30 text-blue-400" :
                          d.phase === "orient" ? "border-yellow-500/30 text-yellow-400" :
                          d.phase === "decide" ? "border-purple-500/30 text-purple-400" :
                          "border-emerald-500/30 text-emerald-400"
                        }`}>
                          {d.phase?.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-xs border-zinc-700">
                          {d.subsystem}
                        </Badge>
                        {d.impactLevel && (
                          <Badge variant={d.impactLevel === "critical" ? "destructive" : "secondary"} className="text-xs">
                            {d.impactLevel}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-white">{d.decision}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.reasoning}</p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleTimeString("th-TH")}
                      </div>
                      {d.confidence > 0 && (
                        <div className={`text-xs font-mono ${d.confidence >= 80 ? "text-emerald-400" : d.confidence >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                          {d.confidence}%
                        </div>
                      )}
                      {d.tasksCreated > 0 && (
                        <div className="text-xs text-blue-400">{d.tasksCreated} tasks</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ─── Task Queue Tab ─── */}
        <TabsContent value="tasks" className="space-y-3">
          {taskQueueQuery.data?.length === 0 ? (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="py-12 text-center text-muted-foreground">
                <ListTodo className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No tasks in queue. AI will create tasks during OODA cycles.</p>
              </CardContent>
            </Card>
          ) : (
            taskQueueQuery.data?.map((t: any) => (
              <Card key={t.id} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <TaskStatusBadge status={t.status} />
                        <Badge variant="outline" className="text-xs border-zinc-700">{t.subsystem}</Badge>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <p className="text-sm font-medium text-white">{t.title}</p>
                      {t.targetDomain && (
                        <p className="text-xs text-cyan-400 mt-0.5">{t.targetDomain}</p>
                      )}
                      {t.aiReasoning && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.aiReasoning}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {t.status === "queued" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => cancelTaskMutation.mutate({ taskId: t.id })}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="text-xs text-muted-foreground text-right">
                        {new Date(t.createdAt).toLocaleTimeString("th-TH")}
                        {t.retryCount > 0 && (
                          <div className="text-yellow-400">Retry {t.retryCount}/{t.maxRetries}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ─── Live Feed Tab ─── */}
        <TabsContent value="live" className="space-y-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-emerald-400" />
                  Live Activity Feed
                  <span className={`h-2 w-2 rounded-full ${sseStatusDot}`} />
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {sse.activityFeed.length} events
                  </span>
                  <Button variant="ghost" size="sm" onClick={sse.clearEvents} className="text-xs">
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sse.activityFeed.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No events yet. Start the AI or run an OODA cycle to see live activity.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[600px] overflow-y-auto">
                  {sse.activityFeed.map((msg) => (
                    <LiveActivityRow key={msg.id} message={msg} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Settings Tab ─── */}
        <TabsContent value="settings" className="space-y-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Cpu className="h-5 w-5 text-emerald-400" />
                Orchestrator Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Aggressiveness */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Aggressiveness Level</p>
                  <p className="text-xs text-muted-foreground">How aggressive the AI should be</p>
                </div>
                <Select
                  value={state?.aggressiveness || "moderate"}
                  onValueChange={(v) => updateSettingsMutation.mutate({ aggressiveness: v as any })}
                >
                  <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conservative">Conservative</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="aggressive">Aggressive</SelectItem>
                    <SelectItem value="maximum">Maximum</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Cycle Interval */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Cycle Interval</p>
                  <p className="text-xs text-muted-foreground">Minutes between OODA cycles</p>
                </div>
                <Select
                  value={String(state?.cycleIntervalMinutes || 30)}
                  onValueChange={(v) => updateSettingsMutation.mutate({ cycleIntervalMinutes: parseInt(v) })}
                >
                  <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 min</SelectItem>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                    <SelectItem value="360">6 hours</SelectItem>
                    <SelectItem value="720">12 hours</SelectItem>
                    <SelectItem value="1440">24 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Max Concurrent */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Max Concurrent Tasks</p>
                  <p className="text-xs text-muted-foreground">Maximum tasks running simultaneously</p>
                </div>
                <Select
                  value={String(state?.maxConcurrentTasks || 5)}
                  onValueChange={(v) => updateSettingsMutation.mutate({ maxConcurrentTasks: parseInt(v) })}
                >
                  <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Max Daily Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Max Daily Actions</p>
                  <p className="text-xs text-muted-foreground">Daily action limit for safety</p>
                </div>
                <Select
                  value={String(state?.maxDailyActions || 100)}
                  onValueChange={(v) => updateSettingsMutation.mutate({ maxDailyActions: parseInt(v) })}
                >
                  <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                    <SelectItem value="1000">1,000</SelectItem>
                    <SelectItem value="5000">5,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Subsystem Toggles */}
              <div className="border-t border-zinc-800 pt-4">
                <p className="text-sm font-medium text-white mb-3">Subsystem Controls</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SubsystemToggle
                    label="SEO Engine"
                    description="Content, backlinks, on-page optimization"
                    enabled={state?.seoEnabled ?? true}
                    onChange={(v) => updateSettingsMutation.mutate({ seoEnabled: v })}
                    icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
                  />
                  <SubsystemToggle
                    label="Attack Engine"
                    description="Domain scanning, deployment, verification"
                    enabled={state?.attackEnabled ?? true}
                    onChange={(v) => updateSettingsMutation.mutate({ attackEnabled: v })}
                    icon={<Target className="h-4 w-4 text-red-400" />}
                  />
                  <SubsystemToggle
                    label="PBN Network"
                    description="Auto-posting, interlinking, health checks"
                    enabled={state?.pbnEnabled ?? true}
                    onChange={(v) => updateSettingsMutation.mutate({ pbnEnabled: v })}
                    icon={<Network className="h-4 w-4 text-blue-400" />}
                  />
                  <SubsystemToggle
                    label="Discovery"
                    description="Target discovery, scoring, pipeline"
                    enabled={state?.discoveryEnabled ?? true}
                    onChange={(v) => updateSettingsMutation.mutate({ discoveryEnabled: v })}
                    icon={<Globe className="h-4 w-4 text-cyan-400" />}
                  />
                  <SubsystemToggle
                    label="Rank Tracking"
                    description="Keyword ranking, competitor analysis"
                    enabled={state?.rankTrackingEnabled ?? true}
                    onChange={(v) => updateSettingsMutation.mutate({ rankTrackingEnabled: v })}
                    icon={<BarChart3 className="h-4 w-4 text-yellow-400" />}
                  />
                  <SubsystemToggle
                    label="Auto-Bid"
                    description="Marketplace scanning, bidding, purchasing"
                    enabled={state?.autobidEnabled ?? true}
                    onChange={(v) => updateSettingsMutation.mutate({ autobidEnabled: v })}
                    icon={<Shield className="h-4 w-4 text-orange-400" />}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Subsystem Detail Sheet ─── */}
      <SubsystemDetailSheet
        open={detailSubsystem !== null}
        onOpenChange={(open) => { if (!open) setDetailSubsystem(null); }}
        subsystem={detailSubsystem}
      />
    </div>
  );
}
// ─── Sub-components ────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
          <div className={color}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function WorldStateCard({
  title,
  icon,
  enabled,
  stats,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  enabled?: boolean;
  stats: { label: string; value: number | string }[];
  onClick?: () => void;
}) {
  return (
    <Card
      className={`bg-zinc-900/50 border-zinc-800 transition-all cursor-pointer hover:border-zinc-600 hover:bg-zinc-800/50 ${!enabled ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium text-white">{title}</span>
          </div>
          <Badge variant={enabled ? "default" : "secondary"} className={`text-xs ${enabled ? "bg-emerald-500/20 text-emerald-400" : ""}`}>
            {enabled ? "ON" : "OFF"}
          </Badge>
        </div>
        <div className="space-y-1.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="text-white font-medium">{s.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SubsystemToggle({
  label,
  description,
  enabled,
  onChange,
  icon,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} />
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; icon: React.ReactNode }> = {
    queued: { className: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <Clock className="h-3 w-3" /> },
    running: { className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed: { className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    failed: { className: "bg-red-500/20 text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3" /> },
    cancelled: { className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: <Square className="h-3 w-3" /> },
  };
  const c = config[status] || config.queued;
  return (
    <Badge variant="outline" className={`text-xs ${c.className}`}>
      <span className="mr-1">{c.icon}</span>
      {status}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  };
  return (
    <Badge variant="outline" className={`text-xs ${config[priority] || config.medium}`}>
      {priority}
    </Badge>
  );
}

function LiveActivityRow({ message }: { message: ActivityMessage }) {
  const typeColors: Record<string, string> = {
    info: "border-l-blue-500",
    success: "border-l-emerald-500",
    warning: "border-l-yellow-500",
    error: "border-l-red-500",
    phase: "border-l-purple-500",
  };

  const time = new Date(message.timestamp);
  const timeStr = time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2 rounded-md bg-zinc-800/30 border-l-2 ${typeColors[message.type] || "border-l-zinc-600"} hover:bg-zinc-800/50 transition-colors`}
    >
      <span className="text-base leading-none mt-0.5">{message.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white">{message.message}</span>
        </div>
        {message.details && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{message.details}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">{timeStr}</span>
    </div>
  );
}
