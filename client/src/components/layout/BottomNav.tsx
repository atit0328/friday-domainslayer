/**
 * Bottom Navigation Bar — Mobile Only
 * Shows 5 key navigation items with active state indicator
 * Hidden on desktop (lg+), visible on mobile with safe-area padding
 */
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Search,
  Bot,
  Brain,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "หน้าหลัก" },
  { href: "/scanner", icon: Search, label: "สแกน" },
  { href: "/chat", icon: Bot, label: "AI Chat" },
  { href: "/seo", icon: Brain, label: "SEO" },
  { href: "/settings", icon: Settings, label: "ตั้งค่า" },
];

export default function BottomNav() {
  const [location] = useLocation();

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0 z-40
        lg:hidden
        bg-sidebar/95 backdrop-blur-xl
        border-t border-sidebar-border/50
        safe-bottom
      "
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`
                  flex flex-col items-center justify-center gap-0.5
                  w-14 h-12 rounded-xl
                  transition-all duration-200
                  ${active
                    ? "text-emerald"
                    : "text-muted-foreground active:text-foreground active:bg-muted/30"
                  }
                `}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform duration-200 ${active ? "scale-110" : ""}`} />
                  {active && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald" />
                  )}
                </div>
                <span className={`text-[10px] font-medium leading-tight ${active ? "font-semibold" : ""}`}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {/* Extra safe area for notched devices */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
