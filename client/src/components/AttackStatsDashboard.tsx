/**
 * Attack Stats Dashboard — Aggregate attack statistics, success rates, failure patterns
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart3, TrendingUp, Target, Shield, AlertTriangle,
  CheckCircle2, XCircle, Clock, Activity, Loader2,
  RefreshCw, Skull, Zap, Globe, ArrowUpRight, Flame,
  Minus, ArrowDown, ArrowUp,
} from "lucide-react";

export default function AttackStatsDashboard() {
  const [days, setDays] = useState(30);

  const { data: stats, isLoading, refetch } = trpc.attackLogs.dashboardStats.useQuery(
    { days },
    { refetchInterval: 60000 } // Refresh every minute
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="ml-3 text-zinc-400">Loading attack statistics...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-20 text-zinc-500">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No attack data available yet</p>
        <p className="text-sm mt-1">Run some attacks to see statistics here</p>
      </div>
    );
  }

  const { deployStats, successRate, totalLogEvents, severityStats, phaseStats, topFailures, topSuccessMethods, recentDeploys, domainStats } = stats;

  return (
    <div className="space-y-4">
      {/* Header with period selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-full sm:w-[140px] bg-zinc-900/50 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-zinc-400 border-zinc-700">
            {totalLogEvents.toLocaleString()} events
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5 text-zinc-400 hover:text-white">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* ═══ KPI Cards ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {/* Total Deploys */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Total Attacks</p>
                <p className="text-xl sm:text-2xl font-bold text-white mt-1">{deployStats.total}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Success Rate</p>
                <p className="text-xl sm:text-2xl font-bold text-white mt-1">{successRate}%</p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                successRate >= 50 ? "bg-green-500/10" : successRate >= 25 ? "bg-yellow-500/10" : "bg-red-500/10"
              }`}>
                {successRate >= 50 ? (
                  <TrendingUp className="w-5 h-5 text-green-400" />
                ) : successRate >= 25 ? (
                  <Minus className="w-5 h-5 text-yellow-400" />
                ) : (
                  <ArrowDown className="w-5 h-5 text-red-400" />
                )}
              </div>
            </div>
            <Progress value={successRate} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        {/* Successful */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Successful</p>
                <p className="text-xl sm:text-2xl font-bold text-green-400 mt-1">{deployStats.success + deployStats.partial}</p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {deployStats.success} full + {deployStats.partial} partial
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Failed */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Failed</p>
                <p className="text-xl sm:text-2xl font-bold text-red-400 mt-1">{deployStats.failed}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Charts Row ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Severity Breakdown */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              Log Severity Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {[
                { key: "info", label: "Info", color: "bg-blue-500", textColor: "text-blue-400", icon: Activity },
                { key: "success", label: "Success", color: "bg-green-500", textColor: "text-green-400", icon: CheckCircle2 },
                { key: "warning", label: "Warning", color: "bg-yellow-500", textColor: "text-yellow-400", icon: AlertTriangle },
                { key: "error", label: "Error", color: "bg-red-500", textColor: "text-red-400", icon: XCircle },
                { key: "critical", label: "Critical", color: "bg-red-700", textColor: "text-red-300", icon: Skull },
              ].map(({ key, label, color, textColor, icon: Icon }) => {
                const count = severityStats[key] || 0;
                const pct = totalLogEvents > 0 ? (count / totalLogEvents) * 100 : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <Icon className={`w-3.5 h-3.5 ${textColor} flex-shrink-0`} />
                    <span className="text-xs text-zinc-400 w-14">{label}</span>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-xs font-mono ${textColor} w-12 text-right`}>{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Phase Breakdown */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Events by Phase
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-1.5">
                {Object.entries(phaseStats)
                  .sort(([, a], [, b]) => b - a)
                  .map(([phase, count]) => {
                    const pct = totalLogEvents > 0 ? (count / totalLogEvents) * 100 : 0;
                    return (
                      <div key={phase} className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 w-24 truncate font-mono">{phase}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-zinc-400 w-10 text-right font-mono">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Methods & Failures ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Success Methods */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Flame className="w-4 h-4 text-green-400" />
              Best Attack Methods
            </CardTitle>
            <CardDescription className="text-xs">Methods that led to successful deploys</CardDescription>
          </CardHeader>
          <CardContent>
            {topSuccessMethods.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-4">No successful methods recorded yet</p>
            ) : (
              <div className="space-y-2">
                {topSuccessMethods.map((m, i) => (
                  <div key={m.method} className="flex items-center gap-2 p-2 rounded-lg bg-green-500/5 border border-green-500/10">
                    <span className="text-xs font-bold text-green-400 w-5">#{i + 1}</span>
                    <span className="text-xs text-zinc-300 flex-1 truncate">{m.method}</span>
                    <Badge variant="outline" className="text-green-400 border-green-500/30 text-xs">
                      {m.count}x
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Failure Patterns */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Top Failure Patterns
            </CardTitle>
            <CardDescription className="text-xs">Methods that fail most often</CardDescription>
          </CardHeader>
          <CardContent>
            {topFailures.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-4">No failures recorded yet</p>
            ) : (
              <div className="space-y-2">
                {topFailures.map((f, i) => (
                  <div key={`${f.phase}-${f.method}`} className="flex items-center gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                    <span className="text-xs font-bold text-red-400 w-5">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-zinc-300 truncate block">{f.method}</span>
                      <span className="text-[10px] text-zinc-600">{f.phase}</span>
                    </div>
                    <Badge variant="outline" className="text-red-400 border-red-500/30 text-xs">
                      {f.count}x
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Domain Stats ═══ */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            Domains Attacked
          </CardTitle>
          <CardDescription className="text-xs">Attack attempts per domain</CardDescription>
        </CardHeader>
        <CardContent>
          {domainStats.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4">No domains attacked yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {domainStats.map((d) => (
                <div key={d.domain} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <Globe className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                  <span className="text-xs text-zinc-300 flex-1 truncate font-mono">{d.domain}</span>
                  <Badge variant="outline" className="text-zinc-400 border-zinc-600 text-xs">
                    {d.attempts}x
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${
                    d.lastStatus === "success" ? "text-green-400 border-green-500/30" :
                    d.lastStatus === "partial" ? "text-yellow-400 border-yellow-500/30" :
                    "text-red-400 border-red-500/30"
                  }`}>
                    {d.lastStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Recent Deploy Timeline ═══ */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            Recent Attack Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentDeploys.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4">No recent deploys</p>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-1">
                {recentDeploys.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors">
                    {/* Status indicator */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      d.status === "success" ? "bg-green-400" :
                      d.status === "partial" ? "bg-yellow-400" :
                      d.status === "running" ? "bg-blue-400 animate-pulse" :
                      "bg-red-400"
                    }`} />
                    
                    {/* Domain */}
                    <span className="text-xs text-zinc-300 font-mono w-24 sm:w-40 truncate">{d.domain}</span>
                    
                    {/* Status badge */}
                    <Badge variant="outline" className={`text-xs ${
                      d.status === "success" ? "text-green-400 border-green-500/30" :
                      d.status === "partial" ? "text-yellow-400 border-yellow-500/30" :
                      d.status === "running" ? "text-blue-400 border-blue-500/30" :
                      "text-red-400 border-red-500/30"
                    }`}>
                      {d.status}
                    </Badge>
                    
                    {/* Method used */}
                    {d.altMethodUsed && (
                      <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/30">
                        {d.altMethodUsed}
                      </Badge>
                    )}
                    
                    {/* Duration */}
                    {d.duration && (
                      <span className="text-[10px] text-zinc-600 ml-auto hidden sm:inline">
                        {(d.duration / 1000).toFixed(1)}s
                      </span>
                    )}
                    
                    {/* Time */}
                    <span className="text-[10px] text-zinc-600 hidden sm:inline">
                      {d.createdAt ? new Date(d.createdAt).toLocaleString("th-TH", { 
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" 
                      }) : "N/A"}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
