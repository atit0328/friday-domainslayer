/**
 * Keyword Discovery — SerpAPI Lottery Keyword Target Finder
 * 
 * Features:
 *   - Stats overview (keywords, targets, API credits, search runs)
 *   - Run keyword discovery (search SerpAPI for lottery keywords)
 *   - View discovered targets with status filters
 *   - Manage keywords (add/remove/toggle)
 *   - View search run history
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  KeyRound, Search, Target, Play, Loader2, Globe, CheckCircle2, XCircle,
  AlertTriangle, Clock, Trash2, Plus, RefreshCw, Crosshair, BarChart3,
  Zap, Database, Eye, Ban, SkipForward,
} from "lucide-react";
import { toast } from "sonner";

// ─── Status badge colors ───
function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
    discovered: { variant: "secondary", icon: Eye },
    queued: { variant: "outline", icon: Clock },
    scanning: { variant: "outline", icon: Loader2 },
    attacking: { variant: "default", icon: Zap },
    success: { variant: "default", icon: CheckCircle2 },
    failed: { variant: "destructive", icon: XCircle },
    blacklisted: { variant: "destructive", icon: Ban },
    skipped: { variant: "secondary", icon: SkipForward },
  };
  const s = map[status] || { variant: "secondary" as const, icon: Globe };
  const Icon = s.icon;
  return (
    <Badge variant={s.variant} className="gap-1 text-xs">
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

export default function KeywordDiscovery() {
  const [activeTab, setActiveTab] = useState("overview");
  const [isRunning, setIsRunning] = useState(false);
  const [maxKeywords, setMaxKeywords] = useState(20);
  const [newKeywords, setNewKeywords] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [targetPage, setTargetPage] = useState(1);
  const [keywordPage, setKeywordPage] = useState(1);

  const utils = trpc.useUtils();

  // ─── Queries ───
  const stats = trpc.keywordDiscovery.getStats.useQuery(undefined, { refetchInterval: 15000 });
  const keywords = trpc.keywordDiscovery.getKeywords.useQuery({ page: keywordPage, limit: 100 });
  const targets = trpc.keywordDiscovery.getTargets.useQuery({ page: targetPage, limit: 50, status: statusFilter });
  const searchRuns = trpc.keywordDiscovery.getSearchRuns.useQuery({ limit: 20 });

  // ─── Mutations ───
  const runDiscovery = trpc.keywordDiscovery.runDiscovery.useMutation({
    onSuccess: (data) => {
      setIsRunning(false);
      toast.success(`Discovery complete! Found ${data.newTargetsAdded} new targets from ${data.keywordsSearched} keywords`);
      utils.keywordDiscovery.getStats.invalidate();
      utils.keywordDiscovery.getTargets.invalidate();
      utils.keywordDiscovery.getSearchRuns.invalidate();
      utils.keywordDiscovery.getKeywords.invalidate();
    },
    onError: (err) => {
      setIsRunning(false);
      toast.error(`Discovery failed: ${err.message}`);
    },
  });

  const addKeywordsMut = trpc.keywordDiscovery.addKeywords.useMutation({
    onSuccess: (data) => {
      toast.success(`Added ${data.added} keywords (${data.duplicates} duplicates skipped)`);
      setNewKeywords("");
      utils.keywordDiscovery.getKeywords.invalidate();
      utils.keywordDiscovery.getStats.invalidate();
    },
  });

  const removeKeywordMut = trpc.keywordDiscovery.removeKeyword.useMutation({
    onSuccess: () => {
      toast.success("Keyword removed");
      utils.keywordDiscovery.getKeywords.invalidate();
      utils.keywordDiscovery.getStats.invalidate();
    },
  });

  const toggleKeywordMut = trpc.keywordDiscovery.toggleKeyword.useMutation({
    onSuccess: () => {
      utils.keywordDiscovery.getKeywords.invalidate();
      utils.keywordDiscovery.getStats.invalidate();
    },
  });

  const seedDefaultsMut = trpc.keywordDiscovery.seedDefaults.useMutation({
    onSuccess: (data) => {
      toast.success(`Seeded ${data.added} default keywords (${data.existing} already existed)`);
      utils.keywordDiscovery.getKeywords.invalidate();
      utils.keywordDiscovery.getStats.invalidate();
    },
  });

  const markQueuedMut = trpc.keywordDiscovery.markQueued.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} targets queued for attack`);
      utils.keywordDiscovery.getTargets.invalidate();
      utils.keywordDiscovery.getStats.invalidate();
    },
  });

  const handleRunDiscovery = () => {
    setIsRunning(true);
    runDiscovery.mutate({ maxKeywords });
  };

  const handleAddKeywords = () => {
    const kws = newKeywords.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
    if (kws.length === 0) {
      toast.error("Enter at least one keyword");
      return;
    }
    addKeywordsMut.mutate({ keywords: kws, category: "lottery" });
  };

  const s = stats.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-amber-500" />
            Keyword Target Discovery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ค้นหาเว็บเป้าหมายจาก SerpAPI ด้วย keywords หวยออนไลน์
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              utils.keywordDiscovery.getStats.invalidate();
              utils.keywordDiscovery.getTargets.invalidate();
              utils.keywordDiscovery.getKeywords.invalidate();
              utils.keywordDiscovery.getSearchRuns.invalidate();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            onClick={handleRunDiscovery}
            disabled={isRunning}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            {isRunning ? "Running..." : "Run Discovery"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Keywords</div>
            <div className="text-2xl font-bold">{s?.totalKeywords ?? 0}</div>
            <div className="text-xs text-green-500">{s?.activeKeywords ?? 0} active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Targets Found</div>
            <div className="text-2xl font-bold">{s?.totalTargets ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Discovered</div>
            <div className="text-2xl font-bold text-blue-500">{s?.targetsByStatus?.discovered ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Success</div>
            <div className="text-2xl font-bold text-green-500">{s?.targetsByStatus?.success ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Search Runs</div>
            <div className="text-2xl font-bold">{s?.totalSearchRuns ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">SerpAPI Credits</div>
            <div className="text-2xl font-bold text-amber-500">{s?.serpApiRemaining ?? "N/A"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="gap-1"><Target className="h-3.5 w-3.5" />Targets</TabsTrigger>
          <TabsTrigger value="keywords" className="gap-1"><KeyRound className="h-3.5 w-3.5" />Keywords</TabsTrigger>
          <TabsTrigger value="runs" className="gap-1"><BarChart3 className="h-3.5 w-3.5" />Search Runs</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Zap className="h-3.5 w-3.5" />Run Settings</TabsTrigger>
        </TabsList>

        {/* ─── Targets Tab ─── */}
        <TabsContent value="overview" className="space-y-4">
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {["all", "discovered", "queued", "attacking", "success", "failed", "blacklisted", "skipped"].map(st => (
              <Button
                key={st}
                variant={statusFilter === (st === "all" ? undefined : st) ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter(st === "all" ? undefined : st);
                  setTargetPage(1);
                }}
              >
                {st === "all" ? "All" : st}
                {st !== "all" && s?.targetsByStatus?.[st] != null && (
                  <span className="ml-1 text-xs opacity-70">({s.targetsByStatus[st]})</span>
                )}
              </Button>
            ))}
          </div>

          {/* Queue discovered targets for attack */}
          {statusFilter === "discovered" && (targets.data?.targets?.length ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500 text-amber-500 hover:bg-amber-500/10"
              onClick={() => {
                const ids = targets.data?.targets?.map(t => t.id) ?? [];
                if (ids.length > 0) markQueuedMut.mutate({ targetIds: ids });
              }}
            >
              <Crosshair className="h-4 w-4 mr-1" />
              Queue All {targets.data?.targets?.length} for Attack
            </Button>
          )}

          {/* Targets table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Domain</th>
                      <th className="text-left p-3 font-medium">Keyword</th>
                      <th className="text-center p-3 font-medium">SERP #</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">CMS</th>
                      <th className="text-left p-3 font-medium">Discovered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.data?.targets?.map(t => (
                      <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-mono text-xs">
                            {t.domain}
                          </a>
                          {t.title && <div className="text-xs text-muted-foreground truncate max-w-[300px]">{t.title}</div>}
                        </td>
                        <td className="p-3 text-xs">{t.keyword}</td>
                        <td className="p-3 text-center">
                          {t.serpPosition != null ? (
                            <Badge variant="outline" className="text-xs">{t.serpPosition}</Badge>
                          ) : "-"}
                        </td>
                        <td className="p-3 text-center">{statusBadge(t.status)}</td>
                        <td className="p-3 text-xs text-muted-foreground">{t.cms || "-"}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(t.discoveredAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                        </td>
                      </tr>
                    ))}
                    {(!targets.data?.targets || targets.data.targets.length === 0) && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          {targets.isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                          ) : (
                            <div>
                              <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              <p>No targets found. Run keyword discovery to find targets.</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {(targets.data?.totalPages ?? 0) > 1 && (
                <div className="flex items-center justify-between p-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Page {targets.data?.page} of {targets.data?.totalPages} ({targets.data?.total} total)
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={targetPage <= 1} onClick={() => setTargetPage(p => p - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={targetPage >= (targets.data?.totalPages ?? 1)} onClick={() => setTargetPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Keywords Tab ─── */}
        <TabsContent value="keywords" className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Textarea
                placeholder="Enter keywords (one per line or comma-separated)&#10;เช่น: หวยออนไลน์, ตรวจหวย, หวยลาว"
                value={newKeywords}
                onChange={e => setNewKeywords(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Button onClick={handleAddKeywords} disabled={addKeywordsMut.isPending} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedDefaultsMut.mutate()}
                disabled={seedDefaultsMut.isPending}
              >
                <Database className="h-4 w-4 mr-1" />
                Seed Defaults
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Keyword</th>
                      <th className="text-center p-3 font-medium">Category</th>
                      <th className="text-center p-3 font-medium">Searches</th>
                      <th className="text-center p-3 font-medium">Targets Found</th>
                      <th className="text-left p-3 font-medium">Last Searched</th>
                      <th className="text-center p-3 font-medium">Active</th>
                      <th className="text-center p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.data?.keywords?.map(kw => (
                      <tr key={kw.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono text-xs">{kw.keyword}</td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="text-xs">{kw.category}</Badge>
                        </td>
                        <td className="p-3 text-center">{kw.totalSearches}</td>
                        <td className="p-3 text-center">{kw.totalTargetsFound}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {kw.lastSearchedAt ? new Date(kw.lastSearchedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "Never"}
                        </td>
                        <td className="p-3 text-center">
                          <Switch
                            checked={kw.isActive}
                            onCheckedChange={(checked) => toggleKeywordMut.mutate({ id: kw.id, isActive: checked })}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => removeKeywordMut.mutate({ id: kw.id })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(!keywords.data?.keywords || keywords.data.keywords.length === 0) && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          {keywords.isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                          ) : (
                            <div>
                              <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              <p>No keywords yet. Click "Seed Defaults" to add 100+ lottery keywords.</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {(keywords.data?.total ?? 0) > 100 && (
                <div className="flex items-center justify-between p-3 border-t">
                  <span className="text-xs text-muted-foreground">{keywords.data?.total} total keywords</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={keywordPage <= 1} onClick={() => setKeywordPage(p => p - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" onClick={() => setKeywordPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Search Runs Tab ─── */}
        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Run #</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-center p-3 font-medium">Keywords</th>
                      <th className="text-center p-3 font-medium">Domains Found</th>
                      <th className="text-center p-3 font-medium">New Targets</th>
                      <th className="text-left p-3 font-medium">Triggered By</th>
                      <th className="text-left p-3 font-medium">Started</th>
                      <th className="text-left p-3 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchRuns.data?.map(run => (
                      <tr key={run.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono text-xs">#{run.id}</td>
                        <td className="p-3 text-center">
                          <Badge variant={run.status === "completed" ? "default" : run.status === "error" ? "destructive" : "secondary"}>
                            {run.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">{run.keywordsSearched}/{run.totalKeywords}</td>
                        <td className="p-3 text-center">{run.uniqueDomainsFound}</td>
                        <td className="p-3 text-center font-bold text-green-500">{run.newTargetsAdded}</td>
                        <td className="p-3 text-xs">{run.triggeredBy}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(run.startedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {run.completedAt ? new Date(run.completedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-"}
                        </td>
                      </tr>
                    ))}
                    {(!searchRuns.data || searchRuns.data.length === 0) && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          {searchRuns.isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                          ) : (
                            <div>
                              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              <p>No search runs yet. Click "Run Discovery" to start.</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Settings Tab ─── */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Discovery Run Settings</CardTitle>
              <CardDescription>Configure how many keywords to search per run</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium w-40">Max Keywords per Run</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={maxKeywords}
                  onChange={e => setMaxKeywords(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">
                  (1 SerpAPI credit per keyword, delay 2.5s between searches)
                </span>
              </div>

              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-medium mb-2">How it works</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Loads active keywords from database (lottery/หวย keywords)</li>
                  <li>Searches each keyword via SerpAPI (Google.co.th, Thai language)</li>
                  <li>Extracts domains from organic search results (up to 100 per keyword)</li>
                  <li>Filters: removes duplicates, blacklisted domains, own redirect URLs, major sites</li>
                  <li>Stores new targets in database with "discovered" status</li>
                  <li>Targets can be queued for attack via the Agentic Attack Engine</li>
                </ol>
              </div>

              {/* Top performing keywords */}
              {s?.topKeywords && s.topKeywords.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Top Keywords by Targets Found</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {s.topKeywords.map((kw, i) => (
                      <div key={i} className="border rounded p-2 text-xs">
                        <div className="font-mono truncate">{kw.keyword}</div>
                        <div className="text-muted-foreground">{kw.targetsFound} targets</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
