/**
 * AI Auto-Bid — Smart Domain Acquisition
 * AI-powered SEO analysis + GoDaddy auto-purchase
 * Design: Obsidian Intelligence theme
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bot, Plus, Play, Pause, Trash2, Settings2, TrendingUp,
  Shield, AlertTriangle, CheckCircle2, XCircle, Clock,
  Search, Zap, Target, BarChart3, DollarSign, Globe,
  Loader2, ShoppingCart,
  ThumbsUp, ThumbsDown, Activity, Brain,
} from "lucide-react";

// ═══ Types ═══
interface RuleFormData {
  name: string;
  keyword: string;
  tld: string;
  maxBidPerDomain: string;
  totalBudget: string;
  minDA: number;
  minDR: number;
  maxSpamScore: number;
  minBacklinks: number;
  minReferringDomains: number;
  minTrustFlow: number;
  minCitationFlow: number;
  useCase: string;
  bidStrategy: string;
  autoPurchase: boolean;
  requireApproval: boolean;
  // Link type filters
  requireWikiLink: boolean;
  linkTypeFilters: string[];
  checkRedirect: boolean;
  rejectRedirects: boolean;
}

const DEFAULT_FORM: RuleFormData = {
  name: "",
  keyword: "",
  tld: "",
  maxBidPerDomain: "50",
  totalBudget: "500",
  minDA: 0,
  minDR: 0,
  maxSpamScore: 30,
  minBacklinks: 0,
  minReferringDomains: 0,
  minTrustFlow: 0,
  minCitationFlow: 0,
  useCase: "seo_build",
  bidStrategy: "moderate",
  autoPurchase: false,
  requireApproval: true,
  // Link type filters
  requireWikiLink: false,
  linkTypeFilters: [],
  checkRedirect: false,
  rejectRedirects: true,
};

const VERDICT_COLORS: Record<string, string> = {
  STRONG_BUY: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  BUY: "bg-green-500/20 text-green-400 border-green-500/30",
  CONDITIONAL_BUY: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  HOLD: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  PASS: "bg-red-500/20 text-red-400 border-red-500/30",
};

const ACTION_COLORS: Record<string, string> = {
  purchased: "bg-emerald-500/20 text-emerald-400",
  recommended: "bg-violet-500/20 text-violet-400",
  analyzed: "bg-blue-500/20 text-blue-400",
  rejected: "bg-red-500/20 text-red-400",
  failed: "bg-red-500/20 text-red-400",
};

export default function AutoBid() {
  const [activeTab, setActiveTab] = useState("rules");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [form, setForm] = useState<RuleFormData>({ ...DEFAULT_FORM });
  const [selectedRule, setSelectedRule] = useState<number | null>(null);
  const [analyzeInput, setAnalyzeInput] = useState("");

  // ═══ tRPC Queries ═══
  const { data: rules = [], isLoading: rulesLoading } = trpc.autobid.list.useQuery();
  const { data: bidHistory = [], isLoading: historyLoading } = trpc.autobid.bidHistory.useQuery({ limit: 100 });
  const utils = trpc.useUtils();

  // ═══ tRPC Mutations ═══
  const createMutation = trpc.autobid.create.useMutation({
    onSuccess: () => {
      utils.autobid.list.invalidate();
      setShowCreateDialog(false);
      setForm({ ...DEFAULT_FORM });
      toast.success("Auto-bid rule created!");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.autobid.update.useMutation({
    onSuccess: () => {
      utils.autobid.list.invalidate();
      toast.success("Rule updated");
    },
  });

  const deleteMutation = trpc.autobid.delete.useMutation({
    onSuccess: () => {
      utils.autobid.list.invalidate();
      utils.autobid.bidHistory.invalidate();
      toast.success("Rule deleted");
    },
  });

  const runMutation = trpc.autobid.run.useMutation({
    onSuccess: (data) => {
      utils.autobid.list.invalidate();
      utils.autobid.bidHistory.invalidate();
      toast.success(data.message);
    },
    onError: (err) => toast.error(err.message),
  });

  const analyzeMutation = trpc.autobid.analyzeDomain.useMutation({
    onSuccess: (data) => {
      utils.autobid.bidHistory.invalidate();
      toast.success(`Analysis complete: ${data.aiVerdict} (Score: ${data.seoScore}/100)`);
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMutation = trpc.autobid.approvePurchase.useMutation({
    onSuccess: (data) => {
      utils.autobid.bidHistory.invalidate();
      utils.autobid.list.invalidate();
      toast.success(`Domain ${data.domain} purchased successfully!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.autobid.rejectBid.useMutation({
    onSuccess: () => {
      utils.autobid.bidHistory.invalidate();
      toast.success("Bid rejected");
    },
  });

  // ═══ Computed ═══
  const stats = useMemo(() => {
    const total = bidHistory.length;
    const purchased = bidHistory.filter((h: any) => h.action === "purchased").length;
    const recommended = bidHistory.filter((h: any) => h.action === "recommended").length;
    const avgScore = total > 0
      ? Math.round(bidHistory.reduce((sum: number, h: any) => sum + (h.seoScore || 0), 0) / total)
      : 0;
    const totalSpent = bidHistory
      .filter((h: any) => h.action === "purchased")
      .reduce((sum: number, h: any) => sum + Number(h.bidAmount || 0), 0);
    return { total, purchased, recommended, avgScore, totalSpent };
  }, [bidHistory]);

  const pendingApprovals = useMemo(() =>
    bidHistory.filter((h: any) => h.action === "recommended"),
    [bidHistory]
  );

  // ═══ Handlers ═══
  function handleCreate() {
    createMutation.mutate({
      ...form,
      minTrustScore: form.minTrustFlow,
    });
  }

  function handleToggleStatus(rule: any) {
    const newStatus = rule.status === "active" ? "paused" : "active";
    updateMutation.mutate({ id: rule.id, status: newStatus });
  }

  function handleAnalyzeSingle() {
    if (!analyzeInput.trim()) return;
    analyzeMutation.mutate({
      domain: analyzeInput.trim(),
      askPrice: 0,
      available: true,
      ruleId: selectedRule || undefined,
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-7 w-7 text-violet-400" />
            AI Auto-Bid
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI วิเคราะห์ SEO metrics แล้วประมูล/ซื้อโดเมนอัตโนมัติตามเงื่อนไขที่คุณกำหนด
          </p>
        </div>
        <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Rule
        </Button>
        <Sheet open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <SheetContent side="bottom" className="max-w-2xl mx-auto px-6 pb-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-violet-400" />
                Create Auto-Bid Rule
              </SheetTitle>
              <SheetDescription>
                กำหนดเงื่อนไข SEO metrics ที่ต้องการ AI จะวิเคราะห์และประมูลโดเมนให้อัตโนมัติ
              </SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2">
                  <Settings2 className="h-4 w-4" /> Basic Settings
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Rule Name <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Crypto Domains"
                    />
                  </div>
                  <div>
                    <Label>Keyword <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input
                      value={form.keyword}
                      onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
                      placeholder="e.g. crypto, ai, tech"
                    />
                  </div>
                  <div>
                    <Label>TLD Filter</Label>
                    <Input
                      value={form.tld}
                      onChange={e => setForm(f => ({ ...f, tld: e.target.value }))}
                      placeholder="e.g. .com (leave empty for all)"
                    />
                  </div>
                  <div>
                    <Label>Use Case</Label>
                    <Select value={form.useCase} onValueChange={v => setForm(f => ({ ...f, useCase: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seo_build">SEO Build (สร้างเว็บ SEO)</SelectItem>
                        <SelectItem value="hold_flip">Hold & Flip (ซื้อขายต่อ)</SelectItem>
                        <SelectItem value="brand">Brand (สร้างแบรนด์)</SelectItem>
                        <SelectItem value="pbn">PBN (Private Blog Network)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Budget */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Budget
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Max Bid Per Domain ($)</Label>
                    <Input
                      type="number"
                      value={form.maxBidPerDomain}
                      onChange={e => setForm(f => ({ ...f, maxBidPerDomain: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Total Budget ($) <span className="text-red-400">*</span></Label>
                    <Input
                      type="number"
                      value={form.totalBudget}
                      onChange={e => setForm(f => ({ ...f, totalBudget: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* SEO Criteria */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> SEO Criteria (AI จะวิเคราะห์ตาม metrics เหล่านี้)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Min DA (Domain Authority)</Label>
                      <span className="text-sm text-violet-400 font-mono">{form.minDA}</span>
                    </div>
                    <Slider
                      value={[form.minDA]}
                      onValueChange={([v]) => setForm(f => ({ ...f, minDA: v }))}
                      max={100} step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Min DR (Domain Rating)</Label>
                      <span className="text-sm text-violet-400 font-mono">{form.minDR}</span>
                    </div>
                    <Slider
                      value={[form.minDR]}
                      onValueChange={([v]) => setForm(f => ({ ...f, minDR: v }))}
                      max={100} step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Max Spam Score</Label>
                      <span className="text-sm text-red-400 font-mono">{form.maxSpamScore}</span>
                    </div>
                    <Slider
                      value={[form.maxSpamScore]}
                      onValueChange={([v]) => setForm(f => ({ ...f, maxSpamScore: v }))}
                      max={100} step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Min Trust Flow</Label>
                      <span className="text-sm text-emerald-400 font-mono">{form.minTrustFlow}</span>
                    </div>
                    <Slider
                      value={[form.minTrustFlow]}
                      onValueChange={([v]) => setForm(f => ({ ...f, minTrustFlow: v }))}
                      max={100} step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Min Citation Flow</Label>
                      <span className="text-sm text-blue-400 font-mono">{form.minCitationFlow}</span>
                    </div>
                    <Slider
                      value={[form.minCitationFlow]}
                      onValueChange={([v]) => setForm(f => ({ ...f, minCitationFlow: v }))}
                      max={100} step={1}
                    />
                  </div>
                  <div>
                    <Label>Min Backlinks</Label>
                    <Input
                      type="number"
                      value={form.minBacklinks}
                      onChange={e => setForm(f => ({ ...f, minBacklinks: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>Min Referring Domains</Label>
                    <Input
                      type="number"
                      value={form.minReferringDomains}
                      onChange={e => setForm(f => ({ ...f, minReferringDomains: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              {/* Link Type Filters */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Link & Redirect Filters
                </h3>
                <div className="space-y-3">
                  {/* Link type checkboxes */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">ต้องมี Backlink จากแหล่งเหล่านี้ (เลือกได้หลายรายการ)</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: "wiki", label: "Wikipedia Link", icon: "📚" },
                        { id: "edu", label: ".edu Link", icon: "🎓" },
                        { id: "gov", label: ".gov Link", icon: "🏛️" },
                        { id: "news", label: "News Site Link", icon: "📰" },
                        { id: "social", label: "Social Media", icon: "📱" },
                        { id: "forum", label: "Forum Link", icon: "💬" },
                      ].map(lt => (
                        <label key={lt.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          form.linkTypeFilters.includes(lt.id)
                            ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-300"
                            : "bg-card border-border hover:border-cyan-500/30"
                        }`}>
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            checked={form.linkTypeFilters.includes(lt.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setForm(f => ({ ...f, linkTypeFilters: [...f.linkTypeFilters, lt.id] }));
                              } else {
                                setForm(f => ({ ...f, linkTypeFilters: f.linkTypeFilters.filter(x => x !== lt.id) }));
                              }
                            }}
                          />
                          <span className="text-sm">{lt.icon} {lt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Redirect check */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-card border">
                    <div>
                      <Label>ตรวจสอบ Redirect</Label>
                      <p className="text-xs text-muted-foreground">ตรวจสอบว่าเว็บไซต์มีการ Redirect หรือไม่</p>
                    </div>
                    <Switch
                      checked={form.checkRedirect}
                      onCheckedChange={v => setForm(f => ({ ...f, checkRedirect: v }))}
                    />
                  </div>
                  {form.checkRedirect && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-card border ml-4">
                      <div>
                        <Label>ปฏิเสธโดเมนที่ Redirect</Label>
                        <p className="text-xs text-muted-foreground">ไม่ bid โดเมนที่มีการ redirect ไปเว็บอื่น</p>
                      </div>
                      <Switch
                        checked={form.rejectRedirects}
                        onCheckedChange={v => setForm(f => ({ ...f, rejectRedirects: v }))}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Strategy */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <Target className="h-4 w-4" /> Bid Strategy
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Strategy</Label>
                    <Select value={form.bidStrategy} onValueChange={v => setForm(f => ({ ...f, bidStrategy: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conservative">Conservative (เข้มงวด)</SelectItem>
                        <SelectItem value="moderate">Moderate (สมดุล)</SelectItem>
                        <SelectItem value="aggressive">Aggressive (เปิดกว้าง)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border">
                  <div>
                    <Label>Auto-Purchase</Label>
                    <p className="text-xs text-muted-foreground">ซื้อโดเมนอัตโนมัติเมื่อผ่านเกณฑ์ (ไม่ต้องรอ approve)</p>
                  </div>
                  <Switch
                    checked={form.autoPurchase}
                    onCheckedChange={v => setForm(f => ({ ...f, autoPurchase: v, requireApproval: !v }))}
                  />
                </div>
                {form.autoPurchase && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    เปิด Auto-Purchase: AI จะซื้อโดเมนผ่าน GoDaddy อัตโนมัติเมื่อผ่านเกณฑ์ทั้งหมด โดยไม่ต้องรอ approve
                  </div>
                )}
              </div>
            </div>
            </div>
            <SheetFooter className="flex-row gap-2 pt-4 border-t border-border">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button
                className="bg-violet-600 hover:bg-violet-700 flex-1"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Rule
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card/50 border-violet-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Activity className="h-3.5 w-3.5" /> Active Rules
            </div>
            <div className="text-2xl font-bold">{rules.filter((r: any) => r.status === "active").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Search className="h-3.5 w-3.5" /> Analyzed
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <ThumbsUp className="h-3.5 w-3.5" /> Recommended
            </div>
            <div className="text-2xl font-bold text-emerald-400">{stats.recommended}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <ShoppingCart className="h-3.5 w-3.5" /> Purchased
            </div>
            <div className="text-2xl font-bold text-green-400">{stats.purchased}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" /> Total Spent
            </div>
            <div className="text-2xl font-bold text-amber-400">${stats.totalSpent.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Analyze */}
      <Card className="bg-gradient-to-r from-violet-500/10 to-blue-500/10 border-violet-500/30">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            <Brain className="h-5 w-5 text-violet-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Quick AI Analysis</h3>
              <p className="text-xs text-muted-foreground">วิเคราะห์โดเมนเดี่ยวด้วย AI SEO Engine</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
              {rules.length > 0 && (
                <Select value={selectedRule?.toString() || "none"} onValueChange={v => setSelectedRule(v === "none" ? null : Number(v))}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Use rule criteria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default criteria</SelectItem>
                    {rules.map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-2">
                <Input
                  value={analyzeInput}
                  onChange={e => setAnalyzeInput(e.target.value)}
                  placeholder="e.g. cryptoworld.com"
                  className="w-full sm:w-60"
                  onKeyDown={e => e.key === "Enter" && handleAnalyzeSingle()}
                />
                <Button
                  onClick={handleAnalyzeSingle}
                  disabled={analyzeMutation.isPending || !analyzeInput.trim()}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Analysis Result */}
          {analyzeMutation.data && (
            <div className="mt-4 p-4 rounded-lg bg-background/50 border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xl sm:text-3xl font-bold text-violet-400">{analyzeMutation.data.seoScore}</div>
                  <div>
                    <div className="text-sm font-semibold">SEO Score</div>
                    <Badge className={VERDICT_COLORS[analyzeMutation.data.aiVerdict] || ""}>
                      {analyzeMutation.data.aiVerdict}
                    </Badge>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-muted-foreground">Confidence</div>
                  <div className="font-bold">{analyzeMutation.data.aiConfidence}%</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{analyzeMutation.data.aiReasoning}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 text-xs">
                <div className="p-2 rounded bg-card text-center">
                  <div className="text-muted-foreground">DA</div>
                  <div className="font-bold text-lg">{analyzeMutation.data.estimatedDA}</div>
                </div>
                <div className="p-2 rounded bg-card text-center">
                  <div className="text-muted-foreground">DR</div>
                  <div className="font-bold text-lg">{analyzeMutation.data.estimatedDR}</div>
                </div>
                <div className="p-2 rounded bg-card text-center">
                  <div className="text-muted-foreground">Spam</div>
                  <div className="font-bold text-lg">{analyzeMutation.data.estimatedSpamScore}</div>
                </div>
                <div className="p-2 rounded bg-card text-center">
                  <div className="text-muted-foreground">Trust</div>
                  <div className="font-bold text-lg">{analyzeMutation.data.estimatedTrustFlow}</div>
                </div>
                <div className="p-2 rounded bg-card text-center">
                  <div className="text-muted-foreground">Citation</div>
                  <div className="font-bold text-lg">{analyzeMutation.data.estimatedCitationFlow}</div>
                </div>
                <div className="p-2 rounded bg-card text-center">
                  <div className="text-muted-foreground">Backlinks</div>
                  <div className="font-bold text-lg">{analyzeMutation.data.estimatedBacklinks}</div>
                </div>
                <div className="p-2 rounded bg-card text-center">
                  <div className="text-muted-foreground">Ref. Dom</div>
                  <div className="font-bold text-lg">{analyzeMutation.data.estimatedReferringDomains}</div>
                </div>
                <div className="p-2 rounded bg-card text-center">
                  <div className="text-muted-foreground">Brand</div>
                  <div className="font-bold text-lg">{analyzeMutation.data.brandability}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Market Value: </span>
                  <span className="font-bold text-emerald-400">${analyzeMutation.data.marketValue?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Price vs Value: </span>
                  <Badge variant="outline" className={
                    analyzeMutation.data.priceVsValue === "undervalued" ? "text-emerald-400" :
                    analyzeMutation.data.priceVsValue === "overvalued" ? "text-red-400" : "text-yellow-400"
                  }>
                    {analyzeMutation.data.priceVsValue}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Bid: </span>
                  <span className="font-bold">${analyzeMutation.data.recommendedMaxBid?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Meets Criteria: </span>
                  {analyzeMutation.data.meetsCriteria
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-400 inline" />
                    : <XCircle className="h-4 w-4 text-red-400 inline" />
                  }
                </div>
              </div>
              {analyzeMutation.data.strengths && analyzeMutation.data.strengths.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Strengths: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {analyzeMutation.data.strengths.map((s: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-emerald-400 text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {analyzeMutation.data.riskFactors && analyzeMutation.data.riskFactors.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Risks: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {analyzeMutation.data.riskFactors.map((r: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-red-400 text-xs">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {analyzeMutation.data.seoOpportunities && analyzeMutation.data.seoOpportunities.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">SEO Opportunities: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {analyzeMutation.data.seoOpportunities.map((o: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-blue-400 text-xs">{o}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {/* Criteria Details */}
              {analyzeMutation.data.criteriaDetails && (
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">Criteria Check:</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mt-1">
                    {analyzeMutation.data.criteriaDetails.map((c: any, i: number) => (
                      <div key={i} className={`text-xs p-1.5 rounded flex items-center gap-1 ${c.pass ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                        {c.pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span className="truncate">{c.metric}: {String(c.estimated)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Pending Approvals ({pendingApprovals.length})
            </CardTitle>
            <CardDescription>โดเมนที่ AI แนะนำให้ซื้อ รอการ approve จากคุณ</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingApprovals.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-violet-400" />
                    <div>
                      <div className="font-semibold text-sm">{h.domain}</div>
                      <div className="text-xs text-muted-foreground">
                        Score: {h.seoScore} | DA: {h.estimatedDA} | DR: {h.estimatedDR} | Spam: {h.estimatedSpamScore}
                      </div>
                    </div>
                    <Badge className={VERDICT_COLORS[h.aiVerdict] || ""}>{h.aiVerdict}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-400">${Number(h.askPrice).toFixed(2)}</span>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => approveMutation.mutate({ bidHistoryId: h.id })}
                      disabled={approveMutation.isPending}
                    >
                      {approveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                      <span className="ml-1">Buy</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-400"
                      onClick={() => rejectMutation.mutate({ bidHistoryId: h.id })}
                      disabled={rejectMutation.isPending}
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Rules / Bid History */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rules">
            <Settings2 className="h-4 w-4 mr-1" /> Rules ({rules.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-4 w-4 mr-1" /> Bid History ({bidHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-3">
          {rulesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : rules.length === 0 ? (
            <Card className="bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bot className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">ยังไม่มี Auto-Bid Rules</p>
                <p className="text-xs text-muted-foreground mt-1">สร้าง rule แรกเพื่อให้ AI เริ่มค้นหาและวิเคราะห์โดเมนให้คุณ</p>
                <Button className="mt-4 bg-violet-600 hover:bg-violet-700" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Create First Rule
                </Button>
              </CardContent>
            </Card>
          ) : (
            rules.map((rule: any) => (
              <Card key={rule.id} className={`bg-card/50 ${rule.status === "active" ? "border-violet-500/30" : "border-muted/30 opacity-70"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="font-semibold">{rule.name || `Rule #${rule.id}`}</h3>
                        <Badge variant={rule.status === "active" ? "default" : "secondary"} className={rule.status === "active" ? "bg-emerald-500/20 text-emerald-400" : ""}>
                          {rule.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{rule.useCase}</Badge>
                        <Badge variant="outline" className="text-xs">{rule.bidStrategy}</Badge>
                        {rule.autoPurchase && <Badge className="bg-amber-500/20 text-amber-400 text-xs">Auto-Buy</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3 flex-wrap">
                        <span className="flex items-center gap-1"><Search className="h-3.5 w-3.5" /> {rule.keyword}</span>
                        {rule.tld && <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> {rule.tld}</span>}
                        <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Max: ${rule.maxBidPerDomain}/domain</span>
                        <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Budget: ${rule.totalBudget}</span>
                      </div>

                      {/* SEO Criteria Display */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs">
                        <div className="p-1.5 rounded bg-background text-center">
                          <div className="text-muted-foreground">DA≥</div>
                          <div className="font-bold">{rule.minDA ?? 0}</div>
                        </div>
                        <div className="p-1.5 rounded bg-background text-center">
                          <div className="text-muted-foreground">DR≥</div>
                          <div className="font-bold">{rule.minDR ?? 0}</div>
                        </div>
                        <div className="p-1.5 rounded bg-background text-center">
                          <div className="text-muted-foreground">Spam≤</div>
                          <div className="font-bold">{rule.maxSpamScore ?? 30}</div>
                        </div>
                        <div className="p-1.5 rounded bg-background text-center">
                          <div className="text-muted-foreground">TF≥</div>
                          <div className="font-bold">{rule.minTrustFlow ?? 0}</div>
                        </div>
                        <div className="p-1.5 rounded bg-background text-center">
                          <div className="text-muted-foreground">CF≥</div>
                          <div className="font-bold">{rule.minCitationFlow ?? 0}</div>
                        </div>
                        <div className="p-1.5 rounded bg-background text-center">
                          <div className="text-muted-foreground">BL≥</div>
                          <div className="font-bold">{rule.minBacklinks ?? 0}</div>
                        </div>
                        <div className="p-1.5 rounded bg-background text-center">
                          <div className="text-muted-foreground">RD≥</div>
                          <div className="font-bold">{rule.minReferringDomains ?? 0}</div>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>Scanned: {rule.domainsScanned || 0}</span>
                        <span>Bid: {rule.domainsBid || 0}</span>
                        <span>Won: {rule.domainsWon || 0}</span>
                        <span>Spent: ${Number(rule.spent || 0).toFixed(2)} / ${rule.totalBudget}</span>
                        {rule.lastRunAt && <span>Last: {new Date(rule.lastRunAt).toLocaleString()}</span>}
                      </div>
                      {Number(rule.totalBudget) > 0 && (
                        <Progress
                          value={(Number(rule.spent || 0) / Number(rule.totalBudget)) * 100}
                          className="mt-2 h-1.5"
                        />
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleStatus(rule)}
                        disabled={updateMutation.isPending}
                        title={rule.status === "active" ? "Pause" : "Activate"}
                      >
                        {rule.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-violet-600 hover:bg-violet-700"
                        onClick={() => runMutation.mutate({ id: rule.id })}
                        disabled={runMutation.isPending || rule.status !== "active"}
                        title="Run AI scan now"
                      >
                        {runMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        <span className="ml-1 hidden sm:inline">Run</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-400"
                        onClick={() => {
                          if (confirm("Delete this rule and its history?")) deleteMutation.mutate({ id: rule.id });
                        }}
                        title="Delete rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Bid History Tab */}
        <TabsContent value="history" className="space-y-3">
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : bidHistory.length === 0 ? (
            <Card className="bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No bid history yet</p>
                <p className="text-xs text-muted-foreground mt-1">Run an auto-bid rule or analyze a domain to see history</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {bidHistory.map((h: any) => (
                <Card key={h.id} className="bg-card/50">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-violet-400">{h.seoScore || "—"}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{h.domain}</span>
                            <Badge className={ACTION_COLORS[h.action] || ""} variant="secondary">
                              {h.action}
                            </Badge>
                            {h.aiVerdict && (
                              <Badge className={VERDICT_COLORS[h.aiVerdict] || ""} variant="outline">
                                {h.aiVerdict}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                            {h.estimatedDA != null && <span>DA: {h.estimatedDA}</span>}
                            {h.estimatedDR != null && <span>DR: {h.estimatedDR}</span>}
                            {h.estimatedSpamScore != null && <span>Spam: {h.estimatedSpamScore}</span>}
                            {h.estimatedTrustFlow != null && <span>TF: {h.estimatedTrustFlow}</span>}
                            {h.estimatedBacklinks != null && <span>BL: {h.estimatedBacklinks}</span>}
                            <span>{new Date(h.createdAt).toLocaleString()}</span>
                          </div>
                          {h.aiReasoning && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{h.aiReasoning}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2 flex-shrink-0 ml-2">
                        {h.askPrice && Number(h.askPrice) > 0 && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Ask: </span>
                            <span className="font-bold">${Number(h.askPrice).toFixed(2)}</span>
                          </div>
                        )}
                        {h.action === "recommended" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                              onClick={() => approveMutation.mutate({ bidHistoryId: h.id })}
                              disabled={approveMutation.isPending}
                            >
                              <ShoppingCart className="h-3 w-3 mr-1" /> Buy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-400"
                              onClick={() => rejectMutation.mutate({ bidHistoryId: h.id })}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {h.action === "purchased" && (
                          <Badge className="bg-emerald-500/20 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Owned
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
