/**
 * AttackLogViewer — Real-time attack pipeline log viewer
 * 
 * Features:
 * - Real-time log display with auto-scroll
 * - Filter by phase, severity, deploy ID
 * - Color-coded log entries
 * - Export logs as text file
 * - Failure pattern analysis
 * - Smart fallback recommendations
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  FileText, Download, Filter, Search, RefreshCw, Loader2,
  AlertTriangle, CheckCircle2, XCircle, Info, Flame,
  ChevronDown, ChevronUp, Zap, Clock, Activity,
  BarChart3, ArrowRight, Shield, Bug, Eye,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───
interface LogEntry {
  id: number;
  deployId: number | null;
  userId: number;
  domain: string;
  phase: string;
  step: string;
  detail: string;
  severity: "info" | "success" | "warning" | "error" | "critical";
  progress: number;
  data: any;
  method: string | null;
  httpStatus: number | null;
  responseTime: number | null;
  timestamp: string | Date;
  createdAt: string | Date;
}

interface LogStats {
  total: number;
  bySeverity: Record<string, number>;
  byPhase: Record<string, number>;
  failurePatterns: Array<{
    phase: string;
    method: string;
    failCount: number;
    lastError: string;
    httpStatuses: number[];
  }>;
}

// ─── Severity config ───
const SEVERITY_CONFIG: Record<string, { color: string; bgColor: string; icon: React.ReactNode; label: string }> = {
  info: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    icon: <Info className="w-3 h-3" />,
    label: "INFO",
  },
  success: {
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    icon: <CheckCircle2 className="w-3 h-3" />,
    label: "SUCCESS",
  },
  warning: {
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    icon: <AlertTriangle className="w-3 h-3" />,
    label: "WARNING",
  },
  error: {
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    icon: <XCircle className="w-3 h-3" />,
    label: "ERROR",
  },
  critical: {
    color: "text-red-500",
    bgColor: "bg-red-600/20 border-red-500/30",
    icon: <Flame className="w-3 h-3" />,
    label: "CRITICAL",
  },
};

// ─── Phase labels ───
const PHASE_LABELS: Record<string, string> = {
  ai_analysis: "AI Analysis",
  prescreen: "Pre-Screen",
  vuln_scan: "Vuln Scan",
  shell_gen: "Shell Gen",
  upload: "Upload",
  verify: "Verify",
  waf_bypass: "WAF Bypass",
  alt_upload: "Alt Upload",
  indirect: "Indirect",
  shellless: "Shellless",
  wp_admin: "WP Admin",
  wp_db_inject: "WP DB Inject",
  wp_brute_force: "WP Brute Force",
  cf_bypass: "CF Bypass",
  comprehensive: "Comprehensive",
  ai_commander: "AI Commander",
  cloaking: "Cloaking",
  post_upload: "Post Upload",
  complete: "Complete",
  world_update: "World State",
  error: "Error",
};

// ═══════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════

interface AttackLogViewerProps {
  deployId?: number | null;
  domain?: string;
  autoRefresh?: boolean;
  compact?: boolean;
}

export default function AttackLogViewer({
  deployId,
  domain,
  autoRefresh = false,
  compact = false,
}: AttackLogViewerProps) {
  // ─── State ───
  const [selectedDeployId, setSelectedDeployId] = useState<number | null>(deployId || null);
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(autoRefresh ? 3000 : null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Update selectedDeployId when prop changes
  useEffect(() => {
    if (deployId) setSelectedDeployId(deployId);
  }, [deployId]);

  // ─── Queries ───
  const logsQuery = trpc.attackLogs.getByDeploy.useQuery(
    {
      deployId: selectedDeployId!,
      phase: filterPhase !== "all" ? filterPhase : undefined,
      severity: filterSeverity !== "all" ? filterSeverity : undefined,
      limit: 500,
    },
    {
      enabled: !!selectedDeployId,
      refetchInterval: refreshInterval || false,
    },
  );

  const statsQuery = trpc.attackLogs.stats.useQuery(
    { deployId: selectedDeployId! },
    { enabled: !!selectedDeployId && showStats },
  );

  const recentQuery = trpc.attackLogs.recent.useQuery(
    { limit: 50 },
    { enabled: !selectedDeployId },
  );

  const exportQuery = trpc.attackLogs.exportText.useQuery(
    { deployId: selectedDeployId! },
    { enabled: false },
  );

  // ─── Filtered logs ───
  const filteredLogs = useMemo(() => {
    const logs = (logsQuery.data || recentQuery.data || []) as LogEntry[];
    if (!searchText) return logs;
    const lower = searchText.toLowerCase();
    return logs.filter(
      (l) =>
        l.detail.toLowerCase().includes(lower) ||
        l.phase.toLowerCase().includes(lower) ||
        l.step.toLowerCase().includes(lower) ||
        (l.method || "").toLowerCase().includes(lower),
    );
  }, [logsQuery.data, recentQuery.data, searchText]);

  // ─── Auto-scroll ───
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredLogs.length, autoScroll]);

  // ─── Export handler ───
  const handleExport = useCallback(async () => {
    if (!selectedDeployId) return;
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const blob = new Blob([result.data], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `attack-log-deploy-${selectedDeployId}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Log exported successfully");
      }
    } catch {
      toast.error("Failed to export logs");
    }
  }, [selectedDeployId, exportQuery]);

  // ─── Render log entry ───
  const renderLogEntry = (log: LogEntry, index: number) => {
    const sev = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.info;
    const ts = new Date(log.timestamp).toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const phaseLabel = PHASE_LABELS[log.phase] || log.phase;

    return (
      <div
        key={log.id || index}
        className={`flex items-start gap-2 px-3 py-1.5 border-l-2 hover:bg-muted/10 transition-colors font-mono text-xs ${
          log.severity === "critical"
            ? "border-l-red-500 bg-red-950/10"
            : log.severity === "error"
            ? "border-l-red-400"
            : log.severity === "warning"
            ? "border-l-amber-400"
            : log.severity === "success"
            ? "border-l-emerald-400"
            : "border-l-blue-400/30"
        }`}
      >
        {/* Timestamp */}
        <span className="text-muted-foreground shrink-0 w-[60px]">{ts}</span>

        {/* Severity icon */}
        <span className={`shrink-0 mt-0.5 ${sev.color}`}>{sev.icon}</span>

        {/* Phase badge */}
        <Badge
          variant="outline"
          className={`text-[9px] shrink-0 px-1 py-0 ${
            log.phase === "complete"
              ? "text-emerald-400 border-emerald-500/30"
              : log.phase === "error"
              ? "text-red-400 border-red-500/30"
              : "text-muted-foreground border-border/50"
          }`}
        >
          {phaseLabel}
        </Badge>

        {/* Method badge */}
        {log.method && (
          <Badge variant="outline" className="text-[9px] shrink-0 px-1 py-0 text-purple-400 border-purple-500/30">
            {log.method}
          </Badge>
        )}

        {/* HTTP status */}
        {log.httpStatus && (
          <Badge
            variant="outline"
            className={`text-[9px] shrink-0 px-1 py-0 ${
              log.httpStatus >= 200 && log.httpStatus < 300
                ? "text-emerald-400 border-emerald-500/30"
                : log.httpStatus >= 400
                ? "text-red-400 border-red-500/30"
                : "text-amber-400 border-amber-500/30"
            }`}
          >
            HTTP {log.httpStatus}
          </Badge>
        )}

        {/* Detail text */}
        <span className={`flex-1 min-w-0 break-words ${sev.color}`}>
          {log.detail}
        </span>

        {/* Progress */}
        {log.progress > 0 && (
          <span className="text-muted-foreground shrink-0">{log.progress}%</span>
        )}
      </div>
    );
  };

  // ─── Stats panel ───
  const renderStats = () => {
    if (!statsQuery.data) return null;
    const stats = statsQuery.data as LogStats;

    return (
      <div className="space-y-3 p-3 border rounded-lg bg-muted/5">
        {/* Severity breakdown */}
        <div>
          <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> Severity Breakdown
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.bySeverity).map(([sev, count]) => {
              const config = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.info;
              return (
                <Badge key={sev} variant="outline" className={`text-[10px] ${config.bgColor} ${config.color}`}>
                  {config.icon}
                  <span className="ml-1">{sev}: {count}</span>
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Phase breakdown */}
        <div>
          <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Phase Breakdown
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.byPhase).map(([phase, count]) => (
              <Badge key={phase} variant="outline" className="text-[10px]">
                {PHASE_LABELS[phase] || phase}: {count}
              </Badge>
            ))}
          </div>
        </div>

        {/* Failure patterns */}
        {stats.failurePatterns.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-red-400">
              <Bug className="w-3 h-3" /> Failure Patterns
            </h4>
            <div className="space-y-1">
              {stats.failurePatterns.map((p, i) => (
                <div key={i} className="text-[10px] p-1.5 rounded border border-red-500/20 bg-red-950/10">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] text-red-400 border-red-500/30">
                      {p.method}
                    </Badge>
                    <span className="text-red-400">Failed {p.failCount}x</span>
                    {p.httpStatuses.length > 0 && (
                      <span className="text-muted-foreground">
                        HTTP: {Array.from(new Set(p.httpStatuses)).join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate">{p.lastError}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════

  return (
    <div className={`space-y-3 ${compact ? "" : ""}`}>
      {/* ─── Header / Controls ─── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Deploy ID input */}
        {!deployId && (
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">Deploy #</Label>
            <Input
              type="number"
              placeholder="ID"
              className="w-20 h-7 text-xs"
              value={selectedDeployId || ""}
              onChange={(e) => setSelectedDeployId(e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
        )}

        {/* Phase filter */}
        <Select value={filterPhase} onValueChange={setFilterPhase}>
          <SelectTrigger className="w-[130px] h-7 text-xs">
            <Filter className="w-3 h-3 mr-1" />
            <SelectValue placeholder="Phase" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            {Object.entries(PHASE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Severity filter */}
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-[120px] h-7 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[150px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            className="h-7 text-xs pl-7"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            <Switch
              id="auto-scroll"
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
              className="scale-75"
            />
            <Label htmlFor="auto-scroll" className="text-[10px] text-muted-foreground">Auto-scroll</Label>
          </div>

          <div className="flex items-center gap-1">
            <Switch
              id="auto-refresh"
              checked={!!refreshInterval}
              onCheckedChange={(v) => setRefreshInterval(v ? 3000 : null)}
              className="scale-75"
            />
            <Label htmlFor="auto-refresh" className="text-[10px] text-muted-foreground">Live</Label>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => {
              logsQuery.refetch();
              statsQuery.refetch();
            }}
          >
            <RefreshCw className={`w-3 h-3 ${logsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setShowStats(!showStats)}
          >
            <BarChart3 className="w-3 h-3" />
          </Button>

          {selectedDeployId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={handleExport}
            >
              <Download className="w-3 h-3" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* ─── Stats Panel ─── */}
      {showStats && selectedDeployId && renderStats()}

      {/* ─── Log count ─── */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <FileText className="w-3 h-3" />
        <span>
          {filteredLogs.length} log entries
          {selectedDeployId ? ` for Deploy #${selectedDeployId}` : " (recent)"}
          {searchText && ` matching "${searchText}"`}
        </span>
        {refreshInterval && (
          <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30 animate-pulse">
            LIVE
          </Badge>
        )}
      </div>

      {/* ─── Log entries ─── */}
      <Card className="border-border/30 bg-black/20">
        <ScrollArea className={compact ? "h-[300px]" : "h-[500px]"}>
          <div className="divide-y divide-border/10" ref={scrollRef}>
            {logsQuery.isLoading || recentQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading logs...</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">No log entries found</p>
                <p className="text-xs mt-1">
                  {selectedDeployId
                    ? "This deploy has no logged events yet"
                    : "Enter a Deploy ID to view logs"}
                </p>
              </div>
            ) : (
              <>
                {/* Render logs in chronological order (oldest first) */}
                {[...filteredLogs].reverse().map((log, i) => renderLogEntry(log, i))}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
