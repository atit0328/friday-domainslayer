/**
 * Attack Dashboard — Unified attack analytics, deploy history, success rates
 * Real-time view of all attack operations with filtering, retry controls, live log viewer, and timeline
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Target, Skull, CheckCircle, XCircle, Clock, Zap,
  RefreshCw, Search, ChevronLeft, ChevronRight, Activity,
  Shield, BarChart3, Globe, Rocket, AlertTriangle,
  Terminal, Eye, Download, Play, Pause, TrendingUp,
  FileText, Wifi, WifiOff, Filter,
} from "lucide-react";
import { toast } from "sonner";

// ═══ Utilities ═══

function formatDuration(ms: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatDate(d: string | Date | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function formatTimeAgo(d: string | Date | null): string {
  if (!d) return "-";
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const severityColors: Record<string, string> = {
  info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  error: "text-red-400 bg-red-500/10 border-red-500/20",
  critical: "text-red-500 bg-red-600/20 border-red-600/30",
};

const severityIcons: Record<string, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "❌",
  critical: "🔥",
};

// ═══ Live Status Indicator ═══
function LiveIndicator({ isLive }: { isLive: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
      <span className={`text-xs ${isLive ? "text-emerald-400" : "text-zinc-500"}`}>
        {isLive ? "LIVE" : "OFFLINE"}
      </span>
    </div>
  );
}

// ═══ Overview Cards (with auto-refresh) ═══
function OverviewCards({ period }: { period: string }) {
  const { data, isLoading, refetch } = trpc.attackDashboard.overview.useQuery(
    { period: period as any },
    { refetchInterval: 15000 } // Auto-refresh every 15s
  );

  if (isLoading) return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <Card key={i} className="animate-pulse bg-card/50">
          <CardContent className="p-4"><div className="h-12 bg-muted rounded" /></CardContent>
        </Card>
      ))}
    </div>
  );
  if (!data) return null;

  const cards = [
    { label: "Total Attacks", value: data.attacks.total, icon: Skull, color: "text-red-400", bgGlow: "shadow-red-500/5" },
    { label: "Success Rate", value: `${data.attacks.successRate}%`, icon: CheckCircle, color: "text-emerald-400", bgGlow: "shadow-emerald-500/5" },
    { label: "Unique Domains", value: data.attacks.uniqueDomains, icon: Globe, color: "text-cyan-400", bgGlow: "shadow-cyan-500/5" },
    { label: "Avg Duration", value: formatDuration(data.attacks.avgDuration), icon: Clock, color: "text-amber-400", bgGlow: "shadow-amber-500/5" },
    { label: "Total Deploys", value: data.deploys.total, icon: Rocket, color: "text-violet-400", bgGlow: "shadow-violet-500/5" },
    { label: "Files Deployed", value: data.deploys.totalFiles, icon: Zap, color: "text-emerald-400", bgGlow: "shadow-emerald-500/5" },
    { label: "Active Redirects", value: data.deploys.totalRedirects, icon: Activity, color: "text-cyan-400", bgGlow: "shadow-cyan-500/5" },
    { label: "Running Now", value: data.deploys.running || 0, icon: Play, color: data.deploys.running ? "text-green-400" : "text-zinc-500", bgGlow: data.deploys.running ? "shadow-green-500/10" : "" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c, i) => (
        <Card key={i} className={`bg-card/80 border-border/50 hover:border-emerald-500/30 transition-all duration-300 ${c.bgGlow} hover:shadow-lg`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</p>
                <p className={`text-2xl font-bold mt-1 ${c.color} tabular-nums`}>{c.value}</p>
              </div>
              <c.icon className={`w-8 h-8 ${c.color} opacity-40`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══ Attack Timeline Chart (CSS-based) ═══
function AttackTimeline({ period }: { period: string }) {
  const { data, isLoading } = trpc.attackDashboard.timeline.useQuery(
    { days: period === "today" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 90 },
    { refetchInterval: 30000 }
  );

  if (isLoading) return <div className="animate-pulse h-48 bg-muted rounded" />;
  if (!data || data.length === 0) return (
    <div className="text-center py-8 text-muted-foreground text-sm">ยังไม่มีข้อมูล timeline</div>
  );

  const maxVal = Math.max(...data.map(d => d.total), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-40">
        {data.map((day, i) => {
          const totalHeight = (day.total / maxVal) * 100;
          const successHeight = (day.success / maxVal) * 100;
          const failedHeight = ((day.failed || 0) / maxVal) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-popover border border-border rounded-lg p-2 text-xs shadow-xl whitespace-nowrap">
                  <p className="font-medium">{day.date}</p>
                  <p className="text-emerald-400">Success: {day.success}</p>
                  <p className="text-red-400">Failed: {day.failed || 0}</p>
                  <p className="text-muted-foreground">Total: {day.total}</p>
                </div>
              </div>
              {/* Bars */}
              <div className="w-full flex flex-col gap-0.5">
                {(day.failed || 0) > 0 && (
                  <div
                    className="w-full bg-red-500/60 rounded-t transition-all duration-500"
                    style={{ height: `${Math.max(failedHeight, 2)}%` }}
                  />
                )}
                {day.success > 0 && (
                  <div
                    className="w-full bg-emerald-500/80 rounded-t transition-all duration-500"
                    style={{ height: `${Math.max(successHeight, 2)}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
      <div className="flex gap-4 justify-center text-xs">
        <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500/80 rounded" /> Success</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500/60 rounded" /> Failed</span>
      </div>
    </div>
  );
}

// ═══ Method Stats Table ═══
function MethodStats({ period }: { period: string }) {
  const { data, isLoading } = trpc.attackDashboard.methodStats.useQuery(
    { period: period as any },
    { refetchInterval: 30000 }
  );

  if (isLoading) return <div className="animate-pulse h-40 bg-muted rounded" />;
  if (!data || data.length === 0) return <p className="text-muted-foreground text-sm">ยังไม่มีข้อมูล</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Method</th>
            <th className="text-center py-2 px-3 text-muted-foreground font-medium">Total</th>
            <th className="text-center py-2 px-3 text-muted-foreground font-medium">Success</th>
            <th className="text-center py-2 px-3 text-muted-foreground font-medium">Rate</th>
            <th className="text-center py-2 px-3 text-muted-foreground font-medium">Avg Time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m, i) => (
            <tr key={i} className="border-b border-border/20 hover:bg-accent/20">
              <td className="py-2 px-3 font-mono text-xs">{m.method}</td>
              <td className="py-2 px-3 text-center tabular-nums">{m.total}</td>
              <td className="py-2 px-3 text-center text-emerald-400 tabular-nums">{m.success}</td>
              <td className="py-2 px-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${m.successRate >= 50 ? "bg-emerald-500" : m.successRate >= 20 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${m.successRate}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums">{m.successRate}%</span>
                </div>
              </td>
              <td className="py-2 px-3 text-center text-muted-foreground text-xs tabular-nums">{formatDuration(m.avgDuration)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══ Top Domains ═══
function TopDomains({ period }: { period: string }) {
  const { data, isLoading } = trpc.attackDashboard.topDomains.useQuery({ limit: 10, period: period as any });

  if (isLoading) return <div className="animate-pulse h-40 bg-muted rounded" />;
  if (!data || data.length === 0) return <p className="text-muted-foreground text-sm">ยังไม่มีข้อมูล</p>;

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/20 transition-colors">
          <span className="text-muted-foreground text-xs w-5 text-right tabular-nums">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm truncate">{d.domain}</p>
            <p className="text-xs text-muted-foreground">{d.methods.slice(0, 3).join(", ")}</p>
          </div>
          <div className="text-right">
            <p className="text-sm tabular-nums">{d.success}/{d.total}</p>
            <Badge variant={d.successRate >= 50 ? "default" : "destructive"} className="text-xs">
              {d.successRate}%
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══ WAF Stats ═══
function WafStats() {
  const { data, isLoading } = trpc.attackDashboard.wafStats.useQuery(undefined, { refetchInterval: 30000 });

  if (isLoading) return <div className="animate-pulse h-40 bg-muted rounded" />;
  if (!data || data.length === 0) return <p className="text-muted-foreground text-sm">ยังไม่มีข้อมูล WAF</p>;

  return (
    <div className="space-y-3">
      {data.map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-amber-400" />
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium">{w.waf}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{w.success}/{w.total} bypassed</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${w.bypassRate >= 50 ? "bg-emerald-500" : w.bypassRate >= 20 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${w.bypassRate}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-bold w-10 text-right tabular-nums">{w.bypassRate}%</span>
        </div>
      ))}
    </div>
  );
}

// ═══ Live Log Viewer (Real-time attack logs) ═══
function LiveLogViewer() {
  const [selectedDeployId, setSelectedDeployId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [sinceIndex, setSinceIndex] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Get recent logs for overview
  const { data: recentLogs, isLoading: recentLoading } = trpc.attackLogs.recent.useQuery(
    { limit: 100 },
    { refetchInterval: 5000 }
  );

  // Get buffered logs for specific deploy (real-time polling)
  const { data: bufferedLogs } = trpc.attackLogs.buffered.useQuery(
    { deployId: selectedDeployId || 0, sinceIndex },
    {
      enabled: !!selectedDeployId,
      refetchInterval: 2000, // Poll every 2s for live updates
    }
  );

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [recentLogs, bufferedLogs, autoScroll]);

  const displayLogs = useMemo(() => {
    const logs = selectedDeployId && bufferedLogs ? bufferedLogs : (recentLogs || []);
    if (severityFilter === "all") return logs;
    return logs.filter((l: any) => l.severity === severityFilter);
  }, [recentLogs, bufferedLogs, selectedDeployId, severityFilter]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium">Live Attack Logs</span>
          <LiveIndicator isLive={true} />
        </div>
        <div className="flex-1" />
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <Filter className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={autoScroll ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAutoScroll(!autoScroll)}
        >
          {autoScroll ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
          {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
        </Button>
      </div>

      {/* Log Container */}
      <div
        ref={logContainerRef}
        className="bg-black/80 rounded-lg border border-border/50 font-mono text-xs overflow-y-auto max-h-[400px] min-h-[200px] p-3 space-y-0.5"
      >
        {recentLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading logs...
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Terminal className="w-4 h-4 mr-2" /> No logs yet — start an attack to see real-time output
          </div>
        ) : (
          displayLogs.map((log: any, i: number) => {
            const ts = log.timestamp ? new Date(log.timestamp).toISOString().slice(11, 19) : "--:--:--";
            const sevColor = severityColors[log.severity] || "text-zinc-400";
            return (
              <div
                key={log.id || i}
                className={`flex gap-2 py-0.5 px-1 rounded hover:bg-white/5 transition-colors ${log.severity === "critical" ? "bg-red-900/20" : ""}`}
              >
                <span className="text-zinc-500 shrink-0">{ts}</span>
                <span className={`shrink-0 w-16 text-right ${sevColor.split(" ")[0]}`}>
                  {severityIcons[log.severity] || ""} {log.severity?.toUpperCase()}
                </span>
                <span className="text-cyan-400/70 shrink-0">[{log.phase}/{log.step}]</span>
                {log.method && <span className="text-violet-400/70 shrink-0">[{log.method}]</span>}
                {log.httpStatus && <span className="text-amber-400/70 shrink-0">HTTP:{log.httpStatus}</span>}
                <span className="text-zinc-300 break-all">{log.detail}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Log Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{displayLogs.length} events shown</span>
        <span>Auto-refresh: 5s</span>
      </div>
    </div>
  );
}

// ═══ Attack History Table ═══
function AttackHistoryTable() {
  const [page, setPage] = useState(1);
  const [domain, setDomain] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState<"all" | "success" | "failed">("all");
  const [selectedAttack, setSelectedAttack] = useState<any>(null);

  const { data, isLoading, refetch } = trpc.attackDashboard.recentAttacks.useQuery({
    page,
    limit: 15,
    domain: domain || undefined,
    method: method || undefined,
    status,
  }, { refetchInterval: 15000 });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาโดเมน..."
            value={domain}
            onChange={e => { setDomain(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Input
          placeholder="Method..."
          value={method}
          onChange={e => { setMethod(e.target.value); setPage(1); }}
          className="w-40"
        />
        <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งหมด</SelectItem>
            <SelectItem value="success">สำเร็จ</SelectItem>
            <SelectItem value="failed">ล้มเหลว</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Domain</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Method</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">WAF</th>
              <th className="text-center py-2 px-3 text-muted-foreground font-medium">Duration</th>
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="py-3 px-3"><div className="h-6 bg-muted animate-pulse rounded" /></td></tr>
              ))
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">ไม่พบข้อมูล</td></tr>
            ) : (
              data?.items.map((item: any) => (
                <tr
                  key={item.id}
                  className="border-t border-border/20 hover:bg-accent/20 cursor-pointer transition-colors"
                  onClick={() => setSelectedAttack(item)}
                >
                  <td className="py-2 px-3 font-mono text-xs truncate max-w-[200px]">{item.targetDomain}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="text-xs font-mono">{item.method}</Badge>
                  </td>
                  <td className="py-2 px-3 text-center">
                    {item.success ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Success</Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{item.waf || "-"}</td>
                  <td className="py-2 px-3 text-center text-xs tabular-nums">{formatDuration(item.durationMs)}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{formatTimeAgo(item.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && (data.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {data.total} records, page {data.page}/{data.totalPages ?? 0}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= (data.totalPages ?? 0)} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedAttack} onOpenChange={() => setSelectedAttack(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Attack Detail
            </DialogTitle>
          </DialogHeader>
          {selectedAttack && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Domain</p>
                  <p className="font-mono text-sm">{selectedAttack.targetDomain}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="font-mono text-sm">{selectedAttack.method}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={selectedAttack.success ? "default" : "destructive"}>
                    {selectedAttack.success ? "Success" : "Failed"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="text-sm tabular-nums">{formatDuration(selectedAttack.durationMs)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Server</p>
                  <p className="text-sm">{selectedAttack.serverType || "-"} {selectedAttack.serverVersion || ""}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CMS</p>
                  <p className="text-sm">{selectedAttack.cms || "-"} {selectedAttack.cmsVersion || ""}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">WAF</p>
                  <p className="text-sm">{selectedAttack.waf || "None"} ({selectedAttack.wafStrength || "-"})</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status Code</p>
                  <p className="text-sm tabular-nums">{selectedAttack.statusCode || "-"}</p>
                </div>
              </div>
              {selectedAttack.redirectUrl && (
                <div>
                  <p className="text-xs text-muted-foreground">Redirect URL</p>
                  <p className="font-mono text-xs break-all">{selectedAttack.redirectUrl}</p>
                </div>
              )}
              {selectedAttack.uploadedUrl && (
                <div>
                  <p className="text-xs text-muted-foreground">Uploaded URL</p>
                  <a href={selectedAttack.uploadedUrl} target="_blank" rel="noopener" className="font-mono text-xs text-emerald-400 hover:underline break-all">
                    {selectedAttack.uploadedUrl}
                  </a>
                </div>
              )}
              {selectedAttack.errorMessage && (
                <div>
                  <p className="text-xs text-muted-foreground">Error</p>
                  <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-red-400">{selectedAttack.errorMessage}</pre>
                </div>
              )}
              {selectedAttack.aiReasoning && (
                <div>
                  <p className="text-xs text-muted-foreground">AI Reasoning</p>
                  <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-cyan-400">{selectedAttack.aiReasoning}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══ Retry Stats ═══
function RetryStats() {
  const { data, isLoading } = trpc.attackDashboard.retryStats.useQuery(undefined, { refetchInterval: 15000 });

  if (isLoading) return <div className="animate-pulse h-20 bg-muted rounded" />;
  if (!data) return null;

  return (
    <div className="grid grid-cols-3 gap-4 mb-4">
      <Card className="bg-card/60">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">รอ Retry</p>
          <p className="text-xl font-bold text-amber-400 tabular-nums">{data.retriable}</p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">ล้มเหลวทั้งหมด</p>
          <p className="text-xl font-bold text-red-400 tabular-nums">{data.totalFailed}</p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">หมดวิธีแล้ว</p>
          <p className="text-xl font-bold text-zinc-400 tabular-nums">{data.exhausted}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══ Failed Domains (Retry Queue) ═══
function FailedDomains() {
  const { data, isLoading, refetch } = trpc.attackDashboard.failedDomains.useQuery({ limit: 20 });
  const retryOne = trpc.attackDashboard.triggerRetry.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Retry ${result.domain} สำเร็จ!`, { description: `วิธี: ${result.method}` });
      } else {
        toast.error(`Retry ${result.domain} ล้มเหลว`, { description: result.error || result.method });
      }
      refetch();
    },
    onError: (err) => toast.error(`Retry ล้มเหลว: ${err.message}`),
  });
  const retryAll = trpc.attackDashboard.triggerRetryAll.useMutation({
    onSuccess: (result) => {
      toast.success(`Retry All เสร็จ!`, {
        description: `สำเร็จ ${result.succeeded}/${result.retried} | ล้มเหลว ${result.failed}`,
      });
      refetch();
    },
    onError: (err) => toast.error(`Retry All ล้มเหลว: ${err.message}`),
  });

  if (isLoading) return <div className="animate-pulse h-40 bg-muted rounded" />;
  if (!data || data.length === 0) return (
    <div className="text-center py-8">
      <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-50" />
      <p className="text-muted-foreground">ไม่มีโดเมนที่ล้มเหลว</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <RetryStats />
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-muted-foreground">{data.length} domains ที่ยังไม่สำเร็จ</p>
        <Button
          variant="outline"
          size="sm"
          disabled={retryAll.isPending}
          onClick={() => retryAll.mutate({ maxRetries: 20 })}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${retryAll.isPending ? "animate-spin" : ""}`} />
          {retryAll.isPending ? "Retrying..." : "Retry All"}
        </Button>
      </div>
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-red-500/30 transition-colors">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm truncate">{d.domain}</p>
            <p className="text-xs text-muted-foreground">
              {d.attempts} attempts | {d.methodsTried.slice(0, 3).join(", ")}
              {d.waf ? ` | WAF: ${d.waf}` : ""}
            </p>
            {d.lastError && (
              <p className="text-xs text-red-400/70 truncate mt-0.5">{d.lastError}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{formatDate(d.lastAttempt)}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 text-xs"
              disabled={retryOne.isPending}
              onClick={() => retryOne.mutate({ domain: d.domain })}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${retryOne.isPending ? "animate-spin" : ""}`} /> Retry
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══ Attack Timeline Detail (deploy-level view with method breakdown) ═══
function AttackTimelineDetail() {
  const [days, setDays] = useState(30);
  const [domainFilter, setDomainFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [selectedDeploy, setSelectedDeploy] = useState<any>(null);

  const { data, isLoading, refetch } = trpc.attackLogs.timeline.useQuery({
    days,
    domain: domainFilter || undefined,
    status: statusFilter as any,
    limit: 30,
  }, { refetchInterval: 15000 });

  // Get detail for selected deploy
  const { data: detail } = trpc.attackLogs.attackDetail.useQuery(
    { deployId: selectedDeploy?.id || 0 },
    { enabled: !!selectedDeploy }
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาโดเมน..."
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Timeline List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !data?.attacks?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>ยังไม่มีข้อมูล attack timeline</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{data.total} total attacks</p>
          {data.attacks.map((attack: any) => {
            const statusColor = attack.status === "success" ? "border-emerald-500/40 bg-emerald-500/5"
              : attack.status === "partial" ? "border-amber-500/40 bg-amber-500/5"
              : attack.status === "running" ? "border-blue-500/40 bg-blue-500/5 animate-pulse"
              : "border-red-500/40 bg-red-500/5";
            const statusBadge = attack.status === "success" ? "bg-emerald-500/20 text-emerald-400"
              : attack.status === "partial" ? "bg-amber-500/20 text-amber-400"
              : attack.status === "running" ? "bg-blue-500/20 text-blue-400"
              : "bg-red-500/20 text-red-400";

            return (
              <div
                key={attack.id}
                className={`p-4 rounded-lg border ${statusColor} cursor-pointer hover:shadow-lg transition-all`}
                onClick={() => setSelectedDeploy(attack)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`${statusBadge} text-xs`}>{attack.status}</Badge>
                      <span className="font-mono text-sm truncate">{attack.domain}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {attack.cms && <span>CMS: {attack.cms}</span>}
                      {attack.wafDetected && <span>WAF: {attack.wafDetected}</span>}
                      {attack.techniqueUsed && <span>Method: {attack.techniqueUsed}</span>}
                      {attack.filesDeployed > 0 && <span className="text-emerald-400">Files: {attack.filesDeployed}</span>}
                      {attack.redirectActive && <span className="text-cyan-400">Redirect Active</span>}
                      <span>Duration: {formatDuration(attack.duration)}</span>
                      <span>{formatTimeAgo(attack.createdAt)}</span>
                    </div>
                    {/* Method breakdown mini-bar */}
                    {attack.methods?.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {attack.methods.slice(0, 5).map((m: any, mi: number) => (
                          <Badge
                            key={mi}
                            variant="outline"
                            className={`text-[10px] ${m.success ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}
                          >
                            {m.method} {m.success ? "✓" : "✗"} {m.durationMs ? `${(m.durationMs / 1000).toFixed(1)}s` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-xs text-muted-foreground tabular-nums">{attack.logCount} logs</p>
                    <Eye className="w-4 h-4 text-muted-foreground mt-1" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deploy Detail Dialog */}
      <Dialog open={!!selectedDeploy} onOpenChange={() => setSelectedDeploy(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Deploy #{selectedDeploy?.id} — {selectedDeploy?.domain}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              {/* Deploy Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={detail.deploy.status === "success" ? "default" : "destructive"}>
                    {detail.deploy.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CMS</p>
                  <p>{detail.deploy.cms || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">WAF</p>
                  <p>{detail.deploy.wafDetected || "None"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="tabular-nums">{formatDuration(detail.deploy.duration || 0)}</p>
                </div>
              </div>

              {/* Phase Timeline */}
              {detail.phaseTimeline?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Phase Timeline</p>
                  <div className="flex gap-1 flex-wrap">
                    {detail.phaseTimeline.map((p: any, i: number) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`text-[10px] ${p.status === "success" ? "border-emerald-500/30 text-emerald-400" : p.status === "error" ? "border-red-500/30 text-red-400" : "border-border"}`}
                      >
                        {p.phase}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Method Outcomes */}
              {detail.methods?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Method Outcomes</p>
                  <div className="space-y-1">
                    {detail.methods.map((m: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                        <span className={m.success ? "text-emerald-400" : "text-red-400"}>
                          {m.success ? "✅" : "❌"}
                        </span>
                        <span className="font-mono">{m.method}</span>
                        {m.exploitType && <Badge variant="outline" className="text-[10px]">{m.exploitType}</Badge>}
                        {m.httpStatus && <span className="text-amber-400">HTTP:{m.httpStatus}</span>}
                        {m.durationMs && <span className="text-muted-foreground tabular-nums">{formatDuration(m.durationMs)}</span>}
                        {m.errorMessage && <span className="text-red-400/70 truncate flex-1">{m.errorMessage}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Log */}
              {detail.logs?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Full Attack Log ({detail.logs.length} events)</p>
                  <div className="bg-black/80 rounded-lg p-3 font-mono text-[11px] max-h-[300px] overflow-y-auto space-y-0.5">
                    {detail.logs.map((log: any, i: number) => {
                      const ts = log.timestamp ? new Date(log.timestamp).toISOString().slice(11, 19) : "--:--:--";
                      return (
                        <div key={i} className={`flex gap-2 py-0.5 ${log.severity === "critical" ? "bg-red-900/20" : ""}`}>
                          <span className="text-zinc-500 shrink-0">{ts}</span>
                          <span className={`shrink-0 ${severityColors[log.severity]?.split(" ")[0] || "text-zinc-400"}`}>
                            {severityIcons[log.severity] || ""}
                          </span>
                          <span className="text-cyan-400/70 shrink-0">[{log.phase}]</span>
                          <span className="text-zinc-300 break-all">{log.detail}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══ Main Dashboard ═══
export default function AttackDashboard() {
  const [period, setPeriod] = useState("week");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Skull className="w-7 h-7 text-red-400" />
            Attack Dashboard
            <LiveIndicator isLive={true} />
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Unified attack analytics — real-time monitoring, deploy history, success rates, WAF bypass stats
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <OverviewCards period={period} />

      {/* Timeline Chart + WAF Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Attack Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AttackTimeline period={period} />
          </CardContent>
        </Card>

        <Card className="bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              WAF Bypass Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WafStats />
          </CardContent>
        </Card>
      </div>

      {/* Method Stats */}
      <Card className="bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            Success Rate by Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MethodStats period={period} />
        </CardContent>
      </Card>

      {/* Tabs: Live Logs / History / Timeline / Top Domains / Failed */}
      <Tabs defaultValue="live" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="live" className="gap-1">
            <Terminal className="w-3.5 h-3.5" /> Live Logs
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1">
            <FileText className="w-3.5 h-3.5" /> Attack Timeline
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <Activity className="w-3.5 h-3.5" /> History
          </TabsTrigger>
          <TabsTrigger value="domains" className="gap-1">
            <Globe className="w-3.5 h-3.5" /> Top Domains
          </TabsTrigger>
          <TabsTrigger value="failed" className="gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Failed Queue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <Card className="bg-card/80">
            <CardContent className="pt-6">
              <LiveLogViewer />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="bg-card/80">
            <CardContent className="pt-6">
              <AttackTimelineDetail />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="bg-card/80">
            <CardContent className="pt-6">
              <AttackHistoryTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domains">
          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Top Targeted Domains</CardTitle>
            </CardHeader>
            <CardContent>
              <TopDomains period={period} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed">
          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Failed Domains — Retry Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FailedDomains />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
