/**
 * Proxy Health Check Dashboard
 * Real-time monitoring of 50 residential proxies
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield, Activity, Wifi, WifiOff, Zap, Clock, RefreshCw,
  Play, Pause, CheckCircle2, XCircle, Timer, Server, Globe,
} from "lucide-react";

export default function ProxyDashboard() {
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [isCheckingSample, setIsCheckingSample] = useState(false);
  const [testingProxyId, setTestingProxyId] = useState<number | null>(null);
  const [lastCheckResults, setLastCheckResults] = useState<
    Array<{ label: string; ok: boolean; latencyMs: number; ip?: string }> | null
  >(null);

  const statsQuery = trpc.proxy.getStats.useQuery(undefined, { refetchInterval: 15000 });
  const allProxiesQuery = trpc.proxy.getAll.useQuery(undefined, { refetchInterval: 15000 });

  const healthCheckSample = trpc.proxy.healthCheckSample.useMutation({
    onSuccess: (data) => {
      setLastCheckResults(data.results);
      toast.success(`Quick Check: ${data.healthy}/${data.checked} healthy`);
      statsQuery.refetch();
      allProxiesQuery.refetch();
    },
    onError: (err) => toast.error(`Health check failed: ${err.message}`),
  });

  const healthCheckAll = trpc.proxy.healthCheckAll.useMutation({
    onSuccess: (data) => {
      setLastCheckResults(data.results);
      toast.success(`Full Check: ${data.healthy}/${data.checked} healthy`);
      statsQuery.refetch();
      allProxiesQuery.refetch();
    },
    onError: (err) => toast.error(`Health check failed: ${err.message}`),
  });

  const testSingle = trpc.proxy.testSingle.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(`Proxy OK — ${data.latencyMs}ms${data.ip ? ` (IP: ${data.ip})` : ""}`);
      } else {
        toast.error(`Proxy FAILED — ${data.latencyMs}ms`);
      }
      allProxiesQuery.refetch();
      setTestingProxyId(null);
    },
    onError: (err) => {
      toast.error(`Test failed: ${err.message}`);
      setTestingProxyId(null);
    },
  });

  const toggleScheduler = trpc.proxy.toggleScheduler.useMutation({
    onSuccess: (data) => {
      toast.success(data.running ? "Scheduler started" : "Scheduler stopped");
      statsQuery.refetch();
    },
  });

  const resetStats = trpc.proxy.resetStats.useMutation({
    onSuccess: () => {
      toast.success("All proxy stats reset");
      statsQuery.refetch();
      allProxiesQuery.refetch();
    },
  });

  const stats = statsQuery.data;
  const proxies = allProxiesQuery.data ?? [];

  const handleQuickCheck = () => {
    setIsCheckingSample(true);
    healthCheckSample.mutate({ sampleSize: 10 }, { onSettled: () => setIsCheckingSample(false) });
  };

  const handleFullCheck = () => {
    setIsCheckingAll(true);
    healthCheckAll.mutate(undefined, { onSettled: () => setIsCheckingAll(false) });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald" />
            Proxy Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Residential Proxy Pool — 50 proxies with auto-rotation &amp; health monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleQuickCheck} disabled={isCheckingSample || isCheckingAll}>
            {isCheckingSample ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
            Quick Check (10)
          </Button>
          <Button size="sm" onClick={handleFullCheck} disabled={isCheckingAll || isCheckingSample} className="bg-emerald hover:bg-emerald/90">
            {isCheckingAll ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Activity className="w-4 h-4 mr-1" />}
            Full Check (50)
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Proxies</p>
                <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
              </div>
              <Server className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-emerald/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald/70">Healthy</p>
                <p className="text-2xl font-bold text-emerald">{stats?.healthy ?? 0}</p>
              </div>
              <Wifi className="w-5 h-5 text-emerald" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400/70">Unhealthy</p>
                <p className="text-2xl font-bold text-red-400">{stats?.unhealthy ?? 0}</p>
              </div>
              <WifiOff className="w-5 h-5 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Latency</p>
                <p className="text-2xl font-bold">{stats?.avgLatencyMs ?? 0}<span className="text-sm text-muted-foreground">ms</span></p>
              </div>
              <Timer className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{stats?.successRate ?? 100}<span className="text-sm text-muted-foreground">%</span></p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">{stats?.totalRequests ?? 0}</p>
              </div>
              <Globe className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scheduler Card */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" /> Health Check Scheduler
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Automatically tests all proxies at regular intervals
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={stats?.scheduler?.running ? "default" : "secondary"} className={stats?.scheduler?.running ? "bg-emerald/20 text-emerald border-emerald/30" : ""}>
                {stats?.scheduler?.running ? "Running" : "Stopped"}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => toggleScheduler.mutate({ enabled: !stats?.scheduler?.running, intervalMinutes: 30 })}>
                {stats?.scheduler?.running ? <><Pause className="w-3.5 h-3.5 mr-1" /> Stop</> : <><Play className="w-3.5 h-3.5 mr-1" /> Start</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => resetStats.mutate()}>Reset Stats</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Interval:</span> <span className="font-medium">{(stats?.scheduler?.intervalMs ?? 1800000) / 60000} min</span></div>
            <div><span className="text-muted-foreground">Total Runs:</span> <span className="font-medium">{stats?.scheduler?.totalRuns ?? 0}</span></div>
            <div><span className="text-muted-foreground">Last Run:</span> <span className="font-medium">{stats?.scheduler?.lastRun ? new Date(stats.scheduler.lastRun).toLocaleTimeString() : "Never"}</span></div>
            <div><span className="text-muted-foreground">Last Result:</span> <span className="font-medium">{stats?.scheduler?.lastResult ? `${stats.scheduler.lastResult.healthy}/${stats.scheduler.lastResult.checked} healthy` : "N/A"}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Last Check Results */}
      {lastCheckResults && lastCheckResults.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" /> Last Health Check Results
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-2">
              {lastCheckResults.map((r, i) => (
                <div key={i} className={`p-2 rounded-md border text-center text-xs ${r.ok ? "bg-emerald/5 border-emerald/20 text-emerald" : "bg-red-500/5 border-red-500/20 text-red-400"}`}>
                  <div className="font-mono text-[10px] truncate">{r.label}</div>
                  <div className="font-bold mt-0.5">{r.ok ? `${r.latencyMs}ms` : "FAIL"}</div>
                  {r.ip && <div className="text-[9px] opacity-60 truncate">{r.ip}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proxy List Table */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4" /> All Proxies ({proxies.length})
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => allProxiesQuery.refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground text-xs">
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left py-2 px-2">IP:Port</th>
                  <th className="text-center py-2 px-2">Status</th>
                  <th className="text-right py-2 px-2">Latency</th>
                  <th className="text-right py-2 px-2">Success</th>
                  <th className="text-right py-2 px-2">Fail</th>
                  <th className="text-right py-2 px-2">Rate</th>
                  <th className="text-left py-2 px-2">Target</th>
                  <th className="text-left py-2 px-2">Last Used</th>
                  <th className="text-center py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {proxies.map((proxy) => (
                  <tr key={proxy.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-2 text-muted-foreground font-mono text-xs">{proxy.id + 1}</td>
                    <td className="py-2 px-2 font-mono text-xs">{proxy.label}</td>
                    <td className="py-2 px-2 text-center">
                      {proxy.healthy ? (
                        <Badge variant="outline" className="bg-emerald/10 text-emerald border-emerald/30 text-[10px] px-1.5">
                          <Wifi className="w-3 h-3 mr-0.5" /> OK
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px] px-1.5">
                          <WifiOff className="w-3 h-3 mr-0.5" /> DOWN
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-xs">
                      {proxy.avgLatencyMs > 0 ? (
                        <span className={proxy.avgLatencyMs < 1000 ? "text-emerald" : proxy.avgLatencyMs < 3000 ? "text-yellow-500" : "text-red-400"}>
                          {proxy.avgLatencyMs}ms
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-xs text-emerald">{proxy.successCount}</td>
                    <td className="py-2 px-2 text-right font-mono text-xs text-red-400">{proxy.failCount}</td>
                    <td className="py-2 px-2 text-right font-mono text-xs">
                      <span className={proxy.successRate >= 80 ? "text-emerald" : proxy.successRate >= 50 ? "text-yellow-500" : "text-red-400"}>
                        {proxy.successRate}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs truncate max-w-[120px]">
                      {proxy.currentTarget ? <span className="text-violet">{proxy.currentTarget}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {proxy.lastUsed > 0 ? new Date(proxy.lastUsed).toLocaleTimeString() : "—"}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setTestingProxyId(proxy.id); testSingle.mutate({ proxyId: proxy.id }); }} disabled={testingProxyId === proxy.id}>
                        {testingProxyId === proxy.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Test"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
