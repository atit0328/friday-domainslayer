/**
 * ═══════════════════════════════════════════════════════════════
 *  SUBSYSTEM DETAIL SHEET
 *
 *  Slide-out panel showing in-depth details for each AI subsystem.
 *  Opened by clicking a subsystem card in the AI Command Center.
 * ═══════════════════════════════════════════════════════════════
 */
import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Globe,
  Network,
  BarChart3,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Link2,
  Crosshair,
  Radar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Activity,
  Zap,
  AlertTriangle,
} from "lucide-react";

type SubsystemKey = "seo" | "attack" | "pbn" | "discovery" | "rank" | "autobid";

interface SubsystemDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subsystem: SubsystemKey | null;
}

const SUBSYSTEM_CONFIG: Record<SubsystemKey, {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  seo: {
    title: "SEO Engine",
    description: "Content creation, backlink building, on-page optimization, and rank tracking",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  attack: {
    title: "Attack Engine",
    description: "Domain scanning, vulnerability assessment, deployment, and verification",
    icon: <Target className="h-5 w-5" />,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
  pbn: {
    title: "PBN Network",
    description: "Private Blog Network management, auto-posting, interlinking, and health monitoring",
    icon: <Network className="h-5 w-5" />,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  discovery: {
    title: "Discovery Engine",
    description: "Target discovery via Shodan/SerpAPI, vulnerability scoring, and pipeline management",
    icon: <Globe className="h-5 w-5" />,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
  },
  rank: {
    title: "Rank Tracking",
    description: "Keyword position monitoring, competitor analysis, and trend detection",
    icon: <BarChart3 className="h-5 w-5" />,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
  },
  autobid: {
    title: "Auto-Bid",
    description: "Marketplace scanning, automated bidding, budget management, and domain acquisition",
    icon: <Shield className="h-5 w-5" />,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
  },
};

export default function SubsystemDetailSheet({ open, onOpenChange, subsystem }: SubsystemDetailSheetProps) {
  const detailQuery = trpc.orchestrator.getSubsystemDetail.useQuery(
    { subsystem: subsystem! },
    { enabled: open && !!subsystem, refetchInterval: 15000 }
  );

  if (!subsystem) return null;

  const config = SUBSYSTEM_CONFIG[subsystem];
  const data = detailQuery.data;
  const isLoading = detailQuery.isLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl bg-zinc-950 border-zinc-800 p-0">
        {/* Header */}
        <SheetHeader className={`px-6 pt-6 pb-4 ${config.bgColor} border-b ${config.borderColor}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor} ${config.color}`}>
              {config.icon}
            </div>
            <div>
              <SheetTitle className={`text-lg font-bold ${config.color}`}>
                {config.title}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                {config.description}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="px-6 py-4 space-y-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : data ? (
              <>
                {/* Task Stats */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    AI Task Performance
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    <MiniStat label="Total" value={data.taskStats.total} color="text-white" />
                    <MiniStat label="Done" value={data.taskStats.completed} color="text-emerald-400" />
                    <MiniStat label="Failed" value={data.taskStats.failed} color="text-red-400" />
                    <MiniStat label="Today" value={data.taskStats.today} color="text-blue-400" />
                  </div>
                  {data.taskStats.total > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Success Rate</span>
                        <span className={data.taskStats.successRate >= 70 ? "text-emerald-400" : data.taskStats.successRate >= 40 ? "text-yellow-400" : "text-red-400"}>
                          {data.taskStats.successRate}%
                        </span>
                      </div>
                      <Progress value={data.taskStats.successRate} className="h-1.5" />
                    </div>
                  )}
                </section>

                <Separator className="bg-zinc-800" />

                {/* Subsystem-specific data */}
                <SubsystemSpecificView subsystem={subsystem} data={data.specificData} />

                <Separator className="bg-zinc-800" />

                {/* Recent AI Decisions */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Recent AI Decisions
                  </h3>
                  {data.recentDecisions.length === 0 ? (
                    <EmptyState text="No AI decisions for this subsystem yet" />
                  ) : (
                    <div className="space-y-2">
                      {data.recentDecisions.map((d: any) => (
                        <Card key={d.id} className="bg-zinc-900/50 border-zinc-800">
                          <CardContent className="py-2.5 px-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                    d.phase === "observe" ? "border-blue-500/30 text-blue-400" :
                                    d.phase === "orient" ? "border-yellow-500/30 text-yellow-400" :
                                    d.phase === "decide" ? "border-purple-500/30 text-purple-400" :
                                    "border-emerald-500/30 text-emerald-400"
                                  }`}>
                                    {d.phase}
                                  </Badge>
                                  {d.confidence > 0 && (
                                    <span className={`text-[10px] font-mono ${d.confidence >= 80 ? "text-emerald-400" : d.confidence >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                                      {d.confidence}%
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-medium text-white truncate">{d.decision}</p>
                                <p className="text-[10px] text-muted-foreground line-clamp-1">{d.reasoning}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {new Date(d.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </section>

                <Separator className="bg-zinc-800" />

                {/* Recent Tasks */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Recent Tasks
                  </h3>
                  {data.recentTasks.length === 0 ? (
                    <EmptyState text="No tasks have been created for this subsystem yet" />
                  ) : (
                    <div className="space-y-2">
                      {data.recentTasks.slice(0, 10).map((t: any) => (
                        <Card key={t.id} className="bg-zinc-900/50 border-zinc-800">
                          <CardContent className="py-2.5 px-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <TaskStatusIcon status={t.status} />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-white truncate">{t.title}</p>
                                  {t.targetDomain && (
                                    <p className="text-[10px] text-cyan-400">{t.targetDomain}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <PriorityDot priority={t.priority} />
                                <span className="text-[10px] text-muted-foreground block">
                                  {new Date(t.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <EmptyState text="Failed to load subsystem data" />
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Subsystem-specific views ───

function SubsystemSpecificView({ subsystem, data }: { subsystem: SubsystemKey; data: Record<string, any> }) {
  switch (subsystem) {
    case "seo":
      return <SeoDetail data={data} />;
    case "attack":
      return <AttackDetail data={data} />;
    case "pbn":
      return <PbnDetail data={data} />;
    case "discovery":
      return <DiscoveryDetail data={data} />;
    case "rank":
      return <RankDetail data={data} />;
    case "autobid":
      return <AutobidDetail data={data} />;
    default:
      return null;
  }
}

function SeoDetail({ data }: { data: Record<string, any> }) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        SEO Overview
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Projects" value={data.projects?.length || 0} color="text-emerald-400" icon={<Activity className="h-3 w-3" />} />
        <MiniStat label="Keywords" value={data.totalKeywords || 0} color="text-blue-400" icon={<BarChart3 className="h-3 w-3" />} />
        <MiniStat label="Improved" value={data.improvedKeywords || 0} color="text-emerald-400" icon={<ArrowUpRight className="h-3 w-3" />} />
        <MiniStat label="Backlinks" value={data.recentBacklinks?.length || 0} color="text-purple-400" icon={<Link2 className="h-3 w-3" />} />
      </div>

      {/* Projects */}
      {data.projects?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Active Projects</h4>
          <div className="space-y-1.5">
            {data.projects.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2">
                  <Globe className="h-3 w-3 text-emerald-400" />
                  <span className="text-xs text-white font-medium">{p.domain}</span>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Content */}
      {data.recentContent?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Recent Content</h4>
          <div className="space-y-1.5">
            {data.recentContent.slice(0, 5).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3 w-3 text-blue-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{c.title || "Untitled"}</span>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Actions */}
      {data.recentActions?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Recent SEO Actions</h4>
          <div className="space-y-1.5">
            {data.recentActions.slice(0, 5).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="h-3 w-3 text-yellow-400 flex-shrink-0" />
                  <span className="text-xs text-white">{a.type}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{a.domain}</span>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AttackDetail({ data }: { data: Record<string, any> }) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Attack Overview
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Total Deploys" value={data.totalDeploys || 0} color="text-red-400" icon={<Target className="h-3 w-3" />} />
        <MiniStat label="Successful" value={data.successDeploys || 0} color="text-emerald-400" icon={<CheckCircle2 className="h-3 w-3" />} />
        <MiniStat label="Success Rate" value={`${data.successRate || 0}%`} color={data.successRate >= 70 ? "text-emerald-400" : "text-yellow-400"} icon={<Activity className="h-3 w-3" />} />
        <MiniStat label="Pending Scans" value={data.pendingScans?.length || 0} color="text-blue-400" icon={<Radar className="h-3 w-3" />} />
      </div>

      {/* Recent Deploys */}
      {data.recentDeploys?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Recent Deployments</h4>
          <div className="space-y-1.5">
            {data.recentDeploys.slice(0, 8).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Crosshair className="h-3 w-3 text-red-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{d.domain}</span>
                  {d.method && <span className="text-[10px] text-muted-foreground">{d.method}</span>}
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attack History */}
      {data.recentAttackHistory?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">AI Attack History</h4>
          <div className="space-y-1.5">
            {data.recentAttackHistory.slice(0, 5).map((h: any) => (
              <div key={h.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Target className="h-3 w-3 text-orange-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{h.targetDomain}</span>
                  {h.method && <span className="text-[10px] text-muted-foreground">{h.method}</span>}
                </div>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${h.success ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}>
                  {h.success ? "Success" : "Failed"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PbnDetail({ data }: { data: Record<string, any> }) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        PBN Overview
      </h3>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Total Sites" value={data.totalSites || 0} color="text-blue-400" icon={<Network className="h-3 w-3" />} />
        <MiniStat label="Active" value={data.activeSites || 0} color="text-emerald-400" icon={<CheckCircle2 className="h-3 w-3" />} />
        <MiniStat label="Total Posts" value={data.totalPosts || 0} color="text-purple-400" icon={<FileText className="h-3 w-3" />} />
      </div>

      {/* Sites */}
      {data.sites?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">PBN Sites</h4>
          <div className="space-y-1.5">
            {data.sites.slice(0, 10).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="h-3 w-3 text-blue-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{s.domain || s.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.lastPost && (
                    <span className="text-[10px] text-muted-foreground">
                      Last: {new Date(s.lastPost).toLocaleDateString("th-TH")}
                    </span>
                  )}
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Posts */}
      {data.recentPosts?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Recent Posts</h4>
          <div className="space-y-1.5">
            {data.recentPosts.slice(0, 5).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3 w-3 text-purple-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{p.title || "Untitled"}</span>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DiscoveryDetail({ data }: { data: Record<string, any> }) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Discovery Overview
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Total Scanned" value={data.totalScanned || 0} color="text-cyan-400" icon={<Radar className="h-3 w-3" />} />
        <MiniStat label="High Score" value={data.highScoreTargets || 0} color="text-emerald-400" icon={<Target className="h-3 w-3" />} />
      </div>

      {/* Recent Scans */}
      {data.recentScans?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Recent Domain Scans</h4>
          <div className="space-y-1.5">
            {data.recentScans.slice(0, 10).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="h-3 w-3 text-cyan-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{s.domain}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.trustScore != null && (
                    <span className={`text-[10px] font-mono ${s.trustScore >= 70 ? "text-emerald-400" : s.trustScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                      {s.trustScore}
                    </span>
                  )}
                  {s.grade && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-zinc-700">
                      {s.grade}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Events */}
      {data.recentEvents?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Pipeline Events</h4>
          <div className="space-y-1.5">
            {data.recentEvents.slice(0, 5).map((e: any) => (
              <div key={e.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Activity className="h-3 w-3 text-cyan-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{e.message || e.type}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(e.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function RankDetail({ data }: { data: Record<string, any> }) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Rank Tracking Overview
      </h3>
      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="Tracked" value={data.totalTracked || 0} color="text-yellow-400" icon={<BarChart3 className="h-3 w-3" />} />
        <MiniStat label="Up" value={data.improved || 0} color="text-emerald-400" icon={<ArrowUpRight className="h-3 w-3" />} />
        <MiniStat label="Down" value={data.declined || 0} color="text-red-400" icon={<ArrowDownRight className="h-3 w-3" />} />
        <MiniStat label="Stable" value={data.unchanged || 0} color="text-zinc-400" icon={<Minus className="h-3 w-3" />} />
      </div>

      {/* Recent Rankings */}
      {data.recentRankings?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Recent Rank Changes</h4>
          <div className="space-y-1.5">
            {data.recentRankings.slice(0, 12).map((r: any) => {
              const change = r.previousPosition && r.position ? r.previousPosition - r.position : 0;
              return (
                <div key={r.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                  <div className="flex items-center gap-2 min-w-0">
                    {change > 0 ? (
                      <ArrowUpRight className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                    ) : change < 0 ? (
                      <ArrowDownRight className="h-3 w-3 text-red-400 flex-shrink-0" />
                    ) : (
                      <Minus className="h-3 w-3 text-zinc-400 flex-shrink-0" />
                    )}
                    <span className="text-xs text-white truncate">{r.keyword}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-white">#{r.position || "—"}</span>
                    {change !== 0 && (
                      <span className={`text-[10px] font-mono ${change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {change > 0 ? `+${change}` : change}
                      </span>
                    )}
                    {r.engine && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-zinc-700">
                        {r.engine}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function AutobidDetail({ data }: { data: Record<string, any> }) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Auto-Bid Overview
      </h3>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Rules" value={data.totalRules || 0} color="text-orange-400" icon={<Shield className="h-3 w-3" />} />
        <MiniStat label="Active" value={data.activeRules || 0} color="text-emerald-400" icon={<CheckCircle2 className="h-3 w-3" />} />
        <MiniStat label="Total Bids" value={data.totalBids || 0} color="text-blue-400" icon={<Zap className="h-3 w-3" />} />
      </div>

      {/* Rules */}
      {data.rules?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Bid Rules</h4>
          <div className="space-y-1.5">
            {data.rules.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Shield className="h-3 w-3 text-orange-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{r.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    ${parseFloat(r.spent || 0).toFixed(0)} / ${parseFloat(r.totalBudget || 0).toFixed(0)}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Bids */}
      {data.recentBids?.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Recent Bids</h4>
          <div className="space-y-1.5">
            {data.recentBids.slice(0, 8).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="h-3 w-3 text-blue-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{b.domain}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-white">${parseFloat(b.amount || 0).toFixed(2)}</span>
                  <StatusBadge status={b.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Shared sub-components ───

function MiniStat({ label, value, color, icon }: { label: string; value: number | string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        {icon && <span className={color}>{icon}</span>}
        <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      </div>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "border-emerald-500/30 text-emerald-400",
    success: "border-emerald-500/30 text-emerald-400",
    completed: "border-emerald-500/30 text-emerald-400",
    published: "border-emerald-500/30 text-emerald-400",
    running: "border-yellow-500/30 text-yellow-400",
    pending: "border-blue-500/30 text-blue-400",
    queued: "border-blue-500/30 text-blue-400",
    draft: "border-zinc-500/30 text-zinc-400",
    failed: "border-red-500/30 text-red-400",
    error: "border-red-500/30 text-red-400",
    down: "border-red-500/30 text-red-400",
    inactive: "border-zinc-500/30 text-zinc-400",
    paused: "border-yellow-500/30 text-yellow-400",
  };
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colorMap[status] || "border-zinc-700 text-zinc-400"}`}>
      {status}
    </Badge>
  );
}

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 text-yellow-400 animate-spin flex-shrink-0" />;
    case "cancelled":
      return <AlertTriangle className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />;
  }
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-blue-500",
    low: "bg-zinc-500",
  };
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[priority] || colors.medium}`} />
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-8">
      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
