import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History, BarChart3, TrendingUp, Clock, CheckCircle2, XCircle,
  AlertTriangle, Globe, Loader2, Trash2, Search, Filter,
  Download, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  Rocket, FileText, Shield, Activity, Target, Flame,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  success: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10", label: "Success" },
  partial: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Partial" },
  failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Failed" },
  running: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10", label: "Running" },
};

export default function DeployHistory() {
  const [activeTab, setActiveTab] = useState("history");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [domainFilter, setDomainFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const limit = 20;

  // Queries
  const historyQuery = trpc.deployHistory.list.useQuery({
    limit,
    offset: page * limit,
    status: statusFilter === "all" ? undefined : statusFilter as any,
    domain: domainFilter || undefined,
  });

  const analyticsQuery = trpc.deployHistory.analytics.useQuery({ days: analyticsDays });
  const deleteMut = trpc.deployHistory.delete.useMutation({
    onSuccess: () => {
      toast.success("Deploy record deleted");
      historyQuery.refetch();
      analyticsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = Math.ceil((historyQuery.data?.total || 0) / limit);

  function formatDuration(ms: number | null | undefined): string {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }

  function formatDate(d: string | Date | null | undefined): string {
    if (!d) return "-";
    return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="w-6 h-6 text-emerald" />
            Deploy History & Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ประวัติการ Deploy ทั้งหมด พร้อมสถิติและ Analytics
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { historyQuery.refetch(); analyticsQuery.refetch(); }}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="history" className="text-xs">📋 History</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs">📊 Analytics</TabsTrigger>
        </TabsList>

        {/* ═══ HISTORY TAB ═══ */}
        <TabsContent value="history" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter by domain..."
                value={domainFilter}
                onChange={(e) => { setDomainFilter(e.target.value); setPage(0); }}
                className="pl-9 bg-card border-border"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full sm:w-[160px] bg-card border-border">
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
          </div>

          {/* Results count */}
          <div className="text-sm text-muted-foreground">
            {historyQuery.data?.total ?? 0} records found
            {totalPages > 1 && ` — Page ${page + 1} of ${totalPages}`}
          </div>

          {/* History List */}
          {historyQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-emerald" />
            </div>
          ) : !historyQuery.data?.items.length ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <History className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">ยังไม่มีประวัติการ Deploy</p>
                <p className="text-xs text-muted-foreground/60 mt-1">ไปที่ SEO SPAM เพื่อเริ่ม Deploy</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {historyQuery.data.items.map((item) => {
                const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.failed;
                const StatusIcon = sc.icon;
                const isExpanded = expandedId === item.id;
                const deployedUrls = (item.deployedUrls as any[]) || [];
                const verifiedUrls = (item.verifiedRedirectUrls as any[]) || [];
                const keywords = (item.keywords as string[]) || [];
                const errorBreakdown = (item.errorBreakdown as Record<string, number>) || {};
                const parasitePages = (item.parasitePages as any[]) || [];

                return (
                  <Card key={item.id} className={`bg-card border-border transition-all ${isExpanded ? "ring-1 ring-emerald/30" : ""}`}>
                    <div
                      className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg ${sc.bg} flex items-center justify-center shrink-0`}>
                          <StatusIcon className={`w-5 h-5 ${sc.color} ${item.status === "running" ? "animate-spin" : ""}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{item.targetDomain}</span>
                            <Badge variant="outline" className={`text-[10px] ${sc.color} border-current/30`}>{sc.label}</Badge>
                            {item.parasiteEnabled && <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-400/30">Parasite</Badge>}
                            {item.geoRedirect && <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-400/30">Geo</Badge>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>{formatDate(item.startedAt)}</span>
                            <span>•</span>
                            <span>{formatDuration(item.duration)}</span>
                            <span>•</span>
                            <span>{item.filesDeployed}/{item.filesAttempted} files</span>
                            {item.redirectActive && <><span>•</span><span className="text-green-400">Redirect Active</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={(e) => { e.stopPropagation(); deleteMut.mutate({ id: item.id }); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="bg-muted/30 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-emerald">{item.completedSteps}/{item.totalSteps}</div>
                            <div className="text-[10px] text-muted-foreground">Steps</div>
                          </div>
                          <div className="bg-muted/30 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-green-400">{item.successCount}</div>
                            <div className="text-[10px] text-muted-foreground">Success</div>
                          </div>
                          <div className="bg-muted/30 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-red-400">{item.failedCount}</div>
                            <div className="text-[10px] text-muted-foreground">Failed</div>
                          </div>
                          <div className="bg-muted/30 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-yellow-400">{item.retryCount}</div>
                            <div className="text-[10px] text-muted-foreground">Retries</div>
                          </div>
                        </div>

                        {/* Config */}
                        <div className="text-xs space-y-1">
                          <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Redirect URL:</span><a href={item.redirectUrl} target="_blank" className="text-emerald truncate hover:underline">{item.redirectUrl}</a></div>
                          {item.shellUrl && <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Shell URL:</span><span className="text-orange-400 truncate">{item.shellUrl}</span></div>}
                          {item.techniqueUsed && <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Technique:</span><span>{item.techniqueUsed}</span></div>}
                          {item.bypassMethod && <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Bypass:</span><span>{item.bypassMethod}</span></div>}
                          {item.cms && <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">CMS:</span><span>{item.cms}</span></div>}
                        </div>

                        {/* Keywords */}
                        {keywords.length > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Keywords:</div>
                            <div className="flex flex-wrap gap-1">
                              {keywords.map((k, i) => (
                                <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Verified URLs */}
                        {verifiedUrls.length > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Verified Redirect URLs ({verifiedUrls.length}):</div>
                            <div className="space-y-1">
                              {verifiedUrls.slice(0, 5).map((u: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                                  <a href={u.url || u} target="_blank" className="text-green-400 truncate hover:underline">{u.url || u}</a>
                                </div>
                              ))}
                              {verifiedUrls.length > 5 && <div className="text-xs text-muted-foreground">+{verifiedUrls.length - 5} more</div>}
                            </div>
                          </div>
                        )}

                        {/* Parasite Pages */}
                        {parasitePages.length > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Parasite Pages ({parasitePages.length}):</div>
                            <div className="space-y-1">
                              {parasitePages.slice(0, 3).map((p: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <FileText className="w-3 h-3 text-purple-400 shrink-0" />
                                  <span className="truncate">{p.title || p.filename}</span>
                                  <Badge variant="outline" className="text-[9px]">{p.wordCount}w</Badge>
                                  <Badge variant="outline" className="text-[9px] text-emerald">{p.seoScore}/100</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Error Breakdown */}
                        {Object.keys(errorBreakdown).length > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Error Breakdown:</div>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(errorBreakdown).map(([k, v]) => (
                                <Badge key={k} variant="outline" className="text-[10px] text-red-400 border-red-400/30">{k}: {v as number}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Report */}
                        {item.report && (
                          <details className="text-xs">
                            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">View Full Report</summary>
                            <pre className="mt-2 bg-muted/30 rounded-lg p-3 overflow-x-auto text-[10px] whitespace-pre-wrap max-h-[200px] overflow-y-auto">{item.report}</pre>
                          </details>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </TabsContent>

        {/* ═══ ANALYTICS TAB ═══ */}
        <TabsContent value="analytics" className="space-y-4">
          {/* Time Range Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Period:</span>
            {[7, 30, 90, 365].map(d => (
              <Button
                key={d}
                variant={analyticsDays === d ? "default" : "outline"}
                size="sm"
                onClick={() => setAnalyticsDays(d)}
                className="text-xs"
              >
                {d}d
              </Button>
            ))}
          </div>

          {analyticsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-emerald" />
            </div>
          ) : analyticsQuery.data ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-card border-border">
                  <CardContent className="p-4 text-center">
                    <Rocket className="w-5 h-5 mx-auto text-emerald mb-1" />
                    <div className="text-2xl font-bold">{analyticsQuery.data.totalDeploys}</div>
                    <div className="text-xs text-muted-foreground">Total Deploys</div>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-4 text-center">
                    <CheckCircle2 className="w-5 h-5 mx-auto text-green-400 mb-1" />
                    <div className="text-2xl font-bold text-green-400">{analyticsQuery.data.successRate}%</div>
                    <div className="text-xs text-muted-foreground">Success Rate</div>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-4 text-center">
                    <FileText className="w-5 h-5 mx-auto text-purple-400 mb-1" />
                    <div className="text-2xl font-bold text-purple-400">{analyticsQuery.data.totalFilesDeployed}</div>
                    <div className="text-xs text-muted-foreground">Files Deployed</div>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-4 text-center">
                    <Clock className="w-5 h-5 mx-auto text-yellow-400 mb-1" />
                    <div className="text-2xl font-bold text-yellow-400">{formatDuration(analyticsQuery.data.avgDuration)}</div>
                    <div className="text-xs text-muted-foreground">Avg Duration</div>
                  </CardContent>
                </Card>
              </div>

              {/* Status Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald" /> Status Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { label: "Success", value: analyticsQuery.data.successDeploys, color: "bg-green-500", total: analyticsQuery.data.totalDeploys },
                      { label: "Partial", value: analyticsQuery.data.partialDeploys, color: "bg-yellow-500", total: analyticsQuery.data.totalDeploys },
                      { label: "Failed", value: analyticsQuery.data.failedDeploys, color: "bg-red-500", total: analyticsQuery.data.totalDeploys },
                    ].map(s => (
                      <div key={s.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>{s.label}</span>
                          <span className="text-muted-foreground">{s.value} ({s.total > 0 ? Math.round((s.value / s.total) * 100) : 0}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${s.total > 0 ? (s.value / s.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 text-xs text-muted-foreground">
                      Parasite Pages: <span className="text-purple-400 font-semibold">{analyticsQuery.data.totalParasitePages}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Top Domains */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-cyan-400" /> Top Domains</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analyticsQuery.data.topDomains.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>
                    ) : (
                      <div className="space-y-2">
                        {analyticsQuery.data.topDomains.slice(0, 5).map((d, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="truncate flex-1">{d.domain}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-[10px]">{d.count} deploys</Badge>
                              <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30">{d.successCount} ok</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Daily Chart (text-based) */}
              {analyticsQuery.data.dailyStats.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-emerald" /> Daily Deploy Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {analyticsQuery.data.dailyStats.slice(-14).map((d, i) => {
                        const maxTotal = Math.max(...analyticsQuery.data!.dailyStats.map(s => s.total));
                        const barWidth = maxTotal > 0 ? (d.total / maxTotal) * 100 : 0;
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="w-20 text-muted-foreground shrink-0">{d.date}</span>
                            <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden relative">
                              <div className="h-full bg-green-500/60 rounded" style={{ width: `${maxTotal > 0 ? (d.success / maxTotal) * 100 : 0}%` }} />
                              <div className="h-full bg-red-500/60 rounded absolute top-0" style={{ left: `${maxTotal > 0 ? (d.success / maxTotal) * 100 : 0}%`, width: `${maxTotal > 0 ? (d.failed / maxTotal) * 100 : 0}%` }} />
                            </div>
                            <span className="w-12 text-right shrink-0">{d.total}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500/60 rounded" /> Success</span>
                      <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/60 rounded" /> Failed</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top Bypass Methods */}
              {analyticsQuery.data.topBypassMethods.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-orange-400" /> Top Bypass Methods</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {analyticsQuery.data.topBypassMethods.map((b, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {b.method} <span className="ml-1 text-muted-foreground">({b.count})</span>
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
