/**
 * Design: Obsidian Intelligence — Algorithm Intelligence
 * Monitor Google algorithm changes with AI — uses tRPC
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Shield, Loader2, Radio, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Activity, Zap } from "lucide-react";
import { Streamdown } from "streamdown";

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-rose/20 text-rose border-rose/30",
  CRITICAL: "bg-rose/20 text-rose border-rose/30",
  MEDIUM: "bg-amber/20 text-amber border-amber/30",
  MED: "bg-amber/20 text-amber border-amber/30",
  LOW: "bg-emerald/20 text-emerald border-emerald/30",
};

const RISK_COLORS: Record<string, string> = {
  HIGH: "text-rose",
  CRITICAL: "text-rose",
  MEDIUM: "text-amber",
  MED: "text-amber",
  LOW: "text-emerald",
  UNKNOWN: "text-muted-foreground",
};

export default function AlgorithmIntel() {
  const [expandedSignal, setExpandedSignal] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: history = [], isLoading } = trpc.algo.latest.useQuery({ limit: 10 });

  const scanMutation = trpc.algo.scan.useMutation({
    onSuccess: () => {
      toast.success("Algorithm scan completed!");
      utils.algo.latest.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Get the latest scan result
  const latestScan: any = history.length > 0 ? history[0] : null;
  const signals: any[] = latestScan?.signals
    ? (typeof latestScan.signals === "string" ? JSON.parse(latestScan.signals) : latestScan.signals)
    : [];
  const analysis: string = latestScan?.analysis || "";
  const overallRisk: string = latestScan?.overallRisk || "UNKNOWN";

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-violet rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">Algorithm Intel</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-violet/30 text-violet">AI Monitor</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => utils.algo.latest.invalidate()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" className="bg-violet text-white hover:bg-violet/90" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
            {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Radio className="w-4 h-4 mr-1" />}
            Scan Now
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="glass-card border-border/50">
          <CardContent className="p-4 text-center">
            <Activity className="w-6 h-6 text-emerald mx-auto mb-2" />
            <p className="text-xs font-mono text-muted-foreground">Overall Risk</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${RISK_COLORS[overallRisk] || RISK_COLORS.UNKNOWN}`}>
              {overallRisk}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-6 h-6 text-amber mx-auto mb-2" />
            <p className="text-xs font-mono text-muted-foreground">Signals Detected</p>
            <p className="text-2xl font-bold font-mono mt-1">{signals.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="p-4 text-center">
            <Zap className="w-6 h-6 text-violet mx-auto mb-2" />
            <p className="text-xs font-mono text-muted-foreground">Total Scans</p>
            <p className="text-2xl font-bold font-mono mt-1">{history.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Analysis */}
      {analysis && (
        <Card className="glass-card border-violet/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet" /> AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm prose-invert max-w-none [&_code]:text-violet [&_code]:bg-violet/10 [&_code]:px-1 [&_code]:rounded">
              <Streamdown>{analysis}</Streamdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signals */}
      {signals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Detected Signals
          </h2>
          {signals.map((signal: any, i: number) => (
            <Card key={i} className="glass-card border-border/50 hover:border-violet/20 transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpandedSignal(expandedSignal === i ? null : i)}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-4 h-4 text-violet" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{signal.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{signal.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-[10px] ${SEVERITY_COLORS[signal.severity] || SEVERITY_COLORS.LOW}`}>
                      {signal.severity}
                    </Badge>
                    {expandedSignal === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                {expandedSignal === i && (
                  <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                    {signal.impact && (
                      <div>
                        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Impact</p>
                        <p className="text-xs mt-0.5">{signal.impact}</p>
                      </div>
                    )}
                    {signal.recommendation && (
                      <div>
                        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Recommendation</p>
                        <p className="text-xs mt-0.5 text-emerald">{signal.recommendation}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !latestScan && (
        <div className="text-center py-12 text-muted-foreground">
          <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>ยังไม่มีข้อมูล — กด "Scan Now" เพื่อเริ่มวิเคราะห์</p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-violet" />
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Scan History</h2>
          {history.slice(1).map((scan: any) => (
            <Card key={scan.id} className="glass-card border-border/50">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className={`text-[10px] ${SEVERITY_COLORS[scan.overallRisk] || "bg-muted text-muted-foreground"}`}>
                    {scan.overallRisk || "—"}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {scan.createdAt ? new Date(scan.createdAt).toLocaleString("th-TH") : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
