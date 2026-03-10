/**
 * Adaptive Learning Dashboard — AI Strategy Memory & Evolution
 * Shows learning stats, method success rates, CMS profiles, learned insights,
 * evolved strategies, blacklisted methods, and scheduler control
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Brain, TrendingUp, Target, Shield, Zap, RefreshCw, BookOpen,
  BarChart3, Clock, CheckCircle2, XCircle, Cpu, Database,
  Lightbulb, ArrowUpRight, ArrowDownRight, Minus, Layers,
  Ban, Dna, Settings, Play, Timer, AlertTriangle, Sparkles,
} from "lucide-react";

// ─── Helpers ───
function pct(rate: number): string { return `${rate.toFixed(1)}%`; }
function fmtMs(ms: number): string { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }

function rateColor(rate: number): string {
  if (rate >= 50) return "text-emerald-400";
  if (rate >= 25) return "text-amber-400";
  return "text-red-400";
}

function rateBg(rate: number): string {
  if (rate >= 50) return "bg-emerald-500/20 border-emerald-500/30";
  if (rate >= 25) return "bg-amber-500/20 border-amber-500/30";
  return "bg-red-500/20 border-red-500/30";
}

function TrendIcon({ current, previous }: { current: number; previous: number }) {
  if (current > previous) return <ArrowUpRight className="w-4 h-4 text-emerald-400" />;
  if (current < previous) return <ArrowDownRight className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-zinc-500" />;
}

// ─── Simple bar chart ───
function BarChart({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue: number }) {
  return (
    <div className="space-y-1.5">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400 w-28 truncate font-mono" title={item.label}>{item.label}</span>
          <div className="flex-1 h-5 bg-zinc-800/50 rounded overflow-hidden">
            <div
              className={`h-full rounded ${item.color} transition-all duration-700`}
              style={{ width: maxValue > 0 ? `${Math.max((item.value / maxValue) * 100, 2)}%` : "0%" }}
            />
          </div>
          <span className="text-[11px] text-zinc-300 w-12 text-right font-mono">{pct(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

type TabId = "overview" | "methods" | "evolved" | "blacklist" | "scheduler";

export default function AdaptiveLearning() {
  const [cmsFilter, setCmsFilter] = useState<string>("");
  const [wafFilter, setWafFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [newInterval, setNewInterval] = useState<string>("2");

  // ─── Data queries ───
  const statsQ = trpc.adaptiveLearning.getStats.useQuery();
  const methodRatesQ = trpc.adaptiveLearning.getMethodRates.useQuery(
    cmsFilter || wafFilter ? { cms: cmsFilter || undefined, waf: wafFilter || undefined } : undefined
  );
  const patternsQ = trpc.adaptiveLearning.getPatterns.useQuery(
    cmsFilter || wafFilter ? { cms: cmsFilter || undefined, waf: wafFilter || undefined, limit: 20 } : undefined
  );
  const insightsQ = trpc.adaptiveLearning.getInsights.useQuery(
    cmsFilter || wafFilter ? { cms: cmsFilter || undefined, waf: wafFilter || undefined, limit: 20 } : undefined
  );
  const schedulerQ = trpc.adaptiveLearning.getSchedulerStatus.useQuery();
  const evolvedQ = trpc.adaptiveLearning.getEvolvedStrategies.useQuery();
  const effectivenessQ = trpc.adaptiveLearning.getMethodEffectiveness.useQuery(
    cmsFilter || wafFilter ? { cms: cmsFilter || undefined, waf: wafFilter || undefined } : undefined
  );
  const blacklistedQ = trpc.adaptiveLearning.getBlacklistedMethods.useQuery(
    cmsFilter || wafFilter ? { cms: cmsFilter || undefined, waf: wafFilter || undefined } : undefined
  );

  // ─── Mutations ───
  const utils = trpc.useUtils();
  const runLearningMut = trpc.adaptiveLearning.runLearning.useMutation({
    onSuccess: (data) => {
      if (data.skipped) {
        toast.info(`Learning cycle skipped: ${data.skipReason}`);
      } else {
        toast.success(`Learning cycle complete: ${data.patternsUpdated} patterns, ${data.profilesUpdated} profiles, ${data.strategiesEvolved} strategies`);
      }
      utils.adaptiveLearning.invalidate();
    },
    onError: (err) => toast.error(`Learning cycle failed: ${err.message}`),
  });

  const runEnhancedMut = trpc.adaptiveLearning.runEnhancedLearning.useMutation({
    onSuccess: (data) => {
      toast.success(`Enhanced learning: ${data.patternsUpdated} patterns, ${data.profilesUpdated} profiles, ${data.strategiesEvolved} strategies evolved`);
      utils.adaptiveLearning.invalidate();
    },
    onError: (err) => toast.error(`Enhanced learning failed: ${err.message}`),
  });

  const evolveMut = trpc.adaptiveLearning.evolveStrategies.useMutation({
    onSuccess: (data) => {
      toast.success(`Evolved ${data.strategiesEvolved} new strategies`);
      utils.adaptiveLearning.getEvolvedStrategies.invalidate();
    },
    onError: (err) => toast.error(`Strategy evolution failed: ${err.message}`),
  });

  const updateIntervalMut = trpc.adaptiveLearning.updateInterval.useMutation({
    onSuccess: (data) => {
      toast.success(`Learning interval updated to ${data.newIntervalHours}h`);
      utils.adaptiveLearning.getSchedulerStatus.invalidate();
    },
    onError: (err) => toast.error(`Failed to update interval: ${err.message}`),
  });

  const stats = statsQ.data;
  const methodRates = methodRatesQ.data || [];
  const patterns = patternsQ.data || [];
  const insights = insightsQ.data || [];
  const scheduler = schedulerQ.data;
  const evolved = evolvedQ.data || [];
  const effectiveness = effectivenessQ.data || [];
  const blacklisted = blacklistedQ.data || [];

  const isLoading = statsQ.isLoading;

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "methods", label: "Methods", icon: <Zap className="w-4 h-4" />, count: methodRates.length },
    { id: "evolved", label: "Evolved", icon: <Dna className="w-4 h-4" />, count: evolved.length },
    { id: "blacklist", label: "Blacklist", icon: <Ban className="w-4 h-4" />, count: blacklisted.length },
    { id: "scheduler", label: "Scheduler", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Brain className="w-7 h-7 text-violet-400" />
            Adaptive Learning
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            AI เรียนรู้จากทุกการโจมตี — ปรับกลยุทธ์อัตโนมัติ, blacklist method ที่ล้มเหลว, สร้าง strategy ใหม่
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => utils.adaptiveLearning.invalidate()}
            className="border-zinc-700"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => runLearningMut.mutate()}
            disabled={runLearningMut.isPending}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {runLearningMut.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
            Run Learning
          </Button>
          <Button
            size="sm"
            onClick={() => evolveMut.mutate()}
            disabled={evolveMut.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {evolveMut.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Dna className="w-4 h-4 mr-1" />}
            Evolve Strategies
          </Button>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-zinc-800 text-zinc-100 border-b-2 border-violet-500"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-zinc-700">
                {tab.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ═══ FILTERS ═══ */}
      {(activeTab === "overview" || activeTab === "methods" || activeTab === "blacklist") && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-xs text-zinc-500 mb-1 block">Filter by CMS</label>
                <Input
                  placeholder="e.g. WordPress, Joomla..."
                  value={cmsFilter}
                  onChange={(e) => setCmsFilter(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-zinc-500 mb-1 block">Filter by WAF</label>
                <Input
                  placeholder="e.g. Cloudflare, ModSecurity..."
                  value={wafFilter}
                  onChange={(e) => setWafFilter(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={() => { setCmsFilter(""); setWafFilter(""); }} className="text-zinc-400">
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ TAB CONTENT ═══ */}
      {activeTab === "overview" && (
        <OverviewTab
          stats={stats}
          isLoading={isLoading}
          methodRates={methodRates}
          patterns={patterns}
          insights={insights}
          cmsFilter={cmsFilter}
          wafFilter={wafFilter}
        />
      )}

      {activeTab === "methods" && (
        <MethodsTab
          methodRates={methodRates}
          effectiveness={effectiveness}
          stats={stats}
          cmsFilter={cmsFilter}
          wafFilter={wafFilter}
        />
      )}

      {activeTab === "evolved" && (
        <EvolvedTab
          evolved={evolved}
          evolveMut={evolveMut}
        />
      )}

      {activeTab === "blacklist" && (
        <BlacklistTab
          blacklisted={blacklisted}
          effectiveness={effectiveness}
        />
      )}

      {activeTab === "scheduler" && (
        <SchedulerTab
          scheduler={scheduler}
          newInterval={newInterval}
          setNewInterval={setNewInterval}
          updateIntervalMut={updateIntervalMut}
          runLearningMut={runLearningMut}
          runEnhancedMut={runEnhancedMut}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  OVERVIEW TAB
// ═══════════════════════════════════════════════════════

function OverviewTab({ stats, isLoading, methodRates, patterns, insights, cmsFilter, wafFilter }: any) {
  return (
    <>
      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="bg-zinc-900/50 border-zinc-800 animate-pulse">
              <CardContent className="p-4 h-20" />
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Database className="w-5 h-5 text-violet-400" />} label="Outcomes Recorded" value={stats.totalOutcomesRecorded.toLocaleString()} sub="Total attack records" />
          <StatCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} label="Successes" value={stats.totalSuccesses.toLocaleString()} sub={`${pct(stats.overallSuccessRate)} success rate`} valueColor="text-emerald-400" />
          <StatCard icon={<XCircle className="w-5 h-5 text-red-400" />} label="Failures" value={stats.totalFailures.toLocaleString()} sub={`${pct(100 - stats.overallSuccessRate)} failure rate`} valueColor="text-red-400" />
          <StatCard icon={<BookOpen className="w-5 h-5 text-cyan-400" />} label="Learned Patterns" value={stats.totalLearnedPatterns.toLocaleString()} sub={`${stats.totalCmsProfiles} CMS profiles`} />
          <TrendCard label="Last 24h" attempts={stats.recentTrend.last24h.attempts} successes={stats.recentTrend.last24h.successes} rate={stats.recentTrend.last24h.rate} compareRate={stats.recentTrend.last7d.rate} />
          <TrendCard label="Last 7 Days" attempts={stats.recentTrend.last7d.attempts} successes={stats.recentTrend.last7d.successes} rate={stats.recentTrend.last7d.rate} compareRate={stats.recentTrend.last30d.rate} />
          <TrendCard label="Last 30 Days" attempts={stats.recentTrend.last30d.attempts} successes={stats.recentTrend.last30d.successes} rate={stats.recentTrend.last30d.rate} compareRate={stats.overallSuccessRate} />
          <StatCard icon={<Layers className="w-5 h-5 text-amber-400" />} label="Top Methods" value={stats.topMethods.length.toString()} sub="Unique methods tracked" />
        </div>
      ) : null}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Method Success Rates */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Method Success Rates
            </CardTitle>
            <CardDescription className="text-xs">
              อัตราสำเร็จของแต่ละ attack method {cmsFilter && `(CMS: ${cmsFilter})`} {wafFilter && `(WAF: ${wafFilter})`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {methodRates.length === 0 ? (
              <EmptyState text="No method data yet — run attacks to start learning" />
            ) : (
              <BarChart
                data={methodRates.slice(0, 12).map((r: any) => ({
                  label: r.method.replace(/_/g, " "),
                  value: r.successRate,
                  color: r.successRate >= 50 ? "bg-emerald-500" : r.successRate >= 25 ? "bg-amber-500" : "bg-red-500",
                }))}
                maxValue={100}
              />
            )}
          </CardContent>
        </Card>

        {/* CMS Attack Intelligence */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              CMS Attack Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!stats?.mostAttackedCms?.length ? (
              <EmptyState text="No CMS data yet" />
            ) : (
              <div className="space-y-2">
                {stats.mostAttackedCms.map((cms: any) => (
                  <div key={cms.cms} className="flex items-center justify-between p-2.5 rounded bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-cyan-500/10 flex items-center justify-center">
                        <Cpu className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-200">{cms.cms}</div>
                        <div className="text-xs text-zinc-500">{cms.count} attacks</div>
                      </div>
                    </div>
                    <Badge variant="outline" className={`${rateBg(cms.successRate)} ${rateColor(cms.successRate)} text-xs`}>
                      {pct(cms.successRate)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historical Patterns */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Historical Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {patterns.length === 0 ? (
              <EmptyState text="No patterns learned yet" />
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {patterns.map((p: any, i: number) => (
                  <div key={i} className="p-3 rounded bg-zinc-800/50 border border-zinc-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono text-zinc-200">{p.method.replace(/_/g, " ")}</span>
                      <Badge variant="outline" className={`${rateBg(p.successRate)} ${rateColor(p.successRate)} text-xs`}>
                        {pct(p.successRate)} ({p.totalSuccesses}/{p.totalAttempts})
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.bestPayloadMods?.map((mod: string, j: number) => (
                        <Badge key={j} variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[10px]">{mod}</Badge>
                      ))}
                      {p.bestWafBypasses?.map((bp: string, j: number) => (
                        <Badge key={j} variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">{bp}</Badge>
                      ))}
                    </div>
                    {p.commonErrors?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.commonErrors.map((err: string, j: number) => (
                          <Badge key={j} variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">{err}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 mt-1.5">Avg: {fmtMs(p.avgDuration)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Learned Insights */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              AI Learned Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <EmptyState text="No insights yet — run a learning cycle" />
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {insights.map((ins: any, i: number) => (
                  <div key={i} className="p-3 rounded bg-zinc-800/50 border border-zinc-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[10px]">{ins.patternType}</Badge>
                        <span className="text-xs font-mono text-zinc-300">{ins.patternKey}</span>
                      </div>
                      <span className={`text-xs ${rateColor(ins.successRate)}`}>{pct(ins.successRate)}</span>
                    </div>
                    {ins.insight && <p className="text-xs text-zinc-300 mb-1.5 leading-relaxed"><Lightbulb className="w-3 h-3 text-yellow-400 inline mr-1" />{ins.insight}</p>}
                    {ins.recommendation && <p className="text-xs text-emerald-400/80 leading-relaxed"><Zap className="w-3 h-3 text-emerald-400 inline mr-1" />{ins.recommendation}</p>}
                    <div className="mt-1.5">
                      <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${ins.confidence}%` }} />
                      </div>
                      <span className="text-[10px] text-zinc-500">Confidence: {ins.confidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════
//  METHODS TAB
// ═══════════════════════════════════════════════════════

function MethodsTab({ methodRates, effectiveness, stats, cmsFilter, wafFilter }: any) {
  return (
    <div className="space-y-6">
      {/* Method Effectiveness */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            Method Effectiveness
            {cmsFilter && <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30">{cmsFilter}</Badge>}
            {wafFilter && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">{wafFilter}</Badge>}
          </CardTitle>
          <CardDescription className="text-xs">
            ประสิทธิภาพของแต่ละ method — AI จะ skip method ที่ shouldSkip = true
          </CardDescription>
        </CardHeader>
        <CardContent>
          {effectiveness.length === 0 ? (
            <EmptyState text="No effectiveness data yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 px-2 text-zinc-500 font-medium">Method</th>
                    <th className="text-right py-2 px-2 text-zinc-500 font-medium">Attempts</th>
                    <th className="text-right py-2 px-2 text-zinc-500 font-medium">Successes</th>
                    <th className="text-right py-2 px-2 text-zinc-500 font-medium">Rate</th>
                    <th className="text-center py-2 px-2 text-zinc-500 font-medium">Status</th>
                    <th className="text-left py-2 px-2 text-zinc-500 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveness.map((m: any, i: number) => (
                    <tr key={i} className={`border-b border-zinc-800/50 transition-colors ${m.shouldSkip ? "bg-red-500/5" : "hover:bg-zinc-800/30"}`}>
                      <td className="py-2 px-2 font-mono text-zinc-200">{m.method.replace(/_/g, " ")}</td>
                      <td className="text-right py-2 px-2 text-zinc-400">{m.attempts}</td>
                      <td className="text-right py-2 px-2 text-zinc-400">{m.successes}</td>
                      <td className="text-right py-2 px-2"><span className={rateColor(m.successRate)}>{pct(m.successRate)}</span></td>
                      <td className="text-center py-2 px-2">
                        {m.shouldSkip ? (
                          <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                            <Ban className="w-3 h-3 mr-0.5" /> SKIP
                          </Badge>
                        ) : m.successRate >= 50 ? (
                          <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                            <Sparkles className="w-3 h-3 mr-0.5" /> PRIORITY
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30 text-[10px]">ACTIVE</Badge>
                        )}
                      </td>
                      <td className="py-2 px-2 text-zinc-500 text-[10px] max-w-[200px] truncate">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Method Performance Table */}
      {stats?.topMethods && stats.topMethods.length > 0 && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              All Method Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 px-2 text-zinc-500 font-medium">Method</th>
                    <th className="text-right py-2 px-2 text-zinc-500 font-medium">Attempts</th>
                    <th className="text-right py-2 px-2 text-zinc-500 font-medium">Successes</th>
                    <th className="text-right py-2 px-2 text-zinc-500 font-medium">Success Rate</th>
                    <th className="text-right py-2 px-2 text-zinc-500 font-medium">Avg Duration</th>
                    <th className="text-right py-2 px-2 text-zinc-500 font-medium">Last Success</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topMethods.map((m: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2 px-2 font-mono text-zinc-200">{m.method.replace(/_/g, " ")}</td>
                      <td className="text-right py-2 px-2 text-zinc-400">{m.attempts}</td>
                      <td className="text-right py-2 px-2 text-zinc-400">{m.successes}</td>
                      <td className="text-right py-2 px-2"><span className={rateColor(m.successRate)}>{pct(m.successRate)}</span></td>
                      <td className="text-right py-2 px-2 text-zinc-400">{fmtMs(m.avgDuration)}</td>
                      <td className="text-right py-2 px-2 text-zinc-500">{m.lastSuccess ? new Date(m.lastSuccess).toLocaleDateString("th-TH") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  EVOLVED STRATEGIES TAB
// ═══════════════════════════════════════════════════════

function EvolvedTab({ evolved, evolveMut }: any) {
  return (
    <div className="space-y-6">
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Dna className="w-4 h-4 text-emerald-400" />
                AI Evolved Strategies
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                AI วิเคราะห์ failure/success patterns แล้วสร้าง attack approach ใหม่อัตโนมัติ
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => evolveMut.mutate()}
              disabled={evolveMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {evolveMut.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Dna className="w-4 h-4 mr-1" />}
              Evolve Now
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {evolved.length === 0 ? (
            <EmptyState text="No evolved strategies yet — run 'Evolve Strategies' after accumulating attack data" />
          ) : (
            <div className="space-y-4">
              {evolved.map((strat: any) => (
                <div key={strat.id} className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50 hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100 capitalize flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        {strat.name}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">{strat.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {strat.attempts > 0 && (
                        <Badge variant="outline" className={`${rateBg(strat.successRate)} ${rateColor(strat.successRate)} text-[10px]`}>
                          {pct(strat.successRate)} ({strat.successes}/{strat.attempts})
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Approach */}
                  <div className="bg-zinc-900/80 rounded p-3 mb-3">
                    <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Attack Approach</div>
                    <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{strat.approach}</p>
                  </div>

                  {/* Confidence bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            strat.confidence >= 70 ? "bg-emerald-500" : strat.confidence >= 40 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${strat.confidence}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-400 w-24 text-right">
                      Confidence: {strat.confidence}%
                    </span>
                  </div>

                  {strat.updatedAt && (
                    <div className="text-[10px] text-zinc-600 mt-2">
                      Updated: {new Date(strat.updatedAt).toLocaleString("th-TH")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  BLACKLIST TAB
// ═══════════════════════════════════════════════════════

function BlacklistTab({ blacklisted, effectiveness }: any) {
  const activeCount = effectiveness.filter((m: any) => !m.shouldSkip).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Ban className="w-5 h-5 text-red-400" />}
          label="Blacklisted Methods"
          value={blacklisted.length.toString()}
          sub="Auto-skipped by AI"
          valueColor="text-red-400"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          label="Active Methods"
          value={activeCount.toString()}
          sub="Currently in use"
          valueColor="text-emerald-400"
        />
        <StatCard
          icon={<Shield className="w-5 h-5 text-amber-400" />}
          label="Threshold"
          value="<10%"
          sub="After 5+ attempts"
        />
      </div>

      {/* Blacklisted Methods */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-400" />
            Blacklisted Methods
          </CardTitle>
          <CardDescription className="text-xs">
            Methods ที่ AI จะไม่ใช้อีก เพราะ success rate ต่ำกว่า 10% หลังจากลองแล้ว 5+ ครั้ง
          </CardDescription>
        </CardHeader>
        <CardContent>
          {blacklisted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mb-3" />
              <p className="text-sm text-zinc-400">No methods blacklisted yet</p>
              <p className="text-xs text-zinc-600 mt-1">Methods will be auto-blacklisted when they consistently fail</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blacklisted.map((m: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Ban className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-mono text-zinc-200">{m.method.replace(/_/g, " ")}</span>
                    </div>
                    <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                      {pct(m.successRate)} success
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>{m.attempts} attempts</span>
                    <span>{m.successes} successes</span>
                    {m.cms && <span>CMS: {m.cms}</span>}
                    {m.waf && <span>WAF: {m.waf}</span>}
                  </div>
                  <p className="text-[10px] text-red-400/60 mt-1.5">{m.reason}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  SCHEDULER TAB
// ═══════════════════════════════════════════════════════

function SchedulerTab({ scheduler, newInterval, setNewInterval, updateIntervalMut, runLearningMut, runEnhancedMut }: any) {
  return (
    <div className="space-y-6">
      {/* Scheduler Status */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="w-4 h-4 text-violet-400" />
            Learning Scheduler Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!scheduler ? (
            <EmptyState text="Loading scheduler status..." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Status</div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${scheduler.isActive ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
                    <span className="text-sm text-zinc-200">{scheduler.isActive ? "Active" : "Stopped"}</span>
                  </div>
                </div>
                <div className="p-3 rounded bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Interval</div>
                  <span className="text-sm text-zinc-200 font-mono">{scheduler.intervalHuman}</span>
                </div>
                <div className="p-3 rounded bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Cycles Run</div>
                  <span className="text-sm text-zinc-200">{scheduler.totalCyclesRun}</span>
                </div>
                <div className="p-3 rounded bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Failures</div>
                  <span className={`text-sm ${scheduler.totalCyclesFailed > 0 ? "text-red-400" : "text-zinc-200"}`}>
                    {scheduler.totalCyclesFailed}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Last Run</div>
                  <span className="text-xs text-zinc-300">
                    {scheduler.lastRunAt ? new Date(scheduler.lastRunAt).toLocaleString("th-TH") : "Never"}
                  </span>
                </div>
                <div className="p-3 rounded bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Attacks Since Learn</div>
                  <span className="text-sm text-zinc-200">{scheduler.attacksSinceLastLearn || 0}</span>
                  <span className="text-[10px] text-zinc-500 ml-1">/ {scheduler.incrementalTriggerEvery || 10}</span>
                </div>
                <div className="p-3 rounded bg-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Consecutive Failures</div>
                  <span className={`text-sm ${scheduler.consecutiveFailures > 0 ? "text-amber-400" : "text-zinc-200"}`}>
                    {scheduler.consecutiveFailures}
                  </span>
                </div>
              </div>

              {scheduler.lastResult && (
                <div className="p-3 rounded bg-violet-500/5 border border-violet-500/20">
                  <div className="text-[10px] text-violet-400 uppercase tracking-wider mb-1">Last Result</div>
                  <div className="flex gap-4 text-xs text-zinc-300">
                    <span>Patterns: {scheduler.lastResult.patternsUpdated}</span>
                    <span>Profiles: {scheduler.lastResult.profilesUpdated}</span>
                    {scheduler.lastResult.strategiesEvolved !== undefined && (
                      <span>Strategies: {scheduler.lastResult.strategiesEvolved}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Interval Control */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" />
            Learning Interval Control
          </CardTitle>
          <CardDescription className="text-xs">
            ปรับความถี่ของ learning cycle — ยิ่งถี่ AI ยิ่งเรียนรู้เร็ว แต่ใช้ resource มากขึ้น
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 mb-1 block">Interval (hours)</label>
              <Input
                type="number"
                min="0.5"
                max="24"
                step="0.5"
                value={newInterval}
                onChange={(e) => setNewInterval(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={() => {
                  const hours = parseFloat(newInterval);
                  if (hours >= 0.5 && hours <= 24) {
                    updateIntervalMut.mutate({ intervalHours: hours });
                  } else {
                    toast.error("Interval must be between 0.5 and 24 hours");
                  }
                }}
                disabled={updateIntervalMut.isPending}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {updateIntervalMut.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Timer className="w-4 h-4 mr-1" />}
                Update Interval
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {[0.5, 1, 2, 4].map((h) => (
              <Button
                key={h}
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewInterval(h.toString());
                  updateIntervalMut.mutate({ intervalHours: h });
                }}
                disabled={updateIntervalMut.isPending}
                className="border-zinc-700 text-xs"
              >
                {h}h
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Manual Triggers */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            Manual Triggers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => runLearningMut.mutate()}
              disabled={runLearningMut.isPending}
              className="bg-violet-600 hover:bg-violet-700 flex-1"
            >
              {runLearningMut.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
              Run Standard Learning
            </Button>
            <Button
              onClick={() => runEnhancedMut.mutate()}
              disabled={runEnhancedMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 flex-1"
            >
              {runEnhancedMut.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Dna className="w-4 h-4 mr-2" />}
              Run Enhanced + Evolve
            </Button>
          </div>
          <p className="text-[10px] text-zinc-500 mt-2">
            Standard: อัพเดท patterns + CMS profiles | Enhanced: + evolve new strategies from failure/success patterns
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════

function StatCard({ icon, label, value, sub, valueColor }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs text-zinc-500">{label}</span>
        </div>
        <div className={`text-xl font-bold ${valueColor || "text-zinc-100"}`}>{value}</div>
        <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}

function TrendCard({ label, attempts, successes, rate, compareRate }: {
  label: string;
  attempts: number;
  successes: number;
  rate: number;
  compareRate: number;
}) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500">{label}</span>
          <TrendIcon current={rate} previous={compareRate} />
        </div>
        <div className={`text-xl font-bold ${rateColor(rate)}`}>{pct(rate)}</div>
        <div className="text-[11px] text-zinc-500 mt-0.5">{successes}/{attempts} attacks</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Brain className="w-10 h-10 text-zinc-700 mb-3" />
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );
}
