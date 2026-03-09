import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  TrendingUp, TrendingDown, Minus, Search, Target,
  Loader2, Trash2, RefreshCw, Plus, BarChart3,
  Globe, CheckCircle2, XCircle, AlertTriangle,
  ArrowUp, ArrowDown, Eye, Clock, Zap,
  ChevronDown, ChevronUp, ExternalLink, Activity,
} from "lucide-react";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  tracking: { color: "text-gray-400", bg: "bg-gray-500/10", label: "Tracking" },
  indexed: { color: "text-blue-400", bg: "bg-blue-500/10", label: "Indexed" },
  ranked: { color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Ranked" },
  top10: { color: "text-green-400", bg: "bg-green-500/10", label: "Top 10" },
  top3: { color: "text-emerald", bg: "bg-emerald/10", label: "Top 3" },
  lost: { color: "text-red-400", bg: "bg-red-500/10", label: "Lost" },
  deindexed: { color: "text-red-500", bg: "bg-red-500/10", label: "Deindexed" },
};

const TREND_ICONS: Record<string, { icon: typeof TrendingUp; color: string }> = {
  rising: { icon: TrendingUp, color: "text-green-400" },
  falling: { icon: TrendingDown, color: "text-red-400" },
  stable: { icon: Minus, color: "text-yellow-400" },
  new: { icon: Zap, color: "text-blue-400" },
  lost: { icon: XCircle, color: "text-red-500" },
};

export default function KeywordRanking() {
  const [activeTab, setActiveTab] = useState("keywords");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [sortBy, setSortBy] = useState<string>("created");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Add keyword form
  const [addKeyword, setAddKeyword] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addDomain, setAddDomain] = useState("");
  const [addRedirectUrl, setAddRedirectUrl] = useState("");
  const [addEngine, setAddEngine] = useState("google");
  const [addCountry, setAddCountry] = useState("TH");
  const [addDevice, setAddDevice] = useState<"desktop" | "mobile">("desktop");
  const [bulkKeywords, setBulkKeywords] = useState("");

  const limit = 50;

  // Queries
  const keywordsQuery = trpc.keywordRanking.list.useQuery({
    limit,
    offset: page * limit,
    status: statusFilter === "all" ? undefined : statusFilter as any,
    keyword: keywordFilter || undefined,
    domain: domainFilter || undefined,
    sortBy: sortBy as any,
  });

  const summaryQuery = trpc.keywordRanking.summary.useQuery();

  const addKeywordsMut = trpc.keywordRanking.addKeywords.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} keywords added for tracking`);
      keywordsQuery.refetch();
      summaryQuery.refetch();
      setShowAddDialog(false);
      resetAddForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const checkRankingMut = trpc.keywordRanking.checkRanking.useMutation({
    onSuccess: (data) => {
      const posText = data.position ? `#${data.position}` : "Not ranked";
      toast.success(`${data.keyword}: ${posText} (${data.status})`);
      keywordsQuery.refetch();
      summaryQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const batchCheckMut = trpc.keywordRanking.batchCheck.useMutation({
    onSuccess: (data) => {
      toast.success(`Checked ${data.checked} keywords`);
      keywordsQuery.refetch();
      summaryQuery.refetch();
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.keywordRanking.delete.useMutation({
    onSuccess: () => {
      toast.success("Keyword removed");
      keywordsQuery.refetch();
      summaryQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = Math.ceil((keywordsQuery.data?.total || 0) / limit);

  function resetAddForm() {
    setAddKeyword(""); setAddUrl(""); setAddDomain("");
    setAddRedirectUrl(""); setBulkKeywords("");
    setAddEngine("google"); setAddCountry("TH"); setAddDevice("desktop");
  }

  function handleAddKeywords() {
    const keywords: { keyword: string; parasitePageUrl: string; targetDomain: string; redirectUrl?: string; searchEngine: string; country: string; device: "desktop" | "mobile" }[] = [];

    if (bulkKeywords.trim()) {
      // Bulk mode: one keyword per line
      const lines = bulkKeywords.split("\n").map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        keywords.push({
          keyword: line,
          parasitePageUrl: addUrl,
          targetDomain: addDomain,
          redirectUrl: addRedirectUrl || undefined,
          searchEngine: addEngine,
          country: addCountry,
          device: addDevice,
        });
      }
    } else if (addKeyword.trim()) {
      keywords.push({
        keyword: addKeyword.trim(),
        parasitePageUrl: addUrl,
        targetDomain: addDomain,
        redirectUrl: addRedirectUrl || undefined,
        searchEngine: addEngine,
        country: addCountry,
        device: addDevice,
      });
    }

    if (keywords.length === 0) {
      toast.error("Please enter at least one keyword");
      return;
    }

    addKeywordsMut.mutate({ keywords });
  }

  function handleBatchCheck() {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    batchCheckMut.mutate({ ids, limit: 20 });
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            <Target className="w-6 h-6 text-cyan-400" />
            Keyword Ranking Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ติดตามอันดับ Keywords ของ Parasite Pages — ตรวจสอบ Indexing + Ranking
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={batchCheckMut.isPending}
            onClick={handleBatchCheck}
          >
            {batchCheckMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            {selectedIds.size > 0 ? `Check ${selectedIds.size} Selected` : "Check All"}
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700">
                <Plus className="w-4 h-4 mr-1" /> Add Keywords
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Keywords to Track</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Parasite Page URL</Label>
                  <Input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://target.com/page.html" className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Target Domain</Label>
                  <Input value={addDomain} onChange={e => setAddDomain(e.target.value)} placeholder="target.com" className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Redirect URL (optional)</Label>
                  <Input value={addRedirectUrl} onChange={e => setAddRedirectUrl(e.target.value)} placeholder="https://your-site.com" className="mt-1 text-xs" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Search Engine</Label>
                    <Select value={addEngine} onValueChange={setAddEngine}>
                      <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="bing">Bing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Select value={addCountry} onValueChange={setAddCountry}>
                      <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TH">Thailand</SelectItem>
                        <SelectItem value="US">USA</SelectItem>
                        <SelectItem value="UK">UK</SelectItem>
                        <SelectItem value="JP">Japan</SelectItem>
                        <SelectItem value="KR">Korea</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Device</Label>
                    <Select value={addDevice} onValueChange={v => setAddDevice(v as any)}>
                      <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desktop">Desktop</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Single Keyword</Label>
                  <Input value={addKeyword} onChange={e => setAddKeyword(e.target.value)} placeholder="สล็อตออนไลน์" className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Bulk Keywords (one per line)</Label>
                  <Textarea value={bulkKeywords} onChange={e => setBulkKeywords(e.target.value)} placeholder={"สล็อต\nเว็บสล็อต\nสล็อตออนไลน์"} className="mt-1 text-xs min-h-[100px]" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button
                  className="bg-cyan-600 hover:bg-cyan-700"
                  disabled={(!addKeyword.trim() && !bulkKeywords.trim()) || !addUrl || !addDomain || addKeywordsMut.isPending}
                  onClick={handleAddKeywords}
                >
                  {addKeywordsMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryQuery.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { label: "Total", value: summaryQuery.data.totalTracking, color: "text-foreground" },
            { label: "Indexed", value: summaryQuery.data.indexed, color: "text-blue-400" },
            { label: "Ranked", value: summaryQuery.data.ranked, color: "text-yellow-400" },
            { label: "Top 10", value: summaryQuery.data.top10, color: "text-green-400" },
            { label: "Top 3", value: summaryQuery.data.top3, color: "text-emerald" },
            { label: "Lost", value: summaryQuery.data.lost, color: "text-red-400" },
            { label: "Avg Pos", value: summaryQuery.data.avgPosition || "-", color: "text-cyan-400" },
            { label: "Best", value: summaryQuery.data.bestKeyword ? `#${summaryQuery.data.bestKeyword.position}` : "-", color: "text-emerald" },
          ].map((s, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-3 text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Best Keyword Highlight */}
      {summaryQuery.data?.bestKeyword && (
        <Card className="bg-emerald/5 border-emerald/20">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald" />
            </div>
            <div>
              <div className="text-sm font-semibold">Best Keyword: <span className="text-emerald">{summaryQuery.data.bestKeyword.keyword}</span></div>
              <div className="text-xs text-muted-foreground">
                Position #{summaryQuery.data.bestKeyword.position} — <a href={summaryQuery.data.bestKeyword.url} target="_blank" className="text-cyan-400 hover:underline">{summaryQuery.data.bestKeyword.url}</a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter by keyword..."
            value={keywordFilter}
            onChange={(e) => { setKeywordFilter(e.target.value); setPage(0); }}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Input
          placeholder="Filter by domain..."
          value={domainFilter}
          onChange={(e) => { setDomainFilter(e.target.value); setPage(0); }}
          className="w-full sm:w-[180px] bg-card border-border"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[140px] bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[140px] bg-card border-border">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created">Newest</SelectItem>
            <SelectItem value="position">Position</SelectItem>
            <SelectItem value="keyword">Keyword</SelectItem>
            <SelectItem value="lastChecked">Last Checked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {keywordsQuery.data?.total ?? 0} keywords tracked
        {selectedIds.size > 0 && ` — ${selectedIds.size} selected`}
        {totalPages > 1 && ` — Page ${page + 1} of ${totalPages}`}
      </div>

      {/* Keywords List */}
      {keywordsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !keywordsQuery.data?.items.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">ยังไม่มี Keywords ที่ติดตาม</p>
            <p className="text-xs text-muted-foreground/60 mt-1">กด "Add Keywords" เพื่อเริ่มติดตามอันดับ</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {keywordsQuery.data.items.map((kw) => {
            const sc = STATUS_CONFIG[kw.status] || STATUS_CONFIG.tracking;
            const trend = TREND_ICONS[kw.trend || "new"] || TREND_ICONS.new;
            const TrendIcon = trend.icon;
            const isExpanded = expandedId === kw.id;
            const isSelected = selectedIds.has(kw.id);

            return (
              <Card key={kw.id} className={`bg-card border-border transition-all ${isSelected ? "ring-1 ring-cyan-500/30" : ""} ${isExpanded ? "ring-1 ring-cyan-500/20" : ""}`}>
                <div className="p-3 flex items-center gap-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(kw.id)}
                    className="w-4 h-4 rounded border-border accent-cyan-500"
                  />

                  {/* Position */}
                  <div className="w-12 text-center shrink-0">
                    {kw.position ? (
                      <div className={`text-lg font-bold ${kw.position <= 3 ? "text-emerald" : kw.position <= 10 ? "text-green-400" : kw.position <= 30 ? "text-yellow-400" : "text-muted-foreground"}`}>
                        #{kw.position}
                      </div>
                    ) : (
                      <div className="text-lg font-bold text-muted-foreground/30">—</div>
                    )}
                    {kw.positionChange !== null && kw.positionChange !== undefined && kw.positionChange !== 0 && (
                      <div className={`text-[10px] flex items-center justify-center gap-0.5 ${kw.positionChange > 0 ? "text-green-400" : "text-red-400"}`}>
                        {kw.positionChange > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                        {Math.abs(kw.positionChange)}
                      </div>
                    )}
                  </div>

                  {/* Keyword Info */}
                  <div className="flex-1 min-w-0" onClick={() => setExpandedId(isExpanded ? null : kw.id)} style={{ cursor: "pointer" }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{kw.keyword}</span>
                      <Badge variant="outline" className={`text-[9px] ${sc.color} border-current/30`}>{sc.label}</Badge>
                      <TrendIcon className={`w-3 h-3 ${trend.color}`} />
                      {kw.isIndexed && <Badge variant="outline" className="text-[9px] text-blue-400 border-blue-400/30">Indexed</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="truncate max-w-[200px]">{kw.targetDomain}</span>
                      <span>•</span>
                      <span>{kw.searchEngine} {kw.country}</span>
                      <span>•</span>
                      <span>{kw.device}</span>
                      {kw.lastCheckedAt && <><span>•</span><span>Checked: {formatDate(kw.lastCheckedAt)}</span></>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                      disabled={checkRankingMut.isPending}
                      onClick={() => checkRankingMut.mutate({ id: kw.id })}
                      title="Check ranking"
                    >
                      {checkRankingMut.isPending && checkRankingMut.variables?.id === kw.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <a href={kw.parasitePageUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Open page">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => deleteMut.mutate({ id: kw.id })}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border pt-2 space-y-2 ml-7">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-muted/30 rounded p-2">
                        <div className="text-muted-foreground">Best Position</div>
                        <div className="font-bold text-emerald">{kw.bestPosition ? `#${kw.bestPosition}` : "-"}</div>
                      </div>
                      <div className="bg-muted/30 rounded p-2">
                        <div className="text-muted-foreground">Previous</div>
                        <div className="font-bold">{kw.previousPosition ? `#${kw.previousPosition}` : "-"}</div>
                      </div>
                      <div className="bg-muted/30 rounded p-2">
                        <div className="text-muted-foreground">Check Count</div>
                        <div className="font-bold">{kw.checkCount}</div>
                      </div>
                      <div className="bg-muted/30 rounded p-2">
                        <div className="text-muted-foreground">Indexed At</div>
                        <div className="font-bold text-[10px]">{formatDate(kw.indexedAt)}</div>
                      </div>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">Page URL:</span><a href={kw.parasitePageUrl} target="_blank" className="text-cyan-400 truncate hover:underline">{kw.parasitePageUrl}</a></div>
                      {kw.redirectUrl && <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">Redirect:</span><a href={kw.redirectUrl} target="_blank" className="text-emerald truncate hover:underline">{kw.redirectUrl}</a></div>}
                      {kw.serpSnippet && <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">SERP:</span><span className="text-muted-foreground">{kw.serpSnippet}</span></div>}
                      {kw.aiInsight && <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">AI Insight:</span><span className="text-purple-400">{kw.aiInsight}</span></div>}
                    </div>
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
    </div>
  );
}
