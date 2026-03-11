/**
 * Design: Obsidian Intelligence — Sidebar Navigation
 * Two sections: DomainSlayer (emerald) + Friday AI (violet)
 * Mobile: full-height overlay with smooth animation, touch-friendly tap targets
 */
import { useLocation, Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LayoutDashboard, Search, Store, Bot, Zap, Link2,
  Gavel, Eye, ShoppingCart, Radio, Settings, ChevronLeft, ChevronRight, Brain, Skull,
  History, LayoutTemplate, Target, Users, LineChart, Cpu, Clock, Shield, Crosshair, CalendarClock, Repeat2,
  X, Activity, Database, BarChart3, Server, KeyRound, Radar, Sparkles, Rocket,
} from "lucide-react";

const DOMAIN_NAV = [
  { href: "/", icon: LayoutDashboard, label: "ศูนย์บัญชาการ" },
  { href: "/scanner", icon: Search, label: "Domain Scanner" },
  { href: "/marketplace", icon: Store, label: "Marketplace" },
  { href: "/autobid", icon: Gavel, label: "Auto-Bid" },
  { href: "/watchlist", icon: Eye, label: "Watchlist" },
  { href: "/orders", icon: ShoppingCart, label: "Orders" },
];

const AI_NAV = [
  { href: "/seo-brain", icon: Sparkles, label: "SEO Brain" },
  { href: "/chat", icon: Bot, label: "Friday AI Chat" },
  { href: "/seo", icon: Brain, label: "SEO Automation" },
  { href: "/modules", icon: Zap, label: "SEO Modules" },
  { href: "/pbn", icon: Link2, label: "PBN Manager" },
  { href: "/algorithm", icon: Radio, label: "Algorithm Intel" },
  { href: "/rank-dashboard", icon: LineChart, label: "Rank Tracker" },
];

const BLACKHAT_NAV = [
  { href: "/target-acquisition", icon: Radar, label: "Target Acquisition" },
  { href: "/agentic-attack", icon: Skull, label: "Agentic AI Attack" },
  { href: "/ai-attack", icon: Cpu, label: "AI Attack Engine" },
  { href: "/autonomous-history", icon: Clock, label: "Attack History" },
  { href: "/deploy-history", icon: History, label: "Deploy History" },
  { href: "/templates", icon: LayoutTemplate, label: "Template Library" },
  { href: "/keyword-ranking", icon: Target, label: "Keyword Ranking" },
  { href: "/mass-discovery", icon: Crosshair, label: "Mass Discovery" },
  { href: "/keyword-discovery", icon: KeyRound, label: "Keyword Discovery" },
  { href: "/redirect-takeover", icon: Repeat2, label: "Redirect Takeover" },
  { href: "/proxy-dashboard", icon: Shield, label: "Proxy Dashboard" },
  { href: "/scheduled-scans", icon: CalendarClock, label: "Scheduled Scans" },
  { href: "/cve-database", icon: Database, label: "CVE Database" },
  { href: "/exploit-analytics", icon: BarChart3, label: "Exploit Analytics" },
  { href: "/adaptive-learning", icon: Brain, label: "Adaptive Learning" },
  { href: "/query-parasite", icon: Search, label: "Query Parasite" },
  { href: "/content-freshness", icon: Activity, label: "Content Freshness" },
  { href: "/platform-discovery", icon: Radar, label: "Platform Discovery" },
  { href: "/algorithm-monitor", icon: Activity, label: "Algo Monitor" },
  { href: "/competitor-gap", icon: Crosshair, label: "Competitor Gap" },
];

const AUTONOMOUS_NAV = [
  { href: "/orchestrator-dashboard", icon: Activity, label: "Orchestrator" },
  { href: "/ai-command-center", icon: Cpu, label: "AI Command Center" },
  { href: "/gambling-brain", icon: Brain, label: "Gambling AI Brain" },
  { href: "/keyword-performance", icon: BarChart3, label: "Keyword Performance" },
  { href: "/daemon", icon: Server, label: "Daemon Control" },
];

const SYSTEM_NAV = [
  { href: "/settings", icon: Settings, label: "ตั้งค่าระบบ" },
];

const ADMIN_NAV = [
  { href: "/users", icon: Users, label: "จัดการผู้ใช้" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";

  const handleNavClick = () => {
    // Close mobile sidebar on navigation
    if (onMobileClose) onMobileClose();
  };

  const renderNavItem = (item: typeof DOMAIN_NAV[0], color: "emerald" | "violet" | "zinc") => {
    const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
    const Icon = item.icon;
    const colorClasses = {
      emerald: active
        ? "bg-emerald/10 text-emerald border-l-emerald"
        : "text-muted-foreground hover:text-emerald hover:bg-emerald/5 active:bg-emerald/15 border-l-transparent",
      violet: active
        ? "bg-violet/10 text-violet border-l-violet"
        : "text-muted-foreground hover:text-violet hover:bg-violet/5 active:bg-violet/15 border-l-transparent",
      zinc: active
        ? "bg-muted text-foreground border-l-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 active:bg-muted border-l-transparent",
    };

    return (
      <Link key={item.href} href={item.href} onClick={handleNavClick}>
        <div
          className={`flex items-center gap-3 px-3 py-3 lg:py-2.5 border-l-[3px] transition-all duration-200 cursor-pointer ${colorClasses[color]} ${collapsed ? "justify-center px-2" : ""}`}
        >
          <Icon className="w-5 h-5 lg:w-[18px] lg:h-[18px] shrink-0" />
          {!collapsed && <span className="text-sm lg:text-[13px] font-medium truncate">{item.label}</span>}
        </div>
      </Link>
    );
  };

  const sidebarContent = (
    <aside
      className={`
        ${collapsed ? "w-[60px]" : "w-[280px] lg:w-[230px]"}
        bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 shrink-0
        h-screen overflow-y-auto overscroll-contain
      `}
    >
      {/* Logo */}
      <div className="h-[56px] flex items-center px-3 border-b border-sidebar-border shrink-0">
        {!collapsed ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald/15 border border-emerald/30 flex items-center justify-center">
                <span className="font-mono font-bold text-emerald text-sm">F</span>
              </div>
              <div className="leading-tight">
                <div className="font-bold text-sm tracking-tight">
                  FRIDAY<span className="text-emerald">AI</span>
                </div>
                <div className="font-mono text-[9px] text-emerald/50 tracking-widest">x DOMAINSLAYER</div>
              </div>
            </div>
            {/* Mobile close button */}
            {onMobileClose && (
              <button
                onClick={onMobileClose}
                className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/50 active:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-emerald/15 border border-emerald/30 flex items-center justify-center mx-auto">
            <span className="font-mono font-bold text-emerald text-sm">F</span>
          </div>
        )}
      </div>

      {/* Domain Section */}
      <div className="py-3">
        {!collapsed && (
          <div className="px-4 mb-2">
            <span className="font-mono text-[10px] font-semibold tracking-widest text-emerald/60 uppercase">Domain Intelligence</span>
          </div>
        )}
        <nav className="space-y-0.5 px-1">
          {DOMAIN_NAV.map((item) => renderNavItem(item, "emerald"))}
        </nav>
      </div>

      {/* Blackhat Section — superadmin only */}
      {isSuperadmin && (
      <>
      <div className="mx-4 border-t border-sidebar-border" />
      <div className="py-3">
        {!collapsed && (
          <div className="px-4 mb-2">
            <span className="font-mono text-[10px] font-semibold tracking-widest text-red-500/60 uppercase">Blackhat Mode</span>
          </div>
        )}
        <nav className="space-y-0.5 px-1">
          {BLACKHAT_NAV.map((item) => {
            const active = location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={handleNavClick}>
                <div
                  className={`flex items-center gap-3 px-3 py-3 lg:py-2.5 border-l-[3px] transition-all duration-200 cursor-pointer ${
                    active
                      ? "bg-red-500/10 text-red-500 border-l-red-500"
                      : "text-muted-foreground hover:text-red-500 hover:bg-red-500/5 active:bg-red-500/15 border-l-transparent"
                  } ${collapsed ? "justify-center px-2" : ""}`}
                >
                  <Icon className="w-5 h-5 lg:w-[18px] lg:h-[18px] shrink-0" />
                  {!collapsed && <span className="text-sm lg:text-[13px] font-medium truncate">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
      </>
      )}

      {/* AI Command Center — admin/superadmin */}
      {(isSuperadmin || user?.role === "admin") && (
      <>
      <div className="mx-4 border-t border-sidebar-border" />
      <div className="py-3">
        {!collapsed && (
          <div className="px-4 mb-2">
            <span className="font-mono text-[10px] font-semibold tracking-widest text-cyan-400/60 uppercase">Autonomous AI</span>
          </div>
        )}
        <nav className="space-y-0.5 px-1">
          {AUTONOMOUS_NAV.map((item) => {
            const active = location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={handleNavClick}>
                <div
                  className={`flex items-center gap-3 px-3 py-3 lg:py-2.5 border-l-[3px] transition-all duration-200 cursor-pointer ${
                    active
                      ? "bg-cyan-500/10 text-cyan-400 border-l-cyan-400"
                      : "text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/5 active:bg-cyan-500/15 border-l-transparent"
                  } ${collapsed ? "justify-center px-2" : ""}`}
                >
                  <Icon className="w-5 h-5 lg:w-[18px] lg:h-[18px] shrink-0" />
                  {!collapsed && <span className="text-sm lg:text-[13px] font-medium truncate">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
      </>
      )}

      {/* Divider */}
      <div className="mx-4 border-t border-sidebar-border" />

      {/* Friday AI SEO — moved to bottom, separate from Blackhat */}
      <div className="py-3">
        {!collapsed && (
          <div className="px-4 mb-2">
            <span className="font-mono text-[10px] font-semibold tracking-widest text-violet/60 uppercase">Friday AI SEO</span>
          </div>
        )}
        <nav className="space-y-0.5 px-1">
          {AI_NAV.map((item) => renderNavItem(item, "violet"))}
        </nav>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-sidebar-border" />

      {/* System */}
      <div className="py-3">
        <nav className="space-y-0.5 px-1">
          {SYSTEM_NAV.map((item) => renderNavItem(item, "zinc"))}
          {isSuperadmin && ADMIN_NAV.map((item) => renderNavItem(item, "zinc"))}
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Admin Mode Indicator */}
      {(user?.role === "admin" || user?.role === "superadmin") && !collapsed && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-mono font-semibold text-amber-400 uppercase tracking-wider">
              Admin Mode
            </span>
          </div>
          <p className="text-[10px] text-amber-400/60 mt-1 leading-relaxed">
            เห็นข้อมูลของ user ทุกคน
          </p>
        </div>
      )}

      {/* Collapse Toggle — desktop only */}
      <div className="hidden lg:block p-2 border-t border-sidebar-border">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile: safe area bottom padding */}
      <div className="lg:hidden h-6 shrink-0" />
    </aside>
  );

  return sidebarContent;
}
