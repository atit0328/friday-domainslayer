/**
 * DeepVulnReport — AI Deep Vulnerability Analysis Report
 * 
 * Shows the full vulnerability analysis before attack launch:
 * - Vulnerability list with severity badges
 * - Exploit chains with step-by-step visualization
 * - Attack surface radar/score
 * - AI Decision Gate (go/no-go)
 * - Method-vulnerability mapping
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, AlertTriangle, Bug, Link2, Target, Brain,
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Zap, Eye, Lock, Server, Globe, FileWarning,
  ArrowRight, Clock, TrendingUp,
} from "lucide-react";

// ═══════════════════════════════════════════════════════
//  TYPES (mirror server types)
// ═══════════════════════════════════════════════════════

interface ClassifiedVulnerability {
  id: string;
  name: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  cvss: number;
  description: string;
  evidence: string;
  exploitable: boolean;
  exploitDifficulty: string;
  aiConfidence: number;
  remediation: string;
}

interface ExploitStep {
  order: number;
  action: string;
  technique: string;
  target: string;
  expectedOutcome: string;
  fallbackAction: string;
  detectionRisk: string;
}

interface ExploitChain {
  id: string;
  name: string;
  steps: ExploitStep[];
  totalSuccessProbability: number;
  estimatedTime: string;
  requiredConditions: string[];
  riskLevel: string;
  stealthLevel: string;
  targetVulnerabilities: string[];
}

interface AttackSurfaceScore {
  overall: number;
  categories: {
    fileUpload: number;
    authentication: number;
    serverConfig: number;
    applicationLogic: number;
    networkExposure: number;
    informationLeakage: number;
  };
  weakestPoint: string;
  strongestDefense: string;
}

interface AttackDecision {
  proceed: boolean;
  confidence: number;
  reasoning: string;
  riskAssessment: string;
  estimatedSuccessRate: number;
  estimatedDuration: string;
  recommendedApproach: string;
  alternativeApproaches: string[];
  criticalWarnings: string[];
  prerequisites: string[];
}

interface MethodVulnMapping {
  method: string;
  exploitsVulnerabilities: string[];
  successProbability: number;
  reasoning: string;
}

interface DeepVulnAnalysis {
  target: string;
  analyzedAt: number;
  duration: number;
  vulnerabilities: ClassifiedVulnerability[];
  exploitChains: ExploitChain[];
  attackSurface: AttackSurfaceScore;
  decision: AttackDecision;
  aiNarrative: string;
  methodVulnMap: MethodVulnMapping[];
}

interface DeepVulnReportProps {
  analysis: DeepVulnAnalysis | null;
  isLoading?: boolean;
  progress?: { stage: string; detail: string; progress: number };
  onProceed?: () => void;
  onCancel?: () => void;
}

// ═══════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

const severityColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/40",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  info: "bg-slate-500/20 text-slate-400 border-slate-500/40",
};

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  info: "bg-slate-500",
};

const categoryIcon: Record<string, typeof Bug> = {
  file_upload: FileWarning,
  auth_bypass: Lock,
  rce: Zap,
  sqli: Server,
  xss: Globe,
  ssrf: Link2,
  lfi: Eye,
  config_exposure: Shield,
  misconfiguration: AlertTriangle,
  outdated_software: Clock,
  default_creds: Lock,
  info_disclosure: Eye,
};

const riskColor: Record<string, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

const stealthIcon: Record<string, string> = {
  silent: "🥷",
  quiet: "🤫",
  moderate: "👀",
  loud: "📢",
};

// ═══════════════════════════════════════════════════════
//  LOADING STATE
// ═══════════════════════════════════════════════════════

function AnalysisProgress({ progress }: { progress: { stage: string; detail: string; progress: number } }) {
  return (
    <Card className="border-cyan-500/30 bg-gradient-to-br from-slate-900 to-cyan-950/30">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <Brain className="w-8 h-8 text-cyan-400 animate-pulse" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-cyan-300">AI Deep Vulnerability Analysis</h3>
            <p className="text-sm text-slate-400">กำลังวิเคราะห์ช่องโหว่เชิงลึก...</p>
          </div>
        </div>
        
        <Progress value={progress.progress} className="h-2 mb-3" />
        
        <div className="flex justify-between items-center">
          <p className="text-sm text-slate-300">{progress.detail}</p>
          <span className="text-xs text-cyan-400 font-mono">{progress.progress}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export default function DeepVulnReport({ analysis, isLoading, progress, onProceed, onCancel }: DeepVulnReportProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedChain, setExpandedChain] = useState<string | null>(null);
  const [expandedVuln, setExpandedVuln] = useState<string | null>(null);

  if (isLoading && progress) {
    return <AnalysisProgress progress={progress} />;
  }

  if (!analysis) return null;

  const { vulnerabilities, exploitChains, attackSurface, decision, methodVulnMap } = analysis;
  const criticalCount = vulnerabilities.filter(v => v.severity === "critical").length;
  const highCount = vulnerabilities.filter(v => v.severity === "high").length;
  const exploitableCount = vulnerabilities.filter(v => v.exploitable).length;

  return (
    <div className="space-y-4">
      {/* ─── Decision Banner ─── */}
      <Card className={`border-2 ${decision.proceed ? "border-emerald-500/50 bg-emerald-950/20" : "border-red-500/50 bg-red-950/20"}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {decision.proceed ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-red-400 shrink-0" />
              )}
              <div>
                <h3 className="text-lg font-bold">
                  {decision.proceed ? "✅ AI แนะนำให้ดำเนินการโจมตี" : "❌ AI ไม่แนะนำให้โจมตี"}
                </h3>
                <p className="text-sm text-slate-400">
                  ความมั่นใจ {decision.confidence}% | โอกาสสำเร็จ {decision.estimatedSuccessRate}% | ระยะเวลา ~{decision.estimatedDuration}
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {onProceed && (
                <Button
                  onClick={onProceed}
                  className={`flex-1 sm:flex-initial ${decision.proceed ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
                >
                  <Zap className="w-4 h-4 mr-1" />
                  {decision.proceed ? "เริ่มโจมตี" : "โจมตีต่อ (เสี่ยง)"}
                </Button>
              )}
              {onCancel && (
                <Button variant="outline" onClick={onCancel} className="flex-1 sm:flex-initial border-slate-600">
                  ยกเลิก
                </Button>
              )}
            </div>
          </div>
          
          {decision.criticalWarnings.length > 0 && (
            <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/30">
              <p className="text-xs font-semibold text-red-400 mb-1">⚠️ คำเตือนสำคัญ:</p>
              {decision.criticalWarnings.map((w, i) => (
                <p key={i} className="text-xs text-red-300">• {w}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── KPI Summary ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-slate-700/50 bg-slate-900/50">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-2xl font-bold text-red-400">{vulnerabilities.length}</p>
            <p className="text-xs text-slate-400">ช่องโหว่ทั้งหมด</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-900/50">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{exploitableCount}</p>
            <p className="text-xs text-slate-400">Exploit ได้</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-900/50">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-2xl font-bold text-cyan-400">{exploitChains.length}</p>
            <p className="text-xs text-slate-400">Exploit Chains</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-900/50">
          <CardContent className="pt-3 pb-3 text-center">
            <p className={`text-2xl font-bold ${attackSurface.overall >= 60 ? "text-red-400" : attackSurface.overall >= 30 ? "text-yellow-400" : "text-green-400"}`}>
              {attackSurface.overall}
            </p>
            <p className="text-xs text-slate-400">Attack Surface</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full overflow-x-auto flex-nowrap bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="overview" className="text-xs sm:text-sm whitespace-nowrap">Overview</TabsTrigger>
          <TabsTrigger value="vulns" className="text-xs sm:text-sm whitespace-nowrap">
            Vulnerabilities ({vulnerabilities.length})
          </TabsTrigger>
          <TabsTrigger value="chains" className="text-xs sm:text-sm whitespace-nowrap">
            Exploit Chains ({exploitChains.length})
          </TabsTrigger>
          <TabsTrigger value="surface" className="text-xs sm:text-sm whitespace-nowrap">Attack Surface</TabsTrigger>
          <TabsTrigger value="mapping" className="text-xs sm:text-sm whitespace-nowrap">Method Map</TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ─── */}
        <TabsContent value="overview" className="space-y-4">
          {/* AI Reasoning */}
          <Card className="border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-400" />
                AI Decision Reasoning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300 leading-relaxed">{decision.reasoning}</p>
              <div className="mt-3 p-2 rounded bg-slate-800/50">
                <p className="text-xs font-semibold text-slate-400 mb-1">Risk Assessment:</p>
                <p className="text-xs text-slate-300">{decision.riskAssessment}</p>
              </div>
            </CardContent>
          </Card>

          {/* Recommended Approach */}
          <Card className="border-cyan-500/30 bg-cyan-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" />
                แนวทางที่แนะนำ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-cyan-200 font-medium mb-2">{decision.recommendedApproach}</p>
              {decision.alternativeApproaches.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-slate-400 mb-1">แนวทางสำรอง:</p>
                  {decision.alternativeApproaches.map((a, i) => (
                    <p key={i} className="text-xs text-slate-300">• {a}</p>
                  ))}
                </div>
              )}
              {decision.prerequisites.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-slate-400 mb-1">เงื่อนไขที่ต้องมี:</p>
                  {decision.prerequisites.map((p, i) => (
                    <p key={i} className="text-xs text-yellow-300">• {p}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Severity Breakdown */}
          <Card className="border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Severity Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { label: "Critical", count: criticalCount, color: "bg-red-500", total: vulnerabilities.length },
                  { label: "High", count: highCount, color: "bg-orange-500", total: vulnerabilities.length },
                  { label: "Medium", count: vulnerabilities.filter(v => v.severity === "medium").length, color: "bg-yellow-500", total: vulnerabilities.length },
                  { label: "Low", count: vulnerabilities.filter(v => v.severity === "low").length, color: "bg-blue-500", total: vulnerabilities.length },
                ].map(({ label, count, color, total }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-16">{label}</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-mono text-slate-300 w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Vulnerabilities Tab ─── */}
        <TabsContent value="vulns" className="space-y-2">
          {vulnerabilities.map((vuln) => {
            const Icon = categoryIcon[vuln.category] || Bug;
            const isExpanded = expandedVuln === vuln.id;
            return (
              <Card key={vuln.id} className="border-slate-700/50 hover:border-slate-600/50 transition-colors">
                <CardContent className="pt-3 pb-3">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedVuln(isExpanded ? null : vuln.id)}
                  >
                    <div className={`p-1.5 rounded ${severityColor[vuln.severity]} shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-slate-200 truncate">{vuln.name}</h4>
                        <Badge variant="outline" className={`text-[10px] ${severityColor[vuln.severity]}`}>
                          {vuln.severity.toUpperCase()}
                        </Badge>
                        <span className="text-[10px] text-slate-500">CVSS: {vuln.cvss}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{vuln.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {vuln.exploitable && (
                        <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30">
                          Exploitable
                        </Badge>
                      )}
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500">Category:</span>{" "}
                          <span className="text-slate-300">{vuln.category.replace(/_/g, " ")}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Difficulty:</span>{" "}
                          <span className="text-slate-300">{vuln.exploitDifficulty}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">AI Confidence:</span>{" "}
                          <span className="text-slate-300">{vuln.aiConfidence}%</span>
                        </div>
                        <div>
                          <span className="text-slate-500">CVSS:</span>{" "}
                          <span className="text-slate-300">{vuln.cvss}/10</span>
                        </div>
                      </div>
                      <div className="text-xs">
                        <span className="text-slate-500">Evidence:</span>{" "}
                        <span className="text-slate-300 font-mono">{vuln.evidence}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-slate-500">Description:</span>{" "}
                        <span className="text-slate-300">{vuln.description}</span>
                      </div>
                      <div className="text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                        <span className="text-emerald-400 font-semibold">Remediation:</span>{" "}
                        <span className="text-emerald-300">{vuln.remediation}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          
          {vulnerabilities.length === 0 && (
            <Card className="border-slate-700/50">
              <CardContent className="pt-6 pb-6 text-center">
                <Shield className="w-12 h-12 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-slate-400">ไม่พบช่องโหว่ที่สำคัญ</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Exploit Chains Tab ─── */}
        <TabsContent value="chains" className="space-y-3">
          {exploitChains.map((chain, idx) => {
            const isExpanded = expandedChain === chain.id;
            return (
              <Card key={chain.id} className={`border-slate-700/50 ${idx === 0 ? "border-cyan-500/30 bg-cyan-950/5" : ""}`}>
                <CardContent className="pt-3 pb-3">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedChain(isExpanded ? null : chain.id)}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${idx === 0 ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-700/50 text-slate-400"}`}>
                      <span className="text-sm font-bold">#{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-slate-200">{chain.name}</h4>
                        {idx === 0 && <Badge className="text-[10px] bg-cyan-500/20 text-cyan-400 border-cyan-500/30">Best</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {chain.totalSuccessProbability}%
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {chain.estimatedTime}
                        </span>
                        <span className={riskColor[chain.riskLevel] || "text-slate-400"}>
                          Risk: {chain.riskLevel}
                        </span>
                        <span>{stealthIcon[chain.stealthLevel] || "👀"} {chain.stealthLevel}</span>
                        <span>{chain.steps.length} steps</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {/* Steps */}
                      <div className="relative pl-4 border-l-2 border-slate-700 space-y-3">
                        {chain.steps.map((step, si) => (
                          <div key={si} className="relative">
                            <div className={`absolute -left-[21px] w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              step.detectionRisk === "high" ? "bg-red-500/30 text-red-400 border border-red-500/50" :
                              step.detectionRisk === "medium" ? "bg-yellow-500/30 text-yellow-400 border border-yellow-500/50" :
                              "bg-green-500/30 text-green-400 border border-green-500/50"
                            }`}>
                              {step.order}
                            </div>
                            <div className="ml-2 p-2 rounded bg-slate-800/50">
                              <p className="text-xs font-medium text-slate-200">{step.action}</p>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 flex-wrap">
                                <span className="font-mono bg-slate-700/50 px-1 rounded">{step.technique}</span>
                                <ArrowRight className="w-3 h-3" />
                                <span>{step.target}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1">
                                Expected: {step.expectedOutcome}
                              </p>
                              <p className="text-[10px] text-yellow-500/70 mt-0.5">
                                Fallback: {step.fallbackAction}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Conditions */}
                      {chain.requiredConditions.length > 0 && (
                        <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                          <p className="text-[10px] font-semibold text-yellow-400 mb-1">เงื่อนไขที่ต้องมี:</p>
                          {chain.requiredConditions.map((c, i) => (
                            <p key={i} className="text-[10px] text-yellow-300">• {c}</p>
                          ))}
                        </div>
                      )}

                      {/* Target Vulns */}
                      {chain.targetVulnerabilities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-[10px] text-slate-500">Exploits:</span>
                          {chain.targetVulnerabilities.map((vid) => (
                            <Badge key={vid} variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30">
                              {vid}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {exploitChains.length === 0 && (
            <Card className="border-slate-700/50">
              <CardContent className="pt-6 pb-6 text-center">
                <Link2 className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                <p className="text-sm text-slate-400">ไม่พบ Exploit Chain ที่เป็นไปได้</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Attack Surface Tab ─── */}
        <TabsContent value="surface" className="space-y-4">
          {/* Overall Score */}
          <Card className="border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Attack Surface Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className={`text-4xl font-bold ${
                  attackSurface.overall >= 60 ? "text-red-400" :
                  attackSurface.overall >= 30 ? "text-yellow-400" : "text-green-400"
                }`}>
                  {attackSurface.overall}
                </div>
                <div className="text-xs text-slate-400">
                  <p>/ 100</p>
                  <p className="mt-1">
                    {attackSurface.overall >= 60 ? "High Attack Surface — เป้าหมายมีจุดอ่อนมาก" :
                     attackSurface.overall >= 30 ? "Moderate Attack Surface — มีจุดอ่อนบางส่วน" :
                     "Low Attack Surface — เป้าหมายมีการป้องกันดี"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { key: "fileUpload", label: "File Upload", icon: FileWarning },
                  { key: "authentication", label: "Authentication", icon: Lock },
                  { key: "serverConfig", label: "Server Config", icon: Server },
                  { key: "applicationLogic", label: "Application Logic", icon: Zap },
                  { key: "networkExposure", label: "Network Exposure", icon: Globe },
                  { key: "informationLeakage", label: "Info Leakage", icon: Eye },
                ].map(({ key, label, icon: CatIcon }) => {
                  const val = attackSurface.categories[key as keyof typeof attackSurface.categories];
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <CatIcon className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-xs text-slate-400 w-28 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            val >= 60 ? "bg-red-500" : val >= 30 ? "bg-yellow-500" : "bg-green-500"
                          }`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-slate-300 w-8 text-right">{val}</span>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                  <p className="text-[10px] text-red-400 font-semibold">จุดอ่อนที่สุด</p>
                  <p className="text-xs text-red-300">{attackSurface.weakestPoint}</p>
                </div>
                <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                  <p className="text-[10px] text-green-400 font-semibold">การป้องกันที่แข็งแกร่งที่สุด</p>
                  <p className="text-xs text-green-300">{attackSurface.strongestDefense}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Method Mapping Tab ─── */}
        <TabsContent value="mapping" className="space-y-2">
          <Card className="border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Method → Vulnerability Mapping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 text-slate-400 font-medium">Method</th>
                      <th className="text-center py-2 text-slate-400 font-medium">Success %</th>
                      <th className="text-left py-2 text-slate-400 font-medium">Exploits</th>
                      <th className="text-left py-2 text-slate-400 font-medium">Reasoning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {methodVulnMap.map((m, i) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 font-medium text-slate-200 whitespace-nowrap">{m.method}</td>
                        <td className="py-2 text-center">
                          <span className={`font-mono font-bold ${
                            m.successProbability >= 60 ? "text-green-400" :
                            m.successProbability >= 30 ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {m.successProbability}%
                          </span>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {m.exploitsVulnerabilities.slice(0, 3).map((vid) => (
                              <Badge key={vid} variant="outline" className="text-[9px] px-1 py-0">
                                {vid}
                              </Badge>
                            ))}
                            {m.exploitsVulnerabilities.length > 3 && (
                              <span className="text-[9px] text-slate-500">+{m.exploitsVulnerabilities.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 text-slate-400 max-w-[200px] truncate">{m.reasoning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {methodVulnMap.length === 0 && (
                <p className="text-center text-sm text-slate-500 py-4">ไม่พบ method ที่จับคู่กับช่องโหว่ได้</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Analysis metadata */}
      <div className="flex items-center justify-between text-[10px] text-slate-600 px-1">
        <span>Analyzed: {new Date(analysis.analyzedAt).toLocaleString("th-TH")}</span>
        <span>Duration: {(analysis.duration / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
