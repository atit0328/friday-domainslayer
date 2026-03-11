/**
 * Target Acquisition — Unified Command Center
 * 
 * Combines all target discovery methods:
 *   1. File Import: Upload/paste .txt domain lists
 *   2. AI SERP Harvest: AI generates keywords → Google.co.th → extract domains
 *   3. Manual Search: Search any keyword on Google Thailand
 *   4. Pipeline Stats: Live stats of queued/attacked/success targets
 *   5. Import History: Full audit trail
 */
import { useState, useCallback, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload, Search, Brain, Target, Crosshair, Globe,
  FileText, Loader2, CheckCircle2, XCircle, Clock,
  Zap, BarChart3, RefreshCw, Play, Skull, AlertTriangle,
  Plus, Trash2, ExternalLink, Copy, ArrowRight,
  Radar, Activity, TrendingUp, Hash, Filter,
} from "lucide-react";

// ═══════════════════════════════════════════════
//  FILE IMPORT TAB
// ═══════════════════════════════════════════════

function FileImportTab() {
  const [text, setText] = useState("");
  const [source, setSource] = useState("web-upload");
  const [tagKeyword, setTagKeyword] = useState("manual-import");
  const [autoQueue, setAutoQueue] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.domainImport.importFromText.useMutation({
    onSuccess: (data) => {
      toast.success(`Import สำเร็จ! ${data.totalImported} domains imported, ${data.totalDuplicate} duplicates skipped`);
      setText("");
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const handleFileRead = useCallback((file: File) => {
    if (!file.name.endsWith(".txt") && !file.name.endsWith(".csv")) {
      toast.error("รองรับเฉพาะไฟล์ .txt และ .csv");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setText(content);
      setSource(`file:${file.name}`);
      toast.info(`โหลดไฟล์ ${file.name} — ${content.split("\n").filter(l => l.trim()).length} lines`);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  const handleImport = () => {
    if (!text.trim()) {
      toast.error("กรุณาใส่ domain list ก่อน");
      return;
    }
    importMutation.mutate({ text, source, tagKeyword, autoQueue, telegramNotify: true });
  };

  const lineCount = text.split("\n").filter(l => l.trim() && !l.trim().startsWith("#")).length;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-emerald bg-emerald/5 scale-[1.01]"
            : "border-border hover:border-emerald/50 hover:bg-card/50"
        }`}
      >
        <Upload className="w-10 h-10 mx-auto mb-3 text-emerald/60" />
        <p className="text-sm font-medium text-foreground">
          ลากไฟล์ .txt มาวางที่นี่ หรือ <span className="text-emerald underline">คลิกเพื่อเลือกไฟล์</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          รองรับ: 1 domain/line, URLs, comma-separated, comments (#)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileRead(file);
          }}
        />
      </div>

      {/* Manual Paste */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">หรือ Paste Domain List</Label>
          {lineCount > 0 && (
            <Badge variant="outline" className="text-emerald border-emerald/30">
              {lineCount} domains
            </Badge>
          )}
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`example.com\nhttps://target-site.com\nwww.another-site.org\n# comment lines are ignored`}
          rows={8}
          className="font-mono text-xs bg-background/50"
        />
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Source Tag</Label>
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="web-upload"
            className="text-xs"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Keyword Tag</Label>
          <Input
            value={tagKeyword}
            onChange={(e) => setTagKeyword(e.target.value)}
            placeholder="manual-import"
            className="text-xs"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={autoQueue} onCheckedChange={setAutoQueue} id="auto-queue" />
            <Label htmlFor="auto-queue" className="text-xs">Auto-queue for Attack</Label>
          </div>
        </div>
      </div>

      {/* Import Button */}
      <Button
        onClick={handleImport}
        disabled={importMutation.isPending || !text.trim()}
        className="w-full bg-emerald hover:bg-emerald/90 text-black font-semibold"
        size="lg"
      >
        {importMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
        ) : (
          <><Zap className="w-4 h-4 mr-2" /> Import {lineCount} Domains → Attack Pipeline</>
        )}
      </Button>

      {/* Result */}
      {importMutation.data && (
        <Card className="border-emerald/30 bg-emerald/5">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-emerald">{importMutation.data.totalImported}</div>
                <div className="text-xs text-muted-foreground">Imported</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-400">{importMutation.data.totalDuplicate}</div>
                <div className="text-xs text-muted-foreground">Duplicates</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-400">{importMutation.data.totalBlacklisted}</div>
                <div className="text-xs text-muted-foreground">Blacklisted</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-muted-foreground">{importMutation.data.totalInvalid}</div>
                <div className="text-xs text-muted-foreground">Invalid</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  AI SERP HARVEST TAB
// ═══════════════════════════════════════════════

function AiHarvestTab() {
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [keywordsPerNiche, setKeywordsPerNiche] = useState(8);
  const [maxResults, setMaxResults] = useState(10);
  const [autoQueue, setAutoQueue] = useState(true);

  const { data: niches, isLoading: nichesLoading } = trpc.serpHarvester.getNiches.useQuery();
  const { data: stats } = trpc.serpHarvester.stats.useQuery();

  const harvestMutation = trpc.serpHarvester.startHarvest.useMutation({
    onSuccess: (data) => {
      toast.success(`Harvest สำเร็จ! ${data.newDomainsImported} domains ใหม่จาก ${data.keywordsSearched} keywords`);
    },
    onError: (err) => toast.error(`Harvest failed: ${err.message}`),
  });

  const previewMutation = trpc.serpHarvester.previewKeywords.useMutation({
    onSuccess: (data) => {
      toast.info(`Generated ${data.keywords.length} keywords for ${data.nicheId}`);
    },
  });

  const toggleNicheMutation = trpc.serpHarvester.toggleNiche.useMutation();

  const handleStartHarvest = () => {
    harvestMutation.mutate({
      nicheIds: selectedNiches.length > 0 ? selectedNiches : undefined,
      keywordsPerNiche,
      maxResultsPerKeyword: maxResults,
      autoQueueForAttack: autoQueue,
    });
  };

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card/50">
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-xl font-bold text-emerald">{stats.totalHarvests}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Harvests</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-xl font-bold text-violet">{stats.totalDomainsImported}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Domains Found</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-xl font-bold text-cyan-400">{stats.totalKeywordsSearched}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Keywords Searched</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-xl font-bold text-amber-400">
                {stats.averageDomainsPerHarvest.toFixed(1)}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg/Harvest</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Niche Selection */}
      <Card className="bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet" />
            เลือก Niche สำหรับ Harvest
          </CardTitle>
          <CardDescription className="text-xs">
            AI จะสร้าง keywords ตาม niche ที่เลือก แล้วค้นหาบน Google.co.th
          </CardDescription>
        </CardHeader>
        <CardContent>
          {nichesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading niches...
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {niches?.map((niche) => (
                <button
                  key={niche.id}
                  onClick={() => {
                    setSelectedNiches(prev =>
                      prev.includes(niche.id)
                        ? prev.filter(id => id !== niche.id)
                        : [...prev, niche.id]
                    );
                  }}
                  className={`p-3 rounded-lg border text-left transition-all text-xs ${
                    selectedNiches.includes(niche.id)
                      ? "border-emerald bg-emerald/10 text-emerald"
                      : niche.enabled
                        ? "border-border hover:border-emerald/40 bg-card/30"
                        : "border-border/50 bg-card/10 opacity-50"
                  }`}
                >
                  <div className="font-medium">{niche.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{niche.nameEn}</div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {niche.seedKeywords.length} seeds
                    </Badge>
                    {niche.enabled ? (
                      <Badge className="text-[9px] px-1 py-0 bg-emerald/20 text-emerald border-0">active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">disabled</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Config */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Keywords / Niche</Label>
          <Select value={String(keywordsPerNiche)} onValueChange={(v) => setKeywordsPerNiche(Number(v))}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[3, 5, 8, 10, 15, 20].map(n => (
                <SelectItem key={n} value={String(n)}>{n} keywords</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Results / Keyword</Label>
          <Select value={String(maxResults)} onValueChange={(v) => setMaxResults(Number(v))}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[3, 5, 7, 10].map(n => (
                <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={autoQueue} onCheckedChange={setAutoQueue} id="harvest-auto-queue" />
            <Label htmlFor="harvest-auto-queue" className="text-xs">Auto-queue Attack</Label>
          </div>
        </div>
      </div>

      {/* Start Button */}
      <Button
        onClick={handleStartHarvest}
        disabled={harvestMutation.isPending}
        className="w-full bg-violet hover:bg-violet/90 text-white font-semibold"
        size="lg"
      >
        {harvestMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI กำลัง Harvest... (อาจใช้เวลา 1-3 นาที)</>
        ) : (
          <><Brain className="w-4 h-4 mr-2" /> Start AI SERP Harvest</>
        )}
      </Button>

      {/* Harvest Result */}
      {harvestMutation.data && (
        <Card className="border-violet/30 bg-violet/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-violet flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Harvest Complete — {harvestMutation.data.status}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-3">
              <div>
                <div className="text-xl font-bold text-emerald">{harvestMutation.data.newDomainsImported}</div>
                <div className="text-[10px] text-muted-foreground">New Domains</div>
              </div>
              <div>
                <div className="text-xl font-bold text-cyan-400">{harvestMutation.data.keywordsSearched}</div>
                <div className="text-[10px] text-muted-foreground">Keywords</div>
              </div>
              <div>
                <div className="text-xl font-bold text-amber-400">{harvestMutation.data.duplicatesSkipped}</div>
                <div className="text-[10px] text-muted-foreground">Duplicates</div>
              </div>
              <div>
                <div className="text-xl font-bold text-muted-foreground">{harvestMutation.data.blacklistedSkipped}</div>
                <div className="text-[10px] text-muted-foreground">Blacklisted</div>
              </div>
            </div>

            {/* Niche Breakdown */}
            {harvestMutation.data.domainsPerNiche && Object.keys(harvestMutation.data.domainsPerNiche).length > 0 && (
              <div className="space-y-1.5 mt-3">
                <div className="text-xs font-medium text-muted-foreground">Niche Breakdown:</div>
                {Object.entries(harvestMutation.data.domainsPerNiche).map(([niche, count]) => (
                  <div key={niche} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-card/50">
                    <span className="text-foreground">{niche}</span>
                    <Badge variant="outline" className="text-emerald border-emerald/30">{count as number} domains</Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Top Domains */}
            {harvestMutation.data.topDomains && harvestMutation.data.topDomains.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Top Domains Found:</div>
                <div className="space-y-1">
                  {harvestMutation.data.topDomains.slice(0, 8).map((d: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-card/50">
                      <span className="text-emerald font-mono w-5 text-right">{i + 1}.</span>
                      <Globe className="w-3 h-3 text-muted-foreground" />
                      <span className="text-foreground font-mono">{d.domain}</span>
                      {d.niche && <Badge variant="outline" className="text-[9px] px-1 py-0">{d.niche}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  MANUAL SEARCH TAB
// ═══════════════════════════════════════════════

function ManualSearchTab() {
  const [keyword, setKeyword] = useState("");
  const [maxResults, setMaxResults] = useState(10);

  const searchMutation = trpc.serpHarvester.searchKeyword.useMutation({
    onSuccess: (data) => {
      toast.success(`พบ ${data.domains.length} domains สำหรับ "${data.keyword}"`);
    },
    onError: (err) => toast.error(`Search failed: ${err.message}`),
  });

  const importMutation = trpc.domainImport.importDomains.useMutation({
    onSuccess: (data) => {
      toast.success(`Import สำเร็จ! ${data.totalImported} domains → Attack Pipeline`);
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const handleSearch = () => {
    if (!keyword.trim()) {
      toast.error("กรุณาใส่ keyword");
      return;
    }
    searchMutation.mutate({ keyword: keyword.trim(), maxResults });
  };

  const handleImportAll = () => {
    if (!searchMutation.data?.domains.length) return;
    const domains = searchMutation.data.domains.map((d: any) => d.domain || d);
    importMutation.mutate({
      domains,
      source: "manual-search",
      tagKeyword: keyword,
      autoQueue: true,
    });
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="พิมพ์ keyword ค้นหาบน Google.co.th..."
            className="pl-9 text-sm"
          />
        </div>
        <Select value={String(maxResults)} onValueChange={(v) => setMaxResults(Number(v))}>
          <SelectTrigger className="w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[3, 5, 7, 10].map(n => (
              <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={handleSearch}
          disabled={searchMutation.isPending || !keyword.trim()}
          className="bg-cyan-500 hover:bg-cyan-600 text-white"
        >
          {searchMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <><Search className="w-4 h-4 mr-1" /> Search</>
          )}
        </Button>
      </div>

      {/* Search Results */}
      {searchMutation.data && (
        <Card className="border-cyan-500/30 bg-cyan-500/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-cyan-400 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                ผลค้นหา "{searchMutation.data.keyword}" — {searchMutation.data.domains.length} domains
              </CardTitle>
              {searchMutation.data.domains.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleImportAll}
                  disabled={importMutation.isPending}
                  className="bg-emerald hover:bg-emerald/90 text-black text-xs"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Zap className="w-3 h-3 mr-1" />
                  )}
                  Import All → Attack
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {searchMutation.data.domains.map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-card/50 hover:bg-card/80 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-mono w-5 text-right font-bold">#{i + 1}</span>
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono text-foreground">{d.domain || d}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.title && (
                      <span className="text-muted-foreground max-w-[200px] truncate hidden sm:inline">{d.title}</span>
                    )}
                    <a
                      href={`https://${d.domain || d}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-cyan-400"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Related Searches */}
            {searchMutation.data.relatedSearches && searchMutation.data.relatedSearches.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-xs font-medium text-muted-foreground mb-2">Related Searches:</div>
                <div className="flex flex-wrap gap-1.5">
                  {searchMutation.data.relatedSearches.map((rs: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => { setKeyword(rs); }}
                      className="text-[10px] px-2 py-1 rounded-full bg-card/50 border border-border/50 text-muted-foreground hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
                    >
                      {rs}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  PIPELINE STATS
// ═══════════════════════════════════════════════

function PipelineStats() {
  const { data: discoveryStats, isLoading } = trpc.keywordDiscovery.getStats.useQuery();
  const { data: harvestStats } = trpc.serpHarvester.stats.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-emerald" />
      </div>
    );
  }

  const targetsByStatus = discoveryStats?.targetsByStatus || {};
  const totalTargets = discoveryStats?.totalTargets || 0;
  const queued = (targetsByStatus["queued"] || 0) + (targetsByStatus["discovered"] || 0);
  const attacking = targetsByStatus["attacking"] || 0;
  const success = targetsByStatus["success"] || 0;
  const failed = targetsByStatus["failed"] || 0;
  const successRate = totalTargets > 0 ? Math.round((success / totalTargets) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="bg-card/50 border-emerald/20">
          <CardContent className="pt-3 pb-3 text-center">
            <Target className="w-5 h-5 mx-auto mb-1 text-emerald" />
            <div className="text-2xl font-bold text-emerald">{totalTargets}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Targets</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-amber-400/20">
          <CardContent className="pt-3 pb-3 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-amber-400" />
            <div className="text-2xl font-bold text-amber-400">{queued}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Queued</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-violet/20">
          <CardContent className="pt-3 pb-3 text-center">
            <Crosshair className="w-5 h-5 mx-auto mb-1 text-violet animate-pulse" />
            <div className="text-2xl font-bold text-violet">{attacking}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Attacking</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-emerald/20">
          <CardContent className="pt-3 pb-3 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald" />
            <div className="text-2xl font-bold text-emerald">{success}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Success</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-red-500/20">
          <CardContent className="pt-3 pb-3 text-center">
            <XCircle className="w-5 h-5 mx-auto mb-1 text-red-400" />
            <div className="text-2xl font-bold text-red-400">{failed}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed</div>
          </CardContent>
        </Card>
      </div>

      {/* Success Rate Bar */}
      <Card className="bg-card/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Attack Success Rate</span>
            <span className="text-sm font-bold text-emerald">{successRate}%</span>
          </div>
          <Progress value={successRate} className="h-2" />
          <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
            <span>SerpAPI Remaining: {discoveryStats?.serpApiRemaining ?? "N/A"}</span>
            <span>Keywords: {discoveryStats?.totalKeywords ?? 0} ({discoveryStats?.activeKeywords ?? 0} active)</span>
          </div>
        </CardContent>
      </Card>

      {/* Top Keywords */}
      {discoveryStats?.topKeywords && discoveryStats.topKeywords.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald" />
              Top Keywords by Targets Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {discoveryStats.topKeywords.slice(0, 10).map((kw: { keyword: string; targetsFound: number }, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-background/50">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald font-mono w-5 text-right">{i + 1}.</span>
                    <span className="text-foreground">{kw.keyword}</span>
                  </div>
                  <Badge variant="outline" className="text-emerald border-emerald/30 text-[10px]">
                    {kw.targetsFound} targets
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  IMPORT HISTORY TAB
// ═══════════════════════════════════════════════

function ImportHistoryTab() {
  const { data: fileHistory } = trpc.domainImport.history.useQuery();
  const { data: harvestHistory } = trpc.serpHarvester.history.useQuery();

  // Merge and sort by date
  const allHistory = useMemo(() => {
    const items: Array<{
      type: "file" | "harvest";
      id: string;
      date: number;
      domainsImported: number;
      duplicates: number;
      source: string;
      details?: any;
    }> = [];

    if (fileHistory) {
      for (const h of fileHistory) {
        items.push({
          type: "file",
          id: h.importId,
          date: h.importedAt,
          domainsImported: h.totalImported,
          duplicates: h.totalDuplicate,
          source: "file-upload",
        });
      }
    }

    if (harvestHistory) {
      for (const h of harvestHistory) {
        items.push({
          type: "harvest",
          id: h.harvestId,
          date: h.startedAt,
          domainsImported: h.newDomainsImported,
          duplicates: h.duplicatesSkipped,
          source: `AI Harvest (${h.nichesProcessed} niches)`,
          details: h,
        });
      }
    }

    return items.sort((a, b) => b.date - a.date);
  }, [fileHistory, harvestHistory]);

  if (allHistory.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">ยังไม่มีประวัติ Import</p>
        <p className="text-xs mt-1">เริ่มต้นด้วยการ Import ไฟล์หรือ AI Harvest</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2">
        {allHistory.map((item, i) => (
          <Card key={i} className="bg-card/50 hover:bg-card/80 transition-colors">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.type === "file" ? (
                    <FileText className="w-4 h-4 text-emerald" />
                  ) : (
                    <Brain className="w-4 h-4 text-violet" />
                  )}
                  <div>
                    <div className="text-xs font-medium text-foreground">{item.source}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(item.date).toLocaleString("th-TH")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="text-center">
                    <div className="font-bold text-emerald">{item.domainsImported}</div>
                    <div className="text-[9px] text-muted-foreground">imported</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-amber-400">{item.duplicates}</div>
                    <div className="text-[9px] text-muted-foreground">dupes</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={item.type === "file" ? "text-emerald border-emerald/30" : "text-violet border-violet/30"}
                  >
                    {item.type === "file" ? "File" : "AI"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

// ═══════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════

export default function TargetAcquisition() {
  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald/20 to-violet/20 border border-emerald/30 flex items-center justify-center">
            <Radar className="w-5 h-5 text-emerald" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Target Acquisition</h1>
            <p className="text-xs text-muted-foreground">
              ค้นหาเป้าหมาย — File Import + AI SERP Harvest + Manual Search → Attack Pipeline
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="file-import" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-card/50">
          <TabsTrigger value="file-import" className="text-xs gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">File Import</span>
          </TabsTrigger>
          <TabsTrigger value="ai-harvest" className="text-xs gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Harvest</span>
          </TabsTrigger>
          <TabsTrigger value="manual-search" className="text-xs gap-1.5">
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search</span>
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pipeline</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="file-import" className="mt-4">
          <FileImportTab />
        </TabsContent>

        <TabsContent value="ai-harvest" className="mt-4">
          <AiHarvestTab />
        </TabsContent>

        <TabsContent value="manual-search" className="mt-4">
          <ManualSearchTab />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineStats />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ImportHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
