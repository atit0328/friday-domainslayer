/**
 * Design: Obsidian Intelligence — Main Dashboard / Command Center
 * Shows overview stats from both DomainSlayer and Friday AI
 * Uses tRPC hooks for data fetching
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Search, Store, Gavel, Eye, ShoppingCart, Bot, Rocket, Zap, Link2, Radio,
  Globe, ArrowRight, Sparkles, Loader2
} from "lucide-react";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663395086498/bkTTbs7mYdbRyRhP7bWyr5/hero-bg-DWT3oY9ijjNoKeUTfE45X2.webp";

const DOMAIN_SERVICES = [
  { icon: Search, label: "Domain Scanner", desc: "สแกนโดเมนวิเคราะห์ SEO Trust Score", href: "/scanner", color: "emerald" },
  { icon: Store, label: "Marketplace", desc: "ค้นหาโดเมนจาก AI-powered marketplace", href: "/marketplace", color: "emerald" },
  { icon: Gavel, label: "Auto-Bid", desc: "AI ประมูลโดเมนอัตโนมัติตามเงื่อนไข", href: "/autobid", color: "emerald" },
  { icon: Eye, label: "Watchlist", desc: "ติดตามราคาโดเมน แจ้งเตือนเมื่อราคาลด", href: "/watchlist", color: "emerald" },
  { icon: ShoppingCart, label: "Orders", desc: "จัดการคำสั่งซื้อ/ประมูลโดเมน", href: "/orders", color: "emerald" },
];

const AI_SERVICES = [
  { icon: Bot, label: "Friday AI Chat", desc: "ถาม AI เรื่อง SEO ได้ทุกอย่าง", href: "/chat", color: "violet" },
  { icon: Rocket, label: "SEO Campaigns", desc: "สร้างแคมเปญ SEO อัตโนมัติ 16 เฟส", href: "/campaigns", color: "violet" },
  { icon: Zap, label: "SEO Modules", desc: "เครื่องมือ SEO 12+ โมดูลพร้อมใช้", href: "/modules", color: "violet" },
  { icon: Link2, label: "PBN Manager", desc: "จัดการ PBN + AI Auto-post", href: "/pbn", color: "violet" },
  { icon: Radio, label: "Algorithm Intel", desc: "ตรวจจับการเปลี่ยนแปลง Google Algorithm", href: "/algorithm", color: "violet" },
];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();

  const s = stats || { scans: 0, orders: 0, watchlistCount: 0, campaigns: 0, chatMessages: 0, pbnSites: 0 };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-[1200px]">
      {/* Hero Section */}
      <div className="relative rounded-xl overflow-hidden h-[200px] sm:h-[180px] md:h-[200px]">
        <img src={HERO_BG} alt="Friday AI x DomainSlayer ศูนย์บัญชาการ SEO" className="absolute inset-0 w-full h-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
        <div className="relative z-10 h-full flex flex-col justify-center px-4 sm:px-6 md:px-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-emerald/15 border border-emerald/30 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-emerald" />
            </div>
            <span className="font-mono text-[10px] text-emerald/70 tracking-widest uppercase">Command Center</span>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight">
            Friday<span className="text-emerald">AI</span> x Domain<span className="text-violet">Slayer</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1 max-w-lg">
            ศูนย์บัญชาการ SEO & Domain Intelligence — รวมทุกเครื่องมือไว้ในที่เดียว
          </p>
          <div className="flex gap-2 sm:gap-3 mt-3 sm:mt-4">
            <Button size="sm" className="bg-emerald text-background hover:bg-emerald/90 font-semibold text-xs h-8" onClick={() => navigate("/scanner")}>
              <Search className="w-3.5 h-3.5 mr-1.5" /> Scan Domain
            </Button>
            <Button size="sm" variant="outline" className="border-violet/30 text-violet hover:bg-violet/10 text-xs h-8" onClick={() => navigate("/chat")}>
              <Bot className="w-3.5 h-3.5 mr-1.5" /> Ask Friday AI
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Domains Scanned", value: s.scans, icon: Globe, color: "text-emerald", bg: "bg-emerald/10 border-emerald/20" },
          { label: "Active Orders", value: s.orders, icon: ShoppingCart, color: "text-cyan", bg: "bg-cyan/10 border-cyan/20" },
          { label: "Watching", value: s.watchlistCount, icon: Eye, color: "text-amber", bg: "bg-amber/10 border-amber/20" },
          { label: "AI Campaigns", value: s.campaigns, icon: Rocket, color: "text-violet", bg: "bg-violet/10 border-violet/20" },
        ].map((stat) => (
          <Card key={stat.label} className="glass-card border-border/50 hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] sm:text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mt-2" />
                  ) : (
                    <p className="text-xl sm:text-2xl font-bold mt-1 font-mono">{stat.value}</p>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Domain Intelligence Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 bg-emerald rounded-full" />
          <h2 className="font-semibold text-sm tracking-tight">Domain Intelligence</h2>
          <span className="font-mono text-[10px] text-emerald/60 tracking-widest uppercase ml-1">DomainSlayer</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DOMAIN_SERVICES.map((svc) => (
            <Card
              key={svc.href}
              className="glass-card border-border/50 hover:border-emerald/30 transition-all duration-200 cursor-pointer group"
              onClick={() => navigate(svc.href)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center shrink-0 group-hover:glow-emerald transition-all">
                    <svc.icon className="w-5 h-5 text-emerald" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{svc.label}</h3>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{svc.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Friday AI Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 bg-violet rounded-full" />
          <h2 className="font-semibold text-sm tracking-tight">Friday AI SEO</h2>
          <span className="font-mono text-[10px] text-violet/60 tracking-widest uppercase ml-1">AI-Powered</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {AI_SERVICES.map((svc) => (
            <Card
              key={svc.href}
              className="glass-card border-border/50 hover:border-violet/30 transition-all duration-200 cursor-pointer group"
              onClick={() => navigate(svc.href)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center shrink-0 group-hover:glow-violet transition-all">
                    <svc.icon className="w-5 h-5 text-violet" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{svc.label}</h3>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{svc.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* System Status */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald animate-pulse shrink-0" />
            <span className="text-[11px] sm:text-xs text-muted-foreground">All systems operational</span>
            <Badge variant="outline" className="text-[10px] font-mono ml-auto">v2.0 Unified</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
