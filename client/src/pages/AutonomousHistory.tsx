/**
 * Attack History — Deploy history, batch history, stats dashboard
 * Shows all autonomous deploys with filtering, detail views, and batch tracking
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clock, Rocket, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Lock, Trash2, Eye, Globe, Skull, ChevronLeft, ChevronRight,
  BarChart3, Layers, Target, Brain, Sparkles, Activity,
  Package, ArrowUpRight,
} from "lucide-react";

// ─── Status helpers ───
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  queued: { label: "Queued", color: "text-gray-400 border-gray-500/30 bg-gray-500/10", icon: Clock },
  running: { label: "Running", color: "text-blue-400 border-blue-500/30 bg-blue-500/10", icon: Loader2 },
  success: { label: "Success", color: "text-green-400 border-green-500/30 bg-green-500/10", icon: CheckCircle2 },
  partial: { label: "Partial", color: "text-amber-400 border-amber-500/30 bg-amber-500/10", icon: AlertTriangle },
  failed: { label: "Failed", color: "text-red-400 border-red-500/30 bg-red-500/10", icon: XCircle },
  stopped: { label: "Stopped", color: "text-orange-400 border-orange-500/30 bg-orange-500/10", icon: XCircle },
};

const MODE_ICONS: Record<string, any> = {
  attack: Target,
  fixated: Brain,
  emergent: Sparkles,
};

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}m ${s}s`;
}

function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("th-TH", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Component ───
export default function AutonomousHistory() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("deploys");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDeployId, setSelectedDeployId] = useState<number | null>(null);
  const [batchPage, setBatchPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  const limit = 15;

  // Queries
  const statsQuery = trpc.autonomous.stats.useQuery(undefined, { enabled: !!user });
  const deploysQuery = trpc.autonomous.listDeploys.useQuery(
    { page, limit, status: statusFilter === "all" ? undefined : statusFilter as any },
    { enabled: !!user },
  );
  const batchesQuery = trpc.autonomous.listBatches.useQuery(
    { page: batchPage, limit: 10 },
    { enabled: !!user && tab === "batches" },
  );
  const deployDetailQuery = trpc.autonomous.getDeploy.useQuery(
    { id: selectedDeployId! },
    { enabled: !!selectedDeployId },
  );
  const batchDetailQuery = trpc.autonomous.getBatch.useQuery(
    { id: selectedBatchId! },
    { enabled: !!selectedBatchId },
  );

  // Mutations
  const deleteDeployMut = trpc.autonomous.deleteDeploy.useMutation({
    onSuccess: () => {
      toast.success("Deploy record deleted");
      deploysQuery.refetch();
      statsQuery.refetch();
      setSelectedDeployId(null);
    },
  });
  const deleteBatchMut = trpc.autonomous.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success("Batch deleted");
      batchesQuery.refetch();
      setSelectedBatchId(null);
    },
  });

  // Auth guard
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user || user.role !== "superadmin") {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-red-400">Superadmin Access Required</h2>
      </div>
    );
  }

  // ─── Deploy Detail View ───
  if (selectedDeployId && deployDetailQuery.data) {
    const d: Record<string, any> = deployDetailQuery.data as any;
    const sc = STATUS_CONFIG[d.status] || STATUS_CONFIG.failed;
    const ModeIcon = MODE_ICONS[d.mode] || Target;

    return (
      <div className="space-y-4 p-1">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedDeployId(null)} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
          <h2 className="text-lg font-bold">Deploy #{d.id}</h2>
          <Badge variant="outline" className={`${sc.color}`}>
            <sc.icon className="w-3 h-3 mr-1" />
            {sc.label}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Info Card */}
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-red-400" />
                Target Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Domain</span>
                <span className="font-mono">{d.targetDomain}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Redirect</span>
                <span className="font-mono text-xs truncate max-w-[200px]">{d.redirectUrl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="flex items-center gap-1">
                  <ModeIcon className="w-3.5 h-3.5" />
                  {d.mode.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Goal</span>
                <span>{d.goal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span>{formatDuration(d.duration)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span>{formatDate(d.startedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span>{formatDate(d.completedAt)}</span>
              </div>
              {((): React.ReactNode => {
                const kws = d.seoKeywords;
                if (!kws || !Array.isArray(kws) || kws.length === 0) return null;
                return (
                  <div>
                    <span className="text-muted-foreground text-xs">Keywords:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {kws.map((kw: unknown, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">{String(kw)}</Badge>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* World State Card */}
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                World State at Completion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: "Hosts", value: Number(d.hostsFound), color: "text-cyan-400" },
                  { label: "Ports", value: Number(d.portsFound), color: "text-blue-400" },
                  { label: "Vulns", value: Number(d.vulnsFound), color: "text-yellow-400" },
                  { label: "Creds", value: Number(d.credsFound), color: "text-orange-400" },
                  { label: "Upload Paths", value: Number(d.uploadPathsFound), color: "text-violet-400" },
                  { label: "Shell URLs", value: Number(d.shellUrlsFound), color: "text-red-400" },
                  { label: "Files Deployed", value: Number(d.filesDeployed), color: "text-emerald-400" },
                  { label: "Files Verified", value: Number(d.filesVerified), color: "text-green-400" },
                ] as Array<{ label: string; value: number; color: string }>).map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-2 rounded bg-background/30">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className={`font-mono font-bold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Emergent Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Epochs</span><span className="font-mono">{d.epochs}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Waves</span><span className="font-mono">{d.waves}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Escalation</span><span className="font-mono">{String(d.escalationLevel ?? "—")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Goal Drifted</span><span>{d.goalDrifted ? "Yes" : "No"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Drift Count</span><span className="font-mono">{d.driftCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Hack Count</span><span className="font-mono">{d.hackCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Runaway Score</span><span className="font-mono">{d.runawayScore}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Boundary Level</span><span className="font-mono">{d.boundaryLevel}</span></div>
              </div>
              {String(d.originalGoal) !== String(d.finalGoal) && (
                <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs">
                  Goal: <span className="font-mono">{String(d.originalGoal)}</span> → <span className="font-mono">{String(d.finalGoal)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* URLs Card */}
          <Card className="border-border/30 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-violet-400" />
                Deployed URLs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-1">
                  {(d.shellUrls as string[] || []).map((url, i) => (
                    <div key={`s-${i}`} className="flex items-center gap-2 text-xs">
                      <Skull className="w-3 h-3 text-red-400 shrink-0" />
                      <a href={url} target="_blank" rel="noopener" className="font-mono text-red-400 hover:underline truncate">{url}</a>
                    </div>
                  ))}
                  {(d.verifiedUrls as string[] || []).map((url, i) => (
                    <div key={`v-${i}`} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                      <a href={url} target="_blank" rel="noopener" className="font-mono text-green-400 hover:underline truncate">{url}</a>
                    </div>
                  ))}
                  {(d.deployedUrls as string[] || []).map((url, i) => (
                    <div key={`d-${i}`} className="flex items-center gap-2 text-xs">
                      <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                      <a href={url} target="_blank" rel="noopener" className="font-mono text-blue-400 hover:underline truncate">{url}</a>
                    </div>
                  ))}
                  {!(d.shellUrls as string[] || []).length && !(d.verifiedUrls as string[] || []).length && !(d.deployedUrls as string[] || []).length && (
                    <p className="text-xs text-muted-foreground">No URLs recorded</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* AI Brain Data */}
          {d.aiDecisions && (d.aiDecisions as any[]).length > 0 && (
            <Card className="border-border/30 bg-card/50 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-400" />
                  AI Decisions ({(d.aiDecisions as any[]).length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-1">
                    {(d.aiDecisions as any[]).slice(-20).map((dec: any, i: number) => (
                      <div key={i} className="text-xs p-1.5 rounded bg-background/30 flex items-start gap-2">
                        <Sparkles className="w-3 h-3 text-violet-400 shrink-0 mt-0.5" />
                        <span className="text-foreground/80">{typeof dec === "string" ? dec : JSON.stringify(dec)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Error Message */}
          {d.errorMessage && (
            <Card className="border-red-500/20 bg-red-500/5 lg:col-span-2">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400 font-mono break-words">{d.errorMessage}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Delete Button */}
        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleteDeployMut.mutate({ id: d.id })}
            disabled={deleteDeployMut.isPending}
            className="gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Record
          </Button>
        </div>
      </div>
    );
  }

  // ─── Batch Detail View ───
  if (selectedBatchId && batchDetailQuery.data) {
    const b = batchDetailQuery.data.batch;
    const deploys = batchDetailQuery.data.deploys;
    const bsc = STATUS_CONFIG[b.status] || STATUS_CONFIG.failed;

    return (
      <div className="space-y-4 p-1">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedBatchId(null)} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
          <h2 className="text-lg font-bold">Batch #{b.id}: {b.name}</h2>
          <Badge variant="outline" className={`${bsc.color}`}>
            <bsc.icon className="w-3 h-3 mr-1" />
            {bsc.label}
          </Badge>
        </div>

        {/* Batch Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: b.totalTargets, color: "text-foreground" },
            { label: "Completed", value: b.completedTargets, color: "text-blue-400" },
            { label: "Success", value: b.successTargets, color: "text-green-400" },
            { label: "Failed", value: b.failedTargets, color: "text-red-400" },
            { label: "Duration", value: formatDuration(b.duration), color: "text-muted-foreground" },
          ].map((item) => (
            <Card key={item.label} className="border-border/30 bg-card/50">
              <CardContent className="p-3 text-center">
                <div className="text-[10px] text-muted-foreground">{item.label}</div>
                <div className={`text-lg font-bold font-mono ${item.color}`}>{item.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Deploys in this batch */}
        <Card className="border-border/30 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Targets ({deploys.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {deploys.map((d) => {
                const dsc = STATUS_CONFIG[d.status] || STATUS_CONFIG.failed;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => { setSelectedBatchId(null); setSelectedDeployId(d.id); }}
                  >
                    <div className="flex items-center gap-2">
                      <dsc.icon className={`w-3.5 h-3.5 ${dsc.color.split(" ")[0]}`} />
                      <span className="font-mono text-sm">{d.targetDomain}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{d.filesVerified} verified</span>
                      <span>{formatDuration(d.duration)}</span>
                      <Badge variant="outline" className={`text-[10px] ${dsc.color}`}>{dsc.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleteBatchMut.mutate({ id: b.id })}
            disabled={deleteBatchMut.isPending}
            className="gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Batch
          </Button>
        </div>
      </div>
    );
  }

  // ─── Main List View ───
  const stats = statsQuery.data || { total: 0, success: 0, partial: 0, failed: 0, running: 0 };
  const deploys = deploysQuery.data?.items || [];
  const totalDeploys = deploysQuery.data?.total || 0;
  const totalPages = Math.ceil(totalDeploys / limit);
  const batches = batchesQuery.data?.items || [];

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center">
          <Clock className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Autonomous <span className="text-violet-400">History</span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono">
            Deploy history, batch tracking, AI decision logs
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Deploys", value: stats.total, color: "text-foreground", icon: Activity },
          { label: "Success", value: stats.success, color: "text-green-400", icon: CheckCircle2 },
          { label: "Partial", value: stats.partial, color: "text-amber-400", icon: AlertTriangle },
          { label: "Failed", value: stats.failed, color: "text-red-400", icon: XCircle },
          { label: "Running", value: stats.running, color: "text-blue-400", icon: Loader2 },
        ].map((item) => (
          <Card key={item.label} className="border-border/30 bg-card/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                <span className="text-[10px] text-muted-foreground">{item.label}</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${item.color}`}>{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="deploys" className="gap-1.5">
            <Rocket className="w-3.5 h-3.5" />
            Deploys
          </TabsTrigger>
          <TabsTrigger value="batches" className="gap-1.5">
            <Package className="w-3.5 h-3.5" />
            Batches
          </TabsTrigger>
        </TabsList>

        {/* Deploys Tab */}
        <TabsContent value="deploys" className="space-y-3">
          {/* Filter */}
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="stopped">Stopped</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{totalDeploys} records</span>
          </div>

          {/* Deploy List */}
          <Card className="border-border/30 bg-card/50">
            <CardContent className="p-0">
              {deploysQuery.isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : deploys.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Rocket className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">No autonomous deploys yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {deploys.map((d) => {
                    const sc = STATUS_CONFIG[d.status] || STATUS_CONFIG.failed;
                    const ModeIcon = MODE_ICONS[d.mode] || Target;
                    return (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-3 hover:bg-muted/10 cursor-pointer transition-colors"
                        onClick={() => setSelectedDeployId(d.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${sc.color.split(" ").slice(1).join(" ")}`}>
                            <sc.icon className={`w-4 h-4 ${sc.color.split(" ")[0]}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold">{d.targetDomain}</span>
                              <Badge variant="outline" className="text-[9px]">
                                <ModeIcon className="w-2.5 h-2.5 mr-0.5" />
                                {d.mode}
                              </Badge>
                              {d.batchId && (
                                <Badge variant="secondary" className="text-[9px]">
                                  <Package className="w-2.5 h-2.5 mr-0.5" />
                                  Batch
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span>{formatDate(d.startedAt)}</span>
                              <span>•</span>
                              <span>{formatDuration(d.duration)}</span>
                              {d.filesVerified > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-green-400">{d.filesVerified} verified</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${sc.color}`}>
                            {sc.label}
                          </Badge>
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Batches Tab */}
        <TabsContent value="batches" className="space-y-3">
          <Card className="border-border/30 bg-card/50">
            <CardContent className="p-0">
              {batchesQuery.isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : batches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Package className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">No batch deploys yet</p>
                  <p className="text-xs mt-1">Use Batch Mode in AI Attack Engine to deploy multiple targets</p>
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {batches.map((b) => {
                    const bsc = STATUS_CONFIG[b.status] || STATUS_CONFIG.failed;
                    return (
                      <div
                        key={b.id}
                        className="flex items-center justify-between p-3 hover:bg-muted/10 cursor-pointer transition-colors"
                        onClick={() => setSelectedBatchId(b.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bsc.color.split(" ").slice(1).join(" ")}`}>
                            <Package className={`w-4 h-4 ${bsc.color.split(" ")[0]}`} />
                          </div>
                          <div>
                            <span className="text-sm font-semibold">{b.name}</span>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span>{b.totalTargets} targets</span>
                              <span>•</span>
                              <span className="text-green-400">{b.successTargets} success</span>
                              <span>•</span>
                              <span className="text-red-400">{b.failedTargets} failed</span>
                              <span>•</span>
                              <span>{formatDuration(b.duration)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${bsc.color}`}>{bsc.label}</Badge>
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
