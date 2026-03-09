/**
 * CVE Database Dashboard
 * Real-time CVE database with search, scheduler status, and AI exploit generator
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Database, RefreshCw, Search, Shield, AlertTriangle, Bug,
  Clock, Play, Pause, Zap, ChevronDown, ChevronUp, ExternalLink,
  Filter, X, Loader2, CheckCircle2, XCircle, FileCode,
} from "lucide-react";

// ─── Types ───

type SeverityLevel = "critical" | "high" | "medium" | "low";
type CmsType = string;

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const CMS_COLORS: Record<string, string> = {
  wordpress: "text-blue-400",
  joomla: "text-orange-400",
  drupal: "text-cyan-400",
  magento: "text-purple-400",
  prestashop: "text-pink-400",
  vbulletin: "text-yellow-400",
  phpbb: "text-green-400",
  opencart: "text-emerald-400",
};

// ─── Component ───

export default function CveDashboard() {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCms, setFilterCms] = useState<string>("");
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [filterVulnType, setFilterVulnType] = useState<string>("");
  const [exploitOnly, setExploitOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [expandedCve, setExpandedCve] = useState<number | null>(null);
  const [showSchedulerLogs, setShowSchedulerLogs] = useState(false);
  const [exploitTarget, setExploitTarget] = useState<{
    cveId: string;
    cms: string;
    component: string;
    vulnType: string;
    title: string;
  } | null>(null);
  const [exploitTargetUrl, setExploitTargetUrl] = useState("");
  const [exploitRedirectUrl, setExploitRedirectUrl] = useState("");

  const PAGE_SIZE = 30;

  // Queries
  const statsQuery = trpc.cveDatabase.stats.useQuery();
  const schedulerQuery = trpc.cveDatabase.schedulerStatus.useQuery(undefined, {
    refetchInterval: 10000, // Refresh every 10s
  });
  const searchResults = trpc.cveDatabase.search.useQuery({
    query: searchQuery || undefined,
    cms: filterCms || undefined,
    severity: filterSeverity || undefined,
    vulnType: filterVulnType || undefined,
    exploitOnly: exploitOnly || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }, {
    placeholderData: (prev: any) => prev,
  });

  // Mutations
  const triggerUpdate = trpc.cveDatabase.triggerUpdate.useMutation({
    onSuccess: () => {
      toast.success("CVE update triggered successfully");
      statsQuery.refetch();
      searchResults.refetch();
      schedulerQuery.refetch();
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });

  const enableScheduler = trpc.cveDatabase.enableScheduler.useMutation({
    onSuccess: () => {
      toast.success("Scheduler enabled");
      schedulerQuery.refetch();
    },
  });

  const disableScheduler = trpc.cveDatabase.disableScheduler.useMutation({
    onSuccess: () => {
      toast.success("Scheduler disabled");
      schedulerQuery.refetch();
    },
  });

  const generateExploit = trpc.cveDatabase.generateExploit.useMutation({
    onSuccess: (data) => {
      toast.success("Exploit payload generated");
      setExploitResult(data);
    },
    onError: (err) => toast.error(`Exploit generation failed: ${err.message}`),
  });

  const [exploitResult, setExploitResult] = useState<any>(null);

  // Derived
  const stats = statsQuery.data;
  const scheduler = schedulerQuery.data;
  const totalPages = Math.ceil((searchResults.data?.total || 0) / PAGE_SIZE);

  const hasActiveFilters = filterCms || filterSeverity || filterVulnType || exploitOnly || searchQuery;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Database className="w-7 h-7 text-emerald" />
            CVE Database
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time vulnerability database — Wordfence Intelligence + NVD API
          </p>
        </div>
        <button
          onClick={() => triggerUpdate.mutate()}
          disabled={triggerUpdate.isPending || scheduler?.running}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald/15 text-emerald border border-emerald/30 rounded-lg hover:bg-emerald/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${(triggerUpdate.isPending || scheduler?.running) ? "animate-spin" : ""}`} />
          {scheduler?.running ? "Updating..." : "Update Now"}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total CVEs"
          value={stats?.totalCves || 0}
          icon={<Database className="w-4 h-4" />}
          color="emerald"
        />
        <StatCard
          label="Vuln Types"
          value={stats?.byType ? Object.keys(stats.byType).length : 0}
          icon={<Bug className="w-4 h-4" />}
          color="red"
        />
        <StatCard
          label="Critical"
          value={stats?.bySeverity?.critical || 0}
          icon={<AlertTriangle className="w-4 h-4" />}
          color="red"
        />
        <StatCard
          label="High"
          value={stats?.bySeverity?.high || 0}
          icon={<Shield className="w-4 h-4" />}
          color="orange"
        />
        <StatCard
          label="Medium"
          value={stats?.bySeverity?.medium || 0}
          icon={<Shield className="w-4 h-4" />}
          color="yellow"
        />
        <StatCard
          label="Low"
          value={stats?.bySeverity?.low || 0}
          icon={<Shield className="w-4 h-4" />}
          color="blue"
        />
      </div>

      {/* CMS Breakdown */}
      {stats?.byCms && Object.keys(stats.byCms).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 font-mono tracking-wider uppercase">CVEs by CMS</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.byCms)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([cms, count]) => (
                <button
                  key={cms}
                  onClick={() => {
                    setFilterCms(filterCms === cms ? "" : cms);
                    setPage(0);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                    filterCms === cms
                      ? "bg-emerald/15 border-emerald/30 text-emerald"
                      : "bg-card border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <span className={`font-medium text-sm capitalize ${CMS_COLORS[cms] || "text-foreground"}`}>
                    {cms}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{count as number}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Scheduler Status */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground font-mono tracking-wider uppercase flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Auto-Update Scheduler
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSchedulerLogs(!showSchedulerLogs)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showSchedulerLogs ? "Hide Logs" : "Show Logs"}
            </button>
            {scheduler?.enabled ? (
              <button
                onClick={() => disableScheduler.mutate()}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/25 transition-colors"
              >
                <Pause className="w-3 h-3" /> Disable
              </button>
            ) : (
              <button
                onClick={() => enableScheduler.mutate()}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-emerald/15 text-emerald border border-emerald/30 rounded-lg hover:bg-emerald/25 transition-colors"
              >
                <Play className="w-3 h-3" /> Enable
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-background/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${scheduler?.enabled ? "bg-emerald animate-pulse" : "bg-muted-foreground"}`} />
              <span className="text-sm font-medium">
                {scheduler?.running ? "Running" : scheduler?.enabled ? "Active" : "Disabled"}
              </span>
            </div>
          </div>
          <div className="bg-background/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Last Run</div>
            <div className="text-sm font-medium">
              {scheduler?.lastRunAt ? new Date(scheduler.lastRunAt).toLocaleString() : "Never"}
            </div>
          </div>
          <div className="bg-background/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Next Run</div>
            <div className="text-sm font-medium">
              {scheduler?.nextRunAt ? new Date(scheduler.nextRunAt).toLocaleString() : "—"}
            </div>
          </div>
          <div className="bg-background/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Runs</div>
            <div className="text-sm font-medium">{scheduler?.totalRuns || 0}</div>
          </div>
          <div className="bg-background/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Last Result</div>
            <div className="text-sm font-medium">
              {scheduler?.lastRunSummary
                ? `+${scheduler.lastRunSummary.wordfenceNew + scheduler.lastRunSummary.nvdNew} new (${Math.round(scheduler.lastRunSummary.durationMs / 1000)}s)`
                : "—"}
            </div>
          </div>
        </div>

        {/* Scheduler Logs */}
        {showSchedulerLogs && scheduler?.recentLogs && (
          <div className="mt-3 bg-background/80 rounded-lg p-3 max-h-[300px] overflow-y-auto">
            <div className="space-y-1">
              {scheduler.recentLogs.map((log, i) => (
                <div key={i} className="flex gap-2 text-xs font-mono">
                  <span className="text-muted-foreground shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-foreground/80">{log.message}</span>
                </div>
              ))}
              {scheduler.recentLogs.length === 0 && (
                <div className="text-xs text-muted-foreground">No logs yet</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search CVE ID, plugin name, title..."
              className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald/30 focus:border-emerald/50"
            />
          </div>

          {/* Severity Filter */}
          <select
            value={filterSeverity}
            onChange={(e) => { setFilterSeverity(e.target.value); setPage(0); }}
            className="px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald/30"
          >
            <option value="">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Vuln Type Filter */}
          <select
            value={filterVulnType}
            onChange={(e) => { setFilterVulnType(e.target.value); setPage(0); }}
            className="px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald/30"
          >
            <option value="">All Types</option>
            <option value="file_upload">File Upload</option>
            <option value="rce">RCE</option>
            <option value="sqli">SQL Injection</option>
            <option value="auth_bypass">Auth Bypass</option>
            <option value="lfi">LFI</option>
            <option value="xss">XSS</option>
            <option value="deserialization">Deserialization</option>
            <option value="other">Other</option>
          </select>

          {/* Exploit Only Toggle */}
          <button
            onClick={() => { setExploitOnly(!exploitOnly); setPage(0); }}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
              exploitOnly
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="w-4 h-4" />
            Exploitable
          </button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterCms("");
                setFilterSeverity("");
                setFilterVulnType("");
                setExploitOnly(false);
                setPage(0);
              }}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>

        {/* Results Count */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {searchResults.data?.total || 0} results
            {hasActiveFilters && " (filtered)"}
          </span>
          {searchResults.isFetching && (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
        </div>
      </div>

      {/* CVE Results Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">CVE</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">CMS</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Component</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Severity</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Exploit</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.data?.results?.map((cve: any) => (
                <CveRow
                  key={cve.id}
                  cve={cve}
                  expanded={expandedCve === cve.id}
                  onToggle={() => setExpandedCve(expandedCve === cve.id ? null : cve.id)}
                  onGenerateExploit={() => {
                    setExploitTarget({
                      cveId: cve.cveId,
                      cms: cve.cms,
                      component: cve.softwareSlug,
                      vulnType: cve.vulnType,
                      title: cve.title,
                    });
                    setExploitResult(null);
                  }}
                />
              ))}
              {(!searchResults.data?.results || searchResults.data.results.length === 0) && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    {searchResults.isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading CVEs...
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Database className="w-8 h-8 text-muted-foreground/50" />
                        <span>No CVEs found</span>
                        <span className="text-xs">Try adjusting your filters or trigger a CVE update</span>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs bg-background border border-border rounded-lg hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs bg-background border border-border rounded-lg hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Exploit Generator Modal */}
      {exploitTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setExploitTarget(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Zap className="w-5 h-5 text-red-400" />
                  AI Exploit Generator
                </h3>
                <button onClick={() => setExploitTarget(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* CVE Info */}
              <div className="bg-background/50 rounded-lg p-3 mb-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">CVE:</span> <span className="font-mono">{exploitTarget.cveId}</span></div>
                  <div><span className="text-muted-foreground">CMS:</span> <span className="capitalize">{exploitTarget.cms}</span></div>
                  <div><span className="text-muted-foreground">Component:</span> {exploitTarget.component}</div>
                  <div><span className="text-muted-foreground">Type:</span> {exploitTarget.vulnType}</div>
                </div>
                <div className="mt-2"><span className="text-muted-foreground">Title:</span> {exploitTarget.title}</div>
              </div>

              {/* Target URL Input */}
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Target URL</label>
                  <input
                    type="text"
                    value={exploitTargetUrl}
                    onChange={(e) => setExploitTargetUrl(e.target.value)}
                    placeholder="https://target-site.com"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Redirect URL (goal)</label>
                  <input
                    type="text"
                    value={exploitRedirectUrl}
                    onChange={(e) => setExploitRedirectUrl(e.target.value)}
                    placeholder="https://your-redirect.com"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={() => {
                  generateExploit.mutate({
                    cveId: exploitTarget.cveId,
                    cms: exploitTarget.cms,
                    component: exploitTarget.component,
                    vulnType: exploitTarget.vulnType,
                    title: exploitTarget.title,
                    targetUrl: exploitTargetUrl || "https://target.com",
                    redirectUrl: exploitRedirectUrl || "https://redirect.com",
                  });
                }}
                disabled={generateExploit.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                {generateExploit.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating with AI...</>
                ) : (
                  <><FileCode className="w-4 h-4" /> Generate Exploit Payload</>
                )}
              </button>

              {/* Exploit Result */}
              {exploitResult && (
                <div className="mt-4 space-y-3">
                  <div className="bg-background/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Exploit Type</span>
                      <span className={`text-xs px-2 py-0.5 rounded border ${
                        exploitResult.riskLevel === "critical" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                        exploitResult.riskLevel === "high" ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
                        "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                      }`}>
                        {exploitResult.riskLevel}
                      </span>
                    </div>
                    <div className="text-sm font-medium">{exploitResult.exploitType}</div>
                  </div>

                  {/* Steps */}
                  <div className="bg-background/50 rounded-lg p-3">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Exploit Steps</div>
                    <ol className="space-y-1.5">
                      {exploitResult.exploitSteps?.map((step: string, i: number) => (
                        <li key={i} className="text-sm text-foreground/80 flex gap-2">
                          <span className="text-emerald font-mono text-xs mt-0.5">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Exploit Code */}
                  <div className="bg-background/50 rounded-lg p-3">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Exploit Code</div>
                    <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-black/30 rounded-lg p-3 max-h-[200px] overflow-y-auto">
                      {exploitResult.exploitCode}
                    </pre>
                  </div>

                  {/* Upload Details */}
                  {exploitResult.uploadFilename && (
                    <div className="bg-background/50 rounded-lg p-3">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Upload Payload</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Filename:</span> <span className="font-mono">{exploitResult.uploadFilename}</span></div>
                        <div><span className="text-muted-foreground">Type:</span> {exploitResult.uploadContentType}</div>
                        <div className="col-span-2"><span className="text-muted-foreground">Endpoint:</span> <span className="font-mono text-xs">{exploitResult.uploadEndpoint}</span></div>
                      </div>
                      {exploitResult.uploadContent && (
                        <pre className="mt-2 text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-black/30 rounded-lg p-3 max-h-[150px] overflow-y-auto">
                          {exploitResult.uploadContent}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Success Indicator */}
                  <div className="bg-background/50 rounded-lg p-3">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Success Indicator</div>
                    <div className="text-sm">{exploitResult.successIndicator}</div>
                  </div>

                  {/* Notes */}
                  {exploitResult.notes && (
                    <div className="text-xs text-muted-foreground italic">{exploitResult.notes}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function StatCard({ label, value, icon, color }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    emerald: "bg-emerald/10 text-emerald border-emerald/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };

  return (
    <div className={`rounded-xl border p-3 ${colorClasses[color] || colorClasses.emerald}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs opacity-70">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-bold font-mono">{value.toLocaleString()}</div>
    </div>
  );
}

function CveRow({ cve, expanded, onToggle, onGenerateExploit }: {
  cve: any;
  expanded: boolean;
  onToggle: () => void;
  onGenerateExploit: () => void;
}) {
  const severity = (cve.severity || "medium") as SeverityLevel;

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-emerald">{cve.cveId || "—"}</span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs capitalize font-medium ${CMS_COLORS[cve.cms] || "text-foreground"}`}>
            {cve.cms}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-foreground/80 truncate max-w-[150px] block">{cve.softwareSlug || cve.softwareName}</span>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-foreground/80 truncate max-w-[250px] block">{cve.title}</span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded border capitalize ${SEVERITY_COLORS[severity] || ""}`}>
            {severity}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-muted-foreground">{cve.vulnType}</span>
        </td>
        <td className="px-4 py-3">
          {cve.exploitAvailable ? (
            <CheckCircle2 className="w-4 h-4 text-red-400" />
          ) : (
            <XCircle className="w-4 h-4 text-muted-foreground/30" />
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onGenerateExploit(); }}
              className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400 transition-colors"
              title="Generate Exploit"
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">CVSS Score:</span>{" "}
                <span className="font-mono">{cve.cvssScore || "N/A"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Affected:</span>{" "}
                <span className="font-mono">{cve.affectedFrom || "*"} — {cve.affectedTo || "*"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Patched:</span>{" "}
                {cve.patched ? (
                  <span className="text-emerald">{cve.patchedVersion || "Yes"}</span>
                ) : (
                  <span className="text-red-400">No</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Published:</span>{" "}
                {cve.publishedAt ? new Date(cve.publishedAt).toLocaleDateString() : "—"}
              </div>
              {cve.reference && (
                <div className="col-span-4">
                  <span className="text-muted-foreground">Reference:</span>{" "}
                  <a href={cve.reference} target="_blank" rel="noopener noreferrer" className="text-emerald hover:underline inline-flex items-center gap-1">
                    {cve.reference} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
