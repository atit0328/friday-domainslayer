import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Bot, Play, Square, RefreshCw, Zap, Brain, Shield, Search,
  BookOpen, Database, Clock, AlertTriangle, CheckCircle2,
  XCircle, Loader2, RotateCcw, Activity, Server,
} from "lucide-react";

const AGENT_ICONS: Record<string, any> = {
  attack: Zap,
  seo: Search,
  scan: Shield,
  research: Brain,
  learning: BookOpen,
  cve: Database,
};

const AGENT_LABELS: Record<string, string> = {
  attack: "Auto Attack",
  seo: "Auto SEO",
  scan: "Auto Scan",
  research: "Auto Research",
  learning: "Auto Learning",
  cve: "Auto CVE Update",
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  attack: "ค้นหา target ใหม่ + โจมตีอัตโนมัติ ทุก 2 ชม.",
  seo: "รัน SEO tasks สำหรับทุกโปรเจค ทุก 4 ชม.",
  scan: "สแกนช่องโหว่เว็บไซต์ ทุก 6 ชม.",
  research: "AI ค้นหาวิธีโจมตีใหม่ + ทดสอบ ทุก 8 ชม.",
  learning: "เรียนรู้จาก pattern ที่ผ่านมา ทุก 6 ชม.",
  cve: "อัพเดท CVE database ทุก 24 ชม.",
};

function HealthBadge({ status }: { status: string }) {
  if (status === "healthy") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Healthy</Badge>;
  if (status === "degraded") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Degraded</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failing</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    completed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
    cancelled: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return <Badge className={colors[status] || "bg-gray-500/20 text-gray-400"}>{status}</Badge>;
}

export default function DaemonControlCenter() {


  // Queries
  const orchestratorStatus = trpc.daemon.getOrchestratorStatus.useQuery(undefined, { refetchInterval: 10000 });
  const daemonStats = trpc.daemon.getDaemonStats.useQuery(undefined, { refetchInterval: 10000 });
  const recentTasks = trpc.daemon.getRecentTasks.useQuery({ limit: 20 }, { refetchInterval: 10000 });

  // Mutations
  const startOrch = trpc.daemon.startOrchestrator.useMutation({
    onSuccess: () => { toast.success("Orchestrator Started"); orchestratorStatus.refetch(); },
  });
  const stopOrch = trpc.daemon.stopOrchestrator.useMutation({
    onSuccess: () => { toast.success("Orchestrator Stopped"); orchestratorStatus.refetch(); },
  });
  const triggerAgent = trpc.daemon.triggerAgent.useMutation({
    onSuccess: (_, vars) => { toast.success(`Agent '${vars.agentName}' triggered`); orchestratorStatus.refetch(); },
  });
  const updateAgent = trpc.daemon.updateAgent.useMutation({
    onSuccess: () => { orchestratorStatus.refetch(); },
  });
  const resetFailures = trpc.daemon.resetAgentFailures.useMutation({
    onSuccess: (_, vars) => { toast.success(`Agent '${vars.agentName}' failures reset`); orchestratorStatus.refetch(); },
  });
  const cancelTask = trpc.daemon.cancelTask.useMutation({
    onSuccess: () => { toast.success("Task cancelled"); recentTasks.refetch(); },
  });
  const retryTask = trpc.daemon.retryTask.useMutation({
    onSuccess: (data) => { toast.success(data.message); recentTasks.refetch(); },
  });

  const orch = orchestratorStatus.data;
  const stats = daemonStats.data;
  const tasks = recentTasks.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="h-6 w-6 text-emerald-400" />
            Daemon Control Center
          </h1>
          <p className="text-muted-foreground mt-1">
            ศูนย์ควบคุม Background System — ทุกงานทำงานต่อเนื่องแม้ออกจากระบบ
          </p>
        </div>
        <div className="flex gap-2">
          {orch?.isRunning ? (
            <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => stopOrch.mutate()}>
              <Square className="h-4 w-4 mr-2" /> Stop All
            </Button>
          ) : (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => startOrch.mutate()}>
              <Play className="h-4 w-4 mr-2" /> Start All
            </Button>
          )}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">DAEMON STATUS</p>
                <p className="text-lg font-bold mt-1">
                  {orch?.isRunning ? (
                    <span className="text-emerald-400 flex items-center gap-1"><Activity className="h-4 w-4" /> Running</span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-1"><XCircle className="h-4 w-4" /> Stopped</span>
                  )}
                </p>
              </div>
              <Bot className="h-8 w-8 text-emerald-400/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">RUNNING TASKS</p>
                <p className="text-2xl font-bold mt-1 text-blue-400">{stats?.runningTaskCount || 0}</p>
              </div>
              <Loader2 className="h-8 w-8 text-blue-400/30 animate-spin" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">QUEUED</p>
                <p className="text-2xl font-bold mt-1 text-yellow-400">{stats?.queuedCount || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">CYCLE COUNT</p>
                <p className="text-2xl font-bold mt-1 text-purple-400">{orch?.cycleCount || 0}</p>
              </div>
              <RefreshCw className="h-8 w-8 text-purple-400/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Bot className="h-5 w-5 text-emerald-400" />
          Autonomous Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orch?.agentDetails?.map((agent) => {
            const Icon = AGENT_ICONS[agent.name] || Bot;
            return (
              <Card key={agent.name} className="bg-card/50 border-border/50 hover:border-emerald-500/30 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="h-5 w-5 text-emerald-400" />
                      {AGENT_LABELS[agent.name] || agent.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <HealthBadge status={agent.healthStatus} />
                      <Switch
                        checked={agent.enabled}
                        onCheckedChange={(checked) => updateAgent.mutate({ agentName: agent.name, enabled: checked })}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{AGENT_DESCRIPTIONS[agent.name] || ""}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Interval:</span>
                      <span className="ml-1 font-mono">{agent.intervalMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Runs:</span>
                      <span className="ml-1 font-mono">{agent.totalRuns}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failures:</span>
                      <span className={`ml-1 font-mono ${agent.consecutiveFailures > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {agent.consecutiveFailures}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last:</span>
                      <span className="ml-1 font-mono text-xs">
                        {agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleTimeString() : "—"}
                      </span>
                    </div>
                  </div>

                  {agent.nextRunAt && (
                    <div className="text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Next: {new Date(agent.nextRunAt).toLocaleTimeString()}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => triggerAgent.mutate({ agentName: agent.name })}
                      disabled={!agent.enabled}
                    >
                      <Zap className="h-3 w-3 mr-1" /> Run Now
                    </Button>
                    {agent.consecutiveFailures > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-yellow-500/30 text-yellow-400"
                        onClick={() => resetFailures.mutate({ agentName: agent.name })}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Task Queue */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-400" />
          Task Queue
        </h2>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4">
            {!tasks || tasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No tasks in queue</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-left py-2 px-2">Title</th>
                      <th className="text-left py-2 px-2">Status</th>
                      <th className="text-left py-2 px-2">Priority</th>
                      <th className="text-left py-2 px-2">Created</th>
                      <th className="text-left py-2 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task: any) => (
                      <tr key={task.id} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-2 px-2 font-mono text-xs">{task.id}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="text-xs">{task.taskType}</Badge>
                        </td>
                        <td className="py-2 px-2 max-w-[200px] truncate">{task.title}</td>
                        <td className="py-2 px-2"><StatusBadge status={task.status} /></td>
                        <td className="py-2 px-2">
                          <span className={`text-xs ${task.priority === "critical" ? "text-red-400" : task.priority === "high" ? "text-orange-400" : "text-muted-foreground"}`}>
                            {task.priority}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex gap-1">
                            {(task.status === "queued" || task.status === "running") && (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-400" onClick={() => cancelTask.mutate({ taskId: task.id })}>
                                <XCircle className="h-3 w-3" />
                              </Button>
                            )}
                            {task.status === "failed" && (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-blue-400" onClick={() => retryTask.mutate({ taskId: task.id })}>
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
