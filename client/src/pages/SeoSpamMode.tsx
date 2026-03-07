import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Skull, Zap, Globe, Shield, AlertTriangle, Play, Target,
  Code, Eye, Link2, FileCode, Bug, Crosshair, Network,
  Layers, ChevronRight, Loader2, Search, Lock, Bomb,
  BarChart3, ShieldAlert, Radio, Cpu, Workflow,
  Upload, RefreshCw, ExternalLink, Copy, ArrowRight,
  Radar, Wifi, Terminal, Fingerprint, Syringe, Router,
  Download, CheckCircle2, XCircle, Clock, Activity,
  FileJson, FileText, Sparkles, FlaskConical, Unplug,
  Rocket, FolderOpen, FileUp, ArrowUpRight, ShieldCheck,
  Flame, LayoutGrid, RotateCcw, Gauge, Brain,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import AiAnalysisCard from "@/components/AiAnalysisCard";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

// Phase config
const PHASE_CONFIG = [
  { icon: Search, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", label: "Phase 1: Target Discovery", emoji: "🔍" },
  { icon: RefreshCw, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", label: "Phase 2: Proxy Rotation", emoji: "🔄" },
  { icon: Terminal, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30", label: "Phase 3: Shell Generation", emoji: "💀" },
  { icon: Shield, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", label: "Phase 4: WAF Bypass", emoji: "🛡️" },
  { icon: Syringe, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", label: "Phase 5: SEO Spam Injection", emoji: "📧" },
  { icon: Router, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "Phase 6: Auto Redirect", emoji: "🔀" },
];

const RISK_COLORS: Record<number, string> = {
  1: "text-green-400", 2: "text-green-400", 3: "text-blue-400",
  4: "text-blue-400", 5: "text-yellow-400", 6: "text-yellow-400",
  7: "text-orange-400", 8: "text-orange-400", 9: "text-red-400", 10: "text-red-500",
};

const STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: "text-green-400" },
  failed: { icon: XCircle, color: "text-red-400" },
  running: { icon: Loader2, color: "text-yellow-400" },
  pending: { icon: Clock, color: "text-gray-500" },
  skipped: { icon: Unplug, color: "text-gray-600" },
};

export default function SeoSpamMode() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [targetDomain, setTargetDomain] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [activeTab, setActiveTab] = useState("launch");
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [shellUrl, setShellUrl] = useState("");
  const [shellPassword, setShellPassword] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [obfLayers, setObfLayers] = useState(4);

  // Superadmin access guard
  if (authLoading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!user || user.role !== "superadmin") {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-red-400">Superadmin Access Required</h2>
        <p className="text-muted-foreground text-center max-w-md">
          SEO SPAM Mode สามารถเข้าถึงได้เฉพาะ Superadmin เท่านั้น
          ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เข้าถึง
        </p>
      </div>
    );
  }

  // SSE streaming state for One-Click Deploy
  const [sseRunning, setSseRunning] = useState(false);
  const [sseEvents, setSseEvents] = useState<any[]>([]);
  const [sseFinalResult, setSseFinalResult] = useState<any>(null);
  const [sseError, setSseError] = useState<string | null>(null);
  const [maxRetries, setMaxRetries] = useState(5);
  const [geoRedirectEnabled, setGeoRedirectEnabled] = useState(true);
  const progressRef = useRef<HTMLDivElement>(null);
  const [showDeployPopup, setShowDeployPopup] = useState(false);
  // Proxy support
  const [proxyListText, setProxyListText] = useState("");
  const [proxyRotation, setProxyRotation] = useState<"random" | "round-robin">("random");
  // Weighted redirects
  const [weightedRedirectsText, setWeightedRedirectsText] = useState("");
  // SEO keyword injection
  const [seoKeywordsText, setSeoKeywordsText] = useState("");
  // SEO Parasite options
  const [enableParasitePages, setEnableParasitePages] = useState(true);
  const [parasiteContentLength, setParasiteContentLength] = useState<"short" | "medium" | "long">("medium");
  const [parasiteRedirectDelay, setParasiteRedirectDelay] = useState(5);
  // Template selection for parasite pages
  const [parasiteTemplateSlug, setParasiteTemplateSlug] = useState<string>("");
  // Advanced AI options
  const [enablePreScreening, setEnablePreScreening] = useState(true);
  const [enableAltMethods, setEnableAltMethods] = useState(true);
  const [enableStealthBrowser, setEnableStealthBrowser] = useState(true);
  const [enableAiAnalysis, setEnableAiAnalysis] = useState(true);
  const [enableAiCommander, setEnableAiCommander] = useState(true);
  const [aiCommanderMaxIterations, setAiCommanderMaxIterations] = useState(10);
  // AI Analysis state for AiAnalysisCard
  const [aiAnalysisSteps, setAiAnalysisSteps] = useState<any[]>([]);
  const [aiAnalysisData, setAiAnalysisData] = useState<any>(null);
  const [aiAnalysisPhaseState, setAiAnalysisPhaseState] = useState<{
    status: "idle" | "running" | "complete" | "error";
    detail: string;
    progress: number;
    data?: Record<string, unknown>;
  }>({ status: "idle", detail: "", progress: 0 });

  // Method Priority Configuration
  const [showMethodPriority, setShowMethodPriority] = useState(false);
  const [methodPriorityLoaded, setMethodPriorityLoaded] = useState(false);
  const DEFAULT_METHOD_PRIORITY = [
    // Standard Upload Methods
    { id: "multipart", name: "Multipart POST", group: "standard", enabled: true, description: "Standard multipart/form-data upload" },
    { id: "put_direct", name: "PUT Direct", group: "standard", enabled: true, description: "HTTP PUT method upload" },
    { id: "base64_post", name: "Base64 POST", group: "standard", enabled: true, description: "Base64-encoded payload in POST body" },
    { id: "chunked", name: "Chunked Transfer", group: "standard", enabled: true, description: "Chunked Transfer-Encoding upload" },
    // Steganography Methods
    { id: "gif_stego", name: "GIF Steganography", group: "steganography", enabled: true, description: "PHP hidden in GIF89a comment" },
    { id: "png_stego", name: "PNG Steganography", group: "steganography", enabled: true, description: "PHP hidden in PNG tEXt chunk" },
    // WAF Bypass Methods
    { id: "multipart_long", name: "Long Boundary", group: "waf_bypass", enabled: true, description: "Oversized multipart boundary" },
    { id: "multipart_unicode", name: "Unicode Boundary", group: "waf_bypass", enabled: true, description: "Unicode chars in boundary" },
    { id: "multipart_nested", name: "Nested Multipart", group: "waf_bypass", enabled: true, description: "Double-nested multipart" },
    { id: "double_ext", name: "Double Extension", group: "waf_bypass", enabled: true, description: "file.php.jpg bypass" },
    { id: "null_byte", name: "Null Byte", group: "waf_bypass", enabled: true, description: "file.php%00.jpg bypass" },
    // Multi-Platform Shells
    { id: "php_poly", name: "PHP Polymorphic", group: "platform", enabled: true, description: "8 obfuscation methods" },
    { id: "asp_shell", name: "ASP Classic", group: "platform", enabled: true, description: "IIS/VBScript shell" },
    { id: "aspx_shell", name: "ASPX .NET", group: "platform", enabled: true, description: "IIS/.NET C# shell" },
    { id: "jsp_shell", name: "JSP Java", group: "platform", enabled: true, description: "Tomcat/Java shell" },
    { id: "cfm_shell", name: "ColdFusion", group: "platform", enabled: false, description: "Adobe ColdFusion shell" },
    // CMS Exploits
    { id: "wp_exploit", name: "WordPress Exploit", group: "cms_exploit", enabled: true, description: "WP plugin/theme upload" },
    { id: "joomla_exploit", name: "Joomla Exploit", group: "cms_exploit", enabled: true, description: "Joomla media upload" },
    { id: "drupal_exploit", name: "Drupal Exploit", group: "cms_exploit", enabled: true, description: "Drupal module upload" },
    { id: "ftp_brute", name: "FTP Brute Force", group: "cms_exploit", enabled: true, description: "FTP anonymous/brute" },
    { id: "webdav", name: "WebDAV Upload", group: "cms_exploit", enabled: true, description: "WebDAV PUT/PROPFIND" },
    { id: "cpanel_api", name: "cPanel API", group: "cms_exploit", enabled: true, description: "cPanel file manager" },
  ];
  const [methodPriority, setMethodPriority] = useState(DEFAULT_METHOD_PRIORITY);

  // ─── Auto-load saved method priority from database ───
  const { data: savedMethodPriority } = trpc.seoSpam.getMethodPriority.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (savedMethodPriority && !methodPriorityLoaded) {
      // Merge saved config with defaults to handle new methods added after save
      const savedConfig = savedMethodPriority.fullConfig as { id: string; enabled: boolean }[];
      if (savedConfig && savedConfig.length > 0) {
        const savedMap = new Map(savedConfig.map(c => [c.id, c.enabled]));
        const savedOrder = savedConfig.map(c => c.id);
        // Reorder: saved methods first (in saved order), then any new methods not in saved config
        const reordered = [...DEFAULT_METHOD_PRIORITY].sort((a, b) => {
          const aIdx = savedOrder.indexOf(a.id);
          const bIdx = savedOrder.indexOf(b.id);
          if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
          if (aIdx !== -1) return -1;
          if (bIdx !== -1) return 1;
          return 0;
        }).map(m => ({
          ...m,
          enabled: savedMap.has(m.id) ? savedMap.get(m.id)! : m.enabled,
        }));
        setMethodPriority(reordered);
      }
      setMethodPriorityLoaded(true);
    }
  }, [savedMethodPriority, methodPriorityLoaded]);

  // ─── Auto-save method priority to database (debounced) ───
  const saveMethodPriorityMutation = trpc.seoSpam.saveMethodPriority.useMutation({
    onError: (err) => console.warn("[MethodPriority] Save failed:", err.message),
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveMethodPriority = useCallback((config: typeof DEFAULT_METHOD_PRIORITY) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const enabledMethods = config.filter(m => m.enabled).map(m => m.id);
      const fullConfig = config.map(m => ({ id: m.id, enabled: m.enabled }));
      saveMethodPriorityMutation.mutate({ enabledMethods, fullConfig });
    }, 1500); // 1.5s debounce
  }, [saveMethodPriorityMutation]);

  // Wrap setMethodPriority to trigger auto-save
  const updateMethodPriority = useCallback((updater: (prev: typeof DEFAULT_METHOD_PRIORITY) => typeof DEFAULT_METHOD_PRIORITY) => {
    setMethodPriority(prev => {
      const next = updater(prev);
      if (methodPriorityLoaded) autoSaveMethodPriority(next);
      return next;
    });
  }, [methodPriorityLoaded, autoSaveMethodPriority]);

  const moveMethodUp = (idx: number) => {
    if (idx <= 0) return;
    updateMethodPriority(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };
  const moveMethodDown = (idx: number) => {
    updateMethodPriority(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };
  const toggleMethod = (idx: number) => {
    updateMethodPriority(prev => prev.map((m, i) => i === idx ? { ...m, enabled: !m.enabled } : m));
  };
  const toggleGroup = (group: string, enabled: boolean) => {
    updateMethodPriority(prev => prev.map(m => m.group === group ? { ...m, enabled } : m));
  };

  // tRPC mutations — Payload Generation
  const runFullChain = trpc.seoSpam.runFullChain.useMutation({
    onSuccess: (data) => {
      toast.success(`Full chain complete: ${data.totalPayloads} payloads generated`);
      setActiveTab("results");
    },
    onError: (err) => toast.error(err.message),
  });

  const runPhase = trpc.seoSpam.runPhase.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.name}: ${data.payloads.length} payloads`);
      setSelectedPhase(data.phase);
      setActiveTab("phase");
    },
    onError: (err) => toast.error(err.message),
  });

  const runCapability = trpc.seoSpam.runCapability.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.capability}: ${data.results.length} results`);
      setActiveTab("capability");
    },
    onError: (err) => toast.error(err.message),
  });

  // tRPC mutations — Real Execution
  const executeAttack = trpc.seoSpam.executeAttack.useMutation({
    onSuccess: (data) => {
      toast.success(`Execution complete: ${data.summary.uploadsSuccessful} uploads, ${data.summary.filesInjected} injections`);
      setActiveTab("execution");
    },
    onError: (err) => toast.error(err.message),
  });

  const shodanSearchMut = trpc.seoSpam.shodanSearch.useMutation({
    onSuccess: (data) => {
      toast.success(`Shodan: ${data.totalMatches} matches, Dorks: ${data.totalDorkTargets} targets`);
      setActiveTab("shodan");
    },
    onError: (err) => toast.error(err.message),
  });

  const testAllProxiesMut = trpc.seoSpam.testAllProxies.useMutation({
    onSuccess: (data) => {
      toast.success(`Proxies: ${data.working}/${data.total} working`);
      setActiveTab("proxies");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateShellMut = trpc.seoSpam.generateShell.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.count} obfuscated shells`);
      setActiveTab("shells");
    },
    onError: (err) => toast.error(err.message),
  });

  const obfuscateCodeMut = trpc.seoSpam.obfuscateCode.useMutation({
    onSuccess: () => {
      toast.success("Code obfuscated");
      setActiveTab("obfuscate");
    },
    onError: (err) => toast.error(err.message),
  });

  const verifyShellMut = trpc.seoSpam.verifyShell.useMutation({
    onSuccess: (data) => {
      toast.success(`Shell ${data.active ? "ACTIVE" : "INACTIVE"}: ${data.passedCount}/${data.totalTests} tests`);
      setActiveTab("verify");
    },
    onError: (err) => toast.error(err.message),
  });

  // One-Click Deploy
  const oneClickDeploy = trpc.seoSpam.oneClickDeploy.useMutation({
    onSuccess: (data) => {
      const s = data.summary;
      toast.success(`Deploy complete: ${s.totalFilesDeployed} files, Redirect: ${s.redirectActive ? "ACTIVE" : "inactive"}`);
      setActiveTab("deploy");
    },
    onError: (err) => toast.error(err.message),
  });

  const capsQuery = trpc.seoSpam.capabilities.useQuery();

  const report = runFullChain.data;
  const phaseResult = runPhase.data;
  const capResult = runCapability.data;
  const execReport = executeAttack.data;
  const deployReport = oneClickDeploy.data;

  const isRunning = runFullChain.isPending || runPhase.isPending || runCapability.isPending
    || executeAttack.isPending || shodanSearchMut.isPending || testAllProxiesMut.isPending
    || generateShellMut.isPending || verifyShellMut.isPending || obfuscateCodeMut.isPending
    || oneClickDeploy.isPending || sseRunning;

  const handleRunFullChain = () => {
    if (!targetDomain.trim()) return toast.error("ใส่โดเมนเป้าหมายก่อน");
    runFullChain.mutate({ targetDomain: targetDomain.trim(), redirectUrl: redirectUrl.trim() || undefined });
  };

  const handleRunPhase = (phase: number) => {
    if (!targetDomain.trim()) return toast.error("ใส่โดเมนเป้าหมายก่อน");
    runPhase.mutate({ targetDomain: targetDomain.trim(), phase, redirectUrl: redirectUrl.trim() || undefined });
  };

  const handleRunCapability = (capability: string) => {
    if (!targetDomain.trim()) return toast.error("ใส่โดเมนเป้าหมายก่อน");
    runCapability.mutate({ targetDomain: targetDomain.trim(), capability: capability as any, redirectUrl: redirectUrl.trim() || undefined });
  };

  const handleExecuteAttack = () => {
    if (!targetDomain.trim()) return toast.error("ใส่โดเมนเป้าหมายก่อน");
    if (!redirectUrl.trim()) return toast.error("ใส่ Redirect URL ก่อน");
    executeAttack.mutate({ targetDomain: targetDomain.trim(), redirectUrl: redirectUrl.trim() });
  };

  const handleOneClickDeploy = async () => {
    if (!targetDomain.trim()) return toast.error("ใส่โดเมนเป้าหมายก่อน");
    if (!redirectUrl.trim()) return toast.error("ใส่ Redirect URL ก่อน");
    
    setSseRunning(true);
    setSseEvents([]);
    setSseFinalResult(null);
    setSseError(null);
    setAiAnalysisSteps([]);
    setAiAnalysisData(null);
    setAiAnalysisPhaseState({ status: "idle", detail: "", progress: 0 });
    setActiveTab("deploy");
    toast.info("Starting One-Click Deploy pipeline...");

    try {
      const resp = await fetch("/api/oneclick/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetDomain: targetDomain.trim(),
          redirectUrl: redirectUrl.trim(),
          maxRetries,
          geoRedirectEnabled,
          proxyList: proxyListText.trim() || undefined,
          proxyRotation: proxyListText.trim() ? proxyRotation : undefined,
          weightedRedirectsText: weightedRedirectsText.trim() || undefined,
          seoKeywords: seoKeywordsText.trim() || undefined,
          enableParasitePages,
          parasiteContentLength,
          parasiteRedirectDelay,
          parasiteTemplateSlug: parasiteTemplateSlug || undefined,
          enablePreScreening,
          enableAltMethods,
          enableStealthBrowser,
          enableAiAnalysis: enableAiAnalysis,
          enableAiCommander: enableAiCommander,
          aiCommanderMaxIterations: aiCommanderMaxIterations,
          methodPriority: methodPriority.filter(m => m.enabled).map(m => m.id),
        }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let gotFinalEvent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "done") {
              gotFinalEvent = true;
              setSseFinalResult(evt.data);
              setShowDeployPopup(true);
              toast.success("ดีพลอยเสร็จสิ้น!");
            } else if (evt.type === "error") {
              gotFinalEvent = true;
              setSseError(evt.detail);
              setShowDeployPopup(true);
              toast.error(`ข้อผิดพลาด: ${evt.detail}`);
            } else {
              setSseEvents((prev) => [...prev, evt]);
              // Extract AI analysis events for AiAnalysisCard
              if (evt.type === "ai_analysis") {
                if (evt.step === "ai_analysis_complete") {
                  // Final AI analysis result
                  setAiAnalysisPhaseState({ status: "complete", detail: evt.detail || "", progress: 100, data: evt.data });
                  if (evt.data?.analysis) {
                    setAiAnalysisData(evt.data.analysis);
                  }
                } else if (evt.step?.startsWith("ai_deep_")) {
                  // Individual analysis step
                  setAiAnalysisPhaseState(prev => ({ ...prev, status: "running", detail: evt.detail || "", progress: (evt.data?.progress || prev.progress) }));
                  setAiAnalysisSteps(prev => {
                    const stepId = evt.data?.stepId || evt.step;
                    const existing = prev.findIndex(s => s.stepId === stepId);
                    const stepData = {
                      stepId: evt.data?.stepId || evt.step,
                      stepName: evt.data?.stepName || evt.step,
                      status: evt.data?.status || (evt.status === "done" ? "complete" : evt.status === "warning" ? "error" : "running"),
                      detail: evt.detail || "",
                      progress: evt.data?.progress || 0,
                      duration: evt.data?.duration,
                      data: evt.data,
                    };
                    if (existing >= 0) {
                      const updated = [...prev];
                      updated[existing] = stepData;
                      return updated;
                    }
                    return [...prev, stepData];
                  });
                }
              } else if (evt.step === "ai_analysis" && evt.status === "running") {
                setAiAnalysisPhaseState({ status: "running", detail: evt.detail || "", progress: 0 });
              }
              // Auto-scroll
              setTimeout(() => progressRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 100);
            }
          } catch { /* skip malformed */ }
        }
      }

      // Stream ended without a done/error event — show popup with partial results
      if (!gotFinalEvent) {
        // Check if we have any progress events to show partial results
        setSseEvents((prev) => {
          const lastStep = prev.length > 0 ? prev[prev.length - 1] : null;
          const lastDetail = lastStep?.detail || lastStep?.phaseName || "unknown step";
          const evtCount = prev.length;
          setSseError(
            `การเชื่อมต่อขาดหายระหว่าง: ${lastDetail}\n` +
            `ได้รับ ${evtCount} events ก่อนขาดการเชื่อมต่อ\n` +
            `สาเหตุ: Proxy/reverse proxy อาจตัด connection ที่ยาวเกินไป\n` +
            `เซิร์ฟเวอร์อาจยังทำงานอยู่ ตรวจสอบที่ประวัติการดีพลอย`
          );
          return prev;
        });
        setShowDeployPopup(true);
        toast.error("การเชื่อมต่อขาดหาย — ตรวจสอบที่ประวัติการดีพลอย");
      }
    } catch (err: any) {
      const isTimeout = err.message?.includes('abort') || err.message?.includes('timeout') || err.name === 'AbortError';
      setSseError(isTimeout 
        ? "หมดเวลาเชื่อมต่อ ระบบอาจยังทำงานอยู่ ตรวจสอบที่ประวัติการดีพลอย"
        : (err.message || "Connection failed"));
      setShowDeployPopup(true);
      toast.error(isTimeout ? "หมดเวลาเชื่อมต่อ — ตรวจสอบประวัติการดีพลอย" : `ข้อผิดพลาด: ${err.message}`);
    } finally {
      setSseRunning(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("คัดลอกแล้ว");
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ═══════════ FULLSCREEN DEPLOY RESULT POPUP ═══════════ */}
      {showDeployPopup && !sseRunning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setShowDeployPopup(false)}>
          {/* Backdrop */}
          <div className={`absolute inset-0 transition-all duration-500 ${
            sseFinalResult?.summary?.redirectActive
              ? "bg-gradient-to-br from-green-950/95 via-black/95 to-emerald-950/95"
              : "bg-gradient-to-br from-red-950/95 via-black/95 to-orange-950/95"
          }`} />

          {/* Animated particles */}
          {sseFinalResult?.summary?.redirectActive && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="absolute w-2 h-2 rounded-full bg-green-400/30 animate-ping"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 3}s`,
                    animationDuration: `${2 + Math.random() * 3}s`,
                  }} />
              ))}
            </div>
          )}

          {/* Content */}
          <div className="relative max-w-2xl w-full mx-4 animate-in fade-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button onClick={() => setShowDeployPopup(false)}
              className="absolute -top-3 -right-3 z-10 w-10 h-10 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center hover:bg-gray-700 transition-colors">
              <XCircle className="h-5 w-5 text-gray-400" />
            </button>

            <div className={`rounded-2xl border-2 p-8 backdrop-blur-xl shadow-2xl ${
              sseFinalResult?.summary?.redirectActive
                ? "border-green-500/50 bg-gray-900/90 shadow-green-500/20"
                : sseError && !sseFinalResult
                  ? "border-red-500/50 bg-gray-900/90 shadow-red-500/20"
                  : "border-red-500/50 bg-gray-900/90 shadow-red-500/20"
            }`}>
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
                  sseFinalResult?.summary?.redirectActive
                    ? "bg-green-500/20 border-2 border-green-500/40 shadow-lg shadow-green-500/20"
                    : "bg-red-500/20 border-2 border-red-500/40 shadow-lg shadow-red-500/20"
                }`}>
                  {sseFinalResult?.summary?.redirectActive
                    ? <Rocket className="h-12 w-12 text-green-400 animate-bounce" />
                    : <XCircle className="h-12 w-12 text-red-400 animate-pulse" />}
                </div>
              </div>

              {/* Title */}
              <h2 className={`text-3xl font-black text-center mb-2 ${
                sseFinalResult?.summary?.redirectActive
                  ? "text-green-400"
                  : sseError && !sseFinalResult
                    ? "text-red-400"
                    : (sseFinalResult?.summary?.totalFilesDeployed || 0) > 0
                      ? "text-yellow-400"
                      : "text-red-400"
              }`}>
                {sseFinalResult?.summary?.redirectActive
                  ? "\u26A1 ดีพลอยสำเร็จ!"
                  : sseError && !sseFinalResult
                    ? "\u274C ดีพลอยล้มเหลว"
                    : (sseFinalResult?.summary?.totalFilesDeployed || 0) > 0
                      ? "\u26A0\uFE0F ดีพลอยบางส่วน"
                      : "\u274C ดีพลอยล้มเหลว"}
              </h2>

              <p className="text-center text-gray-400 text-sm mb-4">
                {sseFinalResult?.summary?.redirectActive
                  ? `ดีพลอยสำเร็จ ${sseFinalResult.summary.totalFilesDeployed || 0} ไฟล์ ใน ${((sseFinalResult.summary.totalDuration || 0) / 1000).toFixed(1)} วินาที`
                  : sseError && !sseFinalResult
                    ? sseError
                    : (sseFinalResult?.summary?.totalFilesDeployed || 0) > 0
                      ? `ดีพลอย ${sseFinalResult?.summary?.totalFilesDeployed || 0} ไฟล์ — รอตรวจสอบ redirect`
                      : "ไม่มีไฟล์ไหนถูกดีพลอยสำเร็จ"}
              </p>

              {/* Partial deploy explanation */}
              {!sseFinalResult?.summary?.redirectActive && (sseFinalResult?.summary?.totalFilesDeployed || 0) > 0 && (
                <div className="p-3 rounded-xl bg-yellow-950/20 border border-yellow-500/20 mb-4">
                  <p className="text-xs text-yellow-300/80 text-center">
                    {"💡 ไฟล์ถูก deploy แล้วแต่ redirect ยังไม่ผ่านการตรวจสอบ — อาจต้องรอเวลาให้ server propagate หรือ WAF อาจบล็อกการตรวจสอบ"}
                  </p>
                </div>
              )}

              {/* Success: Show VERIFIED redirect links (green) */}
              {sseFinalResult?.summary?.redirectActive && sseFinalResult?.redirectInfo?.verifiedRedirectUrls?.length > 0 && (
                <div className="space-y-3 mb-6">
                  <h3 className="text-sm font-semibold text-green-300 text-center uppercase tracking-wider">
                    <Link2 className="inline h-4 w-4 mr-1" /> ลิงก์ Redirect ที่ยืนยันแล้ว
                  </h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    {sseFinalResult.redirectInfo.verifiedRedirectUrls.map((link: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-green-950/30 border border-green-500/20 hover:border-green-500/40 transition-colors group">
                        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-green-500/70">
                            Redirect ยืนยันผ่าน {link.method} {'->'} {link.redirectsTo}
                          </p>
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-green-400 hover:text-green-300 underline underline-offset-2 break-all font-medium">
                            {link.url}
                          </a>
                        </div>
                        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { navigator.clipboard.writeText(link.url); toast.success("คัดลอกแล้ว!"); }}
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700">
                            <Copy className="h-3 w-3 text-gray-400" />
                          </button>
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700">
                            <ExternalLink className="h-3 w-3 text-gray-400" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Show unverified deployed files in yellow (uploaded but redirect not confirmed) */}
              {sseFinalResult?.deployedFiles?.filter((f: any) => f.status === "deployed" && f.url && f.description?.includes("not verified")).length > 0 && (
                <div className="space-y-2 mb-6">
                  <h3 className="text-xs font-semibold text-yellow-300 text-center uppercase tracking-wider">
                    อัปโหลดแล้วแต่ Redirect ยังไม่ผ่าน
                  </h3>
                  <div className="space-y-1 max-h-[120px] overflow-y-auto pr-2">
                    {sseFinalResult.deployedFiles
                      .filter((f: any) => f.status === "deployed" && f.url && f.description?.includes("not verified"))
                      .map((file: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-yellow-950/20 border border-yellow-500/15">
                          <AlertTriangle className="h-3 w-3 text-yellow-400 shrink-0" />
                          <a href={file.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-yellow-400/80 hover:text-yellow-300 break-all">
                            {file.url}
                          </a>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Failure: Show error details */}
              {!sseFinalResult?.summary?.redirectActive && (
                <div className="space-y-3 mb-6">
                  {/* Show any files that were partially deployed */}
                  {sseFinalResult?.deployedFiles?.filter((f: any) => f.status === "deployed").length > 0 && (
                    <div className="p-3 rounded-xl bg-yellow-950/20 border border-yellow-500/20">
                      <h3 className="text-xs font-semibold text-yellow-300 mb-2">ไฟล์ที่ดีพลอยบางส่วน:</h3>
                      {sseFinalResult.deployedFiles
                        .filter((f: any) => f.status === "deployed")
                        .map((file: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-yellow-400/80 mt-1">
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                            <span className="break-all">{file.url || file.filename}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Error breakdown */}
                  {sseFinalResult?.summary?.errorBreakdown && (
                    <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/20">
                      <h3 className="text-xs font-semibold text-red-300 mb-2">สรุปข้อผิดพลาด:</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(sseFinalResult.summary.errorBreakdown)
                          .filter(([_, v]) => (v as number) > 0)
                          .map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 text-xs">
                              <span className="text-red-400">{v as number}x</span>
                              <span className="text-gray-400">{k}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SEO Parasite Pages */}
              {sseFinalResult?.parasiteInfo?.generated && sseFinalResult.parasiteInfo.pages?.length > 0 && (
                <div className="space-y-2 mb-6">
                  <h3 className="text-sm font-semibold text-violet-300 text-center uppercase tracking-wider">
                    <Sparkles className="inline h-4 w-4 mr-1" /> SEO Parasite Pages ({sseFinalResult.parasiteInfo.pagesCount} pages, {sseFinalResult.parasiteInfo.totalWordCount} words)
                  </h3>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-2">
                    {sseFinalResult.parasiteInfo.pages.map((page: any, i: number) => (
                      <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${page.deployed ? 'bg-violet-950/20 border-violet-500/20' : 'bg-gray-800/30 border-gray-700/30'}`}>
                        {page.deployed ? <CheckCircle2 className="h-3 w-3 text-violet-400 shrink-0" /> : <XCircle className="h-3 w-3 text-gray-500 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400 truncate">{page.title} ({page.wordCount}w, SEO:{page.seoScore})</p>
                          {page.url && <a href={page.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:text-violet-300 break-all">{page.url}</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats row */}
              {sseFinalResult?.summary && (
                <div className="grid grid-cols-4 gap-2 mb-6">
                  {[
                    { label: "สำเร็จ", value: sseFinalResult.summary.successSteps || 0, color: "text-green-400" },
                    { label: "ล้มเหลว", value: sseFinalResult.summary.failedSteps || 0, color: "text-red-400" },
                    { label: "ไฟล์", value: sseFinalResult.summary.totalFilesDeployed || 0, color: "text-cyan-400" },
                    { label: "ลองใหม่", value: sseFinalResult.summary.totalRetries || 0, color: "text-yellow-400" },
                  ].map((s, i) => (
                    <div key={i} className="text-center p-2 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-gray-500 uppercase">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setShowDeployPopup(false)}
                  className={sseFinalResult?.summary?.redirectActive
                    ? "bg-green-600 hover:bg-green-700 text-white font-bold px-8"
                    : "bg-red-600 hover:bg-red-700 text-white font-bold px-8"
                  }>
                  {sseFinalResult?.summary?.redirectActive ? "\u2705 ปิด" : "\u274C ปิด"}
                </Button>
                {sseFinalResult && (
                  <Button variant="outline" onClick={() => {
                    const blob = new Blob([JSON.stringify(sseFinalResult, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "deploy-report.json"; a.click();
                  }} className="border-gray-600 text-gray-400">
                    <Download className="h-4 w-4 mr-2" /> ดาวน์โหลดรายงาน
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-red-500/20 bg-gradient-to-br from-red-950/40 via-black to-orange-950/30 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(239,68,68,0.1),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/20 border border-red-500/30">
            <Syringe className="h-7 w-7 text-red-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">SEO SPAM</h1>
              <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">AUTO EXPLOIT</Badge>
              <Badge variant="outline" className="border-orange-500/50 text-orange-400 text-xs">REAL EXECUTION</Badge>
              <Badge variant="outline" className="border-yellow-500/50 text-yellow-400 text-xs animate-pulse">BETA</Badge>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              ระบบ SEO Spam อัตโนมัติ + Web Shell Exploit Chain — Shodan API, 4-Layer Obfuscation, Shell Verify, Report Download
            </p>
          </div>
        </div>
        {/* Beta Warning */}
        <div className="relative mt-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
          <div className="flex items-start gap-2">
            <FlaskConical className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-yellow-300">BETA VERSION — ระบบยังอยู่ในระหว่างทดสอบ</p>
              <p className="text-[10px] text-yellow-400/70 mt-0.5">ฟีเจอร์บางส่วนอาจยังไม่เสถียร กำลังพัฒนาต่อเนื่อง ผลลัพธ์อาจไม่เท่ากับ production</p>
            </div>
          </div>
        </div>
        <div className="relative mt-2 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">
            ใช้เฉพาะระบบที่คุณมีสิทธิ์ทดสอบเท่านั้น — Educational / Authorized Penetration Testing Only
          </p>
        </div>
      </div>

      {/* Input Section */}
      <Card className="border-gray-800 bg-gray-900/50">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">โดเมนเป้าหมาย (Target)</label>
              <div className="relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)}
                  placeholder="http://target.com" className="pl-10 bg-gray-800/50 border-gray-700" />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">โดเมน Redirect ปลายทาง</label>
              <div className="relative">
                <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)}
                  placeholder="https://your-spam.com" className="pl-10 bg-gray-800/50 border-gray-700" />
              </div>
            </div>
          </div>
          {/* SEO Keywords + Proxy + Weighted Redirects */}
          <div className="grid gap-4 md:grid-cols-3 mt-4">
            <div>
              <label className="text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5" /> SEO Keywords <span className="text-[10px] text-gray-600">(comma separated)</span>
              </label>
              <textarea
                value={seoKeywordsText}
                onChange={(e) => setSeoKeywordsText(e.target.value)}
                placeholder="casino, slot online, betting, poker, gambling"
                rows={2}
                className="w-full rounded-md bg-gray-800/50 border border-gray-700 text-sm px-3 py-2 text-gray-200 placeholder:text-gray-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              {seoKeywordsText.trim() && (
                <p className="text-[10px] text-violet-400 mt-1">
                  {seoKeywordsText.split(',').filter(k => k.trim()).length} keywords will be injected into redirect pages
                </p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Proxy List <span className="text-[10px] text-gray-600">(one per line)</span>
              </label>
              <textarea
                value={proxyListText}
                onChange={(e) => setProxyListText(e.target.value)}
                placeholder="http://proxy1:8080&#10;socks5://proxy2:1080"
                rows={2}
                className="w-full rounded-md bg-gray-800/50 border border-gray-700 text-sm px-3 py-2 text-gray-200 placeholder:text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Weighted Redirects <span className="text-[10px] text-gray-600">(url|weight per line)</span>
              </label>
              <textarea
                value={weightedRedirectsText}
                onChange={(e) => setWeightedRedirectsText(e.target.value)}
                placeholder="https://site1.com|70&#10;https://site2.com|30"
                rows={2}
                className="w-full rounded-md bg-gray-800/50 border border-gray-700 text-sm px-3 py-2 text-gray-200 placeholder:text-gray-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* SEO Parasite Options */}
          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-violet-900/20 to-fuchsia-900/20 border border-violet-500/30">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-violet-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> SEO Parasite Pages
                {parasiteTemplateSlug ? (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">Template — Instant</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-violet-500/50 text-violet-400">AI-Generated</Badge>
                )}
              </label>
              <Switch checked={enableParasitePages} onCheckedChange={setEnableParasitePages} />
            </div>
            {enableParasitePages && (
              <div className="space-y-3">
                {/* Template Selector */}
                <div className="p-2.5 rounded-lg bg-gray-800/30 border border-gray-700/50">
                  <label className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Parasite Template
                    <span className="text-[10px] text-gray-600">(เลือก Template = ไม่ต้องรอ AI, deploy ทันที)</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      onClick={() => setParasiteTemplateSlug("")}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                        !parasiteTemplateSlug
                          ? "bg-violet-600 text-white ring-1 ring-violet-400"
                          : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                      }`}
                    >
                      🤖 AI Generate
                    </button>
                    {[
                      { slug: "news", icon: "📰", label: "ข่าวด่วน" },
                      { slug: "review", icon: "⭐", label: "รีวิว" },
                      { slug: "article", icon: "📝", label: "บทความ" },
                      { slug: "faq", icon: "❓", label: "FAQ" },
                      { slug: "product", icon: "🛒", label: "สินค้า" },
                      { slug: "comparison", icon: "⚖️", label: "เปรียบเทียบ" },
                    ].map((t) => (
                      <button
                        key={t.slug}
                        onClick={() => setParasiteTemplateSlug(t.slug)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                          parasiteTemplateSlug === t.slug
                            ? "bg-emerald-600 text-white ring-1 ring-emerald-400"
                            : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 border border-gray-700"
                        }`}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  {parasiteTemplateSlug && (
                    <p className="text-[10px] text-emerald-400 mt-1.5 flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Template mode: สร้างหน้าทันทีไม่ต้องรอ AI — มี Schema, OG, Breadcrumb ในตัว
                    </p>
                  )}
                </div>

                {/* Content Length + Redirect Delay */}
                <div className="grid gap-3 md:grid-cols-3">
                  {!parasiteTemplateSlug && (
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Content Length</label>
                      <select
                        value={parasiteContentLength}
                        onChange={(e) => setParasiteContentLength(e.target.value as any)}
                        className="w-full rounded-md bg-gray-800/50 border border-gray-700 text-sm px-3 py-1.5 text-gray-200"
                      >
                        <option value="short">Short (500-800 words)</option>
                        <option value="medium">Medium (800-1500 words)</option>
                        <option value="long">Long (1500-3000 words)</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Redirect Delay (seconds)</label>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={parasiteRedirectDelay}
                      onChange={(e) => setParasiteRedirectDelay(Number(e.target.value))}
                      className="bg-gray-800/50 border-gray-700 text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      {parasiteTemplateSlug
                        ? "Template สร้าง HTML สำเร็จรูปพร้อม SEO markup ทันที ไม่ต้องรอ LLM"
                        : "AI generates Thai SEO content with keywords, schema markup, and internal links."}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── AI Intelligence Options ─── */}
          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-violet-950/30 to-cyan-950/30 border border-violet-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-violet-300">AI Intelligence Options</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={enableAiAnalysis} onChange={(e) => setEnableAiAnalysis(e.target.checked)}
                  className="rounded border-rose-500/50 bg-gray-800 text-rose-500 focus:ring-rose-500" />
                <div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-rose-300">AI Deep Analysis</span>
                  <p className="text-[10px] text-gray-500">8-step วิเคราะห์เชิงลึก + LLM strategy</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={enableAiCommander} onChange={(e) => setEnableAiCommander(e.target.checked)}
                  className="rounded border-yellow-500/50 bg-gray-800 text-yellow-500 focus:ring-yellow-500" />
                <div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-yellow-300">AI Commander</span>
                  <p className="text-[10px] text-gray-500">LLM หาวิธีทำจนสำเร็จ (max {aiCommanderMaxIterations} rounds)</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={enablePreScreening} onChange={(e) => setEnablePreScreening(e.target.checked)}
                  className="rounded border-violet-500/50 bg-gray-800 text-violet-500 focus:ring-violet-500" />
                <div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-violet-300">Pre-Screening</span>
                  <p className="text-[10px] text-gray-500">วิเคราะห์ target ก่อน deploy</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={enableAltMethods} onChange={(e) => setEnableAltMethods(e.target.checked)}
                  className="rounded border-cyan-500/50 bg-gray-800 text-cyan-500 focus:ring-cyan-500" />
                <div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-cyan-300">Alt Methods</span>
                  <p className="text-[10px] text-gray-500">FTP, CMS exploit, WebDAV</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={enableStealthBrowser} onChange={(e) => setEnableStealthBrowser(e.target.checked)}
                  className="rounded border-emerald-500/50 bg-gray-800 text-emerald-500 focus:ring-emerald-500" />
                <div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-emerald-300">Stealth Browser</span>
                  <p className="text-[10px] text-gray-500">Bypass WAF + verify ด้วย Chrome</p>
                </div>
              </label>
            </div>
          </div>

          {/* ─── Method Priority Configuration ─── */}
          <div className="mt-4">
            <button
              onClick={() => setShowMethodPriority(!showMethodPriority)}
              className="w-full p-3 rounded-lg bg-gradient-to-r from-amber-950/30 to-red-950/30 border border-amber-500/20 hover:border-amber-500/40 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">Upload Method Priority</span>
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                  {methodPriority.filter(m => m.enabled).length}/{methodPriority.length} active
                </Badge>
              </div>
              <ChevronRight className={`h-4 w-4 text-amber-400 transition-transform ${showMethodPriority ? "rotate-90" : ""}`} />
            </button>

            {showMethodPriority && (
              <div className="mt-2 p-3 rounded-lg bg-gray-900/80 border border-gray-700/50 space-y-3">
                {/* Group toggles */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { group: "standard", label: "Standard", color: "bg-blue-500/20 border-blue-500/30 text-blue-300" },
                    { group: "steganography", label: "Steganography", color: "bg-purple-500/20 border-purple-500/30 text-purple-300" },
                    { group: "waf_bypass", label: "WAF Bypass", color: "bg-orange-500/20 border-orange-500/30 text-orange-300" },
                    { group: "platform", label: "Multi-Platform", color: "bg-cyan-500/20 border-cyan-500/30 text-cyan-300" },
                    { group: "cms_exploit", label: "CMS Exploit", color: "bg-red-500/20 border-red-500/30 text-red-300" },
                  ].map(g => {
                    const groupMethods = methodPriority.filter(m => m.group === g.group);
                    const allEnabled = groupMethods.every(m => m.enabled);
                    return (
                      <button key={g.group}
                        onClick={() => toggleGroup(g.group, !allEnabled)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all ${g.color} ${allEnabled ? "opacity-100" : "opacity-40"}`}
                      >
                        {g.label} ({groupMethods.filter(m => m.enabled).length}/{groupMethods.length})
                      </button>
                    );
                  })}
                </div>

                {/* Method list with drag handles */}
                <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                  {methodPriority.map((method, idx) => (
                    <div key={method.id}
                      className={`flex items-center gap-2 p-1.5 rounded-md border transition-all ${
                        method.enabled
                          ? "bg-gray-800/60 border-gray-700/50 hover:border-gray-600"
                          : "bg-gray-900/40 border-gray-800/30 opacity-50"
                      }`}
                    >
                      {/* Priority number */}
                      <span className="text-[10px] font-mono text-gray-500 w-5 text-center shrink-0">
                        {method.enabled ? `#${methodPriority.slice(0, idx + 1).filter(m => m.enabled).length}` : "—"}
                      </span>

                      {/* Up/Down buttons */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveMethodUp(idx)} disabled={idx === 0}
                          className="text-gray-500 hover:text-gray-300 disabled:opacity-20 text-[10px] leading-none">▲</button>
                        <button onClick={() => moveMethodDown(idx)} disabled={idx === methodPriority.length - 1}
                          className="text-gray-500 hover:text-gray-300 disabled:opacity-20 text-[10px] leading-none">▼</button>
                      </div>

                      {/* Toggle */}
                      <button onClick={() => toggleMethod(idx)}
                        className={`w-4 h-4 rounded-sm border shrink-0 flex items-center justify-center transition-colors ${
                          method.enabled ? "bg-emerald-500/30 border-emerald-500/50" : "bg-gray-800 border-gray-600"
                        }`}
                      >
                        {method.enabled && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                      </button>

                      {/* Method info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-gray-200 truncate">{method.name}</span>
                          <Badge variant="outline" className={`text-[8px] px-1 py-0 shrink-0 ${
                            method.group === "standard" ? "border-blue-500/30 text-blue-400" :
                            method.group === "steganography" ? "border-purple-500/30 text-purple-400" :
                            method.group === "waf_bypass" ? "border-orange-500/30 text-orange-400" :
                            method.group === "platform" ? "border-cyan-500/30 text-cyan-400" :
                            "border-red-500/30 text-red-400"
                          }`}>
                            {method.group === "standard" ? "STD" :
                             method.group === "steganography" ? "STEG" :
                             method.group === "waf_bypass" ? "WAF" :
                             method.group === "platform" ? "PLAT" : "CMS"}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-gray-500 truncate">{method.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-gray-600 text-center">
                  ↑↓ ลำดับความสำคัญ • ✅ เปิด/ปิด • Methods ที่เปิดจะถูกใช้ตามลำดับที่ตั้งไว้
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Button onClick={handleOneClickDeploy} disabled={isRunning || !targetDomain.trim() || !redirectUrl.trim()}
              className="bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 hover:from-red-700 hover:via-orange-600 hover:to-yellow-600 text-white font-bold shadow-lg shadow-red-500/25 animate-pulse hover:animate-none">
              {sseRunning ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deploying...</> :
                <><Rocket className="h-4 w-4 mr-2" /> One-Click Deploy & Redirect</>}
            </Button>
            <Button onClick={handleRunFullChain} disabled={isRunning || !targetDomain.trim()}
              className="bg-red-600 hover:bg-red-700 text-white">
              {runFullChain.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Running...</> :
                <><Zap className="h-4 w-4 mr-2" /> Payload Generator</>}
            </Button>
            <Button onClick={handleExecuteAttack} disabled={isRunning || !targetDomain.trim() || !redirectUrl.trim()}
              variant="outline" className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
              {executeAttack.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Executing...</> :
                <><Bomb className="h-4 w-4 mr-2" /> Execute Real Attack</>}
            </Button>
            <Button onClick={() => shodanSearchMut.mutate({ targetDomain: targetDomain.trim() || undefined })}
              disabled={isRunning} variant="outline" className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10">
              {shodanSearchMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Radar className="h-4 w-4 mr-2" />}
              Shodan Search
            </Button>
            <Button onClick={() => testAllProxiesMut.mutate()} disabled={isRunning}
              variant="outline" className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
              {testAllProxiesMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
              Test Proxies
            </Button>
            <Button onClick={() => generateShellMut.mutate({ count: 3 })} disabled={isRunning}
              variant="outline" className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10">
              {generateShellMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Terminal className="h-4 w-4 mr-2" />}
              Generate Shells
            </Button>
          </div>
          {/* Enterprise Settings */}
          <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-800">
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-gray-500" />
              <Label className="text-xs text-gray-500">Max Retries:</Label>
              <Input type="number" min={0} max={10} value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-16 h-7 text-xs bg-gray-800/50 border-gray-700" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={geoRedirectEnabled} onCheckedChange={setGeoRedirectEnabled} />
              <Label className="text-xs text-gray-500">Geo Redirect (Thai IP)</Label>
            </div>
            <Badge variant="outline" className="text-[10px] text-gray-600 border-gray-700">
              Enterprise Engine v2.0 — Exponential Backoff + WAF Bypass + Error Classification
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-900/50 border border-gray-800 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="launch" className="text-xs">🚀 Launch Pad</TabsTrigger>
          <TabsTrigger value="deploy" disabled={!deployReport && sseEvents.length === 0 && !sseFinalResult} className="text-xs">🛩️ Deploy</TabsTrigger>
          <TabsTrigger value="execution" disabled={!execReport} className="text-xs">⚡ Execution</TabsTrigger>
          <TabsTrigger value="results" disabled={!report} className="text-xs">📊 Payloads</TabsTrigger>
          <TabsTrigger value="shodan" disabled={!shodanSearchMut.data} className="text-xs">🔍 Shodan</TabsTrigger>
          <TabsTrigger value="proxies" disabled={!testAllProxiesMut.data} className="text-xs">🔄 Proxies</TabsTrigger>
          <TabsTrigger value="shells" disabled={!generateShellMut.data} className="text-xs">💀 Shells</TabsTrigger>
          <TabsTrigger value="tools" className="text-xs">🔧 Tools</TabsTrigger>
          <TabsTrigger value="phase" disabled={!phaseResult} className="text-xs">⚡ Phase</TabsTrigger>
          <TabsTrigger value="capability" disabled={!capResult} className="text-xs">🎯 Cap</TabsTrigger>
        </TabsList>

        {/* ═══════════ LAUNCH PAD ═══════════ */}
        <TabsContent value="launch" className="space-y-4">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Workflow className="h-5 w-5 text-red-400" /> Attack Chain Flow
              </CardTitle>
              <CardDescription>6-Phase Auto Exploit Chain — คลิกแต่ละ Phase เพื่อรันแยก</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                {PHASE_CONFIG.map((phase, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleRunPhase(i + 1)}
                      disabled={isRunning || !targetDomain.trim()} className={`${phase.border} ${phase.bg} hover:opacity-80`}>
                      {runPhase.isPending && selectedPhase === i + 1 ?
                        <Loader2 className="h-3 w-3 animate-spin mr-1" /> :
                        <phase.icon className={`h-3 w-3 mr-1 ${phase.color}`} />}
                      <span className={phase.color}>{phase.label}</span>
                    </Button>
                    {i < PHASE_CONFIG.length - 1 && <ArrowRight className="h-4 w-4 text-gray-600" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {capsQuery.data && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {capsQuery.data.phases.map((phase, pi) => {
                const config = PHASE_CONFIG[pi];
                return (
                  <Card key={pi} className={`border-gray-800 bg-gray-900/50 ${config?.border}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span>{config?.emoji}</span>
                          <span className={config?.color}>{phase.name}</span>
                        </CardTitle>
                        <Badge variant="outline" className={`text-xs ${RISK_COLORS[phase.riskLevel] || "text-gray-400"}`}>
                          Risk {phase.riskLevel}/10
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">{phase.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {phase.capabilities.map((cap) => (
                        <button key={cap.id} onClick={() => handleRunCapability(cap.id)}
                          disabled={isRunning || !targetDomain.trim()}
                          className="w-full text-left px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 transition-colors group">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-300 group-hover:text-white">{cap.name}</span>
                            <Play className="h-3 w-3 text-gray-600 group-hover:text-red-400 transition-colors" />
                          </div>
                          <p className="text-[10px] text-gray-500 mt-0.5">{cap.description}</p>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ EXECUTION REPORT ═══════════ */}
        <TabsContent value="execution" className="space-y-4">
          {execReport && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Targets Found", value: execReport.summary.targetsFound, icon: Target, color: "text-cyan-400" },
                  { label: "Proxies Working", value: execReport.summary.proxiesWorking, icon: Wifi, color: "text-blue-400" },
                  { label: "Shells Generated", value: execReport.summary.shellsGenerated, icon: Terminal, color: "text-purple-400" },
                  { label: "Uploads Attempted", value: execReport.summary.uploadsAttempted, icon: Upload, color: "text-orange-400" },
                  { label: "Uploads Successful", value: execReport.summary.uploadsSuccessful, icon: CheckCircle2, color: "text-green-400" },
                  { label: "Shells Verified", value: execReport.summary.shellsVerified, icon: ShieldAlert, color: "text-yellow-400" },
                  { label: "Files Injected", value: execReport.summary.filesInjected, icon: Syringe, color: "text-red-400" },
                  { label: "Duration", value: `${(execReport.summary.totalDuration / 1000).toFixed(1)}s`, icon: Clock, color: "text-gray-400" },
                ].map((stat, i) => (
                  <Card key={i} className="border-gray-800 bg-gray-900/50">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500">{stat.label}</p>
                          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                        </div>
                        <stat.icon className={`h-5 w-5 ${stat.color} opacity-40`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Execution Steps */}
              <Card className="border-gray-800 bg-gray-900/50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-green-400" /> Execution Steps
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {execReport.steps.map((step) => {
                    const si = STATUS_ICONS[step.status] || STATUS_ICONS.pending;
                    const StatusIcon = si.icon;
                    return (
                      <div key={step.step} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <StatusIcon className={`h-5 w-5 mt-0.5 shrink-0 ${si.color} ${step.status === "running" ? "animate-spin" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">Step {step.step}: {step.name}</span>
                            <Badge variant="outline" className={`text-[10px] ${si.color}`}>{step.status}</Badge>
                            {step.startTime && step.endTime && (
                              <Badge variant="outline" className="text-[10px] text-gray-500">
                                {((step.endTime - step.startTime) / 1000).toFixed(1)}s
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{step.details}</p>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Shodan Results */}
              {execReport.shodanResults.length > 0 && (
                <Card className="border-cyan-500/20 bg-gray-900/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Radar className="h-4 w-4 text-cyan-400" /> Shodan Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-2">
                        {execReport.shodanResults.map((r, i) => (
                          <div key={i} className="p-2 rounded bg-gray-800/50 border border-gray-700/50">
                            <div className="flex items-center justify-between mb-1">
                              <code className="text-[10px] text-cyan-300">{r.query}</code>
                              <Badge variant="outline" className="text-[10px]">{r.total} total</Badge>
                            </div>
                            {r.error && <p className="text-[10px] text-red-400">Error: {r.error}</p>}
                            {r.matches.map((m, j) => (
                              <div key={j} className="text-[10px] text-gray-400 ml-2">
                                {m.url} — {m.org || "N/A"} [{m.product || "N/A"}]
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Upload Attempts */}
              {execReport.uploadAttempts.length > 0 && (
                <Card className="border-orange-500/20 bg-gray-900/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Upload className="h-4 w-4 text-orange-400" /> Upload Attempts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-1">
                        {execReport.uploadAttempts.map((u, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded bg-gray-800/50 text-xs">
                            {u.success ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" /> : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                            <span className="text-gray-400 truncate">{u.path}{u.filename}</span>
                            <Badge variant="outline" className="text-[10px] ml-auto">{u.statusCode || "ERR"}</Badge>
                            {u.wafBypassed && <Badge variant="outline" className="text-[10px] text-green-400">WAF✓</Badge>}
                            {u.shellUrl && (
                              <button onClick={() => copyCode(u.shellUrl!)} className="text-cyan-400 hover:text-cyan-300">
                                <Copy className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Shell Verifications */}
              {execReport.shellVerifications.length > 0 && (
                <Card className="border-yellow-500/20 bg-gray-900/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-yellow-400" /> Shell Verifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {execReport.shellVerifications.map((v, i) => (
                      <div key={i} className="p-3 rounded bg-gray-800/50 border border-gray-700/50 mb-2">
                        <div className="flex items-center gap-2 mb-2">
                          {v.active ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                          <span className={`text-sm font-medium ${v.active ? "text-green-400" : "text-red-400"}`}>
                            {v.active ? "ACTIVE" : "INACTIVE"}
                          </span>
                          <code className="text-[10px] text-gray-400 truncate">{v.shellUrl}</code>
                          <Badge variant="outline" className="text-[10px] ml-auto">{v.passedCount}/{v.totalTests}</Badge>
                        </div>
                        {v.tests.map((t, j) => (
                          <div key={j} className="flex items-center gap-2 text-[10px] ml-6">
                            {t.passed ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                            <code className="text-gray-500">{t.command.slice(0, 30)}</code>
                            <span className="text-gray-600">→</span>
                            <span className="text-gray-400 truncate">{t.response.slice(0, 50) || "No response"}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Report Download */}
              <Card className="border-gray-800 bg-gray-900/50">
                <CardContent className="pt-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadFile(execReport.jsonReport, `seo-spam-report-${execReport.id}.json`)}
                      className="border-blue-500/50 text-blue-400">
                      <FileJson className="h-4 w-4 mr-2" /> Download JSON Report
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadFile(execReport.txtReport, `seo-spam-report-${execReport.id}.txt`)}
                      className="border-green-500/50 text-green-400">
                      <FileText className="h-4 w-4 mr-2" /> Download TXT Report
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copyCode(execReport.jsonReport)}
                      className="border-gray-600 text-gray-400">
                      <Copy className="h-4 w-4 mr-2" /> Copy JSON
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════════ SHODAN RESULTS ═══════════ */}
        <TabsContent value="shodan" className="space-y-4">
          {shodanSearchMut.data && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-gray-800 bg-gray-900/50">
                  <CardContent className="pt-4">
                    <p className="text-[10px] uppercase text-gray-500">Shodan Matches</p>
                    <p className="text-3xl font-bold text-cyan-400">{shodanSearchMut.data.totalMatches}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-800 bg-gray-900/50">
                  <CardContent className="pt-4">
                    <p className="text-[10px] uppercase text-gray-500">Dork Targets</p>
                    <p className="text-3xl font-bold text-orange-400">{shodanSearchMut.data.totalDorkTargets}</p>
                  </CardContent>
                </Card>
              </div>
              <Card className="border-gray-800 bg-gray-900/50">
                <CardHeader>
                  <CardTitle className="text-sm">Shodan API Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-3">
                      {shodanSearchMut.data.shodanResults.map((r, i) => (
                        <div key={i} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                          <div className="flex items-center justify-between mb-2">
                            <code className="text-xs text-cyan-300 break-all">{r.query}</code>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[10px]">{r.total} total</Badge>
                              <Badge variant="outline" className="text-[10px] text-cyan-400">{r.matches.length} shown</Badge>
                            </div>
                          </div>
                          {r.error && (
                            <p className="text-xs text-red-400 mb-2">Error: {r.error}</p>
                          )}
                          {r.matches.length > 0 && (
                            <div className="space-y-1">
                              {r.matches.map((m, j) => (
                                <div key={j} className="flex items-center gap-2 text-xs p-1.5 rounded bg-black/30">
                                  <Globe className="h-3 w-3 text-cyan-400 shrink-0" />
                                  <span className="text-cyan-300 font-mono">{m.ip}:{m.port}</span>
                                  <span className="text-gray-500">|</span>
                                  <span className="text-gray-400">{m.org || "N/A"}</span>
                                  {m.product && <Badge variant="outline" className="text-[9px]">{m.product}</Badge>}
                                  {m.hostnames && m.hostnames.length > 0 && (
                                    <span className="text-gray-500 text-[10px] truncate">{m.hostnames[0]}</span>
                                  )}
                                  <button onClick={() => copyCode(m.url)} className="ml-auto">
                                    <Copy className="h-3 w-3 text-gray-600 hover:text-white" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
              {shodanSearchMut.data.dorkTargets.length > 0 && (
                <Card className="border-gray-800 bg-gray-900/50">
                  <CardHeader>
                    <CardTitle className="text-sm">Google Dork Targets</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {shodanSearchMut.data.dorkTargets.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-gray-800/50">
                          <Link2 className="h-3 w-3 text-orange-400 shrink-0" />
                          <span className="text-orange-300 truncate">{t}</span>
                          <button onClick={() => copyCode(t)} className="ml-auto shrink-0">
                            <Copy className="h-3 w-3 text-gray-600 hover:text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════ PROXY RESULTS ═══════════ */}
        <TabsContent value="proxies" className="space-y-4">
          {testAllProxiesMut.data && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-gray-800 bg-gray-900/50">
                  <CardContent className="pt-4">
                    <p className="text-[10px] uppercase text-gray-500">Working</p>
                    <p className="text-3xl font-bold text-green-400">{testAllProxiesMut.data.working}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-800 bg-gray-900/50">
                  <CardContent className="pt-4">
                    <p className="text-[10px] uppercase text-gray-500">Total Tested</p>
                    <p className="text-3xl font-bold text-blue-400">{testAllProxiesMut.data.total}</p>
                  </CardContent>
                </Card>
              </div>
              <Card className="border-gray-800 bg-gray-900/50">
                <CardContent className="pt-4">
                  <div className="space-y-1">
                    {testAllProxiesMut.data.results.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        {p.working ?
                          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> :
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                        <code className="text-xs text-gray-300 font-mono">{p.proxy}</code>
                        <Badge variant="outline" className={`text-[10px] ml-auto ${p.working ? "text-green-400" : "text-red-400"}`}>
                          {p.responseTime}ms
                        </Badge>
                        {p.error && <span className="text-[10px] text-red-400">{p.error}</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════════ SHELLS ═══════════ */}
        <TabsContent value="shells" className="space-y-4">
          {generateShellMut.data && (
            <div className="space-y-3">
              {generateShellMut.data.shells.map((shell, i) => (
                <Card key={i} className="border-purple-500/20 bg-gray-900/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-purple-400" />
                        <span className="text-purple-300">{shell.filename}</span>
                      </CardTitle>
                      <div className="flex gap-1">
                        <Badge variant="outline" className="text-[10px] text-purple-400">{shell.layerCount} layers</Badge>
                        <Badge variant="outline" className="text-[10px]">{shell.size}B</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Password */}
                    <div className="flex items-center gap-2">
                      <Lock className="h-3 w-3 text-yellow-400" />
                      <span className="text-xs text-gray-400">Password:</span>
                      <code className="text-xs text-yellow-300 bg-yellow-500/10 px-2 py-0.5 rounded">{shell.password}</code>
                      <button onClick={() => copyCode(shell.password)}>
                        <Copy className="h-3 w-3 text-gray-600 hover:text-white" />
                      </button>
                    </div>

                    {/* Obfuscation Layers */}
                    <div className="flex items-center gap-1">
                      <Layers className="h-3 w-3 text-purple-400" />
                      <span className="text-[10px] text-gray-500">Layers:</span>
                      {shell.layers.map((l, j) => (
                        <Badge key={j} variant="outline" className="text-[9px] text-purple-300">{l.method}</Badge>
                      ))}
                    </div>

                    {/* Original Code */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500">Original Shell</span>
                        <button onClick={() => copyCode(shell.originalCode)} className="text-gray-600 hover:text-white">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      <pre className="text-[10px] text-green-400/80 bg-black/50 rounded p-2 overflow-x-auto max-h-[100px] overflow-y-auto font-mono">
                        {shell.originalCode}
                      </pre>
                    </div>

                    {/* Final Payload */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500">Final Payload (4-layer obfuscated)</span>
                        <button onClick={() => copyCode(shell.finalPayload)} className="text-gray-600 hover:text-white">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      <pre className="text-[10px] text-red-400/80 bg-black/50 rounded p-2 overflow-x-auto max-h-[80px] overflow-y-auto font-mono">
                        {shell.finalPayload.length > 300 ? shell.finalPayload.slice(0, 300) + "..." : shell.finalPayload}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ TOOLS ═══════════ */}
        <TabsContent value="tools" className="space-y-4">
          {/* Shell Verifier */}
          <Card className="border-yellow-500/20 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-yellow-400" /> Shell Verifier
              </CardTitle>
              <CardDescription className="text-xs">ทดสอบ shell ที่อัพโหลดแล้ว — 5 test commands</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Shell URL</label>
                  <Input value={shellUrl} onChange={(e) => setShellUrl(e.target.value)}
                    placeholder="http://target.com/uploads/cache_xxx.php" className="bg-gray-800/50 border-gray-700 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Password</label>
                  <Input value={shellPassword} onChange={(e) => setShellPassword(e.target.value)}
                    placeholder="shell password" className="bg-gray-800/50 border-gray-700 text-xs" />
                </div>
              </div>
              <Button onClick={() => verifyShellMut.mutate({ shellUrl, password: shellPassword })}
                disabled={isRunning || !shellUrl || !shellPassword} size="sm"
                className="bg-yellow-600 hover:bg-yellow-700 text-black">
                {verifyShellMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                Verify Shell
              </Button>

              {verifyShellMut.data && (
                <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    {verifyShellMut.data.active ?
                      <CheckCircle2 className="h-5 w-5 text-green-400" /> :
                      <XCircle className="h-5 w-5 text-red-400" />}
                    <span className={`font-bold ${verifyShellMut.data.active ? "text-green-400" : "text-red-400"}`}>
                      {verifyShellMut.data.active ? "SHELL ACTIVE" : "SHELL INACTIVE"}
                    </span>
                    <Badge variant="outline">{verifyShellMut.data.passedCount}/{verifyShellMut.data.totalTests} passed</Badge>
                  </div>
                  {verifyShellMut.data.tests.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1">
                      {t.passed ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                      <code className="text-gray-400">{t.command}</code>
                      <span className="text-gray-600">→</span>
                      <span className="text-gray-300 truncate">{t.response.slice(0, 60) || "No response"}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Code Obfuscator */}
          <Card className="border-purple-500/20 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-purple-400" /> Code Obfuscator
              </CardTitle>
              <CardDescription className="text-xs">Multi-layer obfuscation — base64, XOR, reverse, char shift</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={customCode} onChange={(e) => setCustomCode(e.target.value)}
                placeholder="<?php echo 'hello'; ?>" className="bg-gray-800/50 border-gray-700 font-mono text-xs min-h-[80px]" />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Layers:</label>
                <Input type="number" value={obfLayers} onChange={(e) => setObfLayers(Number(e.target.value))}
                  min={1} max={8} className="w-20 bg-gray-800/50 border-gray-700 text-xs" />
                <Button onClick={() => obfuscateCodeMut.mutate({ code: customCode, layers: obfLayers })}
                  disabled={isRunning || !customCode} size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white">
                  {obfuscateCodeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Obfuscate
                </Button>
              </div>

              {obfuscateCodeMut.data && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    {obfuscateCodeMut.data.layers.map((l, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] text-purple-300">{l.method}</Badge>
                    ))}
                  </div>
                  <div className="relative">
                    <pre className="text-[10px] text-red-400/80 bg-black/50 rounded p-2 overflow-x-auto max-h-[120px] overflow-y-auto font-mono">
                      {obfuscateCodeMut.data.obfuscated.length > 500
                        ? obfuscateCodeMut.data.obfuscated.slice(0, 500) + "..."
                        : obfuscateCodeMut.data.obfuscated}
                    </pre>
                    <button onClick={() => copyCode(obfuscateCodeMut.data!.obfuscated)}
                      className="absolute top-2 right-2 p-1 rounded bg-gray-800 hover:bg-gray-700">
                      <Copy className="h-3 w-3 text-gray-400" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ OBFUSCATE RESULT ═══════════ */}
        <TabsContent value="obfuscate" className="space-y-4">
          {obfuscateCodeMut.data && (
            <Card className="border-purple-500/20 bg-gray-900/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-purple-400" /> Obfuscation Result
                  <Badge variant="outline" className="text-[10px]">{obfuscateCodeMut.data.layerCount} layers</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-gray-500">Layers applied:</span>
                  {obfuscateCodeMut.data.layers.map((l, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px] text-purple-300">{l.method}</Badge>
                      {i < obfuscateCodeMut.data!.layers.length - 1 && <ArrowRight className="h-3 w-3 text-gray-600" />}
                    </span>
                  ))}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">Original</span>
                  </div>
                  <pre className="text-[10px] text-green-400/80 bg-black/50 rounded p-2 overflow-x-auto max-h-[100px] font-mono">
                    {obfuscateCodeMut.data.original}
                  </pre>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">Obfuscated</span>
                    <button onClick={() => copyCode(obfuscateCodeMut.data!.obfuscated)} className="text-gray-600 hover:text-white">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <pre className="text-[10px] text-red-400/80 bg-black/50 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto font-mono">
                    {obfuscateCodeMut.data.obfuscated}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════ VERIFY RESULT ═══════════ */}
        <TabsContent value="verify" className="space-y-4">
          {verifyShellMut.data && (
            <Card className={`border-gray-800 bg-gray-900/50 ${verifyShellMut.data.active ? "border-green-500/20" : "border-red-500/20"}`}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  {verifyShellMut.data.active ?
                    <CheckCircle2 className="h-8 w-8 text-green-400" /> :
                    <XCircle className="h-8 w-8 text-red-400" />}
                  <div>
                    <CardTitle className={verifyShellMut.data.active ? "text-green-400" : "text-red-400"}>
                      {verifyShellMut.data.active ? "SHELL IS ACTIVE" : "SHELL IS INACTIVE"}
                    </CardTitle>
                    <CardDescription className="text-xs">{verifyShellMut.data.shellUrl}</CardDescription>
                  </div>
                  <Badge variant="outline" className="ml-auto text-lg">
                    {verifyShellMut.data.passedCount}/{verifyShellMut.data.totalTests}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {verifyShellMut.data.tests.map((t, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      {t.passed ?
                        <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" /> :
                        <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                      <div className="flex-1">
                        <code className="text-xs text-gray-300">{t.command}</code>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-500">Expected:</span>
                          <code className="text-[10px] text-yellow-300">{t.expected}</code>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500">Response:</span>
                          <code className="text-[10px] text-gray-400">{t.response.slice(0, 100) || "No response"}</code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════ FULL REPORT (Payloads) ═══════════ */}
        <TabsContent value="results" className="space-y-4">
          {report && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                  { label: "Targets", value: report.totalTargets, icon: Target, color: "text-cyan-400" },
                  { label: "Shells", value: report.totalShells, icon: Terminal, color: "text-purple-400" },
                  { label: "Uploads", value: report.totalUploads, icon: Upload, color: "text-orange-400" },
                  { label: "Injections", value: report.totalInjections, icon: Syringe, color: "text-red-400" },
                  { label: "Redirects", value: report.totalRedirects, icon: Router, color: "text-yellow-400" },
                  { label: "Total", value: report.totalPayloads, icon: Bomb, color: "text-red-500" },
                ].map((stat, i) => (
                  <Card key={i} className="border-gray-800 bg-gray-900/50">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500">{stat.label}</p>
                          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                        </div>
                        <stat.icon className={`h-5 w-5 ${stat.color} opacity-40`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="space-y-3">
                {report.phases.map((phase, pi) => {
                  const config = PHASE_CONFIG[pi];
                  return (
                    <Card key={pi} className={`border-gray-800 bg-gray-900/50 ${config?.border}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <span>{config?.emoji}</span>
                            <span className={config?.color}>Phase {phase.phase}: {phase.name}</span>
                            <Badge variant="outline" className="text-xs">{phase.payloads.length} payloads</Badge>
                          </CardTitle>
                          <Badge variant="outline" className={`text-xs ${RISK_COLORS[phase.riskLevel] || "text-gray-400"}`}>
                            Risk {phase.riskLevel}/10
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">{phase.summary}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="max-h-[300px]">
                          <div className="space-y-2">
                            {phase.payloads.map((payload, j) => (
                              <div key={j} className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={`text-[10px] ${config?.border} ${config?.color}`}>
                                      {payload.type}
                                    </Badge>
                                    <span className="text-xs text-gray-400">{payload.technique}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="text-[10px] text-gray-500">{payload.size}B</Badge>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyCode(payload.code)}>
                                      <Copy className="h-3 w-3 text-gray-500" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-[10px] text-gray-500 mb-2">{payload.effect}</p>
                                <pre className="text-[10px] text-green-400/80 bg-black/50 rounded p-2 overflow-x-auto max-h-[120px] overflow-y-auto font-mono">
                                  {payload.code.length > 500 ? payload.code.slice(0, 500) + "\n..." : payload.code}
                                </pre>
                                {payload.features && payload.features.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {payload.features.map((f, fi) => (
                                      <Badge key={fi} variant="outline" className="text-[9px] text-gray-500 border-gray-700">{f}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {report.aiAnalysis && (
                <Card className="border-red-500/20 bg-red-950/10">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-red-400" /> AI Security Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{report.aiAnalysis}</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════ PHASE RESULT ═══════════ */}
        <TabsContent value="phase" className="space-y-4">
          {phaseResult && (
            <Card className={`border-gray-800 bg-gray-900/50 ${PHASE_CONFIG[phaseResult.phase - 1]?.border}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <span>{PHASE_CONFIG[phaseResult.phase - 1]?.emoji}</span>
                    <span className={PHASE_CONFIG[phaseResult.phase - 1]?.color}>
                      Phase {phaseResult.phase}: {phaseResult.name}
                    </span>
                  </CardTitle>
                  <Badge variant="outline" className={RISK_COLORS[phaseResult.riskLevel] || "text-gray-400"}>
                    Risk {phaseResult.riskLevel}/10
                  </Badge>
                </div>
                <CardDescription>{phaseResult.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-3">
                    {phaseResult.payloads.map((payload, j) => (
                      <div key={j} className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className={`text-xs ${PHASE_CONFIG[phaseResult.phase - 1]?.color}`}>
                            {payload.type}
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-6" onClick={() => copyCode(payload.code)}>
                            <Copy className="h-3 w-3 mr-1" /> Copy
                          </Button>
                        </div>
                        <p className="text-xs text-gray-400 mb-1">{payload.technique}</p>
                        <p className="text-[10px] text-gray-500 mb-2">{payload.effect}</p>
                        <pre className="text-[10px] text-green-400/80 bg-black/50 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto font-mono">
                          {payload.code}
                        </pre>
                        {payload.features && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {payload.features.map((f, fi) => (
                              <Badge key={fi} variant="outline" className="text-[9px] text-gray-500">{f}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════ CAPABILITY RESULT ═══════════ */}
        <TabsContent value="capability" className="space-y-4">
          {capResult && (
            <Card className="border-gray-800 bg-gray-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crosshair className="h-5 w-5 text-red-400" />
                  {capResult.capability}
                  <Badge variant="outline">{capResult.results.length} results</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-3">
                    {capResult.results.map((payload: any, j: number) => (
                      <div key={j} className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs text-red-400">{payload.type}</Badge>
                          <Button variant="ghost" size="sm" className="h-6" onClick={() => copyCode(payload.code)}>
                            <Copy className="h-3 w-3 mr-1" /> Copy
                          </Button>
                        </div>
                        <p className="text-xs text-gray-400 mb-1">{payload.technique}</p>
                        <p className="text-[10px] text-gray-500 mb-2">{payload.effect}</p>
                        <pre className="text-[10px] text-green-400/80 bg-black/50 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto font-mono">
                          {payload.code}
                        </pre>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        {/* ═══════════ ONE-CLICK DEPLOY RESULTS ═══════════ */}
        <TabsContent value="deploy" className="space-y-4">
          {/* AI Target Analysis Card — shows before pipeline progress */}
          {aiAnalysisPhaseState.status !== "idle" && (
            <AiAnalysisCard
              phaseState={aiAnalysisPhaseState}
              analysisSteps={aiAnalysisSteps}
              analysisData={aiAnalysisData}
            />
          )}

          {/* SSE Real-Time Progress */}
          {(sseRunning || sseEvents.length > 0 || sseFinalResult || sseError) && (
            <div className="space-y-4" ref={progressRef}>
              {/* Overall Progress */}
              {(() => {
                // Backend sends phase_start/phase_complete (9 phases), plus step_detail events
                // Count unique completed phases for progress
                const phaseStarts = sseEvents.filter((e: any) => e.type === "phase_start");
                const phaseCompletes = sseEvents.filter((e: any) => e.type === "phase_complete");
                const totalSteps = Math.max(9, phaseStarts.length); // 9 phases in pipeline
                const completedSteps = phaseCompletes.filter((e: any) => e.status === "success" || e.status === "skipped" || e.status === "done").length;
                const failedSteps = phaseCompletes.filter((e: any) => e.status === "failed").length;
                // Also use progress field from latest event if available
                const latestWithProgress = [...sseEvents].reverse().find((e: any) => typeof e.progress === "number");
                const pct = latestWithProgress ? Math.min(latestWithProgress.progress, 100) : Math.round(((completedSteps + failedSteps) / totalSteps) * 100);
                // Count enhanced upload events
                const enhancedEvents = sseEvents.filter((e: any) => e.step?.startsWith("enhanced_"));
                const altEvents = sseEvents.filter((e: any) => e.step?.startsWith("alt_"));
                const uploadMethods = new Set([...enhancedEvents, ...altEvents].map((e: any) => e.step).filter(Boolean));
                const hasEnhancedUpload = enhancedEvents.length > 0;
                return (
                  <Card className="border-gray-800 bg-gray-900/50">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Rocket className="h-4 w-4 text-orange-400" />
                          <span className="text-sm font-medium text-white">Pipeline Progress</span>
                          {sseRunning && <Loader2 className="h-3 w-3 animate-spin text-orange-400" />}
                        </div>
                        <span className="text-xs text-gray-400">{completedSteps + failedSteps}/{totalSteps} steps ({pct}%)</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/30">✓ {completedSteps} success</Badge>
                        {failedSteps > 0 && <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30">✗ {failedSteps} failed</Badge>}
                        {hasEnhancedUpload && (
                          <Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30">
                            🚀 Enhanced Engine Active
                          </Badge>
                        )}
                        {uploadMethods.size > 0 && (
                          <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30">
                            {uploadMethods.size} upload vectors
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Per-Step Events */}
              <Card className="border-gray-800 bg-gray-900/50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-orange-400" /> Live Pipeline Steps
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ScrollArea className="max-h-[400px] overflow-y-auto">
                    {sseEvents.map((evt: any, i: number) => {
                      const isStart = evt.type === "step_start" || evt.type === "phase_start";
                      const isComplete = evt.type === "step_complete" || evt.type === "phase_complete";
                      const isError = evt.type === "step_error";
                      const isRetry = evt.type === "retry";
                      const isTarget = evt.type === "target_start" || evt.type === "target_complete" || evt.type === "target_error";
                      const isAI = evt.type === "ai_analysis" || evt.type === "ai_adaptation" || evt.type === "ai_probability" || evt.type === "ai_commander";
                      const isPreScreen = evt.step === "pre_screening";
                      const isStealth = evt.step?.startsWith("stealth");
                      const isAltUpload = evt.step?.startsWith("alt_");
                      const isEnhancedUpload = evt.step?.startsWith("enhanced_");
                      
                      // Enhanced Parallel Upload events get special rendering
                      if (isEnhancedUpload) {
                        const isSuccess = evt.status === "done";
                        const isRunning = evt.status === "running";
                        return (
                          <div key={i} className={`p-3 rounded-lg border ${
                            isSuccess ? "bg-gradient-to-r from-green-950/30 to-emerald-950/20 border-green-500/30" :
                            "bg-gradient-to-r from-violet-950/30 to-orange-950/20 border-violet-500/30"
                          }`}>
                            <div className="flex items-start gap-2">
                              <div className="shrink-0 mt-0.5">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                  isSuccess ? "bg-green-500/20" : isRunning ? "bg-violet-500/20" : "bg-orange-500/20"
                                }`}>
                                  <span className="text-xs">{isSuccess ? "✅" : isRunning ? "🚀" : "⚠️"}</span>
                                </div>
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="shrink-0 text-[10px] text-violet-400 border-violet-500/30">
                                    Enhanced Engine
                                  </Badge>
                                  {evt.data?.wafBypassed && (
                                    <Badge variant="outline" className="shrink-0 text-[10px] text-orange-400 border-orange-500/30">
                                      WAF Bypassed
                                    </Badge>
                                  )}
                                  {evt.data?.rounds && (
                                    <Badge variant="outline" className="shrink-0 text-[10px] text-cyan-400 border-cyan-500/30">
                                      {evt.data.rounds} rounds
                                    </Badge>
                                  )}
                                  {evt.data?.totalAttempts && (
                                    <Badge variant="outline" className="shrink-0 text-[10px] text-gray-400 border-gray-500/30">
                                      {evt.data.totalAttempts} attempts
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-300 mt-1 break-words">{evt.detail}</p>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // AI Events get special rendering
                      if (isAI) {
                        return (
                          <div key={i} className="p-3 rounded-lg border bg-gradient-to-r from-violet-950/30 to-cyan-950/20 border-violet-500/30">
                            <div className="flex items-start gap-2">
                              <div className="shrink-0 mt-0.5">
                                {evt.type === "ai_probability" ? (
                                  <div className="relative w-8 h-8">
                                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                                      <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-gray-700" strokeWidth="3" />
                                      <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor"
                                        className={evt.probability >= 70 ? "text-green-400" : evt.probability >= 40 ? "text-yellow-400" : "text-red-400"}
                                        strokeWidth="3" strokeDasharray={`${(evt.probability / 100) * 88} 88`} strokeLinecap="round" />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">{evt.probability}%</span>
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center">
                                    <span className="text-xs">\ud83e\udd16</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-violet-300 text-xs shrink-0">
                                     {evt.type === "ai_analysis" ? "AI วิเคราะห์" : evt.type === "ai_adaptation" ? "AI ปรับกลยุทธ์" : evt.type === "ai_commander" ? "AI Commander" : "AI ประเมินผล"}
                                  </span>
                                  {evt.step && <Badge variant="outline" className="text-[9px] text-cyan-400 border-cyan-500/30 shrink-0">{evt.step}</Badge>}
                                  {evt.probability && evt.type !== "ai_probability" && (
                                    <Badge variant="outline" className={`text-[9px] shrink-0 ${
                                      evt.probability >= 70 ? "text-green-400 border-green-500/30" :
                                      evt.probability >= 40 ? "text-yellow-400 border-yellow-500/30" :
                                      "text-red-400 border-red-500/30"
                                    }`}>{evt.probability}% success</Badge>
                                  )}
                                </div>
                                {evt.detail && !evt.aiAnalysis && <p className="text-violet-200/70 mt-1 text-xs break-all">{evt.detail}</p>}
                                {evt.aiAnalysis && (
                                  <div className="mt-2 space-y-1">
                                    {evt.aiAnalysis.approach && (
                                      <div className="flex items-start gap-1">
                                        <span className="text-[10px] text-gray-500 shrink-0">แนวทาง:</span>
                                        <span className="text-[10px] text-cyan-300 break-words">{evt.aiAnalysis.approach}</span>
                                      </div>
                                    )}
                                    {evt.aiAnalysis.riskLevel && (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-500">ความเสี่ยง:</span>
                                        <Badge variant="outline" className={`text-[9px] ${
                                          evt.aiAnalysis.riskLevel === "low" ? "text-green-400 border-green-500/30" :
                                          evt.aiAnalysis.riskLevel === "medium" ? "text-yellow-400 border-yellow-500/30" :
                                          "text-red-400 border-red-500/30"
                                        }`}>{evt.aiAnalysis.riskLevel}</Badge>
                                      </div>
                                    )}
                                    {evt.aiAnalysis.evasionTechniques && evt.aiAnalysis.evasionTechniques.length > 0 && (
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="text-[10px] text-gray-500">เทคนิคหลบ:</span>
                                        {evt.aiAnalysis.evasionTechniques.slice(0, 4).map((t: string, j: number) => (
                                          <Badge key={j} variant="outline" className="text-[9px] text-purple-300 border-purple-500/20">{t}</Badge>
                                        ))}
                                      </div>
                                    )}
                                    {evt.aiAnalysis.warnings && evt.aiAnalysis.warnings.length > 0 && (
                                      <div className="mt-1">
                                        {evt.aiAnalysis.warnings.map((w: string, j: number) => (
                                          <p key={j} className="text-[10px] text-yellow-400/70">\u26a0\ufe0f {w}</p>
                                        ))}
                                      </div>
                                    )}
                                    {evt.aiAnalysis.recommendation && (
                                      <p className="text-[10px] text-cyan-300/80 mt-1">\ud83d\udca1 {evt.aiAnalysis.recommendation}</p>
                                    )}
                                    {evt.aiAnalysis.summary && (
                                      <p className="text-[10px] text-violet-300/80 mt-1">\ud83d\udcca {evt.aiAnalysis.summary}</p>
                                    )}
                                    {evt.aiAnalysis.lessonsLearned && evt.aiAnalysis.lessonsLearned.length > 0 && (
                                      <div className="mt-1">
                                        <span className="text-[10px] text-gray-500">บทเรียน:</span>
                                        {evt.aiAnalysis.lessonsLearned.map((l: string, j: number) => (
                                          <p key={j} className="text-[10px] text-gray-400 ml-2">\u2022 {l}</p>
                                        ))}
                                      </div>
                                    )}
                                    {/* Pre-screening data */}
                                    {evt.data?.methods && (
                                      <div className="mt-2 space-y-1">
                                        <span className="text-[10px] text-gray-500">วิธีอัปโหลด:</span>
                                        <div className="flex flex-wrap gap-1">
                                          {evt.data.methods.map((m: any, j: number) => (
                                            <Badge key={j} variant="outline" className={`text-[9px] ${
                                              m.probability >= 50 ? "text-green-400 border-green-500/30" :
                                              m.probability >= 20 ? "text-yellow-400 border-yellow-500/30" :
                                              "text-red-400 border-red-500/30"
                                            }`}>{m.method} {m.probability}%</Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {evt.data?.warnings && evt.data.warnings.length > 0 && (
                                      <div className="mt-1">
                                        {evt.data.warnings.map((w: string, j: number) => (
                                          <p key={j} className="text-[10px] text-yellow-400/70">\u26a0\ufe0f {w}</p>
                                        ))}
                                      </div>
                                    )}
                                    {evt.data?.recommendations && evt.data.recommendations.length > 0 && (
                                      <div className="mt-1">
                                        {evt.data.recommendations.slice(0, 3).map((r: string, j: number) => (
                                          <p key={j} className="text-[10px] text-cyan-300/70">\ud83d\udca1 {r}</p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${
                          isComplete ? "bg-green-950/10 border-green-500/20" :
                          isError ? "bg-red-950/10 border-red-500/20" :
                          isRetry ? "bg-yellow-950/10 border-yellow-500/20" :
                          isTarget ? "bg-blue-950/10 border-blue-500/20" :
                          isStart ? "bg-gray-800/50 border-gray-700/50" :
                          "bg-gray-900/30 border-gray-700/30"
                        }`}>
                          {isComplete ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" /> :
                           isError ? <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" /> :
                           isRetry ? <RotateCcw className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" /> :
                           isStart ? <Loader2 className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5 animate-spin" /> :
                           <Activity className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />}
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-white truncate max-w-[180px] sm:max-w-none">{evt.phaseName || evt.step || evt.type}</span>
                              {evt.attempt && <Badge variant="outline" className="text-[9px] text-yellow-400 border-yellow-500/30 shrink-0">retry #{evt.attempt}</Badge>}
                              {evt.errorType && <Badge variant="outline" className={`text-[9px] shrink-0 ${
                                evt.errorType === "timeout" ? "text-orange-400 border-orange-500/30" :
                                evt.errorType === "waf" ? "text-purple-400 border-purple-500/30" :
                                evt.errorType === "connection" ? "text-blue-400 border-blue-500/30" :
                                "text-red-400 border-red-500/30"
                              }`}>{evt.errorType}</Badge>}
                              {evt.duration && <Badge variant="outline" className="text-[9px] text-gray-500 shrink-0">{(evt.duration / 1000).toFixed(1)}s</Badge>}
                              {evt.progress !== undefined && <Badge variant="outline" className="text-[9px] text-blue-400 border-blue-500/30 shrink-0">{evt.progress}%</Badge>}
                            </div>
                            {evt.detail && <p className="text-gray-400 mt-0.5 break-words">{evt.detail}</p>}
                            {evt.message && <p className="text-gray-400 mt-0.5 break-words">{evt.message}</p>}
                          </div>
                        </div>
                      );
                    })}
                    {sseRunning && (
                      <div className="flex items-center gap-2 p-2 text-xs text-gray-500">
                        <Loader2 className="h-3 w-3 animate-spin" /> รอข้อมูลถัดไป...
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* SSE Error */}
              {sseError && (
                <Card className="border-red-500/30 bg-red-950/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-red-300">Pipeline Error</p>
                        <p className="text-xs text-red-400/70 mt-0.5">{sseError}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SSE Final Result */}
              {sseFinalResult && !sseRunning && (
                <Card className={`relative z-10 border-2 bg-gray-900 ${
                  sseFinalResult.summary?.redirectActive ? "border-green-500/40" : "border-red-500/40"
                }`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        sseFinalResult.summary?.redirectActive ? "bg-green-500/20 border border-green-500/30" : "bg-red-500/20 border border-red-500/30"
                      }`}>
                        {sseFinalResult.summary?.redirectActive
                          ? <Rocket className="h-6 w-6 text-green-400" />
                          : <XCircle className="h-6 w-6 text-red-400" />}
                      </div>
                      <div>
                        <h3 className={`text-lg font-bold ${
                          sseFinalResult.summary?.redirectActive ? "text-green-400" : "text-red-400"
                        }`}>
                          {sseFinalResult.summary?.redirectActive ? "DEPLOY SUCCESSFUL" : "DEPLOY INCOMPLETE"}
                        </h3>
                        <p className="text-xs text-gray-400">
                          {sseFinalResult.summary?.totalFilesDeployed || 0} files deployed • {sseFinalResult.summary?.successSteps || 0}/{sseFinalResult.summary?.totalSteps || 7} steps success
                          {sseFinalResult.summary?.totalRetries > 0 && ` • ${sseFinalResult.summary.totalRetries} retries`}
                        </p>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <Badge variant="outline" className={sseFinalResult.summary?.redirectActive ? "text-green-400 border-green-500/50 text-[10px]" : "text-red-400 border-red-500/50 text-[10px]"}>
                            Redirect: {sseFinalResult.summary?.redirectActive ? "ACTIVE" : "INACTIVE"}
                          </Badge>
                          {sseFinalResult.summary?.geoRedirectActive && (
                            <Badge variant="outline" className="text-cyan-400 border-cyan-500/50 text-[10px]">Geo Redirect: ACTIVE</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Download buttons */}
                    <div className="flex gap-2 flex-wrap mt-4 pt-3 border-t border-gray-800">
                      <Button variant="outline" size="sm" onClick={() => {
                        const blob = new Blob([JSON.stringify(sseFinalResult, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = "deploy-report.json"; a.click();
                      }} className="border-blue-500/50 text-blue-400 text-xs">
                        <FileJson className="h-3 w-3 mr-1" /> JSON
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(sseFinalResult, null, 2));
                        toast.success("คัดลอกแล้ว");
                      }} className="border-gray-600 text-gray-400 text-xs">
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Legacy tRPC Deploy Report */}
          {deployReport && (
            <>
              {/* Hero Banner */}
              <div className={`relative overflow-hidden rounded-xl border p-6 ${
                deployReport.summary.redirectActive
                  ? "border-green-500/30 bg-gradient-to-br from-green-950/40 via-black to-emerald-950/30"
                  : "border-red-500/30 bg-gradient-to-br from-red-950/40 via-black to-orange-950/30"
              }`}>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,197,94,0.08),transparent_60%)]" />
                <div className="relative flex items-center gap-4">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
                    deployReport.summary.redirectActive ? "bg-green-500/20 border border-green-500/30" : "bg-red-500/20 border border-red-500/30"
                  }`}>
                    {deployReport.summary.redirectActive
                      ? <Rocket className="h-8 w-8 text-green-400" />
                      : <XCircle className="h-8 w-8 text-red-400" />}
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${
                      deployReport.summary.redirectActive ? "text-green-400" : "text-red-400"
                    }`}>
                      {deployReport.summary.redirectActive ? "DEPLOY SUCCESSFUL" : "DEPLOY INCOMPLETE"}
                    </h2>
                    <p className="text-sm text-gray-400">
                      {deployReport.summary.totalFilesDeployed} files deployed in {(deployReport.summary.totalDuration / 1000).toFixed(1)}s
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className={deployReport.summary.redirectActive ? "text-green-400 border-green-500/50" : "text-red-400 border-red-500/50"}>
                        Redirect: {deployReport.summary.redirectActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                      <Badge variant="outline" className="text-gray-400">
                        {deployReport.summary.successSteps}/{deployReport.summary.totalSteps} steps
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Steps Success", value: deployReport.summary.successSteps, icon: CheckCircle2, color: "text-green-400" },
                  { label: "Steps Failed", value: deployReport.summary.failedSteps, icon: XCircle, color: "text-red-400" },
                  { label: "Files Deployed", value: deployReport.summary.totalFilesDeployed, icon: FileUp, color: "text-cyan-400" },
                  { label: "Duration", value: `${(deployReport.summary.totalDuration / 1000).toFixed(1)}s`, icon: Clock, color: "text-gray-400" },
                ].map((stat, i) => (
                  <Card key={i} className="border-gray-800 bg-gray-900/50">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500">{stat.label}</p>
                          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                        </div>
                        <stat.icon className={`h-5 w-5 ${stat.color} opacity-40`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* 7-Step Pipeline */}
              <Card className="border-gray-800 bg-gray-900/50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-orange-400" /> Deploy Pipeline — 8 Steps
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {deployReport.steps.map((step) => {
                    const si = STATUS_ICONS[step.status] || STATUS_ICONS.pending;
                    const StatusIcon = si.icon;
                    return (
                      <div key={step.step} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        step.status === "success" ? "bg-green-950/10 border-green-500/20" :
                        step.status === "failed" ? "bg-red-950/10 border-red-500/20" :
                        step.status === "skipped" ? "bg-gray-900/30 border-gray-700/30" :
                        "bg-gray-800/50 border-gray-700/50"
                      }`}>
                        <StatusIcon className={`h-5 w-5 mt-0.5 shrink-0 ${si.color} ${step.status === "running" ? "animate-spin" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white">{step.name}</span>
                            <Badge variant="outline" className={`text-[10px] ${si.color}`}>{step.status}</Badge>
                            {step.duration && (
                              <Badge variant="outline" className="text-[10px] text-gray-500">
                                {(step.duration / 1000).toFixed(1)}s
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{step.details}</p>
                          {step.artifacts && step.artifacts.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {step.artifacts.slice(0, 8).map((a, ai) => (
                                <Badge key={ai} variant="outline" className={`text-[9px] ${
                                  a.status === "deployed" ? "text-green-400 border-green-500/30" :
                                  a.status === "failed" ? "text-red-400 border-red-500/30" :
                                  "text-gray-500 border-gray-600/30"
                                }`}>
                                  {a.filename.slice(0, 25)}
                                </Badge>
                              ))}
                              {step.artifacts.length > 8 && (
                                <Badge variant="outline" className="text-[9px] text-gray-500">+{step.artifacts.length - 8} more</Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Shell Info */}
              {deployReport.shellInfo && (
                <Card className={`border-gray-800 bg-gray-900/50 ${
                  deployReport.shellInfo.active ? "border-green-500/20" : "border-red-500/20"
                }`}>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-purple-400" /> Shell Info
                      <Badge variant="outline" className={deployReport.shellInfo.active ? "text-green-400" : "text-red-400"}>
                        {deployReport.shellInfo.active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <p className="text-[10px] text-gray-500 uppercase">Shell URL</p>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs text-cyan-400 break-all">{deployReport.shellInfo.url}</code>
                          <button onClick={() => copyCode(deployReport.shellInfo!.url)} className="shrink-0">
                            <Copy className="h-3 w-3 text-gray-500 hover:text-white" />
                          </button>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <p className="text-[10px] text-gray-500 uppercase">Password</p>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs text-yellow-400">{deployReport.shellInfo.password}</code>
                          <button onClick={() => copyCode(deployReport.shellInfo!.password)} className="shrink-0">
                            <Copy className="h-3 w-3 text-gray-500 hover:text-white" />
                          </button>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <p className="text-[10px] text-gray-500 uppercase">Filename</p>
                        <code className="text-xs text-gray-300 mt-1 block">{deployReport.shellInfo.filename}</code>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <p className="text-[10px] text-gray-500 uppercase">Obfuscation</p>
                        <p className="text-xs text-purple-400 mt-1">{deployReport.shellInfo.obfuscationLayers} layers</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Deployed Files */}
              {deployReport.deployedFiles.length > 0 && (
                <Card className="border-gray-800 bg-gray-900/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-cyan-400" /> Deployed Files
                      <Badge variant="outline" className="text-xs">
                        {deployReport.deployedFiles.filter(f => f.status === "deployed").length}/{deployReport.deployedFiles.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-1">
                        {deployReport.deployedFiles.map((file, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded bg-gray-800/50 text-xs">
                            {file.status === "deployed"
                              ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                              : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                            <span className="text-gray-300">{file.filename}</span>
                            <Badge variant="outline" className={`text-[9px] ml-auto ${
                              file.type === "page" ? "text-blue-400" :
                              file.type === "redirect" ? "text-yellow-400" :
                              file.type === "htaccess" ? "text-orange-400" :
                              file.type === "sitemap" ? "text-green-400" :
                              "text-gray-500"
                            }`}>
                              {file.description}
                            </Badge>
                            {file.url && (
                              <button onClick={() => copyCode(file.url!)} className="shrink-0">
                                <Copy className="h-3 w-3 text-gray-500 hover:text-white" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Redirect Status */}
              <Card className="border-gray-800 bg-gray-900/50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-yellow-400" /> Redirect Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: ".htaccess 302", active: deployReport.redirectInfo.htaccessDeployed },
                      { label: "PHP 302", active: deployReport.redirectInfo.phpRedirectDeployed },
                      { label: "JS Obfuscated", active: deployReport.redirectInfo.jsRedirectDeployed },
                      { label: "Meta Refresh", active: deployReport.redirectInfo.metaRefreshDeployed },
                      { label: "Sitemap Poisoned", active: deployReport.redirectInfo.sitemapPoisoned },
                      { label: "Verified Working", active: deployReport.redirectInfo.verifiedWorking },
                    ].map((r, i) => (
                      <div key={i} className={`flex items-center gap-2 p-3 rounded-lg border ${
                        r.active ? "bg-green-950/10 border-green-500/20" : "bg-gray-900/30 border-gray-700/30"
                      }`}>
                        {r.active
                          ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                          : <XCircle className="h-4 w-4 text-red-400" />}
                        <span className={`text-xs ${r.active ? "text-green-300" : "text-gray-500"}`}>{r.label}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 p-3 rounded-lg border bg-blue-950/10 border-blue-500/20">
                      <LayoutGrid className="h-4 w-4 text-blue-400" />
                      <span className="text-xs text-blue-300">Doorway Pages: {deployReport.redirectInfo.doorwayPagesDeployed}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Report Download */}
              <Card className="border-gray-800 bg-gray-900/50">
                <CardContent className="pt-4">
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => downloadFile(deployReport.report, `deploy-report-${deployReport.id}.txt`)}
                      className="border-green-500/50 text-green-400">
                      <FileText className="h-4 w-4 mr-2" /> Download Report
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadFile(JSON.stringify(deployReport, null, 2), `deploy-report-${deployReport.id}.json`)}
                      className="border-blue-500/50 text-blue-400">
                      <FileJson className="h-4 w-4 mr-2" /> Download JSON
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copyCode(deployReport.report)}
                      className="border-gray-600 text-gray-400">
                      <Copy className="h-4 w-4 mr-2" /> Copy Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}
