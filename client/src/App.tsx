import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/layout/DashboardLayout";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

// ─── Lazy-loaded pages ───
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DomainScanner = lazy(() => import("./pages/DomainScanner"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const AiChat = lazy(() => import("./pages/AiChat"));
const Modules = lazy(() => import("./pages/Modules"));
const PbnManager = lazy(() => import("./pages/PbnManager"));
const AutoBid = lazy(() => import("./pages/AutoBid"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const Orders = lazy(() => import("./pages/Orders"));
const AlgorithmIntel = lazy(() => import("./pages/AlgorithmIntel"));
const Settings = lazy(() => import("./pages/Settings"));
const SeoCommandCenter = lazy(() => import("./pages/SeoCommandCenter"));
const SeoProjectDetail = lazy(() => import("./pages/SeoProjectDetail"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const RankDashboard = lazy(() => import("./pages/RankDashboard"));
const SeoBrain = lazy(() => import("./pages/SeoBrain"));
const CloakingSettings = lazy(() => import("./pages/CloakingSettings"));
const AAAHub = lazy(() => import("./pages/AAAHub"));
const NotFound = lazy(() => import("./pages/NotFound"));

/**
 * Page loading fallback — shown while lazy chunks are being fetched
 */
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
        <p className="text-xs text-muted-foreground font-mono tracking-wider">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Auth guard — redirects unauthenticated users to /login
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-muted-foreground font-mono">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  return <>{children}</>;
}

/**
 * Superadmin guard — redirects non-superadmin to home
 */
function SuperadminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "superadmin") {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

/**
 * Protected routes — wrapped in DashboardLayout + AuthGuard
 */
function ProtectedRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/scanner" component={DomainScanner} />
        <Route path="/marketplace" component={Marketplace} />
        <Route path="/chat" component={AiChat} />
        <Route path="/campaigns">{() => { window.location.href = "/seo"; return null; }}</Route>
        <Route path="/modules" component={Modules} />
        <Route path="/pbn" component={PbnManager} />
        <Route path="/autobid" component={AutoBid} />
        <Route path="/watchlist" component={Watchlist} />
        <Route path="/orders" component={Orders} />
        <Route path="/algorithm" component={AlgorithmIntel} />
        <Route path="/rank-dashboard" component={RankDashboard} />
        <Route path="/seo-brain" component={SeoBrain} />
        <Route path="/seo" component={SeoCommandCenter} />
        <Route path="/seo/:id" component={SeoProjectDetail} />
        <Route path="/cloaking">{() => <SuperadminGuard><CloakingSettings /></SuperadminGuard>}</Route>

        {/* ═══ AAA — AI All-in Attack (single hub for all attack functions) ═══ */}
        <Route path="/aaa" component={AAAHub} />

        {/* ═══ Redirects: all old attack routes → /aaa ═══ */}
        <Route path="/blackhat">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/ai-attack">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/agentic-attack">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/batch-attack">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/attack-dashboard">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/attack-timeline">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/deploy-history">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/templates">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/keyword-ranking">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/autonomous-history">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/proxy-dashboard">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/mass-discovery">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/scheduled-scans">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/cve-database">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/exploit-analytics">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/redirect-takeover">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/hijack-redirect">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/adaptive-learning">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/daemon">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/keyword-discovery">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/gambling-brain">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/keyword-performance">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/orchestrator-dashboard">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/target-acquisition">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/query-parasite">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/content-freshness">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/platform-discovery">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/algorithm-monitor">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/competitor-gap">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/ai-command-center">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/wp-themes">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/seo-spam">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/autonomous">{() => <Redirect to="/aaa" />}</Route>
        <Route path="/blackhat-old">{() => <Redirect to="/aaa" />}</Route>

        <Route path="/users">{() => <SuperadminGuard><UserManagement /></SuperadminGuard>}</Route>
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <PwaInstallPrompt />
          <Switch>
            {/* Public routes — no DashboardLayout, no auth required */}
            <Route path="/login">
              {() => (
                <Suspense fallback={<PageLoader />}>
                  <Login />
                </Suspense>
              )}
            </Route>

            {/* All other routes — require auth + DashboardLayout */}
            <Route>
              {() => (
                <AuthGuard>
                  <DashboardLayout>
                    <ProtectedRouter />
                  </DashboardLayout>
                </AuthGuard>
              )}
            </Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
