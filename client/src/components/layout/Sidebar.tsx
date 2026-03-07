/**
 * Design: Obsidian Intelligence — Sidebar Navigation
 * Two sections: DomainSlayer (emerald) + Friday AI (violet)
 */
import { useLocation, Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LayoutDashboard, Search, Store, Bot, Zap, Link2,
  Gavel, Eye, ShoppingCart, Radio, Settings, ChevronLeft, ChevronRight, Brain, Skull,
  History, LayoutTemplate, Target, Users, LineChart, Cpu, Clock,
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
  { href: "/chat", icon: Bot, label: "Friday AI Chat" },
  { href: "/seo", icon: Brain, label: "SEO Automation" },
  { href: "/modules", icon: Zap, label: "SEO Modules" },
  { href: "/pbn", icon: Link2, label: "PBN Manager" },
  { href: "/algorithm", icon: Radio, label: "Algorithm Intel" },
  { href: "/rank-dashboard", icon: LineChart, label: "Rank Tracker" },
];

const BLACKHAT_NAV = [
  { href: "/blackhat", icon: Skull, label: "Blackhat Mode" },
  { href: "/ai-attack", icon: Cpu, label: "AI Attack Engine" },
  { href: "/autonomous-history", icon: Clock, label: "Attack History" },
  { href: "/deploy-history", icon: History, label: "Deploy History" },
  { href: "/templates", icon: LayoutTemplate, label: "Template Library" },
  { href: "/keyword-ranking", icon: Target, label: "Keyword Ranking" },
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
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";

  const renderNavItem = (item: typeof DOMAIN_NAV[0], color: "emerald" | "violet" | "zinc") => {
    const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
    const Icon = item.icon;
    const colorClasses = {
      emerald: active
        ? "bg-emerald/10 text-emerald border-l-emerald"
        : "text-muted-foreground hover:text-emerald hover:bg-emerald/5 border-l-transparent",
      violet: active
        ? "bg-violet/10 text-violet border-l-violet"
        : "text-muted-foreground hover:text-violet hover:bg-violet/5 border-l-transparent",
      zinc: active
        ? "bg-muted text-foreground border-l-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-transparent",
    };

    return (
      <Link key={item.href} href={item.href}>
        <div
          className={`flex items-center gap-3 px-3 py-2.5 border-l-[3px] transition-all duration-200 cursor-pointer ${colorClasses[color]} ${collapsed ? "justify-center px-2" : ""}`}
        >
          <Icon className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span className="text-[13px] font-medium truncate">{item.label}</span>}
        </div>
      </Link>
    );
  };

  return (
    <aside
      className={`${collapsed ? "w-[60px]" : "w-[230px]"} bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 shrink-0 sticky top-0 h-screen overflow-y-auto`}
    >
      {/* Logo */}
      <div className="h-[56px] flex items-center px-3 border-b border-sidebar-border shrink-0">
        {!collapsed ? (
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

      {/* Divider */}
      <div className="mx-4 border-t border-sidebar-border" />

      {/* AI Section */}
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
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 border-l-[3px] transition-all duration-200 cursor-pointer ${
                    active
                      ? "bg-red-500/10 text-red-500 border-l-red-500"
                      : "text-muted-foreground hover:text-red-500 hover:bg-red-500/5 border-l-transparent"
                  } ${collapsed ? "justify-center px-2" : ""}`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && <span className="text-[13px] font-medium truncate">{item.label}</span>}
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

      {/* System */}
      <div className="py-3">
        <nav className="space-y-0.5 px-1">
          {SYSTEM_NAV.map((item) => renderNavItem(item, "zinc"))}
          {isSuperadmin && ADMIN_NAV.map((item) => renderNavItem(item, "zinc"))}
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
