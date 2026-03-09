/**
 * Mass Discovery Dashboard
 * 
 * Full-featured UI for:
 *   - Mass Target Discovery (Shodan + SerpAPI + Google Dorks)
 *   - Non-WP Exploit Scanning
 *   - Auto-Pipeline (Discover → Filter → Score → Attack → Report)
 *   - Pipeline monitoring with real-time events
 */

import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Crosshair, Search, Zap, Play, Square, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, Clock, Globe, Shield, Server, Activity,
  ChevronDown, ChevronUp, ExternalLink, Loader2, Rocket, BarChart3,
} from "lucide-react";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

interface DiscoveredTarget {
  domain: string;
  url: string;
  ip?: string;
  port?: number;
  cms?: string;
  cmsVersion?: string;
  serverType?: string;
  waf?: string;
  country?: string;
  vulnScore: number;
  attackDifficulty?: string;
  hasOpenUpload?: boolean;
  hasExposedConfig?: boolean;
  hasVulnerableCms?: boolean;
  hasWeakAuth?: boolean;
  notes: string[];
  source: string;
}

// ═══════════════════════════════════════════════════════
//  DISCOVERY SEARCH TAB
// ═══════════════════════════════════════════════════════

function DiscoverySearchTab() {
  const [customQueries, setCustomQueries] = useState("");
  const [targetCms, setTargetCms] = useState("");
  const [maxResults, setMaxResults] = useState(100);
  const [minScore, setMinScore] = useState(30);
  const [useShodan, setUseShodan] = useState(true);
  const [useSerpApi, setUseSerpApi] = useState(true);
  const [results, setResults] = useState<any>(null);
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null);

  const searchMutation = trpc.discovery.search.useMutation({
    onSuccess: (data) => {
      setResults(data);
      toast.success(`Discovery Complete — Found ${data.targets?.length || 0} targets`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSearch = () => {
    searchMutation.mutate({
      keywords: customQueries ? customQueries.split("\n").filter(Boolean) : undefined,
      targetCms: targetCms ? targetCms.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      maxResults,
      minVulnScore: minScore,
      enableShodan: useShodan,
      enableSerpApi: useSerpApi,
      enableAiScoring: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Search Config */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5 text-red-500" />
            Discovery Configuration
          </CardTitle>
          <CardDescription>ค้นหาเป้าหมายอัตโนมัติจาก Shodan, SerpAPI, Google Dorks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Custom Queries (1 ต่อบรรทัด)</Label>
              <textarea
                className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-md p-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                placeholder={`vulnerable wordpress upload\nphp file upload\nindex of /uploads`}
                value={customQueries}
                onChange={(e) => setCustomQueries(e.target.value)}
              />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Target CMS (comma-separated)</Label>
                <Input
                  className="bg-zinc-800 border-zinc-700"
                  placeholder="wordpress, joomla, drupal, laravel, magento"
                  value={targetCms}
                  onChange={(e) => setTargetCms(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Results: {maxResults}</Label>
                  <Slider
                    value={[maxResults]}
                    onValueChange={([v]) => setMaxResults(v)}
                    min={10}
                    max={500}
                    step={10}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min Score: {minScore}</Label>
                  <Slider
                    value={[minScore]}
                    onValueChange={([v]) => setMinScore(v)}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={useShodan} onCheckedChange={setUseShodan} />
              <Label>Shodan</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={useSerpApi} onCheckedChange={setUseSerpApi} />
              <Label>SerpAPI</Label>
            </div>
            <div className="flex-1" />
            <Button
              onClick={handleSearch}
              disabled={searchMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {searchMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</>
              ) : (
                <><Search className="w-4 h-4 mr-2" /> Start Discovery</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-red-500" />
                Discovery Results
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline" className="border-zinc-700">
                  {results.totalRawResults || 0} raw
                </Badge>
                <Badge variant="outline" className="border-zinc-700">
                  {results.totalAfterDedup || 0} dedup
                </Badge>
                <Badge className="bg-red-600">
                  {results.targets?.length || 0} scored
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {results.targets?.map((target: DiscoveredTarget, idx: number) => (
                  <div
                    key={target.domain}
                    className="border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors"
                  >
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => setExpandedTarget(expandedTarget === target.domain ? null : target.domain)}
                    >
                      <div className="text-sm font-mono text-zinc-400 w-8">#{idx + 1}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-zinc-500" />
                          <span className="font-medium text-zinc-200">{target.domain}</span>
                          {target.cms && (
                            <Badge variant="outline" className="text-xs border-zinc-700">
                              {target.cms} {target.cmsVersion || ""}
                            </Badge>
                          )}
                          {target.waf && (
                            <Badge variant="outline" className="text-xs border-orange-800 text-orange-400">
                              <Shield className="w-3 h-3 mr-1" /> {target.waf}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {target.ip && `${target.ip}:${target.port || 80}`}
                          {target.serverType && ` • ${target.serverType}`}
                          {target.country && ` • ${target.country}`}
                          {` • Source: ${target.source}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Indicators */}
                        <div className="flex flex-wrap gap-1">
                          {target.hasOpenUpload && <Badge className="bg-red-900/50 text-red-400 text-[10px]">Upload</Badge>}
                          {target.hasExposedConfig && <Badge className="bg-orange-900/50 text-orange-400 text-[10px]">Config</Badge>}
                          {target.hasVulnerableCms && <Badge className="bg-yellow-900/50 text-yellow-400 text-[10px]">VulnCMS</Badge>}
                          {target.hasWeakAuth && <Badge className="bg-purple-900/50 text-purple-400 text-[10px]">WeakAuth</Badge>}
                        </div>
                        {/* Score */}
                        <div className={`text-lg font-bold font-mono ${
                          target.vulnScore >= 70 ? "text-red-500" :
                          target.vulnScore >= 40 ? "text-orange-500" : "text-zinc-500"
                        }`}>
                          {target.vulnScore}
                        </div>
                        {/* Difficulty */}
                        <Badge className={`text-xs ${
                          target.attackDifficulty === "easy" ? "bg-green-900/50 text-green-400" :
                          target.attackDifficulty === "medium" ? "bg-yellow-900/50 text-yellow-400" :
                          "bg-red-900/50 text-red-400"
                        }`}>
                          {target.attackDifficulty || "?"}
                        </Badge>
                        {expandedTarget === target.domain ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedTarget === target.domain && (
                      <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                        <div className="text-xs text-zinc-400">
                          <strong>URL:</strong>{" "}
                          <a href={target.url} target="_blank" rel="noopener" className="text-red-400 hover:underline">
                            {target.url} <ExternalLink className="w-3 h-3 inline" />
                          </a>
                        </div>
                        {target.notes?.length > 0 && (
                          <div className="text-xs text-zinc-400">
                            <strong>Notes:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-0.5">
                              {target.notes.map((note, i) => (
                                <li key={i} className="text-zinc-500">{note}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  AUTO-PIPELINE TAB
// ═══════════════════════════════════════════════════════

function AutoPipelineTab() {
  const [customQueries, setCustomQueries] = useState("");
  const [targetCms, setTargetCms] = useState("");
  const [maxResults, setMaxResults] = useState(50);
  const [minScore, setMinScore] = useState(40);
  const [autoAttack, setAutoAttack] = useState(false);
  const [attackThreshold, setAttackThreshold] = useState(50);
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [skipWaf, setSkipWaf] = useState(false);
  const [runNonWpScan, setRunNonWpScan] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  const startPipelineMutation = trpc.discovery.startPipeline.useMutation({
    onSuccess: (data) => {
      setActivePipelineId(data.pipelineId);
      toast.success(`Pipeline Started — ID: ${data.pipelineId}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Poll pipeline status
  const pipelineQuery = trpc.discovery.getPipeline.useQuery(
    { pipelineId: activePipelineId || "" },
    {
      enabled: !!activePipelineId,
      refetchInterval: activePipelineId ? 3000 : false,
    },
  );

  const pipelineEventsQuery = trpc.discovery.getPipelineEvents.useQuery(
    { pipelineId: activePipelineId || "", limit: 50 },
    {
      enabled: !!activePipelineId,
      refetchInterval: activePipelineId ? 2000 : false,
    },
  );

  const cancelMutation = trpc.discovery.cancelPipeline.useMutation({
    onSuccess: () => {
      toast.success("Pipeline Cancelled");
    },
  });

  const pipeline = pipelineQuery.data;
  const events = pipelineEventsQuery.data || [];
  const isRunning = !!(pipeline && !["completed", "error"].includes(pipeline.phase));

  const handleStart = () => {
    startPipelineMutation.mutate({
      keywords: customQueries ? customQueries.split("\n").filter(Boolean) : undefined,
      targetCms: targetCms ? targetCms.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      maxResults,
      minVulnScore: minScore,
      autoAttack,
      maxConcurrentAttacks: maxConcurrent,
      attackOnlyAboveScore: attackThreshold,
      skipWaf,
      runNonWpScan,
      notifyTelegram,
    });
  };

  const phaseColors: Record<string, string> = {
    idle: "text-zinc-500",
    discovering: "text-blue-400",
    filtering: "text-cyan-400",
    scoring: "text-yellow-400",
    non_wp_scanning: "text-orange-400",
    attacking: "text-red-400",
    reporting: "text-purple-400",
    completed: "text-green-400",
    error: "text-red-500",
  };

  const phaseIcons: Record<string, any> = {
    idle: Clock,
    discovering: Search,
    filtering: Activity,
    scoring: BarChart3,
    non_wp_scanning: Shield,
    attacking: Zap,
    reporting: BarChart3,
    completed: CheckCircle2,
    error: XCircle,
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Config */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Rocket className="w-5 h-5 text-red-500" />
            Auto-Pipeline Configuration
          </CardTitle>
          <CardDescription>
            Discover → Filter → Score → Non-WP Scan → Batch Attack → Report
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Custom Queries (1 ต่อบรรทัด)</Label>
              <textarea
                className="w-full h-20 bg-zinc-800 border border-zinc-700 rounded-md p-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                placeholder={`vulnerable php upload\nindex of /uploads`}
                value={customQueries}
                onChange={(e) => setCustomQueries(e.target.value)}
                disabled={isRunning}
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Target CMS</Label>
                <Input
                  className="bg-zinc-800 border-zinc-700"
                  placeholder="wordpress, laravel, magento, joomla"
                  value={targetCms}
                  onChange={(e) => setTargetCms(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Max Results: {maxResults}</Label>
                  <Slider value={[maxResults]} onValueChange={([v]) => setMaxResults(v)} min={10} max={200} step={10} disabled={isRunning} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Min Score: {minScore}</Label>
                  <Slider value={[minScore]} onValueChange={([v]) => setMinScore(v)} min={0} max={100} step={5} disabled={isRunning} />
                </div>
              </div>
            </div>
          </div>

          {/* Attack Settings */}
          <div className="border border-zinc-800 rounded-lg p-3 space-y-3">
            <div className="text-sm font-medium text-zinc-300">Attack Settings</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={autoAttack} onCheckedChange={setAutoAttack} disabled={isRunning} />
                <Label className="text-xs">Auto Attack</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={runNonWpScan} onCheckedChange={setRunNonWpScan} disabled={isRunning} />
                <Label className="text-xs">Non-WP Scan</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={skipWaf} onCheckedChange={setSkipWaf} disabled={isRunning} />
                <Label className="text-xs">Skip WAF</Label>
              </div>
            </div>
            {autoAttack && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Attack Threshold: {attackThreshold}</Label>
                  <Slider value={[attackThreshold]} onValueChange={([v]) => setAttackThreshold(v)} min={0} max={100} step={5} disabled={isRunning} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Concurrent: {maxConcurrent}</Label>
                  <Slider value={[maxConcurrent]} onValueChange={([v]) => setMaxConcurrent(v)} min={1} max={10} step={1} disabled={isRunning} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={notifyTelegram} onCheckedChange={setNotifyTelegram} disabled={isRunning} />
              <Label className="text-xs">Telegram Alert</Label>
            </div>
            <div className="flex-1" />
            {isRunning ? (
              <Button
                variant="destructive"
                onClick={() => activePipelineId && cancelMutation.mutate({ pipelineId: activePipelineId })}
              >
                <Square className="w-4 h-4 mr-2" /> Stop Pipeline
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={startPipelineMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {startPipelineMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" /> Launch Pipeline</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Status */}
      {pipeline && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { label: "Discovered", value: pipeline.stats.totalDiscovered, icon: Search, color: "text-blue-400" },
              { label: "Scored", value: pipeline.stats.totalScored, icon: BarChart3, color: "text-yellow-400" },
              { label: "Non-WP Scanned", value: pipeline.stats.totalNonWpScanned, icon: Shield, color: "text-orange-400" },
              { label: "Attacked", value: pipeline.stats.totalAttacked, icon: Zap, color: "text-red-400" },
              { label: "Avg Score", value: pipeline.stats.avgVulnScore, icon: Activity, color: "text-green-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="border-zinc-800 bg-zinc-900/50">
                <CardContent className="p-3 flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <div>
                    <div className="text-xl font-bold font-mono">{value}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Phase + Events */}
          <div className="grid grid-cols-2 gap-4">
            {/* Current Phase */}
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Pipeline Phase</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {(() => {
                    const PhaseIcon = phaseIcons[pipeline.phase] || Clock;
                    return <PhaseIcon className={`w-6 h-6 ${phaseColors[pipeline.phase] || "text-zinc-500"}`} />;
                  })()}
                  <div>
                    <div className={`text-lg font-bold uppercase ${phaseColors[pipeline.phase] || "text-zinc-500"}`}>
                      {pipeline.phase.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {pipeline.stats.durationMs > 0
                        ? `Duration: ${Math.round(pipeline.stats.durationMs / 1000)}s`
                        : `Running for ${Math.round((Date.now() - pipeline.startedAt) / 1000)}s`}
                    </div>
                  </div>
                </div>

                {/* CMS Distribution */}
                {Object.keys(pipeline.stats.topCms || {}).length > 0 && (
                  <div className="mt-4 space-y-1">
                    <div className="text-xs text-zinc-500 font-medium">CMS Distribution</div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(pipeline.stats.topCms).map(([cms, count]) => (
                        <Badge key={cms} variant="outline" className="text-xs border-zinc-700">
                          {cms}: {count as number}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Report */}
                {pipeline.aiReport && (
                  <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="text-xs text-zinc-500 font-medium mb-1">AI Report</div>
                    <div className="text-sm text-zinc-300 whitespace-pre-wrap">{pipeline.aiReport}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Events Log */}
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Events Log</CardTitle>
                  <Badge variant="outline" className="text-xs border-zinc-700">{events.length} events</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-1 font-mono text-xs">
                    {[...events].reverse().map((evt: any) => (
                      <div key={evt.id} className="flex gap-2 py-1 border-b border-zinc-800/50">
                        <span className="text-zinc-600 shrink-0">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`shrink-0 ${phaseColors[evt.phase] || "text-zinc-500"}`}>
                          [{evt.phase}]
                        </span>
                        <span className="text-zinc-400 break-all">{evt.detail}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Targets Table */}
          {pipeline.targets && pipeline.targets.length > 0 && (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Discovered Targets ({pipeline.targets.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="text-xs text-zinc-500 border-b border-zinc-800">
                      <tr>
                        <th className="text-left py-2 px-2">#</th>
                        <th className="text-left py-2 px-2">Domain</th>
                        <th className="text-left py-2 px-2">CMS</th>
                        <th className="text-left py-2 px-2">Server</th>
                        <th className="text-left py-2 px-2">WAF</th>
                        <th className="text-left py-2 px-2">Indicators</th>
                        <th className="text-right py-2 px-2">Score</th>
                        <th className="text-center py-2 px-2">Difficulty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipeline.targets.map((t: any, idx: number) => (
                        <tr key={t.domain} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="py-2 px-2 text-zinc-500 font-mono">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <a href={t.url} target="_blank" rel="noopener" className="text-zinc-200 hover:text-red-400">
                              {t.domain}
                            </a>
                          </td>
                          <td className="py-2 px-2 text-zinc-400">{t.cms || "-"}</td>
                          <td className="py-2 px-2 text-zinc-500 text-xs">{t.serverType || "-"}</td>
                          <td className="py-2 px-2">
                            {t.waf ? (
                              <Badge variant="outline" className="text-[10px] border-orange-800 text-orange-400">{t.waf}</Badge>
                            ) : (
                              <span className="text-zinc-600">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex gap-1">
                              {t.hasOpenUpload && <Badge className="bg-red-900/50 text-red-400 text-[9px] px-1">UPL</Badge>}
                              {t.hasExposedConfig && <Badge className="bg-orange-900/50 text-orange-400 text-[9px] px-1">CFG</Badge>}
                              {t.hasVulnerableCms && <Badge className="bg-yellow-900/50 text-yellow-400 text-[9px] px-1">CMS</Badge>}
                              {t.hasWeakAuth && <Badge className="bg-purple-900/50 text-purple-400 text-[9px] px-1">AUTH</Badge>}
                            </div>
                          </td>
                          <td className={`py-2 px-2 text-right font-mono font-bold ${
                            t.vulnScore >= 70 ? "text-red-500" :
                            t.vulnScore >= 40 ? "text-orange-500" : "text-zinc-500"
                          }`}>
                            {t.vulnScore}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <Badge className={`text-[10px] ${
                              t.attackDifficulty === "easy" ? "bg-green-900/50 text-green-400" :
                              t.attackDifficulty === "medium" ? "bg-yellow-900/50 text-yellow-400" :
                              "bg-red-900/50 text-red-400"
                            }`}>
                              {t.attackDifficulty || "?"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  PIPELINE HISTORY TAB
// ═══════════════════════════════════════════════════════

function PipelineHistoryTab() {
  const pipelinesQuery = trpc.discovery.getActivePipelines.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const pipelines = pipelinesQuery.data || [];

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-zinc-400" />
            Pipeline History
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => pipelinesQuery.refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pipelines.length === 0 ? (
          <div className="text-center text-zinc-500 py-8">No pipelines yet</div>
        ) : (
          <div className="space-y-2">
            {pipelines.map((p: any) => (
              <div key={p.id} className="flex items-center gap-4 p-3 border border-zinc-800 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${
                  p.phase === "completed" ? "bg-green-500" :
                  p.phase === "error" ? "bg-red-500" : "bg-yellow-500 animate-pulse"
                }`} />
                <div className="flex-1">
                  <div className="font-mono text-sm text-zinc-300">{p.id}</div>
                  <div className="text-xs text-zinc-500">
                    {new Date(p.startedAt).toLocaleString()} • {p.totalTargets} targets • {p.totalAttacked} attacked
                  </div>
                </div>
                <Badge className={`text-xs ${
                  p.phase === "completed" ? "bg-green-900/50 text-green-400" :
                  p.phase === "error" ? "bg-red-900/50 text-red-400" :
                  "bg-yellow-900/50 text-yellow-400"
                }`}>
                  {p.phase}
                </Badge>
                <div className="text-xs text-zinc-500 font-mono">
                  {p.durationMs > 0 ? `${Math.round(p.durationMs / 1000)}s` : "..."}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function MassDiscovery() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-red-500" />
          </div>
          Mass Target Discovery
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          ค้นหาเป้าหมายอัตโนมัติจาก Shodan + SerpAPI + Google Dorks → กรอง → ให้คะแนน → โจมตี → รายงาน
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="pipeline" className="data-[state=active]:bg-red-600">
            <Rocket className="w-4 h-4 mr-2" /> Auto-Pipeline
          </TabsTrigger>
          <TabsTrigger value="search" className="data-[state=active]:bg-red-600">
            <Search className="w-4 h-4 mr-2" /> Discovery Search
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-red-600">
            <Clock className="w-4 h-4 mr-2" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <AutoPipelineTab />
        </TabsContent>

        <TabsContent value="search">
          <DiscoverySearchTab />
        </TabsContent>

        <TabsContent value="history">
          <PipelineHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
