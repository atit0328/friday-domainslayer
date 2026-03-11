import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, Bell, Calendar, CheckCircle, Clock,
  Loader2, RefreshCw, Shield, TrendingDown, TrendingUp, Zap,
} from "lucide-react";

export default function AlgorithmMonitorDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const statusQuery = trpc.algorithmMonitor.getStatus.useQuery();
  const allUpdatesQuery = trpc.algorithmMonitor.getAllUpdates.useQuery();
  const volatilityQuery = trpc.algorithmMonitor.getVolatility.useQuery();
  const timelineQuery = trpc.algorithmMonitor.getTimeline.useQuery();

  const checkMutation = trpc.algorithmMonitor.checkForUpdates.useMutation({
    onSuccess: (data) => {
      toast.success(`Update Check Complete: Found ${data.newUpdates || 0} new updates`);
      allUpdatesQuery.refetch();
      statusQuery.refetch();
    },
    onError: (err) => toast.error(`Check Failed: ${err.message}`),
  });

  const analyzeMutation = trpc.algorithmMonitor.analyzeImpact.useMutation({
    onSuccess: () => {
      toast.success("Impact Analysis Complete");
      allUpdatesQuery.refetch();
    },
  });

  const status = statusQuery.data;
  const updates = allUpdatesQuery.data || [];
  const volatility = volatilityQuery.data || [];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-600";
      case "high": return "bg-orange-600";
      case "medium": return "bg-yellow-600";
      case "low": return "bg-blue-600";
      default: return "bg-gray-600";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-orange-500" />
            Algorithm Update Monitor
          </h1>
          <p className="text-muted-foreground mt-1">
            ติดตาม Google Algorithm Updates แบบ real-time พร้อมวิเคราะห์ผลกระทบ
          </p>
        </div>
        <Button onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
          {checkMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Checking...</> : <><RefreshCw className="h-4 w-4 mr-2" /> Check for Updates</>}
        </Button>
      </div>

      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-orange-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">{status.totalUpdates || 0}</div>
              <div className="text-xs text-muted-foreground">Total Updates</div>
            </CardContent>
          </Card>
          <Card className="border-red-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{(status as any).criticalUpdates || 0}</div>
              <div className="text-xs text-muted-foreground">Critical</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{status.currentVolatility?.toFixed(1) || "N/A"}</div>
              <div className="text-xs text-muted-foreground">Volatility</div>
            </CardContent>
          </Card>
          <Card className="border-green-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{status.lastCheck ? new Date(status.lastCheck).toLocaleDateString() : "Never"}</div>
              <div className="text-xs text-muted-foreground">Last Checked</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Updates</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="volatility">Volatility</TabsTrigger>
          <TabsTrigger value="impact">Impact</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {updates.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground"><Bell className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>No updates tracked yet. Click "Check for Updates".</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {updates.map((update: any) => (
                <Card key={update.id} className="border-l-4" style={{ borderLeftColor: update.severity === "critical" ? "#ef4444" : update.severity === "high" ? "#f97316" : update.severity === "medium" ? "#eab308" : "#3b82f6" }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{update.name}</span>
                          <Badge className={getSeverityColor(update.severity)}>{update.severity}</Badge>
                          <Badge variant="outline">{update.category}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{update.description}</p>
                        {update.affectedFactors?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {update.affectedFactors.slice(0, 5).map((f: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">{f}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <div className="text-xs text-muted-foreground">{update.detectedAt ? new Date(update.detectedAt).toLocaleDateString() : ""}</div>
                        <Button variant="ghost" size="sm" onClick={() => analyzeMutation.mutate({ updateId: update.id })} disabled={analyzeMutation.isPending}><Zap className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    {update.recommendations?.length > 0 && (
                      <div className="mt-3 p-2 bg-accent/30 rounded-md">
                        <div className="text-xs font-medium mb-1">Recommendations:</div>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {update.recommendations.map((r: string, i: number) => (
                            <li key={i} className="flex items-start gap-1"><CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-blue-500" />Update Timeline</CardTitle></CardHeader>
            <CardContent>
              {(timelineQuery.data || []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No timeline data</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                  <div className="space-y-6">
                    {(timelineQuery.data || []).map((entry: any, i: number) => (
                      <div key={i} className="relative pl-10">
                        <div className={`absolute left-2.5 w-3 h-3 rounded-full ${entry.severity === "critical" ? "bg-red-500" : entry.severity === "high" ? "bg-orange-500" : entry.severity === "medium" ? "bg-yellow-500" : "bg-blue-500"}`} />
                        <div className="text-xs text-muted-foreground mb-1">{entry.date ? new Date(entry.date).toLocaleDateString() : ""}</div>
                        <div className="font-medium text-sm">{entry.name}</div>
                        <div className="text-xs text-muted-foreground">{entry.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="volatility" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-yellow-500" />SERP Volatility Index</CardTitle><CardDescription>ค่าสูง = Google กำลังอัพเดท algorithm</CardDescription></CardHeader>
            <CardContent>
              {volatility.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No volatility data</p>
              ) : (
                <div className="space-y-2">
                  {volatility.map((v: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground w-20">{v.date ? new Date(v.date).toLocaleDateString() : `Day ${i + 1}`}</div>
                      <div className="flex-1 bg-accent/30 rounded-full h-4 overflow-hidden">
                        <div className={`h-full rounded-full ${v.score > 8 ? "bg-red-500" : v.score > 5 ? "bg-orange-500" : v.score > 3 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(v.score * 10, 100)}%` }} />
                      </div>
                      <div className="text-sm font-bold w-10 text-right">{v.score?.toFixed(1)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impact" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />Impact Analysis</CardTitle><CardDescription>วิเคราะห์ผลกระทบต่อกลยุทธ์ SEO</CardDescription></CardHeader>
            <CardContent>
              {updates.filter((u: any) => u.impactAnalysis).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Click the lightning button on any update to analyze impact</p>
              ) : (
                updates.filter((u: any) => u.impactAnalysis).map((update: any) => (
                  <Card key={update.id} className="border-accent mb-3">
                    <CardContent className="p-4">
                      <div className="font-medium mb-2">{update.name}</div>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="text-center p-2 bg-accent/30 rounded">
                          <div className="text-lg font-bold text-red-400">{update.impactAnalysis?.riskLevel || "N/A"}</div>
                          <div className="text-[10px] text-muted-foreground">Risk Level</div>
                        </div>
                        <div className="text-center p-2 bg-accent/30 rounded">
                          <div className="text-lg font-bold text-yellow-400">{update.impactAnalysis?.affectedStrategies || 0}</div>
                          <div className="text-[10px] text-muted-foreground">Strategies Affected</div>
                        </div>
                        <div className="text-center p-2 bg-accent/30 rounded">
                          <div className="text-lg font-bold text-green-400">{update.impactAnalysis?.adaptationActions || 0}</div>
                          <div className="text-[10px] text-muted-foreground">Actions Required</div>
                        </div>
                      </div>
                      {update.impactAnalysis?.summary && <p className="text-sm text-muted-foreground">{update.impactAnalysis.summary}</p>}
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
