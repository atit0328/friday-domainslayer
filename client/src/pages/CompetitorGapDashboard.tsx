import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Target, Search, Zap, Trophy, TrendingUp, Loader2, Crosshair,
  CheckCircle, AlertTriangle, BarChart3, Swords, Eye, ArrowRight,
} from "lucide-react";

export default function CompetitorGapDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  // Queries
  const summaryQuery = trpc.competitorGap.getSummary.useQuery();
  const allAnalysesQuery = trpc.competitorGap.getAll.useQuery();

  // Analysis form
  const [analysisForm, setAnalysisForm] = useState({
    domain: "",
    targetUrl: "",
    seedKeywords: "",
    niche: "gambling",
    maxCompetitors: 5,
    maxGapsToFill: 10,
    autoDeployContent: true,
    autoIndex: true,
  });

  const runAnalysisMutation = trpc.competitorGap.runAnalysis.useMutation({
    onSuccess: (data) => {
      toast.success(`Gap Analysis Complete: Found ${data.totalGaps} gaps, filled ${data.gapsFilled}`);
      allAnalysesQuery.refetch();
      summaryQuery.refetch();
    },
    onError: (err) => toast.error(`Analysis Failed: ${err.message}`),
  });

  // Factor gap analysis form
  const [factorForm, setFactorForm] = useState({ competitorDomain: "", targetKeyword: "", niche: "gambling" });

  const factorGapMutation = trpc.competitorGap.analyzeFactorGaps.useMutation({
    onSuccess: () => toast.success("Factor Gap Analysis Complete"),
    onError: (err) => toast.error(`Analysis Failed: ${err.message}`),
  });

  const summary = summaryQuery.data;
  const analyses = allAnalysesQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Crosshair className="h-7 w-7 text-red-500" />
          Competitor Gap Analyzer
        </h1>
        <p className="text-muted-foreground mt-1">
          วิเคราะห์จุดอ่อนคู่แข่งด้วย 222 ranking factors แล้วโจมตีอัตโนมัติ
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-red-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{summary.totalDomains || 0}</div>
              <div className="text-xs text-muted-foreground">Domains Analyzed</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{summary.totalGaps || 0}</div>
              <div className="text-xs text-muted-foreground">Gaps Found</div>
            </CardContent>
          </Card>
          <Card className="border-green-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{summary.filled || 0}</div>
              <div className="text-xs text-muted-foreground">Gaps Filled</div>
            </CardContent>
          </Card>
          <Card className="border-purple-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{summary.highOpportunity || 0}</div>
              <div className="text-xs text-muted-foreground">High Opportunity</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Analyses</TabsTrigger>
          <TabsTrigger value="newanalysis">New Analysis</TabsTrigger>
          <TabsTrigger value="factorgaps">Factor Gaps</TabsTrigger>
        </TabsList>

        {/* Analyses Tab */}
        <TabsContent value="overview" className="space-y-4">
          {analyses.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No analyses yet. Run a new gap analysis to find competitor weaknesses.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {analyses.map((analysis: any, idx: number) => (
                <Card key={idx} className="border-l-4 border-l-red-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-lg">{analysis.domain}</div>
                        <div className="text-sm text-muted-foreground">Niche: {analysis.niche}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleDateString() : ""}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      <div className="text-center p-2 bg-accent/30 rounded">
                        <div className="text-lg font-bold text-cyan-400">{analysis.competitors?.length || 0}</div>
                        <div className="text-[10px] text-muted-foreground">Competitors</div>
                      </div>
                      <div className="text-center p-2 bg-accent/30 rounded">
                        <div className="text-lg font-bold text-yellow-400">{analysis.totalGaps || 0}</div>
                        <div className="text-[10px] text-muted-foreground">Gaps</div>
                      </div>
                      <div className="text-center p-2 bg-accent/30 rounded">
                        <div className="text-lg font-bold text-orange-400">{analysis.highOpportunityGaps || 0}</div>
                        <div className="text-[10px] text-muted-foreground">High Opp.</div>
                      </div>
                      <div className="text-center p-2 bg-accent/30 rounded">
                        <div className="text-lg font-bold text-green-400">{analysis.gapsFilled || 0}</div>
                        <div className="text-[10px] text-muted-foreground">Filled</div>
                      </div>
                    </div>
                    {analysis.competitors && analysis.competitors.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium mb-1">Competitors Found:</div>
                        <div className="flex flex-wrap gap-1">
                          {analysis.competitors.map((c: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {c.domain} (DA: {c.estimatedDA || "?"})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysis.gaps && analysis.gaps.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium mb-1">Top Keyword Gaps:</div>
                        <div className="space-y-1">
                          {analysis.gaps.slice(0, 5).map((g: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1">
                                <ArrowRight className="h-3 w-3 text-red-400" />
                                {g.keyword}
                              </span>
                              <div className="flex items-center gap-2">
                                <Badge variant={g.opportunityScore >= 70 ? "default" : "secondary"} className="text-[10px]">
                                  Score: {g.opportunityScore}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">{g.status}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* New Analysis Tab */}
        <TabsContent value="newanalysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-cyan-500" />
                Run Gap Analysis
              </CardTitle>
              <CardDescription>ค้นหาคู่แข่ง วิเคราะห์ keyword gaps แล้ว auto-fill ด้วย content</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Your Domain</label>
                  <Input placeholder="yourdomain.com" value={analysisForm.domain} onChange={(e) => setAnalysisForm(prev => ({ ...prev, domain: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Target URL</label>
                  <Input placeholder="https://yourdomain.com" value={analysisForm.targetUrl} onChange={(e) => setAnalysisForm(prev => ({ ...prev, targetUrl: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Seed Keywords (comma-separated)</label>
                <Input placeholder="keyword1, keyword2, keyword3" value={analysisForm.seedKeywords} onChange={(e) => setAnalysisForm(prev => ({ ...prev, seedKeywords: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Niche</label>
                  <Input value={analysisForm.niche} onChange={(e) => setAnalysisForm(prev => ({ ...prev, niche: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Competitors</label>
                  <Input type="number" min={1} max={10} value={analysisForm.maxCompetitors} onChange={(e) => setAnalysisForm(prev => ({ ...prev, maxCompetitors: parseInt(e.target.value) || 5 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Gaps to Fill</label>
                  <Input type="number" min={0} max={50} value={analysisForm.maxGapsToFill} onChange={(e) => setAnalysisForm(prev => ({ ...prev, maxGapsToFill: parseInt(e.target.value) || 10 }))} />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => runAnalysisMutation.mutate({
                  ...analysisForm,
                  seedKeywords: analysisForm.seedKeywords.split(",").map(s => s.trim()).filter(Boolean),
                  minOpportunityScore: 60,
                })}
                disabled={runAnalysisMutation.isPending || !analysisForm.domain || !analysisForm.seedKeywords}
              >
                {runAnalysisMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyzing...</> : <><Swords className="h-4 w-4 mr-2" /> Run Gap Analysis</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Factor Gaps Tab */}
        <TabsContent value="factorgaps" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-500" />
                222-Factor Gap Analysis
              </CardTitle>
              <CardDescription>วิเคราะห์จุดอ่อนคู่แข่งตาม 222 Google ranking factors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Competitor Domain</label>
                  <Input placeholder="competitor.com" value={factorForm.competitorDomain} onChange={(e) => setFactorForm(prev => ({ ...prev, competitorDomain: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Target Keyword</label>
                  <Input placeholder="target keyword" value={factorForm.targetKeyword} onChange={(e) => setFactorForm(prev => ({ ...prev, targetKeyword: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Niche</label>
                  <Input value={factorForm.niche} onChange={(e) => setFactorForm(prev => ({ ...prev, niche: e.target.value }))} />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => factorGapMutation.mutate(factorForm)}
                disabled={factorGapMutation.isPending || !factorForm.competitorDomain || !factorForm.targetKeyword}
              >
                {factorGapMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyzing...</> : <><Eye className="h-4 w-4 mr-2" /> Analyze Factor Gaps</>}
              </Button>

              {factorGapMutation.data && (
                <div className="space-y-4 mt-4">
                  <Card className="border-purple-500/30">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium">Overall Opportunity Score</span>
                        <span className={`text-2xl font-bold ${factorGapMutation.data.overallOpportunityScore >= 70 ? "text-green-400" : factorGapMutation.data.overallOpportunityScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                          {factorGapMutation.data.overallOpportunityScore}/100
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {factorGapMutation.data.competitorWeakFactors.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle className="text-sm">Competitor Weak Factors</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {factorGapMutation.data.competitorWeakFactors.map((f: any, i: number) => (
                            <div key={i} className="p-2 bg-accent/30 rounded-lg">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px]">{f.category}</Badge>
                                  <span className="text-sm font-medium">{f.factorName}</span>
                                </div>
                                <Badge className={f.priority >= 8 ? "bg-red-600" : f.priority >= 5 ? "bg-orange-600" : "bg-blue-600"}>
                                  Priority: {f.priority}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{f.weakness}</p>
                              <p className="text-xs text-green-400 mt-1">Exploit: {f.exploitStrategy}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {factorGapMutation.data.attackPlan.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle className="text-sm">Attack Plan</CardTitle></CardHeader>
                      <CardContent>
                        <ol className="space-y-2">
                          {factorGapMutation.data.attackPlan.map((step: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="bg-red-500/20 text-red-400 rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">{i + 1}</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
