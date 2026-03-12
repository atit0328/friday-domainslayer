/**
 * Cloaking Settings — Full UI for managing cloaking per SEO project
 * 
 * Features:
 * - Select SEO project (domain)
 * - Configure redirect URL(s), method, countries, delay
 * - Enable/disable toggle
 * - One-click deploy to WordPress
 * - View generated PHP/JS code
 * - Bot detection tester
 * - SEO theme selection & deploy
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Eye, EyeOff, Globe, Shield, Code, Bot, Rocket, Settings2,
  Loader2, Copy, Check, AlertTriangle, Zap, RefreshCw,
  ArrowRight, Plus, Trash2, Search, Palette, Download,
  ChevronDown, ChevronUp, ExternalLink, Sparkles
} from "lucide-react";

// Country options for targeting
const COUNTRY_OPTIONS = [
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "KH", name: "Cambodia", flag: "🇰🇭" },
  { code: "LA", name: "Laos", flag: "🇱🇦" },
  { code: "MM", name: "Myanmar", flag: "🇲🇲" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
];

const REDIRECT_METHODS = [
  { value: "js", label: "JavaScript Redirect", desc: "ซ่อนจาก bot ได้ดี, ไม่ทิ้ง footprint" },
  { value: "meta", label: "Meta Refresh", desc: "HTML meta tag, ง่ายแต่ bot อาจเห็น" },
  { value: "302", label: "302 Temporary", desc: "Server redirect, เร็วแต่ bot เห็น" },
  { value: "301", label: "301 Permanent", desc: "Server redirect, ส่ง link juice ไปด้วย" },
] as const;

export default function CloakingSettings() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("config");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [testUA, setTestUA] = useState("");
  const [testIP, setTestIP] = useState("");

  // Local config state
  const [redirectUrl, setRedirectUrl] = useState("");
  const [extraUrls, setExtraUrls] = useState<string[]>([]);
  const [newExtraUrl, setNewExtraUrl] = useState("");
  const [redirectMethod, setRedirectMethod] = useState<"js" | "meta" | "302" | "301">("js");
  const [redirectDelay, setRedirectDelay] = useState([0]);
  const [targetCountries, setTargetCountries] = useState<string[]>(["TH"]);
  const [enabled, setEnabled] = useState(false);
  const [verifyBotIp, setVerifyBotIp] = useState(false);
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Queries
  const { data: projects, isLoading: loadingProjects } = trpc.seoProjects.list.useQuery();
  
  const selectedProject = useMemo(
    () => projects?.find((p: any) => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const { data: config, isLoading: loadingConfig } = trpc.cloaking.getConfig.useQuery(
    { projectId: selectedProjectId! },
    { enabled: !!selectedProjectId }
  );

  // Sync local state when config loads
  const configLoaded = config && !loadingConfig;
  const [configSynced, setConfigSynced] = useState<number | null>(null);
  if (configLoaded && configSynced !== selectedProjectId) {
    setRedirectUrl(config.redirectUrl || "");
    setExtraUrls(config.redirectUrls || []);
    setRedirectMethod(config.redirectMethod || "js");
    setRedirectDelay([config.redirectDelay || 0]);
    setTargetCountries(config.targetCountries || ["TH"]);
    setEnabled(config.enabled || false);
    setVerifyBotIp(config.verifyBotIp || false);
    setConfigSynced(selectedProjectId);
  }

  const { data: generatedCode } = trpc.cloaking.generateCode.useQuery(
    { projectId: selectedProjectId!, format: "both" },
    { enabled: !!selectedProjectId && activeTab === "code" }
  );

  const { data: supportedBots } = trpc.cloaking.getSupportedBots.useQuery(
    undefined,
    { enabled: activeTab === "bots" }
  );

  const { data: seoThemes } = trpc.seoTheme.list.useQuery(
    undefined,
    { enabled: activeTab === "theme" }
  );

  // Mutations
  const updateConfigMut = trpc.cloaking.updateConfig.useMutation({
    onSuccess: () => toast.success("บันทึกการตั้งค่า Cloaking สำเร็จ!"),
    onError: (err) => toast.error(err.message),
  });

  const deployMut = trpc.cloaking.deploy.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Deploy Cloaking สำเร็จ!");
      } else {
        const detail = "detail" in data ? (data as any).detail : "Unknown error";
        toast.error(`Deploy ล้มเหลว: ${detail}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const testBotMut = trpc.cloaking.testBotDetection.useQuery(
    { userAgent: testUA, ip: testIP || undefined },
    { enabled: false }
  );

  const deployThemeMut = trpc.seoTheme.deployTheme.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`ติดตั้งธีม SEO สำเร็จ!`);
      } else {
        toast.error(`ติดตั้งธีมล้มเหลว: ${data.detail}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const utils = trpc.useUtils();

  // Handlers
  const handleSaveConfig = () => {
    if (!selectedProjectId) return;
    updateConfigMut.mutate({
      projectId: selectedProjectId,
      config: {
        redirectUrl,
        redirectUrls: extraUrls,
        redirectMethod,
        redirectDelay: redirectDelay[0],
        targetCountries,
        enabled,
        verifyBotIp,
      },
    });
  };

  const handleDeploy = () => {
    if (!selectedProjectId || !selectedProject) return;
    if (!wpUsername || !wpAppPassword) {
      toast.error("กรุณาใส่ WordPress credentials ก่อน deploy");
      return;
    }
    if (!redirectUrl) {
      toast.error("กรุณาใส่ Redirect URL ก่อน deploy");
      return;
    }
    // Save config first, then deploy
    updateConfigMut.mutate(
      {
        projectId: selectedProjectId,
        config: {
          redirectUrl,
          redirectUrls: extraUrls,
          redirectMethod,
          redirectDelay: redirectDelay[0],
          targetCountries,
          enabled: true,
          verifyBotIp,
        },
      },
      {
        onSuccess: () => {
          deployMut.mutate({
            projectId: selectedProjectId,
            domain: selectedProject.domain,
            wpUsername,
            wpAppPassword,
          });
        },
      }
    );
  };

  const handleCopyCode = (code: string, type: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(type);
    toast.success(`คัดลอก ${type} code แล้ว!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const addExtraUrl = () => {
    if (newExtraUrl && !extraUrls.includes(newExtraUrl)) {
      setExtraUrls([...extraUrls, newExtraUrl]);
      setNewExtraUrl("");
    }
  };

  const removeExtraUrl = (url: string) => {
    setExtraUrls(extraUrls.filter(u => u !== url));
  };

  const toggleCountry = (code: string) => {
    if (targetCountries.includes(code)) {
      if (targetCountries.length > 1) {
        setTargetCountries(targetCountries.filter(c => c !== code));
      }
    } else {
      setTargetCountries([...targetCountries, code]);
    }
  };

  // Load WP credentials from project if available
  const loadWpCredentials = () => {
    if (selectedProject?.wpUsername) setWpUsername(selectedProject.wpUsername);
    if (selectedProject?.wpAppPassword) setWpAppPassword(selectedProject.wpAppPassword);
  };

  // Effect: load WP credentials when project changes
  const handleProjectChange = (id: string) => {
    const numId = Number(id);
    setSelectedProjectId(numId);
    const proj = projects?.find((p: any) => p.id === numId);
    if (proj?.wpUsername) setWpUsername(proj.wpUsername);
    if (proj?.wpAppPassword) setWpAppPassword(proj.wpAppPassword);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="w-7 h-7 text-emerald" />
            Cloaking Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ตั้งค่า Cloaking — Bot เห็น SEO content, User ไทย redirect ไปเว็บเป้าหมาย
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enabled && (
            <Badge className="bg-emerald/15 text-emerald border-emerald/30">
              <div className="w-2 h-2 rounded-full bg-emerald animate-pulse mr-1.5" />
              Cloaking Active
            </Badge>
          )}
          {!enabled && selectedProjectId && (
            <Badge variant="outline" className="text-muted-foreground">
              <EyeOff className="w-3 h-3 mr-1.5" />
              Disabled
            </Badge>
          )}
        </div>
      </div>

      {/* Project Selector */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">เลือก SEO Project</Label>
              <Select
                value={selectedProjectId?.toString() || ""}
                onValueChange={handleProjectChange}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="เลือกโดเมน..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingProjects ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                      กำลังโหลด...
                    </div>
                  ) : (
                    projects?.map((p: any) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-emerald" />
                          <span>{p.domain}</span>
                          {p.wpConnected && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1">WP</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {selectedProject && (
              <div className="flex items-end gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Domain</p>
                  <p className="text-sm font-mono font-medium">{selectedProject.domain}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Niche</p>
                  <p className="text-sm">{selectedProject.niche || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">WP Connected</p>
                  <Badge variant={selectedProject.wpConnected ? "default" : "outline"} className={selectedProject.wpConnected ? "bg-emerald/15 text-emerald" : ""}>
                    {selectedProject.wpConnected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedProjectId && (
        <Card className="border-dashed border-2 border-border/50">
          <CardContent className="py-16 text-center">
            <Eye className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">เลือก SEO Project ก่อน</h3>
            <p className="text-sm text-muted-foreground/60 mt-1">เลือกโดเมนที่ต้องการตั้งค่า Cloaking</p>
          </CardContent>
        </Card>
      )}

      {selectedProjectId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="config" className="gap-1.5">
              <Settings2 className="w-4 h-4" /> ตั้งค่า
            </TabsTrigger>
            <TabsTrigger value="deploy" className="gap-1.5">
              <Rocket className="w-4 h-4" /> Deploy
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-1.5">
              <Code className="w-4 h-4" /> Code
            </TabsTrigger>
            <TabsTrigger value="bots" className="gap-1.5">
              <Bot className="w-4 h-4" /> Bots
            </TabsTrigger>
            <TabsTrigger value="theme" className="gap-1.5">
              <Palette className="w-4 h-4" /> Theme
            </TabsTrigger>
          </TabsList>

          {/* ═══ Config Tab ═══ */}
          <TabsContent value="config" className="space-y-4 mt-4">
            {/* Enable/Disable */}
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-base font-semibold">เปิดใช้งาน Cloaking</Label>
                    <p className="text-sm text-muted-foreground">
                      เมื่อเปิด: Bot (Googlebot, Bingbot) จะเห็น SEO content | User ไทยจะถูก redirect
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={setEnabled}
                    className="data-[state=checked]:bg-emerald"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Redirect URL */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-emerald" />
                  Redirect URL
                </CardTitle>
                <CardDescription>URL ที่ user ไทยจะถูก redirect ไป</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL หลัก</Label>
                  <Input
                    value={redirectUrl}
                    onChange={(e) => setRedirectUrl(e.target.value)}
                    placeholder="https://your-target-site.com"
                    className="font-mono text-sm bg-background"
                  />
                </div>

                {/* A/B Split URLs */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    A/B Split URLs
                    <Badge variant="outline" className="text-[10px] py-0">Optional</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">เพิ่ม URL เพิ่มเติมสำหรับ A/B split testing — ระบบจะ random redirect</p>
                  
                  {extraUrls.map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={url} readOnly className="font-mono text-sm bg-muted/30 flex-1" />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExtraUrl(url)}
                        className="text-destructive hover:text-destructive shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  
                  <div className="flex items-center gap-2">
                    <Input
                      value={newExtraUrl}
                      onChange={(e) => setNewExtraUrl(e.target.value)}
                      placeholder="https://another-target.com"
                      className="font-mono text-sm bg-background flex-1"
                      onKeyDown={(e) => e.key === "Enter" && addExtraUrl()}
                    />
                    <Button variant="outline" size="icon" onClick={addExtraUrl} className="shrink-0">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Redirect Method */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-violet" />
                  Redirect Method
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {REDIRECT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      onClick={() => setRedirectMethod(method.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        redirectMethod === method.value
                          ? "border-emerald bg-emerald/5 ring-1 ring-emerald/30"
                          : "border-border/50 hover:border-border bg-background/50"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-3 h-3 rounded-full border-2 ${
                          redirectMethod === method.value ? "border-emerald bg-emerald" : "border-muted-foreground/30"
                        }`} />
                        <span className="font-medium text-sm">{method.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-5">{method.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Redirect Delay */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Redirect Delay</CardTitle>
                <CardDescription>หน่วงเวลาก่อน redirect (เฉพาะ JS method)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Slider
                    value={redirectDelay}
                    onValueChange={setRedirectDelay}
                    min={0}
                    max={10000}
                    step={500}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0ms (ทันที)</span>
                    <span className="font-mono font-medium text-foreground">{redirectDelay[0]}ms</span>
                    <span>10,000ms (10 วินาที)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Target Countries */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  Target Countries
                </CardTitle>
                <CardDescription>ประเทศที่จะถูก redirect — user จากประเทศอื่นจะเห็น SEO content</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {COUNTRY_OPTIONS.map((country) => (
                    <button
                      key={country.code}
                      onClick={() => toggleCountry(country.code)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                        targetCountries.includes(country.code)
                          ? "border-emerald bg-emerald/10 text-emerald"
                          : "border-border/50 text-muted-foreground hover:border-border"
                      }`}
                    >
                      <span className="mr-1">{country.flag}</span>
                      {country.code}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Bot IP Verification */}
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-400" />
                      Google Bot IP Verification
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      ตรวจสอบ IP จริงของ Googlebot (ป้องกัน fake bot) — อาจทำให้ช้าลงเล็กน้อย
                    </p>
                  </div>
                  <Switch
                    checked={verifyBotIp}
                    onCheckedChange={setVerifyBotIp}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (config) {
                    setRedirectUrl(config.redirectUrl || "");
                    setExtraUrls(config.redirectUrls || []);
                    setRedirectMethod(config.redirectMethod || "js");
                    setRedirectDelay([config.redirectDelay || 0]);
                    setTargetCountries(config.targetCountries || ["TH"]);
                    setEnabled(config.enabled || false);
                    setVerifyBotIp(config.verifyBotIp || false);
                  }
                }}
              >
                Reset
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={updateConfigMut.isPending}
                className="bg-emerald hover:bg-emerald/90 text-white"
              >
                {updateConfigMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                บันทึกการตั้งค่า
              </Button>
            </div>
          </TabsContent>

          {/* ═══ Deploy Tab ═══ */}
          <TabsContent value="deploy" className="space-y-4 mt-4">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="w-5 h-5 text-emerald" />
                  Deploy Cloaking to WordPress
                </CardTitle>
                <CardDescription>
                  ติดตั้ง cloaking code บน WordPress ผ่าน REST API — ใช้ functions.php + mu-plugin + header injection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status Check */}
                {!redirectUrl && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-400">ยังไม่ได้ตั้งค่า Redirect URL</p>
                      <p className="text-xs text-amber-400/70 mt-0.5">ไปที่แท็บ "ตั้งค่า" เพื่อใส่ redirect URL ก่อน deploy</p>
                    </div>
                  </div>
                )}

                {/* WP Credentials */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>WordPress Username</Label>
                    <Input
                      value={wpUsername}
                      onChange={(e) => setWpUsername(e.target.value)}
                      placeholder="admin"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>WordPress App Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={wpAppPassword}
                        onChange={(e) => setWpAppPassword(e.target.value)}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="bg-background pr-10"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {selectedProject?.wpUsername && (
                  <Button variant="ghost" size="sm" onClick={loadWpCredentials} className="text-xs">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    โหลด credentials จาก SEO Project
                  </Button>
                )}

                {/* Deploy Summary */}
                <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                  <h4 className="text-sm font-medium">สรุปการ Deploy</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Domain:</div>
                    <div className="font-mono">{selectedProject?.domain || "—"}</div>
                    <div className="text-muted-foreground">Redirect URL:</div>
                    <div className="font-mono text-emerald truncate">{redirectUrl || "—"}</div>
                    <div className="text-muted-foreground">Method:</div>
                    <div>{REDIRECT_METHODS.find(m => m.value === redirectMethod)?.label || redirectMethod}</div>
                    <div className="text-muted-foreground">Countries:</div>
                    <div>{targetCountries.join(", ")}</div>
                    <div className="text-muted-foreground">A/B URLs:</div>
                    <div>{extraUrls.length > 0 ? `${extraUrls.length + 1} URLs` : "ไม่มี"}</div>
                    <div className="text-muted-foreground">Delay:</div>
                    <div>{redirectDelay[0]}ms</div>
                  </div>
                </div>

                {/* Deploy Button */}
                <Button
                  onClick={handleDeploy}
                  disabled={deployMut.isPending || !redirectUrl || !wpUsername || !wpAppPassword}
                  className="w-full bg-emerald hover:bg-emerald/90 text-white h-12 text-base"
                >
                  {deployMut.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      กำลัง Deploy...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-5 h-5 mr-2" />
                      Deploy Cloaking to WordPress
                    </>
                  )}
                </Button>

                {/* Deploy Result */}
                {deployMut.data && (
                  <div className={`p-4 rounded-lg border ${
                    deployMut.data.success
                      ? "bg-emerald/5 border-emerald/30"
                      : "bg-destructive/5 border-destructive/30"
                  }`}>
                    <h4 className={`text-sm font-medium ${deployMut.data.success ? "text-emerald" : "text-destructive"}`}>
                      {deployMut.data.success ? "Deploy สำเร็จ!" : "Deploy ล้มเหลว"}
                    </h4>
                    {"methods" in deployMut.data && (deployMut.data as any).methods && (
                      <div className="mt-2 space-y-1">
                        {((deployMut.data as any).methods as { method: string; success: boolean; detail: string }[]).map((m, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            {m.success ? (
                              <Check className="w-3 h-3 text-emerald" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                            )}
                            <span className="font-mono">{m.method}</span>
                            <span className="text-muted-foreground">— {m.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Code Tab ═══ */}
          <TabsContent value="code" className="space-y-4 mt-4">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-violet" />
                  Generated Cloaking Code
                </CardTitle>
                <CardDescription>คัดลอก code ไปใส่ในเว็บด้วยตนเอง (ไม่ต้อง deploy ผ่าน API)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* PHP Code */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Badge className="bg-violet/15 text-violet border-violet/30">PHP</Badge>
                      WordPress functions.php / mu-plugin
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => generatedCode?.php && handleCopyCode(generatedCode.php, "PHP")}
                      disabled={!generatedCode?.php}
                    >
                      {copiedCode === "PHP" ? (
                        <Check className="w-4 h-4 text-emerald mr-1" />
                      ) : (
                        <Copy className="w-4 h-4 mr-1" />
                      )}
                      {copiedCode === "PHP" ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <pre className="p-4 rounded-lg bg-background border border-border/50 overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
                    {generatedCode?.php || "กำลังสร้าง code..."}
                  </pre>
                </div>

                {/* JS Code */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">JS</Badge>
                      JavaScript (header injection)
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => generatedCode?.js && handleCopyCode(generatedCode.js, "JS")}
                      disabled={!generatedCode?.js}
                    >
                      {copiedCode === "JS" ? (
                        <Check className="w-4 h-4 text-emerald mr-1" />
                      ) : (
                        <Copy className="w-4 h-4 mr-1" />
                      )}
                      {copiedCode === "JS" ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <pre className="p-4 rounded-lg bg-background border border-border/50 overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
                    {generatedCode?.js || "กำลังสร้าง code..."}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Bots Tab ═══ */}
          <TabsContent value="bots" className="space-y-4 mt-4">
            {/* Bot Detection Tester */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-cyan-400" />
                  Bot Detection Tester
                </CardTitle>
                <CardDescription>ทดสอบว่า User-Agent จะถูกตรวจจับเป็น bot หรือไม่</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>User-Agent String</Label>
                    <Textarea
                      value={testUA}
                      onChange={(e) => setTestUA(e.target.value)}
                      placeholder="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
                      className="bg-background font-mono text-xs min-h-[80px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>IP Address (Optional)</Label>
                    <Input
                      value={testIP}
                      onChange={(e) => setTestIP(e.target.value)}
                      placeholder="66.249.64.1"
                      className="bg-background font-mono"
                    />
                    <BotTestResult userAgent={testUA} ip={testIP} />
                  </div>
                </div>
                {/* Quick test buttons */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground self-center">Quick test:</span>
                  {[
                    { label: "Googlebot", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
                    { label: "Bingbot", ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" },
                    { label: "Chrome", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" },
                    { label: "iPhone Safari", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1" },
                  ].map((test) => (
                    <Button
                      key={test.label}
                      variant="outline"
                      size="sm"
                      onClick={() => setTestUA(test.ua)}
                      className="text-xs"
                    >
                      {test.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Supported Bots List */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-emerald" />
                  Supported Bots ({supportedBots?.length || 0})
                </CardTitle>
                <CardDescription>Bot เหล่านี้จะเห็น SEO content แทนการถูก redirect</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {supportedBots?.map((bot: string) => (
                    <div key={bot} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/30">
                      <Bot className="w-3.5 h-3.5 text-emerald shrink-0" />
                      <span className="text-xs font-mono truncate">{bot}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ Theme Tab ═══ */}
          <TabsContent value="theme" className="space-y-4 mt-4">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-violet" />
                  SEO-Optimized Themes
                </CardTitle>
                <CardDescription>ธีม WordPress ที่ได้รับการจัดอันดับตามประสิทธิภาพ SEO — เลือกและติดตั้งได้ทันที</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {seoThemes?.map((theme: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30 hover:border-border/60 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                          theme.tier === 1 ? "bg-emerald/15 text-emerald" :
                          theme.tier === 2 ? "bg-violet/15 text-violet" :
                          theme.tier === 3 ? "bg-cyan-500/15 text-cyan-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          T{theme.tier}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{theme.name}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              Speed: <span className="text-foreground font-mono">{theme.speedScore}</span>
                            </span>
                            {theme.schemaSupport && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1">Schema</Badge>
                            )}
                            {theme.mobileFriendly && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1">Mobile</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!wpUsername || !wpAppPassword) {
                            toast.error("ใส่ WP credentials ที่แท็บ Deploy ก่อน");
                            return;
                          }
                          deployThemeMut.mutate({
                            domain: selectedProject?.domain || "",
                            wpUsername,
                            wpAppPassword,
                            themeSlug: theme.slug,
                          });
                        }}
                        disabled={deployThemeMut.isPending}
                        className="shrink-0"
                      >
                        {deployThemeMut.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-3 h-3 mr-1" />
                            Install
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/**
 * Bot Test Result component — inline test using the tRPC query
 */
function BotTestResult({ userAgent, ip }: { userAgent: string; ip: string }) {
  const { data, isFetching } = trpc.cloaking.testBotDetection.useQuery(
    { userAgent, ip: ip || undefined },
    { enabled: !!userAgent && userAgent.length > 5 }
  );

  if (!userAgent || userAgent.length <= 5) return null;

  if (isFetching) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        กำลังตรวจสอบ...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={`p-3 rounded-lg border ${
      data.isBot
        ? "bg-emerald/5 border-emerald/30"
        : "bg-amber-500/5 border-amber-500/30"
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {data.isBot ? (
          <Bot className="w-4 h-4 text-emerald" />
        ) : (
          <Eye className="w-4 h-4 text-amber-400" />
        )}
        <span className={`text-sm font-medium ${data.isBot ? "text-emerald" : "text-amber-400"}`}>
          {data.isBot ? `ตรวจจับเป็น Bot: ${data.botName}` : "ไม่ใช่ Bot — จะถูก Redirect"}
        </span>
      </div>
      {data.isGoogleIp !== null && (
        <p className="text-xs text-muted-foreground pl-6">
          Google IP: {data.isGoogleIp ? "ใช่ (verified)" : "ไม่ใช่"}
        </p>
      )}
      <p className="text-xs text-muted-foreground pl-6 mt-0.5">
        {data.isBot
          ? "Bot นี้จะเห็น SEO content เต็มรูปแบบ"
          : "User นี้จะถูก redirect ไปเว็บเป้าหมาย (ถ้าอยู่ในประเทศเป้าหมาย)"}
      </p>
    </div>
  );
}
