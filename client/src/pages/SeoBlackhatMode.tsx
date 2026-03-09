import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Skull, Zap, Globe, Shield, AlertTriangle, Play, Target,
  Code, Eye, Link2, FileCode, Bug, Crosshair, Network,
  Layers, ChevronRight, Loader2, Search, Lock, Bomb,
  BarChart3, ShieldAlert, Radio, Cpu, Workflow,
} from "lucide-react";

// Phase icons and colors
const PHASE_CONFIG = [
  { icon: Bomb, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", label: "Phase 1: Web Compromise" },
  { icon: Search, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", label: "Phase 2: Index Manipulation" },
  { icon: Workflow, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "Phase 3: Redirect Chain" },
  { icon: BarChart3, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30", label: "Phase 4: Monetization" },
  { icon: Skull, color: "text-red-600", bg: "bg-red-600/10", border: "border-red-600/30", label: "Phase 5: Advanced Attacks" },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  info: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function SeoBlackhatMode() {
  const { user, loading } = useAuth();
  const [domain, setDomain] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [activeTab, setActiveTab] = useState("launch");
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);

  // Superadmin access guard
  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!user || user.role !== "superadmin") {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-red-400">Superadmin Access Required</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Blackhat Mode สามารถเข้าถึงได้เฉพาะ Superadmin เท่านั้น
          ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เข้าถึง
        </p>
      </div>
    );
  }

  // tRPC mutations
  const runFullChain = trpc.blackhat.runFullChain.useMutation({
    onSuccess: (data) => {
      toast.success(`Full chain complete: ${data.totalPayloads} payloads generated`);
      setActiveTab("results");
    },
    onError: (err) => toast.error(err.message),
  });

  const runPhase = trpc.blackhat.runPhase.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.name}: ${data.payloads.length} payloads`);
      setSelectedPhase(data.phase);
    },
    onError: (err) => toast.error(err.message),
  });

  const runCapability = trpc.blackhat.runCapability.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.capability}: ${data.results.length} results`);
    },
    onError: (err) => toast.error(err.message),
  });

  // Capabilities list
  const capsQuery = trpc.blackhat.capabilities.useQuery();

  // Detection query (only when domain is set and results tab active)
  const [detectDomain, setDetectDomain] = useState("");
  const detectQuery = trpc.blackhat.detect.useQuery(
    { domain: detectDomain },
    { enabled: !!detectDomain }
  );

  const report = runFullChain.data;
  const phaseResult = runPhase.data;
  const capResult = runCapability.data;

  const isRunning = runFullChain.isPending || runPhase.isPending || runCapability.isPending;

  const handleRunFullChain = () => {
    if (!domain.trim()) { toast.error("กรุณาใส่โดเมน"); return; }
    runFullChain.mutate({ domain: domain.trim(), redirectUrl: redirectUrl.trim() || undefined });
  };

  const handleRunPhase = (phase: number) => {
    if (!domain.trim()) { toast.error("กรุณาใส่โดเมน"); return; }
    runPhase.mutate({ domain: domain.trim(), phase, redirectUrl: redirectUrl.trim() || undefined });
  };

  const handleRunCapability = (capability: string) => {
    if (!domain.trim()) { toast.error("กรุณาใส่โดเมน"); return; }
    runCapability.mutate({
      domain: domain.trim(),
      capability: capability as any,
      redirectUrl: redirectUrl.trim() || undefined,
    });
  };

  const handleDetect = () => {
    if (!domain.trim()) { toast.error("กรุณาใส่โดเมน"); return; }
    setDetectDomain(domain.trim());
    setActiveTab("detect");
  };

  return (
    <div className="space-y-6">
      {/* Beta Warning */}
      <div className="rounded-lg border border-yellow-500/40 bg-yellow-950/20 p-3 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-yellow-300">⚠️ BETA — ระบบอยู่ระหว่างการทดสอบ</p>
          <p className="text-xs text-yellow-400/70">ฟีเจอร์ทั้งหมดอยู่ในขั้น Beta อาจมีข้อผิดพลาด ใช้งานด้วยความระมัดระวัง</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <Skull className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            SEO BLACKHAT MODE
            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">
              OFFENSIVE
            </Badge>
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
              BETA
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Full Attack Chain Analysis — ใส่แค่โดเมน ระบบจะวิเคราะห์ครบ 5 Phases, 16+ Capabilities
          </p>
        </div>
      </div>

      {/* Domain Input */}
      <Card className="border-red-500/20 bg-gradient-to-r from-red-500/5 to-transparent">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Target Domain</span>
              </div>
              <Input
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="bg-background/50"
                onKeyDown={(e) => e.key === "Enter" && handleRunFullChain()}
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Redirect URL (optional)</span>
              </div>
              <Input
                placeholder="https://spam-destination.example.com"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={handleRunFullChain}
                disabled={isRunning || !domain.trim()}
                className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
              >
                {runFullChain.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Running...</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" /> Run Full Chain</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleDetect}
                disabled={isRunning || !domain.trim()}
                className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 whitespace-nowrap"
              >
                <Shield className="h-4 w-4 mr-2" /> Detect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="launch">
            <Zap className="h-4 w-4 mr-1" /> Launch
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!report}>
            <BarChart3 className="h-4 w-4 mr-1" /> Results
          </TabsTrigger>
          <TabsTrigger value="detect">
            <Shield className="h-4 w-4 mr-1" /> Detect
          </TabsTrigger>
          <TabsTrigger value="arsenal">
            <Layers className="h-4 w-4 mr-1" /> Arsenal
          </TabsTrigger>
        </TabsList>

        {/* ═══ LAUNCH TAB ═══ */}
        <TabsContent value="launch" className="space-y-4">
          {/* Attack Chain Flow */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Workflow className="h-5 w-5 text-red-500" />
                Attack Chain Flow
              </CardTitle>
              <CardDescription>คลิกที่แต่ละ Phase เพื่อรันแยก หรือกด "Run Full Chain" เพื่อรันทั้งหมด</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-stretch gap-3">
                {PHASE_CONFIG.map((phase, i) => {
                  const Icon = phase.icon;
                  return (
                    <div key={i} className="flex items-center gap-2 flex-1">
                      <button
                        onClick={() => handleRunPhase(i + 1)}
                        disabled={isRunning || !domain.trim()}
                        className={`flex-1 p-4 rounded-lg border ${phase.border} ${phase.bg} hover:opacity-80 transition-all text-left disabled:opacity-40`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`h-5 w-5 ${phase.color}`} />
                          <span className="font-semibold text-sm">{phase.label.split(":")[0]}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{phase.label.split(": ")[1]}</p>
                        {runPhase.isPending && selectedPhase === null && (
                          <Loader2 className="h-3 w-3 animate-spin mt-1" />
                        )}
                      </button>
                      {i < 4 && <ChevronRight className="h-4 w-4 text-muted-foreground hidden md:block shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Phase Result (if ran single phase) */}
          {phaseResult && (
            <Card className="border-orange-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  {(() => { const Icon = PHASE_CONFIG[phaseResult.phase - 1]?.icon || Zap; return <Icon className={`h-5 w-5 ${PHASE_CONFIG[phaseResult.phase - 1]?.color}`} />; })()}
                  Phase {phaseResult.phase}: {phaseResult.name}
                  <Badge variant="outline" className="ml-2">Risk: {phaseResult.riskLevel}/10</Badge>
                </CardTitle>
                <CardDescription>{phaseResult.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {phaseResult.payloads.map((p, i) => (
                      <PayloadCard key={i} payload={p} index={i} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Single Capability Result */}
          {capResult && (
            <Card className="border-purple-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Code className="h-5 w-5 text-purple-500" />
                  {capResult.capability}
                  <Badge variant="outline">{capResult.results.length} results</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {capResult.results.map((r: any, i: number) => (
                      <PayloadCard key={i} payload={r} index={i} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ RESULTS TAB ═══ */}
        <TabsContent value="results" className="space-y-4">
          {report && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: "Payloads", value: report.totalPayloads, icon: Code, color: "text-red-500" },
                  { label: "Pages", value: report.totalPages, icon: FileCode, color: "text-orange-500" },
                  { label: "Implants", value: report.totalImplants, icon: Bug, color: "text-yellow-500" },
                  { label: "Gates", value: report.totalGates, icon: Radio, color: "text-purple-500" },
                  { label: "Parasites", value: report.totalParasites, icon: Crosshair, color: "text-green-500" },
                  { label: "Neg SEO", value: report.totalNegativeAttacks, icon: Bomb, color: "text-red-600" },
                  { label: "Chains", value: report.totalRedirectChains, icon: Network, color: "text-blue-500" },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <Card key={stat.label} className="bg-card/50">
                      <CardContent className="p-3 text-center">
                        <Icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Phase-by-Phase Results */}
              <div className="space-y-4">
                {report.phases.map((phase, i) => {
                  const config = PHASE_CONFIG[i];
                  const Icon = config?.icon || Zap;
                  return (
                    <Card key={phase.phase} className={`border ${config?.border || "border-border"}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Icon className={`h-5 w-5 ${config?.color}`} />
                            Phase {phase.phase}: {phase.name}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              Risk: {phase.riskLevel}/10
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {phase.payloads.length} payloads
                            </Badge>
                          </div>
                        </div>
                        <CardDescription>{phase.summary}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {phase.capabilities.map((cap) => (
                            <Badge key={cap} variant="secondary" className="text-xs">
                              {cap}
                            </Badge>
                          ))}
                        </div>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-2">
                            {phase.payloads.map((p, j) => (
                              <PayloadCard key={j} payload={p} index={j} compact />
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* AI Analysis */}
              {report.aiAnalysis && (
                <Card className="border-red-500/30 bg-gradient-to-br from-red-500/5 to-transparent">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-red-500" />
                      AI Vulnerability Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap">
                      {report.aiAnalysis}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Detection Summary */}
              <Card className="border-yellow-500/30">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5 text-yellow-500" />
                    Detection Indicators ({report.detection.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {report.detection.map((d, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
                        <Badge variant="outline" className={`text-xs shrink-0 ${SEVERITY_COLORS[d.severity]}`}>
                          {d.severity.toUpperCase()}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{d.indicator}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{d.description}</div>
                          <div className="text-xs text-green-400 mt-1">
                            <Shield className="h-3 w-3 inline mr-1" />
                            {d.recommendation}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Elapsed Time */}
              <div className="text-center text-sm text-muted-foreground">
                Full chain completed in {(report.elapsed / 1000).toFixed(1)}s for {report.targetDomain}
              </div>
            </>
          )}

          {!report && (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <Skull className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground">ยังไม่มีผลลัพธ์ — กด "Run Full Chain" เพื่อเริ่มวิเคราะห์</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ DETECT TAB ═══ */}
        <TabsContent value="detect" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-yellow-500" />
                SEO Spam Detection Scanner
              </CardTitle>
              <CardDescription>
                สแกนโดเมนเพื่อตรวจหา SEO spam indicators — 12 จุดตรวจสอบ
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detectQuery.data ? (
                <div className="space-y-3">
                  {/* Severity summary */}
                  <div className="flex gap-3 mb-4">
                    {(["critical", "high", "medium", "low"] as const).map((sev) => {
                      const count = detectQuery.data.filter((d) => d.severity === sev).length;
                      return (
                        <Badge key={sev} variant="outline" className={`${SEVERITY_COLORS[sev]}`}>
                          {sev.toUpperCase()}: {count}
                        </Badge>
                      );
                    })}
                  </div>

                  {detectQuery.data.map((d, i) => (
                    <div key={i} className="p-4 rounded-lg bg-card/50 border border-border/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={`text-xs ${SEVERITY_COLORS[d.severity]}`}>
                          {d.severity.toUpperCase()}
                        </Badge>
                        <span className="font-medium">{d.indicator}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{d.description}</p>
                      <div className="text-sm text-green-400 flex items-start gap-1.5">
                        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{d.recommendation}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : detectDomain ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-yellow-500" />
                  <p className="text-muted-foreground">Scanning {detectDomain}...</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                  <p className="text-muted-foreground">ใส่โดเมนด้านบนแล้วกด "Detect" เพื่อสแกน</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ ARSENAL TAB ═══ */}
        <TabsContent value="arsenal" className="space-y-4">
          {capsQuery.data ? (
            <>
              {capsQuery.data.phases.map((phase, i) => {
                const config = PHASE_CONFIG[i];
                const Icon = config?.icon || Zap;
                return (
                  <Card key={phase.phase} className={`border ${config?.border || "border-border"}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${config?.color}`} />
                        Phase {phase.phase}: {phase.name}
                        <Badge variant="outline" className="text-xs ml-2">Risk: {phase.riskLevel}/10</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {phase.capabilities.map((cap) => (
                          <div
                            key={cap.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50 hover:border-red-500/30 transition-colors"
                          >
                            <div className="flex-1 min-w-0 mr-3">
                              <div className="font-medium text-sm">{cap.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{cap.description}</div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRunCapability(cap.id)}
                              disabled={isRunning || !domain.trim()}
                              className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
                            >
                              {runCapability.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Defense */}
              <Card className="border-green-500/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-5 w-5 text-green-500" />
                    Defense: {capsQuery.data.defense.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50">
                    <div>
                      <div className="font-medium text-sm">{capsQuery.data.defense.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{capsQuery.data.defense.description}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDetect}
                      disabled={isRunning || !domain.trim()}
                      className="shrink-0 border-green-500/30 text-green-400 hover:bg-green-500/10"
                    >
                      <Shield className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading arsenal...</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══ Payload Card Component ═══
function PayloadCard({ payload, index, compact }: { payload: any; index: number; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border border-border/50 bg-card/30 overflow-hidden ${compact ? "p-2" : "p-3"}`}
    >
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <Badge variant="secondary" className="text-xs font-mono shrink-0">
          #{index + 1}
        </Badge>
        <Badge variant="outline" className="text-xs shrink-0 bg-red-500/10 text-red-400 border-red-500/30">
          {payload.type || "unknown"}
        </Badge>
        {payload.technique && (
          <span className="text-xs text-muted-foreground truncate flex-1">{payload.technique}</span>
        )}
        {payload.size && (
          <span className="text-xs text-muted-foreground shrink-0">{payload.size}B</span>
        )}
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`} />
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {payload.technique && (
            <div className="text-xs">
              <span className="text-muted-foreground">Technique: </span>
              <span className="text-yellow-400">{payload.technique}</span>
            </div>
          )}
          {payload.effect && (
            <div className="text-xs">
              <span className="text-muted-foreground">Effect: </span>
              <span className="text-orange-400">{payload.effect}</span>
            </div>
          )}
          {payload.features && (
            <div className="flex flex-wrap gap-1">
              {(payload.features as string[]).map((f: string) => (
                <Badge key={f} variant="secondary" className="text-xs">
                  {f}
                </Badge>
              ))}
            </div>
          )}
          {payload.code && (
            <div className="mt-2">
              <ScrollArea className="h-[200px]">
                <pre className="text-xs bg-black/50 p-3 rounded-md overflow-x-auto">
                  <code>{payload.code}</code>
                </pre>
              </ScrollArea>
            </div>
          )}
          {/* Show other fields */}
          {payload.sampleUrls && (
            <div className="text-xs">
              <span className="text-muted-foreground">Sample URLs:</span>
              <ul className="list-disc list-inside mt-1">
                {(payload.sampleUrls as string[]).slice(0, 3).map((u: string, i: number) => (
                  <li key={i} className="text-blue-400 truncate">{u}</li>
                ))}
              </ul>
            </div>
          )}
          {payload.sampleLinks && (
            <div className="text-xs">
              <span className="text-muted-foreground">Sample toxic links:</span>
              <ul className="list-disc list-inside mt-1">
                {(payload.sampleLinks as any[]).slice(0, 3).map((l: any, i: number) => (
                  <li key={i} className="text-red-400">{l.source} → {l.anchor}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
