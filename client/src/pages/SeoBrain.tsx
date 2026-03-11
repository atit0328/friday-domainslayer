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
  AlertTriangle, ChevronRight, BarChart3, Globe, Cpu,
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
      toast.info("🧠 Manual orchestrator tick triggered");
    },
  });

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-violet" />
            SEO Brain
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Autonomous AI Orchestrator — ทำให้เว็บติด SEO ภายใน 7 วัน
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => executeDay.mutate({ sprintId: sprint.id })}
                        disabled={executeDay.isPending}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run Day
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

      {/* How It Works */}
      <Card className="border-violet/20 bg-violet/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet" />
            How SEO Brain Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-center">
            {[
              { day: "Day 1", label: "Foundation", desc: "Analysis + Strategy", icon: Target },
              { day: "Day 2", label: "Content", desc: "AI Content + On-page", icon: FileText },
              { day: "Day 3", label: "PBN Links", desc: "Tier 1 PBN Build", icon: Link2 },
              { day: "Day 4", label: "External", desc: "Web 2.0 + Forums", icon: Globe },
              { day: "Day 5", label: "Tier 2", desc: "Link Amplification", icon: Zap },
              { day: "Day 6", label: "Social", desc: "Signals + Indexing", icon: TrendingUp },
              { day: "Day 7", label: "Optimize", desc: "Rank Check + Adapt", icon: BarChart3 },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-violet/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-violet" />
                  </div>
                  <p className="text-xs font-bold text-violet">{step.day}</p>
                  <p className="text-xs font-medium">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
