/**
 * Design: Obsidian Intelligence — SEO Campaigns (Redesigned v2)
 * Card-based UI with expanded detail view, visual phase timeline, and stats
 */
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Rocket, Plus, Play, Pause, Trash2, Loader2, Zap, ChevronDown, ChevronUp,
  Globe, Target, Search, BarChart3, FileText, Link2, Settings, Activity,
  CheckCircle2, Clock, AlertTriangle, XCircle, TrendingUp, Sparkles
} from "lucide-react";
import { Streamdown } from "streamdown";

const PHASES = [
  { name: "Technical Audit", icon: Settings, color: "text-blue-400" },
  { name: "Keyword Research", icon: Search, color: "text-violet-400" },
  { name: "On-Page Optimization", icon: FileText, color: "text-cyan-400" },
  { name: "Content Strategy", icon: Sparkles, color: "text-fuchsia-400" },
  { name: "Link Building Plan", icon: Link2, color: "text-orange-400" },
  { name: "Local SEO Setup", icon: Globe, color: "text-emerald-400" },
  { name: "Schema Markup", icon: FileText, color: "text-yellow-400" },
  { name: "Core Web Vitals", icon: Activity, color: "text-rose-400" },
  { name: "Content Creation", icon: Sparkles, color: "text-indigo-400" },
  { name: "Internal Linking", icon: Link2, color: "text-teal-400" },
  { name: "Off-Page SEO", icon: TrendingUp, color: "text-pink-400" },
  { name: "Social Signals", icon: Globe, color: "text-sky-400" },
  { name: "Monitoring Setup", icon: BarChart3, color: "text-lime-400" },
  { name: "Competitor Analysis", icon: Target, color: "text-amber-400" },
  { name: "Performance Review", icon: BarChart3, color: "text-purple-400" },
  { name: "Final Report", icon: FileText, color: "text-emerald-400" },
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; icon: typeof CheckCircle2; label: string }> = {
  RUNNING: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", icon: Activity, label: "Running" },
  PAUSED: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", icon: Pause, label: "Paused" },
  COMPLETED: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30", icon: CheckCircle2, label: "Completed" },
  PENDING: { bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/30", icon: Clock, label: "Pending" },
  FAILED: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30", icon: XCircle, label: "Failed" },
};

export default function Campaigns() {
  const [newCampaign, setNewCampaign] = useState({ domain: "", niche: "", keywords: "", aggressiveness: 7 });
  const [phaseResult, setPhaseResult] = useState<{ campaignId: number; result: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: campaigns = [], isLoading } = trpc.campaigns.list.useQuery();

  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campaign created!");
      setNewCampaign({ domain: "", niche: "", keywords: "", aggressiveness: 7 });
      setDialogOpen(false);
      utils.campaigns.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const runPhaseMutation = trpc.campaigns.runPhase.useMutation({
    onSuccess: (data: any, variables) => {
      toast.success(`Phase completed: ${data.phase}`);
      setPhaseResult({ campaignId: variables.id, result: data.result });
      setExpandedId(variables.id);
      utils.campaigns.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = trpc.campaigns.toggleStatus.useMutation({
    onSuccess: () => utils.campaigns.list.invalidate(),
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      toast.success("Campaign deleted");
      utils.campaigns.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Stats
  const stats = useMemo(() => {
    const total = campaigns.length;
    const running = campaigns.filter((c: any) => c.status === "RUNNING").length;
    const completed = campaigns.filter((c: any) => c.status === "COMPLETED").length;
    const avgProgress = total > 0 ? Math.round(campaigns.reduce((s: number, c: any) => s + (c.progress || 0), 0) / total) : 0;
    return { total, running, completed, avgProgress };
  }, [campaigns]);

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">SEO Campaigns</h1>
            <Badge variant="outline" className="font-mono text-[10px] border-violet-500/30 text-violet-400">16-Phase AI</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-10">Automated SEO campaigns powered by AI — each phase runs sequentially</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 shadow-lg shadow-violet-500/20">
              <Plus className="w-4 h-4 mr-1" /> New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-gray-800">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-violet-400" />
                สร้าง Campaign ใหม่
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Target Domain</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input placeholder="example.com" value={newCampaign.domain}
                    onChange={e => setNewCampaign(p => ({ ...p, domain: e.target.value }))}
                    className="pl-10 bg-gray-800/50 border-gray-700 font-mono" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Niche / Industry</label>
                <div className="relative">
                  <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input placeholder="e-commerce, tech blog, crypto" value={newCampaign.niche}
                    onChange={e => setNewCampaign(p => ({ ...p, niche: e.target.value }))}
                    className="pl-10 bg-gray-800/50 border-gray-700" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Keywords (comma separated)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input placeholder="seo, backlinks, keyword research" value={newCampaign.keywords}
                    onChange={e => setNewCampaign(p => ({ ...p, keywords: e.target.value }))}
                    className="pl-10 bg-gray-800/50 border-gray-700" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-400">Aggressiveness</label>
                  <span className="text-xs font-mono text-violet-400">{newCampaign.aggressiveness}/10</span>
                </div>
                <input type="range" min={1} max={10} value={newCampaign.aggressiveness}
                  onChange={e => setNewCampaign(p => ({ ...p, aggressiveness: parseInt(e.target.value) }))}
                  className="w-full accent-violet-500" />
                <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                  <span>Conservative</span><span>Balanced</span><span>Aggressive</span>
                </div>
              </div>
              <Button onClick={() => createMutation.mutate({
                domain: newCampaign.domain,
                niche: newCampaign.niche,
                keywords: newCampaign.keywords || undefined,
                aggressiveness: newCampaign.aggressiveness,
              })} disabled={createMutation.isPending || !newCampaign.domain || !newCampaign.niche}
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
                Launch Campaign
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-gray-800/30 border border-gray-700/50 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total</p>
          <p className="text-2xl font-bold font-mono text-gray-200">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
          <p className="text-[10px] text-emerald-500 uppercase tracking-wider">Running</p>
          <p className="text-2xl font-bold font-mono text-emerald-400">{stats.running}</p>
        </div>
        <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3">
          <p className="text-[10px] text-cyan-500 uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-bold font-mono text-cyan-400">{stats.completed}</p>
        </div>
        <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-3">
          <p className="text-[10px] text-violet-500 uppercase tracking-wider">Avg Progress</p>
          <p className="text-2xl font-bold font-mono text-violet-400">{stats.avgProgress}%</p>
        </div>
      </div>

      {/* Campaign Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-8 h-8 text-violet-400 opacity-50" />
          </div>
          <p className="text-sm text-muted-foreground">ยังไม่มี Campaign — สร้างใหม่เลย!</p>
          <Button size="sm" className="mt-3 bg-violet-600 text-white hover:bg-violet-700" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Create First Campaign
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map((c: any) => {
            const status = STATUS_CONFIG[c.status] || STATUS_CONFIG.PENDING;
            const StatusIcon = status.icon;
            const isExpanded = expandedId === c.id;
            const currentPhaseIdx = (c.currentPhase || 1) - 1;
            const progressPct = c.progress || Math.round(((c.currentPhase || 0) / 16) * 100);

            return (
              <Card key={c.id} className={`border transition-all duration-300 ${isExpanded ? "lg:col-span-2 border-violet-500/30 bg-gray-900/80" : "border-gray-800 bg-gray-900/50 hover:border-gray-700"}`}>
                <CardContent className="p-0">
                  {/* Card Header */}
                  <div className="p-4 flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-11 h-11 rounded-xl ${status.bg} border ${status.border} flex items-center justify-center shrink-0`}>
                        <StatusIcon className={`w-5 h-5 ${status.text}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate">{c.domain}</h3>
                          <Badge className={`text-[10px] ${status.bg} ${status.text} border ${status.border}`}>{status.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Target className="w-3 h-3" />{c.niche}</span>
                          <span className="font-mono">Phase {c.currentPhase || 0}/{c.totalPhases || 16}</span>
                          <span className="font-mono">{progressPct}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.status !== "COMPLETED" && c.status !== "FAILED" && (
                        <Button size="sm" variant="ghost" className="h-8 text-xs gap-1"
                          disabled={runPhaseMutation.isPending}
                          onClick={() => runPhaseMutation.mutate({ id: c.id })}>
                          {runPhaseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-violet-400" />}
                          <span className="hidden sm:inline">Run Phase</span>
                        </Button>
                      )}
                      {c.status === "RUNNING" && (
                        <Button size="icon" variant="ghost" className="h-8 w-8"
                          onClick={() => toggleMutation.mutate({ id: c.id, action: "pause" })}>
                          <Pause className="w-4 h-4 text-amber-400" />
                        </Button>
                      )}
                      {c.status === "PAUSED" && (
                        <Button size="icon" variant="ghost" className="h-8 w-8"
                          onClick={() => toggleMutation.mutate({ id: c.id, action: "resume" })}>
                          <Play className="w-4 h-4 text-emerald-400" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8"
                        onClick={() => deleteMutation.mutate({ id: c.id })}>
                        <Trash2 className="w-4 h-4 text-destructive/70 hover:text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="px-4 pb-3">
                    <Progress value={progressPct} className="h-1.5" />
                  </div>

                  {/* Expand/Collapse Toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="w-full px-4 py-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-gray-300 border-t border-gray-800/50 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {isExpanded ? "Collapse" : "View Phase Timeline"}
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-800/50 p-4 space-y-4">
                      {/* Phase Timeline */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-400 mb-3">Phase Timeline</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {PHASES.map((phase, i) => {
                            const PhaseIcon = phase.icon;
                            const isDone = i < currentPhaseIdx;
                            const isCurrent = i === currentPhaseIdx;
                            const isFuture = i > currentPhaseIdx;
                            return (
                              <div key={i} className={`p-2 rounded-lg border transition-all ${
                                isDone ? "bg-emerald-500/5 border-emerald-500/20" :
                                isCurrent ? "bg-violet-500/10 border-violet-500/30 ring-1 ring-violet-500/20" :
                                "bg-gray-800/20 border-gray-800/50"
                              }`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className={`text-[10px] font-mono ${isDone ? "text-emerald-400" : isCurrent ? "text-violet-400" : "text-gray-600"}`}>
                                    {String(i + 1).padStart(2, "0")}
                                  </span>
                                  {isDone ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  ) : isCurrent ? (
                                    <div className="w-3 h-3 rounded-full bg-violet-500 animate-pulse" />
                                  ) : (
                                    <PhaseIcon className="w-3 h-3 text-gray-600" />
                                  )}
                                </div>
                                <p className={`text-[10px] leading-tight ${isDone ? "text-emerald-300" : isCurrent ? "text-violet-300 font-medium" : "text-gray-600"}`}>
                                  {phase.name}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Campaign Info */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-gray-800/30 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-500">Aggressiveness</p>
                          <p className="text-sm font-bold font-mono text-orange-400">{c.aggressiveness || 7}/10</p>
                        </div>
                        <div className="bg-gray-800/30 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-500">Keywords</p>
                          <p className="text-sm font-bold font-mono text-violet-400">{c.keywords ? c.keywords.split(",").length : 0}</p>
                        </div>
                        <div className="bg-gray-800/30 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-500">Created</p>
                          <p className="text-[11px] font-mono text-gray-300">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}</p>
                        </div>
                        <div className="bg-gray-800/30 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-500">Last Updated</p>
                          <p className="text-[11px] font-mono text-gray-300">{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : "—"}</p>
                        </div>
                      </div>

                      {/* Phase Result */}
                      {phaseResult && phaseResult.campaignId === c.id && (
                        <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                          <p className="text-xs font-semibold text-violet-400 mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" /> Latest Phase Result
                          </p>
                          <div className="prose prose-sm prose-invert max-w-none text-xs [&_code]:text-violet-400 [&_code]:bg-violet-500/10 [&_code]:px-1 [&_code]:rounded">
                            <Streamdown>{phaseResult.result}</Streamdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
