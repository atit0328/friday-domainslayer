/**
 * Design: Obsidian Intelligence — Settings
 * System info and user preferences — unified backend, no external API config needed
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Settings as SettingsIcon, CheckCircle, User, Shield, Zap, Trash2 } from "lucide-react";

export default function Settings() {
  const { user, isAuthenticated, logout } = useAuth();
  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { enabled: isAuthenticated });

  return (
    <div className="space-y-6 max-w-[900px]">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-foreground rounded-full" />
        <h1 className="text-lg font-bold tracking-tight">ตั้งค่าระบบ</h1>
      </div>

      {/* User Profile */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-violet" /> User Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isAuthenticated && user ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="font-mono">{user.name || "—"}</span>
              <span className="text-muted-foreground">Role</span>
              <span className="font-mono">
                <Badge variant="outline" className="text-[10px] font-mono">{user.role || "user"}</Badge>
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not logged in</p>
          )}
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald" /> ข้อมูลระบบ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Platform</span>
            <span className="font-mono">Friday AI x DomainSlayer</span>
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono">2.0.0 (Unified)</span>
            <span className="text-muted-foreground">Backend</span>
            <span className="font-mono flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald" /> tRPC + Express
            </span>
            <span className="text-muted-foreground">AI Engine</span>
            <span className="font-mono flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald" /> Built-in LLM
            </span>
            <span className="text-muted-foreground">Database</span>
            <span className="font-mono flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald" /> TiDB (MySQL)
            </span>
            <span className="text-muted-foreground">Auth</span>
            <span className="font-mono flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald" /> Manus OAuth
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan" /> Features
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              "Domain Scanner (AI)",
              "Marketplace Search",
              "Auto-Bid Rules",
              "Watchlist & Alerts",
              "SEO Campaigns (16-Phase)",
              "12+ SEO Modules",
              "PBN Manager (AI Content)",
              "Algorithm Intelligence",
              "Friday AI Chat",
              "Dashboard Analytics",
            ].map(feature => (
              <Badge key={feature} variant="outline" className="text-[10px] font-mono">
                <CheckCircle className="w-2.5 h-2.5 mr-1 text-emerald" /> {feature}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card className="glass-card border-destructive/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          {isAuthenticated && (
            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => { logout(); toast.success("Logged out"); }}>
              <Trash2 className="w-4 h-4 mr-1.5" /> Logout
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
