/**
 * WP Casino Themes — Gallery + Preview + Deploy
 * 10 unique casino themes (Slots, Lottery, Baccarat)
 * SEO 2026 compliant, mobile-responsive
 */
import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Palette, Eye, Download, Rocket, Monitor, Smartphone, Tablet,
  Search, Filter, CheckCircle2, Sparkles, Globe, Zap, Shield,
  ChevronRight, X, Loader2, LayoutGrid, List,
} from "lucide-react";

type Category = "all" | "slots" | "lottery" | "baccarat";
type ViewMode = "grid" | "list";

const CATEGORY_CONFIG: Record<Category, { label: string; emoji: string; color: string }> = {
  all: { label: "ทั้งหมด", emoji: "🎰", color: "text-foreground" },
  slots: { label: "สล็อต", emoji: "🎰", color: "text-cyan-400" },
  lottery: { label: "หวย", emoji: "🎱", color: "text-amber-400" },
  baccarat: { label: "บาคาร่า", emoji: "🃏", color: "text-rose-400" },
};

const SEO_FEATURES = [
  { icon: Globe, label: "Schema.org GamblingService", desc: "Structured data สำหรับ Google Rich Results" },
  { icon: Zap, label: "Core Web Vitals 2026", desc: "LCP < 2.5s, INP < 200ms, CLS < 0.1" },
  { icon: Smartphone, label: "Mobile-First + PWA", desc: "รองรับทุกอุปกรณ์ + Progressive Web App" },
  { icon: Shield, label: "E-E-A-T Signals", desc: "Trust badges, author bio, license info" },
  { icon: Sparkles, label: "AEO (Answer Engine)", desc: "AI/LLM-optimized content blocks" },
  { icon: Search, label: "Voice Search Ready", desc: "Natural language content structure" },
];

export default function WpThemes() {

  const [category, setCategory] = useState<Category>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [deploySlug, setDeploySlug] = useState<string | null>(null);
  const [deployForm, setDeployForm] = useState({ wpUrl: "", wpUser: "", wpAppPassword: "" });

  // Fetch theme specs
  const { data: specs, isLoading: specsLoading } = trpc.wpThemes.getSpecs.useQuery();
  const { data: stats } = trpc.wpThemes.stats.useQuery();

  // Seed mutation
  const seedMutation = trpc.wpThemes.seedAll.useMutation({
    onSuccess: (data) => {
      toast.success(`Seed สำเร็จ: สร้าง ${data.created} ธีม, ข้าม ${data.skipped} ธีมที่มีอยู่แล้ว`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Preview query
  const { data: previewData, isLoading: previewLoading } = trpc.wpThemes.preview.useQuery(
    { slug: previewSlug! },
    { enabled: !!previewSlug }
  );

  // Deploy mutation
  const deployMutation = trpc.wpThemes.deploy.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setDeploySlug(null);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Filter themes
  const filteredSpecs = useMemo(() => {
    if (!specs) return [];
    return specs.filter((t) => {
      const matchCategory = category === "all" || t.category === category;
      const matchSearch = !searchQuery || 
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchSearch;
    });
  }, [specs, category, searchQuery]);

  const deviceWidths = { desktop: "100%", tablet: "768px", mobile: "375px" };

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
            <Palette className="w-7 h-7 text-amber-400" />
            WP Casino Themes
          </h1>
          <p className="text-muted-foreground mt-1">
            10 ธีม WordPress Casino ไม่ซ้ำกัน — SEO 2026 ครบทุกด้าน + Mobile-First
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stats && !stats.seeded && (
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
              Seed ธีมทั้ง 10
            </Button>
          )}
          {stats && (
            <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg">
              <span className="font-mono text-amber-400">{stats.total}</span> ธีม |{" "}
              <span className="font-mono text-cyan-400">{stats.totalDeploys}</span> deploys
            </div>
          )}
        </div>
      </div>

      {/* SEO 2026 Features Banner */}
      <Card className="bg-gradient-to-r from-amber-500/5 to-cyan-500/5 border-amber-500/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">SEO 2026 Features ทุกธีม</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {SEO_FEATURES.map((f) => (
              <div key={f.label} className="flex items-start gap-2 text-xs">
                <f.icon className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-foreground">{f.label}</div>
                  <div className="text-muted-foreground leading-tight">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Category tabs */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
          {(Object.keys(CATEGORY_CONFIG) as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                category === cat
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="mr-1">{CATEGORY_CONFIG[cat].emoji}</span>
              {CATEGORY_CONFIG[cat].label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาธีม..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Theme Grid */}
      {specsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-6">
                <div className="h-40 bg-muted rounded-lg mb-4" />
                <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                <div className="h-3 bg-muted rounded w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSpecs.map((theme) => (
            <Card
              key={theme.slug}
              className="group overflow-hidden hover:border-amber-500/30 transition-all duration-300"
            >
              {/* Color Preview */}
              <div
                className="h-40 relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${theme.bgColor} 0%, ${theme.secondaryColor}40 100%)` }}
              >
                {/* Color dots */}
                <div className="absolute top-3 right-3 flex gap-1.5">
                  <div className="w-5 h-5 rounded-full border-2 border-white/20" style={{ background: theme.primaryColor }} title="Primary" />
                  <div className="w-5 h-5 rounded-full border-2 border-white/20" style={{ background: theme.secondaryColor }} title="Secondary" />
                  <div className="w-5 h-5 rounded-full border-2 border-white/20" style={{ background: theme.accentColor }} title="Accent" />
                </div>

                {/* Category badge */}
                <Badge className="absolute top-3 left-3" variant="secondary">
                  {CATEGORY_CONFIG[theme.category as Category]?.emoji} {CATEGORY_CONFIG[theme.category as Category]?.label}
                </Badge>

                {/* Theme name overlay */}
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <h3 className="text-lg font-bold" style={{ fontFamily: theme.fontHeading, color: theme.primaryColor }}>
                    {theme.name}
                  </h3>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <Button size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10" onClick={() => setPreviewSlug(theme.slug)}>
                    <Eye className="w-4 h-4 mr-1" /> Preview
                  </Button>
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black" onClick={() => setDeploySlug(theme.slug)}>
                    <Rocket className="w-4 h-4 mr-1" /> Deploy
                  </Button>
                </div>
              </div>

              <CardContent className="py-4 space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">{theme.description}</p>

                {/* Design specs */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{theme.layoutStyle}</Badge>
                  <Badge variant="outline" className="text-[10px]">{theme.heroStyle}</Badge>
                  <Badge variant="outline" className="text-[10px]">{theme.mobileNavStyle}</Badge>
                </div>

                {/* Fonts */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Fonts:</span>{" "}
                  <span style={{ fontFamily: theme.fontHeading }}>{theme.fontHeading}</span> /{" "}
                  <span style={{ fontFamily: theme.fontBody }}>{theme.fontBody}</span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {theme.tags.slice(0, 5).map((tag: string) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setPreviewSlug(theme.slug)}>
                    <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                  </Button>
                  <Button size="sm" className="flex-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20" onClick={() => setDeploySlug(theme.slug)}>
                    <Rocket className="w-3.5 h-3.5 mr-1" /> Deploy
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filteredSpecs.map((theme) => (
            <Card key={theme.slug} className="hover:border-amber-500/20 transition-all">
              <CardContent className="py-3 flex items-center gap-4">
                {/* Color preview */}
                <div
                  className="w-16 h-16 rounded-lg shrink-0 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${theme.bgColor}, ${theme.primaryColor}40)` }}
                >
                  <span className="text-2xl">{CATEGORY_CONFIG[theme.category as Category]?.emoji}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{theme.name}</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {CATEGORY_CONFIG[theme.category as Category]?.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{theme.description}</p>
                  <div className="flex gap-1 mt-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: theme.primaryColor }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: theme.secondaryColor }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: theme.accentColor }} />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setPreviewSlug(theme.slug)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeploySlug(theme.slug)}>
                    <Rocket className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredSpecs.length === 0 && !specsLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Palette className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>ไม่พบธีมที่ตรงกับเงื่อนไข</p>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewSlug} onOpenChange={() => setPreviewSlug(null)}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
            <div>
              <DialogTitle className="text-base">
                Preview: {specs?.find((t) => t.slug === previewSlug)?.name}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {specs?.find((t) => t.slug === previewSlug)?.description?.substring(0, 80)}...
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg">
              <button
                onClick={() => setPreviewDevice("desktop")}
                className={`p-1.5 rounded ${previewDevice === "desktop" ? "bg-background shadow" : "text-muted-foreground"}`}
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPreviewDevice("tablet")}
                className={`p-1.5 rounded ${previewDevice === "tablet" ? "bg-background shadow" : "text-muted-foreground"}`}
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPreviewDevice("mobile")}
                className={`p-1.5 rounded ${previewDevice === "mobile" ? "bg-background shadow" : "text-muted-foreground"}`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/20 flex items-start justify-center p-4 overflow-auto">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังโหลด preview...
              </div>
            ) : previewData?.html ? (
              <div
                className="bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-300"
                style={{ width: deviceWidths[previewDevice], maxWidth: "100%" }}
              >
                <iframe
                  srcDoc={previewData.html}
                  className="w-full border-0"
                  style={{ height: "calc(90vh - 100px)" }}
                  title="Theme Preview"
                  sandbox="allow-scripts"
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Deploy Dialog */}
      <Dialog open={!!deploySlug} onOpenChange={() => setDeploySlug(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-amber-400" />
              Deploy: {specs?.find((t) => t.slug === deploySlug)?.name}
            </DialogTitle>
            <DialogDescription>
              กรอกข้อมูล WordPress เพื่อ deploy ธีมไปยังเว็บไซต์ของคุณ
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">WordPress URL</label>
              <Input
                placeholder="https://example.com"
                value={deployForm.wpUrl}
                onChange={(e) => setDeployForm((f) => ({ ...f, wpUrl: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Username</label>
              <Input
                placeholder="admin"
                value={deployForm.wpUser}
                onChange={(e) => setDeployForm((f) => ({ ...f, wpUser: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Application Password</label>
              <Input
                type="password"
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                value={deployForm.wpAppPassword}
                onChange={(e) => setDeployForm((f) => ({ ...f, wpAppPassword: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                สร้าง Application Password ได้ที่ WordPress Dashboard &gt; Users &gt; Profile &gt; Application Passwords
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeploySlug(null)}>ยกเลิก</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black"
              disabled={!deployForm.wpUrl || !deployForm.wpUser || !deployForm.wpAppPassword || deployMutation.isPending}
              onClick={() => {
                if (deploySlug) {
                  deployMutation.mutate({
                    slug: deploySlug,
                    ...deployForm,
                  });
                }
              }}
            >
              {deployMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
              Deploy Theme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
