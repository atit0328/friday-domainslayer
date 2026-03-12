/**
 * SEO Brain — Autonomous SEO Orchestrator Dashboard
 * 
 * The central command center for Friday AI SEO's autonomous operations.
 * Shows active sprints, project status, and allows creating new 7-day sprints.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sparkles, Brain, Rocket, Activity, Link2, FileText, TrendingUp,
  Play, Pause, RotateCcw, Zap, Clock, Target, CheckCircle2, XCircle,
  AlertTriangle, ChevronRight, BarChart3, Globe, Cpu, PlayCircle,
  Trophy, Search, Share2, Layers, Settings2, Crown, RefreshCw, History,
} from "lucide-react";

export default function SeoBrain() {
  const { user } = useAuth();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [aggressiveness, setAggressiveness] = useState([7]);
  const [enablePbn, setEnablePbn] = useState(true);
  const [enableExternal, setEnableExternal] = useState(true);

  // Queries
  const { data: projects, isLoading: loadingProjects } = trpc.seoOrchestrator.listProjects.useQuery();
  const { data: activeSprints, isLoading: loadingSprints } = trpc.seoOrchestrator.listActive.useQuery();
  const { data: orchestratorStatus } = trpc.seoOrchestrator.getOrchestratorStatus.useQuery();

  // Mutations
  const createSprint = trpc.seoOrchestrator.createSprint.useMutation({
    onSuccess: (data) => {
      toast.success(`🚀 7-day sprint started for ${data.domain}`);
      setShowCreateDialog(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const toggleAutoRun = trpc.seoOrchestrator.toggleAutoRun.useMutation({
    onSuccess: (data) => {
      toast.success(data.autoRunEnabled ? "✅ Auto-Run Enabled" : "⏸ Auto-Run Disabled");
    },
  });

  const executeDay = trpc.seoOrchestrator.executeDay.useMutation({
    onSuccess: () => {
      toast.success("✅ Sprint day tasks completed");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const pauseSprint = trpc.seoOrchestrator.pause.useMutation();
  const resumeSprint = trpc.seoOrchestrator.resume.useMutation();
  const triggerTick = trpc.seoOrchestrator.triggerTick.useMutation({
    onSuccess: () => {
      toast.info("\ud83e\udde0 Manual orchestrator tick triggered");
    },
  });

  const sendDailyReport = trpc.seoOrchestrator.sendDailyReport.useMutation({
    onSuccess: () => {
      toast.success("\ud83d\udce8 Daily report sent to Telegram");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const sendDigest = trpc.seoOrchestrator.sendDigest.useMutation({
    onSuccess: (data) => {
      toast.success(`\ud83d\udce8 Sprint digest sent (${data.sent} sprints)`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const toggleAutoRenew = trpc.seoOrchestrator.toggleAutoRenew.useMutation({
    onSuccess: (data) => {
      toast.success(data.autoRenewEnabled ? "\ud83d\udd04 Auto-Renew Enabled" : "\u23f8 Auto-Renew Disabled");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Start All Sprints — create sprint for all projects without active sprint
  const [startingAll, setStartingAll] = useState(false);
  const projectsWithoutSprint = useMemo(
    () => projects?.filter(p => !p.activeSprint) || [],
    [projects]
  );

  const handleStartAllSprints = async () => {
    if (projectsWithoutSprint.length === 0) {
      toast.info("All projects already have active sprints");
      return;
    }
    setStartingAll(true);
    let success = 0;
    let failed = 0;
    for (const project of projectsWithoutSprint) {
      try {
        await createSprint.mutateAsync({
          projectId: project.id,
          aggressiveness: 7,
          enablePbn: true,
          enableExternalBl: true,
        });
        success++;
      } catch {
        failed++;
      }
    }
    setStartingAll(false);
    toast.success(`\ud83d\ude80 Started ${success} sprints${failed > 0 ? `, ${failed} failed` : ""}`);
  };

  const handleCreateSprint = () => {
    if (!selectedProject) return;
    createSprint.mutate({
      projectId: selectedProject,
      aggressiveness: aggressiveness[0],
      enablePbn,
      enableExternalBl: enableExternal,
    });
  };

  // Stats
  const totalActiveSprints = activeSprints?.length || 0;
  const totalProjects = projects?.length || 0;
  const autoRunProjects = projects?.filter(p => p.autoRunEnabled)?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet to-purple-600 flex items-center justify-center">
              <Crown className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                7-Day Page 1 Sprint
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                เป้าหมาย: <span className="text-violet font-semibold">ติดอันดับหน้าแรก Google ภายใน 7 วัน</span>
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {projectsWithoutSprint.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="border-emerald text-emerald hover:bg-emerald/10"
              onClick={handleStartAllSprints}
              disabled={startingAll}
            >
              <PlayCircle className="w-4 h-4 mr-1" />
              {startingAll ? "Starting..." : `Start All (${projectsWithoutSprint.length})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendDigest.mutate()}
            disabled={sendDigest.isPending}
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            {sendDigest.isPending ? "Sending..." : "Send Digest"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerTick.mutate()}
            disabled={triggerTick.isPending}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Manual Tick
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-violet hover:bg-violet/90">
                <Rocket className="w-4 h-4 mr-1" />
                New 7-Day Sprint
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>🚀 Create 7-Day SEO Sprint</DialogTitle>
                <DialogDescription>
                  AI จะวิเคราะห์โดเมน วางแผน และทำ SEO อัตโนมัติ 7 วัน
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Select Project</label>
                  <Select onValueChange={(v) => setSelectedProject(Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="เลือก SEO Project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.domain} ({p.keywordCount} keywords)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Aggressiveness: {aggressiveness[0]}/10
                  </label>
                  <Slider
                    value={aggressiveness}
                    onValueChange={setAggressiveness}
                    min={1}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Conservative</span>
                    <span>Maximum Speed</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">PBN Backlinks</label>
                  <Switch checked={enablePbn} onCheckedChange={setEnablePbn} />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">External Backlinks</label>
                  <Switch checked={enableExternal} onCheckedChange={setEnableExternal} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateSprint}
                  disabled={!selectedProject || createSprint.isPending}
                  className="bg-violet hover:bg-violet/90"
                >
                  {createSprint.isPending ? "Creating..." : "Start Sprint"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-violet/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-violet" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalActiveSprints}</p>
                <p className="text-xs text-muted-foreground">Active Sprints</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-emerald" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalProjects}</p>
                <p className="text-xs text-muted-foreground">SEO Projects</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-cyan-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{autoRunProjects}</p>
                <p className="text-xs text-muted-foreground">Auto-Run</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {orchestratorStatus?.isRunning ? "ON" : "OFF"}
                </p>
                <p className="text-xs text-muted-foreground">Orchestrator</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Sprints */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-violet" />
          Active Sprints
        </h2>
        {loadingSprints ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : totalActiveSprints === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Sparkles className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No active sprints</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create a new 7-day sprint to start autonomous SEO
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {activeSprints?.map(sprint => (
              <Card key={sprint.id} className="border-violet/20 hover:border-violet/40 transition-colors">
                <CardContent className="pt-4 pb-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-violet/10 flex items-center justify-center">
                        <Brain className="w-6 h-6 text-violet" />
                      </div>
                      <div>
                        <p className="font-semibold">{sprint.domain}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={sprint.status === "active" ? "default" : "secondary"} className="text-xs">
                            {sprint.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Day {sprint.currentDay}/7
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-violet">{sprint.overallProgress}%</p>
                        <p className="text-[10px] text-muted-foreground">Progress</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-emerald">{sprint.totalPbnLinks}</p>
                        <p className="text-[10px] text-muted-foreground">PBN</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-cyan-400">{sprint.totalExternalLinks}</p>
                        <p className="text-[10px] text-muted-foreground">External</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-amber-400">#{sprint.bestRankAchieved}</p>
                        <p className="text-[10px] text-muted-foreground">Best Rank</p>
                      </div>
                      {sprint.sprintRound > 1 && (
                        <div className="text-center">
                          <p className="font-bold text-orange-400">R{sprint.sprintRound}</p>
                          <p className="text-[10px] text-muted-foreground">Round</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => executeDay.mutate({ sprintId: sprint.id })}
                        disabled={executeDay.isPending}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run Day
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendDailyReport.mutate({ sprintId: sprint.id })}
                        disabled={sendDailyReport.isPending}
                      >
                        <BarChart3 className="w-3 h-3 mr-1" />
                        Report
                      </Button>
                      <Button
                        variant={sprint.autoRenewEnabled ? "default" : "outline"}
                        size="sm"
                        className={sprint.autoRenewEnabled ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
                        onClick={() => toggleAutoRenew.mutate({ sprintId: sprint.id, enabled: !sprint.autoRenewEnabled })}
                        disabled={toggleAutoRenew.isPending}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        {sprint.autoRenewEnabled ? "Auto-Renew ON" : "Auto-Renew OFF"}
                      </Button>
                      {sprint.status === "active" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => pauseSprint.mutate({ sprintId: sprint.id })}
                        >
                          <Pause className="w-3 h-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resumeSprint.mutate({ sprintId: sprint.id })}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-violet h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${sprint.overallProgress}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Projects Overview */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Globe className="w-5 h-5 text-emerald" />
          SEO Projects
        </h2>
        {loadingProjects ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <div className="grid gap-3">
            {projects?.map(project => (
              <Card key={project.id} className="hover:border-foreground/20 transition-colors">
                <CardContent className="py-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${project.autoRunEnabled ? "bg-emerald animate-pulse" : "bg-muted-foreground/30"}`} />
                      <div>
                        <p className="font-medium text-sm">{project.domain}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{project.niche}</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">{project.keywordCount} keywords</span>
                          {project.activeSprint && (
                            <>
                              <span className="text-xs text-muted-foreground">•</span>
                              <Badge variant="outline" className="text-[10px] text-violet border-violet/30">
                                Sprint Day {project.activeSprint.currentDay}/7
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Auto-Run</span>
                        <Switch
                          checked={project.autoRunEnabled}
                          onCheckedChange={(checked) => {
                            toggleAutoRun.mutate({ projectId: project.id, enabled: checked });
                          }}
                        />
                      </div>
                      {!project.activeSprint && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedProject(project.id);
                            setShowCreateDialog(true);
                          }}
                        >
                          <Rocket className="w-3 h-3 mr-1" />
                          Sprint
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 7-Day Page 1 Sprint Plan */}
      <Card className="border-violet/20 bg-gradient-to-br from-violet/5 to-purple-600/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                แผนโจมตี 7 วัน — ติดหน้าแรก Google
              </CardTitle>
              <CardDescription className="mt-1">
                AI วางแผนและดำเนินการทุกขั้นตอนอัตโนมัติ เป้าหมาย: Top 10 ทุก keyword
              </CardDescription>
            </div>
            <Badge className="bg-violet/20 text-violet border-violet/30 text-xs">
              Fully Autonomous
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-center">
            {[
              {
                day: "Day 1", label: "วิเคราะห์", icon: Search,
                goal: "หาจุดอ่อน + วางแผนโจมตี",
                kpi: "Audit 100%",
                tasks: ["Domain Analysis", "Competitor Gap", "Keyword Map", "Strategy Plan"],
                color: "text-blue-400", bg: "bg-blue-500/10",
              },
              {
                day: "Day 2", label: "Content", icon: FileText,
                goal: "สร้าง SEO Content ทุก keyword",
                kpi: "10-30 บทความ",
                tasks: ["AI Content Gen", "On-Page SEO", "Schema Markup", "Internal Links"],
                color: "text-emerald", bg: "bg-emerald/10",
              },
              {
                day: "Day 3", label: "PBN Tier 1", icon: Link2,
                goal: "สร้าง Backlink จาก PBN",
                kpi: "20-50 PBN Links",
                tasks: ["Select Best PBN", "Generate Articles", "Post + Verify", "Anchor Diversity"],
                color: "text-violet", bg: "bg-violet/10",
              },
              {
                day: "Day 4", label: "External BL", icon: Globe,
                goal: "Backlink จากแหล่งภายนอก",
                kpi: "30-80 Links",
                tasks: ["Web 2.0", "Forums", "Guest Posts", "Directories"],
                color: "text-cyan-400", bg: "bg-cyan-500/10",
              },
              {
                day: "Day 5", label: "Tier 2", icon: Layers,
                goal: "เสริมพลัง Tier 1 Links",
                kpi: "50-100 T2 Links",
                tasks: ["Tier 2 Build", "Link Amplify", "Index Boost", "Drip Feed"],
                color: "text-orange-400", bg: "bg-orange-500/10",
              },
              {
                day: "Day 6", label: "Social", icon: Share2,
                goal: "Social Signals + Force Index",
                kpi: "100+ Signals",
                tasks: ["Social Shares", "Bookmarks", "Force Index", "CTR Boost"],
                color: "text-pink-400", bg: "bg-pink-500/10",
              },
              {
                day: "Day 7", label: "ตรวจผล", icon: Trophy,
                goal: "เช็คอันดับ + ปรับกลยุทธ์",
                kpi: "Target: Top 10",
                tasks: ["Rank Check", "Gap Analysis", "Strategy Adjust", "Final Report"],
                color: "text-amber-400", bg: "bg-amber-500/10",
              },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`w-11 h-11 rounded-full ${step.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${step.color}`} />
                  </div>
                  <p className={`text-xs font-bold ${step.color}`}>{step.day}</p>
                  <p className="text-xs font-semibold">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{step.goal}</p>
                  <Badge variant="outline" className={`text-[9px] ${step.color} border-current/30 mt-0.5`}>
                    {step.kpi}
                  </Badge>
                  <div className="mt-1 space-y-0.5 hidden md:block">
                    {step.tasks.map((t, j) => (
                      <p key={j} className="text-[9px] text-muted-foreground/70">• {t}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Bottom target banner */}
          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-violet/10 via-purple-600/10 to-amber-500/10 border border-violet/20 flex flex-col md:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-violet" />
              <span className="text-sm font-medium">เป้าหมายสุดท้าย:</span>
              <span className="text-sm font-bold text-violet">ทุก keyword ติด Top 10 Google</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>ถ้ายังไม่ถึงเป้า →</span>
              <Badge className="bg-violet/20 text-violet border-violet/30 text-[10px]">
                Auto-Renew Sprint รอบ 2
              </Badge>
            </div>
          </div>

          {/* Auto-Renew Explanation */}
          <div className="mt-3 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
            <div className="flex items-start gap-2">
              <RefreshCw className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-orange-400">Auto-Renew Sprint System</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                  หลัง Day 7 ระบบจะตรวจ ranking อัตโนมัติ — ถ้ายังไม่ติด Top 10 จะเริ่ม Sprint รอบใหม่ทันที
                  โดยเพิ่ม aggressiveness +1 และเพิ่มจำนวน backlinks +30% ต่อรอบ (สูงสุด 5 รอบ)
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-400/30">
                    Max 5 Rounds
                  </Badge>
                  <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-400/30">
                    +1 Aggressiveness/Round
                  </Badge>
                  <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-400/30">
                    +30% Links/Round
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
