/**
 * Batch Attack — Multi-domain simultaneous attack interface
 * Upload .txt file or paste domain list, configure concurrency, track progress
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Rocket, Upload, Play, Square, RotateCcw, CheckCircle2, XCircle, Clock,
  Loader2, AlertTriangle, FileText, Trash2, ChevronDown, ChevronUp,
  Zap, Shield, BarChart3, Timer,
} from "lucide-react";
import { toast } from "sonner";

export default function BatchAttack() {
  // ─── State ───
  const [domainText, setDomainText] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Parsed domains ───
  const parsedDomains = useMemo(() => {
    if (!domainText.trim()) return [];
    const lines = domainText.split(/\r?\n/);
    const domains: string[] = [];
    const seen = new Set<string>();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;
      const cleaned = line.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
      const match = cleaned.match(/^([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}$/);
      if (match && !seen.has(cleaned)) {
        seen.add(cleaned);
        domains.push(cleaned);
      }
    }
    return domains;
  }, [domainText]);

  // ─── tRPC mutations ───
  const startMutation = trpc.batchAttack.start.useMutation({
    onSuccess: (data) => {
      setActiveBatchId(data.batchId);
      toast.success(`Batch Attack เริ่มแล้ว! ${data.totalDomains} domains`);
    },
    onError: (err) => toast.error(`เริ่ม batch ล้มเหลว: ${err.message}`),
  });

  const cancelMutation = trpc.batchAttack.cancel.useMutation({
    onSuccess: () => toast.info("Batch Attack หยุดแล้ว"),
    onError: (err) => toast.error(`หยุด batch ล้มเหลว: ${err.message}`),
  });

  // ─── tRPC queries ───
  const activeBatches = trpc.batchAttack.active.useQuery(undefined, {
    refetchInterval: activeBatchId ? 3000 : 10000,
  });

  const batchStatus = trpc.batchAttack.status.useQuery(
    { batchId: activeBatchId || "" },
    { enabled: !!activeBatchId, refetchInterval: 2000 },
  );

  const history = trpc.batchAttack.history.useQuery(
    { limit: 20 },
    { enabled: showHistory },
  );

  // ─── Auto-detect completed batch ───
  useEffect(() => {
    if (batchStatus.data && (batchStatus.data as any).status === "completed") {
      // Batch completed
    }
  }, [batchStatus.data]);

  // ─── Handlers ───
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".txt") && file.type !== "text/plain") {
      toast.error("รองรับเฉพาะไฟล์ .txt");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("ไฟล์ใหญ่เกินไป (สูงสุด 1MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setDomainText(text);
      toast.success(`โหลดไฟล์ ${file.name} สำเร็จ`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleStart = useCallback(() => {
    if (parsedDomains.length === 0) {
      toast.error("ไม่พบโดเมนที่ถูกต้อง");
      return;
    }
    if (parsedDomains.length > 500) {
      toast.error("รองรับสูงสุด 500 โดเมนต่อ batch");
      return;
    }
    startMutation.mutate({
      domains: parsedDomains,
      redirectUrl: redirectUrl || undefined,
      maxConcurrent,
      source: "web",
    });
  }, [parsedDomains, redirectUrl, maxConcurrent, startMutation]);

  const handleCancel = useCallback((batchId: string) => {
    cancelMutation.mutate({ batchId });
  }, [cancelMutation]);

  // ─── Active batch data ───
  const currentBatch = batchStatus.data as any;
  const allActive = (activeBatches.data || []) as any[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Rocket className="w-6 h-6 text-emerald-400" />
            Batch Attack Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            โจมตีหลายโดเมนพร้อมกัน — อัพโหลดไฟล์ .txt หรือวางรายชื่อโดเมน
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allActive.length > 0 && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-400">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              {allActive.length} batch running
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Input Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                Domain List
              </CardTitle>
              <CardDescription>
                วาง domain 1 ตัวต่อบรรทัด หรืออัพโหลดไฟล์ .txt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File upload */}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload .txt
                </Button>
                {domainText && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDomainText("")}
                    className="gap-2 text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Domain textarea */}
              <Textarea
                value={domainText}
                onChange={(e) => setDomainText(e.target.value)}
                placeholder={`example.com\ntarget-site.org\nanother-domain.net\n\n# Lines starting with # are ignored`}
                className="min-h-[200px] font-mono text-sm bg-background/50"
              />

              {/* Domain count */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {parsedDomains.length > 0 ? (
                    <span className="text-emerald-400 font-medium">
                      {parsedDomains.length} โดเมนที่ถูกต้อง
                    </span>
                  ) : (
                    "ยังไม่มีโดเมน"
                  )}
                </span>
                {parsedDomains.length > 10 && (
                  <span className="text-muted-foreground">
                    Preview: {parsedDomains.slice(0, 5).join(", ")}...
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active Batch Progress */}
          {currentBatch && (
            <BatchProgressCard
              batch={currentBatch}
              onCancel={handleCancel}
            />
          )}

          {/* Other active batches */}
          {allActive.filter(b => b.batchId !== activeBatchId).map(batch => (
            <BatchProgressCard
              key={batch.batchId}
              batch={batch}
              onCancel={handleCancel}
            />
          ))}
        </div>

        {/* Right: Config Panel */}
        <div className="space-y-4">
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5 text-violet-400" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Redirect URL */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Redirect URL (optional)
                </label>
                <Input
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  placeholder="Auto-pick from pool"
                  className="bg-background/50"
                />
                <p className="text-xs text-muted-foreground">
                  ถ้าไม่ระบุ ระบบจะเลือกจาก redirect pool อัตโนมัติ
                </p>
              </div>

              {/* Concurrency */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Concurrency
                </label>
                <div className="flex items-center gap-2">
                  {[1, 3, 5, 10].map(n => (
                    <Button
                      key={n}
                      variant={maxConcurrent === n ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMaxConcurrent(n)}
                      className={maxConcurrent === n ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    >
                      {n}x
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  จำนวนโดเมนที่โจมตีพร้อมกัน (3x แนะนำ)
                </p>
              </div>

              <Separator />

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 rounded-lg bg-background/30">
                  <div className="text-2xl font-bold text-emerald-400">{parsedDomains.length}</div>
                  <div className="text-xs text-muted-foreground">Domains</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-background/30">
                  <div className="text-2xl font-bold text-violet-400">{maxConcurrent}x</div>
                  <div className="text-xs text-muted-foreground">Parallel</div>
                </div>
              </div>

              {/* Estimated time */}
              {parsedDomains.length > 0 && (
                <div className="text-center p-3 rounded-lg bg-background/30">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Timer className="w-4 h-4" />
                    Est. {Math.ceil(parsedDomains.length / maxConcurrent * 5)} - {Math.ceil(parsedDomains.length / maxConcurrent * 10)} min
                  </div>
                </div>
              )}

              <Separator />

              {/* Start button */}
              <Button
                onClick={handleStart}
                disabled={parsedDomains.length === 0 || startMutation.isPending}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
              >
                {startMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                Start Batch Attack ({parsedDomains.length} domains)
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-400" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Batches</span>
                <Badge variant="outline">{allActive.length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Running</span>
                <Badge variant="outline">
                  {allActive.reduce((sum: number, b: any) => sum + (b.running || 0), 0)} domains
                </Badge>
              </div>
              <Separator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showHistory ? "Hide" : "Show"} History
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* History */}
      {showHistory && (
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Batch History</CardTitle>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : history.data?.batches.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">ยังไม่มีประวัติ batch attack</p>
            ) : (
              <div className="space-y-3">
                {history.data?.batches.map((batch: any) => (
                  <div
                    key={batch.batchId}
                    className="flex items-center justify-between p-3 rounded-lg bg-background/30 hover:bg-background/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        batch.status === "completed" ? "bg-emerald-400" :
                        batch.status === "cancelled" ? "bg-amber-400" : "bg-blue-400"
                      }`} />
                      <div>
                        <div className="text-sm font-medium">
                          {batch.totalDomains} domains
                          <span className="text-muted-foreground ml-2">
                            via {batch.source}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {batch.startedAt ? new Date(batch.startedAt).toLocaleString() : "—"}
                          {batch.totalDurationMs ? ` (${formatDuration(batch.totalDurationMs)})` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {batch.success}
                      </Badge>
                      <Badge variant="outline" className="text-red-400 border-red-500/30">
                        <XCircle className="w-3 h-3 mr-1" />
                        {batch.failed}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-components ───

function Settings({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function BatchProgressCard({ batch, onCancel }: { batch: any; onCancel: (id: string) => void }) {
  const isRunning = batch.status === "running" || (batch.pending > 0 || batch.running > 0);
  const isCompleted = batch.status === "completed" || (!isRunning && batch.pending === 0 && batch.running === 0);
  const successRate = batch.totalDomains > 0
    ? Math.round((batch.success / batch.totalDomains) * 100)
    : 0;

  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`border-border/50 backdrop-blur ${
      isRunning ? "bg-card/50 border-amber-500/30" :
      isCompleted && batch.success > 0 ? "bg-card/50 border-emerald-500/30" :
      "bg-card/50 border-red-500/30"
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            ) : batch.success > 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            Batch {batch.batchId?.substring(0, 12)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCancel(batch.batchId)}
                className="text-red-400 hover:text-red-300 gap-1"
              >
                <Square className="w-3 h-3" />
                Stop
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <Progress
          value={batch.progressPercent || 0}
          className="h-2"
        />

        {/* Stats row */}
        <div className="grid grid-cols-5 gap-2 text-center text-sm">
          <div>
            <div className="font-bold text-foreground">{batch.totalDomains}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div>
            <div className="font-bold text-emerald-400">{batch.success}</div>
            <div className="text-xs text-muted-foreground">Success</div>
          </div>
          <div>
            <div className="font-bold text-red-400">{batch.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div>
            <div className="font-bold text-amber-400">{batch.running || 0}</div>
            <div className="text-xs text-muted-foreground">Running</div>
          </div>
          <div>
            <div className="font-bold text-muted-foreground">{batch.pending || 0}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
        </div>

        {/* Success rate */}
        {isCompleted && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Success Rate</span>
            <span className={`font-bold ${successRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
              {successRate}%
            </span>
          </div>
        )}

        {/* Domain details */}
        {expanded && batch.domains && (
          <div className="space-y-1 mt-3 max-h-[300px] overflow-y-auto">
            <Separator />
            {(Array.isArray(batch.domains) ? batch.domains : []).map((d: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-background/30"
              >
                <div className="flex items-center gap-2">
                  {d.status === "success" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : d.status === "failed" ? (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : d.status === "running" ? (
                    <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs">{d.domain}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {d.durationMs && <span>{formatDuration(d.durationMs)}</span>}
                  {d.verifiedRedirects > 0 && (
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px] px-1">
                      {d.verifiedRedirects} redirects
                    </Badge>
                  )}
                  {d.retryCount > 0 && (
                    <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px] px-1">
                      {d.retryCount} retries
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ───

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}
