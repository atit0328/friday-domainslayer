/**
 * SEO Command Center — Enterprise SEO Automation Dashboard
 * Shows all SEO projects with metrics, trends, and quick actions
 * Design: Dark luxury with emerald/violet accents
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Globe, Plus, TrendingUp, TrendingDown, Minus, Shield, AlertTriangle,
  Activity, Link2, BarChart3, Zap, Brain, Loader2, Trash2, Play,
  ArrowUpRight, ArrowDownRight, Target, Search, Clock, CalendarClock, RefreshCw
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function SeoCommandCenter() {

  const [, navigate] = useLocation();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  const [newStrategy, setNewStrategy] = useState<string>("grey_hat");
  const [aggressiveness, setAggressiveness] = useState(5);
  const [autoBacklink, setAutoBacklink] = useState(true);
  const [autoContent, setAutoContent] = useState(false);
  const [autoPbn, setAutoPbn] = useState(false);
  const [newKeywords, setNewKeywords] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [autoCampaign, setAutoCampaign] = useState(true);
  const [targetDays, setTargetDays] = useState(30);

  const { data: projects, isLoading } = trpc.seoProjects.list.useQuery();
  const utils = trpc.useUtils();

  const createProject = trpc.seoProjects.create.useMutation({
    onSuccess: (result) => {
      utils.seoProjects.list.invalidate();
      setShowNewProject(false);
      setNewDomain("");

      setNewKeywords("");
      setWpUsername("");
      setWpAppPassword("");
      toast.success("สร้างโปรเจคแล้ว! ระบบกำลัง Auto-Scan วิเคราะห์โดเมน + Keywords อัตโนมัติ...");
      navigate(`/seo/${result.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteProject = trpc.seoProjects.delete.useMutation({
    onSuccess: () => {
      utils.seoProjects.list.invalidate();
      toast.success("ลบโปรเจคแล้ว");
    },
  });

  const [runningAutomation, setRunningAutomation] = useState<number | null>(null);
  const [refreshingProject, setRefreshingProject] = useState<number | null>(null);
  const [scheduleProject, setScheduleProject] = useState<number | null>(null);
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 4, 5]); // Default: Mon, Tue, Thu, Fri
  const [scheduleHour, setScheduleHour] = useState(3);

  // refreshMetrics is in separate seoMetrics router to avoid tRPC router size limit
  const refreshMetrics = trpc.seoMetrics.refreshMetrics.useMutation({
    onMutate: ({ id }: { id: number }) => {
      setRefreshingProject(id);
    },
    onSuccess: (result: any) => {
      setRefreshingProject(null);
      utils.seoProjects.list.invalidate();
      const healthChange = result.oldMetrics?.healthScore != null
        ? ` (${result.newMetrics.healthScore > result.oldMetrics.healthScore ? '+' : ''}${result.newMetrics.healthScore - result.oldMetrics.healthScore})`
        : '';
      toast.success(`อัพเดท ${result.domain} สำเร็จ! DA=${result.newMetrics.da} DR=${result.newMetrics.dr} SS=${result.newMetrics.spamScore} Health=${result.newMetrics.healthScore}${healthChange}`, {
        description: `Risk: ${result.newMetrics.riskLevel} | BL: ${result.newMetrics.backlinks?.toLocaleString() || 0} | Trend: ${result.trend || 'stable'} | Moz: ${result.dataSources.moz ? '✓' : '✗'} | SimilarWeb: ${result.dataSources.similarweb ? '✓' : '✗'}`,
      });
    },
    onError: (err: any) => {
      setRefreshingProject(null);
      toast.error(`Refresh ล้มเหลว: ${err.message}`);
    },
  });

  const toggleSchedule = trpc.seoProjects.toggleSchedule.useMutation({
    onSuccess: (result) => {
      utils.seoProjects.list.invalidate();
      if (result.enabled) {
        toast.success(`เปิด Auto-Run ${result.days.length} วัน/สัปดาห์ — ${result.dayNames} ${result.hour}:00 UTC`, {
          description: `รันถัดไป: ${result.nextRunAt ? new Date(result.nextRunAt).toLocaleString("th-TH") : "-"}`,
        });
      } else {
        toast.info("ปิด Auto-Run แล้ว");
      }
      setScheduleProject(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const runAutomation = trpc.seoProjects.runFullAutomation.useMutation({
    onMutate: ({ id }) => {
      setRunningAutomation(id);
    },
    onSuccess: (result, { id }) => {
      setRunningAutomation(null);
      utils.seoProjects.list.invalidate();
      const { completed, failed, skipped } = result.summary;
      if (failed === 0) {
        toast.success(`SEO Automation สำเร็จ! ${completed}/4 ขั้นตอนเสร็จสมบูรณ์`, {
          description: "ดู report ได้ใน Dashboard > Automation Log",
          action: { label: "ดู Dashboard", onClick: () => navigate(`/seo/${id}`) },
        });
      } else {
        toast.warning(`SEO Automation: ${completed} สำเร็จ, ${failed} ล้มเหลว, ${skipped} ข้าม`, {
          description: "ดูรายละเอียดใน Dashboard > Automation Log",
          action: { label: "ดู Dashboard", onClick: () => navigate(`/seo/${id}`) },
        });
      }
    },
    onError: (err) => {
      setRunningAutomation(null);
      toast.error(`Automation ล้มเหลว: ${err.message}`);
    },
  });

  const resumeCampaign = trpc.seoProjects.resumeCampaign.useMutation({
    onSuccess: (result) => {
      utils.seoProjects.list.invalidate();
      toast.success(`Campaign resumed จาก phase ${result.fromPhase + 1}/${result.totalPhases}`, {
        description: "กำลังดำเนินการต่อ...",
      });
    },
    onError: (err) => {
      toast.error(`Resume ล้มเหลว: ${err.message}`);
    },
  });

  const handleCreate = () => {
    if (!newDomain.trim()) return;
    createProject.mutate({
      domain: newDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),

      strategy: newStrategy as any,
      aggressiveness,
      autoBacklink,
      autoContent,
      autoPbn,
      targetKeywords: newKeywords.trim() ? newKeywords.split(",").map(k => k.trim()).filter(Boolean) : undefined,
      wpUsername: wpUsername.trim() || undefined,
      wpAppPassword: wpAppPassword.trim() || undefined,
      autoCampaign,
      targetDays,
    });
  };

  const getTrendIcon = (trend?: string | null) => {
    switch (trend) {
      case "improving": return <TrendingUp className="w-4 h-4 text-emerald-400" />;
      case "declining": return <TrendingDown className="w-4 h-4 text-red-400" />;
      case "critical": return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      setup: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
      analyzing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      completed: "bg-violet-500/20 text-violet-400 border-violet-500/30",
      penalized: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return <Badge variant="outline" className={colors[status] || colors.setup}>{status.toUpperCase()}</Badge>;
  };

  const getRiskBadge = (risk?: string | null) => {
    const colors: Record<string, string> = {
      low: "bg-emerald-500/20 text-emerald-400",
      medium: "bg-yellow-500/20 text-yellow-400",
      high: "bg-orange-500/20 text-orange-400",
      critical: "bg-red-500/20 text-red-400",
    };
    if (!risk) return null;
    return <Badge variant="outline" className={colors[risk] || ""}>{risk} risk</Badge>;
  };

  const getStrategyLabel = (s: string) => {
    const labels: Record<string, string> = {
      grey_hat: "Grey Hat",
      black_hat: "Black Hat",
      aggressive_grey: "Aggressive Grey",
      pbn_focused: "PBN Focused",
      tiered_links: "Tiered Links",
      parasite_seo: "Parasite SEO",
    };
    return labels[s] || s;
  };

  // Summary stats
  const totalProjects = projects?.length || 0;
  const activeProjects = projects?.filter(p => p.status === "active").length || 0;
  const avgHealth = projects?.length
    ? Math.round(projects.reduce((sum, p) => sum + (p.aiHealthScore || 0), 0) / projects.length)
    : 0;
  const totalBacklinks = projects?.reduce((sum, p) => sum + (p.totalBacklinksBuilt || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="w-7 h-7 text-emerald-400" />
            SEO Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise SEO Automation — ใส่โดเมน AI จัดการให้ครบวงจร
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowNewProject(true)}>
              <Plus className="w-4 h-4 mr-2" /> เพิ่มโดเมน
        </Button>
        <Sheet open={showNewProject} onOpenChange={setShowNewProject}>
          <SheetContent side="bottom" className="max-w-lg mx-auto px-6 pb-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-400" />
                เพิ่มโดเมนใหม่
              </SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto flex-1 -mx-6 px-6">
            <div className="space-y-4 py-2">
              <div>
                <Label>โดเมน</Label>
                <Input
                  placeholder="example.com"
                  value={newDomain}
                  onChange={e => setNewDomain(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Keywords เป้าหมาย</Label>
                <Input
                  placeholder="e.g. casino online, เว็บพนัน, slot (คั่นด้วย ,)"
                  value={newKeywords}
                  onChange={e => setNewKeywords(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">คั่นด้วยเครื่องหมาย , (comma) — AI จะใช้ keywords เหล่านี้ในการทำ SEO</p>
              </div>
              <div>
                <Label>Strategy</Label>
                <Select value={newStrategy} onValueChange={setNewStrategy}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grey_hat">Grey Hat — สมดุลระหว่างความเสี่ยงและผลลัพธ์</SelectItem>
                    <SelectItem value="black_hat">Black Hat — เน้นผลลัพธ์สูงสุด ความเสี่ยงสูง</SelectItem>
                    <SelectItem value="aggressive_grey">Aggressive Grey — Grey Hat แบบเร่ง</SelectItem>
                    <SelectItem value="pbn_focused">PBN Focused — เน้น Private Blog Network</SelectItem>
                    <SelectItem value="tiered_links">Tiered Links — สร้าง Link แบบหลายชั้น</SelectItem>
                    <SelectItem value="parasite_seo">Parasite SEO — ใช้เว็บ Authority สูง</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Target Days — AI จะประเมิน timeline จาก keyword difficulty */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  เป้าหมาย Timeline
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ days: 3, label: "3 วัน", desc: "เร่งด่วน" }, { days: 7, label: "7 วัน", desc: "เร็ว" }, { days: 30, label: "30 วัน", desc: "มาตรฐาน" }].map(opt => (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => setTargetDays(opt.days)}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        targetDays === opt.days
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border hover:border-emerald-500/50 text-muted-foreground"
                      }`}
                    >
                      <div className="text-lg font-bold">{opt.label}</div>
                      <div className="text-[10px]">{opt.desc}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  AI จะประเมิน timeline จริงจาก keyword difficulty หลังวิเคราะห์เสร็จ
                </p>
              </div>
              <div>
                <Label>ความก้าวร้าว: {aggressiveness}/10</Label>
                <Slider
                  value={[aggressiveness]}
                  onValueChange={v => setAggressiveness(v[0])}
                  min={1} max={10} step={1}
                  className="mt-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Conservative</span>
                  <span>Moderate</span>
                  <span>Aggressive</span>
                </div>
              </div>
              {/* WordPress Credentials Section */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-400" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zM3.443 12c0-1.477.383-2.866 1.054-4.074l5.808 15.91A8.565 8.565 0 013.443 12zm8.557 8.557c-.882 0-1.73-.143-2.524-.406l2.68-7.783 2.746 7.524c.018.044.04.085.063.124a8.513 8.513 0 01-2.965.541zm1.2-12.556c.538-.028 1.022-.085 1.022-.085.481-.057.425-.764-.057-.737 0 0-1.445.114-2.376.114-.876 0-2.35-.114-2.35-.114-.481-.028-.538.708-.057.737 0 0 .457.057.938.085l1.396 3.826-1.96 5.878L7.36 7.999c.538-.028 1.022-.085 1.022-.085.481-.057.425-.764-.057-.737 0 0-1.445.114-2.376.114-.167 0-.364-.004-.57-.012A8.533 8.533 0 0112 3.443c2.124 0 4.06.778 5.553 2.063-.035-.002-.069-.008-.105-.008-.876 0-1.497.764-1.497 1.583 0 .737.425 1.36.876 2.096.34.595.737 1.36.737 2.464 0 .764-.293 1.65-.68 2.886l-.89 2.974-3.794-11.46zm4.826 11.282l2.724-7.873c.51-1.273.68-2.29.68-3.196 0-.328-.021-.633-.061-.916A8.543 8.543 0 0120.557 12a8.546 8.546 0 01-2.531 6.083z"/></svg>
                  <div>
                    <Label className="text-sm font-semibold">WordPress Connection (ไม่บังคับ)</Label>
                    <p className="text-xs text-muted-foreground">ใส่ Application Password เพื่อให้ AI แก้ไขเว็บไซต์จริง</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">WordPress Username</Label>
                  <Input
                    placeholder="admin"
                    value={wpUsername}
                    onChange={e => setWpUsername(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Application Password</Label>
                  <Input
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    value={wpAppPassword}
                    onChange={e => setWpAppPassword(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    สร้างได้ที่ WordPress Admin → Users → Profile → Application Passwords
                  </p>
                </div>
                {wpUsername && wpAppPassword && (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <div>
                      <Label className="text-xs text-emerald-400">🚀 Auto Campaign (16 เฟส)</Label>
                      <p className="text-[10px] text-muted-foreground">AI จะรัน 16 เฟส SEO อัตโนมัติ + แก้ไขเว็บจริง</p>
                    </div>
                    <Switch checked={autoCampaign} onCheckedChange={setAutoCampaign} />
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto Backlink Building</Label>
                    <p className="text-xs text-muted-foreground">AI สร้าง backlink อัตโนมัติ</p>
                  </div>
                  <Switch checked={autoBacklink} onCheckedChange={setAutoBacklink} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto Content Creation</Label>
                    <p className="text-xs text-muted-foreground">AI สร้างเนื้อหา SEO อัตโนมัติ</p>
                  </div>
                  <Switch checked={autoContent} onCheckedChange={setAutoContent} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto PBN Posting</Label>
                    <p className="text-xs text-muted-foreground">โพสต์ไปยัง PBN network อัตโนมัติ</p>
                  </div>
                  <Switch checked={autoPbn} onCheckedChange={setAutoPbn} />
                </div>
              </div>
            </div>
            </div>
            <SheetFooter className="flex-row gap-2 pt-4 border-t border-border">
              <Button variant="outline" className="flex-1" onClick={() => setShowNewProject(false)}>ยกเลิก</Button>
              <Button
                onClick={handleCreate}
                disabled={!newDomain.trim() || createProject.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 flex-1"
              >
                {createProject.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                สร้างและวิเคราะห์
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Projects</p>
                <p className="text-2xl font-bold text-emerald-400">{totalProjects}</p>
              </div>
              <Globe className="w-8 h-8 text-emerald-400/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-blue-400">{activeProjects}</p>
              </div>
              <Activity className="w-8 h-8 text-blue-400/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-violet-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Health</p>
                <p className="text-2xl font-bold text-violet-400">{avgHealth}<span className="text-sm">/100</span></p>
              </div>
              <Shield className="w-8 h-8 text-violet-400/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total BL Built</p>
                <p className="text-2xl font-bold text-amber-400">{totalBacklinks.toLocaleString()}</p>
              </div>
              <Link2 className="w-8 h-8 text-amber-400/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Dashboard Overview */}
      {projects && projects.some((p: any) => p.campaignEnabled) && (
        <Card className="bg-card/50 border-violet-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-violet-400" />
              Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {projects.filter((p: any) => p.campaignEnabled).map((project: any) => {
                const currentPhase = project.campaignPhase || 0;
                const totalPhases = project.campaignTotalPhases || 16;
                const progress = totalPhases > 0 ? Math.round((currentPhase / totalPhases) * 100) : 0;
                const status = project.campaignStatus || "idle";
                return (
                  <div
                    key={project.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/seo/${project.id}`)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold truncate">{project.domain}</span>
                        <Badge variant="outline" className={`text-[10px] ${
                          status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          status === "running" ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" :
                          status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        }`}>
                          {status === "running" && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
                          {status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              status === "completed" ? "bg-emerald-400" :
                              status === "failed" ? "bg-red-400" :
                              "bg-violet-400"
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          {currentPhase}/{totalPhases} ({progress}%)
                        </span>
                      </div>
                    </div>
                    {(status === "running" || status === "failed") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-xs bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          resumeCampaign.mutate({ id: project.id });
                        }}
                        disabled={resumeCampaign.isPending}
                      >
                        {resumeCampaign.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        <span className="ml-1">Resume</span>
                      </Button>
                    )}
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Agent Progress Dashboard */}
      <AgentProgressDashboard />

      {/* Project List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      ) : !projects?.length ? (
        <Card className="bg-card/30 border-dashed border-2 border-emerald-500/20">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Brain className="w-16 h-16 text-emerald-400/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">ยังไม่มีโปรเจค SEO</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              เพิ่มโดเมนเข้ามา AI จะวิเคราะห์และทำ SEO ให้ครบวงจรอัตโนมัติ<br />
              ติดตาม Backlink, อันดับ, Algorithm ได้แบบ real-time
            </p>
            <Button onClick={() => setShowNewProject(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> เพิ่มโดเมนแรก
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map(project => (
            <Card
              key={project.id}
              className="bg-card/50 hover:bg-card/70 transition-colors cursor-pointer border-border/50 hover:border-emerald-500/30"
              onClick={() => navigate(`/seo/${project.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Domain Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <Globe className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base truncate">{project.domain}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(project.status)}
                          <Badge variant="outline" className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 text-[10px]">
                            {getStrategyLabel(project.strategy)}
                          </Badge>
                          {project.niche && (
                            <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-[10px]">
                              {project.niche}
                            </Badge>
                          )}
                          {getRiskBadge(project.aiRiskLevel)}
                          {(project as any).wpConnected && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                              WP Connected
                            </Badge>
                          )}
                          {(project as any).campaignEnabled && (
                            <Badge variant="outline" className={`text-[10px] ${
                              (project as any).campaignStatus === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              (project as any).campaignStatus === "running" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                              "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                            }`}>
                              Campaign {(project as any).campaignProgress || 0}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Focus Keywords */}
                    {(() => {
                      const kws = (project.targetKeywords as string[] | null);
                      if (!kws || kws.length === 0) return null;
                      // Sort: short keywords first (likely actual focus keywords), long strings (article titles) last
                      const sorted = [...kws].sort((a, b) => a.length - b.length);
                      const MAX_DISPLAY = 6;
                      const displayed = sorted.slice(0, MAX_DISPLAY);
                      const remaining = sorted.length - MAX_DISPLAY;
                      return (
                        <div className="flex items-start gap-2 mt-1.5 ml-[52px]">
                          <Target className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {displayed.map((kw, i) => (
                              <span
                                key={i}
                                title={kw}
                                className="inline-block px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-medium max-w-[200px] truncate"
                              >
                                {kw}
                              </span>
                            ))}
                            {remaining > 0 && (
                              <span className="inline-block px-2 py-0.5 rounded-md bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 text-[10px] font-medium">
                                +{remaining} more
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Metrics Grid — always 3 cols min (compact 3x2 on mobile, 6 cols on md+) */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-4">
                    <div className="text-center px-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">DA</p>
                      <p className="text-base md:text-lg font-bold text-emerald-400">{project.currentDA ?? "—"}</p>
                    </div>
                    <div className="text-center px-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">DR</p>
                      <p className="text-base md:text-lg font-bold text-blue-400">{project.currentDR ?? "—"}</p>
                    </div>
                    <div className="text-center px-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Spam</p>
                      <p className={`text-base md:text-lg font-bold ${(project.currentSpamScore || 0) > 30 ? "text-red-400" : "text-emerald-400"}`}>
                        {project.currentSpamScore ?? "—"}
                      </p>
                    </div>
                    <div className="text-center px-1" title={project.currentBacklinks === 0 ? "Moz API quota หมด — กด Refresh เพื่อดึงค่าใหม่" : `Backlinks: ${project.currentBacklinks?.toLocaleString() || 'ไม่มีข้อมูล'}`}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">BL</p>
                      <p className={`text-base md:text-lg font-bold ${project.currentBacklinks ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {project.currentBacklinks != null ? project.currentBacklinks.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div className="text-center px-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Health</p>
                      <p className={`text-base md:text-lg font-bold ${
                        (project.aiHealthScore || 0) >= 70 ? "text-emerald-400" :
                        (project.aiHealthScore || 0) >= 40 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {project.aiHealthScore ?? "—"}
                      </p>
                    </div>
                    <div className="text-center px-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trend</p>
                      <div className="flex flex-col items-center gap-0.5">
                        {getTrendIcon(project.overallTrend)}
                        <span className={`text-[9px] font-mono ${
                          project.overallTrend === "improving" ? "text-emerald-400" :
                          project.overallTrend === "declining" ? "text-red-400" :
                          project.overallTrend === "critical" ? "text-red-500" :
                          project.overallTrend === "stable" ? "text-blue-400" :
                          "text-zinc-500"
                        }`}>
                          {project.overallTrend || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions — wrap on mobile */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Schedule Toggle — Weekly Auto-Run */}
                    <Popover open={scheduleProject === project.id} onOpenChange={(open) => {
                      if (open) {
                        setScheduleProject(project.id);
                        // Load existing multi-day schedule or fallback
                        const existingDays = (project as any).autoRunDays as number[] | null;
                        setScheduleDays(existingDays && existingDays.length > 0 ? existingDays : [(project as any).autoRunDay ?? 1]);
                        setScheduleHour((project as any).autoRunHour ?? 3);
                      } else {
                        setScheduleProject(null);
                      }
                    }}>
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`${
                            (project as any).autoRunEnabled
                              ? "bg-violet-500/20 text-violet-400 border-violet-500/40"
                              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                          } border`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CalendarClock className="w-4 h-4" />
                          {(project as any).autoRunEnabled && <span className="ml-1 text-xs">เปิด</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 bg-zinc-900 border-zinc-700" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                              <CalendarClock className="w-4 h-4 text-violet-400" />
                              Auto-Run ทุกสัปดาห์
                            </h4>
                            <p className="text-xs text-zinc-400 mt-1">ระบบรัน SEO อัตโนมัติทุกสัปดาห์</p>
                          </div>

                          {/* Multi-Day Selector */}
                          <div className="space-y-2">
                            <Label className="text-xs text-zinc-300">วันที่รัน</Label>
                            <div className="grid grid-cols-7 gap-1">
                              {[
                                { day: 0, label: "อา" },
                                { day: 1, label: "จ" },
                                { day: 2, label: "อ" },
                                { day: 3, label: "พ" },
                                { day: 4, label: "พฤ" },
                                { day: 5, label: "ศ" },
                                { day: 6, label: "ส" },
                              ].map(({ day, label }) => {
                                const isSelected = scheduleDays.includes(day);
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    className={`py-1.5 px-1 rounded text-xs font-medium transition-all ${
                                      isSelected
                                        ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30"
                                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                                    }`}
                                    onClick={() => {
                                      setScheduleDays(prev => {
                                        if (prev.includes(day)) {
                                          // Don't allow deselecting all days
                                          if (prev.length <= 1) return prev;
                                          return prev.filter(d => d !== day);
                                        }
                                        return [...prev, day].sort((a, b) => a - b);
                                      });
                                    }}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-xs text-zinc-500">เลือกแล้ว {scheduleDays.length} วัน/สัปดาห์</p>
                          </div>

                          {/* Time Picker */}
                          <div className="space-y-2">
                            <Label className="text-xs text-zinc-300">เวลา (UTC)</Label>
                            <Select value={String(scheduleHour)} onValueChange={(v) => setScheduleHour(Number(v))}>
                              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-800 border-zinc-700 max-h-48">
                                {Array.from({ length: 24 }, (_, i) => (
                                  <SelectItem key={i} value={String(i)}>{String(i).padStart(2, "0")}:00</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Schedule Info */}
                          {(project as any).autoRunEnabled && (project as any).nextAutoRunAt && (
                            <p className="text-xs text-zinc-400">
                              รันถัดไป: {new Date((project as any).nextAutoRunAt).toLocaleString("th-TH")}
                            </p>
                          )}
                          {(project as any).autoRunEnabled && (project as any).lastAutoRunAt && (
                            <p className="text-xs text-zinc-500">
                              รันล่าสุด: {new Date((project as any).lastAutoRunAt).toLocaleString("th-TH")} (ครั้งที่ {(project as any).autoRunCount || 0})
                            </p>
                          )}

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-1">
                            {(project as any).autoRunEnabled ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                                onClick={() => toggleSchedule.mutate({ id: project.id, enabled: false })}
                                disabled={toggleSchedule.isPending}
                              >
                                ปิด Auto-Run
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                              onClick={() => toggleSchedule.mutate({ id: project.id, enabled: true, days: scheduleDays, hour: scheduleHour })}
                              disabled={toggleSchedule.isPending || scheduleDays.length === 0}
                            >
                              {toggleSchedule.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                              {(project as any).autoRunEnabled ? "อัปเดตเวลา" : "เปิด Auto-Run"}
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Refresh Metrics — Real API (Moz + SimilarWeb) */}
                    <Button
                      size="sm"
                      variant="outline"
                      className={`${
                        refreshingProject === project.id
                          ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40 cursor-wait"
                          : "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                      } border`}
                      disabled={refreshingProject === project.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshMetrics.mutate({ id: project.id });
                      }}
                      title="Refresh DA/DR/SS/BL from Moz + SimilarWeb API"
                    >
                      {refreshingProject === project.id ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /></>
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>

                    {/* Play Button — Run Full SEO Automation */}
                    <Button
                      size="sm"
                      className={`${
                        runningAutomation === project.id
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/30 cursor-wait"
                          : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30"
                      } border font-semibold`}
                      disabled={runningAutomation === project.id || project.status === "analyzing"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`เริ่ม SEO Automation เต็มรูปแบบสำหรับ ${project.domain}?\n\n• สร้างกลยุทธ์ SEO\n• สร้าง Backlinks จาก PBN\n• สร้าง Content อัตโนมัติ\n• ตรวจสอบอันดับ Keywords`)) {
                          runAutomation.mutate({ id: project.id });
                        }
                      }}
                    >
                      {runningAutomation === project.id ? (
                        <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> กำลังทำ SEO...</>
                      ) : (
                        <><Play className="w-4 h-4 mr-1" /> SEO Auto</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/seo/${project.id}`);
                      }}
                    >
                      <BarChart3 className="w-4 h-4 mr-1" /> Dashboard
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`ลบโปรเจค ${project.domain}?`)) {
                          deleteProject.mutate({ id: project.id });
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Clean row — no AI summary text here, view details in Dashboard */}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * AI Agent Progress Dashboard — Real-time progress for all domains
 * Shows overall stats, per-domain progress, and recent activity
 */
function AgentProgressDashboard() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.seoAgent.getProgressDashboard.useQuery(undefined, {
    refetchInterval: 30_000, // Auto-refresh every 30s
  });

  if (isLoading) {
    return (
      <Card className="bg-card/50 border-emerald-500/20">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mr-2" />
          <span className="text-sm text-muted-foreground">กำลังโหลด AI Agent Dashboard...</span>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.projects.length === 0) return null;

  const { projects, overall, recentActivity } = data;

  // Task type labels
  const taskTypeLabels: Record<string, string> = {
    domain_analysis: "วิเคราะห์โดเมน",
    keyword_research: "วิจัย Keywords",
    keyword_gap_analysis: "Gap Analysis",
    onpage_audit: "On-Page Audit",
    content_plan: "วางแผน Content",
    content_create: "สร้าง Content",
    content_publish_wp: "โพส WordPress",
    backlink_plan: "วางแผน Backlink",
    backlink_build_pbn: "สร้าง PBN Link",
    backlink_build_web2: "สร้าง Web 2.0",
    backlink_build_guest: "Guest Post",
    backlink_build_social: "Social Signals",
    backlink_tier2: "Tier 2 Links",
    index_request: "ขอ Index",
    rank_check: "เช็คอันดับ",
    competitor_spy: "สอดแนมคู่แข่ง",
    strategy_review: "ทบทวนกลยุทธ์",
    wp_optimize: "Optimize WP",
    wp_fix_issues: "แก้ไข WP",
    schema_markup: "Schema Markup",
    internal_linking: "Internal Links",
    risk_assessment: "ประเมินความเสี่ยง",
    report_generate: "สร้างรายงาน",
  };

  const getTaskLabel = (type: string) => taskTypeLabels[type] || type;

  // Agent status colors
  const agentStatusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    idle: { color: "text-zinc-400 border-zinc-500/20 bg-zinc-500/10", label: "รอคำสั่ง", icon: <Clock className="w-3 h-3" /> },
    planning: { color: "text-blue-400 border-blue-500/20 bg-blue-500/10", label: "วางแผน", icon: <Brain className="w-3 h-3 animate-pulse" /> },
    executing: { color: "text-amber-400 border-amber-500/20 bg-amber-500/10", label: "กำลังทำงาน", icon: <Zap className="w-3 h-3 animate-pulse" /> },
    monitoring: { color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10", label: "ติดตามผล", icon: <Activity className="w-3 h-3" /> },
    paused: { color: "text-orange-400 border-orange-500/20 bg-orange-500/10", label: "หยุดชั่วคราว", icon: <Clock className="w-3 h-3" /> },
    failed: { color: "text-red-400 border-red-500/20 bg-red-500/10", label: "ล้มเหลว", icon: <AlertTriangle className="w-3 h-3" /> },
  };

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-semibold">AI Agent Progress</h2>
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
          LIVE
        </Badge>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tasks Today</p>
            <p className="text-xl font-bold text-emerald-400">{overall.tasksToday}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Completed</p>
            <p className="text-xl font-bold text-blue-400">{overall.tasksCompleted}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed</p>
            <p className="text-xl font-bold text-red-400">{overall.tasksFailed}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-500/10 to-violet-500/5 border-violet-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Backlinks</p>
            <p className="text-xl font-bold text-violet-400">{overall.totalBacklinks}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Content</p>
            <p className="text-xl font-bold text-amber-400">{overall.totalContent}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Domain Progress Cards */}
      <div className="grid gap-3">
        {projects.map((project) => {
          const statusCfg = agentStatusConfig[project.agentStatus] || agentStatusConfig.idle;
          const daysLeft = project.estimatedDays
            ? Math.max(0, project.estimatedDays - Math.floor((Date.now() - new Date(project.createdAt).getTime()) / 86400000))
            : null;

          return (
            <Card
              key={project.id}
              className="bg-card/50 border-emerald-500/10 hover:border-emerald-500/30 transition-all cursor-pointer"
              onClick={() => navigate(`/seo/${project.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Domain Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-mono text-sm font-semibold truncate">{project.domain}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusCfg.color}`}>
                        {statusCfg.icon}
                        <span className="ml-1">{statusCfg.label}</span>
                      </Badge>
                      {project.autoRunEnabled && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          <RefreshCw className="w-2.5 h-2.5 mr-1" />AUTO
                        </Badge>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            project.progressPercent >= 100 ? "bg-emerald-400" :
                            project.progressPercent >= 50 ? "bg-blue-400" :
                            project.progressPercent >= 25 ? "bg-amber-400" :
                            "bg-violet-400"
                          }`}
                          style={{ width: `${project.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400 shrink-0">
                        {project.progressPercent}%
                      </span>
                    </div>

                    {/* Stats Row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      {project.currentPhase && (
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          Phase: <span className="text-foreground font-medium">{project.currentPhase}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <BarChart3 className="w-3 h-3 text-blue-400" />
                        Tasks: <span className="text-foreground">{project.stats.completed}/{project.stats.totalTasks}</span>
                      </span>
                      {project.stats.pending > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          Pending: <span className="text-amber-400">{project.stats.pending}</span>
                        </span>
                      )}
                      {project.stats.todayCompleted > 0 && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                          Today: <span className="text-emerald-400">+{project.stats.todayCompleted}</span>
                        </span>
                      )}
                      {project.stats.failed > 0 && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          Failed: <span className="text-red-400">{project.stats.failed}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Side — Metrics */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {project.targetDays && (
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Target</p>
                        <p className="text-sm font-bold text-amber-400">{project.targetDays}d</p>
                      </div>
                    )}
                    {daysLeft !== null && daysLeft >= 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Remaining</p>
                        <p className={`text-sm font-bold ${daysLeft <= 3 ? "text-red-400" : daysLeft <= 7 ? "text-amber-400" : "text-emerald-400"}`}>
                          {daysLeft}d
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {project.metrics.da > 0 && (
                        <span className="text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded">DA:{project.metrics.da}</span>
                      )}
                      {project.metrics.backlinks > 0 && (
                        <span className="text-[10px] font-mono bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded">
                          <Link2 className="w-2.5 h-2.5 inline mr-0.5" />{project.metrics.backlinks}
                        </span>
                      )}
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity Feed */}
      {recentActivity.length > 0 && (
        <Card className="bg-card/50 border-zinc-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Recent AI Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentActivity.map((activity: any) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors text-xs"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    activity.status === "completed" ? "bg-emerald-400" : "bg-red-400"
                  }`} />
                  <span className="font-mono text-muted-foreground shrink-0">{activity.domain}</span>
                  <span className="text-foreground font-medium">{getTaskLabel(activity.taskType)}</span>
                  {activity.description && (
                    <span className="text-muted-foreground truncate flex-1">{activity.description}</span>
                  )}
                  <span className="text-muted-foreground shrink-0">
                    {activity.completedAt ? new Date(activity.completedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
