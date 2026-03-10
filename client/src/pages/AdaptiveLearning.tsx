/**
 * Adaptive Learning Dashboard — AI Strategy Memory & Evolution
 * Shows learning stats, method success rates, CMS profiles, and learned insights
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Brain, TrendingUp, Target, Shield, Zap, RefreshCw, BookOpen,
  BarChart3, Clock, CheckCircle2, XCircle, Cpu, Database,
  Lightbulb, ArrowUpRight, ArrowDownRight, Minus, Layers,
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

export default function AdaptiveLearning() {
  const [cmsFilter, setCmsFilter] = useState<string>("");
  const [wafFilter, setWafFilter] = useState<string>("");

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

  // ─── Mutations ───
  const runLearningMut = trpc.adaptiveLearning.runLearning.useMutation({
    onSuccess: (data) => {
      toast.success(`Learning cycle complete: ${data.patternsUpdated} patterns, ${data.profilesUpdated} profiles updated`);
      statsQ.refetch();
      methodRatesQ.refetch();
      patternsQ.refetch();
      insightsQ.refetch();
    },
    onError: (err) => toast.error(`Learning cycle failed: ${err.message}`),
  });

  const stats = statsQ.data;
  const methodRates = methodRatesQ.data || [];
  const patterns = patternsQ.data || [];
  const insights = insightsQ.data || [];

  const isLoading = statsQ.isLoading;

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
            AI เรียนรู้จากทุกการโจมตี — ปรับกลยุทธ์อัตโนมัติเพื่อเพิ่ม success rate
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              statsQ.refetch();
              methodRatesQ.refetch();
              patternsQ.refetch();
              insightsQ.refetch();
            }}
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
            {runLearningMut.isPending ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Brain className="w-4 h-4 mr-1" />
            )}
            Run Learning Cycle
          </Button>
        </div>
      </div>

      {/* ═══ OVERVIEW STATS ═══ */}
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
          <StatCard
            icon={<Database className="w-5 h-5 text-violet-400" />}
            label="Outcomes Recorded"
            value={stats.totalOutcomesRecorded.toLocaleString()}
            sub="Total attack records"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            label="Successes"
            value={stats.totalSuccesses.toLocaleString()}
            sub={`${pct(stats.overallSuccessRate)} success rate`}
            valueColor="text-emerald-400"
          />
          <StatCard
            icon={<XCircle className="w-5 h-5 text-red-400" />}
            label="Failures"
            value={stats.totalFailures.toLocaleString()}
            sub={`${pct(100 - stats.overallSuccessRate)} failure rate`}
            valueColor="text-red-400"
          />
          <StatCard
            icon={<BookOpen className="w-5 h-5 text-cyan-400" />}
            label="Learned Patterns"
            value={stats.totalLearnedPatterns.toLocaleString()}
            sub={`${stats.totalCmsProfiles} CMS profiles`}
          />

          {/* Trend cards */}
          <TrendCard
            label="Last 24h"
            attempts={stats.recentTrend.last24h.attempts}
            successes={stats.recentTrend.last24h.successes}
            rate={stats.recentTrend.last24h.rate}
            compareRate={stats.recentTrend.last7d.rate}
          />
          <TrendCard
            label="Last 7 Days"
            attempts={stats.recentTrend.last7d.attempts}
            successes={stats.recentTrend.last7d.successes}
            rate={stats.recentTrend.last7d.rate}
            compareRate={stats.recentTrend.last30d.rate}
          />
          <TrendCard
            label="Last 30 Days"
            attempts={stats.recentTrend.last30d.attempts}
            successes={stats.recentTrend.last30d.successes}
            rate={stats.recentTrend.last30d.rate}
            compareRate={stats.overallSuccessRate}
          />
          <StatCard
            icon={<Layers className="w-5 h-5 text-amber-400" />}
            label="Top Methods"
            value={stats.topMethods.length.toString()}
            sub="Unique methods tracked"
          />
        </div>
      ) : null}

      {/* ═══ FILTERS ═══ */}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setCmsFilter(""); setWafFilter(""); }}
                className="text-zinc-400"
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ MAIN CONTENT GRID ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Method Success Rates ─── */}
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
              <div className="space-y-4">
                <BarChart
                  data={methodRates.slice(0, 12).map((r) => ({
                    label: r.method.replace(/_/g, " "),
                    value: r.successRate,
                    color: r.successRate >= 50 ? "bg-emerald-500" : r.successRate >= 25 ? "bg-amber-500" : "bg-red-500",
                  }))}
                  maxValue={100}
                />
                <div className="border-t border-zinc-800 pt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {methodRates.slice(0, 6).map((r) => (
                      <div key={r.method} className="text-xs p-2 rounded bg-zinc-800/50">
                        <div className="font-mono text-zinc-300 truncate">{r.method}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={rateColor(r.successRate)}>{pct(r.successRate)}</span>
                          <span className="text-zinc-500">·</span>
                          <span className="text-zinc-500">{r.attempts} tries</span>
                          <span className="text-zinc-500">·</span>
                          <span className="text-zinc-500">{fmtMs(r.avgDuration)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Most Attacked CMS ─── */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              CMS Attack Intelligence
            </CardTitle>
            <CardDescription className="text-xs">
              ข้อมูลการโจมตีแยกตาม CMS — จำนวนครั้งและอัตราสำเร็จ
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!stats?.mostAttackedCms?.length ? (
              <EmptyState text="No CMS data yet" />
            ) : (
              <div className="space-y-2">
                {stats.mostAttackedCms.map((cms) => (
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

        {/* ─── Historical Patterns ─── */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Historical Patterns
            </CardTitle>
            <CardDescription className="text-xs">
              Pattern ที่ AI เรียนรู้จากการโจมตีที่ผ่านมา — best payload mods & WAF bypasses
            </CardDescription>
          </CardHeader>
          <CardContent>
            {patterns.length === 0 ? (
              <EmptyState text="No patterns learned yet — data accumulates after attacks" />
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {patterns.map((p, i) => (
                  <div key={i} className="p-3 rounded bg-zinc-800/50 border border-zinc-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono text-zinc-200">{p.method.replace(/_/g, " ")}</span>
                      <Badge variant="outline" className={`${rateBg(p.successRate)} ${rateColor(p.successRate)} text-xs`}>
                        {pct(p.successRate)} ({p.totalSuccesses}/{p.totalAttempts})
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.bestPayloadMods.map((mod, j) => (
                        <Badge key={j} variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[10px]">
                          {mod}
                        </Badge>
                      ))}
                      {p.bestWafBypasses.map((bp, j) => (
                        <Badge key={j} variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                          {bp}
                        </Badge>
                      ))}
                    </div>
                    {p.commonErrors.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.commonErrors.map((err, j) => (
                          <Badge key={j} variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">
                            {err}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 mt-1.5">
                      Avg: {fmtMs(p.avgDuration)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── AI Learned Insights ─── */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              AI Learned Insights
            </CardTitle>
            <CardDescription className="text-xs">
              ข้อมูลเชิงลึกที่ AI สังเคราะห์จาก pattern ทั้งหมด — คำแนะนำสำหรับการโจมตีครั้งต่อไป
            </CardDescription>
          </CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <EmptyState text="No insights yet — run a learning cycle after accumulating data" />
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {insights.map((ins, i) => (
                  <div key={i} className="p-3 rounded bg-zinc-800/50 border border-zinc-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[10px]">
                          {ins.patternType}
                        </Badge>
                        <span className="text-xs font-mono text-zinc-300">{ins.patternKey}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${rateColor(ins.successRate)}`}>{pct(ins.successRate)}</span>
                        <span className="text-[10px] text-zinc-500">({ins.sampleSize} samples)</span>
                      </div>
                    </div>
                    {ins.insight && (
                      <p className="text-xs text-zinc-300 mb-1.5 leading-relaxed">
                        <Lightbulb className="w-3 h-3 text-yellow-400 inline mr-1" />
                        {ins.insight}
                      </p>
                    )}
                    {ins.recommendation && (
                      <p className="text-xs text-emerald-400/80 leading-relaxed">
                        <Zap className="w-3 h-3 text-emerald-400 inline mr-1" />
                        {ins.recommendation}
                      </p>
                    )}
                    <div className="mt-1.5">
                      <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full transition-all duration-500"
                          style={{ width: `${ins.confidence}%` }}
                        />
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

      {/* ═══ TOP METHODS TABLE ═══ */}
      {stats?.topMethods && stats.topMethods.length > 0 && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              All Method Performance
            </CardTitle>
            <CardDescription className="text-xs">
              ตารางเปรียบเทียบ performance ของทุก attack method
            </CardDescription>
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
                  {stats.topMethods.map((m, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2 px-2">
                        <span className="font-mono text-zinc-200">{m.method.replace(/_/g, " ")}</span>
                      </td>
                      <td className="text-right py-2 px-2 text-zinc-400">{m.attempts}</td>
                      <td className="text-right py-2 px-2 text-zinc-400">{m.successes}</td>
                      <td className="text-right py-2 px-2">
                        <span className={rateColor(m.successRate)}>{pct(m.successRate)}</span>
                      </td>
                      <td className="text-right py-2 px-2 text-zinc-400">{fmtMs(m.avgDuration)}</td>
                      <td className="text-right py-2 px-2 text-zinc-500">
                        {m.lastSuccess ? new Date(m.lastSuccess).toLocaleDateString("th-TH") : "—"}
                      </td>
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

// ─── Sub-components ───

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
        <div className="text-[11px] text-zinc-500 mt-0.5">
          {successes}/{attempts} attacks
        </div>
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
