import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  LayoutTemplate, Eye, Copy, Loader2, Plus, Trash2,
  FileText, Star, Newspaper, MessageSquare, ShoppingBag,
  BarChart3, Sparkles, Code, Globe, Zap, BookOpen,
  CheckCircle2, XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

const CATEGORY_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  news: { icon: Newspaper, color: "text-blue-400", label: "News Article" },
  review: { icon: Star, color: "text-yellow-400", label: "Review" },
  article: { icon: BookOpen, color: "text-emerald", label: "Article" },
  faq: { icon: MessageSquare, color: "text-purple-400", label: "FAQ" },
  product: { icon: ShoppingBag, color: "text-orange-400", label: "Product" },
  comparison: { icon: BarChart3, color: "text-cyan-400", label: "Comparison" },
  landing: { icon: Globe, color: "text-pink-400", label: "Landing Page" },
  blog: { icon: FileText, color: "text-green-400", label: "Blog" },
  custom: { icon: Code, color: "text-gray-400", label: "Custom" },
};

export default function TemplateLibrary() {
  const [activeTab, setActiveTab] = useState("browse");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [previewKeywords, setPreviewKeywords] = useState("สล็อต, เว็บสล็อต, สล็อตออนไลน์");
  const [previewRedirectUrl, setPreviewRedirectUrl] = useState("https://example.com");
  const [previewDomain, setPreviewDomain] = useState("target.com");
  const [previewDelay, setPreviewDelay] = useState(5);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // New template form state
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newCategory, setNewCategory] = useState<string>("custom");
  const [newDescription, setNewDescription] = useState("");
  const [newHtml, setNewHtml] = useState("");
  const [newCss, setNewCss] = useState("");
  const [newRedirectDelay, setNewRedirectDelay] = useState(5);
  const [newSchemaMarkup, setNewSchemaMarkup] = useState(true);
  const [newFaq, setNewFaq] = useState(false);
  const [newBreadcrumb, setNewBreadcrumb] = useState(true);
  const [newOpenGraph, setNewOpenGraph] = useState(true);

  // Queries
  const templatesQuery = trpc.parasiteTemplates.list.useQuery();

  const previewMut = trpc.parasiteTemplates.preview.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setPreviewHtml(data.html);
        setActiveTab("preview");
        toast.success(`Preview generated: ${data.wordCount} words, SEO Score: ${data.seoScore}/100`);
      } else {
        toast.error(data.error || "Preview failed");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const createMut = trpc.parasiteTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      templatesQuery.refetch();
      setShowCreateDialog(false);
      resetCreateForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.parasiteTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      templatesQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetCreateForm() {
    setNewName(""); setNewSlug(""); setNewCategory("custom");
    setNewDescription(""); setNewHtml(""); setNewCss("");
    setNewRedirectDelay(5); setNewSchemaMarkup(true);
    setNewFaq(false); setNewBreadcrumb(true); setNewOpenGraph(true);
  }

  function handlePreview(slug: string) {
    setPreviewSlug(slug);
    previewMut.mutate({
      slug,
      keywords: previewKeywords.split(",").map(k => k.trim()).filter(Boolean),
      redirectUrl: previewRedirectUrl,
      targetDomain: previewDomain,
      redirectDelay: previewDelay,
    });
  }

  function handleCopyHtml() {
    if (previewHtml) {
      navigator.clipboard.writeText(previewHtml);
      toast.success("HTML copied to clipboard");
    }
  }

  const templates = templatesQuery.data || [];
  const filteredTemplates = categoryFilter === "all"
    ? templates
    : templates.filter(t => t.category === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutTemplate className="w-6 h-6 text-purple-400" />
            Parasite Template Library
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            คลัง Template สำหรับสร้าง Parasite SEO Pages — พร้อม Schema Markup, FAQ, และ Redirect
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-1" /> Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Custom Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My Template" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Slug</Label>
                  <Input value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="my-template" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Redirect Delay (sec)</Label>
                  <Input type="number" value={newRedirectDelay} onChange={e => setNewRedirectDelay(Number(e.target.value))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Template description..." className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">HTML Template</Label>
                <Textarea value={newHtml} onChange={e => setNewHtml(e.target.value)} placeholder="<html>...</html>" className="mt-1 font-mono text-xs min-h-[200px]" />
              </div>
              <div>
                <Label className="text-xs">CSS Styles (optional)</Label>
                <Textarea value={newCss} onChange={e => setNewCss(e.target.value)} placeholder="body { ... }" className="mt-1 font-mono text-xs min-h-[100px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={newSchemaMarkup} onCheckedChange={setNewSchemaMarkup} />
                  <Label className="text-xs">Schema Markup</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newFaq} onCheckedChange={setNewFaq} />
                  <Label className="text-xs">FAQ Section</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newBreadcrumb} onCheckedChange={setNewBreadcrumb} />
                  <Label className="text-xs">Breadcrumb</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newOpenGraph} onCheckedChange={setNewOpenGraph} />
                  <Label className="text-xs">Open Graph</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={!newName || !newSlug || !newHtml || createMut.isPending}
                onClick={() => createMut.mutate({
                  name: newName, slug: newSlug, category: newCategory as any,
                  description: newDescription, htmlTemplate: newHtml, cssStyles: newCss,
                  defaultRedirectDelay: newRedirectDelay, hasSchemaMarkup: newSchemaMarkup,
                  hasFaq: newFaq, hasBreadcrumb: newBreadcrumb, hasOpenGraph: newOpenGraph,
                })}
              >
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="browse" className="text-xs">📚 Browse Templates</TabsTrigger>
          <TabsTrigger value="preview" disabled={!previewHtml} className="text-xs">👁️ Preview</TabsTrigger>
        </TabsList>

        {/* ═══ BROWSE TAB ═══ */}
        <TabsContent value="browse" className="space-y-4">
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
              className="text-xs"
            >
              All ({templates.length})
            </Button>
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => {
              const count = templates.filter(t => t.category === k).length;
              if (count === 0) return null;
              const Icon = v.icon;
              return (
                <Button
                  key={k}
                  variant={categoryFilter === k ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategoryFilter(k)}
                  className="text-xs"
                >
                  <Icon className={`w-3 h-3 mr-1 ${v.color}`} />
                  {v.label} ({count})
                </Button>
              );
            })}
          </div>

          {/* Preview Config */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-yellow-400" /> Preview Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Keywords (comma separated)</Label>
                  <Input value={previewKeywords} onChange={e => setPreviewKeywords(e.target.value)} className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Redirect URL</Label>
                  <Input value={previewRedirectUrl} onChange={e => setPreviewRedirectUrl(e.target.value)} className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Target Domain</Label>
                  <Input value={previewDomain} onChange={e => setPreviewDomain(e.target.value)} className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Redirect Delay (sec)</Label>
                  <Input type="number" value={previewDelay} onChange={e => setPreviewDelay(Number(e.target.value))} className="mt-1 text-xs" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Template Grid */}
          {templatesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <LayoutTemplate className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No templates found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTemplates.map((tpl, idx) => {
                const cat = CATEGORY_CONFIG[tpl.category] || CATEGORY_CONFIG.custom;
                const CatIcon = cat.icon;
                return (
                  <Card key={`${tpl.slug}-${idx}`} className="bg-card border-border hover:border-purple-500/30 transition-all group">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center`}>
                            <CatIcon className={`w-4 h-4 ${cat.color}`} />
                          </div>
                          <div>
                            <CardTitle className="text-sm">{tpl.name || tpl.nameTh}</CardTitle>
                            <Badge variant="outline" className={`text-[9px] mt-0.5 ${cat.color} border-current/30`}>{cat.label}</Badge>
                          </div>
                        </div>
                        {tpl.isSystem ? (
                          <Badge className="bg-emerald/10 text-emerald border-emerald/30 text-[9px]">Built-in</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => tpl.id && deleteMut.mutate({ id: tpl.id })}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {tpl.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                      )}
                      {/* Features */}
                      <div className="flex flex-wrap gap-1">
                        {tpl.hasSchemaMarkup && <Badge variant="outline" className="text-[9px]">Schema</Badge>}
                        {tpl.hasFaq && <Badge variant="outline" className="text-[9px]">FAQ</Badge>}
                        {tpl.hasBreadcrumb && <Badge variant="outline" className="text-[9px]">Breadcrumb</Badge>}
                        {tpl.hasOpenGraph && <Badge variant="outline" className="text-[9px]">OG</Badge>}
                      </div>
                      {/* Placeholders */}
                      {tpl.placeholders && (
                        <div className="flex flex-wrap gap-1">
                          {(tpl.placeholders as string[]).map((p, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] text-muted-foreground">{`{{${p}}}`}</Badge>
                          ))}
                        </div>
                      )}
                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={previewMut.isPending}
                          onClick={() => handlePreview(tpl.slug)}
                        >
                          {previewMut.isPending && previewSlug === tpl.slug ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <Eye className="w-3 h-3 mr-1" />
                          )}
                          Preview
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ PREVIEW TAB ═══ */}
        <TabsContent value="preview" className="space-y-4">
          {previewHtml ? (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Template: <span className="text-foreground font-medium">{previewSlug}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyHtml}>
                    <Copy className="w-3 h-3 mr-1" /> Copy HTML
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setActiveTab("browse"); }}>
                    Back to Browse
                  </Button>
                </div>
              </div>
              {/* HTML Preview */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-purple-400" /> Live Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-white rounded-lg overflow-hidden" style={{ minHeight: "400px" }}>
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full border-0"
                      style={{ minHeight: "500px" }}
                      sandbox="allow-scripts"
                      title="Template Preview"
                    />
                  </div>
                </CardContent>
              </Card>
              {/* Source Code */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Code className="w-4 h-4 text-emerald" /> Source HTML</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <pre className="text-[10px] font-mono whitespace-pre-wrap text-muted-foreground">{previewHtml}</pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <Eye className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Select a template and click Preview</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
