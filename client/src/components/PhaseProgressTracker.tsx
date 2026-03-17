/**
 * PhaseProgressTracker — Real-time Attack Phase Timeline
 * 
 * Shows every pipeline phase with:
 *   - Status: pending / running / complete / error / skipped
 *   - Elapsed time per phase (live counter for running phase)
 *   - Detail message from backend events
 *   - Overall progress bar + total elapsed time
 *   - Animated highlight for currently running phase
 *   - Collapsible sub-steps per phase
 *   - Mobile responsive
 */
import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Brain, Search, Bug, FileCode, Upload, CheckCircle2, Lock,
  HardDrive, Eye, Microscope, Shield, Globe, Server, Wifi,
  Fingerprint, Key, Radio, Radar, Zap, Clock, Loader2,
  XCircle, SkipForward, ChevronDown, ChevronRight, Activity,
  Timer, AlertTriangle, Crosshair, Network, Database,
  ShieldAlert, Bomb, Cpu, ArrowRight,
} from "lucide-react";

// ─── Phase Definition ───
export interface PhaseDefinition {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  group: "recon" | "scan" | "attack" | "exploit" | "post";
}

// All phases from the unified-attack-pipeline, in execution order
export const ALL_PIPELINE_PHASES: PhaseDefinition[] = [
  // ─── Group: Recon ───
  { id: "ai_analysis", label: "AI Target Analysis", shortLabel: "AI Analysis", icon: Brain, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", group: "recon" },
  { id: "prescreen", label: "Pre-Screen & Fingerprint", shortLabel: "Pre-Screen", icon: Fingerprint, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30", group: "recon" },
  { id: "recon", label: "Early Redirect Detection", shortLabel: "Redirect Check", icon: Radar, color: "text-indigo-400", bgColor: "bg-indigo-500/10", borderColor: "border-indigo-500/30", group: "recon" },
  { id: "smart_fallback", label: "Smart Fallback Analysis", shortLabel: "Smart Fallback", icon: Zap, color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30", group: "recon" },
  
  // ─── Group: Scan ───
  { id: "vuln_scan", label: "Deep Vulnerability Scan", shortLabel: "Vuln Scan", icon: Bug, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30", group: "scan" },
  { id: "config_exploit", label: "Config Exploit Scan", shortLabel: "Config Exploit", icon: Server, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30", group: "scan" },
  { id: "dns_attack", label: "DNS Reconnaissance", shortLabel: "DNS Recon", icon: Globe, color: "text-teal-400", bgColor: "bg-teal-500/10", borderColor: "border-teal-500/30", group: "scan" },
  { id: "cf_bypass", label: "WAF/CF Bypass", shortLabel: "CF Bypass", icon: ShieldAlert, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30", group: "scan" },
  { id: "wp_brute_force", label: "WP Brute Force", shortLabel: "WP Brute", icon: Key, color: "text-rose-400", bgColor: "bg-rose-500/10", borderColor: "border-rose-500/30", group: "scan" },
  { id: "breach_hunt", label: "Breach Credential Hunt", shortLabel: "Breach Hunt", icon: Database, color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30", group: "scan" },
  { id: "shodan_scan", label: "Shodan Intelligence", shortLabel: "Shodan", icon: Radio, color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30", group: "scan" },
  { id: "wp_vuln_scan", label: "WP Vulnerability Scan", shortLabel: "WP Vuln", icon: Shield, color: "text-red-300", bgColor: "bg-red-400/10", borderColor: "border-red-400/30", group: "scan" },
  { id: "cms_vuln_scan", label: "CMS Vulnerability Scan", shortLabel: "CMS Vuln", icon: Microscope, color: "text-pink-400", bgColor: "bg-pink-500/10", borderColor: "border-pink-500/30", group: "scan" },
  
  // ─── Group: Attack ───
  { id: "shell_gen", label: "AI Shell Generation", shortLabel: "Shell Gen", icon: FileCode, color: "text-violet-400", bgColor: "bg-violet-500/10", borderColor: "border-violet-500/30", group: "attack" },
  { id: "upload", label: "Shell Upload", shortLabel: "Upload", icon: Upload, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30", group: "attack" },
  { id: "verify", label: "Upload Verification", shortLabel: "Verify", icon: CheckCircle2, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", group: "attack" },
  { id: "waf_bypass", label: "WAF Bypass Upload", shortLabel: "WAF Bypass", icon: Shield, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30", group: "attack" },
  { id: "alt_upload", label: "Alternative Upload", shortLabel: "Alt Upload", icon: Network, color: "text-sky-400", bgColor: "bg-sky-500/10", borderColor: "border-sky-500/30", group: "attack" },
  { id: "indirect", label: "Indirect Attacks", shortLabel: "Indirect", icon: Crosshair, color: "text-rose-400", bgColor: "bg-rose-500/10", borderColor: "border-rose-500/30", group: "attack" },
  
  // ─── Group: Exploit ───
  { id: "wp_admin", label: "WP Admin Takeover", shortLabel: "WP Admin", icon: Lock, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30", group: "exploit" },
  { id: "wp_db_inject", label: "WP Database Injection", shortLabel: "DB Inject", icon: HardDrive, color: "text-rose-400", bgColor: "bg-rose-500/10", borderColor: "border-rose-500/30", group: "exploit" },
  { id: "shellless", label: "Shellless Techniques", shortLabel: "Shellless", icon: Bomb, color: "text-red-500", bgColor: "bg-red-600/10", borderColor: "border-red-600/30", group: "exploit" },
  { id: "generic_upload", label: "Generic Upload Vectors", shortLabel: "Generic Upload", icon: Upload, color: "text-slate-400", bgColor: "bg-slate-500/10", borderColor: "border-slate-500/30", group: "exploit" },
  { id: "leakcheck_cred", label: "LeakCheck Credentials", shortLabel: "LeakCheck", icon: Key, color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30", group: "exploit" },
  { id: "ftp_upload", label: "FTP Upload", shortLabel: "FTP", icon: Server, color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30", group: "exploit" },
  { id: "ssh_upload", label: "SSH Upload", shortLabel: "SSH", icon: Lock, color: "text-lime-400", bgColor: "bg-lime-500/10", borderColor: "border-lime-500/30", group: "exploit" },
  
  // ─── Group: Post-Exploit ───
  { id: "iis_cloaking", label: "IIS Cloaking", shortLabel: "IIS Cloak", icon: Eye, color: "text-slate-400", bgColor: "bg-slate-500/10", borderColor: "border-slate-500/30", group: "post" },
  { id: "cf_takeover", label: "Cloudflare Takeover", shortLabel: "CF Takeover", icon: Wifi, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30", group: "post" },
  { id: "registrar_takeover", label: "Registrar Takeover", shortLabel: "Registrar", icon: Globe, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30", group: "post" },
  { id: "cloaking", label: "SEO Cloaking", shortLabel: "Cloaking", icon: Eye, color: "text-pink-400", bgColor: "bg-pink-500/10", borderColor: "border-pink-500/30", group: "post" },
  { id: "comprehensive", label: "Comprehensive Vectors", shortLabel: "Comprehensive", icon: Microscope, color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30", group: "post" },
  { id: "post_upload", label: "Post-Upload Actions", shortLabel: "Post-Upload", icon: Activity, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", group: "post" },
];

// ─── Phase Tracker State ───
export interface PhaseTrackerState {
  status: "pending" | "running" | "complete" | "error" | "skipped";
  detail: string;
  progress: number;
  startedAt: number | null;
  completedAt: number | null;
  subSteps: Array<{ detail: string; timestamp: number; status: "info" | "success" | "error" | "warning" }>;
}

export type PhaseTrackerMap = Record<string, PhaseTrackerState>;

// ─── Helper: Create initial state ───
export function createInitialPhaseTrackerState(): PhaseTrackerMap {
  const state: PhaseTrackerMap = {};
  for (const phase of ALL_PIPELINE_PHASES) {
    state[phase.id] = {
      status: "pending",
      detail: "",
      progress: 0,
      startedAt: null,
      completedAt: null,
      subSteps: [],
    };
  }
  return state;
}

// ─── Helper: Process event into tracker state ───
export function processEventForTracker(
  prev: PhaseTrackerMap,
  event: { phase?: string; step?: string; detail?: string; progress?: number; type?: string; timestamp?: number }
): PhaseTrackerMap {
  if (!event.phase) return prev;
  
  const phaseKey = event.phase
    .replace("pipeline_", "")
    .replace("unified_pipeline", "prescreen")
    .replace("cloaking_content", "cloaking");
  
  // Handle pipeline-level end events
  if (phaseKey === "world_update" || phaseKey === "complete" || phaseKey === "error") {
    if (phaseKey === "complete" || phaseKey === "error") {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].status === "running") {
          next[key] = {
            ...next[key],
            status: phaseKey === "complete" ? "complete" : "error",
            completedAt: event.timestamp || Date.now(),
          };
        }
      }
      return next;
    }
    return prev;
  }
  
  // Find matching phase
  const matchedPhase = ALL_PIPELINE_PHASES.find(p => phaseKey === p.id || phaseKey.startsWith(p.id));
  if (!matchedPhase) return prev;
  
  const current = prev[matchedPhase.id];
  if (!current) return prev;
  
  const now = event.timestamp || Date.now();
  const updated = { ...current };
  
  // Update status
  if (current.status === "pending") {
    updated.status = "running";
    updated.startedAt = now;
  }
  
  // Detect completion
  if (event.detail?.includes("✅") || event.detail?.includes("สำเร็จ") || 
      event.step === "complete" || event.step === "success" ||
      event.type === "phase_complete") {
    updated.status = "complete";
    updated.completedAt = now;
  }
  
  // Detect error
  if ((event.detail?.includes("❌") || event.detail?.includes("ล้มเหลว") || 
       event.step === "error" || event.step === "fatal" || event.type === "error") &&
      !event.detail?.includes("ลอง") && !event.detail?.includes("ดำเนินการต่อ") &&
      !event.detail?.includes("continuing")) {
    if (event.step === "fatal" || event.step === "error") {
      updated.status = "error";
      updated.completedAt = now;
    }
  }
  
  // Detect skip
  if (event.detail?.includes("⏭") || event.step === "skipped") {
    updated.status = "skipped";
    updated.completedAt = now;
  }
  
  // Update detail and progress
  if (event.detail) updated.detail = event.detail;
  if (event.progress !== undefined) updated.progress = event.progress;
  
  // Add sub-step
  if (event.detail) {
    const subStatus = event.detail.includes("✅") || event.detail.includes("สำเร็จ") ? "success" as const :
                      event.detail.includes("❌") || event.detail.includes("ล้มเหลว") ? "error" as const :
                      event.detail.includes("⚠") ? "warning" as const : "info" as const;
    updated.subSteps = [...current.subSteps, { detail: event.detail, timestamp: now, status: subStatus }];
    if (updated.subSteps.length > 20) {
      updated.subSteps = updated.subSteps.slice(-20);
    }
  }
  
  return { ...prev, [matchedPhase.id]: updated };
}

// ─── Format duration ───
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  if (min < 60) return `${min}m ${remainSec}s`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr}h ${remainMin}m`;
}

// ─── Group labels ───
const GROUP_LABELS: Record<string, { label: string; color: string; gradient: string }> = {
  recon: { label: "Reconnaissance", color: "text-blue-400", gradient: "via-blue-500/20" },
  scan: { label: "Scanning & Discovery", color: "text-amber-400", gradient: "via-amber-500/20" },
  attack: { label: "Attack & Upload", color: "text-red-400", gradient: "via-red-500/20" },
  exploit: { label: "Exploitation", color: "text-purple-400", gradient: "via-purple-500/20" },
  post: { label: "Post-Exploit & Cloaking", color: "text-pink-400", gradient: "via-pink-500/20" },
};

// ─── PhaseRow Component ───
function PhaseRow({ phase, state }: { phase: PhaseDefinition; state: PhaseTrackerState }) {
  const [expanded, setExpanded] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const Icon = phase.icon;
  
  useEffect(() => {
    if (state.status !== "running" || !state.startedAt) {
      setLiveElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setLiveElapsed(Date.now() - state.startedAt!);
    }, 100);
    return () => clearInterval(interval);
  }, [state.status, state.startedAt]);
  
  const elapsed = state.status === "running" && state.startedAt
    ? liveElapsed
    : state.startedAt && state.completedAt
      ? state.completedAt - state.startedAt
      : 0;
  
  const statusIcon = state.status === "running" ? (
    <Loader2 className={`w-4 h-4 animate-spin ${phase.color}`} />
  ) : state.status === "complete" ? (
    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
  ) : state.status === "error" ? (
    <XCircle className="w-4 h-4 text-red-400" />
  ) : state.status === "skipped" ? (
    <SkipForward className="w-4 h-4 text-muted-foreground/50" />
  ) : (
    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/20" />
  );
  
  const rowBg = state.status === "running" ? `${phase.bgColor} ${phase.borderColor} border shadow-sm` :
                state.status === "complete" ? "bg-emerald-500/5 border-emerald-500/20 border" :
                state.status === "error" ? "bg-red-500/5 border-red-500/20 border" :
                state.status === "skipped" ? "bg-muted/10 border-transparent border opacity-50" :
                "bg-transparent border-transparent border opacity-40";
  
  return (
    <div className={`rounded-lg transition-all duration-300 ${rowBg} ${state.status === "running" ? "ring-1 ring-current/10" : ""}`}>
      <button
        onClick={() => state.subSteps.length > 0 && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
        disabled={state.subSteps.length === 0}
      >
        <div className="flex flex-col items-center shrink-0">
          {statusIcon}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={`w-3.5 h-3.5 shrink-0 ${state.status === "running" ? phase.color : state.status === "complete" ? "text-emerald-400" : "text-muted-foreground/50"}`} />
            <span className={`text-xs font-semibold truncate ${
              state.status === "running" ? phase.color :
              state.status === "complete" ? "text-emerald-400" :
              state.status === "error" ? "text-red-400" :
              "text-muted-foreground/50"
            }`}>
              {phase.label}
            </span>
          </div>
          {state.detail && state.status !== "pending" && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5 max-w-[300px] md:max-w-[500px]">
              {state.detail}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {elapsed > 0 && (
            <div className="flex items-center gap-1">
              <Timer className={`w-3 h-3 ${state.status === "running" ? "text-amber-400 animate-pulse" : "text-muted-foreground/50"}`} />
              <span className={`text-[11px] font-mono tabular-nums ${
                state.status === "running" ? "text-amber-400" : "text-muted-foreground/60"
              }`}>
                {formatDuration(elapsed)}
              </span>
            </div>
          )}
          
          {state.subSteps.length > 0 && (
            <div className="text-muted-foreground/30">
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </div>
          )}
        </div>
      </button>
      
      {expanded && state.subSteps.length > 0 && (
        <div className="px-3 pb-2 border-l border-muted-foreground/10 ml-[1.35rem]">
          {state.subSteps.slice(-10).map((sub, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                sub.status === "success" ? "bg-emerald-400" :
                sub.status === "error" ? "bg-red-400" :
                sub.status === "warning" ? "bg-amber-400" :
                "bg-muted-foreground/30"
              }`} />
              <span className="text-[10px] text-muted-foreground/70 leading-relaxed break-all">
                {sub.detail}
              </span>
            </div>
          ))}
          {state.subSteps.length > 10 && (
            <div className="text-[9px] text-muted-foreground/40 mt-1">
              +{state.subSteps.length - 10} earlier steps
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───
interface PhaseProgressTrackerProps {
  phases: PhaseTrackerMap;
  isRunning: boolean;
  startTime: number | null;
  totalProgress: number;
  compact?: boolean;
}

export default function PhaseProgressTracker({ phases, isRunning, startTime, totalProgress, compact = false }: PhaseProgressTrackerProps) {
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  
  useEffect(() => {
    if (!isRunning || !startTime) {
      setTotalElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setTotalElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning, startTime]);
  
  const stats = useMemo(() => {
    const values = Object.values(phases);
    return {
      total: ALL_PIPELINE_PHASES.length,
      complete: values.filter(p => p.status === "complete").length,
      running: values.filter(p => p.status === "running").length,
      error: values.filter(p => p.status === "error").length,
      skipped: values.filter(p => p.status === "skipped").length,
      pending: values.filter(p => p.status === "pending").length,
    };
  }, [phases]);
  
  const groupedPhases = useMemo(() => {
    const groups: Record<string, PhaseDefinition[]> = {};
    for (const phase of ALL_PIPELINE_PHASES) {
      if (!groups[phase.group]) groups[phase.group] = [];
      const state = phases[phase.id];
      if (showOnlyActive && state?.status === "pending") continue;
      groups[phase.group].push(phase);
    }
    return groups;
  }, [phases, showOnlyActive]);
  
  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">Phases:</span>
            <span className="text-emerald-400 font-mono">{stats.complete} done</span>
            {stats.running > 0 && <span className="text-amber-400 font-mono animate-pulse">{stats.running} running</span>}
            {stats.error > 0 && <span className="text-red-400 font-mono">{stats.error} error</span>}
            <span className="text-muted-foreground/50 font-mono">{stats.pending} pending</span>
          </div>
          {totalElapsed > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground/50" />
              <span className="font-mono text-muted-foreground">{formatDuration(totalElapsed)}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-0.5 flex-wrap">
          {ALL_PIPELINE_PHASES.map((phase) => {
            const state = phases[phase.id];
            const Icon = phase.icon;
            return (
              <Tooltip key={phase.id}>
                <TooltipTrigger asChild>
                  <div className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                    state?.status === "running" ? `${phase.bgColor} ${phase.borderColor} border animate-pulse` :
                    state?.status === "complete" ? "bg-emerald-500/15 border border-emerald-500/30" :
                    state?.status === "error" ? "bg-red-500/15 border border-red-500/30" :
                    state?.status === "skipped" ? "bg-muted/20 border border-muted/30 opacity-40" :
                    "bg-muted/10 border border-transparent opacity-20"
                  }`}>
                    {state?.status === "running" ? (
                      <Loader2 className={`w-3 h-3 animate-spin ${phase.color}`} />
                    ) : state?.status === "complete" ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : state?.status === "error" ? (
                      <XCircle className="w-3 h-3 text-red-400" />
                    ) : (
                      <Icon className="w-3 h-3 text-muted-foreground/30" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs font-semibold">{phase.label}</p>
                  {state?.detail && <p className="text-[10px] text-muted-foreground mt-0.5">{state.detail}</p>}
                  {state?.startedAt && state?.completedAt && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatDuration(state.completedAt - state.startedAt)}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  }
  
  // ─── Full Mode ───
  return (
    <Card className="border-border/30 bg-card/30">
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold">Phase Progress Tracker</CardTitle>
              <p className="text-[10px] text-muted-foreground font-mono">
                {stats.complete}/{stats.total} phases complete
                {stats.running > 0 && ` \u2022 ${stats.running} running`}
                {stats.error > 0 && ` \u2022 ${stats.error} errors`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {(isRunning || totalElapsed > 0) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/50 border border-border/30">
                <Clock className={`w-3.5 h-3.5 ${isRunning ? "text-amber-400 animate-pulse" : "text-muted-foreground/50"}`} />
                <span className={`text-xs font-mono tabular-nums font-bold ${isRunning ? "text-amber-400" : "text-muted-foreground"}`}>
                  {formatDuration(totalElapsed)}
                </span>
              </div>
            )}
            
            <button
              onClick={() => setShowOnlyActive(!showOnlyActive)}
              className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                showOnlyActive 
                  ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" 
                  : "bg-muted/20 border-border/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {showOnlyActive ? "Active Only" : "All Phases"}
            </button>
          </div>
        </div>
        
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-mono text-muted-foreground">{totalProgress}%</span>
          </div>
          <Progress value={totalProgress} className="h-1.5" />
        </div>
      </CardHeader>
      
      <CardContent className="px-4 pb-3">
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            {Object.entries(groupedPhases).map(([groupKey, groupPhases]) => {
              if (groupPhases.length === 0) return null;
              const groupInfo = GROUP_LABELS[groupKey];
              
              return (
                <div key={groupKey}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${groupInfo?.gradient || "via-muted/20"} to-transparent`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${groupInfo?.color || "text-muted-foreground"}`}>
                      {groupInfo?.label || groupKey}
                    </span>
                    <div className={`h-px flex-1 bg-gradient-to-r from-transparent ${groupInfo?.gradient || "via-muted/20"} to-transparent`} />
                  </div>
                  
                  <div className="space-y-1">
                    {groupPhases.map((phase) => {
                      const state = phases[phase.id] || { status: "pending" as const, detail: "", progress: 0, startedAt: null, completedAt: null, subSteps: [] };
                      return (
                        <PhaseRow
                          key={phase.id}
                          phase={phase}
                          state={state}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
