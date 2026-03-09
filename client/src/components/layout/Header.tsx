/**
 * Design: Obsidian Intelligence — Top Header Bar
 * Mobile: full-width notification dropdown, touch-friendly buttons
 */
import { useState, useRef, useEffect } from "react";
import { Menu, Bell, CheckCircle, X, BellOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

interface HeaderProps {
  onToggleSidebar: () => void;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: "info" | "success" | "warning" | "error";
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { user, isAuthenticated } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      title: "ระบบพร้อมใช้งาน",
      message: "Backend tRPC + AI LLM เชื่อมต่อสำเร็จ",
      time: "เมื่อสักครู่",
      read: false,
      type: "success",
    },
    {
      id: "2",
      title: "Moz API Quota",
      message: "Moz API quota ใกล้หมด — ค่า DA/PA อาจใช้ estimation",
      time: "5 นาทีที่แล้ว",
      read: false,
      type: "warning",
    },
    {
      id: "3",
      title: "Ahrefs API",
      message: "Ahrefs plan ไม่รองรับ — DR ใช้ estimation แทน",
      time: "10 นาทีที่แล้ว",
      read: true,
      type: "info",
    },
  ]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
    setShowNotifications(false);
  };

  const typeDots = {
    info: "bg-blue-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    error: "bg-red-400",
  };

  return (
    <header className="h-[56px] bg-card/50 backdrop-blur-md border-b border-border flex items-center justify-between px-3 sm:px-4 shrink-0 sticky top-0 z-30">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Hamburger — visible on mobile */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden w-10 h-10 shrink-0"
          onClick={onToggleSidebar}
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Status indicators — hidden on small mobile */}
        <div className="hidden sm:flex items-center gap-3 lg:gap-4">
          <div className="flex items-center gap-1.5 lg:gap-2">
            <CheckCircle className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-emerald" />
            <span className="font-mono text-[10px] lg:text-[11px] text-muted-foreground">
              Backend: <span className="text-emerald">Unified tRPC</span>
            </span>
          </div>
          <div className="w-px h-4 bg-border hidden md:block" />
          <div className="hidden md:flex items-center gap-1.5 lg:gap-2">
            <CheckCircle className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-violet" />
            <span className="font-mono text-[10px] lg:text-[11px] text-muted-foreground">
              AI: <span className="text-violet">Built-in LLM</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Notification Bell with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative w-10 h-10"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-[9px] font-bold text-white">{unreadCount}</span>
              </span>
            )}
          </Button>

          {/* Dropdown — full-width on mobile, positioned on desktop */}
          {showNotifications && (
            <div className="fixed sm:absolute inset-x-0 sm:inset-x-auto sm:right-0 top-[56px] sm:top-full sm:mt-2 sm:w-80 bg-card border-b sm:border border-border sm:rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <span className="text-sm font-semibold">การแจ้งเตือน</span>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={markAllRead}>
                      อ่านทั้งหมด
                    </Button>
                  )}
                  {notifications.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-muted-foreground" onClick={clearAll}>
                      ล้าง
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 sm:hidden"
                    onClick={() => setShowNotifications(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Notification List */}
              <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto overscroll-contain">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <BellOff className="w-8 h-8 mb-2 opacity-30" />
                    <span className="text-xs">ไม่มีการแจ้งเตือน</span>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`px-4 py-3.5 sm:py-3 border-b border-border/50 hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer ${
                        !notification.read ? "bg-muted/10" : ""
                      }`}
                      onClick={() => {
                        setNotifications((prev) =>
                          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
                        );
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${typeDots[notification.type]}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs font-semibold ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}>
                              {notification.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{notification.time}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            {notification.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-1 sm:ml-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald/30 to-violet/30 border border-border flex items-center justify-center">
            <span className="text-xs font-bold">{user?.name?.[0]?.toUpperCase() || "?"}</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            {isAuthenticated && user?.name && (
              <span className="text-xs font-mono text-muted-foreground">{user.name}</span>
            )}
            {(user?.role === "admin" || user?.role === "superadmin") && (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                {user.role === "superadmin" ? "Super" : "Admin"}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
