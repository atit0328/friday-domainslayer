/**
 * Design: Obsidian Intelligence — Dark Luxury Dashboard Layout
 * Sidebar + Header + Content area with frosted glass aesthetic
 * Mobile: sidebar overlay, bottom nav, pull-to-refresh, touch-friendly
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import PullToRefresh from "../PullToRefresh";
import { trpc } from "@/lib/trpc";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [location] = useLocation();
  const utils = trpc.useUtils();

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  // Pull-to-refresh handler — invalidate all tRPC queries
  const handleRefresh = useCallback(async () => {
    await utils.invalidate();
    // Small delay to show the refresh animation
    await new Promise((r) => setTimeout(r, 500));
  }, [utils]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, sticky on desktop */}
      <div
        className={`
          fixed lg:relative z-50 lg:z-auto
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          lg:sticky lg:top-0 lg:h-screen
        `}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        <main
          className="flex-1 p-3 sm:p-4 md:p-6 pb-20 lg:pb-6"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <PullToRefresh onRefresh={handleRefresh}>
            <div className="animate-fade-in-up">
              {children}
            </div>
          </PullToRefresh>
        </main>
      </div>

      {/* Bottom Navigation — mobile only */}
      <BottomNav />
    </div>
  );
}
