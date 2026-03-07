/**
 * Design: Obsidian Intelligence — SEO Modules
 * 12+ SEO tools powered by AI — uses tRPC
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Zap, Search, FileText, Link2, BarChart3, Globe, Code, Shield, Loader2, Sparkles, Target, PenTool, Hash, MapPin, ShoppingBag } from "lucide-react";
import { Streamdown } from "streamdown";

const MODULES = [
  { id: "keyword_research", icon: Search, label: "Keyword Research", desc: "วิจัย keyword ด้วย AI หา long-tail, LSI, search intent", color: "emerald" },
  { id: "content_optimizer", icon: FileText, label: "Content Optimizer", desc: "วิเคราะห์และ optimize content สำหรับ SEO", color: "violet" },
  { id: "backlink_analyzer", icon: Link2, label: "Backlink Analyzer", desc: "วิเคราะห์ backlink profile และหา opportunities", color: "cyan" },
  { id: "competitor_spy", icon: Target, label: "Competitor Spy", desc: "วิเคราะห์คู่แข่งเชิงลึก strategies และ gaps", color: "amber" },
  { id: "technical_audit", icon: Code, label: "Technical SEO Audit", desc: "ตรวจสอบ technical SEO issues", color: "rose" },
  { id: "rank_tracker", icon: BarChart3, label: "Rank Tracker", desc: "ประเมิน ranking potential สำหรับ keywords", color: "emerald" },
  { id: "schema_generator", icon: Globe, label: "Schema Generator", desc: "สร้าง structured data / schema markup", color: "violet" },
  { id: "meta_writer", icon: PenTool, label: "Meta Tag Writer", desc: "เขียน title, description ที่ optimize สำหรับ SEO", color: "cyan" },
  { id: "content_brief", icon: FileText, label: "Content Brief", desc: "สร้าง Content Brief สำหรับ keyword/topic", color: "amber" },
  { id: "link_building", icon: Link2, label: "Link Building Strategy", desc: "แนะนำ Link Building Strategy ที่ actionable", color: "rose" },
  { id: "local_seo", icon: MapPin, label: "Local SEO", desc: "วิเคราะห์และแนะนำ Local SEO Strategy", color: "emerald" },
  { id: "ecommerce_seo", icon: ShoppingBag, label: "E-Commerce SEO", desc: "วิเคราะห์และแนะนำ E-Commerce SEO Strategy", color: "violet" },
];

export default function Modules() {
  const [selectedModule, setSelectedModule] = useState<typeof MODULES[0] | null>(null);
  const [domain, setDomain] = useState("");
  const [niche, setNiche] = useState("");
  const [keywords, setKeywords] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [result, setResult] = useState("");

  const executeMutation = trpc.modules.execute.useMutation({
    onSuccess: (data: any) => {
      setResult(data.result);
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  function executeModule() {
    if (!selectedModule) return;
    executeMutation.mutate({
      moduleName: selectedModule.id,
      domain: domain || undefined,
      niche: niche || undefined,
      keywords: keywords || undefined,
      customPrompt: customPrompt || undefined,
    });
  }

  const colorMap: Record<string, string> = {
    emerald: "bg-emerald/10 border-emerald/20 text-emerald",
    violet: "bg-violet/10 border-violet/20 text-violet",
    cyan: "bg-cyan/10 border-cyan/20 text-cyan",
    amber: "bg-amber/10 border-amber/20 text-amber",
    rose: "bg-rose/10 border-rose/20 text-rose",
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-violet rounded-full" />
        <h1 className="text-lg font-bold tracking-tight">SEO Modules</h1>
        <Badge variant="outline" className="font-mono text-[10px] border-violet/30 text-violet">12+ Tools</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {MODULES.map((mod) => (
          <Card
            key={mod.id}
            className="glass-card border-border/50 hover:border-violet/30 transition-all cursor-pointer group"
            onClick={() => { setSelectedModule(mod); setResult(""); setDomain(""); setNiche(""); setKeywords(""); setCustomPrompt(""); }}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${colorMap[mod.color]}`}>
                  <mod.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{mod.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{mod.desc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Module Dialog */}
      <Dialog open={!!selectedModule} onOpenChange={(open) => !open && setSelectedModule(null)}>
        <DialogContent className="glass-card border-border/50 max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedModule && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <selectedModule.icon className="w-5 h-5 text-violet" />
                  {selectedModule.label}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <Input placeholder="Domain (e.g. example.com)" value={domain} onChange={e => setDomain(e.target.value)} className="bg-muted/30 border-border/50 font-mono" />
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Niche" value={niche} onChange={e => setNiche(e.target.value)} className="bg-muted/30 border-border/50" />
                  <Input placeholder="Keywords (comma separated)" value={keywords} onChange={e => setKeywords(e.target.value)} className="bg-muted/30 border-border/50" />
                </div>
                <Input placeholder="Custom instructions (optional)" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} className="bg-muted/30 border-border/50" onKeyDown={e => e.key === "Enter" && executeModule()} />
                <Button onClick={executeModule} disabled={executeMutation.isPending} className="w-full bg-violet text-white hover:bg-violet/90">
                  {executeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Execute Module
                </Button>
                {result && (
                  <div className="bg-muted/20 border border-border/50 rounded-lg p-4 prose prose-sm prose-invert max-w-none [&_code]:text-violet [&_code]:bg-violet/10 [&_code]:px-1 [&_code]:rounded">
                    <Streamdown>{result}</Streamdown>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
