import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/layout/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

// ─── Lazy-loaded pages ───
// Each page is split into its own chunk for faster initial load
// and crash isolation (a broken page won't take down the whole app)
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
const SeoBlackhatMode = lazy(() => import("./pages/SeoBlackhatMode"));
const DeployHistory = lazy(() => import("./pages/DeployHistory"));
const TemplateLibrary = lazy(() => import("./pages/TemplateLibrary"));
const KeywordRanking = lazy(() => import("./pages/KeywordRanking"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const RankDashboard = lazy(() => import("./pages/RankDashboard"));
const AutonomousFriday = lazy(() => import("./pages/AutonomousFriday"));
const AutonomousHistory = lazy(() => import("./pages/AutonomousHistory"));
const ProxyDashboard = lazy(() => import("./pages/ProxyDashboard"));
const MassDiscovery = lazy(() => import("./pages/MassDiscovery"));
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
        <Route path="/seo" component={SeoCommandCenter} />
        <Route path="/seo/:id" component={SeoProjectDetail} />

        {/* Superadmin-only routes (Blackhat section) */}
        <Route path="/blackhat">{() => { window.location.href = "/ai-attack"; return null; }}</Route>
        <Route path="/ai-attack">{() => <SuperadminGuard><AutonomousFriday /></SuperadminGuard>}</Route>
        <Route path="/deploy-history">{() => <SuperadminGuard><DeployHistory /></SuperadminGuard>}</Route>
        <Route path="/templates">{() => <SuperadminGuard><TemplateLibrary /></SuperadminGuard>}</Route>
        <Route path="/keyword-ranking">{() => <SuperadminGuard><KeywordRanking /></SuperadminGuard>}</Route>
        <Route path="/autonomous-history">{() => <SuperadminGuard><AutonomousHistory /></SuperadminGuard>}</Route>
        <Route path="/proxy-dashboard">{() => <SuperadminGuard><ProxyDashboard /></SuperadminGuard>}</Route>
        <Route path="/mass-discovery">{() => <SuperadminGuard><MassDiscovery /></SuperadminGuard>}</Route>
        {/* Redirects from old routes */}
        <Route path="/seo-spam">{() => { window.location.href = "/ai-attack"; return null; }}</Route>
        <Route path="/autonomous">{() => { window.location.href = "/ai-attack"; return null; }}</Route>
        <Route path="/blackhat-old">{() => { window.location.href = "/ai-attack"; return null; }}</Route>
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
