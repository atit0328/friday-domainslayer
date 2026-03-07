/**
 * AI Target Analysis Card — Real-time display of AI analysis results
 * Shows step-by-step analysis progress and final strategic assessment
 */
import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Server, Globe, Shield, TrendingUp, Upload, Bug,
  Crosshair, CheckCircle2, XCircle, Loader2, Clock,
  ChevronDown, ChevronUp, AlertTriangle, Fingerprint,
  Network, Eye, Gauge, BarChart3, Zap, Target,
} from "lucide-react";

interface AnalysisStepData {
  stepId: string;
  stepName: string;
  status: "running" | "complete" | "error" | "skipped";
  detail: string;
  progress: number;
  data?: any;
  duration?: number;
}

interface AiAnalysisData {
  domain?: string;
  analyzedAt?: number;
  duration?: number;
  httpFingerprint?: {
    serverType: string | null;
    serverVersion: string | null;
    phpVersion: string | null;
    osGuess: string | null;
    responseTime: number;
    statusCode: number;
    poweredBy: string | null;
  };
  dnsInfo?: {
    ipAddress: string | null;
    hostingProvider: string | null;
    cdnDetected: string | null;
    cloudflareProxied: boolean;
    nameservers: string[];
    mxRecords: string[];
  };
  techStack?: {
    cms: string | null;
    cmsVersion: string | null;
    framework: string | null;
    plugins: string[];
    theme: string | null;
    jsLibraries: string[];
    analytics: string[];
    ecommerce: string | null;
  };
  security?: {
    wafDetected: string | null;
    wafStrength: string;
    sslEnabled: boolean;
    securityScore: number;
    hsts: boolean;
    csp: boolean;
    xFrameOptions: boolean;
  };
  seoMetrics?: {
    domainAuthority: number;
    pageAuthority: number;
    spamScore: number;
    backlinks: number;
    referringDomains: number;
    mozAvailable: boolean;
  };
  uploadSurface?: {
    writablePaths: string[];
    uploadEndpoints: string[];
    fileManagerDetected: boolean;
    xmlrpcAvailable: boolean;
    restApiAvailable: boolean;
    openPorts: { port: number; service: string }[];
    ftpAvailable: boolean;
    sshAvailable: boolean;
  };
  vulnerabilities?: {
    knownCVEs: { cve: string; description: string; severity: string }[];
    misconfigurations: string[];
    exposedFiles: string[];
    totalRiskScore: number;
  };
  aiStrategy?: {
    overallSuccessProbability: number;
    difficulty: string;
    riskLevel: string;
    detectionRisk: string;
    shouldProceed: boolean;
    proceedReason: string;
    tacticalAnalysis: string;
    recommendedMethods: { method: string; probability: number; reasoning: string; priority: number }[];
    warnings: string[];
    recommendations: string[];
    estimatedTime: string;
    bestApproach: string;
  };
}

interface AiAnalysisCardProps {
  phaseState: {
    status: "idle" | "running" | "complete" | "error";
    detail: string;
    progress: number;
    data?: Record<string, unknown>;
  };
  analysisSteps: AnalysisStepData[];
  analysisData: AiAnalysisData | null;
}

const STEP_ICONS: Record<string, React.ElementType> = {
  http_fingerprint: Fingerprint,
  dns_lookup: Network,
  tech_detection: Server,
  security_scan: Shield,
  moz_metrics: TrendingUp,
  upload_surface: Upload,
  vuln_check: Bug,
  ai_strategy: Brain,
};

const STEP_COLORS: Record<string, string> = {
  http_fingerprint: "text-cyan-400",
  dns_lookup: "text-blue-400",
  tech_detection: "text-violet-400",
  security_scan: "text-amber-400",
  moz_metrics: "text-emerald-400",
  upload_surface: "text-orange-400",
  vuln_check: "text-red-400",
  ai_strategy: "text-pink-400",
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "running": return <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />;
    case "complete": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case "error": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    case "skipped": return <Eye className="w-3.5 h-3.5 text-gray-500" />;
    default: return <Clock className="w-3.5 h-3.5 text-gray-600" />;
  }
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const config: Record<string, { color: string; label: string }> = {
    easy: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "ง่าย" },
    medium: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "ปานกลาง" },
    hard: { color: "bg-orange-500/20 text-orange-400 border-orange-500/30", label: "ยาก" },
    very_hard: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "ยากมาก" },
  };
  const c = config[difficulty] || config.medium;
  return <Badge variant="outline" className={`${c.color} text-xs`}>{c.label}</Badge>;
}

function RiskBadge({ risk }: { risk: string }) {
  const config: Record<string, { color: string; label: string }> = {
    low: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "ต่ำ" },
    medium: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "ปานกลาง" },
    high: { color: "bg-orange-500/20 text-orange-400 border-orange-500/30", label: "สูง" },
    critical: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "วิกฤต" },
  };
  const c = config[risk] || config.medium;
  return <Badge variant="outline" className={`${c.color} text-xs`}>{c.label}</Badge>;
}

export default function AiAnalysisCard({ phaseState, analysisSteps, analysisData }: AiAnalysisCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const isActive = phaseState.status === "running" || phaseState.status === "complete";
  const isComplete = phaseState.status === "complete";
  const hasData = !!analysisData;

  if (phaseState.status === "idle") return null;

  return (
    <Card className={`border transition-all duration-500 ${
      isActive
        ? "border-emerald-500/40 bg-emerald-500/5 shadow-lg shadow-emerald-500/10"
        : "border-gray-700/50 bg-gray-900/50"
    }`}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isActive ? "bg-emerald-500/20" : "bg-gray-700/30"}`}>
              <Brain className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-gray-500"}`} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-gray-200">
                AI Target Analysis
              </CardTitle>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Phase 0 — Deep Intelligence Gathering
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {phaseState.status === "running" && (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            )}
            {isComplete && (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            {phaseState.status === "error" && (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </div>
        </div>
        {phaseState.status === "running" && (
          <Progress value={phaseState.progress} className="h-1 mt-2" />
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Analysis Steps Progress */}
          <div className="space-y-1.5">
            {analysisSteps.map((step) => {
              const Icon = STEP_ICONS[step.stepId] || Brain;
              const color = STEP_COLORS[step.stepId] || "text-gray-400";
              return (
                <div key={step.stepId} className={`flex items-start gap-2 p-1.5 rounded-md transition-all ${
                  step.status === "running" ? "bg-gray-800/50 border border-gray-700/50" : ""
                }`}>
                  <StatusIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3 h-3 ${color}`} />
                      <span className="text-xs font-medium text-gray-300">{step.stepName}</span>
                      {step.duration && (
                        <span className="text-[10px] text-gray-600">{(step.duration / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{step.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI Strategy Summary (shown when complete) */}
          {isComplete && hasData && analysisData?.aiStrategy && (
            <>
              <div className="border-t border-gray-700/50 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">AI Strategic Assessment</span>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <Gauge className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                    <div className="text-lg font-bold text-cyan-400">{analysisData.aiStrategy.overallSuccessProbability}%</div>
                    <div className="text-[9px] text-gray-500 uppercase">โอกาสสำเร็จ</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <Target className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                    <DifficultyBadge difficulty={analysisData.aiStrategy.difficulty} />
                    <div className="text-[9px] text-gray-500 uppercase mt-1">ความยาก</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-orange-400" />
                    <RiskBadge risk={analysisData.aiStrategy.riskLevel} />
                    <div className="text-[9px] text-gray-500 uppercase mt-1">ความเสี่ยง</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <Clock className="w-4 h-4 mx-auto mb-1 text-violet-400" />
                    <div className="text-xs font-bold text-violet-400">{analysisData.aiStrategy.estimatedTime}</div>
                    <div className="text-[9px] text-gray-500 uppercase">เวลาโดยประมาณ</div>
                  </div>
                </div>

                {/* Proceed Decision */}
                <div className={`rounded-lg p-2 mb-3 border ${
                  analysisData.aiStrategy.shouldProceed
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}>
                  <div className="flex items-center gap-2">
                    {analysisData.aiStrategy.shouldProceed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <span className={`text-xs font-semibold ${
                      analysisData.aiStrategy.shouldProceed ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {analysisData.aiStrategy.shouldProceed ? "ดำเนินการต่อได้" : "ไม่แนะนำให้ดำเนินการ"}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 ml-6">{analysisData.aiStrategy.proceedReason}</p>
                </div>

                {/* Tactical Analysis */}
                {analysisData.aiStrategy.tacticalAnalysis && (
                  <div className="bg-gray-800/30 rounded-lg p-2 mb-3 border border-gray-700/30">
                    <p className="text-[11px] text-gray-300 leading-relaxed">{analysisData.aiStrategy.tacticalAnalysis}</p>
                  </div>
                )}

                {/* Recommended Methods */}
                {analysisData.aiStrategy.recommendedMethods.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Crosshair className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">วิธีที่แนะนำ</span>
                    </div>
                    <div className="space-y-1">
                      {analysisData.aiStrategy.recommendedMethods.slice(0, 5).map((m, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-800/40 rounded-md p-1.5">
                          <span className="text-[10px] font-mono text-gray-600 w-4">#{m.priority}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium text-gray-300">{m.method}</span>
                              <Badge variant="outline" className={`text-[9px] ${
                                m.probability >= 60 ? "border-emerald-500/30 text-emerald-400" :
                                m.probability >= 30 ? "border-amber-500/30 text-amber-400" :
                                "border-red-500/30 text-red-400"
                              }`}>
                                {m.probability}%
                              </Badge>
                            </div>
                            <p className="text-[9px] text-gray-500 truncate">{m.reasoning}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Toggle Details */}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showDetails ? "ซ่อนรายละเอียด" : "ดูรายละเอียดทั้งหมด"}
                </button>
              </div>

              {/* Expanded Details */}
              {showDetails && (
                <div className="border-t border-gray-700/50 pt-3 space-y-3">
                  {/* Server & DNS */}
                  {analysisData.httpFingerprint && (
                    <DetailSection title="HTTP Fingerprint" icon={Fingerprint} color="text-cyan-400">
                      <DetailRow label="Server" value={`${analysisData.httpFingerprint.serverType || "Unknown"} (${analysisData.httpFingerprint.serverVersion || "N/A"})`} />
                      <DetailRow label="PHP" value={analysisData.httpFingerprint.phpVersion || "N/A"} />
                      <DetailRow label="OS" value={analysisData.httpFingerprint.osGuess || "Unknown"} />
                      <DetailRow label="Response Time" value={`${analysisData.httpFingerprint.responseTime}ms`} />
                      <DetailRow label="Status" value={`${analysisData.httpFingerprint.statusCode}`} />
                    </DetailSection>
                  )}

                  {analysisData.dnsInfo && (
                    <DetailSection title="DNS & Network" icon={Network} color="text-blue-400">
                      <DetailRow label="IP" value={analysisData.dnsInfo.ipAddress || "N/A"} />
                      <DetailRow label="Hosting" value={analysisData.dnsInfo.hostingProvider || "Unknown"} />
                      <DetailRow label="CDN" value={analysisData.dnsInfo.cdnDetected || "None"} />
                      <DetailRow label="Cloudflare" value={analysisData.dnsInfo.cloudflareProxied ? "Yes (Proxied)" : "No"} />
                      {analysisData.dnsInfo.nameservers.length > 0 && (
                        <DetailRow label="NS" value={analysisData.dnsInfo.nameservers.slice(0, 3).join(", ")} />
                      )}
                    </DetailSection>
                  )}

                  {/* Tech Stack */}
                  {analysisData.techStack && (
                    <DetailSection title="Technology Stack" icon={Server} color="text-violet-400">
                      <DetailRow label="CMS" value={`${analysisData.techStack.cms || "None"} ${analysisData.techStack.cmsVersion ? `v${analysisData.techStack.cmsVersion}` : ""}`} />
                      <DetailRow label="Framework" value={analysisData.techStack.framework || "None"} />
                      <DetailRow label="Theme" value={analysisData.techStack.theme || "N/A"} />
                      {analysisData.techStack.plugins.length > 0 && (
                        <DetailRow label="Plugins" value={`${analysisData.techStack.plugins.length}: ${analysisData.techStack.plugins.slice(0, 5).join(", ")}`} />
                      )}
                      {analysisData.techStack.jsLibraries.length > 0 && (
                        <DetailRow label="JS Libs" value={analysisData.techStack.jsLibraries.join(", ")} />
                      )}
                    </DetailSection>
                  )}

                  {/* Security */}
                  {analysisData.security && (
                    <DetailSection title="Security" icon={Shield} color="text-amber-400">
                      <DetailRow label="WAF" value={`${analysisData.security.wafDetected || "None"} (${analysisData.security.wafStrength})`} />
                      <DetailRow label="Score" value={`${analysisData.security.securityScore}/100`} />
                      <DetailRow label="SSL" value={analysisData.security.sslEnabled ? "Yes" : "No"} />
                      <DetailRow label="HSTS" value={analysisData.security.hsts ? "Yes" : "No"} />
                      <DetailRow label="CSP" value={analysisData.security.csp ? "Yes" : "No"} />
                    </DetailSection>
                  )}

                  {/* SEO Metrics */}
                  {analysisData.seoMetrics?.mozAvailable && (
                    <DetailSection title="SEO Metrics (Moz)" icon={TrendingUp} color="text-emerald-400">
                      <DetailRow label="DA" value={`${analysisData.seoMetrics.domainAuthority}`} />
                      <DetailRow label="PA" value={`${analysisData.seoMetrics.pageAuthority}`} />
                      <DetailRow label="Spam Score" value={`${analysisData.seoMetrics.spamScore}`} />
                      <DetailRow label="Backlinks" value={`${analysisData.seoMetrics.backlinks.toLocaleString()}`} />
                      <DetailRow label="Referring Domains" value={`${analysisData.seoMetrics.referringDomains.toLocaleString()}`} />
                    </DetailSection>
                  )}

                  {/* Vulnerabilities */}
                  {analysisData.vulnerabilities && analysisData.vulnerabilities.knownCVEs.length > 0 && (
                    <DetailSection title="Vulnerabilities" icon={Bug} color="text-red-400">
                      {analysisData.vulnerabilities.knownCVEs.map((v, i) => (
                        <div key={i} className="flex items-start gap-1.5 mb-1">
                          <Badge variant="outline" className={`text-[8px] flex-shrink-0 ${
                            v.severity === "critical" ? "border-red-500/50 text-red-400" :
                            v.severity === "high" ? "border-orange-500/50 text-orange-400" :
                            "border-amber-500/50 text-amber-400"
                          }`}>
                            {v.severity}
                          </Badge>
                          <span className="text-[10px] text-gray-400">{v.cve}: {v.description}</span>
                        </div>
                      ))}
                      <DetailRow label="Risk Score" value={`${analysisData.vulnerabilities.totalRiskScore}/100`} />
                    </DetailSection>
                  )}

                  {/* Warnings */}
                  {analysisData.aiStrategy?.warnings && analysisData.aiStrategy.warnings.length > 0 && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-semibold text-amber-400 uppercase">คำเตือน</span>
                      </div>
                      {analysisData.aiStrategy.warnings.map((w, i) => (
                        <p key={i} className="text-[10px] text-amber-300/70 ml-4">• {w}</p>
                      ))}
                    </div>
                  )}

                  {/* Best Approach */}
                  {analysisData.aiStrategy?.bestApproach && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] font-semibold text-emerald-400 uppercase">แนวทางที่ดีที่สุด</span>
                      </div>
                      <p className="text-[10px] text-emerald-300/70 ml-4">{analysisData.aiStrategy.bestApproach}</p>
                    </div>
                  )}

                  {/* Duration */}
                  {analysisData.duration && (
                    <div className="text-[10px] text-gray-600 text-right">
                      วิเคราะห์เสร็จใน {(analysisData.duration / 1000).toFixed(1)} วินาที
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Helper Components ───

function DetailSection({ title, icon: Icon, color, children }: {
  title: string;
  icon: React.ElementType;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-800/30 rounded-lg p-2 border border-gray-700/30">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3 h-3 ${color}`} />
        <span className={`text-[10px] font-semibold ${color} uppercase tracking-wider`}>{title}</span>
      </div>
      <div className="space-y-0.5 ml-4">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-gray-500 w-20 flex-shrink-0">{label}:</span>
      <span className="text-gray-300 truncate">{value}</span>
    </div>
  );
}
