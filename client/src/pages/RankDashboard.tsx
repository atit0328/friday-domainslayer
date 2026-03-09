/**
 * Rank Tracking Dashboard
 * 
 * Standalone dashboard for visualizing keyword rank performance over time.
 * Uses SerpAPI for live rank checks with time-series charts.
 */
import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  TrendingUp, TrendingDown, Minus, Search, Target,
  Loader2, Trash2, RefreshCw, Plus, BarChart3,
  Globe, ArrowUp, ArrowDown, Zap, Activity,
  XCircle, LineChart, PieChart, ChevronDown, ChevronUp,
  ExternalLink, Wifi, WifiOff, Hash,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  LineChart as RechartsLine,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
  PieChart as RechartsPie,
  Pie,
} from "recharts";

// ═══ Constants ═══

const TREND_CONFIG = {
  rising: { icon: TrendingUp, color: "text-green-400", label: "Rising" },
  falling: { icon: TrendingDown, color: "text-red-400", label: "Falling" },
  stable: { icon: Minus, color: "text-yellow-400", label: "Stable" },
  new: { icon: Zap, color: "text-cyan-400", label: "New" },
  lost: { icon: XCircle, color: "text-red-500", label: "Lost" },
};

const CHART_COLORS = [
  "#34d399", "#a78bfa", "#22d3ee", "#fbbf24", "#f87171",
  "#60a5fa", "#fb923c", "#e879f9", "#4ade80", "#f472b6",
];

const PIE_COLORS = ["#34d399", "#22d3ee", "#fbbf24", "#fb923c", "#f87171", "#6b7280"];

// ═══ Component ═══

export default function RankDashboard() {
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [chartKeyword, setChartKeyword] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addProjectId, setAddProjectId] = useState<string>("");
  const [addKeywordsText, setAddKeywordsText] = useState("");
  const [addCountry, setAddCountry] = useState("US");
  const [addDevice, setAddDevice] = useState<"desktop" | "mobile">("desktop");
  const [chartDays, setChartDays] = useState(90);

  // ═══ Queries ═══
  const statsQuery = trpc.rankDashboard.stats.useQuery();
  const serpApiQuery = trpc.rankDashboard.serpApiStatus.useQuery();
  const keywordsQuery = trpc.rankDashboard.keywords.useQuery();
  const projectsQuery = trpc.rankDashboard.projects.useQuery();
  const distQuery = trpc.rankDashboard.positionDistribution.useQuery({
    projectId: selectedProject !== "all" ? Number(selectedProject) : undefined,
  });

  // Time series for selected keyword
  const timeSeriesQuery = trpc.rankDashboard.timeSeries.useQuery(
    {
      keyword: chartKeyword || "",
      projectId: selectedProject !== "all" ? Number(selectedProject) : undefined,
      days: chartDays,
    },
    { enabled: !!chartKeyword },
  );

  // Multi time series for comparison
  const multiTimeSeriesQuery = trpc.rankDashboard.multiTimeSeries.useQuery(
    {
      keywords: selectedKeywords.length > 0 ? selectedKeywords : ["__none__"],
      projectId: selectedProject !== "all" ? Number(selectedProject) : undefined,
      days: chartDays,
    },
    { enabled: selectedKeywords.length > 1 },
  );

  // ═══ Mutations ═══
  const checkRankMut = trpc.rankDashboard.checkRank.useMutation({
    onSuccess: (data) => {
      const pos = data.position ? `#${data.position}` : "Not ranked";
      toast.success(`"${data.keyword}" → ${pos} (${data.source})`);
      keywordsQuery.refetch();
      statsQuery.refetch();
      distQuery.refetch();
      serpApiQuery.refetch();
      if (chartKeyword === data.keyword) timeSeriesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkCheckMut = trpc.rankDashboard.bulkCheck.useMutation({
    onSuccess: (data) => {
      toast.success(`Checked ${data.totalKeywords} keywords — Avg #${data.avgPosition}`);
      keywordsQuery.refetch();
      statsQuery.refetch();
      distQuery.refetch();
      serpApiQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const addKeywordsMut = trpc.rankDashboard.addKeywords.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} keywords added`);
      keywordsQuery.refetch();
      statsQuery.refetch();
      setShowAddDialog(false);
      setAddKeywordsText("");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeKeywordMut = trpc.rankDashboard.removeKeyword.useMutation({
    onSuccess: () => {
      toast.success("Keyword removed");
      keywordsQuery.refetch();
      statsQuery.refetch();
      distQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // ═══ Derived Data ═══
  const filteredKeywords = useMemo(() => {
    if (!keywordsQuery.data) return [];
    let items = keywordsQuery.data;
    if (selectedProject !== "all") {
      items = items.filter(k => k.projectId === Number(selectedProject));
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      items = items.filter(k => k.keyword.toLowerCase().includes(q) || k.projectDomain.toLowerCase().includes(q));
    }
    // Sort: ranked first (by position), then unranked
    return items.sort((a, b) => {
      if (a.position && b.position) return a.position - b.position;
      if (a.position) return -1;
      if (b.position) return 1;
      return 0;
    });
  }, [keywordsQuery.data, selectedProject, searchFilter]);

  // Chart data for single keyword
  const chartData = useMemo(() => {
    if (!timeSeriesQuery.data) return [];
    return timeSeriesQuery.data.map(d => ({
      date: new Date(d.trackedAt).toLocaleDateString("th-TH", { day: "2-digit", month: "short" }),
      position: d.position,
      fullDate: new Date(d.trackedAt).toLocaleString("th-TH"),
    }));
  }, [timeSeriesQuery.data]);

  // Multi-keyword chart data
  const multiChartData = useMemo(() => {
    if (!multiTimeSeriesQuery.data || selectedKeywords.length < 2) return [];
    // Merge all keywords into unified date points
    const dateMap = new Map<string, Record<string, number | null>>();
    for (const [kw, entries] of Object.entries(multiTimeSeriesQuery.data)) {
      for (const entry of entries) {
        const dateKey = new Date(entry.trackedAt).toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
        if (!dateMap.has(dateKey)) dateMap.set(dateKey, { date: dateKey as any });
        dateMap.get(dateKey)![kw] = entry.position;
      }
    }
    return Array.from(dateMap.values());
  }, [multiTimeSeriesQuery.data, selectedKeywords]);

  // Position distribution for pie chart
  const pieData = useMemo(() => {
    if (!distQuery.data) return [];
    const d = distQuery.data;
    return [
      { name: "Top 3", value: d.top3, color: PIE_COLORS[0] },
      { name: "4-10", value: d.top4to10, color: PIE_COLORS[1] },
      { name: "11-20", value: d.top11to20, color: PIE_COLORS[2] },
      { name: "21-50", value: d.top21to50, color: PIE_COLORS[3] },
      { name: "51+", value: d.top51plus, color: PIE_COLORS[4] },
      { name: "Not Ranked", value: d.notRanked, color: PIE_COLORS[5] },
    ].filter(d => d.value > 0);
  }, [distQuery.data]);

  const toggleKeywordSelect = useCallback((keyword: string) => {
    setSelectedKeywords(prev => {
      if (prev.includes(keyword)) return prev.filter(k => k !== keyword);
      if (prev.length >= 10) { toast.error("Max 10 keywords for comparison"); return prev; }
      return [...prev, keyword];
    });
  }, []);

  function handleAddKeywords() {
    if (!addProjectId || !addKeywordsText.trim()) {
      toast.error("Select a project and enter keywords");
      return;
    }
    const keywords = addKeywordsText.split("\n").map(l => l.trim()).filter(Boolean);
    if (keywords.length === 0) { toast.error("Enter at least one keyword"); return; }
    addKeywordsMut.mutate({
      projectId: Number(addProjectId),
      keywords,
      country: addCountry,
      device: addDevice,
    });
  }

  const stats = statsQuery.data;
  const serpApi = serpApiQuery.data;

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LineChart className="w-6 h-6 text-emerald" />
            Rank Tracking Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ติดตามอันดับ Keywords ทุกโปรเจกต์ — Time-series + SerpAPI Live Check
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* SerpAPI Status */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs">
            {serpApi && serpApi.remaining > 0 ? (
              <Wifi className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-red-400" />
            )}
            <span className="text-muted-foreground">SerpAPI:</span>
            <span className="font-mono font-bold text-foreground">
              {serpApi ? `${serpApi.remaining}/${serpApi.searchesPerMonth}` : "N/A"}
            </span>
          </div>
          <Button size="sm" className="bg-emerald hover:bg-emerald/90 text-black font-semibold" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Keywords
          </Button>
          <Sheet open={showAddDialog} onOpenChange={setShowAddDialog}>
            <SheetContent side="bottom" className="max-w-lg mx-auto px-6 pb-6">
              <SheetHeader>
                <SheetTitle>Add Keywords to Track</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto flex-1 -mx-6 px-6">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Project</Label>
                  <Select value={addProjectId} onValueChange={setAddProjectId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select project..." /></SelectTrigger>
                    <SelectContent>
                      {projectsQuery.data?.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} ({p.domain})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
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
                  <Label className="text-xs">Keywords (one per line)</Label>
                  <Textarea
                    value={addKeywordsText}
                    onChange={e => setAddKeywordsText(e.target.value)}
                    placeholder={"seo tools\nkeyword tracker\nrank monitoring"}
                    className="mt-1 text-xs min-h-[120px] font-mono"
                  />
                </div>
              </div>
              </div>
              <SheetFooter className="flex-row gap-2 pt-4 border-t border-border">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button
                  className="bg-emerald hover:bg-emerald/90 text-black font-semibold flex-1"
                  disabled={!addProjectId || !addKeywordsText.trim() || addKeywordsMut.isPending}
                  onClick={handleAddKeywords}
                >
                  {addKeywordsMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                  Add Keywords
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* ═══ Stats Cards ═══ */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Keywords", value: stats.totalKeywords, icon: Hash, color: "text-foreground" },
            { label: "Ranked", value: stats.rankedKeywords, icon: Target, color: "text-emerald" },
            { label: "Avg Position", value: stats.avgPosition > 0 ? `#${stats.avgPosition}` : "—", icon: BarChart3, color: "text-cyan" },
            { label: "Top 10", value: stats.top10, icon: TrendingUp, color: "text-green-400" },
            { label: "Improved", value: stats.improved, icon: ArrowUp, color: "text-green-400" },
            { label: "Declined", value: stats.declined, icon: ArrowDown, color: "text-red-400" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <Card key={i} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
                    </div>
                    <Icon className={`w-5 h-5 ${s.color} opacity-40`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ═══ Charts Row ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Position Distribution Pie */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald" />
              Position Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPie>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.195 0.006 285.885)", border: "1px solid oklch(0.28 0.006 286.033)", borderRadius: "8px" }}
                    labelStyle={{ color: "oklch(0.92 0.004 264.376)" }}
                    itemStyle={{ color: "oklch(0.92 0.004 264.376)" }}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No ranking data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Time-Series Chart */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <LineChart className="w-4 h-4 text-cyan" />
                {selectedKeywords.length > 1
                  ? `Comparing ${selectedKeywords.length} Keywords`
                  : chartKeyword
                    ? `"${chartKeyword}" Position Over Time`
                    : "Select a keyword to view history"}
              </CardTitle>
              <Select value={String(chartDays)} onValueChange={v => setChartDays(Number(v))}>
                <SelectTrigger className="w-full sm:w-[100px] h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {selectedKeywords.length > 1 && multiChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <RechartsLine data={multiChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.006 286.033)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.556 0.016 285.938)" }} />
                  <YAxis reversed tick={{ fontSize: 10, fill: "oklch(0.556 0.016 285.938)" }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.195 0.006 285.885)", border: "1px solid oklch(0.28 0.006 286.033)", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "oklch(0.92 0.004 264.376)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {selectedKeywords.map((kw, i) => (
                    <Line
                      key={kw}
                      type="monotone"
                      dataKey={kw}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                      name={kw.length > 25 ? kw.slice(0, 25) + "..." : kw}
                    />
                  ))}
                </RechartsLine>
              </ResponsiveContainer>
            ) : chartKeyword && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <RechartsLine data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.006 286.033)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.556 0.016 285.938)" }} />
                  <YAxis reversed tick={{ fontSize: 10, fill: "oklch(0.556 0.016 285.938)" }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.195 0.006 285.885)", border: "1px solid oklch(0.28 0.006 286.033)", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "oklch(0.92 0.004 264.376)" }}
                    formatter={(value: any) => [value ? `#${value}` : "Not ranked", "Position"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="position"
                    stroke="#34d399"
                    strokeWidth={2.5}
                    dot={{ fill: "#34d399", r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                </RechartsLine>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                {chartKeyword ? "No history data for this keyword" : "Click a keyword row to view its position history chart"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Filters + Bulk Actions ═══ */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search keywords or domains..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-full sm:w-[200px] bg-card border-border">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projectsQuery.data?.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name} ({p.domain})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedProject !== "all" && (
          <Button
            variant="outline"
            size="sm"
            disabled={bulkCheckMut.isPending}
            onClick={() => bulkCheckMut.mutate({ projectId: Number(selectedProject) })}
          >
            {bulkCheckMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Bulk Check All
          </Button>
        )}
        {selectedKeywords.length > 0 && (
          <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => setSelectedKeywords([])}>
            {selectedKeywords.length} selected — Click to clear
          </Badge>
        )}
      </div>

      {/* ═══ Keywords Table ═══ */}
      <div className="text-xs text-muted-foreground mb-1">
        {filteredKeywords.length} keywords
        {selectedKeywords.length > 1 && ` — ${selectedKeywords.length} selected for comparison`}
      </div>

      {keywordsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-emerald" />
        </div>
      ) : filteredKeywords.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground">ยังไม่มี Keywords ที่ติดตาม</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              สร้าง SEO Project แล้ว Run Keyword Research หรือกด "Add Keywords"
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {/* Table Header */}
          <div className="grid grid-cols-[40px_1fr_80px_80px_80px_80px_100px_100px] gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div></div>
            <div>Keyword</div>
            <div className="text-center">Position</div>
            <div className="text-center">Change</div>
            <div className="text-center">Best</div>
            <div className="text-center">Trend</div>
            <div className="text-center">Volume</div>
            <div className="text-right">Actions</div>
          </div>

          <ScrollArea className="max-h-[600px]">
            <div className="space-y-0.5">
              {filteredKeywords.map((kw) => {
                const trend = TREND_CONFIG[kw.trend as keyof typeof TREND_CONFIG] || TREND_CONFIG.new;
                const TrendIcon = trend.icon;
                const isSelected = selectedKeywords.includes(kw.keyword);
                const isChartActive = chartKeyword === kw.keyword;

                return (
                  <div
                    key={`${kw.projectId}-${kw.keyword}`}
                    className={`grid grid-cols-[40px_1fr_80px_80px_80px_80px_100px_100px] gap-2 px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                      isChartActive
                        ? "bg-emerald/10 ring-1 ring-emerald/30"
                        : isSelected
                          ? "bg-cyan/5 ring-1 ring-cyan/20"
                          : "bg-card hover:bg-card/80"
                    }`}
                    onClick={() => {
                      setChartKeyword(kw.keyword);
                      // Also toggle selection for multi-compare
                    }}
                  >
                    {/* Checkbox */}
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); toggleKeywordSelect(kw.keyword); }}
                        className="w-3.5 h-3.5 rounded border-border accent-cyan"
                      />
                    </div>

                    {/* Keyword + Domain */}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{kw.keyword}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Globe className="w-2.5 h-2.5" />
                        <span className="truncate">{kw.projectDomain}</span>
                        <span className="text-muted-foreground/40">•</span>
                        <span>{kw.searchEngine} {kw.country}</span>
                      </div>
                    </div>

                    {/* Position */}
                    <div className="flex items-center justify-center">
                      {kw.position ? (
                        <span className={`text-lg font-bold font-mono ${
                          kw.position <= 3 ? "text-emerald" :
                          kw.position <= 10 ? "text-green-400" :
                          kw.position <= 20 ? "text-yellow-400" :
                          kw.position <= 50 ? "text-amber" : "text-muted-foreground"
                        }`}>
                          #{kw.position}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30 text-lg font-bold">—</span>
                      )}
                    </div>

                    {/* Change */}
                    <div className="flex items-center justify-center">
                      {kw.positionChange && kw.positionChange !== 0 ? (
                        <div className={`flex items-center gap-0.5 text-xs font-bold ${kw.positionChange > 0 ? "text-green-400" : "text-red-400"}`}>
                          {kw.positionChange > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                          {Math.abs(kw.positionChange)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30 text-xs">—</span>
                      )}
                    </div>

                    {/* Best */}
                    <div className="flex items-center justify-center">
                      <span className="text-xs font-mono text-emerald/70">
                        {kw.bestPosition ? `#${kw.bestPosition}` : "—"}
                      </span>
                    </div>

                    {/* Trend */}
                    <div className="flex items-center justify-center">
                      <TrendIcon className={`w-4 h-4 ${trend.color}`} />
                    </div>

                    {/* Volume */}
                    <div className="flex items-center justify-center">
                      <span className="text-xs font-mono text-muted-foreground">
                        {kw.searchVolume ? kw.searchVolume.toLocaleString() : "—"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-cyan hover:text-cyan/80 hover:bg-cyan/10"
                        disabled={checkRankMut.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          checkRankMut.mutate({
                            projectId: kw.projectId,
                            keyword: kw.keyword,
                            country: kw.country,
                            device: kw.device as "desktop" | "mobile",
                          });
                        }}
                        title="Check rank via SerpAPI"
                      >
                        {checkRankMut.isPending && checkRankMut.variables?.keyword === kw.keyword ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      {kw.serpUrl && (
                        <a href={kw.serpUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Open SERP URL">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove "${kw.keyword}" from tracking?`)) {
                            removeKeywordMut.mutate({ projectId: kw.projectId, keyword: kw.keyword });
                          }
                        }}
                        title="Remove keyword"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
