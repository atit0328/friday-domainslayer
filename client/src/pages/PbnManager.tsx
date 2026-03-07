/**
 * Design: Obsidian Intelligence — PBN Manager (Enhanced v2)
 * Full PBN Network management with 5 new features:
 * 1. Bulk Health Check — ping all sites
 * 2. Auto-Post Scheduler — AI content + WordPress posting
 * 3. Expire Alert System — domain expiration warnings
 * 4. AI Auto-Update Metrics — refresh DA/DR/PA/SS
 * 5. Hot PBN Stars — highlight best sites with star ratings
 */
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Globe, Plus, Trash2, Loader2, Send, FileText, RefreshCw, ExternalLink, Link2,
  Search, Filter, Shield, AlertTriangle, Clock, Server, ChevronDown, ChevronUp,
  BarChart3, Eye, EyeOff, Copy, CheckCircle2, XCircle, ArrowUpDown,
  Heart, Sparkles, Star, Zap, Bell, Activity, Wifi, WifiOff, TrendingUp,
  Calendar, Brain, Flame, Crown
} from "lucide-react";
import { Streamdown } from "streamdown";

const SEO_NETWORK_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663395086498/bkTTbs7mYdbRyRhP7bWyr5/seo-network-RbwvsB7fj3SVmWrbanfDeh.webp";

type SortField = "name" | "da" | "dr" | "pa" | "spamScore" | "expireDate" | "hotScore";
type SortDir = "asc" | "desc";
type MainTab = "network" | "health" | "autopost" | "expire" | "metrics" | "hot";

function getSpamColor(ss: number | null) {
  if (!ss) return "text-muted-foreground";
  if (ss <= 5) return "text-emerald-400";
  if (ss <= 15) return "text-yellow-400";
  if (ss <= 30) return "text-orange-400";
  return "text-red-400";
}

function getDaColor(da: number | null) {
  if (!da) return "text-muted-foreground";
  if (da >= 50) return "text-emerald-400";
  if (da >= 30) return "text-blue-400";
  if (da >= 15) return "text-yellow-400";
  return "text-muted-foreground";
}

function isExpiringSoon(expire: string | null) {
  if (!expire) return false;
  try {
    const d = new Date(expire);
    const diff = d.getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

function isExpired(expire: string | null) {
  if (!expire) return false;
  try { return new Date(expire) < new Date(); } catch { return false; }
}

function StarRating({ stars, size = "sm" }: { stars: number; size?: "sm" | "lg" }) {
  const s = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`${s} ${i <= stars ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function HotBadge({ stars, score }: { stars: number; score: number }) {
  if (stars >= 5) return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
      <Crown className="w-3 h-3 text-amber-400" />
      <span className="text-[9px] font-bold text-amber-400">ELITE</span>
      <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
    </div>
  );
  if (stars >= 4) return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet/20 to-purple-500/20 border border-violet/30">
      <Flame className="w-3 h-3 text-violet" />
      <span className="text-[9px] font-bold text-violet">HOT</span>
    </div>
  );
  if (stars >= 3) return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
      <Zap className="w-2.5 h-2.5 text-blue-400" />
      <span className="text-[9px] text-blue-400">GOOD</span>
    </div>
  );
  return null;
}

export default function PbnManager() {
  const [mainTab, setMainTab] = useState<MainTab>("network");
  const [newSite, setNewSite] = useState({ name: "", url: "", username: "", appPassword: "" });
  const [postForm, setPostForm] = useState({ siteId: 0, targetUrl: "", anchorText: "", keyword: "", niche: "" });
  const [postResult, setPostResult] = useState<any>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("da");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedSite, setExpandedSite] = useState<number | null>(null);
  const [showPasswords, setShowPasswords] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  // Auto-post form
  const [autoPostForm, setAutoPostForm] = useState({
    targetUrl: "", anchorText: "", keyword: "", niche: "general", count: 5,
    contentType: "article" as string,
    writingTone: "professional" as string,
  });
  const utils = trpc.useUtils();

  const { data: sites = [], isLoading } = trpc.pbn.listSites.useQuery();
  const { data: expireData } = trpc.pbn.expireAlerts.useQuery();
  const { data: hotData } = trpc.pbn.hotRanking.useQuery();

  const addSiteMutation = trpc.pbn.addSite.useMutation({
    onSuccess: () => { toast.success("PBN site added!"); setNewSite({ name: "", url: "", username: "", appPassword: "" }); setAddDialogOpen(false); utils.pbn.listSites.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteSiteMutation = trpc.pbn.deleteSite.useMutation({
    onSuccess: () => { toast.success("Site removed"); utils.pbn.listSites.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const postMutation = trpc.pbn.post.useMutation({
    onSuccess: (data: any) => { setPostResult(data); toast.success("Post generated!"); },
    onError: (err: any) => toast.error(err.message),
  });

  // New mutations
  const healthCheckMutation = trpc.pbn.healthCheck.useMutation({
    onSuccess: (data) => {
      toast.success(`Health check complete: ${data.online}/${data.total} online`);
      utils.pbn.listSites.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const singleHealthMutation = trpc.pbn.healthCheckSingle.useMutation({
    onSuccess: (data) => {
      if (data) toast.success(`${data.domain}: ${data.online ? "Online" : "Offline"} (${data.responseTimeMs}ms)`);
      utils.pbn.listSites.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const autoPostMutation = trpc.pbn.autoPost.useMutation({
    onSuccess: (data) => {
      toast.success(`Auto-post: ${data.totalPosted}/${data.totalPlanned} published`);
      utils.pbn.listSites.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const expireNotifyMutation = trpc.pbn.sendExpireNotifications.useMutation({
    onSuccess: (data) => toast.success(`Sent ${data.sent} expire notifications`),
    onError: (err: any) => toast.error(err.message),
  });

  const aiMetricsMutation = trpc.pbn.aiUpdateMetrics.useMutation({
    onSuccess: (data) => {
      toast.success(`AI updated metrics for ${data.updated}/${data.total} sites`);
      utils.pbn.listSites.invalidate();
      utils.pbn.hotRanking.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Build hot score map for quick lookup
  const hotScoreMap = useMemo(() => {
    const map = new Map<number, { stars: number; score: number; badges: string[] }>();
    if (hotData?.hotSites) {
      for (const h of hotData.hotSites) {
        map.set(h.siteId, { stars: h.stars, score: h.score, badges: h.badges });
      }
    }
    return map;
  }, [hotData]);

  // Filtered and sorted sites
  const filteredSites = useMemo(() => {
    let result = [...sites] as any[];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s: any) =>
        s.name?.toLowerCase().includes(q) || s.url?.toLowerCase().includes(q) ||
        s.hostingProvider?.toLowerCase().includes(q) || s.domainRegistrar?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") result = result.filter((s: any) => s.status === statusFilter);
    if (typeFilter === "main") result = result.filter((s: any) => !s.isBlog);
    else if (typeFilter === "blog") result = result.filter((s: any) => s.isBlog);

    result.sort((a: any, b: any) => {
      if (sortField === "hotScore") {
        const aScore = hotScoreMap.get(a.id)?.score ?? 0;
        const bScore = hotScoreMap.get(b.id)?.score ?? 0;
        return sortDir === "asc" ? aScore - bScore : bScore - aScore;
      }
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (aVal == null) aVal = sortDir === "asc" ? Infinity : -Infinity;
      if (bVal == null) bVal = sortDir === "asc" ? Infinity : -Infinity;
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return result;
  }, [sites, searchQuery, statusFilter, typeFilter, sortField, sortDir, hotScoreMap]);

  // Stats
  const stats = useMemo(() => {
    const all = sites as any[];
    const mainSites = all.filter((s: any) => !s.isBlog);
    const blogs = all.filter((s: any) => s.isBlog);
    const active = all.filter((s: any) => s.status === "active");
    const down = all.filter((s: any) => s.status === "down");
    const expiring = all.filter((s: any) => isExpiringSoon(s.expireDate));
    const expired = all.filter((s: any) => isExpired(s.expireDate));
    const avgDa = mainSites.filter((s: any) => s.da).reduce((sum: number, s: any) => sum + s.da, 0) / (mainSites.filter((s: any) => s.da).length || 1);
    const avgDr = mainSites.filter((s: any) => s.dr).reduce((sum: number, s: any) => sum + s.dr, 0) / (mainSites.filter((s: any) => s.dr).length || 1);
    const avgSs = mainSites.filter((s: any) => s.spamScore != null).reduce((sum: number, s: any) => sum + s.spamScore, 0) / (mainSites.filter((s: any) => s.spamScore != null).length || 1);
    const hot5 = hotData?.avg5Star ?? 0;
    const hot4 = hotData?.avg4Star ?? 0;
    return { total: all.length, mainSites: mainSites.length, blogs: blogs.length, active: active.length, down: down.length, expiring: expiring.length, expired: expired.length, avgDa: Math.round(avgDa), avgDr: Math.round(avgDr), avgSs: Math.round(avgSs), hot5, hot4 };
  }, [sites, hotData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const togglePassword = (id: number) => {
    setShowPasswords(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-violet rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">PBN Network Manager</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-violet/30 text-violet">{stats.total} Sites</Badge>
          {stats.hot5 > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] gap-1">
              <Crown className="w-3 h-3" /> {stats.hot5} Elite
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-violet text-white hover:bg-violet/90">
                <Plus className="w-4 h-4 mr-1" /> Add Site
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border/50">
              <DialogHeader><DialogTitle>Add PBN Site</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <Input placeholder="Site Name" value={newSite.name} onChange={e => setNewSite(p => ({ ...p, name: e.target.value }))} className="bg-muted/30 border-border/50" />
                <Input placeholder="WordPress URL (https://...)" value={newSite.url} onChange={e => setNewSite(p => ({ ...p, url: e.target.value }))} className="bg-muted/30 border-border/50 font-mono" />
                <Input placeholder="WP Username" value={newSite.username} onChange={e => setNewSite(p => ({ ...p, username: e.target.value }))} className="bg-muted/30 border-border/50" />
                <Input placeholder="WP App Password" type="password" value={newSite.appPassword} onChange={e => setNewSite(p => ({ ...p, appPassword: e.target.value }))} className="bg-muted/30 border-border/50" />
                <Button onClick={() => addSiteMutation.mutate(newSite)} disabled={addSiteMutation.isPending || !newSite.name || !newSite.url} className="w-full bg-violet text-white hover:bg-violet/90">
                  {addSiteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                  Add PBN Site
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Network Stats Banner */}
      <div className="relative rounded-xl overflow-hidden">
        <img src={SEO_NETWORK_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/70" />
        <div className="relative z-10 p-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-4">
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold font-mono text-violet">{stats.total}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Main</p>
            <p className="text-2xl font-bold font-mono">{stats.mainSites}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Blogs</p>
            <p className="text-2xl font-bold font-mono">{stats.blogs}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Online</p>
            <p className="text-2xl font-bold font-mono text-emerald-400">{stats.active}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Down</p>
            <p className={`text-2xl font-bold font-mono ${stats.down > 0 ? "text-red-400" : "text-muted-foreground"}`}>{stats.down}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Avg DA</p>
            <p className={`text-2xl font-bold font-mono ${getDaColor(stats.avgDa)}`}>{stats.avgDa}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Avg DR</p>
            <p className="text-2xl font-bold font-mono text-blue-400">{stats.avgDr}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Avg SS</p>
            <p className={`text-2xl font-bold font-mono ${getSpamColor(stats.avgSs)}`}>{stats.avgSs}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">⭐ Elite</p>
            <p className="text-2xl font-bold font-mono text-amber-400">{stats.hot5}</p>
            {stats.hot4 > 0 && <p className="text-[10px] text-violet">{stats.hot4} hot+</p>}
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
        <TabsList className="bg-muted/30 border border-border/50 h-auto flex-wrap">
          <TabsTrigger value="network" className="gap-1.5 text-xs data-[state=active]:bg-violet data-[state=active]:text-white">
            <Globe className="w-3.5 h-3.5" /> Network
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5 text-xs data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <Activity className="w-3.5 h-3.5" /> Health Check
          </TabsTrigger>
          <TabsTrigger value="autopost" className="gap-1.5 text-xs data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Send className="w-3.5 h-3.5" /> Auto-Post
          </TabsTrigger>
          <TabsTrigger value="expire" className="gap-1.5 text-xs data-[state=active]:bg-orange-600 data-[state=active]:text-white relative">
            <Bell className="w-3.5 h-3.5" /> Expire Alerts
            {(expireData?.critical ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
                {expireData?.critical}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="metrics" className="gap-1.5 text-xs data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <Brain className="w-3.5 h-3.5" /> AI Metrics
          </TabsTrigger>
          <TabsTrigger value="hot" className="gap-1.5 text-xs data-[state=active]:bg-amber-600 data-[state=active]:text-white">
            <Flame className="w-3.5 h-3.5" /> Hot PBN ⭐
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Network (original PBN manager) ═══ */}
        <TabsContent value="network" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search domains, hosting..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-muted/30 border-border/50" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] bg-muted/30 border-border/50"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="down">Down</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px] bg-muted/30 border-border/50"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="main">Main Sites</SelectItem>
                <SelectItem value="blog">Blog Subs</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              {(["hotScore", "da", "dr", "pa", "spamScore", "name"] as SortField[]).map(f => (
                <Button key={f} size="sm" variant={sortField === f ? "default" : "outline"}
                  className={`text-[10px] h-7 ${sortField === f ? (f === "hotScore" ? "bg-amber-600 text-white" : "bg-violet text-white") : ""}`}
                  onClick={() => toggleSort(f)}>
                  {f === "spamScore" ? "SS" : f === "hotScore" ? "⭐" : f.toUpperCase()}
                  {sortField === f && (sortDir === "asc" ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />)}
                </Button>
              ))}
            </div>
            <div className="flex gap-1 ml-auto">
              <Button size="sm" variant="outline" onClick={() => utils.pbn.listSites.invalidate()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{filteredSites.length} results</p>

          {/* Sites Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet" /></div>
          ) : filteredSites.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Link2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No PBN sites found</p></div>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/50">
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-center p-2 font-medium">⭐</th>
                    <th className="text-left p-2 font-medium cursor-pointer" onClick={() => toggleSort("name")}>Domain</th>
                    <th className="text-center p-2 font-medium cursor-pointer" onClick={() => toggleSort("da")}>DA</th>
                    <th className="text-center p-2 font-medium cursor-pointer" onClick={() => toggleSort("dr")}>DR</th>
                    <th className="text-center p-2 font-medium cursor-pointer" onClick={() => toggleSort("pa")}>PA</th>
                    <th className="text-center p-2 font-medium cursor-pointer" onClick={() => toggleSort("spamScore")}>SS</th>
                    <th className="text-left p-2 font-medium">Expire</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-center p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSites.map((site: any, i: number) => {
                    const hot = hotScoreMap.get(site.id);
                    return (
                      <tr key={site.id} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${site.isBlog ? "bg-muted/10" : ""} ${hot && hot.stars >= 5 ? "bg-amber-500/5" : hot && hot.stars >= 4 ? "bg-violet/5" : ""}`}>
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 text-center">
                          {hot ? <StarRating stars={hot.stars} /> : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {site.isBlog && <Badge variant="outline" className="text-[8px] px-1">BLOG</Badge>}
                            <span className="font-mono font-medium">{site.name}</span>
                            {hot && <HotBadge stars={hot.stars} score={hot.score} />}
                          </div>
                        </td>
                        <td className={`p-2 text-center font-mono font-bold ${getDaColor(site.da)}`}>{site.da ?? "—"}</td>
                        <td className="p-2 text-center font-mono font-bold text-blue-400">{site.dr ?? "—"}</td>
                        <td className="p-2 text-center font-mono">{site.pa ?? "—"}</td>
                        <td className={`p-2 text-center font-mono font-bold ${getSpamColor(site.spamScore)}`}>{site.spamScore ?? "—"}</td>
                        <td className="p-2">
                          {site.expireDate ? (
                            <span className={`font-mono ${isExpired(site.expireDate) ? "text-red-400" : isExpiringSoon(site.expireDate) ? "text-orange-400" : "text-muted-foreground"}`}>
                              {site.expireDate}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="p-2">
                          <Badge className={`text-[9px] ${site.status === "active" ? "bg-emerald-500/20 text-emerald-400" : site.status === "down" ? "bg-red-500/20 text-red-400" : site.status === "error" ? "bg-orange-500/20 text-orange-400" : "bg-muted text-muted-foreground"}`}>
                            {site.status === "active" ? "✓ Online" : site.status === "down" ? "✗ Down" : site.status}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setPostForm({ siteId: site.id, targetUrl: "", anchorText: "", keyword: "", niche: "" }); setPostResult(null); setPostDialogOpen(true); }}>
                              <Send className="w-3 h-3 text-violet" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => singleHealthMutation.mutate({ siteId: site.id })}>
                              <Activity className="w-3 h-3 text-emerald-400" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => window.open(site.url, "_blank")}>
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredSites.map((site: any) => {
                const hot = hotScoreMap.get(site.id);
                return (
                  <Card key={site.id} className={`glass-card border-border/50 hover:border-violet/20 transition-all ${hot && hot.stars >= 5 ? "border-amber-500/30 shadow-amber-500/10 shadow-lg" : hot && hot.stars >= 4 ? "border-violet/30" : ""} ${isExpired(site.expireDate) ? "border-red-500/30" : isExpiringSoon(site.expireDate) ? "border-orange-500/30" : ""}`}>
                    <CardContent className="p-4">
                      {/* Hot Badge + Star Rating */}
                      {hot && hot.stars >= 3 && (
                        <div className="flex items-center justify-between mb-2">
                          <HotBadge stars={hot.stars} score={hot.score} />
                          <div className="flex items-center gap-2">
                            <StarRating stars={hot.stars} />
                            <span className="text-[10px] font-mono text-muted-foreground">{hot.score}/100</span>
                          </div>
                        </div>
                      )}

                      {/* Site Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${hot && hot.stars >= 5 ? "bg-amber-500/10 border border-amber-500/20" : site.isBlog ? "bg-blue-500/10 border border-blue-500/20" : "bg-violet/10 border border-violet/20"}`}>
                            {hot && hot.stars >= 5 ? <Crown className="w-4 h-4 text-amber-400" /> : <Globe className={`w-4 h-4 ${site.isBlog ? "text-blue-400" : "text-violet"}`} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-semibold text-sm font-mono">{site.name}</h3>
                              {site.isBlog && <Badge variant="outline" className="text-[8px] px-1 border-blue-500/30 text-blue-400">BLOG</Badge>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge className={`text-[9px] ${site.status === "active" ? "bg-emerald-500/20 text-emerald-400" : site.status === "down" ? "bg-red-500/20 text-red-400" : site.status === "error" ? "bg-orange-500/20 text-orange-400" : "bg-muted text-muted-foreground"}`}>
                                {site.status === "active" ? "✓ Online" : site.status === "down" ? "✗ Down" : site.status}
                              </Badge>
                              {site.expireDate && (
                                <span className={`text-[10px] font-mono ${isExpired(site.expireDate) ? "text-red-400" : isExpiringSoon(site.expireDate) ? "text-orange-400" : "text-muted-foreground"}`}>
                                  {isExpired(site.expireDate) ? "⚠ EXPIRED" : isExpiringSoon(site.expireDate) ? "⚠ Expiring" : ""} {site.expireDate}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpandedSite(expandedSite === site.id ? null : site.id)}>
                          {expandedSite === site.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </div>

                      {/* SEO Metrics */}
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="bg-muted/20 rounded-md p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground">DA</p>
                          <p className={`text-sm font-bold font-mono ${getDaColor(site.da)}`}>{site.da ?? "—"}</p>
                        </div>
                        <div className="bg-muted/20 rounded-md p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground">DR</p>
                          <p className="text-sm font-bold font-mono text-blue-400">{site.dr ?? "—"}</p>
                        </div>
                        <div className="bg-muted/20 rounded-md p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground">PA</p>
                          <p className="text-sm font-bold font-mono">{site.pa ?? "—"}</p>
                        </div>
                        <div className="bg-muted/20 rounded-md p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground">SS</p>
                          <p className={`text-sm font-bold font-mono ${getSpamColor(site.spamScore)}`}>{site.spamScore ?? "—"}</p>
                        </div>
                      </div>

                      {/* Quick Info */}
                      {(site.domainAge || site.theme || site.hostingProvider) && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {site.domainAge && <Badge variant="outline" className="text-[9px] font-mono"><Clock className="w-2.5 h-2.5 mr-0.5" />{site.domainAge}</Badge>}
                          {site.theme && <Badge variant="outline" className="text-[9px]">{site.theme}</Badge>}
                          {site.hostingProvider && <Badge variant="outline" className="text-[9px]"><Server className="w-2.5 h-2.5 mr-0.5" />{site.hostingProvider}</Badge>}
                        </div>
                      )}

                      {site.banned && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-2 mb-3">
                          <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Banned: {site.banned}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]"
                          onClick={() => { setPostForm({ siteId: site.id, targetUrl: "", anchorText: "", keyword: "", niche: "" }); setPostResult(null); setPostDialogOpen(true); }}>
                          <Send className="w-3 h-3 mr-1 text-violet" /> AI Post
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Health Check"
                          onClick={() => singleHealthMutation.mutate({ siteId: site.id })}>
                          <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(site.url, "_blank")}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteSiteMutation.mutate({ id: site.id })}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>

                      {/* Expanded Details */}
                      {expandedSite === site.id && (
                        <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Credentials & Hosting</p>
                          <div className="bg-muted/20 rounded-md p-2 space-y-1.5">
                            <p className="text-[9px] text-violet font-medium">WordPress Backend</p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">{site.url}/wp-admin</span>
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyToClipboard(site.url + "/wp-admin")}><Copy className="w-2.5 h-2.5" /></Button>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <p className="text-[8px] text-muted-foreground">User</p>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-mono truncate">{site.username}</span>
                                  <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => copyToClipboard(site.username)}><Copy className="w-2 h-2" /></Button>
                                </div>
                              </div>
                              <div>
                                <p className="text-[8px] text-muted-foreground">Pass</p>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-mono truncate">{showPasswords.has(site.id) ? site.appPassword : "••••••••"}</span>
                                  <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => togglePassword(site.id)}>
                                    {showPasswords.has(site.id) ? <EyeOff className="w-2 h-2" /> : <Eye className="w-2 h-2" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => copyToClipboard(site.appPassword)}><Copy className="w-2 h-2" /></Button>
                                </div>
                              </div>
                            </div>
                          </div>
                          {(site.hostingProvider || site.hostingEmail) && (
                            <div className="bg-muted/20 rounded-md p-2 space-y-1.5">
                              <p className="text-[9px] text-blue-400 font-medium">Hosting: {site.hostingName || site.hostingProvider}</p>
                              {site.hostingEmail && (
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div><p className="text-[8px] text-muted-foreground">Email</p><span className="text-[10px] font-mono truncate">{site.hostingEmail}</span></div>
                                  {site.hostingPass && <div><p className="text-[8px] text-muted-foreground">Pass</p><span className="text-[10px] font-mono truncate">{showPasswords.has(site.id) ? site.hostingPass : "••••••"}</span></div>}
                                </div>
                              )}
                            </div>
                          )}
                          {(site.domainRegistrar || site.registrarEmail) && (
                            <div className="bg-muted/20 rounded-md p-2 space-y-1.5">
                              <p className="text-[9px] text-emerald-400 font-medium">Registrar: {site.domainRegistrar}</p>
                              {site.registrarEmail && (
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div><p className="text-[8px] text-muted-foreground">Email</p><span className="text-[10px] font-mono truncate">{site.registrarEmail}</span></div>
                                  {site.registrarPass && <div><p className="text-[8px] text-muted-foreground">Pass</p><span className="text-[10px] font-mono truncate">{showPasswords.has(site.id) ? site.registrarPass : "••••••"}</span></div>}
                                </div>
                              )}
                            </div>
                          )}
                          {(site.cpanelUrl || site.cpanelUser) && (
                            <div className="bg-muted/20 rounded-md p-2 space-y-1.5">
                              <p className="text-[9px] text-orange-400 font-medium">cPanel / Server</p>
                              {site.cpanelUrl && <p className="text-[10px] font-mono text-muted-foreground">{site.cpanelUrl}</p>}
                              <div className="grid grid-cols-2 gap-1.5">
                                {site.cpanelUser && <div><p className="text-[8px] text-muted-foreground">User</p><span className="text-[10px] font-mono">{site.cpanelUser}</span></div>}
                                {site.cpanelPass && <div><p className="text-[8px] text-muted-foreground">Pass</p><span className="text-[10px] font-mono">{showPasswords.has(site.id) ? site.cpanelPass : "••••••"}</span></div>}
                              </div>
                            </div>
                          )}
                          {site.notes && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-2">
                              <p className="text-[10px] text-yellow-400">{site.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ TAB: Health Check ═══ */}
        <TabsContent value="health" className="space-y-4 mt-4">
          <Card className="glass-card border-emerald-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" /> Bulk Health Check
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Ping all {stats.total} PBN sites to check online status and response time</p>
                </div>
                <Button onClick={() => healthCheckMutation.mutate()} disabled={healthCheckMutation.isPending}
                  className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {healthCheckMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Checking {stats.total} sites...</>
                  ) : (
                    <><Wifi className="w-4 h-4 mr-2" /> Run Health Check</>
                  )}
                </Button>
              </div>

              {healthCheckMutation.isPending && (
                <div className="space-y-2">
                  <Progress value={undefined} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center animate-pulse">Pinging all PBN sites... This may take a few minutes for {stats.total} sites</p>
                </div>
              )}

              {healthCheckMutation.data && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-muted/20 rounded-lg p-4 text-center">
                      <p className="text-3xl font-bold font-mono text-violet">{healthCheckMutation.data.total}</p>
                      <p className="text-xs text-muted-foreground">Total Checked</p>
                    </div>
                    <div className="bg-emerald-500/10 rounded-lg p-4 text-center border border-emerald-500/20">
                      <p className="text-3xl font-bold font-mono text-emerald-400">{healthCheckMutation.data.online}</p>
                      <p className="text-xs text-emerald-400">Online</p>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-4 text-center border border-red-500/20">
                      <p className="text-3xl font-bold font-mono text-red-400">{healthCheckMutation.data.offline}</p>
                      <p className="text-xs text-red-400">Offline</p>
                    </div>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border/50">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b border-border/50">
                          <th className="text-left p-2">Domain</th>
                          <th className="text-center p-2">Status</th>
                          <th className="text-center p-2">Code</th>
                          <th className="text-center p-2">Response</th>
                          <th className="text-left p-2">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {healthCheckMutation.data.results.map((r: any) => (
                          <tr key={r.siteId} className={`border-b border-border/30 ${r.online ? "" : "bg-red-500/5"}`}>
                            <td className="p-2 font-mono">{r.domain}</td>
                            <td className="p-2 text-center">
                              {r.online ? <Wifi className="w-4 h-4 text-emerald-400 mx-auto" /> : <WifiOff className="w-4 h-4 text-red-400 mx-auto" />}
                            </td>
                            <td className="p-2 text-center font-mono">{r.statusCode ?? "—"}</td>
                            <td className="p-2 text-center font-mono">{r.responseTimeMs ? `${r.responseTimeMs}ms` : "—"}</td>
                            <td className="p-2 text-red-400 truncate max-w-[200px]">{r.error || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Auto-Post Scheduler ═══ */}
        <TabsContent value="autopost" className="space-y-4 mt-4">
          <Card className="glass-card border-blue-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Send className="w-5 h-5 text-blue-400" /> PBN Auto-Post Scheduler
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">AI generates unique content and posts to multiple PBN sites. Select top-rated sites or let AI choose.</p>
                </div>
              </div>

              {/* Content Type Selector */}
              <div className="mb-5">
                <label className="text-xs text-gray-400 mb-2 block font-medium">Content Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {[
                    { value: "article", icon: "📝", label: "Article" },
                    { value: "review", icon: "⭐", label: "Review" },
                    { value: "news", icon: "📰", label: "News" },
                    { value: "tutorial", icon: "📚", label: "Tutorial" },
                    { value: "listicle", icon: "📋", label: "Listicle" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                        autoPostForm.contentType === t.value
                          ? "bg-blue-600/20 text-blue-300 border-blue-500/50 ring-1 ring-blue-500/30"
                          : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border-gray-700 hover:border-blue-500/30"
                      }`}
                      onClick={() => setAutoPostForm(p => ({ ...p, contentType: t.value }))}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Target URL (your money site)</label>
                    <Input placeholder="https://yourdomain.com/page" value={autoPostForm.targetUrl}
                      onChange={e => setAutoPostForm(p => ({ ...p, targetUrl: e.target.value }))}
                      className="bg-muted/30 border-border/50 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Anchor Text</label>
                    <Input placeholder="best crypto exchange" value={autoPostForm.anchorText}
                      onChange={e => setAutoPostForm(p => ({ ...p, anchorText: e.target.value }))}
                      className="bg-muted/30 border-border/50" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Keyword</label>
                    <Input placeholder="crypto trading" value={autoPostForm.keyword}
                      onChange={e => setAutoPostForm(p => ({ ...p, keyword: e.target.value }))}
                      className="bg-muted/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Niche</label>
                    <Input placeholder="cryptocurrency" value={autoPostForm.niche}
                      onChange={e => setAutoPostForm(p => ({ ...p, niche: e.target.value }))}
                      className="bg-muted/30 border-border/50" />
                  </div>
                </div>
              </div>

              {/* Writing Tone + Post Count + Launch */}
              <div className="flex flex-wrap items-end gap-4 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Writing Tone</label>
                  <Select value={autoPostForm.writingTone} onValueChange={v => setAutoPostForm(p => ({ ...p, writingTone: v }))}>
                    <SelectTrigger className="w-[140px] bg-muted/30 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="academic">Academic</SelectItem>
                      <SelectItem value="persuasive">Persuasive</SelectItem>
                      <SelectItem value="storytelling">Storytelling</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Number of Posts</label>
                  <Select value={String(autoPostForm.count)} onValueChange={v => setAutoPostForm(p => ({ ...p, count: Number(v) }))}>
                    <SelectTrigger className="w-[100px] bg-muted/30 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 3, 5, 10, 15, 20, 30, 50].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} posts</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1" />
                <Button onClick={() => autoPostMutation.mutate(autoPostForm)}
                  disabled={autoPostMutation.isPending || !autoPostForm.targetUrl || !autoPostForm.anchorText}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20">
                  {autoPostMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Posting to {autoPostForm.count} sites...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> Launch Auto-Post</>
                  )}
                </Button>
              </div>

              {/* Tips */}
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 mb-4">
                <p className="text-[11px] text-blue-300">💡 <strong>Tips:</strong> AI จะสร้าง content ที่ไม่ซ้ำกันสำหรับแต่ละ PBN site โดยอัตโนมัติ เลือก site ที่มี DA สูงและ Spam Score ต่ำเพื่อผลลัพธ์ที่ดีที่สุด Content type และ Writing tone จะเพิ่มเร็วๆ นี้</p>
              </div>

              {autoPostMutation.data && (
                <div className="space-y-3 mt-4 border-t border-border/30 pt-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-muted/20 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold font-mono">{autoPostMutation.data.totalPlanned}</p>
                      <p className="text-[10px] text-muted-foreground">Planned</p>
                    </div>
                    <div className="bg-emerald-500/10 rounded-lg p-3 text-center border border-emerald-500/20">
                      <p className="text-xl font-bold font-mono text-emerald-400">{autoPostMutation.data.totalPosted}</p>
                      <p className="text-[10px] text-emerald-400">Published</p>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-3 text-center border border-red-500/20">
                      <p className="text-xl font-bold font-mono text-red-400">{autoPostMutation.data.totalFailed}</p>
                      <p className="text-[10px] text-red-400">Failed</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {autoPostMutation.data.posts.map((p: any, i: number) => (
                      <div key={i} className={`flex items-center gap-3 p-2 rounded-lg ${p.status === "published" ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-red-500/5 border border-red-500/10"}`}>
                        {p.status === "published" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{p.title}</p>
                          <p className="text-[10px] text-muted-foreground">{p.siteName}</p>
                        </div>
                        {p.wpPostUrl && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => window.open(p.wpPostUrl, "_blank")}>
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        )}
                        {p.error && <span className="text-[10px] text-red-400 truncate max-w-[150px]">{p.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Expire Alerts ═══ */}
        <TabsContent value="expire" className="space-y-4 mt-4">
          <Card className="glass-card border-orange-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Bell className="w-5 h-5 text-orange-400" /> Domain Expire Alerts
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Monitor domains expiring within 30 days. Get notified before it's too late.</p>
                </div>
                <Button onClick={() => expireNotifyMutation.mutate()} disabled={expireNotifyMutation.isPending}
                  className="bg-orange-600 text-white hover:bg-orange-700">
                  {expireNotifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
                  Send Notifications
                </Button>
              </div>

              {expireData && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-red-500/10 rounded-lg p-4 text-center border border-red-500/20">
                      <p className="text-3xl font-bold font-mono text-red-400">{expireData.critical}</p>
                      <p className="text-xs text-red-400">Critical (&lt; 7 days)</p>
                    </div>
                    <div className="bg-orange-500/10 rounded-lg p-4 text-center border border-orange-500/20">
                      <p className="text-3xl font-bold font-mono text-orange-400">{expireData.warning}</p>
                      <p className="text-xs text-orange-400">Warning (7-14 days)</p>
                    </div>
                    <div className="bg-yellow-500/10 rounded-lg p-4 text-center border border-yellow-500/20">
                      <p className="text-3xl font-bold font-mono text-yellow-400">{expireData.notice}</p>
                      <p className="text-xs text-yellow-400">Notice (14-30 days)</p>
                    </div>
                  </div>

                  {expireData.alerts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400 opacity-50" />
                      <p>All domains are safe! No expiration alerts.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {expireData.alerts.map((a: any) => (
                        <div key={a.siteId} className={`flex items-center gap-3 p-3 rounded-lg border ${
                          a.urgency === "critical" ? "bg-red-500/5 border-red-500/20" :
                          a.urgency === "warning" ? "bg-orange-500/5 border-orange-500/20" :
                          "bg-yellow-500/5 border-yellow-500/20"
                        }`}>
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            a.urgency === "critical" ? "bg-red-500/20" :
                            a.urgency === "warning" ? "bg-orange-500/20" : "bg-yellow-500/20"
                          }`}>
                            {a.urgency === "critical" ? <AlertTriangle className="w-5 h-5 text-red-400" /> :
                             a.urgency === "warning" ? <Clock className="w-5 h-5 text-orange-400" /> :
                             <Calendar className="w-5 h-5 text-yellow-400" />}
                          </div>
                          <div className="flex-1">
                            <p className="font-mono font-medium text-sm">{a.domain}</p>
                            <p className="text-[10px] text-muted-foreground">{a.registrar || "Unknown registrar"}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-mono font-bold ${
                              a.urgency === "critical" ? "text-red-400" :
                              a.urgency === "warning" ? "text-orange-400" : "text-yellow-400"
                            }`}>
                              {a.daysLeft === 0 ? "EXPIRED!" : `${a.daysLeft} days`}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{a.expireDate}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: AI Metrics Update ═══ */}
        <TabsContent value="metrics" className="space-y-4 mt-4">
          <Card className="glass-card border-purple-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" /> AI Auto-Update Metrics
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">AI analyzes and updates DA, DR, PA, and Spam Score for all PBN sites automatically</p>
                </div>
                <Button onClick={() => aiMetricsMutation.mutate()} disabled={aiMetricsMutation.isPending}
                  className="bg-purple-600 text-white hover:bg-purple-700">
                  {aiMetricsMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> AI Analyzing {stats.total} sites...</>
                  ) : (
                    <><Brain className="w-4 h-4 mr-2" /> Update All Metrics</>
                  )}
                </Button>
              </div>

              {aiMetricsMutation.isPending && (
                <div className="space-y-2">
                  <Progress value={undefined} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center animate-pulse">AI is analyzing domain metrics... Processing in batches of 5</p>
                </div>
              )}

              {aiMetricsMutation.data && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/20 rounded-lg p-4 text-center">
                      <p className="text-3xl font-bold font-mono text-violet">{aiMetricsMutation.data.total}</p>
                      <p className="text-xs text-muted-foreground">Total Analyzed</p>
                    </div>
                    <div className="bg-purple-500/10 rounded-lg p-4 text-center border border-purple-500/20">
                      <p className="text-3xl font-bold font-mono text-purple-400">{aiMetricsMutation.data.updated}</p>
                      <p className="text-xs text-purple-400">Metrics Updated</p>
                    </div>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border/50">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b border-border/50">
                          <th className="text-left p-2">Domain</th>
                          <th className="text-center p-2">DA</th>
                          <th className="text-center p-2">DR</th>
                          <th className="text-center p-2">PA</th>
                          <th className="text-center p-2">SS</th>
                          <th className="text-center p-2">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiMetricsMutation.data.results.map((r: any) => (
                          <tr key={r.siteId} className="border-b border-border/30">
                            <td className="p-2 font-mono">{r.domain}</td>
                            <td className="p-2 text-center">
                              <span className={`font-mono font-bold ${getDaColor(r.newMetrics.da)}`}>{r.newMetrics.da}</span>
                              {r.changes.da !== 0 && (
                                <span className={`text-[9px] ml-1 ${r.changes.da > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  {r.changes.da > 0 ? "+" : ""}{r.changes.da}
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <span className="font-mono font-bold text-blue-400">{r.newMetrics.dr}</span>
                              {r.changes.dr !== 0 && (
                                <span className={`text-[9px] ml-1 ${r.changes.dr > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  {r.changes.dr > 0 ? "+" : ""}{r.changes.dr}
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center font-mono">{r.newMetrics.pa}</td>
                            <td className={`p-2 text-center font-mono font-bold ${getSpamColor(r.newMetrics.spamScore)}`}>{r.newMetrics.spamScore}</td>
                            <td className="p-2 text-center">
                              {(r.changes.da !== 0 || r.changes.dr !== 0) ? (
                                <TrendingUp className={`w-4 h-4 mx-auto ${r.changes.da >= 0 ? "text-emerald-400" : "text-red-400"}`} />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Hot PBN ⭐ ═══ */}
        <TabsContent value="hot" className="space-y-4 mt-4">
          <Card className="glass-card border-amber-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Flame className="w-5 h-5 text-amber-400" /> Hot PBN Ranking
                    <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">AI-scored ranking of your best PBN sites for backlink foundation. Higher stars = better for SEO.</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Average Score</p>
                  <p className="text-2xl font-bold font-mono text-amber-400">{hotData?.avgScore ?? 0}/100</p>
                </div>
              </div>

              {hotData && (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-amber-500/10 rounded-lg p-3 text-center border border-amber-500/20">
                      <p className="text-xl font-bold font-mono text-amber-400">{hotData.avg5Star}</p>
                      <div className="flex justify-center mt-1"><StarRating stars={5} /></div>
                      <p className="text-[10px] text-amber-400 mt-1">Elite</p>
                    </div>
                    <div className="bg-violet/10 rounded-lg p-3 text-center border border-violet/20">
                      <p className="text-xl font-bold font-mono text-violet">{hotData.hotSites.filter((s: any) => s.stars === 4).length}</p>
                      <div className="flex justify-center mt-1"><StarRating stars={4} /></div>
                      <p className="text-[10px] text-violet mt-1">Hot</p>
                    </div>
                    <div className="bg-blue-500/10 rounded-lg p-3 text-center border border-blue-500/20">
                      <p className="text-xl font-bold font-mono text-blue-400">{hotData.hotSites.filter((s: any) => s.stars === 3).length}</p>
                      <div className="flex justify-center mt-1"><StarRating stars={3} /></div>
                      <p className="text-[10px] text-blue-400 mt-1">Good</p>
                    </div>
                    <div className="bg-muted/20 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold font-mono text-muted-foreground">{hotData.hotSites.filter((s: any) => s.stars <= 2).length}</p>
                      <div className="flex justify-center mt-1"><StarRating stars={2} /></div>
                      <p className="text-[10px] text-muted-foreground mt-1">Basic</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {hotData.hotSites.slice(0, 50).map((site: any, i: number) => (
                      <div key={site.siteId} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        site.stars >= 5 ? "bg-gradient-to-r from-amber-500/5 to-orange-500/5 border-amber-500/20 shadow-lg shadow-amber-500/5" :
                        site.stars >= 4 ? "bg-violet/5 border-violet/20" :
                        site.stars >= 3 ? "bg-blue-500/5 border-blue-500/10" :
                        "bg-muted/10 border-border/30"
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          i < 3 ? "bg-amber-500/20 text-amber-400" : "bg-muted/30 text-muted-foreground"
                        }`}>
                          {i + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-sm">{site.domain}</span>
                            <HotBadge stars={site.stars} score={site.score} />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <StarRating stars={site.stars} />
                            <span className="text-[10px] font-mono text-muted-foreground">{site.score}/100</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                          <div className="text-center">
                            <p className="text-[9px] text-muted-foreground">DA</p>
                            <p className={`font-mono font-bold ${getDaColor(site.metrics.da)}`}>{site.metrics.da}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] text-muted-foreground">DR</p>
                            <p className="font-mono font-bold text-blue-400">{site.metrics.dr}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] text-muted-foreground">SS</p>
                            <p className={`font-mono font-bold ${getSpamColor(site.metrics.spamScore)}`}>{site.metrics.spamScore}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {site.badges.slice(0, 3).map((b: string, bi: number) => (
                            <span key={bi} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/30">{b}</span>
                          ))}
                        </div>

                        <Button size="sm" variant="outline" className="h-7 text-[10px]"
                          onClick={() => { setPostForm({ siteId: site.siteId, targetUrl: "", anchorText: "", keyword: "", niche: "" }); setPostResult(null); setPostDialogOpen(true); }}>
                          <Send className="w-3 h-3 mr-1" /> Post
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Post Dialog */}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>
              AI Content Post
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Target URL (link to your money site)</label>
              <Input placeholder="https://yourdomain.com/page" value={postForm.targetUrl} onChange={e => setPostForm(p => ({ ...p, targetUrl: e.target.value }))} className="bg-gray-800/50 border-gray-700 font-mono" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Anchor Text</label>
              <Input placeholder="best crypto exchange" value={postForm.anchorText} onChange={e => setPostForm(p => ({ ...p, anchorText: e.target.value }))} className="bg-gray-800/50 border-gray-700" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Keyword</label>
                <Input placeholder="crypto trading" value={postForm.keyword} onChange={e => setPostForm(p => ({ ...p, keyword: e.target.value }))} className="bg-gray-800/50 border-gray-700" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Niche</label>
                <Input placeholder="cryptocurrency" value={postForm.niche} onChange={e => setPostForm(p => ({ ...p, niche: e.target.value }))} className="bg-gray-800/50 border-gray-700" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Word Count</label>
                <Select defaultValue="800">
                  <SelectTrigger className="bg-gray-800/50 border-gray-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500">~500 words</SelectItem>
                    <SelectItem value="800">~800 words</SelectItem>
                    <SelectItem value="1200">~1,200 words</SelectItem>
                    <SelectItem value="2000">~2,000 words</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Writing Style</label>
                <Select defaultValue="professional">
                  <SelectTrigger className="bg-gray-800/50 border-gray-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="academic">Academic</SelectItem>
                    <SelectItem value="persuasive">Persuasive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => postMutation.mutate(postForm)} disabled={postMutation.isPending || !postForm.targetUrl || !postForm.anchorText}
              className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700">
              {postMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Generate & Post
            </Button>
            {postResult && (
              <div className="bg-muted/20 border border-border/50 rounded-lg p-4">
                <h3 className="font-semibold text-sm text-violet mb-2">{postResult.title}</h3>
                <Badge className="mb-3 text-[10px]">{postResult.status}</Badge>
                <div className="prose prose-sm prose-invert max-w-none text-xs [&_code]:text-violet [&_code]:bg-violet/10 [&_code]:px-1 [&_code]:rounded">
                  <Streamdown>{postResult.content}</Streamdown>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
