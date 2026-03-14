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
import ThemeLivePreview from "@/components/ThemeLivePreview";
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
  ChevronDown, ChevronUp, ExternalLink, Sparkles, MonitorPlay,
  FileText, BarChart3, X
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
  const [expandedTheme, setExpandedTheme] = useState<number | null>(null);
  const [customizerOpen, setCustomizerOpen] = useState<number | null>(null);
  const [customColors, setCustomColors] = useState<Record<number, { primary: string; secondary: string; accent: string; font: string; headingFont: string; radius: string }>>({});
  const [previewTheme, setPreviewTheme] = useState<any>(null);
  const [previewThemeIndex, setPreviewThemeIndex] = useState<number | null>(null);

  // SEO Homepage Content Generator state
  const [seoHomepageOpen, setSeoHomepageOpen] = useState<number | null>(null);
  const [seoSiteName, setSeoSiteName] = useState("");
  const [seoCustomKeywords, setSeoCustomKeywords] = useState("");
  const [seoPreviewHtml, setSeoPreviewHtml] = useState<string | null>(null);
  const [seoPreviewStats, setSeoPreviewStats] = useState<any>(null);

  // Content Spinner state
  const [spinnerOpen, setSpinnerOpen] = useState<number | null>(null);
  const [spinIntensity, setSpinIntensity] = useState<"light" | "medium" | "heavy">("medium");

  // Auto Posts state
  const [autoPostsOpen, setAutoPostsOpen] = useState<number | null>(null);
  const [autoPostCount, setAutoPostCount] = useState(15);
  const [autoPostUseLLM, setAutoPostUseLLM] = useState(false);
  const [autoPostsPreview, setAutoPostsPreview] = useState<any>(null);

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

  // SEO Homepage Content Generator mutations
  const generateSeoHomepageMut = trpc.seoHomepage.generate.useMutation({
    onSuccess: (data) => {
      setSeoPreviewHtml(data.html);
      setSeoPreviewStats({
        wordCount: data.wordCount,
        keywordDensity: data.keywordDensity,
        schemaTypes: data.schemaTypes,
        headingCount: data.headingCount,
        title: data.title,
        metaDescription: data.metaDescription,
        keywords: data.keywords,
      });
      toast.success(`SEO Homepage สร้างสำเร็จ! ${data.wordCount} คำ, KD: ${data.keywordDensity}%`);
    },
    onError: (err) => toast.error(`สร้าง SEO Homepage ล้มเหลว: ${err.message}`),
  });

  const deploySeoHomepageMut = trpc.seoHomepage.deploy.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Deploy SEO Homepage สำเร็จ! Page ID: ${data.pageId}`);
      } else {
        toast.error(`Deploy ล้มเหลว: ${data.detail}`);
      }
    },
    onError: (err) => toast.error(`Deploy ล้มเหลว: ${err.message}`),
  });

  // Content Spinner mutation
  const spinContentMut = trpc.contentSpinner.generateAndSpin.useMutation({
    onSuccess: (data) => {
      toast.success(`AI Spinner สำเร็จ! Uniqueness: ${data.uniquenessScore}% | ${data.sectionsRewritten} sections rewritten`);
      // Open preview
      const w = window.open('', '_blank', 'width=1200,height=800');
      if (w) {
        w.document.write(data.spunHtml);
        w.document.close();
      }
    },
    onError: (err) => toast.error(`Spinner ล้มเหลว: ${err.message}`),
  });

  // Auto Posts mutations
  const generatePostsMut = trpc.autoPosts.generate.useMutation({
    onSuccess: (data) => {
      setAutoPostsPreview(data);
      toast.success(`สร้าง ${data.postCount} บทความ SEO สำเร็จ! รวม ${data.totalWordCount} คำ`);
    },
    onError: (err) => toast.error(`สร้างบทความล้มเหลว: ${err.message}`),
  });

  const deployPostsMut = trpc.autoPosts.deploy.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Deploy ${data.deployed} บทความ SEO สำเร็จ!`);
      } else {
        toast.warning(`Deploy บางส่วน: ${data.deployed} สำเร็จ, ${data.failed} ล้มเหลว`);
      }
    },
    onError: (err) => toast.error(`Deploy บทความล้มเหลว: ${err.message}`),
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
                  Casino Themes
                </CardTitle>
                <CardDescription>10 ธีม WordPress Casino ออกแบบเฉพาะ (สล็อต / หวย / บาคาร่า) — SEO 2026 ครบ + Responsive ทุก Platform</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Category Legend */}
                <div className="flex flex-wrap gap-3 mb-5 pb-4 border-b border-border/30">
                  {[
                    { cat: "slots", label: "สล็อต (4 ธีม)", color: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30", icon: "🎰" },
                    { cat: "lottery", label: "หวย (3 ธีม)", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: "🎱" },
                    { cat: "baccarat", label: "บาคาร่า (3 ธีม)", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: "🃏" },
                  ].map(t => (
                    <Badge key={t.cat} variant="outline" className={`text-xs py-1 px-2 ${t.color}`}>{t.icon} {t.label}</Badge>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {seoThemes?.map((theme: any, i: number) => {
                    const catColors = theme.category === "slots" ? { bg: "border-fuchsia-500/40 hover:border-fuchsia-500/70", badge: "bg-fuchsia-500/15 text-fuchsia-400", ring: "ring-fuchsia-500/20", icon: "🎰" }
                      : theme.category === "lottery" ? { bg: "border-amber-500/40 hover:border-amber-500/70", badge: "bg-amber-500/15 text-amber-400", ring: "ring-amber-500/20", icon: "🎱" }
                      : theme.category === "baccarat" ? { bg: "border-emerald-500/40 hover:border-emerald-500/70", badge: "bg-emerald-500/15 text-emerald-400", ring: "ring-emerald-500/20", icon: "🃏" }
                      : { bg: "border-violet-500/40 hover:border-violet-500/70", badge: "bg-violet-500/15 text-violet-400", ring: "ring-violet-500/20", icon: "" };
                    const tierColors = catColors;

                    const scoreColor = (v: number) => v >= 95 ? "text-emerald-400" : v >= 90 ? "text-green-400" : v >= 80 ? "text-yellow-400" : v >= 70 ? "text-orange-400" : "text-red-400";
                    const gaugeColor = (v: number) => v >= 90 ? "bg-emerald-500" : v >= 70 ? "bg-yellow-500" : "bg-red-500";

                    return (
                      <div
                        key={i}
                        className={`group rounded-xl border bg-card/60 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:shadow-black/10 ${catColors.bg} ${expandedTheme === i ? 'ring-2 ' + catColors.ring : ''}`}
                      >
                        {/* Header: Preview + Basic Info */}
                        <div className="p-4">
                          <div className="flex gap-3">
                            {/* Theme Preview Image */}
                            <div className="w-24 h-18 sm:w-32 sm:h-24 rounded-lg overflow-hidden bg-muted/50 border border-border/30 shrink-0">
                              {theme.previewImage ? (
                                <img
                                  src={theme.previewImage}
                                  alt={`${theme.name} preview`}
                                  className="w-full h-full object-cover object-top"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Palette className="w-8 h-8 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>

                            {/* Theme Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-semibold text-sm leading-tight">{theme.name}</h3>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${catColors.badge}`}>{catColors.icon} {theme.category}</Badge>
                                    {theme.designStyle && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">{theme.designStyle}</Badge>}
                                    {theme.activeInstalls && (
                                      <span className="text-[10px] text-muted-foreground">{theme.activeInstalls}</span>
                                    )}
                                  </div>
                                </div>
                                {/* Overall SEO Score Circle */}
                                <div className="relative w-11 h-11 shrink-0">
                                  <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                                    <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                                    <circle cx="22" cy="22" r="18" fill="none" strokeWidth="3"
                                      className={scoreColor(theme.seoScore?.overall || 0)}
                                      strokeDasharray={`${((theme.seoScore?.overall || 0) / 100) * 113.1} 113.1`}
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className={`text-xs font-bold ${scoreColor(theme.seoScore?.overall || 0)}`}>{theme.seoScore?.overall || '—'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Reason */}
                              <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{theme.reason}</p>
                            </div>
                          </div>

                          {/* PageSpeed Gauges Row */}
                          {theme.pageSpeed && (
                            <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/20">
                              {[
                                { label: "Perf", value: theme.pageSpeed.performance },
                                { label: "A11y", value: theme.pageSpeed.accessibility },
                                { label: "BP", value: theme.pageSpeed.bestPractices },
                                { label: "SEO", value: theme.pageSpeed.seo },
                              ].map(ps => (
                                <div key={ps.label} className="text-center">
                                  <div className="text-[10px] text-muted-foreground mb-1">{ps.label}</div>
                                  <div className="relative h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                    <div
                                      className={`absolute inset-y-0 left-0 rounded-full transition-all ${gaugeColor(ps.value)}`}
                                      style={{ width: `${ps.value}%` }}
                                    />
                                  </div>
                                  <div className={`text-xs font-mono font-bold mt-0.5 ${scoreColor(ps.value)}`}>{ps.value}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Tags Row */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                            {theme.schemaSupport && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-500/30 text-emerald-400">Schema</Badge>}
                            {theme.mobileFriendly && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-blue-500/30 text-blue-400">Mobile</Badge>}
                            {theme.seoFeatures?.includes("aeo-blocks") && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-cyan-500/30 text-cyan-400">AEO</Badge>}
                            {theme.mobileFeatures?.includes("pwa") && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-violet-500/30 text-violet-400">PWA</Badge>}
                            {theme.tags?.slice(0, 3).map((tag: string) => (
                              <Badge key={tag} variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground/70">{tag}</Badge>
                            ))}
                            {theme.author && <span className="text-[10px] text-muted-foreground ml-auto">by {theme.author}</span>}
                          </div>
                        </div>

                        {/* Expandable SEO Score Breakdown */}
                        <div className="border-t border-border/20">
                          <button
                            onClick={() => setExpandedTheme(expandedTheme === i ? null : i)}
                            className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3" />
                              SEO Score Breakdown
                            </span>
                            {expandedTheme === i ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>

                          {expandedTheme === i && theme.seoScore && (
                            <div className="px-4 pb-3 space-y-1.5">
                              {[
                                { label: "Title Optimization", key: "titleOptimization" },
                                { label: "Meta Description", key: "metaDescription" },
                                { label: "Heading Structure", key: "headingStructure" },
                                { label: "Schema Markup", key: "schemaMarkup" },
                                { label: "Mobile Responsive", key: "mobileResponsive" },
                                { label: "Core Web Vitals", key: "coreWebVitals" },
                                { label: "Code Quality", key: "codeQuality" },
                                { label: "Image Optimization", key: "imageOptimization" },
                                { label: "Internal Linking", key: "internalLinking" },
                                { label: "Content Readability", key: "contentReadability" },
                              ].map(metric => {
                                const val = theme.seoScore[metric.key] || 0;
                                return (
                                  <div key={metric.key} className="flex items-center gap-2">
                                    <span className="text-[11px] text-muted-foreground w-32 shrink-0">{metric.label}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${gaugeColor(val)}`}
                                        style={{ width: `${val}%` }}
                                      />
                                    </div>
                                    <span className={`text-[11px] font-mono font-semibold w-7 text-right ${scoreColor(val)}`}>{val}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Theme Customizer */}
                        <div className="border-t border-border/20">
                          <button
                            onClick={() => {
                              const isOpen = customizerOpen === i;
                              setCustomizerOpen(isOpen ? null : i);
                              if (!isOpen && !customColors[i] && theme.defaultColors) {
                                setCustomColors(prev => ({
                                  ...prev,
                                  [i]: {
                                    primary: theme.defaultColors!.primary,
                                    secondary: theme.defaultColors!.secondary,
                                    accent: theme.defaultColors!.accent,
                                    font: theme.defaultColors!.fontBody,
                                    headingFont: theme.defaultColors!.fontHeading,
                                    radius: "8px",
                                  },
                                }));
                              }
                            }}
                            className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <Palette className="w-3 h-3" />
                              Customize Theme
                            </span>
                            {customizerOpen === i ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>

                          {customizerOpen === i && customColors[i] && (
                            <div className="px-4 pb-3 space-y-3">
                              {/* Color Pickers */}
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[10px] text-muted-foreground block mb-1">Primary</label>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="color"
                                      value={customColors[i].primary}
                                      onChange={(e) => setCustomColors(prev => ({ ...prev, [i]: { ...prev[i], primary: e.target.value } }))}
                                      className="w-7 h-7 rounded border border-border/30 cursor-pointer bg-transparent"
                                    />
                                    <span className="text-[10px] font-mono text-muted-foreground">{customColors[i].primary}</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground block mb-1">Secondary</label>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="color"
                                      value={customColors[i].secondary}
                                      onChange={(e) => setCustomColors(prev => ({ ...prev, [i]: { ...prev[i], secondary: e.target.value } }))}
                                      className="w-7 h-7 rounded border border-border/30 cursor-pointer bg-transparent"
                                    />
                                    <span className="text-[10px] font-mono text-muted-foreground">{customColors[i].secondary}</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground block mb-1">Accent</label>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="color"
                                      value={customColors[i].accent}
                                      onChange={(e) => setCustomColors(prev => ({ ...prev, [i]: { ...prev[i], accent: e.target.value } }))}
                                      className="w-7 h-7 rounded border border-border/30 cursor-pointer bg-transparent"
                                    />
                                    <span className="text-[10px] font-mono text-muted-foreground">{customColors[i].accent}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Font Selectors */}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] text-muted-foreground block mb-1">Heading Font</label>
                                  <select
                                    value={customColors[i].headingFont}
                                    onChange={(e) => setCustomColors(prev => ({ ...prev, [i]: { ...prev[i], headingFont: e.target.value } }))}
                                    className="w-full text-xs bg-background border border-border/30 rounded px-2 py-1.5"
                                  >
                                    {["Orbitron", "Playfair Display", "Rajdhani", "Noto Serif Thai", "Kanit", "Space Grotesk", "Bungee", "Cormorant Garamond", "Cinzel", "Noto Sans Thai", "Montserrat", "Poppins"].map(f => (
                                      <option key={f} value={f}>{f}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground block mb-1">Body Font</label>
                                  <select
                                    value={customColors[i].font}
                                    onChange={(e) => setCustomColors(prev => ({ ...prev, [i]: { ...prev[i], font: e.target.value } }))}
                                    className="w-full text-xs bg-background border border-border/30 rounded px-2 py-1.5"
                                  >
                                    {["Inter", "Lora", "Source Sans 3", "Sarabun", "Prompt", "DM Sans", "Nunito", "EB Garamond", "Crimson Text", "Mitr", "Roboto", "Open Sans"].map(f => (
                                      <option key={f} value={f}>{f}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Border Radius */}
                              <div>
                                <label className="text-[10px] text-muted-foreground block mb-1">Border Radius: {customColors[i].radius}</label>
                                <input
                                  type="range"
                                  min="0"
                                  max="24"
                                  value={parseInt(customColors[i].radius)}
                                  onChange={(e) => setCustomColors(prev => ({ ...prev, [i]: { ...prev[i], radius: `${e.target.value}px` } }))}
                                  className="w-full h-1.5 accent-emerald-500"
                                />
                              </div>

                              {/* Reset Button */}
                              {theme.defaultColors && (
                                <button
                                  onClick={() => setCustomColors(prev => ({
                                    ...prev,
                                    [i]: {
                                      primary: theme.defaultColors!.primary,
                                      secondary: theme.defaultColors!.secondary,
                                      accent: theme.defaultColors!.accent,
                                      font: theme.defaultColors!.fontBody,
                                      headingFont: theme.defaultColors!.fontHeading,
                                      radius: "8px",
                                    },
                                  }))}
                                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                                >
                                  <RefreshCw className="w-3 h-3" /> Reset to Default
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Live Preview + SEO Content + Install Buttons */}
                        <div className="px-4 pb-1 pt-1 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setPreviewTheme(theme);
                              setPreviewThemeIndex(i);
                            }}
                          >
                            <MonitorPlay className="w-3 h-3 mr-1" />
                            Live Preview
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              if (!wpUsername || !wpAppPassword) {
                                toast.error("ใส่ WP credentials ที่แท็บ Deploy ก่อน");
                                return;
                              }
                              const custom = customColors[i];
                              deployThemeMut.mutate({
                                domain: selectedProject?.domain || "",
                                wpUsername,
                                wpAppPassword,
                                themeSlug: theme.slug,
                                ...(custom ? {
                                  customization: {
                                    primaryColor: custom.primary,
                                    secondaryColor: custom.secondary,
                                    accentColor: custom.accent,
                                    fontFamily: custom.font,
                                    headingFont: custom.headingFont,
                                    borderRadius: custom.radius,
                                  },
                                } : {}),
                              });
                            }}
                            disabled={deployThemeMut.isPending}
                          >
                            {deployThemeMut.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Download className="w-3 h-3 mr-1" />
                            )}
                            {customColors[i] && customizerOpen === i ? 'Install with Custom Style' : 'Install Theme'}
                          </Button>
                        </div>

                        {/* SEO Homepage Content Button */}
                        <div className="px-4 pb-3 pt-1">
                          <Button
                            variant={seoHomepageOpen === i ? "default" : "outline"}
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              if (seoHomepageOpen === i) {
                                setSeoHomepageOpen(null);
                                setSeoPreviewHtml(null);
                                setSeoPreviewStats(null);
                              } else {
                                setSeoHomepageOpen(i);
                                // Auto-fill site name from project
                                if (!seoSiteName && selectedProject?.domain) {
                                  setSeoSiteName(selectedProject.domain.replace(/^https?:\/\//, '').replace(/\..+$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
                                }
                              }
                            }}
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            {seoHomepageOpen === i ? 'ปิด SEO Content Panel' : 'สร้าง SEO Homepage Content'}
                          </Button>
                        </div>

                        {/* SEO Homepage Content Panel (inline) */}
                        {seoHomepageOpen === i && (
                          <div className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3 bg-card/30">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="w-4 h-4 text-amber-400" />
                              <span className="text-xs font-semibold text-amber-400">สร้าง SEO Homepage สำหรับ Bot Google</span>
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-amber-400 border-amber-500/30">{theme.category}</Badge>
                            </div>

                            {/* Site Name */}
                            <div>
                              <label className="text-[10px] text-muted-foreground block mb-1">ชื่อเว็บ (Site Name)</label>
                              <Input
                                value={seoSiteName}
                                onChange={(e) => setSeoSiteName(e.target.value)}
                                placeholder="เช่น Lucky888, สล็อตเว็บตรง"
                                className="h-8 text-xs"
                              />
                            </div>

                            {/* Custom Keywords */}
                            <div>
                              <label className="text-[10px] text-muted-foreground block mb-1">คีย์เวิร์ดเพิ่มเติม (คั่นด้วยจุลภาค, ไม่บังคับ)</label>
                              <Input
                                value={seoCustomKeywords}
                                onChange={(e) => setSeoCustomKeywords(e.target.value)}
                                placeholder="สล็อตเว็บตรง, สล็อตแตกง่าย, สล็อต PG"
                                className="h-8 text-xs"
                              />
                            </div>

                            {/* Auto-detected info */}
                            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">โดเมน:</span>
                                <span className="font-mono text-xs">{selectedProject?.domain || '-'}</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">หมวดหมู่:</span>
                                <span className="font-mono text-xs">{theme.category === 'slots' ? 'สล็อต' : theme.category === 'lottery' ? 'หวย' : 'บาคาร่า'}</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">ธีม:</span>
                                <span className="font-mono text-xs">{theme.name} ({theme.slug})</span>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                onClick={() => {
                                  if (!selectedProject?.domain) {
                                    toast.error("เลือกโปรเจคต์ก่อน");
                                    return;
                                  }
                                  generateSeoHomepageMut.mutate({
                                    domain: selectedProject.domain,
                                    siteName: seoSiteName || selectedProject.domain,
                                    category: theme.category,
                                    themeSlug: theme.slug,
                                    customKeywords: seoCustomKeywords ? seoCustomKeywords.split(',').map((k: string) => k.trim()).filter(Boolean) : undefined,
                                  });
                                }}
                                disabled={generateSeoHomepageMut.isPending}
                              >
                                {generateSeoHomepageMut.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Sparkles className="w-3 h-3 mr-1" />
                                )}
                                สร้าง + Preview
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={() => {
                                  if (!selectedProject?.domain || !wpUsername || !wpAppPassword) {
                                    toast.error("ใส่ WP credentials ที่แท็บ Deploy ก่อน");
                                    return;
                                  }
                                  deploySeoHomepageMut.mutate({
                                    domain: selectedProject.domain,
                                    siteName: seoSiteName || selectedProject.domain,
                                    category: theme.category,
                                    themeSlug: theme.slug,
                                    customKeywords: seoCustomKeywords ? seoCustomKeywords.split(',').map((k: string) => k.trim()).filter(Boolean) : undefined,
                                    wpUsername,
                                    wpAppPassword,
                                  });
                                }}
                                disabled={deploySeoHomepageMut.isPending}
                              >
                                {deploySeoHomepageMut.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Rocket className="w-3 h-3 mr-1" />
                                )}
                                Deploy หน้าแรก WP
                              </Button>
                            </div>

                            {/* Stats Preview */}
                            {seoPreviewStats && seoHomepageOpen === i && (
                              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-xs font-semibold text-emerald-400">SEO Stats</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">จำนวนคำ:</span>
                                    <span className="ml-1 font-bold text-emerald-400">{seoPreviewStats.wordCount}</span>
                                  </div>
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">Keyword Density:</span>
                                    <span className="ml-1 font-bold text-emerald-400">{seoPreviewStats.keywordDensity}%</span>
                                  </div>
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">H1:</span>
                                    <span className="ml-1 font-bold">{seoPreviewStats.headingCount.h1}</span>
                                    <span className="text-muted-foreground ml-2">H2:</span>
                                    <span className="ml-1 font-bold">{seoPreviewStats.headingCount.h2}</span>
                                    <span className="text-muted-foreground ml-2">H3:</span>
                                    <span className="ml-1 font-bold">{seoPreviewStats.headingCount.h3}</span>
                                  </div>
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">Schema:</span>
                                    <span className="ml-1 font-bold">{seoPreviewStats.schemaTypes.length} types</span>
                                  </div>
                                </div>
                                <div className="text-[9px] text-muted-foreground">
                                  <strong>Schema:</strong> {seoPreviewStats.schemaTypes.join(', ')}
                                </div>
                                <div className="text-[9px] text-muted-foreground line-clamp-2">
                                  <strong>Title:</strong> {seoPreviewStats.title}
                                </div>
                                {/* Preview Button */}
                                {seoPreviewHtml && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full mt-1 text-xs"
                                    onClick={() => {
                                      const w = window.open('', '_blank', 'width=1200,height=800');
                                      if (w) {
                                        w.document.write(seoPreviewHtml!);
                                        w.document.close();
                                      }
                                    }}
                                  >
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    เปิดดูตัวอย่าง SEO Homepage
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ═══ AI Content Spinner Button ═══ */}
                        <div className="px-4 pb-2 pt-1">
                          <Button
                            variant={spinnerOpen === i ? "default" : "outline"}
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              if (spinnerOpen === i) {
                                setSpinnerOpen(null);
                              } else {
                                setSpinnerOpen(i);
                                setAutoPostsOpen(null);
                              }
                            }}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            {spinnerOpen === i ? 'ปิด Content Spinner' : '🤖 AI Content Spinner'}
                          </Button>
                        </div>

                        {/* Content Spinner Panel */}
                        {spinnerOpen === i && (
                          <div className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3 bg-card/30">
                            <div className="flex items-center gap-2 mb-2">
                              <RefreshCw className="w-4 h-4 text-purple-400" />
                              <span className="text-xs font-semibold text-purple-400">AI Content Spinner — สร้าง Content ไม่ซ้ำใคร</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              ใช้ LLM rewrite content ทั้งหน้า ให้ไม่ซ้ำกับโดเมนอื่น — Google ไม่ตรวจจับ duplicate content
                            </p>

                            {/* Spin Intensity */}
                            <div>
                              <label className="text-[10px] text-muted-foreground block mb-1">ระดับการ Rewrite</label>
                              <div className="flex gap-2">
                                {(["light", "medium", "heavy"] as const).map(level => (
                                  <Button
                                    key={level}
                                    size="sm"
                                    variant={spinIntensity === level ? "default" : "outline"}
                                    className="flex-1 text-[10px] h-7"
                                    onClick={() => setSpinIntensity(level)}
                                  >
                                    {level === "light" ? "🟢 เบา" : level === "medium" ? "🟡 ปานกลาง" : "🔴 หนัก"}
                                  </Button>
                                ))}
                              </div>
                              <p className="text-[9px] text-muted-foreground mt-1">
                                {spinIntensity === "light" ? "เปลี่ยนแค่คำ synonym — เร็ว, uniqueness ~30-50%" :
                                 spinIntensity === "medium" ? "Rewrite ทั้ง paragraph — สมดุล, uniqueness ~50-70%" :
                                 "Rewrite ใหม่ทั้งหมด — ช้า, uniqueness ~70-90%"}
                              </p>
                            </div>

                            {/* Generate + Spin Button */}
                            <Button
                              size="sm"
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                              onClick={() => {
                                if (!selectedProject) return;
                                spinContentMut.mutate({
                                  domain: selectedProject.domain,
                                  siteName: seoSiteName || selectedProject.domain,
                                  category: theme.category,
                                  themeSlug: theme.slug,
                                  intensity: spinIntensity,
                                });
                              }}
                              disabled={spinContentMut.isPending}
                            >
                              {spinContentMut.isPending ? (
                                <><Loader2 className="w-3 h-3 animate-spin mr-1" /> กำลัง Spin Content (อาจใช้เวลา 30-60 วินาที)...</>
                              ) : (
                                <><Sparkles className="w-3 h-3 mr-1" /> Generate + Spin Content</>
                              )}
                            </Button>

                            {/* Spin Result Stats */}
                            {spinContentMut.data && (
                              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                                  <span className="text-xs font-semibold text-purple-400">Spin Results</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">Uniqueness:</span>
                                    <span className="ml-1 font-bold text-purple-400">{spinContentMut.data.uniquenessScore}%</span>
                                  </div>
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">Sections:</span>
                                    <span className="ml-1 font-bold">{spinContentMut.data.sectionsRewritten} rewritten</span>
                                  </div>
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">Keywords:</span>
                                    <span className="ml-1 font-bold">{spinContentMut.data.keywordsPreserved} preserved</span>
                                  </div>
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">Time:</span>
                                    <span className="ml-1 font-bold">{Math.round(spinContentMut.data.processingTimeMs / 1000)}s</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ═══ Auto-Generate SEO Posts Button ═══ */}
                        <div className="px-4 pb-3 pt-1">
                          <Button
                            variant={autoPostsOpen === i ? "default" : "outline"}
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              if (autoPostsOpen === i) {
                                setAutoPostsOpen(null);
                                setAutoPostsPreview(null);
                              } else {
                                setAutoPostsOpen(i);
                                setSpinnerOpen(null);
                              }
                            }}
                          >
                            <BarChart3 className="w-3 h-3 mr-1" />
                            {autoPostsOpen === i ? 'ปิด Auto Posts' : '📚 Auto-Generate SEO Posts'}
                          </Button>
                        </div>

                        {/* Auto Posts Panel */}
                        {autoPostsOpen === i && (
                          <div className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3 bg-card/30">
                            <div className="flex items-center gap-2 mb-2">
                              <BarChart3 className="w-4 h-4 text-cyan-400" />
                              <span className="text-xs font-semibold text-cyan-400">Auto-Generate SEO Posts (10-20 บทความ)</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              สร้างบทความ SEO อัตโนมัติ 10-20 posts พร้อม internal links กลับหน้าแรก — เสริม link structure ให้ Google ranking
                            </p>

                            {/* Post Count Slider */}
                            <div>
                              <label className="text-[10px] text-muted-foreground block mb-1">จำนวนบทความ: <strong className="text-cyan-400">{autoPostCount}</strong></label>
                              <Slider
                                value={[autoPostCount]}
                                onValueChange={([v]) => setAutoPostCount(v)}
                                min={5}
                                max={20}
                                step={1}
                                className="mt-1"
                              />
                              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                                <span>5 posts</span>
                                <span>20 posts</span>
                              </div>
                            </div>

                            {/* LLM Rewrite Toggle */}
                            <div className="flex items-center justify-between bg-background/50 rounded-lg p-2">
                              <div>
                                <span className="text-[10px] font-medium">🤖 LLM Rewrite</span>
                                <p className="text-[9px] text-muted-foreground">ใช้ AI rewrite ทุกบทความให้ไม่ซ้ำ (ช้ากว่า แต่ unique 100%)</p>
                              </div>
                              <Switch checked={autoPostUseLLM} onCheckedChange={setAutoPostUseLLM} />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs"
                                onClick={() => {
                                  if (!selectedProject) return;
                                  generatePostsMut.mutate({
                                    domain: selectedProject.domain,
                                    siteName: seoSiteName || selectedProject.domain,
                                    category: theme.category,
                                    themeSlug: theme.slug,
                                    postCount: autoPostCount,
                                    customKeywords: seoCustomKeywords ? seoCustomKeywords.split(',').map((k: string) => k.trim()).filter(Boolean) : undefined,
                                  });
                                }}
                                disabled={generatePostsMut.isPending}
                              >
                                {generatePostsMut.isPending ? (
                                  <><Loader2 className="w-3 h-3 animate-spin mr-1" /> กำลังสร้าง...</>
                                ) : (
                                  <><Search className="w-3 h-3 mr-1" /> Preview Posts</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 text-xs bg-cyan-600 hover:bg-cyan-700 text-white"
                                onClick={() => {
                                  if (!selectedProject) return;
                                  if (!wpUsername || !wpAppPassword) {
                                    toast.error("กรุณาใส่ WP credentials ก่อน");
                                    return;
                                  }
                                  deployPostsMut.mutate({
                                    domain: selectedProject.domain,
                                    siteName: seoSiteName || selectedProject.domain,
                                    category: theme.category,
                                    themeSlug: theme.slug,
                                    postCount: autoPostCount,
                                    customKeywords: seoCustomKeywords ? seoCustomKeywords.split(',').map((k: string) => k.trim()).filter(Boolean) : undefined,
                                    wpUsername,
                                    wpAppPassword,
                                    useLLM: autoPostUseLLM,
                                  });
                                }}
                                disabled={deployPostsMut.isPending}
                              >
                                {deployPostsMut.isPending ? (
                                  <><Loader2 className="w-3 h-3 animate-spin mr-1" /> กำลัง Deploy...</>
                                ) : (
                                  <><Rocket className="w-3 h-3 mr-1" /> Deploy ทั้งหมดไป WP</>
                                )}
                              </Button>
                            </div>

                            {/* Auto Posts Preview */}
                            {autoPostsPreview && autoPostsOpen === i && (
                              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                                  <span className="text-xs font-semibold text-cyan-400">Preview: {autoPostsPreview.postCount} บทความ</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">รวมคำ:</span>
                                    <span className="ml-1 font-bold text-cyan-400">{autoPostsPreview.totalWordCount.toLocaleString()}</span>
                                  </div>
                                  <div className="bg-background/50 rounded p-1.5">
                                    <span className="text-muted-foreground">Internal Links:</span>
                                    <span className="ml-1 font-bold">{autoPostsPreview.totalInternalLinks}</span>
                                  </div>
                                </div>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {autoPostsPreview.posts.map((p: any, pi: number) => (
                                    <div key={pi} className="bg-background/50 rounded p-1.5 text-[9px]">
                                      <div className="font-medium truncate">{pi + 1}. {p.title}</div>
                                      <div className="text-muted-foreground flex gap-2">
                                        <span>{p.wordCount} คำ</span>
                                        <span>🔗 {p.internalLinksCount} links</span>
                                        <span>🎯 {p.focusKeyword}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-[9px] text-muted-foreground">
                                  <strong>Categories:</strong> {autoPostsPreview.categories.join(', ')}
                                </div>
                                <div className="text-[9px] text-muted-foreground">
                                  <strong>Tags:</strong> {autoPostsPreview.tags.slice(0, 10).join(', ')}{autoPostsPreview.tags.length > 10 ? ` +${autoPostsPreview.tags.length - 10} more` : ''}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Theme Live Preview Modal */}
      {previewTheme && (
        <ThemeLivePreview
          open={!!previewTheme}
          onClose={() => {
            setPreviewTheme(null);
            setPreviewThemeIndex(null);
          }}
          themeName={previewTheme.name}
          themeSlug={previewTheme.slug}
          designStyle={previewTheme.designStyle}
          category={previewTheme.category}
          defaultColors={previewTheme.defaultColors}
          customColors={previewThemeIndex !== null ? customColors[previewThemeIndex] : undefined}
        />
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
