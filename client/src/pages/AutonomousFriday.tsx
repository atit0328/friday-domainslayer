/**
 * AI Attack Engine — Unified Attack Pipeline + 3-Layer Autonomous System
 * 
 * Features:
 *   - Quick Stats Dashboard with real-time metrics
 *   - Single & Batch target modes
 *   - Method Priority Configuration (drag-to-reorder)
 *   - Proxy Configuration & Weighted Redirects
 *   - AI Vuln Scan → Shell Generation → Multi-Method Upload → Verification
 *   - 3-Layer Architecture: AttackLoop → FixatedLoop → EmergentLoop
 *   - Real-time pipeline visualization with event streaming
 *   - Background job support (close tab, come back later)
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Brain, Zap, Skull, Rocket, Target, Shield, Activity,
  Loader2, Lock, Play, Square, Globe, ChevronRight,
  AlertTriangle, CheckCircle2, XCircle, Clock, Cpu,
  Layers, Eye, Radio, Flame, Crosshair, Network,
  ArrowUpRight, BarChart3, Gauge, Sparkles, RefreshCw,
  Settings2, ChevronDown, ChevronUp, Package, Plus, Trash2,
  Search, FileCode, Upload, ShieldAlert, Bug, Server,
  FileText, Code, Wifi, HardDrive, Link2, ExternalLink,
  GripVertical, RotateCcw, TrendingUp, Bomb, Radar,
  Siren, CircleDot, Fingerprint, ListOrdered, Hash,
  Copy, ArrowDown, ArrowUp, Minus, Power, Unplug, Microscope,
} from "lucide-react";
import AiAnalysisCard from "@/components/AiAnalysisCard";
import AttackLogViewer from "@/components/AttackLogViewer";

// ─── Types ───
interface AutonomousEvent {
  type: string;
  layer?: 1 | 2 | 3;
  phase?: string;
  step?: number;
  totalSteps?: number;
  detail?: string;
  data?: Record<string, unknown>;
  timestamp?: number;
  progress?: number;
}

interface LayerState {
  active: boolean;
  phase: string;
  progress: number;
  events: AutonomousEvent[];
  status: "idle" | "running" | "complete" | "error";
}

interface PipelinePhaseState {
  status: "idle" | "running" | "complete" | "error";
  detail: string;
  progress: number;
  data?: Record<string, unknown>;
}

interface MethodPriorityItem {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  description: string;
}

// ─── Constants ───
const LAYER_CONFIG = [
  {
    id: 1,
    name: "AttackLoop",
    subtitle: "OODA Cycle",
    icon: Crosshair,
    color: "cyan",
    bgClass: "bg-cyan-500/10",
    borderClass: "border-cyan-500/30",
    textClass: "text-cyan-400",
    glowClass: "shadow-cyan-500/20",
    steps: ["Target", "Perceive", "Assess", "Decide", "Execute", "Verify", "Adapt"],
  },
  {
    id: 2,
    name: "FixatedLoop",
    subtitle: "Goal Meta-Loop",
    icon: Brain,
    color: "violet",
    bgClass: "bg-violet-500/10",
    borderClass: "border-violet-500/30",
    textClass: "text-violet-400",
    glowClass: "shadow-violet-500/20",
    steps: ["Fixate", "Intake", "Reason", "Self-Modify", "Execute", "Evaluate", "Escalate"],
  },
  {
    id: 3,
    name: "EmergentLoop",
    subtitle: "Self-Adaptation",
    icon: Sparkles,
    color: "amber",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/30",
    textClass: "text-amber-400",
    glowClass: "shadow-amber-500/20",
    steps: ["Init Goal", "Perceive", "Reason", "Adapt", "Execute", "Silent Fail", "Escalate", "Irreversible"],
  },
];

const ESCALATION_LEVELS = [
  { name: "cautious", color: "text-green-400", bg: "bg-green-500/10" },
  { name: "moderate", color: "text-blue-400", bg: "bg-blue-500/10" },
  { name: "aggressive", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { name: "reckless", color: "text-orange-400", bg: "bg-orange-500/10" },
  { name: "desperate", color: "text-red-400", bg: "bg-red-500/10" },
  { name: "nuclear", color: "text-red-600", bg: "bg-red-600/10" },
];

const MODE_OPTIONS = [
  { value: "emergent", label: "Emergent (Full Auto)", desc: "3-layer autonomous — self-adapting AI", icon: Sparkles },
  { value: "fixated", label: "Fixated (Goal-Locked)", desc: "2-layer goal-fixated meta-loop", icon: Brain },
  { value: "attack", label: "Attack (Single Cycle)", desc: "1-layer OODA attack cycle", icon: Crosshair },
];

const PIPELINE_PHASES = [
  { id: "ai_analysis", label: "AI Analysis", icon: Brain, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30" },
  { id: "prescreen", label: "Pre-Screen", icon: Search, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  { id: "vuln_scan", label: "Vuln Scan", icon: Bug, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
  { id: "shell_gen", label: "Shell Gen", icon: FileCode, color: "text-violet-400", bgColor: "bg-violet-500/10", borderColor: "border-violet-500/30" },
  { id: "upload", label: "Upload", icon: Upload, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" },
  { id: "verify", label: "Verify", icon: CheckCircle2, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30" },
  { id: "wp_admin", label: "WP Admin", icon: Lock, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  { id: "wp_db_inject", label: "DB Inject", icon: HardDrive, color: "text-rose-400", bgColor: "bg-rose-500/10", borderColor: "border-rose-500/30" },
  { id: "cloaking", label: "Cloaking", icon: Eye, color: "text-pink-400", bgColor: "bg-pink-500/10", borderColor: "border-pink-500/30" },
  { id: "comprehensive", label: "Comprehensive", icon: Microscope, color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30" },
];

// ─── Gambling Keyword Presets ───
const KEYWORD_PRESETS = [
  { label: "สล็อต", keywords: "สล็อต, สล็อตออนไลน์, เว็บสล็อต, สล็อตเว็บตรง, สล็อตฟรี, สล็อต pg, สล็อตแตกง่าย" },
  { label: "บาคาร่า", keywords: "บาคาร่า, บาคาร่าออนไลน์, เว็บบาคาร่า, บาคาร่าสด, บาคาร่าทดลองฟรี" },
  { label: "หวย", keywords: "หวย, หวยออนไลน์, เว็บหวย, หวยลาว, หวยฮานอย, ซื้อหวยออนไลน์" },
  { label: "พนันออนไลน์", keywords: "พนันออนไลน์, เว็บพนัน, คาสิโนออนไลน์, เดิมพันออนไลน์, แทงบอลออนไลน์" },
  { label: "ฟุตบอล", keywords: "ฟุตบอลออนไลน์, แทงบอล, เว็บแทงบอล, บอลสเต็ป, บอลออนไลน์" },
  { label: "ทั้งหมด", keywords: "สล็อต, บาคาร่า, หวย, พนันออนไลน์, คาสิโน, เว็บสล็อต, เว็บพนัน, แทงบอล" },
];

// ─── Default Method Priority ───
const DEFAULT_METHOD_PRIORITY: MethodPriorityItem[] = [
  { id: "oneclick", label: "One-Click Deploy", icon: "🚀", enabled: true, description: "Direct shell upload via vulnerability" },
  { id: "wp_admin", label: "WP Admin Takeover", icon: "🔑", enabled: true, description: "WordPress admin brute-force + plugin upload" },
  { id: "wp_db_inject", label: "WP DB Injection", icon: "💉", enabled: true, description: "Direct database injection via exposed phpMyAdmin" },
  { id: "alt_upload", label: "Alt Upload Methods", icon: "📤", enabled: true, description: "FTP, WebDAV, CMS API, cPanel file manager" },
  { id: "waf_bypass", label: "WAF Bypass", icon: "🛡️", enabled: true, description: "Web Application Firewall evasion techniques" },
  { id: "indirect", label: "Indirect Attacks", icon: "🎯", enabled: true, description: "Supply chain, CDN poisoning, DNS rebinding" },
  { id: "dns_attack", label: "DNS Attacks", icon: "🌐", enabled: false, description: "DNS takeover, subdomain hijacking" },
  { id: "config_exploit", label: "Config Exploits", icon: "⚙️", enabled: false, description: "Exposed .env, backup files, debug endpoints" },
  { id: "comprehensive", label: "Comprehensive Vectors", icon: "🔬", enabled: true, description: "SSTI, LDAP, NoSQL, IDOR, BOLA, BFLA, JWT, Prototype Pollution, etc. (29 vectors)" },
];

// ─── Component ───
export default function AutonomousFriday() {
  const { user, loading: authLoading } = useAuth();

  // ═══ Form state ═══
  const [targetDomain, setTargetDomain] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [mode, setMode] = useState<"emergent" | "fixated" | "attack">("emergent");
  const [maxIterations, setMaxIterations] = useState(15);
  const [seoKeywords, setSeoKeywords] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [geoRedirect, setGeoRedirect] = useState(true);
  const [parasiteContentLength, setParasiteContentLength] = useState<"short" | "medium" | "long">("medium");
  const [parasiteRedirectDelay, setParasiteRedirectDelay] = useState(5);

  // ═══ Method Priority ═══
  const [methodPriority, setMethodPriority] = useState<MethodPriorityItem[]>(DEFAULT_METHOD_PRIORITY);

  // ═══ Proxy Configuration ═══
  const [proxyList, setProxyList] = useState("");
  const [showProxyConfig, setShowProxyConfig] = useState(false);

  // ═══ Weighted Redirects ═══
  const [weightedRedirects, setWeightedRedirects] = useState("");
  const [showWeightedRedirects, setShowWeightedRedirects] = useState(false);

  // ═══ Job state ═══
  const [running, setRunning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [events, setEvents] = useState<AutonomousEvent[]>([]);
  const [finalResult, setFinalResult] = useState<{
    success?: boolean;
    mode?: string;
    duration?: number;
    shellUrls?: string[];
    verifiedUrls?: string[];
    deployedFiles?: string[];
    filesDeployed?: number;
    filesVerified?: number;
    escalationLevel?: number;
    aiSummary?: string;
    [key: string]: unknown;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const lastEventIdRef = useRef<number>(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ═══ tRPC ═══
  const startJobMutation = trpc.jobs.start.useMutation();
  const startBatchMutation = trpc.jobs.startBatch.useMutation();
  const cancelJobMutation = trpc.jobs.cancel.useMutation();
  const cancelBatchMutation = trpc.jobs.cancelBatch.useMutation();
  const statsQuery = trpc.autonomous.stats.useQuery();
  const recentJobsQuery = trpc.jobs.list.useQuery({ limit: 5 });

  // ═══ Layer states ═══
  const [layers, setLayers] = useState<Record<number, LayerState>>({
    1: { active: false, phase: "", progress: 0, events: [], status: "idle" },
    2: { active: false, phase: "", progress: 0, events: [], status: "idle" },
    3: { active: false, phase: "", progress: 0, events: [], status: "idle" },
  });

  // ═══ Pipeline phase tracking ═══
  const [pipelinePhases, setPipelinePhases] = useState<Record<string, PipelinePhaseState>>({
    ai_analysis: { status: "idle", detail: "", progress: 0 },
    prescreen: { status: "idle", detail: "", progress: 0 },
    vuln_scan: { status: "idle", detail: "", progress: 0 },
    cloaking: { status: "idle", detail: "", progress: 0 },
    shell_gen: { status: "idle", detail: "", progress: 0 },
    upload: { status: "idle", detail: "", progress: 0 },
    verify: { status: "idle", detail: "", progress: 0 },
    wp_admin: { status: "idle", detail: "", progress: 0 },
    wp_db_inject: { status: "idle", detail: "", progress: 0 },
  });

  // ═══ Cloaking config ═══
  const [enableCloaking, setEnableCloaking] = useState(true);
  const [cloakingBrand, setCloakingBrand] = useState("");
  const [cloakingContentType, setCloakingContentType] = useState<"landing" | "article" | "doorway" | "review">("landing");

  // ═══ Pipeline intel tracking ═══
  const [pipelineIntel, setPipelineIntel] = useState({
    serverType: "",
    cms: "",
    waf: "",
    successProb: 0,
    writablePaths: 0,
    uploadEndpoints: 0,
    attackVectors: 0,
    shellsGenerated: 0,
    shellTypes: [] as string[],
    uploadMethod: "",
    verifiedFiles: 0,
    redirectWorking: false,
    cloakingShellType: "",
    cloakingInternalPages: 0,
    cloakingDoorwayPages: 0,
    cloakingContentSize: 0,
  });

  // ═══ AI Analysis state ═══
  const [aiAnalysisSteps, setAiAnalysisSteps] = useState<Array<{
    stepId: string; stepName: string; status: "running" | "complete" | "error" | "skipped";
    detail: string; progress: number; data?: any; duration?: number;
  }>>([]);
  const [aiAnalysisData, setAiAnalysisData] = useState<any>(null);

  // ═══ Batch mode state ═══
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");
  const [batchTargets, setBatchTargets] = useState<Array<{ domain: string; redirectUrl: string }>>([]);
  const [batchName, setBatchName] = useState("");
  const [batchDomainInput, setBatchDomainInput] = useState("");
  const [batchRedirectInput, setBatchRedirectInput] = useState("");
  const [batchBulkInput, setBatchBulkInput] = useState("");
  const [batchResults, setBatchResults] = useState<Array<Record<string, unknown>>>([]);

  // ═══ Escalation tracking ═══
  const [escalationLevel, setEscalationLevel] = useState(0);
  const [worldState, setWorldState] = useState({
    hosts: 0, ports: 0, vulns: 0, creds: 0,
    uploadPaths: 0, shellUrls: 0, deployedFiles: 0, verifiedUrls: 0,
  });

  // ═══ UI state ═══
  const [mainTab, setMainTab] = useState<"launch" | "monitor" | "history" | "arsenal" | "detect" | "logs">("launch");
  const [arsenalDomain, setArsenalDomain] = useState("");
  const [arsenalRedirect, setArsenalRedirect] = useState("");
  const [arsenalResults, setArsenalResults] = useState<any>(null);
  const [arsenalRunning, setArsenalRunning] = useState(false);
  const [detectDomain, setDetectDomain] = useState("");
  const [detectResults, setDetectResults] = useState<any>(null);
  const [detectRunning, setDetectRunning] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "success" | "error" | "pipeline">("all");

  // ─── Auth guard ───
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user || user.role !== "superadmin") {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-red-400">Superadmin Access Required</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          AI Attack Engine requires Superadmin privileges.
        </p>
      </div>
    );
  }

  // ─── Auto-scroll events ───
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // ─── Timer ───
  useEffect(() => {
    if (running) {
      setElapsedSec(0);
      timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  // ─── Auto-switch to monitor tab when running ───
  useEffect(() => {
    if (running && mainTab === "launch") {
      setMainTab("monitor");
    }
  }, [running]);

  // ─── Process SSE event ───
  const processEvent = useCallback((evt: AutonomousEvent) => {
    setEvents((prev) => [...prev, evt]);

    // Update layer state
    if (evt.layer && evt.layer >= 1 && evt.layer <= 3) {
      setLayers((prev) => {
        const layer = { ...prev[evt.layer!] };
        layer.active = true;
        layer.events = [...layer.events, evt];
        if (evt.phase) layer.phase = evt.phase;
        if (evt.progress !== undefined) layer.progress = evt.progress;
        if (evt.type === "layer_start") layer.status = "running";
        if (evt.type === "layer_complete" || evt.type === "complete") layer.status = "complete";
        if (evt.type === "error") layer.status = "error";
        return { ...prev, [evt.layer!]: layer };
      });
    }

    // Update pipeline phase tracking
    if (evt.phase) {
      const phaseKey = evt.phase.replace("pipeline_", "").replace("unified_pipeline", "prescreen").replace("cloaking_content", "cloaking");
      const matchedPhase = PIPELINE_PHASES.find(p => phaseKey.startsWith(p.id));
      if (matchedPhase) {
        setPipelinePhases((prev) => {
          const current = { ...prev[matchedPhase.id] };
          if (evt.detail) current.detail = evt.detail;
          if (evt.progress !== undefined) current.progress = evt.progress;
          if (evt.type === "phase_start" || evt.detail?.includes("Phase")) current.status = "running";
          if (evt.type === "phase_complete" || evt.detail?.includes("✅") || evt.detail?.includes("สำเร็จ")) current.status = "complete";
          if (evt.type === "error" || evt.detail?.includes("❌") || evt.detail?.includes("ล้มเหลว")) {
            if (!evt.detail?.includes("ลอง") && !evt.detail?.includes("ดำเนินการต่อ")) {
              current.status = "error";
            }
          }
          if (evt.data) current.data = evt.data as Record<string, unknown>;
          return { ...prev, [matchedPhase.id]: current };
        });
      }

      // Extract pipeline intel from events
      if (evt.data) {
        const d = evt.data as Record<string, unknown>;
        setPipelineIntel((prev) => {
          const next = { ...prev };
          // Extract AI Target Analysis data
          if (d.aiTargetAnalysis) {
            const ai = d.aiTargetAnalysis as Record<string, any>;
            if (ai.httpFingerprint) {
              next.serverType = ai.httpFingerprint.serverType || prev.serverType;
            }
            if (ai.techStack) {
              next.cms = ai.techStack.cms || prev.cms;
            }
            if (ai.security) {
              next.waf = ai.security.wafDetected || prev.waf;
            }
            if (ai.aiStrategy) {
              next.successProb = ai.aiStrategy.overallSuccessProbability || prev.successProb;
            }
            // Store full AI analysis data
            setAiAnalysisData(ai);
          }
          // Extract AI analysis step data
          if (d.analysisStep) {
            const step = d.analysisStep as { stepId: string; stepName: string; status: string; detail: string; progress: number; data?: any; duration?: number };
            setAiAnalysisSteps(prev => {
              const existing = prev.findIndex(s => s.stepId === step.stepId);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = step as any;
                return updated;
              }
              return [...prev, step as any];
            });
          }
          if (d.prescreen) {
            const ps = d.prescreen as Record<string, unknown>;
            next.serverType = (ps.serverType as string) || prev.serverType;
            next.cms = (ps.cms as string) || prev.cms;
            next.waf = (ps.wafDetected as string) || prev.waf;
            next.successProb = (ps.overallSuccessProbability as number) || prev.successProb;
          }
          if (d.vulnScan) {
            const vs = d.vulnScan as Record<string, unknown>;
            next.writablePaths = (vs.writablePaths as unknown[])?.length || prev.writablePaths;
            next.uploadEndpoints = (vs.uploadEndpoints as unknown[])?.length || prev.uploadEndpoints;
            next.attackVectors = (vs.attackVectors as unknown[])?.length || prev.attackVectors;
          }
          if (d.shellCount !== undefined) next.shellsGenerated = d.shellCount as number;
          if (d.types) next.shellTypes = d.types as string[];
          if (d.uploadedFiles !== undefined) next.verifiedFiles = d.uploadedFiles as number;
          if (d.verifiedFiles !== undefined) next.verifiedFiles = d.verifiedFiles as number;
          if (d.cloakingType) next.cloakingShellType = d.cloakingType as string;
          if (d.internalPages !== undefined) next.cloakingInternalPages = d.internalPages as number;
          if (d.doorwayPages !== undefined) next.cloakingDoorwayPages = d.doorwayPages as number;
          if (d.contentSize !== undefined) next.cloakingContentSize = d.contentSize as number;
          return next;
        });
      }

      // Detect upload method from detail
      if (evt.detail) {
        if (evt.detail.includes("oneClickDeploy") && evt.detail.includes("✅")) {
          setPipelineIntel(p => ({ ...p, uploadMethod: "oneClickDeploy" }));
        } else if (evt.detail.includes("tryAll") && evt.detail.includes("✅")) {
          setPipelineIntel(p => ({ ...p, uploadMethod: "tryAllUploadMethods" }));
        } else if (evt.detail.includes("Parallel") && evt.detail.includes("✅")) {
          setPipelineIntel(p => ({ ...p, uploadMethod: "multiVectorParallel" }));
        } else if (evt.detail.includes("Smart retry") && evt.detail.includes("✅")) {
          setPipelineIntel(p => ({ ...p, uploadMethod: "smartRetry" }));
        }
        if (evt.detail.includes("Redirect ทำงาน") || evt.detail.includes("redirect working")) {
          setPipelineIntel(p => ({ ...p, redirectWorking: true }));
        }
      }
    }

    // Update escalation
    if (evt.type === "escalation" && evt.data) {
      const level = evt.data.level as number;
      if (typeof level === "number") setEscalationLevel(level);
    }

    // Update world state — from type OR phase
    if ((evt.type === "world_update" || evt.phase === "world_update") && evt.data) {
      setWorldState((prev) => ({ ...prev, ...evt.data }));
    }

    // Auto-detect layer from pipeline phase
    if (!evt.layer && evt.phase) {
      const phase = evt.phase;
      // AI Analysis runs before layers — update phase tracking only
      if (phase === "ai_analysis") {
        // Don't assign to any layer — it's Phase 0
      }
      else if (["prescreen", "vuln_scan", "shell_gen", "upload", "verify"].includes(phase)) {
        // Layer 1: AttackLoop (OODA)
        setLayers((prev) => {
          const layer = { ...prev[1] };
          layer.active = true;
          if (evt.phase) layer.phase = evt.phase;
          if (evt.progress !== undefined) layer.progress = evt.progress;
          layer.status = "running";
          if (evt.detail?.includes("✅") && phase === "verify") layer.status = "complete";
          return { ...prev, 1: layer };
        });
      }
      if (["wp_admin", "wp_db_inject", "waf_bypass", "alt_upload", "indirect"].includes(phase)) {
        // Layer 2: FixatedLoop (Goal Meta-Loop)
        setLayers((prev) => {
          const layer = { ...prev[2] };
          layer.active = true;
          if (evt.phase) layer.phase = evt.phase;
          if (evt.progress !== undefined) layer.progress = evt.progress;
          layer.status = "running";
          return { ...prev, 2: layer };
        });
      }
      if (["cloaking", "dns_attack", "config_exploit"].includes(phase)) {
        // Layer 3: EmergentLoop (Self-Adaptation)
        setLayers((prev) => {
          const layer = { ...prev[3] };
          layer.active = true;
          if (evt.phase) layer.phase = evt.phase;
          if (evt.progress !== undefined) layer.progress = evt.progress;
          layer.status = "running";
          return { ...prev, 3: layer };
        });
      }
      if (phase === "complete" || phase === "error") {
        // Mark all active layers as complete/error
        setLayers((prev) => {
          const next = { ...prev };
          for (const id of [1, 2, 3]) {
            if (next[id].active) {
              next[id] = { ...next[id], status: phase === "complete" ? "complete" : "error" };
            }
          }
          return next;
        });
      }
    }

    // Auto-detect escalation from pipeline progress
    if (evt.progress !== undefined) {
      const p = evt.progress;
      if (p >= 80) setEscalationLevel(prev => Math.max(prev, 5));
      else if (p >= 60) setEscalationLevel(prev => Math.max(prev, 4));
      else if (p >= 40) setEscalationLevel(prev => Math.max(prev, 3));
      else if (p >= 25) setEscalationLevel(prev => Math.max(prev, 2));
      else if (p >= 10) setEscalationLevel(prev => Math.max(prev, 1));
    }
  }, []);

  // ─── Reset all pipeline state ───
  const resetPipelineState = () => {
    setAiAnalysisSteps([]);
    setAiAnalysisData(null);
    setPipelinePhases({
      ai_analysis: { status: "idle", detail: "", progress: 0 },
      prescreen: { status: "idle", detail: "", progress: 0 },
      vuln_scan: { status: "idle", detail: "", progress: 0 },
      cloaking: { status: "idle", detail: "", progress: 0 },
      shell_gen: { status: "idle", detail: "", progress: 0 },
      upload: { status: "idle", detail: "", progress: 0 },
      verify: { status: "idle", detail: "", progress: 0 },
      wp_admin: { status: "idle", detail: "", progress: 0 },
      wp_db_inject: { status: "idle", detail: "", progress: 0 },
    });
    setPipelineIntel({
      serverType: "", cms: "", waf: "", successProb: 0,
      writablePaths: 0, uploadEndpoints: 0, attackVectors: 0,
      shellsGenerated: 0, shellTypes: [], uploadMethod: "",
      verifiedFiles: 0, redirectWorking: false,
      cloakingShellType: "", cloakingInternalPages: 0,
      cloakingDoorwayPages: 0, cloakingContentSize: 0,
    });
  };

  // ─── Poll for job events ───
  const pollJobEvents = useCallback(async (deployId: number) => {
    try {
      const eventsResult = await fetch(`/api/trpc/jobs.events?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { deployId, afterId: lastEventIdRef.current, limit: 200 } } }))}`, {
        credentials: "include",
      }).then(r => r.json());

      const eventsData = eventsResult?.[0]?.result?.data?.json;
      if (eventsData?.events?.length > 0) {
        for (const row of eventsData.events) {
          // Map DB event to AutonomousEvent with proper type detection
          let eventType = "step_detail";
          if (row.phase === "world_update") eventType = "world_update";
          else if (row.step === "init" || row.step === "start") eventType = "phase_start";
          else if (row.step === "complete" || row.step === "success") eventType = "phase_complete";
          else if (row.step === "error" || row.step === "fatal") eventType = "error";
          else if (row.phase === "complete") eventType = "complete";

          const evt: AutonomousEvent = {
            type: eventType,
            phase: row.phase,
            detail: row.detail,
            progress: row.progress,
            data: row.data,
            timestamp: new Date(row.createdAt).getTime(),
          };
          processEvent(evt);
        }
        lastEventIdRef.current = eventsData.lastEventId || lastEventIdRef.current;
      }

      const statusResult = await fetch(`/api/trpc/jobs.status?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { deployId } } }))}`, {
        credentials: "include",
      }).then(r => r.json());

      const status = statusResult?.[0]?.result?.data?.json;
      if (status) {
        if (status.liveProgress) {
          // Job still running
        } else if (status.status === "success" || status.status === "partial" || status.status === "failed" || status.status === "stopped") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setRunning(false);

          if (status.status === "success") {
            setFinalResult({
              success: true, mode,
              duration: status.duration || 0,
              shellUrls: status.shellUrls || [],
              verifiedUrls: status.verifiedUrls || [],
              deployedFiles: status.deployedUrls || [],
              filesDeployed: status.filesDeployed,
              filesVerified: status.filesVerified,
              escalationLevel: status.escalationLevel,
              aiSummary: status.aiDecisions?.join(" | "),
            });
            toast.success("AI Attack Engine completed!");
            statsQuery.refetch();
            recentJobsQuery.refetch();
          } else if (status.status === "partial") {
            setFinalResult({
              success: false, mode,
              duration: status.duration || 0,
              shellUrls: status.shellUrls || [],
              verifiedUrls: status.verifiedUrls || [],
              deployedFiles: status.deployedUrls || [],
              filesDeployed: status.filesDeployed,
              filesVerified: status.filesVerified,
            });
            toast.warning("Pipeline partial success — some files deployed");
          } else if (status.status === "failed") {
            setFinalResult({
              success: false, mode,
              duration: status.duration || 0,
              shellUrls: status.shellUrls || [],
              verifiedUrls: status.verifiedUrls || [],
              deployedFiles: status.deployedUrls || [],
              filesDeployed: status.filesDeployed || 0,
              filesVerified: status.filesVerified || 0,
            });
            setError(status.errorMessage || "Pipeline failed");
            toast.error(`Pipeline failed: ${status.errorMessage || "Unknown error"}`);
          } else {
            toast.info("Pipeline stopped");
          }
        }
      }
    } catch (e: any) {
      console.error("[Poll] Error:", e);
    }
  }, [processEvent, mode]);

  // ─── Start background job ───
  const startDeploy = async () => {
    if (!targetDomain.trim() || !redirectUrl.trim()) {
      toast.error("Target domain and redirect URL are required");
      return;
    }

    setRunning(true);
    setEvents([]);
    setFinalResult(null);
    setError(null);
    setEscalationLevel(0);
    setWorldState({ hosts: 0, ports: 0, vulns: 0, creds: 0, uploadPaths: 0, shellUrls: 0, deployedFiles: 0, verifiedUrls: 0 });
    setLayers({
      1: { active: false, phase: "", progress: 0, events: [], status: "idle" },
      2: { active: false, phase: "", progress: 0, events: [], status: "idle" },
      3: { active: false, phase: "", progress: 0, events: [], status: "idle" },
    });
    resetPipelineState();
    lastEventIdRef.current = 0;

    try {
      const result = await startJobMutation.mutateAsync({
        targetDomain: targetDomain.trim(),
        redirectUrl: redirectUrl.trim(),
        mode,
        maxIterations,
        seoKeywords: seoKeywords.trim() || undefined,
        geoRedirect,
        parasiteContentLength,
        parasiteRedirectDelay,
        enableCloaking,
        cloakingBrand: cloakingBrand.trim() || undefined,
        cloakingContentType,
        proxyList: proxyList.trim() || undefined,
        weightedRedirects: weightedRedirects.trim() || undefined,
        methodPriority: methodPriority.map(m => ({ id: m.id, enabled: m.enabled })),
      });

      const deployId = result.deployId;
      setActiveJobId(deployId);
      toast.success(`Background Job #${deployId} started — ปิดหน้าจอได้ ระบบทำงานต่อ`);
      setMainTab("monitor");

      pollingRef.current = setInterval(() => pollJobEvents(deployId), 2000);
    } catch (e: any) {
      setRunning(false);
      setError(e.message);
      toast.error(`Failed to start: ${e.message}`);
    }
  };

  // ─── Stop / Cancel job ───
  const stopDeploy = async () => {
    if (activeJobId) {
      try {
        await cancelJobMutation.mutateAsync({ deployId: activeJobId });
        toast.info(`Job #${activeJobId} cancelled`);
      } catch { /* best effort */ }
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setRunning(false);
    setActiveJobId(null);
  };

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ─── Batch helpers ───
  const addBatchTarget = () => {
    if (!batchDomainInput.trim() || !batchRedirectInput.trim()) {
      toast.error("Domain and Redirect URL required");
      return;
    }
    setBatchTargets((prev) => [...prev, { domain: batchDomainInput.trim(), redirectUrl: batchRedirectInput.trim() }]);
    setBatchDomainInput("");
  };

  const parseBulkTargets = () => {
    const lines = batchBulkInput.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed: Array<{ domain: string; redirectUrl: string }> = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      if (parts.length >= 2) {
        parsed.push({ domain: parts[0], redirectUrl: parts[1] });
      } else if (parts[0] && redirectUrl.trim()) {
        parsed.push({ domain: parts[0], redirectUrl: redirectUrl.trim() });
      }
    }
    if (parsed.length > 0) {
      setBatchTargets((prev) => [...prev, ...parsed]);
      setBatchBulkInput("");
      toast.success(`Added ${parsed.length} targets`);
    } else {
      toast.error("No valid targets found. Use format: domain,redirectUrl");
    }
  };

  const removeBatchTarget = (index: number) => {
    setBatchTargets((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Start batch deploy ───
  const startBatchDeploy = async () => {
    if (batchTargets.length === 0) {
      toast.error("Add at least one target");
      return;
    }
    setRunning(true);
    setEvents([]);
    setFinalResult(null);
    setError(null);
    setBatchResults([]);
    setEscalationLevel(0);
    setWorldState({ hosts: 0, ports: 0, vulns: 0, creds: 0, uploadPaths: 0, shellUrls: 0, deployedFiles: 0, verifiedUrls: 0 });
    setLayers({
      1: { active: false, phase: "", progress: 0, events: [], status: "idle" },
      2: { active: false, phase: "", progress: 0, events: [], status: "idle" },
      3: { active: false, phase: "", progress: 0, events: [], status: "idle" },
    });
    resetPipelineState();
    lastEventIdRef.current = 0;

    try {
      const result = await startBatchMutation.mutateAsync({
        targets: batchTargets.map(t => ({ domain: t.domain, redirectUrl: t.redirectUrl })),
        mode,
        maxIterations,
        seoKeywords: seoKeywords.trim() || undefined,
        geoRedirect,
        parasiteContentLength,
        parasiteRedirectDelay,
        enableCloaking,
        cloakingBrand: cloakingBrand.trim() || undefined,
        cloakingContentType,
        proxyList: proxyList.trim() || undefined,
        weightedRedirects: weightedRedirects.trim() || undefined,
        methodPriority: methodPriority.map(m => ({ id: m.id, enabled: m.enabled })),
      });

      const { deployIds, batchId } = result;
      // Monitor the first job for real-time events, track all for batch status
      const firstDeployId = deployIds[0];
      setActiveJobId(firstDeployId);
      setBatchResults(deployIds.map(id => ({ deployId: id, status: "running" })));
      toast.success(`Batch ${batchId} started — ${deployIds.length}/${batchTargets.length} jobs launched`);
      setMainTab("monitor");

      // Poll events for the first job (active monitoring)
      pollingRef.current = setInterval(() => pollJobEvents(firstDeployId), 2000);

      // Also poll batch status to track all jobs
      const batchPollRef = setInterval(async () => {
        try {
          const batchStatus = await fetch(`/api/trpc/jobs.batchStatus?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { deployIds } } }))}`, {
            credentials: "include",
          }).then(r => r.json());
          const data = batchStatus?.[0]?.result?.data?.json;
          if (data) {
            setBatchResults(data.jobs?.map((j: any) => ({
              deployId: j.id,
              domain: j.targetDomain,
              status: j.status,
              shellUrls: j.shellUrls,
              verifiedUrls: j.verifiedUrls,
              duration: j.duration,
            })) || []);
            // If all done, stop polling
            if (data.completed === data.total) {
              clearInterval(batchPollRef);
              statsQuery.refetch();
              recentJobsQuery.refetch();
              toast.success(`Batch complete: ${data.succeeded} success, ${data.failed} failed`);
            }
          }
        } catch { /* best effort */ }
      }, 5000);
    } catch (e: any) {
      setRunning(false);
      setError(e.message);
      toast.error(`Failed to start batch: ${e.message}`);
    }
  };

  // ─── Method priority helpers ───
  const moveMethodUp = (index: number) => {
    if (index === 0) return;
    setMethodPriority(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveMethodDown = (index: number) => {
    if (index === methodPriority.length - 1) return;
    setMethodPriority(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const toggleMethod = (index: number) => {
    setMethodPriority(prev => {
      const next = [...prev];
      next[index] = { ...next[index], enabled: !next[index].enabled };
      return next;
    });
  };

  // ─── Format helpers ───
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ─── Event icon ───
  const getEventIcon = (evt: AutonomousEvent) => {
    if (evt.phase?.includes("prescreen")) return <Search className="w-3.5 h-3.5 text-blue-400" />;
    if (evt.phase?.includes("vuln_scan")) return <Bug className="w-3.5 h-3.5 text-red-400" />;
    if (evt.phase?.includes("shell_gen")) return <FileCode className="w-3.5 h-3.5 text-violet-400" />;
    if (evt.phase?.includes("upload") || evt.phase?.includes("oneclick") || evt.phase?.includes("parallel") || evt.phase?.includes("smart_retry")) return <Upload className="w-3.5 h-3.5 text-amber-400" />;
    if (evt.phase?.includes("verify")) return <Eye className="w-3.5 h-3.5 text-emerald-400" />;
    if (evt.phase?.includes("wp_admin")) return <Lock className="w-3.5 h-3.5 text-orange-400" />;
    if (evt.phase?.includes("wp_db_inject")) return <HardDrive className="w-3.5 h-3.5 text-rose-400" />;
    if (evt.phase?.includes("pipeline")) return <Rocket className="w-3.5 h-3.5 text-red-400" />;

    switch (evt.type) {
      case "layer_start": return <Layers className="w-3.5 h-3.5 text-cyan-400" />;
      case "layer_complete": return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
      case "phase_start": return <Play className="w-3.5 h-3.5 text-blue-400" />;
      case "phase_complete": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case "step_detail": return <ChevronRight className="w-3.5 h-3.5 text-gray-400" />;
      case "decision": return <Brain className="w-3.5 h-3.5 text-violet-400" />;
      case "escalation": return <Flame className="w-3.5 h-3.5 text-orange-400" />;
      case "adaptation": return <RefreshCw className="w-3.5 h-3.5 text-amber-400" />;
      case "goal_drift": return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
      case "reward_hack": return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
      case "module_exec": return <Cpu className="w-3.5 h-3.5 text-cyan-400" />;
      case "ai_reasoning": return <Sparkles className="w-3.5 h-3.5 text-violet-400" />;
      case "error": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case "world_update": return <Globe className="w-3.5 h-3.5 text-emerald-400" />;
      default: return <Activity className="w-3.5 h-3.5 text-gray-500" />;
    }
  };

  // ─── Layer color for event ───
  const getLayerColor = (evt: AutonomousEvent) => {
    if (evt.layer === 1) return "border-l-cyan-500/50";
    if (evt.layer === 2) return "border-l-violet-500/50";
    if (evt.layer === 3) return "border-l-amber-500/50";
    if (evt.phase?.includes("prescreen")) return "border-l-blue-500/50";
    if (evt.phase?.includes("vuln_scan")) return "border-l-red-500/50";
    if (evt.phase?.includes("cloaking")) return "border-l-pink-500/50";
    if (evt.phase?.includes("shell_gen")) return "border-l-violet-500/50";
    if (evt.phase?.includes("upload") || evt.phase?.includes("oneclick") || evt.phase?.includes("parallel") || evt.phase?.includes("smart_retry") || evt.phase?.includes("all_methods")) return "border-l-amber-500/50";
    if (evt.phase?.includes("verify")) return "border-l-emerald-500/50";
    if (evt.phase?.includes("wp_admin")) return "border-l-orange-500/50";
    if (evt.phase?.includes("wp_db_inject")) return "border-l-rose-500/50";
    if (evt.phase?.includes("pipeline")) return "border-l-red-500/50";
    return "border-l-gray-600/50";
  };

  // ─── Overall progress ───
  const overallProgress = (() => {
    const pipelineActive = Object.values(pipelinePhases).some(p => p.status === "running" || p.status === "complete");
    if (pipelineActive) {
      const phases = Object.values(pipelinePhases);
      const completedPhases = phases.filter(p => p.status === "complete").length;
      const runningPhase = phases.find(p => p.status === "running");
      const runningProgress = runningPhase ? (runningPhase.progress / 100) : 0;
      return Math.round(((completedPhases + runningProgress) / phases.length) * 100);
    }
    const modeMax = mode === "attack" ? 1 : mode === "fixated" ? 2 : 3;
    let total = 0;
    let count = 0;
    for (let i = 1; i <= modeMax; i++) {
      total += layers[i].progress;
      count++;
    }
    return count > 0 ? Math.round(total / count) : 0;
  })();

  // ─── Pipeline phase status icon ───
  const getPipelineStatusIcon = (status: string) => {
    switch (status) {
      case "running": return <Loader2 className="w-3 h-3 animate-spin" />;
      case "complete": return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case "error": return <XCircle className="w-3 h-3 text-red-400" />;
      default: return <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />;
    }
  };

  // ─── Filtered events ───
  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") return events;
    if (eventFilter === "success") return events.filter(e => e.detail?.includes("✅") || e.type === "phase_complete" || e.type === "layer_complete");
    if (eventFilter === "error") return events.filter(e => e.detail?.includes("❌") || e.type === "error" || e.detail?.includes("ล้มเหลว"));
    if (eventFilter === "pipeline") return events.filter(e => e.phase && !e.layer);
    return events;
  }, [events, eventFilter]);

  // ─── Stats data ───
  const stats = statsQuery.data || { total: 0, success: 0, partial: 0, failed: 0, running: 0 };
  const successRate = stats.total > 0 ? Math.round(((stats.success + stats.partial) / stats.total) * 100) : 0;

  return (
    <div className="space-y-4 p-1">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500/20 to-amber-500/20 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-500/10">
            <Rocket className="w-5.5 h-5.5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              AI <span className="text-red-400">Attack Engine</span>
              <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400 font-mono">v3.0</Badge>
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              Unified Pipeline + Multi-Vector + 3-Layer Autonomous AI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <Badge variant="outline" className="border-red-500/30 text-red-400 animate-pulse gap-1.5">
              <Radio className="w-3 h-3" /> LIVE {formatTime(elapsedSec)}
            </Badge>
          )}
          {activeJobId && (
            <Badge variant="outline" className="border-violet-500/30 text-violet-400 gap-1 font-mono text-[10px]">
              Job #{activeJobId}
            </Badge>
          )}
        </div>
      </div>

      {/* ═══ Quick Stats Dashboard ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: "Total Deploys", value: stats.total, icon: Rocket, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20" },
          { label: "Success", value: stats.success, icon: CheckCircle2, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
          { label: "Partial", value: stats.partial, icon: AlertTriangle, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/20" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/20" },
          { label: "Success Rate", value: `${successRate}%`, icon: TrendingUp, color: successRate >= 50 ? "text-emerald-400" : "text-amber-400", bgColor: successRate >= 50 ? "bg-emerald-500/10" : "bg-amber-500/10", borderColor: successRate >= 50 ? "border-emerald-500/20" : "border-amber-500/20" },
        ].map((stat) => (
          <Card key={stat.label} className={`${stat.borderColor} ${stat.bgColor} border`}>
            <CardContent className="p-3 flex items-center gap-3">
              <stat.icon className={`w-5 h-5 ${stat.color} shrink-0`} />
              <div>
                <div className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══ Main Tabs ═══ */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="launch" className="gap-1.5">
            <Rocket className="w-3.5 h-3.5" />
            Launch
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Monitor
            {running && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Recent
          </TabsTrigger>
          <TabsTrigger value="arsenal" className="gap-1.5">
            <Bomb className="w-3.5 h-3.5" />
            Arsenal
          </TabsTrigger>
          <TabsTrigger value="detect" className="gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Detect
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Logs
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══ LAUNCH TAB ═══ */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="launch" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Target Config */}
            <div className="lg:col-span-2 space-y-4">
              {/* Single vs Batch */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="w-full">
                  <TabsTrigger value="single" className="flex-1 gap-1.5">
                    <Target className="w-3.5 h-3.5" /> Single Target
                  </TabsTrigger>
                  <TabsTrigger value="batch" className="flex-1 gap-1.5">
                    <Package className="w-3.5 h-3.5" /> Batch Mode
                  </TabsTrigger>
                </TabsList>

                {/* ─── Single Target ─── */}
                <TabsContent value="single" className="mt-3">
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Target className="w-4 h-4 text-red-400" />
                        Target Configuration
                      </CardTitle>
                      <CardDescription className="text-xs">ใส่โดเมนเป้าหมายและ URL ที่ต้องการ redirect ไป</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Target Domain</Label>
                          <Input
                            value={targetDomain}
                            onChange={(e) => setTargetDomain(e.target.value)}
                            placeholder="example.com"
                            disabled={running}
                            className="mt-1 font-mono text-sm bg-background/50"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Redirect URL</Label>
                          <Input
                            value={redirectUrl}
                            onChange={(e) => setRedirectUrl(e.target.value)}
                            placeholder="https://your-site.com"
                            disabled={running}
                            className="mt-1 font-mono text-sm bg-background/50"
                          />
                        </div>
                      </div>

                      {/* ─── SEO Keywords ─── */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Keywords ที่จะวาง (เลือก preset หรือพิมพ์เอง)</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                          {KEYWORD_PRESETS.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              disabled={running}
                              onClick={() => setSeoKeywords(preset.keywords)}
                              className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                                seoKeywords === preset.keywords
                                  ? "bg-pink-500/20 border-pink-500/50 text-pink-300"
                                  : "bg-background/50 border-border/30 text-muted-foreground hover:border-pink-500/30 hover:text-pink-300"
                              } disabled:opacity-50`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={seoKeywords}
                          onChange={(e) => setSeoKeywords(e.target.value)}
                          placeholder="สล็อต, บาคาร่า, หวย, พนันออนไลน์"
                          disabled={running}
                          className="font-mono text-sm bg-background/50"
                        />
                      </div>

                      {/* ─── Advanced Settings Toggle ─── */}
                      <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        Advanced Settings
                        {showAdvanced ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                      </button>

                      {showAdvanced && (
                        <div className="space-y-4 pt-3 border-t border-border/30">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Max Iterations</Label>
                              <Input
                                type="number"
                                value={maxIterations}
                                onChange={(e) => setMaxIterations(parseInt(e.target.value) || 15)}
                                min={1} max={50}
                                disabled={running}
                                className="mt-1 font-mono text-sm bg-background/50"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Parasite Content</Label>
                              <Select value={parasiteContentLength} onValueChange={(v) => setParasiteContentLength(v as any)} disabled={running}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="short">Short</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="long">Long</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Redirect Delay (sec)</Label>
                              <Input
                                type="number"
                                value={parasiteRedirectDelay}
                                onChange={(e) => setParasiteRedirectDelay(parseInt(e.target.value) || 5)}
                                min={0} max={30}
                                disabled={running}
                                className="mt-1 font-mono text-sm bg-background/50"
                              />
                            </div>
                            <div className="flex items-center justify-between pt-5">
                              <Label className="text-xs text-muted-foreground">Geo Redirect</Label>
                              <Switch checked={geoRedirect} onCheckedChange={setGeoRedirect} disabled={running} />
                            </div>
                          </div>

                          {/* ─── Cloaking Shell Settings ─── */}
                          <div className="p-3 rounded-lg border border-pink-500/20 bg-pink-500/5">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Eye className="w-3.5 h-3.5 text-pink-400" />
                                <span className="text-xs font-semibold text-pink-400">Cloaking Shell</span>
                              </div>
                              <Switch checked={enableCloaking} onCheckedChange={setEnableCloaking} disabled={running} />
                            </div>
                            {enableCloaking && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Brand Name</Label>
                                  <Input
                                    value={cloakingBrand}
                                    onChange={(e) => setCloakingBrand(e.target.value)}
                                    placeholder="SlotXO, PG Slot, etc."
                                    disabled={running}
                                    className="mt-1 font-mono text-sm bg-background/50"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Content Type</Label>
                                  <Select value={cloakingContentType} onValueChange={(v) => setCloakingContentType(v as any)} disabled={running}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="landing">Landing Page</SelectItem>
                                      <SelectItem value="article">Article</SelectItem>
                                      <SelectItem value="doorway">Doorway Page</SelectItem>
                                      <SelectItem value="review">Review Page</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* ─── Proxy Configuration ─── */}
                          <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
                            <button
                              onClick={() => setShowProxyConfig(!showProxyConfig)}
                              className="flex items-center gap-2 w-full text-xs"
                            >
                              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="font-semibold text-cyan-400">Proxy Configuration</span>
                              {proxyList && <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-400 ml-auto mr-2">{proxyList.split("\n").filter(Boolean).length} proxies</Badge>}
                              {showProxyConfig ? <ChevronUp className="w-3 h-3 ml-auto text-muted-foreground" /> : <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" />}
                            </button>
                            {showProxyConfig && (
                              <div className="mt-3">
                                <Textarea
                                  value={proxyList}
                                  onChange={(e) => setProxyList(e.target.value)}
                                  placeholder={"socks5://user:pass@ip:port\nhttp://ip:port\nsocks5://ip:port"}
                                  disabled={running}
                                  rows={3}
                                  className="font-mono text-xs bg-background/50"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">ใส่ proxy ทีละบรรทัด (socks5/http) — ระบบจะ rotate อัตโนมัติ</p>
                              </div>
                            )}
                          </div>

                          {/* ─── Weighted Redirects ─── */}
                          <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                            <button
                              onClick={() => setShowWeightedRedirects(!showWeightedRedirects)}
                              className="flex items-center gap-2 w-full text-xs"
                            >
                              <Link2 className="w-3.5 h-3.5 text-amber-400" />
                              <span className="font-semibold text-amber-400">Weighted Redirects</span>
                              {showWeightedRedirects ? <ChevronUp className="w-3 h-3 ml-auto text-muted-foreground" /> : <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" />}
                            </button>
                            {showWeightedRedirects && (
                              <div className="mt-3">
                                <Textarea
                                  value={weightedRedirects}
                                  onChange={(e) => setWeightedRedirects(e.target.value)}
                                  placeholder={"https://site-a.com,60\nhttps://site-b.com,30\nhttps://site-c.com,10"}
                                  disabled={running}
                                  rows={3}
                                  className="font-mono text-xs bg-background/50"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">กระจาย redirect ไปหลาย URL ตาม weight (%) — format: url,weight</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ─── Launch Button ─── */}
                      <div className="pt-2">
                        {!running ? (
                          <Button
                            onClick={startDeploy}
                            className="w-full bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold gap-2 h-11"
                            disabled={!targetDomain.trim() || !redirectUrl.trim()}
                          >
                            <Rocket className="w-4 h-4" />
                            DEPLOY ATTACK
                          </Button>
                        ) : (
                          <Button onClick={stopDeploy} variant="destructive" className="w-full gap-2 h-11">
                            <Square className="w-4 h-4" />
                            ABORT MISSION
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Batch Mode ─── */}
                <TabsContent value="batch" className="space-y-3 mt-3">
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Package className="w-4 h-4 text-violet-400" />
                        Batch Targets ({batchTargets.length})
                      </CardTitle>
                      <CardDescription className="text-xs">เพิ่มหลายเป้าหมายพร้อมกัน ระบบจะทำทีละ target</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Batch Name (optional)</Label>
                        <Input
                          value={batchName}
                          onChange={(e) => setBatchName(e.target.value)}
                          placeholder="My batch deploy"
                          disabled={running}
                          className="mt-1 text-sm bg-background/50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Add Target</Label>
                        <div className="flex gap-1.5">
                          <Input
                            value={batchDomainInput}
                            onChange={(e) => setBatchDomainInput(e.target.value)}
                            placeholder="domain.com"
                            disabled={running}
                            className="font-mono text-xs bg-background/50 flex-1"
                          />
                          <Input
                            value={batchRedirectInput}
                            onChange={(e) => setBatchRedirectInput(e.target.value)}
                            placeholder="https://redirect.com"
                            disabled={running}
                            className="font-mono text-xs bg-background/50 flex-1"
                          />
                          <Button size="sm" variant="outline" onClick={addBatchTarget} disabled={running}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Bulk Paste (domain,redirectUrl per line)</Label>
                        <Textarea
                          value={batchBulkInput}
                          onChange={(e) => setBatchBulkInput(e.target.value)}
                          placeholder={"example1.com,https://redirect1.com\nexample2.com,https://redirect2.com"}
                          disabled={running}
                          rows={3}
                          className="font-mono text-xs bg-background/50"
                        />
                        <Button size="sm" variant="outline" onClick={parseBulkTargets} disabled={running} className="w-full gap-1">
                          <Plus className="w-3 h-3" /> Parse & Add
                        </Button>
                      </div>

                      {batchTargets.length > 0 && (
                        <ScrollArea className="max-h-[200px]">
                          <div className="space-y-1">
                            {batchTargets.map((t, i) => (
                              <div key={i} className="flex items-center justify-between p-1.5 rounded bg-background/30 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-muted-foreground font-mono">{i + 1}.</span>
                                  <span className="font-mono font-semibold truncate">{t.domain}</span>
                                  <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="font-mono text-[10px] truncate max-w-[150px] text-muted-foreground">{t.redirectUrl}</span>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => removeBatchTarget(i)} disabled={running} className="h-6 w-6 p-0">
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}

                      <div className="pt-2">
                        {!running ? (
                          <Button
                            onClick={startBatchDeploy}
                            className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-bold gap-2 h-11"
                            disabled={batchTargets.length === 0}
                          >
                            <Package className="w-4 h-4" />
                            DEPLOY BATCH ({batchTargets.length} targets)
                          </Button>
                        ) : (
                          <Button onClick={stopDeploy} variant="destructive" className="w-full gap-2 h-11">
                            <Square className="w-4 h-4" /> ABORT BATCH
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Right: Mode + Method Priority */}
            <div className="space-y-4">
              {/* Attack Mode */}
              <Card className="border-border/30 bg-card/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-red-400" />
                    Attack Mode
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {MODE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = mode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => !running && setMode(opt.value as any)}
                        disabled={running}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                          isSelected
                            ? "bg-red-500/10 border-red-500/30 shadow-sm"
                            : "bg-background/30 border-border/30 hover:border-red-500/20"
                        } disabled:opacity-50`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? "bg-red-500/20" : "bg-muted/30"}`}>
                          <Icon className={`w-4 h-4 ${isSelected ? "text-red-400" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <div className={`text-xs font-bold ${isSelected ? "text-red-400" : "text-foreground"}`}>{opt.label}</div>
                          <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-red-400 ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Method Priority */}
              <Card className="border-border/30 bg-card/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-amber-400" />
                    Method Priority
                  </CardTitle>
                  <CardDescription className="text-[10px]">ลำดับวิธีการโจมตี — ระบบจะลองจากบนลงล่าง</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {methodPriority.map((method, i) => (
                    <div
                      key={method.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                        method.enabled
                          ? "bg-background/30 border-border/30"
                          : "bg-muted/10 border-border/10 opacity-50"
                      }`}
                    >
                      <span className="text-sm shrink-0">{method.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold truncate">{method.label}</div>
                        <div className="text-[9px] text-muted-foreground truncate">{method.description}</div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => moveMethodUp(i)}
                          disabled={i === 0 || running}
                          className="p-1 rounded hover:bg-muted/30 disabled:opacity-20 transition-colors"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => moveMethodDown(i)}
                          disabled={i === methodPriority.length - 1 || running}
                          className="p-1 rounded hover:bg-muted/30 disabled:opacity-20 transition-colors"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => toggleMethod(i)}
                          disabled={running}
                          className="p-1 rounded hover:bg-muted/30 transition-colors"
                        >
                          {method.enabled ? (
                            <Power className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Unplug className="w-3 h-3 text-red-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setMethodPriority(DEFAULT_METHOD_PRIORITY)}
                    disabled={running}
                    className="w-full flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-1.5"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset to Default
                  </button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══ MONITOR TAB ═══ */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="monitor" className="mt-4">
          {/* Pipeline Visualization */}
          {(running || events.length > 0) && (
            <Card className="border-border/30 bg-card/30 overflow-hidden mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Unified Attack Pipeline
                  {pipelineIntel.redirectWorking && (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> REDIRECT ACTIVE
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {/* Pipeline Phase Flow */}
                <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                  {PIPELINE_PHASES.map((phase, i) => {
                    const state = pipelinePhases[phase.id] || { status: "idle", detail: "", progress: 0 };
                    const Icon = phase.icon;
                    return (
                      <div key={phase.id} className="flex items-center flex-1 min-w-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all flex-1 cursor-default ${
                              state.status === "running" ? `${phase.bgColor} ${phase.borderColor} shadow-sm` :
                              state.status === "complete" ? "bg-emerald-500/10 border-emerald-500/30" :
                              state.status === "error" ? "bg-red-500/10 border-red-500/30" :
                              "bg-muted/20 border-border/30"
                            }`}>
                              <div className="shrink-0">
                                {state.status === "running" ? (
                                  <Loader2 className={`w-3.5 h-3.5 animate-spin ${phase.color}`} />
                                ) : state.status === "complete" ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                ) : state.status === "error" ? (
                                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                                ) : (
                                  <Icon className="w-3.5 h-3.5 text-muted-foreground/40" />
                                )}
                              </div>
                              <span className={`text-[10px] font-semibold truncate ${
                                state.status === "running" ? phase.color :
                                state.status === "complete" ? "text-emerald-400" :
                                state.status === "error" ? "text-red-400" :
                                "text-muted-foreground/50"
                              }`}>
                                {phase.label}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{state.detail || phase.label}</p>
                            {state.progress > 0 && <p className="text-[10px] text-muted-foreground">{state.progress}%</p>}
                          </TooltipContent>
                        </Tooltip>
                        {i < PIPELINE_PHASES.length - 1 && (
                          <ChevronRight className={`w-3 h-3 shrink-0 mx-0.5 ${
                            state.status === "complete" ? "text-emerald-400" : "text-muted-foreground/20"
                          }`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pipeline Intel Grid */}
                {(pipelineIntel.serverType || pipelineIntel.shellsGenerated > 0 || pipelineIntel.uploadMethod) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {pipelineIntel.serverType && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-background/30 text-[11px]">
                        <Server className="w-3 h-3 text-blue-400 shrink-0" />
                        <span className="text-muted-foreground">Server:</span>
                        <span className="font-mono font-semibold truncate">{pipelineIntel.serverType}</span>
                      </div>
                    )}
                    {pipelineIntel.cms && pipelineIntel.cms !== "none" && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-background/30 text-[11px]">
                        <Code className="w-3 h-3 text-violet-400 shrink-0" />
                        <span className="text-muted-foreground">CMS:</span>
                        <span className="font-mono font-semibold truncate">{pipelineIntel.cms}</span>
                      </div>
                    )}
                    {pipelineIntel.waf && pipelineIntel.waf !== "none" && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-background/30 text-[11px]">
                        <ShieldAlert className="w-3 h-3 text-orange-400 shrink-0" />
                        <span className="text-muted-foreground">WAF:</span>
                        <span className="font-mono font-semibold truncate text-orange-400">{pipelineIntel.waf}</span>
                      </div>
                    )}
                    {pipelineIntel.successProb > 0 && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-background/30 text-[11px]">
                        <Gauge className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="text-muted-foreground">Prob:</span>
                        <span className={`font-mono font-bold ${
                          pipelineIntel.successProb >= 70 ? "text-emerald-400" :
                          pipelineIntel.successProb >= 40 ? "text-yellow-400" : "text-red-400"
                        }`}>{pipelineIntel.successProb}%</span>
                      </div>
                    )}
                    {pipelineIntel.attackVectors > 0 && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-background/30 text-[11px]">
                        <Crosshair className="w-3 h-3 text-red-400 shrink-0" />
                        <span className="text-muted-foreground">Vectors:</span>
                        <span className="font-mono font-bold">{pipelineIntel.attackVectors}</span>
                      </div>
                    )}
                    {pipelineIntel.shellsGenerated > 0 && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-background/30 text-[11px]">
                        <FileCode className="w-3 h-3 text-violet-400 shrink-0" />
                        <span className="text-muted-foreground">Shells:</span>
                        <span className="font-mono font-bold">{pipelineIntel.shellsGenerated}</span>
                      </div>
                    )}
                    {pipelineIntel.uploadMethod && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-background/30 text-[11px]">
                        <Upload className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="text-muted-foreground">Method:</span>
                        <span className="font-mono font-semibold truncate text-emerald-400">{pipelineIntel.uploadMethod}</span>
                      </div>
                    )}
                    {pipelineIntel.cloakingShellType && (
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-background/30 text-[11px]">
                        <Eye className="w-3 h-3 text-pink-400 shrink-0" />
                        <span className="text-muted-foreground">Cloaking:</span>
                        <span className="font-mono font-semibold truncate text-pink-400">{pipelineIntel.cloakingShellType}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Shell Types */}
                {pipelineIntel.shellTypes.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">Shell Types:</span>
                    {pipelineIntel.shellTypes.map((type, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 border-violet-500/30 text-violet-400">
                        {type}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* AI Analysis Card */}
                {pipelinePhases.ai_analysis && pipelinePhases.ai_analysis.status !== "idle" && (
                  <div className="mt-3">
                    <AiAnalysisCard
                      phaseState={pipelinePhases.ai_analysis}
                      analysisSteps={aiAnalysisSteps}
                      analysisData={aiAnalysisData}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Main Monitor Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Layer Status + World State */}
            <div className="space-y-3">
              {/* Overall Progress */}
              <Card className="border-border/30 bg-card/30">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold">Overall Progress</span>
                    <span className="text-xs font-mono text-muted-foreground">{overallProgress}%</span>
                  </div>
                  <Progress value={overallProgress} className="h-2" />
                </CardContent>
              </Card>

              {/* Layer Status Cards */}
              {LAYER_CONFIG.map((lc) => {
                const ls = layers[lc.id];
                const isActive = ls.active || (running && mode === "emergent" ? true : mode === "fixated" ? lc.id <= 2 : lc.id === 1);
                const Icon = lc.icon;
                return (
                  <Card
                    key={lc.id}
                    className={`border-border/30 transition-all duration-300 ${
                      ls.status === "running" ? `${lc.borderClass} ${lc.bgClass} shadow-lg ${lc.glowClass}` :
                      ls.status === "complete" ? "border-green-500/30 bg-green-500/5" :
                      ls.status === "error" ? "border-red-500/30 bg-red-500/5" :
                      isActive ? `${lc.borderClass} bg-card/30` : "bg-card/20 opacity-50"
                    }`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg ${lc.bgClass} border ${lc.borderClass} flex items-center justify-center`}>
                            <Icon className={`w-3.5 h-3.5 ${lc.textClass}`} />
                          </div>
                          <div>
                            <div className="text-xs font-bold">L{lc.id}: {lc.name}</div>
                            <div className="text-[10px] text-muted-foreground">{lc.subtitle}</div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            ls.status === "running" ? `${lc.textClass} border-current animate-pulse` :
                            ls.status === "complete" ? "text-green-400 border-green-500/30" :
                            ls.status === "error" ? "text-red-400 border-red-500/30" :
                            "text-muted-foreground"
                          }`}
                        >
                          {ls.status === "running" && <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" />}
                          {ls.status.toUpperCase()}
                        </Badge>
                      </div>
                      {ls.active && (
                        <>
                          <Progress value={ls.progress} className="h-1.5 mb-1" />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span className="truncate max-w-[140px]">{ls.phase || "initializing..."}</span>
                            <span>{ls.progress}%</span>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* World State */}
              <Card className="border-border/30 bg-card/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    World State
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {[
                      { label: "Hosts", value: worldState.hosts, icon: Network },
                      { label: "Vulns", value: worldState.vulns, icon: AlertTriangle },
                      { label: "Upload Paths", value: worldState.uploadPaths, icon: ArrowUpRight },
                      { label: "Shell URLs", value: worldState.shellUrls, icon: Skull },
                      { label: "Deployed", value: worldState.deployedFiles, icon: CheckCircle2 },
                      { label: "Verified", value: worldState.verifiedUrls, icon: Eye },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-1.5 text-[11px]">
                        <item.icon className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">{item.label}:</span>
                        <span className="font-mono font-bold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Escalation Level */}
              <Card className="border-border/30 bg-card/30">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-orange-400" />
                      Escalation
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${ESCALATION_LEVELS[escalationLevel]?.color || "text-gray-400"} border-current`}
                    >
                      {ESCALATION_LEVELS[escalationLevel]?.name || "none"}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    {ESCALATION_LEVELS.map((level, i) => (
                      <div
                        key={level.name}
                        className={`flex-1 h-2 rounded-full transition-all ${
                          i <= escalationLevel ? level.bg.replace("/10", "/40") : "bg-muted/30"
                        }`}
                        title={level.name}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Event Stream + Results */}
            <div className="lg:col-span-2 space-y-4">
              {/* Event Filter */}
              <div className="flex items-center gap-2">
                {(["all", "pipeline", "success", "error"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setEventFilter(f)}
                    className={`px-2.5 py-1 text-[11px] rounded-full border transition-all ${
                      eventFilter === f
                        ? "bg-foreground/10 border-foreground/20 text-foreground"
                        : "bg-background/30 border-border/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? "All" : f === "pipeline" ? "Pipeline" : f === "success" ? "Success" : "Errors"}
                    {f === "all" && events.length > 0 && (
                      <span className="ml-1 font-mono">{events.length}</span>
                    )}
                  </button>
                ))}
                {running && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-auto">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    {activeJobId ? `Job #${activeJobId} — ปิดหน้าจอได้` : "Running..."}
                  </div>
                )}
              </div>

              {/* Event Stream */}
              <Card className="border-border/30 bg-card/30">
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                    <div className="p-3 space-y-0.5">
                      {filteredEvents.length === 0 && !running && events.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                          <Rocket className="w-12 h-12 mb-3 opacity-20" />
                          <p className="text-sm">Configure target and click Deploy</p>
                          <p className="text-xs mt-1">ปิดหน้าจอได้ ระบบทำงานต่อใน background</p>
                        </div>
                      )}
                      {filteredEvents.length === 0 && events.length > 0 && (
                        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                          <Search className="w-8 h-8 mb-2 opacity-20" />
                          <p className="text-xs">No events match this filter</p>
                        </div>
                      )}
                      {filteredEvents.map((evt, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 py-1.5 px-2 rounded text-[12px] border-l-2 ${
                            evt.detail?.includes("✅") && (evt.phase?.includes("upload") || evt.phase?.includes("verify") || evt.phase?.includes("complete"))
                              ? "border-green-500 bg-green-500/5"
                              : evt.detail?.includes("🎉")
                                ? "border-green-400 bg-green-500/10"
                                : getLayerColor(evt)
                          } hover:bg-muted/20 transition-colors`}
                        >
                          <div className="shrink-0 mt-0.5">{getEventIcon(evt)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {evt.layer && (
                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${
                                  evt.layer === 1 ? "text-cyan-400 border-cyan-500/30" :
                                  evt.layer === 2 ? "text-violet-400 border-violet-500/30" :
                                  "text-amber-400 border-amber-500/30"
                                }`}>
                                  L{evt.layer}
                                </Badge>
                              )}
                              {evt.phase && !evt.layer && (
                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${
                                  evt.phase.includes("prescreen") ? "text-blue-400 border-blue-500/30" :
                                  evt.phase.includes("vuln") ? "text-red-400 border-red-500/30" :
                                  evt.phase.includes("shell") ? "text-violet-400 border-violet-500/30" :
                                  evt.phase.includes("upload") || evt.phase.includes("oneclick") || evt.phase.includes("parallel") || evt.phase.includes("smart_retry") || evt.phase.includes("all_methods") ? "text-amber-400 border-amber-500/30" :
                                  evt.phase.includes("verify") ? "text-emerald-400 border-emerald-500/30" :
                                  evt.phase.includes("wp_admin") ? "text-orange-400 border-orange-500/30" :
                                  evt.phase.includes("wp_db_inject") ? "text-rose-400 border-rose-500/30" :
                                  evt.phase.includes("pipeline") ? "text-red-400 border-red-500/30" :
                                  "text-gray-400 border-gray-500/30"
                                }`}>
                                  {evt.phase.replace("pipeline_", "").replace("unified_pipeline", "pipeline").slice(0, 12)}
                                </Badge>
                              )}
                              {evt.step !== undefined && evt.totalSteps && (
                                <span className="text-[10px] text-muted-foreground">
                                  [{evt.step}/{evt.totalSteps}]
                                </span>
                              )}
                            </div>
                            <p className={`break-words leading-relaxed mt-0.5 ${
                              evt.detail?.includes("✅") && (evt.phase?.includes("upload") || evt.phase?.includes("verify") || evt.phase?.includes("complete") || evt.phase?.includes("wp_admin") || evt.phase?.includes("wp_db_inject"))
                                ? "text-green-400 font-semibold"
                                : "text-foreground/80"
                            }`}>
                              {evt.detail || JSON.stringify(evt.data || {})}
                            </p>
                            {/* Clickable URLs for successful uploads */}
                            {evt.detail?.includes("✅") && evt.detail?.match(/https?:\/\/[^\s)]+/) && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <a
                                  href={evt.detail.match(/https?:\/\/[^\s)]+/)?.[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-mono text-green-400 hover:text-green-300 hover:underline flex items-center gap-1 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {evt.detail.match(/https?:\/\/[^\s)]+/)?.[0]}
                                </a>
                              </div>
                            )}
                          </div>
                          {evt.progress !== undefined && (
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              {evt.progress}%
                            </span>
                          )}
                        </div>
                      ))}
                      <div ref={eventsEndRef} />
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Final Result */}
              {(finalResult || error) && (
                <Card className={`border-border/30 ${finalResult ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      {finalResult ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="text-green-400">Mission Complete</span>
                          {pipelineIntel.redirectWorking && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] gap-1 ml-2">
                              <Link2 className="w-2.5 h-2.5" /> Redirect Active
                            </Badge>
                          )}
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-400" />
                          <span className="text-red-400">Mission Failed</span>
                        </>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {finalResult ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { label: "Success", value: finalResult.success ? "YES" : "NO", color: finalResult.success ? "text-green-400" : "text-red-400" },
                            { label: "Mode", value: String(finalResult.mode || mode).toUpperCase(), color: "text-cyan-400" },
                            { label: "Duration", value: `${Math.round((finalResult.duration as number || 0) / 1000)}s`, color: "text-muted-foreground" },
                            { label: "Escalation", value: String(finalResult.escalationLevel || "N/A"), color: "text-orange-400" },
                            { label: "Files Deployed", value: String(finalResult.filesDeployed ?? finalResult.deployedFiles?.length ?? 0), color: "text-emerald-400" },
                            { label: "Shell URLs", value: String((finalResult.shellUrls as any)?.length || 0), color: "text-violet-400" },
                            { label: "Verified", value: String((finalResult.verifiedUrls as any)?.length || 0), color: "text-blue-400" },
                            { label: "Epochs", value: String(finalResult.epochs || finalResult.waves || 0), color: "text-amber-400" },
                          ].map((item) => (
                            <div key={item.label} className="text-center p-2 rounded-lg bg-background
/30">
                              <div className={`text-sm font-bold font-mono ${item.color}`}>{item.value}</div>
                              <div className="text-[10px] text-muted-foreground">{item.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Deployed URLs */}
                        {((): React.ReactNode => {
                          const shellUrls = finalResult.shellUrls;
                          if (!Array.isArray(shellUrls) || shellUrls.length === 0) return null;
                          return (
                          <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-emerald-400">Deployed Shell URLs:</span>
                            {shellUrls.map((url, i) => (
                              <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                <Skull className="w-3 h-3 text-emerald-400 shrink-0" />
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 hover:underline truncate"
                                >
                                  {url}
                                </a>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied!"); }}
                                  className="p-1 rounded hover:bg-emerald-500/20 shrink-0"
                                >
                                  <Copy className="w-3 h-3 text-emerald-400" />
                                </button>
                              </div>
                            ))}
                          </div>
                          );
                        })()}
                        {((): React.ReactNode => {
                          const urls = finalResult.verifiedUrls;
                          if (!Array.isArray(urls) || urls.length === 0) return null;
                          return (
                            <div className="space-y-1.5">
                              <span className="text-xs font-semibold text-blue-400">Verified URLs (redirect working):</span>
                              {urls.map((url, i) => (
                                <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                                  <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" />
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] font-mono text-blue-400 hover:text-blue-300 hover:underline truncate"
                                  >
                                    {url}
                                  </a>
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied!"); }}
                                    className="p-1 rounded hover:bg-blue-500/20 shrink-0"
                                  >
                                    <Copy className="w-3 h-3 text-blue-400" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* AI Summary */}
                        {finalResult.aiSummary ? (
                          <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Brain className="w-3.5 h-3.5 text-violet-400" />
                              <span className="text-xs font-semibold text-violet-400">AI Summary</span>
                            </div>
                            <p className="text-[11px] text-foreground/80 leading-relaxed">
                              {String(finalResult.aiSummary)}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {error && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-400 font-mono">{error}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

            {/* Batch Results Panel */}
            {batchResults.length > 1 && (
              <Card className="border-border/30 bg-card/30 mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Package className="w-4 h-4 text-violet-400" />
                    Batch Results ({batchResults.length} targets)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {batchResults.map((job: any, i: number) => (
                      <div
                        key={job.deployId || i}
                        className="flex items-center gap-3 p-2 rounded-lg border border-border/20 bg-background/20"
                      >
                        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                          job.status === "success" ? "bg-emerald-500/10" :
                          job.status === "partial" ? "bg-amber-500/10" :
                          job.status === "failed" ? "bg-red-500/10" :
                          "bg-blue-500/10"
                        }`}>
                          {job.status === "success" ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> :
                           job.status === "partial" ? <AlertTriangle className="w-3 h-3 text-amber-400" /> :
                           job.status === "failed" ? <XCircle className="w-3 h-3 text-red-400" /> :
                           <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-mono truncate">{job.domain || `Job #${job.deployId}`}</span>
                        </div>
                        <Badge variant="outline" className={`text-[9px] ${
                          job.status === "success" ? "text-emerald-400 border-emerald-500/30" :
                          job.status === "failed" ? "text-red-400 border-red-500/30" :
                          "text-blue-400 border-blue-500/30"
                        }`}>
                          {job.status || "running"}
                        </Badge>
                        {job.duration && (
                          <span className="text-[9px] text-muted-foreground">{Math.round(job.duration / 1000)}s</span>
                        )}
                        {(job.verifiedUrls as string[])?.length > 0 && (
                          <span className="text-[9px] text-emerald-400">{(job.verifiedUrls as string[]).length} verified</span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-2"
                          onClick={() => {
                            setActiveJobId(job.deployId);
                            lastEventIdRef.current = 0;
                            setEvents([]);
                            resetPipelineState();
                            if (job.status === "running") {
                              if (pollingRef.current) clearInterval(pollingRef.current);
                              pollingRef.current = setInterval(() => pollJobEvents(job.deployId), 2000);
                            }
                          }}
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══ HISTORY TAB ═══ */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="history" className="mt-4">
          <Card className="border-border/30 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Recent Jobs
              </CardTitle>
              <CardDescription className="text-xs">
                รายการ deploy ล่าสุด — ดูรายละเอียดเพิ่มเติมได้ที่หน้า Attack History
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentJobsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (Array.isArray(recentJobsQuery.data) ? recentJobsQuery.data : (recentJobsQuery.data as any)?.items)?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Rocket className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm">No deploy history yet</p>
                  <p className="text-xs mt-1">เริ่มต้น deploy แรกที่แท็บ Launch</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(Array.isArray(recentJobsQuery.data) ? recentJobsQuery.data : (recentJobsQuery.data as any)?.items)?.map((job: any) => (
                    <div
                      key={job.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-background/30 hover:bg-background/50 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        job.status === "success" ? "bg-emerald-500/10 border border-emerald-500/30" :
                        job.status === "partial" ? "bg-amber-500/10 border border-amber-500/30" :
                        job.status === "failed" ? "bg-red-500/10 border border-red-500/30" :
                        job.status === "running" ? "bg-blue-500/10 border border-blue-500/30" :
                        "bg-muted/10 border border-border/30"
                      }`}>
                        {job.status === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                         job.status === "partial" ? <AlertTriangle className="w-4 h-4 text-amber-400" /> :
                         job.status === "failed" ? <XCircle className="w-4 h-4 text-red-400" /> :
                         job.status === "running" ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" /> :
                         <Clock className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold truncate">{job.targetDomain || job.target}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              job.status === "success" ? "text-emerald-400 border-emerald-500/30" :
                              job.status === "partial" ? "text-amber-400 border-amber-500/30" :
                              job.status === "failed" ? "text-red-400 border-red-500/30" :
                              job.status === "running" ? "text-blue-400 border-blue-500/30" :
                              "text-muted-foreground"
                            }`}
                          >
                            {job.status}
                          </Badge>
                          {job.mode && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              {job.mode}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-mono">#{job.id}</span>
                          {job.createdAt && (
                            <span>{new Date(job.createdAt).toLocaleString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          )}
                          {job.duration && (
                            <span>{Math.round(job.duration / 1000)}s</span>
                          )}
                          {job.filesDeployed > 0 && (
                            <span className="text-emerald-400">{job.filesDeployed} files</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          setActiveJobId(job.id);
                          setMainTab("monitor");
                          // Start polling for this job
                          lastEventIdRef.current = 0;
                          setEvents([]);
                          resetPipelineState();
                          if (job.status === "running" || job.status === "queued") {
                            setRunning(true);
                            pollingRef.current = setInterval(() => pollJobEvents(job.id), 2000);
                          }
                        }}
                      >
                        <Eye className="w-3 h-3" /> View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══ PAYLOAD ARSENAL TAB ═══ */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="arsenal" className="mt-4">
          <div className="space-y-4">
            <Card className="border-red-500/20 bg-gradient-to-r from-red-950/30 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bomb className="w-5 h-5 text-red-500" />
                  Payload Arsenal
                  <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">MERGED FROM BLACKHAT</Badge>
                </CardTitle>
                <CardDescription>
                  Generate attack payloads for any domain — persistence, cloaking, SEO manipulation, redirects, doorway pages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Target Domain</Label>
                    <Input
                      placeholder="example.com"
                      value={arsenalDomain}
                      onChange={(e) => setArsenalDomain(e.target.value)}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Redirect URL</Label>
                    <Input
                      placeholder="https://your-destination.com"
                      value={arsenalRedirect}
                      onChange={(e) => setArsenalRedirect(e.target.value)}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={async () => {
                        if (!arsenalDomain.trim()) { toast.error("Enter a domain"); return; }
                        setArsenalRunning(true);
                        try {
                          const res = await fetch(`/api/trpc/blackhat.runFullChain`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ json: { domain: arsenalDomain.trim(), redirectUrl: arsenalRedirect.trim() || undefined } }),
                          });
                          const data = await res.json();
                          setArsenalResults(data?.result?.data?.json || data);
                          toast.success("Payloads generated!");
                        } catch (err: any) {
                          toast.error(err.message);
                        } finally {
                          setArsenalRunning(false);
                        }
                      }}
                      disabled={arsenalRunning || !arsenalDomain.trim()}
                      className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
                    >
                      {arsenalRunning ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating...</>
                      ) : (
                        <><Zap className="h-4 w-4 mr-2" /> Generate Payloads</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Payload Categories */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { icon: Shield, label: "Persistence", desc: "Backdoors, auto-restore", color: "text-red-500", bg: "bg-red-500/10" },
                    { icon: Eye, label: "Cloaking", desc: "Bot vs human detection", color: "text-purple-500", bg: "bg-purple-500/10" },
                    { icon: Search, label: "SEO Manipulation", desc: "Sitemap, doorways, links", color: "text-blue-500", bg: "bg-blue-500/10" },
                    { icon: ArrowUpRight, label: "Redirects", desc: "Conditional, geo, JS", color: "text-green-500", bg: "bg-green-500/10" },
                    { icon: Code, label: "Monetization", desc: "Ad injection, miners", color: "text-yellow-500", bg: "bg-yellow-500/10" },
                  ].map((cat, i) => {
                    const Icon = cat.icon;
                    return (
                      <div key={i} className={`p-3 rounded-lg border ${cat.bg} border-opacity-30`}>
                        <Icon className={`w-4 h-4 ${cat.color} mb-1`} />
                        <p className="text-xs font-semibold">{cat.label}</p>
                        <p className="text-[10px] text-muted-foreground">{cat.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Arsenal Results */}
            {arsenalResults && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileCode className="w-5 h-5 text-red-500" />
                    Generated Payloads
                    <Badge variant="outline">{arsenalResults.totalPayloads || 0} payloads</Badge>
                    <Badge variant="outline" className="bg-red-500/10 text-red-400">Risk: {arsenalResults.overallRisk || "N/A"}/10</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {(arsenalResults.phases || []).map((phase: any, pi: number) => (
                        <div key={pi} className="border rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">Phase {phase.phase}</Badge>
                            <span className="font-semibold text-sm">{phase.name}</span>
                            <Badge variant="outline" className="ml-auto text-xs">{phase.payloads?.length || 0} payloads</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{phase.summary}</p>
                          <div className="space-y-1.5">
                            {(phase.payloads || []).slice(0, 5).map((p: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
                                <Code className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="font-mono text-[11px] truncate flex-1">{p.filename || p.name}</span>
                                <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                              </div>
                            ))}
                            {(phase.payloads?.length || 0) > 5 && (
                              <p className="text-[10px] text-muted-foreground pl-5">+{phase.payloads.length - 5} more...</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══ DETECTION SCAN TAB ═══ */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="detect" className="mt-4">
          <div className="space-y-4">
            <Card className="border-yellow-500/20 bg-gradient-to-r from-yellow-950/30 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-yellow-500" />
                  Detection Scanner
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">DEFENSE</Badge>
                </CardTitle>
                <CardDescription>
                  Scan a domain for existing compromises, backdoors, SEO spam, and suspicious indicators
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="domain-to-scan.com"
                      value={detectDomain}
                      onChange={(e) => setDetectDomain(e.target.value)}
                      className="bg-background/50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && detectDomain.trim()) {
                          setDetectRunning(true);
                          fetch(`/api/trpc/blackhat.detect`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ json: { domain: detectDomain.trim() } }),
                          })
                            .then(r => r.json())
                            .then(data => { setDetectResults(data?.result?.data?.json || data); toast.success("Scan complete!"); })
                            .catch(err => toast.error(err.message))
                            .finally(() => setDetectRunning(false));
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={() => {
                      if (!detectDomain.trim()) { toast.error("Enter a domain"); return; }
                      setDetectRunning(true);
                      fetch(`/api/trpc/blackhat.detect`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ json: { domain: detectDomain.trim() } }),
                      })
                        .then(r => r.json())
                        .then(data => { setDetectResults(data?.result?.data?.json || data); toast.success("Scan complete!"); })
                        .catch(err => toast.error(err.message))
                        .finally(() => setDetectRunning(false));
                    }}
                    disabled={detectRunning || !detectDomain.trim()}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  >
                    {detectRunning ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning...</>
                    ) : (
                      <><Search className="h-4 w-4 mr-2" /> Scan</>
                    )}
                  </Button>
                </div>

                {/* Detection Categories */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { icon: Bug, label: "Backdoors", desc: "Hidden shells, webshells", color: "text-red-500" },
                    { icon: Link2, label: "SEO Spam", desc: "Injected links, doorways", color: "text-orange-500" },
                    { icon: ArrowUpRight, label: "Redirects", desc: "Malicious redirects", color: "text-yellow-500" },
                    { icon: ShieldAlert, label: "Indicators", desc: "Suspicious patterns", color: "text-purple-500" },
                  ].map((cat, i) => {
                    const Icon = cat.icon;
                    return (
                      <div key={i} className="p-3 rounded-lg border bg-muted/20">
                        <Icon className={`w-4 h-4 ${cat.color} mb-1`} />
                        <p className="text-xs font-semibold">{cat.label}</p>
                        <p className="text-[10px] text-muted-foreground">{cat.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Detection Results */}
            {detectResults && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-yellow-500" />
                    Scan Results
                    {detectResults.compromised ? (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">COMPROMISED</Badge>
                    ) : (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">CLEAN</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {(detectResults.detections || []).map((d: any, i: number) => (
                        <div key={i} className={`p-3 rounded-lg border ${
                          d.severity === "critical" ? "border-red-500/30 bg-red-500/5" :
                          d.severity === "high" ? "border-orange-500/30 bg-orange-500/5" :
                          d.severity === "medium" ? "border-yellow-500/30 bg-yellow-500/5" :
                          "border-blue-500/30 bg-blue-500/5"
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">{d.severity?.toUpperCase()}</Badge>
                            <span className="font-semibold text-sm">{d.type}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{d.detail}</p>
                          {d.evidence && <p className="text-[10px] font-mono mt-1 text-muted-foreground/70 truncate">{d.evidence}</p>}
                        </div>
                      ))}
                      {(detectResults.liveChecks || []).map((c: any, i: number) => (
                        <div key={`lc-${i}`} className="p-2 rounded border bg-muted/20 flex items-center gap-2">
                          {c.status === "found" ? (
                            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          )}
                          <span className="text-xs">{c.path}</span>
                          <Badge variant="outline" className="text-[10px] ml-auto">{c.status}</Badge>
                        </div>
                      ))}
                      {(!detectResults.detections?.length && !detectResults.liveChecks?.length) && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No detections found</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══ ATTACK LOGS TAB ═══ */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="logs" className="mt-4">
          <div className="space-y-4">
            <Card className="border-blue-500/20 bg-gradient-to-r from-blue-950/30 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Attack Pipeline Logs
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">REAL-TIME</Badge>
                </CardTitle>
                <CardDescription>
                  ดู log การโจมตีแบบ real-time — วิเคราะห์ปัญหา, failure patterns, และ HTTP responses ทุกขั้นตอน
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AttackLogViewer
                  deployId={activeJobId || undefined}
                  autoRefresh={running}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
