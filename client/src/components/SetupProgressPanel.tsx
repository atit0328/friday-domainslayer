/**
 * SetupProgressPanel — Real-time progress display for WP Auto-Setup pipeline
 * Shows progress bar, step status (running/done/skipped/failed), elapsed time
 * Auto-polls every 3 seconds while pipeline is running
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, CheckCircle, XCircle, SkipForward, Clock,
  Palette, Settings, Puzzle, FileText, BookOpen, Search, Shield, Rocket
} from "lucide-react";

interface SetupProgressPanelProps {
  projectId: number;
}

const STEP_META: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  pre_check: {
    label: "Pre-Check",
    icon: <Search className="w-4 h-4" />,
    description: "ตรวจสอบสถานะเว็บ WordPress",
  },
  theme: {
    label: "Theme",
    icon: <Palette className="w-4 h-4" />,
    description: "ติดตั้ง SEO-Optimized Theme",
  },
  basic_settings: {
    label: "Settings",
    icon: <Settings className="w-4 h-4" />,
    description: "ตั้งค่า Permalink, Title, Description",
  },
  plugins: {
    label: "Plugins",
    icon: <Puzzle className="w-4 h-4" />,
    description: "ติดตั้ง SEO Plugins (Yoast, Lazy Load)",
  },
  homepage: {
    label: "Homepage",
    icon: <FileText className="w-4 h-4" />,
    description: "สร้าง Homepage + Brand Content",
  },
  reading_settings: {
    label: "Reading",
    icon: <BookOpen className="w-4 h-4" />,
    description: "ตั้งค่า Front Page + Posts Page",
  },
  onpage_content: {
    label: "On-Page SEO",
    icon: <Search className="w-4 h-4" />,
    description: "แทรก Keywords + Meta + Schema + E-E-A-T",
  },
  cloaking: {
    label: "Cloaking",
    icon: <Shield className="w-4 h-4" />,
    description: "Deploy Cloaking (Bot → SEO, Thai → Redirect)",
  },
};

const STEP_ORDER = ["theme", "basic_settings", "plugins", "homepage", "reading_settings", "onpage_content", "cloaking"];

function getStepStatus(
  stepName: string,
  currentStep: string,
  results: Array<{ step: string; success: boolean; detail: string }>,
  pipelineStatus: string,
): "pending" | "running" | "done" | "skipped" | "failed" {
  const result = results.find(r => r.step === stepName);

  if (result) {
    if (!result.success) return "failed";
    if (result.detail.toLowerCase().startsWith("skipped")) return "skipped";
    return "done";
  }

  if (currentStep === stepName) return "running";

  // If pipeline is done but no result for this step
  if (pipelineStatus === "completed" || pipelineStatus === "failed" || pipelineStatus === "partial") {
    return "pending"; // was never reached
  }

  return "pending";
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
    case "done":
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "skipped":
      return <SkipForward className="w-4 h-4 text-amber-400" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-400" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground/40" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    running: { label: "กำลังรัน", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    done: { label: "สำเร็จ", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    skipped: { label: "ข้าม", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    failed: { label: "ล้มเหลว", className: "bg-red-500/20 text-red-400 border-red-500/30" },
    pending: { label: "รอ", className: "bg-muted text-muted-foreground border-border" },
  };
  const v = variants[status] || variants.pending;
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${v.className}`}>
      {v.label}
    </Badge>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export default function SetupProgressPanel({ projectId }: SetupProgressPanelProps) {
  const { data: progress } = trpc.seoProjects.wpSetupProgress.useQuery(
    { projectId },
    {
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return 5000;
        if (d.status === "running") return 3000;
        return false; // stop polling when done
      },
    },
  );

  const stats = useMemo(() => {
    if (!progress) return null;
    const done = progress.results.filter(r => r.success && !r.detail.toLowerCase().startsWith("skipped")).length;
    const skipped = progress.results.filter(r => r.success && r.detail.toLowerCase().startsWith("skipped")).length;
    const failed = progress.results.filter(r => !r.success).length;
    const elapsed = (progress.completedAt || Date.now()) - progress.startedAt;
    const percent = Math.round((progress.stepsCompleted / progress.totalSteps) * 100);
    return { done, skipped, failed, elapsed, percent };
  }, [progress]);

  if (!progress) return null;

  const isRunning = progress.status === "running";
  const isCompleted = progress.status === "completed";
  const isFailed = progress.status === "failed";
  const isPartial = progress.status === "partial";

  const headerColor = isRunning
    ? "text-blue-400"
    : isCompleted
      ? "text-emerald-400"
      : isFailed
        ? "text-red-400"
        : "text-amber-400";

  const headerIcon = isRunning
    ? <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
    : isCompleted
      ? <Rocket className="w-5 h-5 text-emerald-400" />
      : isFailed
        ? <XCircle className="w-5 h-5 text-red-400" />
        : <Clock className="w-5 h-5 text-amber-400" />;

  const headerText = isRunning
    ? "WP Auto-Setup กำลังทำงาน..."
    : isCompleted
      ? "WP Auto-Setup สำเร็จ!"
      : isFailed
        ? "WP Auto-Setup ล้มเหลว"
        : "WP Auto-Setup เสร็จบางส่วน";

  return (
    <Card className="bg-card/50 border-l-4 border-l-blue-500/50">
      <CardHeader className="pb-3">
        <CardTitle className={`text-sm flex items-center gap-2 ${headerColor}`}>
          {headerIcon}
          {headerText}
          {stats && (
            <span className="ml-auto text-xs text-muted-foreground font-normal flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(stats.elapsed)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.stepsCompleted}/{progress.totalSteps} steps</span>
            <span>{stats?.percent || 0}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCompleted
                  ? "bg-emerald-500"
                  : isFailed
                    ? "bg-red-500"
                    : isPartial
                      ? "bg-amber-500"
                      : "bg-blue-500"
              }`}
              style={{ width: `${stats?.percent || 0}%` }}
            />
          </div>
        </div>

        {/* Summary Badges */}
        {stats && (stats.done > 0 || stats.skipped > 0 || stats.failed > 0) && (
          <div className="flex gap-2 flex-wrap">
            {stats.done > 0 && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <CheckCircle className="w-3 h-3 mr-1" /> {stats.done} สำเร็จ
              </Badge>
            )}
            {stats.skipped > 0 && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                <SkipForward className="w-3 h-3 mr-1" /> {stats.skipped} ข้าม (Pre-Check)
              </Badge>
            )}
            {stats.failed > 0 && (
              <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">
                <XCircle className="w-3 h-3 mr-1" /> {stats.failed} ล้มเหลว
              </Badge>
            )}
          </div>
        )}

        {/* Step List */}
        <div className="space-y-1">
          {STEP_ORDER.map((stepName, idx) => {
            const meta = STEP_META[stepName] || { label: stepName, icon: null, description: "" };
            const status = getStepStatus(stepName, progress.currentStep, progress.results, progress.status);
            const result = progress.results.find(r => r.step === stepName);
            const isActive = status === "running";

            return (
              <div
                key={stepName}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-500/10 border border-blue-500/20"
                    : status === "done"
                      ? "bg-emerald-500/5"
                      : status === "failed"
                        ? "bg-red-500/5"
                        : ""
                }`}
              >
                {/* Step Number */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  status === "done" ? "bg-emerald-500/20 text-emerald-400" :
                  status === "running" ? "bg-blue-500/20 text-blue-400" :
                  status === "skipped" ? "bg-amber-500/20 text-amber-400" :
                  status === "failed" ? "bg-red-500/20 text-red-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {idx + 1}
                </div>

                {/* Icon */}
                <div className={`shrink-0 ${
                  status === "done" ? "text-emerald-400" :
                  status === "running" ? "text-blue-400" :
                  status === "skipped" ? "text-amber-400" :
                  status === "failed" ? "text-red-400" :
                  "text-muted-foreground/40"
                }`}>
                  {isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : meta.icon}
                </div>

                {/* Label + Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${
                      status === "pending" ? "text-muted-foreground/50" : "text-foreground"
                    }`}>
                      {meta.label}
                    </span>
                    <StatusBadge status={status} />
                  </div>
                  {result && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {result.detail.slice(0, 100)}
                    </p>
                  )}
                  {isActive && (
                    <p className="text-[10px] text-blue-400 mt-0.5">
                      {meta.description}
                    </p>
                  )}
                </div>

                {/* Status Icon */}
                <div className="shrink-0">
                  <StatusIcon status={status} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Current Step Detail (when running) */}
        {isRunning && progress.currentStep !== "queued" && progress.currentStep !== "initializing" && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/5 rounded-lg border border-blue-500/10">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400 shrink-0" />
            <span className="text-xs text-blue-400">
              กำลังทำ: {STEP_META[progress.currentStep]?.label || progress.currentStep}
              {" — "}
              {STEP_META[progress.currentStep]?.description || ""}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
