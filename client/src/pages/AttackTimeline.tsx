/**
 * Attack Timeline — Visual timeline of all attack operations
 * Shows methods tried, time spent, failure reasons per attack
 * Dark luxury design matching Obsidian Intelligence theme
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Target, Skull, CheckCircle, XCircle, Clock, Zap,
  RefreshCw, Search, ChevronDown, ChevronUp, Activity,
  Shield, BarChart3, Globe, AlertTriangle, Timer,
  ArrowRight, Crosshair, Bug, Wifi, Lock, Upload,
  FileCode, Server, Eye, TrendingUp, ChevronRight,
} from "lucide-react";

// ═══ Helpers ═══
function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" });
}

function formatDateShort(d: string | Date | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function statusColor(status: string): string {
  switch (status) {
    case "success": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "partial": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "failed": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "running": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "success": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "partial": return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case "failed": return <XCircle className="w-4 h-4 text-red-400" />;
    case "running": return <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />;
    default: return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

function methodIcon(method: string) {
  const m = method.toLowerCase();
  if (m.includes("webdav") || m.includes("put") || m.includes("upload")) return <Upload className="w-3.5 h-3.5" />;
  if (m.includes("brute") || m.includes("credential") || m.includes("breach")) return <Lock className="w-3.5 h-3.5" />;
  if (m.includes("exploit") || m.includes("vuln") || m.includes("cve")) return <Bug className="w-3.5 h-3.5" />;
  if (m.includes("cf") || m.includes("cloudflare") || m.includes("bypass")) return <Shield className="w-3.5 h-3.5" />;
  if (m.includes("shell") || m.includes("rce")) return <FileCode className="w-3.5 h-3.5" />;
  if (m.includes("redirect") || m.includes("hijack")) return <ArrowRight className="w-3.5 h-3.5" />;
  if (m.includes("scan") || m.includes("recon")) return <Eye className="w-3.5 h-3.5" />;
  if (m.includes("ftp") || m.includes("ssh") || m.includes("cpanel")) return <Server className="w-3.5 h-3.5" />;
  return <Crosshair className="w-3.5 h-3.5" />;
}

function riskBadge(risk: string | null | undefined) {
  if (!risk) return null;
  const colors: Record<string, string> = {
    low: "bg-emerald-500/20 text-emerald-400",
    medium: "bg-amber-500/20 text-amber-400",
    high: "bg-orange-500/20 text-orange-400",
    critical: "bg-red-500/20 text-red-400",
  };
  return <Badge variant="outline" className={`text-[10px] ${colors[risk] || "bg-muted"}`}>{risk.toUpperCase()}</Badge>;
}

// ═══ Method Stats Overview ═══
function MethodStatsPanel({ days }: { days: number }) {
  const { data, isLoading } = trpc.attackLogs.methodStats.useQuery({ days });

  if (isLoading) return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
      ))}
    </div>
  );
  if (!data || data.length === 0) return (
    <div className="text-center text-muted-foreground py-8">ยังไม่มีข้อมูล method</div>
  );

  return (
    <div className="space-y-2">
      {data.map((m, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/30 hover:border-border/60 transition-colors">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {methodIcon(m.method)}
            <span className="text-sm font-medium truncate">{m.method}</span>
          </div>
          <div className="flex items-center gap-4 text-xs shrink-0">
            <div className="text-center">
              <div className="text-muted-foreground">Attempts</div>
              <div className="font-mono font-bold">{m.total}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Success</div>
              <div className={`font-mono font-bold ${m.successRate > 50 ? "text-emerald-400" : m.successRate > 20 ? "text-amber-400" : "text-red-400"}`}>
                {m.successRate}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Avg Time</div>
              <div className="font-mono">{formatDuration(m.avgDurationMs)}</div>
            </div>
            {/* Success rate bar */}
            <div className="w-20 h-2 bg-muted/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${m.successRate > 50 ? "bg-emerald-500" : m.successRate > 20 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${m.successRate}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══ Attack Card (Timeline Item) ═══
function AttackCard({ attack, onViewDetail }: { attack: any; onViewDetail: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const methods = attack.methods || [];
  const successMethods = methods.filter((m: any) => m.success);
  const failedMethods = methods.filter((m: any) => !m.success);

  return (
    <Card className="bg-card/80 border-border/40 hover:border-border/70 transition-all duration-200 group">
      <CardContent className="p-0">
        {/* Header row */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {/* Timeline dot */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`w-3 h-3 rounded-full ${
              attack.status === "success" ? "bg-emerald-500 shadow-emerald-500/50 shadow-lg" :
              attack.status === "partial" ? "bg-amber-500 shadow-amber-500/50 shadow-lg" :
              attack.status === "failed" ? "bg-red-500 shadow-red-500/50 shadow-lg" :
              "bg-cyan-500 animate-pulse shadow-cyan-500/50 shadow-lg"
            }`} />
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-foreground truncate max-w-[200px] sm:max-w-none">
                {attack.domain}
              </span>
              <Badge variant="outline" className={`text-[10px] ${statusColor(attack.status)}`}>
                {attack.status.toUpperCase()}
              </Badge>
              {attack.cms && (
                <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-400 border-violet-500/30">
                  {attack.cms}
                </Badge>
              )}
              {attack.wafDetected && (
                <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/30">
                  <Shield className="w-3 h-3 mr-1" />{attack.wafDetected}
                </Badge>
              )}
              {riskBadge(attack.preScreenRisk)}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDateShort(attack.startedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {formatDuration(attack.duration)}
              </span>
              {attack.altMethodUsed && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Zap className="w-3 h-3" />
                  {attack.altMethodUsed}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3" />
                {methods.length} methods
              </span>
            </div>
          </div>

          {/* Stats summary */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground">Files</div>
              <div className="font-mono text-sm font-bold">{attack.filesDeployed || 0}/{attack.filesAttempted || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground">Score</div>
              <div className={`font-mono text-sm font-bold ${
                (attack.preScreenScore || 0) > 60 ? "text-emerald-400" :
                (attack.preScreenScore || 0) > 30 ? "text-amber-400" : "text-red-400"
              }`}>{attack.preScreenScore || "-"}</div>
            </div>
            {attack.redirectActive && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <ArrowRight className="w-3 h-3 mr-1" />Redirect
              </Badge>
            )}
          </div>

          {/* Expand toggle */}
          <div className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* Expanded: Method breakdown */}
        {expanded && (
          <div className="border-t border-border/30 bg-background/30">
            {/* Method timeline */}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Method Timeline ({methods.length} methods)
                </h4>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-3 h-3" />{successMethods.length} success
                  </span>
                  <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-3 h-3" />{failedMethods.length} failed
                  </span>
                </div>
              </div>

              {methods.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-4">
                  ยังไม่มี method outcome logs สำหรับ domain นี้
                </div>
              ) : (
                <div className="space-y-1.5">
                  {methods.map((m: any, i: number) => (
                    <div
                      key={m.id || i}
                      className={`flex items-center gap-3 p-2.5 rounded-md border transition-colors ${
                        m.success
                          ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
                          : "bg-red-500/5 border-red-500/10 hover:border-red-500/30"
                      }`}
                    >
                      {/* Step number */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        m.success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {i + 1}
                      </div>

                      {/* Method icon + name */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={m.success ? "text-emerald-400" : "text-red-400"}>
                          {methodIcon(m.method)}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{m.method}</div>
                          {m.exploitType && (
                            <div className="text-[10px] text-muted-foreground truncate">{m.exploitType}</div>
                          )}
                        </div>
                      </div>

                      {/* Result */}
                      <div className="flex items-center gap-3 shrink-0 text-xs">
                        {m.httpStatus && (
                          <Badge variant="outline" className={`text-[10px] ${
                            m.httpStatus >= 200 && m.httpStatus < 300 ? "text-emerald-400" :
                            m.httpStatus >= 400 ? "text-red-400" : "text-amber-400"
                          }`}>
                            HTTP {m.httpStatus}
                          </Badge>
                        )}
                        {m.filesPlaced > 0 && (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Upload className="w-3 h-3" />{m.filesPlaced}
                          </span>
                        )}
                        {m.redirectVerified && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                            Redirect OK
                          </Badge>
                        )}
                        <span className="font-mono text-muted-foreground w-14 text-right">
                          {formatDuration(m.durationMs)}
                        </span>
                        {m.success ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error breakdown */}
              {attack.errorBreakdown && Object.keys(attack.errorBreakdown).length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                  <h5 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Error Breakdown
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(attack.errorBreakdown).map(([key, val]) => (
                      <Badge key={key} variant="outline" className="text-[10px] text-red-400/80">
                        {key}: {String(val)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Analysis summary */}
              {attack.aiAnalysis && (
                <div className="mt-3 p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
                  <h5 className="text-xs font-semibold text-violet-400 mb-1 flex items-center gap-1">
                    <Skull className="w-3 h-3" />AI Analysis
                  </h5>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {typeof attack.aiAnalysis === "string"
                      ? attack.aiAnalysis
                      : JSON.stringify(attack.aiAnalysis).slice(0, 300)}
                  </p>
                </div>
              )}

              {/* View full logs button */}
              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={(e) => { e.stopPropagation(); onViewDetail(attack.id); }}
                >
                  <Eye className="w-3 h-3 mr-1" />View Full Logs ({attack.logCount} events)
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══ Attack Detail Dialog ═══
function AttackDetailDialog({ deployId, open, onClose }: { deployId: number | null; open: boolean; onClose: () => void }) {
  const { data, isLoading } = trpc.attackLogs.attackDetail.useQuery(
    { deployId: deployId! },
    { enabled: !!deployId && open }
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Skull className="w-5 h-5 text-red-400" />
            Attack Detail — Deploy #{deployId}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-8">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <div className="text-center text-muted-foreground py-8">ไม่พบข้อมูล</div>
        ) : (
          <div className="space-y-6">
            {/* Deploy summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-background/50 border border-border/30">
                <div className="text-[10px] text-muted-foreground">Domain</div>
                <div className="font-mono text-sm font-bold truncate">{data.deploy.targetDomain}</div>
              </div>
              <div className="p-3 rounded-lg bg-background/50 border border-border/30">
                <div className="text-[10px] text-muted-foreground">Status</div>
                <div className="flex items-center gap-1">
                  {statusIcon(data.deploy.status)}
                  <span className="text-sm font-bold">{data.deploy.status}</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-background/50 border border-border/30">
                <div className="text-[10px] text-muted-foreground">Duration</div>
                <div className="font-mono text-sm font-bold">{formatDuration(data.deploy.duration)}</div>
              </div>
              <div className="p-3 rounded-lg bg-background/50 border border-border/30">
                <div className="text-[10px] text-muted-foreground">CMS / WAF</div>
                <div className="text-sm font-bold">{data.deploy.cms || "-"} / {data.deploy.wafDetected || "-"}</div>
              </div>
            </div>

            {/* Phase timeline */}
            {data.phaseTimeline && data.phaseTimeline.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Phase Timeline
                </h4>
                <div className="space-y-1">
                  {data.phaseTimeline.map((phase: any, i: number) => (
                    <div key={i} className={`flex items-center gap-3 p-2 rounded border ${
                      phase.status === "success" ? "bg-emerald-500/5 border-emerald-500/15" :
                      phase.status === "error" ? "bg-red-500/5 border-red-500/15" :
                      "bg-muted/10 border-border/20"
                    }`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        phase.status === "success" ? "bg-emerald-500" :
                        phase.status === "error" ? "bg-red-500" : "bg-muted-foreground"
                      }`} />
                      <span className="text-sm font-medium flex-1">{phase.phase}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {phase.logs.length} events
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {formatDate(phase.startTime)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Method outcomes */}
            {data.methods && data.methods.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Method Outcomes ({data.methods.length})
                </h4>
                <div className="space-y-1.5">
                  {data.methods.map((m: any, i: number) => (
                    <div key={m.id || i} className={`p-3 rounded-lg border ${
                      m.success ? "bg-emerald-500/5 border-emerald-500/15" : "bg-red-500/5 border-red-500/10"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={m.success ? "text-emerald-400" : "text-red-400"}>
                          {m.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </span>
                        <span className="font-medium text-sm">{m.method}</span>
                        {m.exploitType && <Badge variant="outline" className="text-[10px]">{m.exploitType}</Badge>}
                        <span className="ml-auto font-mono text-xs text-muted-foreground">{formatDuration(m.durationMs)}</span>
                      </div>
                      {m.errorMessage && (
                        <div className="mt-1 text-xs text-red-400/70 pl-6 line-clamp-2">{m.errorMessage}</div>
                      )}
                      {m.aiReasoning && (
                        <div className="mt-1 text-xs text-violet-400/70 pl-6 line-clamp-2">AI: {m.aiReasoning}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw log events */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Raw Log Events ({data.logs.length})
              </h4>
              <div className="max-h-[300px] overflow-y-auto space-y-0.5 font-mono text-[11px] bg-background/50 rounded-lg border border-border/30 p-2">
                {data.logs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-4">No log events</div>
                ) : (
                  data.logs.map((log: any, i: number) => (
                    <div key={i} className={`flex gap-2 py-0.5 ${
                      log.severity === "error" || log.severity === "critical" ? "text-red-400" :
                      log.severity === "success" ? "text-emerald-400" :
                      log.severity === "warning" ? "text-amber-400" : "text-muted-foreground"
                    }`}>
                      <span className="shrink-0 text-muted-foreground/50">
                        {formatDate(log.timestamp)}
                      </span>
                      <span className="shrink-0 w-16 text-right uppercase">
                        [{log.severity}]
                      </span>
                      <span className="shrink-0 text-cyan-400/60">
                        [{log.phase}/{log.step}]
                      </span>
                      {log.method && <span className="shrink-0 text-violet-400/60">[{log.method}]</span>}
                      <span className="break-all">{log.detail}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══ Main Page ═══
export default function AttackTimeline() {
  const [days, setDays] = useState(30);
  const [domainFilter, setDomainFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [detailDeployId, setDetailDeployId] = useState<number | null>(null);
  const limit = 20;

  const { data, isLoading, refetch } = trpc.attackLogs.timeline.useQuery({
    days,
    domain: domainFilter || undefined,
    status: statusFilter === "all" ? undefined : statusFilter as any,
    limit,
    offset: page * limit,
  });

  const { data: dashStats } = trpc.attackLogs.dashboardStats.useQuery({ days });

  const attacks = data?.attacks || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-400" />
            Attack Timeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visual timeline of all attack operations — methods, timing, and failure analysis
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="w-4 h-4 mr-1" />Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {dashStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card/80 border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Skull className="w-5 h-5 text-red-400" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Total Attacks</div>
                  <div className="text-xl font-bold font-mono">{dashStats.deployStats.total}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/80 border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Success Rate</div>
                  <div className="text-xl font-bold font-mono text-emerald-400">{dashStats.successRate}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/80 border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Log Events</div>
                  <div className="text-xl font-bold font-mono">{dashStats.totalLogEvents.toLocaleString()}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/80 border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-violet-400" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Domains</div>
                  <div className="text-xl font-bold font-mono">{dashStats.domainStats?.length || 0}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs: Timeline + Method Stats */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList className="bg-muted/30">
          <TabsTrigger value="timeline">
            <Activity className="w-4 h-4 mr-1" />Timeline
          </TabsTrigger>
          <TabsTrigger value="methods">
            <BarChart3 className="w-4 h-4 mr-1" />Method Stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search domain..."
                value={domainFilter}
                onChange={(e) => { setDomainFilter(e.target.value); setPage(0); }}
                className="pl-9 bg-background/50"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] bg-background/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(days)} onValueChange={(v) => { setDays(Number(v)); setPage(0); }}>
              <SelectTrigger className="w-[120px] bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Days</SelectItem>
                <SelectItem value="14">14 Days</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
                <SelectItem value="90">90 Days</SelectItem>
                <SelectItem value="365">1 Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results count */}
          <div className="text-xs text-muted-foreground">
            Showing {attacks.length} of {total} attacks
            {domainFilter && ` matching "${domainFilter}"`}
            {statusFilter !== "all" && ` (${statusFilter})`}
          </div>

          {/* Timeline list */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="animate-pulse bg-card/50">
                  <CardContent className="p-4"><div className="h-16 bg-muted/30 rounded" /></CardContent>
                </Card>
              ))}
            </div>
          ) : attacks.length === 0 ? (
            <Card className="bg-card/50 border-border/30">
              <CardContent className="p-12 text-center">
                <Skull className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">ยังไม่มี attack ในช่วงเวลาที่เลือก</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Timeline connector line */}
              <div className="relative">
                <div className="absolute left-[22px] top-0 bottom-0 w-px bg-border/30 z-0" />
                <div className="relative z-10 space-y-3">
                  {attacks.map((attack: any) => (
                    <AttackCard
                      key={attack.id}
                      attack={attack}
                      onViewDetail={(id) => setDetailDeployId(id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="methods">
          <Card className="bg-card/80 border-border/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                Method Performance ({days} days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MethodStatsPanel days={days} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <AttackDetailDialog
        deployId={detailDeployId}
        open={detailDeployId !== null}
        onClose={() => setDetailDeployId(null)}
      />
    </div>
  );
}
