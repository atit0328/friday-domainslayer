/**
 * Login Page — Full-page standalone login (no sidebar/header)
 * Clean dark luxury design matching the app theme
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogIn, Mail, Lock, Loader2, Zap } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = trpc.localAuth.login.useMutation({
    onSuccess: () => {
      toast.success("เข้าสู่ระบบสำเร็จ!");
      window.location.href = "/";
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.06),transparent_50%)]" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 border border-emerald-500/30 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/10">
            <Zap className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-emerald-400">Friday</span>
            <span className="text-yellow-400">AI</span>
            <span className="text-muted-foreground"> x </span>
            <span className="text-emerald-400">Domain</span>
            <span className="text-yellow-400">City</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">SEO & Domain Intelligence Platform</p>
        </div>

        <Card className="bg-card/80 backdrop-blur-xl border-emerald-500/20 shadow-2xl shadow-emerald-500/5">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">เข้าสู่ระบบ</CardTitle>
            <CardDescription>
              เข้าสู่ระบบเพื่อใช้งานแพลตฟอร์ม
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="bg-background/50 border-border/50 focus:border-emerald-500/50"
                />
              </div>

              <div>
                <Label className="flex items-center gap-1.5 mb-1.5">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  รหัสผ่าน
                </Label>
                <Input
                  type="password"
                  placeholder="รหัสผ่านของคุณ"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="bg-background/50 border-border/50 focus:border-emerald-500/50"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
                disabled={login.isPending}
              >
                {login.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4 mr-2" />
                )}
                เข้าสู่ระบบ
              </Button>
            </form>

            <div className="mt-4">
              <p className="text-center text-xs text-muted-foreground">
                ระบบนี้สำหรับผู้ดูแลระบบเท่านั้น
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          © 2026 Friday AI x DomainSlayer. All rights reserved.
        </p>
      </div>
    </div>
  );
}
