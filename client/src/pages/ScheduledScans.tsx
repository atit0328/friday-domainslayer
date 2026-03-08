/**
 * Scheduled Scans — Automated Periodic Vulnerability Scanning
 * 
 * Features:
 * - Create/edit/delete scheduled scans
 * - View scan results history with severity breakdown
 * - Compare new vs resolved findings
 * - Run scans immediately
 * - Toggle enable/disable
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock,
  Plus,
  Play,
  Pause,
  Trash2,
  Eye,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  Activity,
  ChevronLeft,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  RefreshCw,
  Wrench,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────
interface AttackVectorResult {
  vector: string;
  category: string;
  success: boolean;
  detail: string;
  evidence?: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  exploitable: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "อา." },
  { value: 1, label: "จ." },
  { value: 2, label: "อ." },
  { value: 3, label: "พ." },
  { value: 4, label: "พฤ." },
  { value: 5, label: "ศ." },
  { value: 6, label: "ส." },
];

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "ทุกวัน",
  weekly: "ทุกสัปดาห์",
  biweekly: "ทุก 2 สัปดาห์",
  monthly: "ทุกเดือน",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  info: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

// ─── Main Component ─────────────────────────────
export default function ScheduledScans() {
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResultDetail, setShowResultDetail] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: scans, isLoading } = trpc.scheduledScans.list.useQuery();
  const { data: stats } = trpc.scheduledScans.stats.useQuery();

  const toggleMutation = trpc.scheduledScans.toggle.useMutation({
    onSuccess: (data) => {
      utils.scheduledScans.list.invalidate();
      utils.scheduledScans.stats.invalidate();
      toast.success(data.enabled ? "เปิดใช้งาน Scan แล้ว" : "ปิดใช้งาน Scan แล้ว");
    },
  });

  const deleteMutation = trpc.scheduledScans.delete.useMutation({
    onSuccess: () => {
      utils.scheduledScans.list.invalidate();
      utils.scheduledScans.stats.invalidate();
      toast.success("ลบ Scheduled Scan แล้ว");
    },
  });

  const runNowMutation = trpc.scheduledScans.runNow.useMutation({
    onSuccess: () => {
      utils.scheduledScans.list.invalidate();
      toast.success("เริ่มสแกนแล้ว — ผลลัพธ์จะปรากฏเมื่อเสร็จ");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // If viewing a specific scan's results
  if (selectedScanId !== null) {
    return (
      <ScanResultsView
        scanId={selectedScanId}
        onBack={() => setSelectedScanId(null)}
        showResultDetail={showResultDetail}
        setShowResultDetail={setShowResultDetail}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-emerald-400" />
            Scheduled Vulnerability Scans
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ตั้งเวลาสแกนช่องโหว่อัตโนมัติ พร้อมแจ้งเตือน Telegram เมื่อพบ vulnerability ใหม่
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" />
              New Scheduled Scan
            </Button>
          </DialogTrigger>
          <CreateScanDialog
            onClose={() => setShowCreateDialog(false)}
            onCreated={() => {
              setShowCreateDialog(false);
              utils.scheduledScans.list.invalidate();
              utils.scheduledScans.stats.invalidate();
            }}
          />
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Total Scans</p>
                <p className="text-2xl font-bold">{stats?.totalScans || 0}</p>
              </div>
              <CalendarClock className="w-8 h-8 text-emerald-400/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Active</p>
                <p className="text-2xl font-bold text-emerald-400">{stats?.activeScans || 0}</p>
              </div>
              <Activity className="w-8 h-8 text-emerald-400/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Total Runs</p>
                <p className="text-2xl font-bold">{stats?.totalResults || 0}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-violet-400/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Findings</p>
                <p className="text-2xl font-bold text-orange-400">{stats?.totalFindings || 0}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-400/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scans List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        </div>
      ) : !scans || scans.length === 0 ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-16 text-center">
            <CalendarClock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">ยังไม่มี Scheduled Scan</h3>
            <p className="text-sm text-muted-foreground mb-4">
              สร้าง Scheduled Scan เพื่อตรวจสอบช่องโหว่อัตโนมัติ
            </p>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              สร้าง Scheduled Scan แรก
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {scans.map((scan) => (
            <Card key={scan.id} className="bg-card/50 border-border/50 hover:border-emerald-500/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Domain & Status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Globe className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-sm truncate">{scan.domain}</span>
                      <Badge variant="outline" className={scan.enabled ? "text-emerald-400 border-emerald-500/30" : "text-zinc-500 border-zinc-500/30"}>
                        {scan.enabled ? "Active" : "Paused"}
                      </Badge>
                      {scan.lastRunStatus === "running" && (
                        <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 animate-pulse">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Running
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{FREQUENCY_LABELS[scan.frequency] || scan.frequency}</span>
                        {Array.isArray(scan.scheduleDays) && (scan.scheduleDays as number[]).length > 0 ? (
                          <span className="ml-1">
                            ({(scan.scheduleDays as number[]).map(d => DAYS_OF_WEEK[d]?.label).join(", ")})
                          </span>
                        ) : null}
                        <span>เวลา {String(scan.scheduleHour).padStart(2, "0")}:00</span>
                      </span>
                      {scan.lastRunAt && (
                        <span>
                          Last: {new Date(scan.lastRunAt).toLocaleString("th-TH")}
                        </span>
                      )}
                      {scan.nextRunAt && scan.enabled && (
                        <span className="text-emerald-400/70">
                          Next: {new Date(scan.nextRunAt).toLocaleString("th-TH")}
                        </span>
                      )}
                      <span>Runs: {scan.totalRuns}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedScanId(scan.id)}
                      className="text-xs"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Results
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runNowMutation.mutate({ id: scan.id })}
                      disabled={runNowMutation.isPending || scan.lastRunStatus === "running"}
                      className="text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                    >
                      {scan.lastRunStatus === "running" ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 mr-1" />
                      )}
                      Run Now
                    </Button>
                    <Switch
                      checked={scan.enabled}
                      onCheckedChange={() => toggleMutation.mutate({ id: scan.id })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8"
                      onClick={() => {
                        if (confirm(`ลบ scheduled scan สำหรับ ${scan.domain}?`)) {
                          deleteMutation.mutate({ id: scan.id });
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Scan Dialog ─────────────────────────
function CreateScanDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [domain, setDomain] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "biweekly" | "monthly">("weekly");
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 4]); // Mon, Thu
  const [scheduleHour, setScheduleHour] = useState(3);
  const [telegramAlert, setTelegramAlert] = useState(true);
  const [alertMinSeverity, setAlertMinSeverity] = useState<"critical" | "high" | "medium" | "low" | "info">("high");
  const [enableComprehensive, setEnableComprehensive] = useState(true);
  const [enableIndirect, setEnableIndirect] = useState(true);
  const [enableShellless, setEnableShellless] = useState(true);
  const [enableDns, setEnableDns] = useState(false);
  // Auto-Remediation
  const [autoRemediationEnabled, setAutoRemediationEnabled] = useState(false);
  const [autoRemediationDryRun, setAutoRemediationDryRun] = useState(true);
  const [autoRemediationCategories, setAutoRemediationCategories] = useState<string[]>([
    "security_headers", "ssl_tls", "clickjacking", "information_disclosure",
    "mixed_content", "session_security",
  ]);

  const { data: fixCategories } = trpc.scheduledScans.fixCategories.useQuery();

  const toggleFixCategory = (cat: string) => {
    setAutoRemediationCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const createMutation = trpc.scheduledScans.create.useMutation({
    onSuccess: () => {
      toast.success("สร้าง Scheduled Scan สำเร็จ!");
      onCreated();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const toggleDay = (day: number) => {
    setScheduleDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleCreate = () => {
    if (!domain.trim()) {
      toast.error("กรุณาระบุ domain");
      return;
    }
    createMutation.mutate({
      domain: domain.trim(),
      frequency,
      scheduleDays: frequency === "weekly" ? scheduleDays : undefined,
      scheduleHour,
      telegramAlert,
      alertMinSeverity,
      enableComprehensive,
      enableIndirect,
      enableShellless,
      enableDns,
      autoRemediationEnabled,
      autoRemediationDryRun,
      autoRemediationCategories: autoRemediationEnabled ? autoRemediationCategories : undefined,
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-emerald-400" />
          New Scheduled Scan
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Domain */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Target Domain</Label>
          <Input
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="bg-background/50"
          />
        </div>

        {/* Frequency */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Frequency</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
            <SelectTrigger className="bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">ทุกวัน</SelectItem>
              <SelectItem value="weekly">ทุกสัปดาห์</SelectItem>
              <SelectItem value="biweekly">ทุก 2 สัปดาห์</SelectItem>
              <SelectItem value="monthly">ทุกเดือน</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Day selection (for weekly) */}
        {frequency === "weekly" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">วันที่สแกน</Label>
            <div className="flex gap-1.5">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.value}
                  onClick={() => toggleDay(day.value)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    scheduleDays.includes(day.value)
                      ? "bg-emerald-600 text-white"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hour */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase text-muted-foreground">เวลาสแกน (ชั่วโมง)</Label>
          <Select value={String(scheduleHour)} onValueChange={(v) => setScheduleHour(Number(v))}>
            <SelectTrigger className="bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={String(i)}>
                  {String(i).padStart(2, "0")}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Attack Types */}
        <div className="space-y-2">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Attack Modules</Label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={enableComprehensive} onCheckedChange={setEnableComprehensive} />
              <span>Comprehensive (28 vectors)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={enableIndirect} onCheckedChange={setEnableIndirect} />
              <span>Indirect Attacks</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={enableShellless} onCheckedChange={setEnableShellless} />
              <span>Shellless Attacks</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={enableDns} onCheckedChange={setEnableDns} />
              <span>DNS Attacks</span>
            </label>
          </div>
        </div>

        {/* Auto-Remediation */}
        <div className="space-y-2 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <Label className="text-xs font-mono uppercase text-muted-foreground">Auto-Remediation</Label>
            </div>
            <Switch checked={autoRemediationEnabled} onCheckedChange={setAutoRemediationEnabled} />
          </div>
          {autoRemediationEnabled && (
            <div className="space-y-3 pl-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">โหมด Dry Run (ทดสอบก่อนแก้จริง)</p>
                  <p className="text-xs text-muted-foreground">แสดงสิ่งที่จะแก้ไขโดยไม่แก้จริง</p>
                </div>
                <Switch checked={autoRemediationDryRun} onCheckedChange={setAutoRemediationDryRun} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">ประเภทการแก้ไขอัตโนมัติ</Label>
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {(fixCategories || []).map((cat: { value: string; label: string; description: string; requiresWP: boolean }) => (
                    <button
                      key={cat.value}
                      onClick={() => toggleFixCategory(cat.value)}
                      className={`text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                        autoRemediationCategories.includes(cat.value)
                          ? "bg-amber-600/20 text-amber-300 border border-amber-500/30"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
                      }`}
                      title={cat.description}
                    >
                      <span className="font-medium">{cat.label}</span>
                      {cat.requiresWP && <span className="ml-1 text-[10px] opacity-60">(WP)</span>}
                    </button>
                  ))}
                </div>
              </div>
              {!autoRemediationDryRun && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-xs text-amber-300">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  <strong>โหมดแก้ไขจริง:</strong> AI จะแก้ไข vulnerability ที่พบโดยอัตโนมัติ (ต้องมี WP credentials สำหรับบางประเภท)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Telegram Alert */}
        <div className="space-y-2 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Telegram Alert</Label>
            <Switch checked={telegramAlert} onCheckedChange={setTelegramAlert} />
          </div>
          {telegramAlert && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">แจ้งเตือนเมื่อพบ severity ขั้นต่ำ</Label>
              <Select value={alertMinSeverity} onValueChange={(v) => setAlertMinSeverity(v as typeof alertMinSeverity)}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical เท่านั้น</SelectItem>
                  <SelectItem value="high">High ขึ้นไป</SelectItem>
                  <SelectItem value="medium">Medium ขึ้นไป</SelectItem>
                  <SelectItem value="low">Low ขึ้นไป</SelectItem>
                  <SelectItem value="info">ทุกระดับ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">ยกเลิก</Button>
        </DialogClose>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={handleCreate}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          สร้าง Scheduled Scan
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Scan Results View ──────────────────────────
function ScanResultsView({
  scanId,
  onBack,
  showResultDetail,
  setShowResultDetail,
}: {
  scanId: number;
  onBack: () => void;
  showResultDetail: number | null;
  setShowResultDetail: (id: number | null) => void;
}) {
  const [page, setPage] = useState(1);
  const [showRemediationDialog, setShowRemediationDialog] = useState(false);
  const [remDryRun, setRemDryRun] = useState(true);
  const utils = trpc.useUtils();
  const { data: scanData, isLoading: scanLoading } = trpc.scheduledScans.get.useQuery({ id: scanId });
  const { data: resultsData, isLoading: resultsLoading } = trpc.scheduledScans.results.useQuery({
    scanId,
    page,
    limit: 20,
  });
  const { data: fixCategories } = trpc.scheduledScans.fixCategories.useQuery();
  const [selectedFixCats, setSelectedFixCats] = useState<string[]>([
    "security_headers", "ssl_tls", "clickjacking", "information_disclosure",
    "mixed_content", "session_security",
  ]);

  const remediationMutation = trpc.scheduledScans.runRemediation.useMutation({
    onSuccess: (data) => {
      utils.scheduledScans.list.invalidate();
      utils.scheduledScans.results.invalidate();
      setShowRemediationDialog(false);
      if (data.fixedCount > 0) {
        toast.success(`Auto-Remediation: ${data.fixedCount} fixes applied, ${data.skippedCount} skipped`);
      } else if (data.fixableCount > 0) {
        toast.info(`Dry Run: ${data.totalFindings} vulnerabilities analyzed, ${data.fixableCount} fixable`);
      } else {
        toast.info("No auto-fixable vulnerabilities found");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  if (showResultDetail !== null) {
    return (
      <ResultDetailView
        resultId={showResultDetail}
        onBack={() => setShowResultDetail(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            {scanData?.domain || "Loading..."}
          </h2>
          <p className="text-xs text-muted-foreground">
            {scanData ? `${FREQUENCY_LABELS[scanData.frequency]} — ${scanData.totalResults} runs` : ""}
          </p>
        </div>
        {/* Run Remediation Button */}
        <Dialog open={showRemediationDialog} onOpenChange={setShowRemediationDialog}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              disabled={!scanData?.latestResult}
            >
              <Wrench className="w-4 h-4 mr-2" />
              Run Auto-Fix
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-400" />
                Auto-Remediation
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Dry Run Mode</p>
                  <p className="text-xs text-muted-foreground">\u0e41\u0e2a\u0e14\u0e07\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e08\u0e30\u0e41\u0e01\u0e49\u0e44\u0e02\u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e41\u0e01\u0e49\u0e08\u0e23\u0e34\u0e07</p>
                </div>
                <Switch checked={remDryRun} onCheckedChange={setRemDryRun} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Fix Categories</Label>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {(fixCategories || []).map((cat: { value: string; label: string; description: string; requiresWP: boolean }) => (
                    <button
                      key={cat.value}
                      onClick={() => setSelectedFixCats(prev =>
                        prev.includes(cat.value) ? prev.filter(c => c !== cat.value) : [...prev, cat.value]
                      )}
                      className={`text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                        selectedFixCats.includes(cat.value)
                          ? "bg-amber-600/20 text-amber-300 border border-amber-500/30"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
                      }`}
                      title={cat.description}
                    >
                      <span className="font-medium">{cat.label}</span>
                      {cat.requiresWP && <span className="ml-1 text-[10px] opacity-60">(WP)</span>}
                    </button>
                  ))}
                </div>
              </div>
              {!remDryRun && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-xs text-amber-300">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  <strong>\u0e42\u0e2b\u0e21\u0e14\u0e41\u0e01\u0e49\u0e44\u0e02\u0e08\u0e23\u0e34\u0e07:</strong> AI \u0e08\u0e30\u0e41\u0e01\u0e49\u0e44\u0e02 vulnerability \u0e42\u0e14\u0e22\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34
                </div>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01</Button>
              </DialogClose>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => remediationMutation.mutate({
                  scanId,
                  dryRun: remDryRun,
                  categories: selectedFixCats,
                })}
                disabled={remediationMutation.isPending}
              >
                {remediationMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                {remDryRun ? "Run Dry Test" : "Apply Fixes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Latest result summary */}
      {scanData?.latestResult && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase text-muted-foreground">Latest Scan Result</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{scanData.latestResult.totalFindings}</p>
                <p className="text-xs text-muted-foreground">Total Findings</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">{scanData.latestResult.criticalCount}</p>
                <p className="text-xs text-muted-foreground">Critical</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-400">{scanData.latestResult.highCount}</p>
                <p className="text-xs text-muted-foreground">High</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-400">{scanData.latestResult.mediumCount}</p>
                <p className="text-xs text-muted-foreground">Medium</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-400">{scanData.latestResult.lowCount}</p>
                <p className="text-xs text-muted-foreground">Low</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-400">{scanData.latestResult.exploitableCount}</p>
                <p className="text-xs text-muted-foreground">Exploitable</p>
              </div>
            </div>
            {(scanData.latestResult.newFindings > 0 || scanData.latestResult.resolvedFindings > 0) && (
              <div className="flex gap-4 mt-3 pt-3 border-t border-border/50">
                {scanData.latestResult.newFindings > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-red-400">
                    <ArrowUpRight className="w-4 h-4" />
                    {scanData.latestResult.newFindings} new vulnerabilities
                  </div>
                )}
                {scanData.latestResult.resolvedFindings > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-emerald-400">
                    <ArrowDownRight className="w-4 h-4" />
                    {scanData.latestResult.resolvedFindings} resolved
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results history */}
      <div>
        <h3 className="text-sm font-mono uppercase text-muted-foreground mb-3">Scan History</h3>
        {resultsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          </div>
        ) : !resultsData || resultsData.results.length === 0 ? (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="py-10 text-center text-muted-foreground">
              ยังไม่มีผลการสแกน — กด "Run Now" เพื่อเริ่มสแกนครั้งแรก
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {resultsData.results.map((result) => (
              <Card
                key={result.id}
                className="bg-card/50 border-border/50 hover:border-emerald-500/30 transition-colors cursor-pointer"
                onClick={() => setShowResultDetail(result.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {new Date(result.createdAt).toLocaleString("th-TH")}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            result.status === "completed"
                              ? "text-emerald-400 border-emerald-500/30"
                              : result.status === "failed"
                              ? "text-red-400 border-red-500/30"
                              : "text-yellow-400 border-yellow-500/30"
                          }
                        >
                          {result.status}
                        </Badge>
                        {result.telegramSent && (
                          <Badge variant="outline" className="text-blue-400 border-blue-500/30 text-[10px]">
                            TG Sent
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{result.totalTests} tests</span>
                        <span>{result.totalFindings} findings</span>
                        {result.criticalCount > 0 && (
                          <span className="text-red-400">{result.criticalCount} critical</span>
                        )}
                        {result.highCount > 0 && (
                          <span className="text-orange-400">{result.highCount} high</span>
                        )}
                        {result.newFindings > 0 && (
                          <span className="text-red-400 flex items-center gap-0.5">
                            <ArrowUpRight className="w-3 h-3" />
                            {result.newFindings} new
                          </span>
                        )}
                        {result.resolvedFindings > 0 && (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <ArrowDownRight className="w-3 h-3" />
                            {result.resolvedFindings} resolved
                          </span>
                        )}
                        {result.durationMs && (
                          <span>{Math.round(result.durationMs / 1000)}s</span>
                        )}
                      </div>
                    </div>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Pagination */}
            {resultsData.total > 20 && (
              <div className="flex justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground flex items-center px-3">
                  Page {page} of {Math.ceil(resultsData.total / 20)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(resultsData.total / 20)}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Result Detail View ─────────────────────────
function ResultDetailView({ resultId, onBack }: { resultId: number; onBack: () => void }) {
  const { data: result, isLoading } = trpc.scheduledScans.resultDetail.useQuery({ resultId });
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const findings = useMemo(() => {
    if (!result?.findings) return [];
    let items = (result.findings as AttackVectorResult[]).filter(f => f.success);
    if (filterSeverity !== "all") items = items.filter(f => f.severity === filterSeverity);
    if (filterCategory !== "all") items = items.filter(f => f.category === filterCategory);
    return items;
  }, [result, filterSeverity, filterCategory]);

  const categories = useMemo(() => {
    if (!result?.findings) return [];
    const cats = new Set((result.findings as AttackVectorResult[]).filter(f => f.success).map(f => f.category));
    return Array.from(cats).sort();
  }, [result]);

  const newFindings = useMemo(() => {
    if (!result?.newFindingsDetail) return [];
    return result.newFindingsDetail as AttackVectorResult[];
  }, [result]);

  const resolvedFindings = useMemo(() => {
    if (!result?.resolvedFindingsDetail) return [];
    return result.resolvedFindingsDetail as AttackVectorResult[];
  }, [result]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Result not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Scan Result Detail</h2>
          <p className="text-xs text-muted-foreground">
            {result.domain} — {new Date(result.createdAt).toLocaleString("th-TH")}
            {result.durationMs && ` — ${Math.round(result.durationMs / 1000)}s`}
          </p>
        </div>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-7 gap-3">
        {[
          { label: "Total", count: result.totalFindings, color: "text-foreground" },
          { label: "Critical", count: result.criticalCount, color: "text-red-400" },
          { label: "High", count: result.highCount, color: "text-orange-400" },
          { label: "Medium", count: result.mediumCount, color: "text-yellow-400" },
          { label: "Low", count: result.lowCount, color: "text-blue-400" },
          { label: "Info", count: result.infoCount, color: "text-zinc-400" },
          { label: "Exploitable", count: result.exploitableCount, color: "text-purple-400" },
        ].map((item) => (
          <Card key={item.label} className="bg-card/50 border-border/50">
            <CardContent className="p-3 text-center">
              <p className={`text-xl font-bold ${item.color}`}>{item.count}</p>
              <p className="text-[10px] text-muted-foreground font-mono uppercase">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New & Resolved */}
      {(newFindings.length > 0 || resolvedFindings.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {newFindings.length > 0 && (
            <Card className="bg-red-500/5 border-red-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                  <ArrowUpRight className="w-4 h-4" />
                  New Vulnerabilities ({newFindings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {newFindings.slice(0, 8).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[f.severity]}`}>
                      {f.severity}
                    </Badge>
                    <span className="truncate">{f.vector}</span>
                  </div>
                ))}
                {newFindings.length > 8 && (
                  <p className="text-xs text-muted-foreground">+{newFindings.length - 8} more</p>
                )}
              </CardContent>
            </Card>
          )}
          {resolvedFindings.length > 0 && (
            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Resolved ({resolvedFindings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {resolvedFindings.slice(0, 8).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[f.severity]}`}>
                      {f.severity}
                    </Badge>
                    <span className="truncate line-through text-muted-foreground">{f.vector}</span>
                  </div>
                ))}
                {resolvedFindings.length > 8 && (
                  <p className="text-xs text-muted-foreground">+{resolvedFindings.length - 8} more</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-[160px] bg-background/50">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[200px] bg-background/50">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground flex items-center ml-2">
          {findings.length} findings
        </span>
      </div>

      {/* Findings list */}
      <div className="space-y-2">
        {findings.map((finding, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className={`text-[10px] shrink-0 mt-0.5 ${SEVERITY_COLORS[finding.severity]}`}>
                  {finding.severity.toUpperCase()}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm">{finding.vector}</span>
                    <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted/50 rounded">
                      {finding.category}
                    </span>
                    {finding.exploitable && (
                      <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-500/30">
                        Exploitable
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{finding.detail}</p>
                  {finding.evidence && (
                    <pre className="text-[10px] text-zinc-500 mt-1 bg-black/30 p-1.5 rounded overflow-x-auto">
                      {finding.evidence}
                    </pre>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {findings.length === 0 && (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="py-8 text-center text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400/30" />
              No findings matching current filters
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
