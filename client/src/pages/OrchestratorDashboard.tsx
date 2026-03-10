/**
 * Orchestrator Dashboard — Real-time Agent Monitor
 *
 * Displays all 8 autonomous agents with:
 *   - Status cards: enabled/disabled, health, interval, last/next run
 *   - Controls: toggle, trigger now, reset failures
 *   - Overall daemon stats: queue, success rate, uptime
 *   - Recent task history table
 *   - Auto-refresh every 5 seconds
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Sword, Globe, Shield, FlaskConical, Brain, Database,
  KeyRound, Skull, Play, RotateCcw, Zap, Clock, Activity,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Server,
  Timer, TrendingUp, ListTodo, RefreshCw,
} from "lucide-react";

// ═══════════════════════════════════════════════
//  AGENT METADATA
// ═══════════════════════════════════════════════

const AGENT_META: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}> = {
  attack: {
    label: "Auto-Attack",
    icon: Sword,
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    description: "Agentic attack sessions — full auto exploitation",
  },
  seo: {
    label: "Auto-SEO",
    icon: Globe,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    description: "Daily SEO tasks for all projects",
  },
  scan: {
    label: "Auto-Scan",
    icon: Shield,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    description: "Periodic vulnerability scanning",
  },
  research: {
    label: "Auto-Research",
    icon: FlaskConical,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
    description: "Discover new attack vectors",
  },
  learning: {
    label: "Adaptive Learning",
    icon: Brain,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    description: "Learn from outcomes, evolve strategies",
  },
  cve: {
    label: "CVE Database",
    icon: Database,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/20",
    description: "Keep vulnerability database updated",
  },
  keyword_discovery: {
    label: "Keyword Discovery",
    icon: KeyRound,
    color: "text-teal-400",
    bgColor: "bg-teal-500/10 border-teal-500/20",
    description: "SERP keyword search & target discovery",
  },
  gambling_brain: {
    label: "Gambling Brain",
    icon: Skull,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10 border-rose-500/20",
    description: "Full intelligence cycle: keywords → targets → attack",
  },
};

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.round((ms % 3_600_000) / 60_000);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(ms / 86_400_000)}d`;
}

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return "Never";
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 0) return "Just now";
  return `${formatDuration(diff)} ago`;
}

function timeUntil(isoStr: string | null): string {
  if (!isoStr) return "—";
  const diff = new Date(isoStr).getTime() - Date.now();
  if (diff <= 0) return "Imminent";
  return `in ${formatDuration(diff)}`;
}

function formatUptime(ms: number): string {
  if (ms <= 0) return "Offline";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  return `${hours}h ${minutes}m`;
}

// ═══════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════

export default function OrchestratorDashboard() {
  const [activeTab, setActiveTab] = useState("agents");

  // Data queries with auto-refresh
  const orchestratorQ = trpc.daemon.getOrchestratorStatus.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const daemonQ = trpc.daemon.getDaemonStats.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const recentTasksQ = trpc.daemon.getRecentTasks.useQuery(
    { limit: 30 },
    { refetchInterval: 10_000 },
  );

  // Mutations
  const updateAgent = trpc.daemon.updateAgent.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      orchestratorQ.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const triggerAgent = trpc.daemon.triggerAgent.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      orchestratorQ.refetch();
      daemonQ.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const resetFailures = trpc.daemon.resetAgentFailures.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      orchestratorQ.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const startOrch = trpc.daemon.startOrchestrator.useMutation({
    onSuccess: () => {
      toast.success("Orchestrator started");
      orchestratorQ.refetch();
    },
  });
  const stopOrch = trpc.daemon.stopOrchestrator.useMutation({
    onSuccess: () => {
      toast.success("Orchestrator stopped");
      orchestratorQ.refetch();
    },
  });

  const orch = orchestratorQ.data;
  const daemon = daemonQ.data;
  const tasks = recentTasksQ.data;

  // Compute overall stats
  const overallStats = useMemo(() => {
    if (!orch || !daemon) return null;
    const agents = orch.agentDetails || [];
    const healthy = agents.filter((a) => a.healthStatus === "healthy").length;
    const degraded = agents.filter((a) => a.healthStatus === "degraded").length;
    const failing = agents.filter((a) => a.healthStatus === "failing").length;
    const totalRuns = agents.reduce((s, a) => s + a.totalRuns, 0);
    const totalSuccesses = agents.reduce((s, a) => s + a.totalSuccesses, 0);
    const successRate = totalRuns > 0 ? Math.round((totalSuccesses / totalRuns) * 100) : 0;
    return { healthy, degraded, failing, totalRuns, totalSuccesses, successRate };
  }, [orch, daemon]);

  // Loading state
  if (!orch || !daemon) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        <span className="ml-3 text-muted-foreground">Loading Orchestrator...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-7 h-7 text-emerald-400" />
            Orchestrator Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time monitoring of {orch.agentDetails?.length || 0} autonomous agents
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={orch.isRunning ? "default" : "destructive"}
            className={orch.isRunning ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}
          >
            <span className={`w-2 h-2 rounded-full mr-1.5 ${orch.isRunning ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {orch.isRunning ? "RUNNING" : "STOPPED"}
          </Badge>
          {orch.isRunning ? (
            <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => stopOrch.mutate()}>
              Stop
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => startOrch.mutate()}>
              <Play className="w-4 h-4 mr-1" /> Start
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => { orchestratorQ.refetch(); daemonQ.refetch(); recentTasksQ.refetch(); }}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatMini icon={Server} label="Uptime" value={formatUptime(daemon.uptime)} color="text-emerald-400" />
        <StatMini icon={CheckCircle2} label="Healthy" value={`${overallStats?.healthy || 0}`} color="text-emerald-400" />
        <StatMini icon={AlertTriangle} label="Degraded" value={`${overallStats?.degraded || 0}`} color="text-amber-400" />
        <StatMini icon={TrendingUp} label="Success Rate" value={`${overallStats?.successRate || 0}%`} color="text-cyan-400" />
        <StatMini icon={ListTodo} label="Queue" value={`${daemon.queuedCount}`} color="text-violet-400" />
        <StatMini icon={Timer} label="Today Done" value={`${daemon.completedToday}`} color="text-blue-400" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="agents">Agents ({orch.agentDetails?.length || 0})</TabsTrigger>
          <TabsTrigger value="tasks">Recent Tasks ({tasks?.length || 0})</TabsTrigger>
        </TabsList>

        {/* Agents Tab */}
        <TabsContent value="agents" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(orch.agentDetails || []).map((agent) => {
              const meta = AGENT_META[agent.name] || {
                label: agent.name,
                icon: Zap,
                color: "text-gray-400",
                bgColor: "bg-gray-500/10 border-gray-500/20",
                description: "",
              };
              const Icon = meta.icon;
              const successRate = agent.totalRuns > 0
                ? Math.round((agent.totalSuccesses / agent.totalRuns) * 100)
                : 0;

              return (
                <Card key={agent.name} className={`border ${meta.bgColor} transition-all hover:shadow-lg`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${meta.bgColor}`}>
                          <Icon className={`w-5 h-5 ${meta.color}`} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{meta.label}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={agent.enabled}
                        onCheckedChange={(checked) =>
                          updateAgent.mutate({ agentName: agent.name, enabled: checked })
                        }
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Health + Status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <HealthBadge status={agent.healthStatus} />
                      <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        Every {agent.intervalMinutes}m
                      </Badge>
                      {agent.consecutiveFailures > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {agent.consecutiveFailures} fails
                        </Badge>
                      )}
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-background/50 rounded-md p-2 text-center">
                        <div className="text-muted-foreground">Last Run</div>
                        <div className="font-medium mt-0.5">{timeAgo(agent.lastRunAt)}</div>
                      </div>
                      <div className="bg-background/50 rounded-md p-2 text-center">
                        <div className="text-muted-foreground">Next Run</div>
                        <div className="font-medium mt-0.5">{timeUntil(agent.nextRunAt)}</div>
                      </div>
                      <div className="bg-background/50 rounded-md p-2 text-center">
                        <div className="text-muted-foreground">Total Runs</div>
                        <div className="font-medium mt-0.5">{agent.totalRuns}</div>
                      </div>
                      <div className="bg-background/50 rounded-md p-2 text-center">
                        <div className="text-muted-foreground">Success</div>
                        <div className={`font-medium mt-0.5 ${successRate >= 50 ? "text-emerald-400" : successRate > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                          {agent.totalRuns > 0 ? `${successRate}%` : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs h-8"
                        onClick={() => triggerAgent.mutate({ agentName: agent.name })}
                        disabled={!agent.enabled}
                      >
                        <Zap className="w-3 h-3 mr-1" /> Run Now
                      </Button>
                      {agent.consecutiveFailures > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                          onClick={() => resetFailures.mutate({ agentName: agent.name })}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Reset
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          <Card className="border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left p-3 font-medium">ID</th>
                      <th className="text-left p-3 font-medium">Type</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Title</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Priority</th>
                      <th className="text-left p-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tasks || []).map((task) => {
                      const agentKey = Object.entries(AGENT_META).find(
                        ([, m]) => task.taskType?.includes(m.label.toLowerCase().replace(/[^a-z]/g, ""))
                      );
                      return (
                        <tr key={task.id} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                          <td className="p-3 text-xs text-muted-foreground">#{task.id}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs font-mono">
                              {task.taskType}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs max-w-[200px] truncate hidden sm:table-cell">
                            {task.title}
                          </td>
                          <td className="p-3">
                            <TaskStatusBadge status={task.status} />
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            <PriorityBadge priority={task.priority} />
                          </td>
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                            {task.createdAt ? timeAgo(new Date(task.createdAt).toISOString()) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {(!tasks || tasks.length === 0) && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No tasks yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════

function StatMini({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <Card className="border-border">
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className={`w-4 h-4 ${color} shrink-0`} />
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-sm font-bold truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthBadge({ status }: { status: string }) {
  if (status === "healthy") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
        <CheckCircle2 className="w-3 h-3 mr-1" /> Healthy
      </Badge>
    );
  }
  if (status === "degraded") {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
        <AlertTriangle className="w-3 h-3 mr-1" /> Degraded
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
      <XCircle className="w-3 h-3 mr-1" /> Failing
    </Badge>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const map: Record<string, { className: string; label: string }> = {
    queued: { className: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Queued" },
    running: { className: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Running" },
    completed: { className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Done" },
    failed: { className: "bg-red-500/20 text-red-400 border-red-500/30", label: "Failed" },
    cancelled: { className: "bg-gray-500/20 text-gray-400 border-gray-500/30", label: "Cancelled" },
    skipped: { className: "bg-gray-500/20 text-gray-400 border-gray-500/30", label: "Skipped" },
  };
  const s = map[status] || map.queued;
  return <Badge className={`${s.className} text-xs`}>{s.label}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return <Badge className={`${map[priority] || map.medium} text-xs`}>{priority}</Badge>;
}
