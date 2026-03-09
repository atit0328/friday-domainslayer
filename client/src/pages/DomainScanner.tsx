/**
 * Design: Obsidian Intelligence — Domain Scanner
 * Real SEO metrics: DA/DR/SS/RF/BL/Index/Wayback + AI analysis
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Search, Loader2, Shield, AlertTriangle, CheckCircle, XCircle, Globe,
  Activity, Link2, Archive, Eye, Lock, Zap, TrendingUp, BarChart3,
} from "lucide-react";

const USE_CASES = [
  { value: "hold_flip", label: "Hold & Flip" },
  { value: "build_site", label: "Build Site" },
  { value: "redirect_seo", label: "Redirect SEO" },
  { value: "brand_protect", label: "Brand Protection" },
];

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald/20 text-emerald border-emerald/30",
  B: "bg-cyan/20 text-cyan border-cyan/30",
  C: "bg-amber/20 text-amber border-amber/30",
  D: "bg-rose/20 text-rose border-rose/30",
  F: "bg-destructive/20 text-destructive border-destructive/30",
};

function MetricCard({ label, value, icon: Icon, color = "emerald", suffix = "" }: {
  label: string; value: number | string | null | undefined; icon: any; color?: string; suffix?: string;
}) {
  const colorClasses: Record<string, string> = {
    emerald: "text-emerald border-emerald/20",
    cyan: "text-cyan border-cyan/20",
    amber: "text-amber border-amber/20",
    rose: "text-rose border-rose/20",
    violet: "text-violet border-violet/20",
  };
  return (
    <div className={`p-3 rounded-lg bg-muted/30 border ${colorClasses[color] || colorClasses.emerald}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="text-xl font-bold font-mono">
        {value ?? "—"}{suffix && value != null ? <span className="text-xs opacity-60">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ScoreBar({ value, max = 100, color = "emerald" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden">
      <div className={`h-full rounded-full bg-${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DomainScanner() {
  const [domain, setDomain] = useState("");
  const [useCase, setUseCase] = useState("hold_flip");
  const [result, setResult] = useState<any>(null);
  const [bulkDomains, setBulkDomains] = useState("");
  const [bulkResults, setBulkResults] = useState<any[]>([]);

  const utils = trpc.useUtils();

  const { data: history = [], refetch: refetchHistory } = trpc.scanner.list.useQuery(
    { limit: 50 },
    { enabled: false }
  );

  const scanMutation = trpc.scanner.scan.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Scan completed: ${data?.domain}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkScanMutation = trpc.scanner.bulkScan.useMutation({
    onSuccess: async (data) => {
      toast.success(`Bulk scan completed: ${data.count} domains`);
      const results = [];
      for (const scanId of data.scanIds) {
        try {
          const scan = await utils.scanner.getById.fetch({ id: scanId });
          if (scan) results.push(scan);
        } catch { /* skip */ }
      }
      setBulkResults(results);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleScan() {
    if (!domain.trim()) return;
    setResult(null);
    scanMutation.mutate({ domain: domain.trim(), useCase });
  }

  function handleBulkScan() {
    const domains = bulkDomains.split("\n").map(d => d.trim()).filter(Boolean);
    if (domains.length === 0) return;
    setBulkResults([]);
    bulkScanMutation.mutate({ domains, useCase });
  }

  const rescanAllMutation = trpc.scanner.rescanAll.useMutation({
    onSuccess: (data) => {
      toast.success(`Re-scan เสร็จ: ${data.updated} สำเร็จ, ${data.failed} ล้มเหลว จาก ${data.total} โดเมน`);
      refetchHistory();
    },
    onError: (err) => toast.error(`Re-scan failed: ${err.message}`),
  });

  const scanning = scanMutation.isPending || bulkScanMutation.isPending || rescanAllMutation.isPending;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-emerald rounded-full" />
        <h1 className="text-lg font-bold tracking-tight">Domain Scanner</h1>
        <Badge variant="outline" className="font-mono text-[10px] border-emerald/30 text-emerald">REAL METRICS</Badge>
      </div>

      <Tabs defaultValue="single" className="w-full">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="single">Single Scan</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Scan</TabsTrigger>
          <TabsTrigger value="history" onClick={() => refetchHistory()}>History</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4 mt-4">
          <Card className="glass-card border-border/50">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="example.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="bg-muted/30 border-border/50 font-mono"
                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  />
                </div>
                <Select value={useCase} onValueChange={setUseCase}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-muted/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USE_CASES.map(uc => (
                      <SelectItem key={uc.value} value={uc.value}>{uc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleScan} disabled={scanning} className="bg-emerald text-background hover:bg-emerald/90">
                  {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Search className="w-4 h-4 mr-1.5" />}
                  Scan Domain
                </Button>
              </div>
              {scanning && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>กำลังดึงข้อมูลจริงจาก Moz API, SimilarWeb API, Wayback Machine, Web Scraping...</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan Result with Real Metrics */}
          {result && (
            <div className="space-y-4 animate-fade-in-up">
              {/* Trust Score + Domain Info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Card className="glass-card border-emerald/20 glow-emerald md:col-span-1">
                  <CardContent className="p-5 text-center">
                    <p className="text-xs font-mono text-muted-foreground mb-2">TRUST SCORE</p>
                    <div className="text-2xl sm:text-4xl sm:text-5xl font-bold font-mono text-emerald">{result.trustScore ?? "—"}</div>
                    <div className="mt-2">
                      <Badge className={`${GRADE_COLORS[result.grade] || "bg-muted"} font-mono text-lg px-3`}>
                        {result.grade || "—"}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <Badge variant="outline" className="font-mono text-xs">
                        {result.verdict === "STRONG_BUY" && <CheckCircle className="w-3 h-3 mr-1 text-emerald" />}
                        {result.verdict === "CONDITIONAL_BUY" && <AlertTriangle className="w-3 h-3 mr-1 text-amber" />}
                        {result.verdict === "HOLD" && <Eye className="w-3 h-3 mr-1 text-cyan" />}
                        {result.verdict === "AVOID" && <XCircle className="w-3 h-3 mr-1 text-rose" />}
                        {result.verdict || "—"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-border/50 md:col-span-3">
                  <CardContent className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">Domain</p>
                        <p className="font-mono font-semibold text-emerald">{result.domain}</p>
                      </div>
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">Domain Age</p>
                        <p className="font-mono text-sm">{result.domainAge || "Unknown"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">Status</p>
                        <div className="flex items-center gap-1.5">
                          {result.isLive ? (
                            <Badge className="bg-emerald/20 text-emerald text-xs">Live</Badge>
                          ) : (
                            <Badge className="bg-rose/20 text-rose text-xs">Offline</Badge>
                          )}
                          {result.hasSSL && <Lock className="w-3 h-3 text-emerald" />}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">Load Time</p>
                        <p className="font-mono text-sm">{result.loadTimeMs ? `${result.loadTimeMs}ms` : "—"}</p>
                      </div>
                    </div>

                    {/* SimilarWeb Real Data */}
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {result.globalRank != null && result.globalRank > 0 && (
                        <div className="p-2 rounded-lg bg-cyan/5 border border-cyan/20">
                          <p className="text-[10px] font-mono text-cyan">Global Rank (SimilarWeb)</p>
                          <p className="text-lg font-bold font-mono">#{result.globalRank.toLocaleString()}</p>
                        </div>
                      )}
                      {result.totalVisits != null && result.totalVisits > 0 && (
                        <div className="p-2 rounded-lg bg-violet/5 border border-violet/20">
                          <p className="text-[10px] font-mono text-violet">Monthly Visits (SimilarWeb)</p>
                          <p className="text-lg font-bold font-mono">{result.totalVisits > 1000000 ? `${(result.totalVisits / 1000000).toFixed(1)}M` : result.totalVisits > 1000 ? `${(result.totalVisits / 1000).toFixed(1)}K` : result.totalVisits}</p>
                        </div>
                      )}
                      {result.bounceRate != null && parseFloat(String(result.bounceRate)) > 0 && (
                        <div className="p-2 rounded-lg bg-amber/5 border border-amber/20">
                          <p className="text-[10px] font-mono text-amber">Bounce Rate (SimilarWeb)</p>
                          <p className="text-lg font-bold font-mono">{(parseFloat(String(result.bounceRate)) * 100).toFixed(1)}%</p>
                        </div>
                      )}
                    </div>

                    {/* Data Sources Indicator */}
                     <div className="mt-3 flex flex-wrap gap-2">
                       <Badge variant="outline" className="text-[9px] font-mono border-blue-400/30 text-blue-400">
                         Moz: {(result as any).pa > 0 ? 'OK' : 'N/A'}
                       </Badge>
                       <Badge variant="outline" className="text-[9px] font-mono border-orange-400/30 text-orange-400">
                         Ahrefs: N/A
                       </Badge>
                       <Badge variant="outline" className="text-[9px] font-mono border-cyan/30 text-cyan">
                         SimilarWeb: {result.globalRank > 0 || result.totalVisits > 0 ? 'OK' : 'N/A'}
                       </Badge>
                       <Badge variant="outline" className="text-[9px] font-mono border-amber/30 text-amber">
                         Wayback: {result.waybackSnapshots > 0 ? 'OK' : 'N/A'}
                       </Badge>
                       <Badge variant="outline" className="text-[9px] font-mono border-emerald/30 text-emerald">
                         Scraping: {result.isLive ? 'OK' : 'N/A'}
                       </Badge>
                       <Badge variant="outline" className="text-[9px] font-mono border-violet/30 text-violet">
                         Index: {result.indexedPages > 0 ? 'OK' : 'N/A'}
                       </Badge>
                     </div>
                  </CardContent>
                </Card>
              </div>

              {/* Real SEO Metrics Grid */}
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald" />
                    Real SEO Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
                     <MetricCard label="DA" value={result.da} icon={TrendingUp} color="emerald" suffix="Moz" />
                     <MetricCard label="PA" value={(result as any).pa} icon={TrendingUp} color="emerald" suffix="Moz" />
                     <MetricCard label="DR" value={result.dr} icon={TrendingUp} color="cyan" />
                     <MetricCard label="SS" value={result.ss} icon={AlertTriangle} color={result.ss > 30 ? "rose" : "emerald"} suffix={(result as any).dataSources?.mozSpamScore ? "Moz" : "Est"} />
                    <MetricCard label="BL" value={result.bl != null ? (result.bl > 1000 ? `${(result.bl / 1000).toFixed(1)}K` : result.bl) : null} icon={Link2} color="violet" />
                    <MetricCard label="RF" value={result.rf} icon={Globe} color="cyan" />
                    <MetricCard label="TF" value={result.tf} icon={Shield} color="emerald" />
                    <MetricCard label="CF" value={result.cf} icon={Zap} color="amber" />
                  </div>

                  {/* Score Bars */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-muted-foreground">Domain Authority</span>
                        <span className="text-emerald">{result.da ?? 0}/100</span>
                      </div>
                      <ScoreBar value={result.da ?? 0} color="emerald" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-muted-foreground">Domain Rating</span>
                        <span className="text-cyan">{result.dr ?? 0}/100</span>
                      </div>
                      <ScoreBar value={result.dr ?? 0} color="cyan" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-muted-foreground">Trust Flow</span>
                        <span className="text-emerald">{result.tf ?? 0}/100</span>
                      </div>
                      <ScoreBar value={result.tf ?? 0} color="emerald" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-muted-foreground">Spam Score (lower = better)</span>
                        <span className={result.ss > 30 ? "text-rose" : "text-emerald"}>{result.ss ?? 0}/100</span>
                      </div>
                      <ScoreBar value={result.ss ?? 0} color={result.ss > 30 ? "rose" : "emerald"} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Index & Wayback */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="glass-card border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Eye className="w-4 h-4 text-cyan" />
                      Google Index
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-3xl font-bold font-mono text-cyan">
                      {result.indexedPages != null ? result.indexedPages.toLocaleString() : "—"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Estimated indexed pages</p>
                  </CardContent>
                </Card>

                <Card className="glass-card border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Archive className="w-4 h-4 text-amber" />
                      Wayback Machine
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-3xl font-bold font-mono text-amber">
                      {result.waybackSnapshots != null ? result.waybackSnapshots.toLocaleString() : "—"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Snapshots
                      {result.waybackFirstCapture && ` | First: ${result.waybackFirstCapture}`}
                      {result.waybackLastCapture && ` | Last: ${result.waybackLastCapture}`}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Health Score */}
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald" />
                    Health Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="text-2xl sm:text-4xl font-bold font-mono text-emerald">{result.healthScore ?? "—"}</div>
                    <div className="flex-1">
                      <ScoreBar value={result.healthScore ?? 0} color="emerald" />
                    </div>
                    <Badge variant="outline" className={`font-mono text-xs ${
                      result.riskLevel === "LOW" ? "text-emerald border-emerald/30" :
                      result.riskLevel === "MED" || result.riskLevel === "MEDIUM" ? "text-amber border-amber/30" :
                      "text-rose border-rose/30"
                    }`}>
                      Risk: {result.riskLevel || "—"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Explanations */}
              {result.explanations && (
                <Card className="glass-card border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">AI Verdict Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(result.explanations as any)?.reasons?.length > 0 && (
                      <div>
                        <p className="text-xs font-mono text-emerald mb-1.5">Strengths</p>
                        <ul className="space-y-1">
                          {(result.explanations as any).reasons.map((r: string, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <CheckCircle className="w-3 h-3 text-emerald shrink-0 mt-0.5" />{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(result.explanations as any)?.red_flags?.length > 0 && (
                      <div>
                        <p className="text-xs font-mono text-rose mb-1.5">Red Flags</p>
                        <ul className="space-y-1">
                          {(result.explanations as any).red_flags.map((r: string, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <AlertTriangle className="w-3 h-3 text-rose shrink-0 mt-0.5" />{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(result.explanations as any)?.recommendations?.length > 0 && (
                      <div>
                        <p className="text-xs font-mono text-cyan mb-1.5">Recommendations</p>
                        <ul className="space-y-1">
                          {(result.explanations as any).recommendations.map((r: string, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <Shield className="w-3 h-3 text-cyan shrink-0 mt-0.5" />{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bulk" className="space-y-4 mt-4">
          <Card className="glass-card border-border/50">
            <CardContent className="p-5 space-y-3">
              <textarea
                placeholder="วางโดเมน 1 ตัวต่อบรรทัด (สูงสุด 50)"
                value={bulkDomains}
                onChange={(e) => setBulkDomains(e.target.value)}
                className="w-full h-32 bg-muted/30 border border-border/50 rounded-md p-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-emerald/50"
              />
              <div className="flex items-center gap-3">
                <Select value={useCase} onValueChange={setUseCase}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-muted/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USE_CASES.map(uc => (
                      <SelectItem key={uc.value} value={uc.value}>{uc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleBulkScan} disabled={scanning} className="bg-emerald text-background hover:bg-emerald/90">
                  {bulkScanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Globe className="w-4 h-4 mr-1.5" />}
                  Bulk Scan
                </Button>
              </div>
            </CardContent>
          </Card>
          {bulkResults.length > 0 && (
            <Card className="glass-card border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">Domain</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">Score</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">Grade</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">DA</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">DR</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">SS</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">BL</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">RF</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">Wayback</th>
                        <th className="text-left p-3 font-mono text-xs text-muted-foreground">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResults.map((r: any) => (
                        <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20 cursor-pointer" onClick={() => setResult(r)}>
                          <td className="p-3 font-mono text-emerald">{r.domain}</td>
                          <td className="p-3 font-mono">{r.trustScore ?? "—"}</td>
                          <td className="p-3"><Badge className={GRADE_COLORS[r.grade] || "bg-muted"}>{r.grade || "—"}</Badge></td>
                          <td className="p-3 font-mono text-xs">{r.da ?? "—"}</td>
                          <td className="p-3 font-mono text-xs">{r.dr ?? "—"}</td>
                          <td className="p-3 font-mono text-xs">{r.ss ?? "—"}</td>
                          <td className="p-3 font-mono text-xs">{r.bl ?? "—"}</td>
                          <td className="p-3 font-mono text-xs">{r.rf ?? "—"}</td>
                          <td className="p-3 font-mono text-xs">{r.waybackSnapshots ?? "—"}</td>
                          <td className="p-3 font-mono text-xs">{r.verdict || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-mono">
              {history.length} scan records
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Re-scan ทั้งหมด ${history.length} โดเมน ด้วย Moz + SimilarWeb API จริง?\nอาจใช้เวลาหลายนาที`)) {
                  rescanAllMutation.mutate();
                }
              }}
              disabled={scanning || history.length === 0}
              className="border-emerald/30 text-emerald hover:bg-emerald/10"
            >
              {rescanAllMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Re-scanning...</>
              ) : (
                <><Activity className="w-3.5 h-3.5 mr-1.5" />Re-scan All (Moz + SimilarWeb)</>
              )}
            </Button>
          </div>
          <Card className="glass-card border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">Domain</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">Score</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">Grade</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">DA</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">DR</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">SS</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">BL</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">Wayback</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">Verdict</th>
                      <th className="text-left p-3 font-mono text-xs text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">ยังไม่มีประวัติการสแกน</td></tr>
                    ) : history.map((r: any) => (
                      <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20 cursor-pointer" onClick={() => setResult(r)}>
                        <td className="p-3 font-mono text-emerald">{r.domain}</td>
                        <td className="p-3 font-mono">{r.trustScore ?? "—"}</td>
                        <td className="p-3"><Badge className={GRADE_COLORS[r.grade] || "bg-muted"}>{r.grade || "—"}</Badge></td>
                        <td className="p-3 font-mono text-xs">{r.da ?? "—"}</td>
                        <td className="p-3 font-mono text-xs">{r.dr ?? "—"}</td>
                        <td className="p-3 font-mono text-xs">{r.ss ?? "—"}</td>
                        <td className="p-3 font-mono text-xs">{r.bl ?? "—"}</td>
                        <td className="p-3 font-mono text-xs">{r.waybackSnapshots ?? "—"}</td>
                        <td className="p-3 font-mono text-xs">{r.verdict || "—"}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("th-TH") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
