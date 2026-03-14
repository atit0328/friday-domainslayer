/**
 * Attack Dashboard — Unified attack analytics, deploy history, success rates
 * Real-time view of all attack operations with filtering and retry controls
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
} from "lucide-react";
import { toast } from "sonner";

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

// ═══ Overview Cards ═══
function OverviewCards({ period }: { period: string }) {
  const { data, isLoading } = trpc.attackDashboard.overview.useQuery({ period: period as any });
  
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
    { label: "Total Attacks", value: data.attacks.total, icon: Skull, color: "text-red-400" },
    { label: "Success Rate", value: `${data.attacks.successRate}%`, icon: CheckCircle, color: "text-emerald-400" },
    { label: "Unique Domains", value: data.attacks.uniqueDomains, icon: Globe, color: "text-cyan-400" },
    { label: "Avg Duration", value: formatDuration(data.attacks.avgDuration), icon: Clock, color: "text-amber-400" },
    { label: "Total Deploys", value: data.deploys.total, icon: Rocket, color: "text-violet-400" },
    { label: "Files Deployed", value: data.deploys.totalFiles, icon: Zap, color: "text-emerald-400" },
    { label: "Active Redirects", value: data.deploys.totalRedirects, icon: Activity, color: "text-cyan-400" },
    { label: "Deploy Avg Time", value: formatDuration(data.deploys.avgDuration), icon: Clock, color: "text-amber-400" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c, i) => (
        <Card key={i} className="bg-card/80 border-border/50 hover:border-emerald-500/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</p>
                <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
              </div>
              <c.icon className={`w-8 h-8 ${c.color} opacity-40`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══ Method Stats Table ═══
function MethodStats({ period }: { period: string }) {
  const { data, isLoading } = trpc.attackDashboard.methodStats.useQuery({ period: period as any });
  
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
              <td className="py-2 px-3 text-center">{m.total}</td>
              <td className="py-2 px-3 text-center text-emerald-400">{m.success}</td>
              <td className="py-2 px-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${m.successRate >= 50 ? "bg-emerald-500" : m.successRate >= 20 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${m.successRate}%` }}
                    />
                  </div>
                  <span className="text-xs">{m.successRate}%</span>
                </div>
              </td>
              <td className="py-2 px-3 text-center text-muted-foreground text-xs">{formatDuration(m.avgDuration)}</td>
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
          <span className="text-muted-foreground text-xs w-5 text-right">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm truncate">{d.domain}</p>
            <p className="text-xs text-muted-foreground">{d.methods.slice(0, 3).join(", ")}</p>
          </div>
          <div className="text-right">
            <p className="text-sm">{d.success}/{d.total}</p>
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
  const { data, isLoading } = trpc.attackDashboard.wafStats.useQuery();
  
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
              <span className="text-xs text-muted-foreground">{w.success}/{w.total} bypassed</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${w.bypassRate >= 50 ? "bg-emerald-500" : w.bypassRate >= 20 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${w.bypassRate}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-bold w-10 text-right">{w.bypassRate}%</span>
        </div>
      ))}
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
  });

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
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">✓</Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">✗</Badge>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{item.waf || "-"}</td>
                  <td className="py-2 px-3 text-center text-xs">{formatDuration(item.durationMs)}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{formatDate(item.createdAt)}</td>
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
                  <p className="text-sm">{formatDuration(selectedAttack.durationMs)}</p>
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
                  <p className="text-sm">{selectedAttack.statusCode || "-"}</p>
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
                  <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{selectedAttack.errorMessage}</pre>
                </div>
              )}
              {selectedAttack.aiReasoning && (
                <div>
                  <p className="text-xs text-muted-foreground">AI Reasoning</p>
                  <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{selectedAttack.aiReasoning}</pre>
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
  const { data, isLoading } = trpc.attackDashboard.retryStats.useQuery();
  
  if (isLoading) return <div className="animate-pulse h-20 bg-muted rounded" />;
  if (!data) return null;

  return (
    <div className="grid grid-cols-3 gap-4 mb-4">
      <Card className="bg-card/60">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">รอ Retry</p>
          <p className="text-xl font-bold text-amber-400">{data.retriable}</p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">ล้มเหลวทั้งหมด</p>
          <p className="text-xl font-bold text-red-400">{data.totalFailed}</p>
        </CardContent>
      </Card>
      <Card className="bg-card/60">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">หมดวิธีแล้ว</p>
          <p className="text-xl font-bold text-zinc-400">{data.exhausted}</p>
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
        toast.success(`✅ Retry ${result.domain} สำเร็จ!`, { description: `วิธี: ${result.method}` });
      } else {
        toast.error(`❌ Retry ${result.domain} ล้มเหลว`, { description: result.error || result.method });
      }
      refetch();
    },
    onError: (err) => toast.error(`Retry ล้มเหลว: ${err.message}`),
  });
  const retryAll = trpc.attackDashboard.triggerRetryAll.useMutation({
    onSuccess: (result) => {
      toast.success(`🔄 Retry All เสร็จ!`, {
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

// ═══ Main Dashboard ═══
export default function AttackDashboard() {
  const [period, setPeriod] = useState("week");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Skull className="w-7 h-7 text-red-400" />
            Attack Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Unified attack analytics — deploy history, success rates, WAF bypass stats
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card/80">
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

      {/* Tabs: History / Top Domains / Failed */}
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Attack History</TabsTrigger>
          <TabsTrigger value="domains">Top Domains</TabsTrigger>
          <TabsTrigger value="failed">Failed (Retry Queue)</TabsTrigger>
        </TabsList>

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
