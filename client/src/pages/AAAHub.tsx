/**
 * AI All-in Attack (AAA) — Unified Hub
 * 
 * Consolidates ALL Blackhat Mode + Autonomous AI functions into a single page
 * with sub-tabs. The "Attack" tab is the main entry point for one-click attacks.
 * Other tabs provide access to intelligence, tools, history, and autonomous features.
 */
import { Suspense, useState, lazy } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Skull, Brain, Wrench, History, Cpu, Rocket, Radar, BarChart3 } from "lucide-react";

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

// ─── Sub-tab definitions for each main tab ───
interface SubTab {
  id: string;
  label: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

const ATTACK_SUBTABS: SubTab[] = [
  { id: "engine", label: "AI Attack Engine", component: AutonomousFriday },
  { id: "agentic", label: "Agentic AI", component: AgenticAttack },
  { id: "batch", label: "Batch Attack", component: BatchAttack },
  { id: "redirect", label: "Redirect Takeover", component: RedirectTakeover },
  { id: "hijack", label: "Hijack Redirect", component: HijackRedirect },
];

const INTEL_SUBTABS: SubTab[] = [
  { id: "target", label: "Target Acquisition", component: TargetAcquisition },
  { id: "mass", label: "Mass Discovery", component: MassDiscovery },
  { id: "keyword-disc", label: "Keyword Discovery", component: KeywordDiscovery },
  { id: "query-parasite", label: "Query Parasite", component: QueryParasiteDashboard },
  { id: "platform", label: "Platform Discovery", component: PlatformDiscoveryDashboard },
  { id: "competitor", label: "Competitor Gap", component: CompetitorGapDashboard },
  { id: "algo", label: "Algo Monitor", component: AlgorithmMonitorDashboard },
  { id: "freshness", label: "Content Freshness", component: ContentFreshnessDashboard },
];

const TOOLS_SUBTABS: SubTab[] = [
  { id: "proxy", label: "Proxy Dashboard", component: ProxyDashboard },
  { id: "cve", label: "CVE Database", component: CveDashboard },
  { id: "templates", label: "Templates", component: TemplateLibrary },
  { id: "cloaking", label: "Cloaking", component: CloakingSettings },
  { id: "wp-themes", label: "WP Themes", component: WpThemes },
  { id: "scheduled", label: "Scheduled Scans", component: ScheduledScans },
  { id: "keyword-rank", label: "Keyword Ranking", component: KeywordRanking },
];

const HISTORY_SUBTABS: SubTab[] = [
  { id: "dashboard", label: "Attack Dashboard", component: AttackDashboard },
  { id: "timeline", label: "Timeline", component: AttackTimeline },
  { id: "attack-hist", label: "Attack History", component: AutonomousHistory },
  { id: "deploy", label: "Deploy History", component: DeployHistory },
  { id: "exploit", label: "Exploit Analytics", component: ExploitAnalytics },
  { id: "learning", label: "Adaptive Learning", component: AdaptiveLearning },
];

const AUTO_SUBTABS: SubTab[] = [
  { id: "orchestrator", label: "Orchestrator", component: OrchestratorDashboard },
  { id: "command", label: "AI Command Center", component: AutonomousCommandCenter },
  { id: "gambling", label: "Gambling AI Brain", component: GamblingBrainDashboard },
  { id: "kw-perf", label: "Keyword Performance", component: KeywordPerformancePage },
  { id: "daemon", label: "Daemon Control", component: DaemonControlCenter },
];

function SubTabPanel({ subtabs, defaultTab }: { subtabs: SubTab[]; defaultTab?: string }) {
  const [activeSubTab, setActiveSubTab] = useState(defaultTab || subtabs[0]?.id || "");

  const ActiveComponent = subtabs.find(t => t.id === activeSubTab)?.component;

  return (
    <div className="space-y-4">
      {/* Sub-tab pills */}
      <div className="flex flex-wrap gap-2">
        {subtabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
              activeSubTab === tab.id
                ? "bg-red-500/20 text-red-400 border border-red-500/40"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Suspense fallback={<TabLoader />}>
        {ActiveComponent && <ActiveComponent />}
      </Suspense>
    </div>
  );
}

export default function AAAHub() {
  const [mainTab, setMainTab] = useState("attack");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <Skull className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            AI All-in Attack
            <span className="text-xs font-mono bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">
              AAA
            </span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono">
            Unified attack command center — all weapons, one interface
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="bg-muted/30 border border-border/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="attack" className="gap-1.5 data-[state=active]:bg-red-500/15 data-[state=active]:text-red-400">
            <Rocket className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Attack</span>
          </TabsTrigger>
          <TabsTrigger value="intel" className="gap-1.5 data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400">
            <Radar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Intelligence</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400">
            <Wrench className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tools</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-400">
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="auto" className="gap-1.5 data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400">
            <Cpu className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Autonomous</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attack" className="mt-4">
          <SubTabPanel subtabs={ATTACK_SUBTABS} defaultTab="engine" />
        </TabsContent>

        <TabsContent value="intel" className="mt-4">
          <SubTabPanel subtabs={INTEL_SUBTABS} />
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <SubTabPanel subtabs={TOOLS_SUBTABS} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <SubTabPanel subtabs={HISTORY_SUBTABS} />
        </TabsContent>

        <TabsContent value="auto" className="mt-4">
          <SubTabPanel subtabs={AUTO_SUBTABS} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
