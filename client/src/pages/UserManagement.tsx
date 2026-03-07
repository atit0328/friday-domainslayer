/**
 * User Management Page — Superadmin Only
 * Create/delete admins, change roles, reset passwords
 */
import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users, Shield, Search, Crown, AlertTriangle,
  ChevronLeft, ChevronRight, Plus, Trash2, KeyRound, Loader2,
} from "lucide-react";
import { Redirect } from "wouter";

type UserRole = "admin" | "superadmin";

const ROLE_CONFIG: Record<UserRole, { label: string; icon: typeof Shield; badge: string }> = {
  admin: { label: "Admin", icon: Shield, badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  superadmin: { label: "Superadmin", icon: Crown, badge: "bg-red-500/15 text-red-400 border-red-500/30" },
};

export default function UserManagement() {
  const { user, loading } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [page, setPage] = useState(0);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", name: "", password: "" });

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean; userId: number; userName: string; email: string;
  }>({ open: false, userId: 0, userName: "", email: "" });

  const [roleDialog, setRoleDialog] = useState<{
    open: boolean; userId: number; userName: string; currentRole: UserRole; newRole: UserRole;
  }>({ open: false, userId: 0, userName: "", currentRole: "admin", newRole: "admin" });

  const [resetDialog, setResetDialog] = useState<{
    open: boolean; userId: number; userName: string; email: string;
  }>({ open: false, userId: 0, userName: "", email: "" });
  const [newPassword, setNewPassword] = useState("");

  const PAGE_SIZE = 20;

  const { data: stats, refetch: refetchStats } = trpc.userManagement.stats.useQuery(undefined, {
    enabled: user?.role === "superadmin",
  });

  const { data, isLoading, refetch } = trpc.userManagement.list.useQuery(
    { limit: PAGE_SIZE, offset: page * PAGE_SIZE, search: search || undefined, roleFilter },
    { enabled: user?.role === "superadmin" }
  );

  const createAdmin = trpc.userManagement.createAdmin.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      setCreateOpen(false);
      setCreateForm({ email: "", name: "", password: "" });
      refetch();
      refetchStats();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteUser = trpc.userManagement.deleteUser.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      setDeleteDialog((p) => ({ ...p, open: false }));
      refetch();
      refetchStats();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRole = trpc.userManagement.updateRole.useMutation({
    onSuccess: (result) => {
      toast.success(`เปลี่ยน role เป็น ${result.newRole} สำเร็จ`);
      setRoleDialog((p) => ({ ...p, open: false }));
      refetch();
      refetchStats();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPassword = trpc.userManagement.resetPassword.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      setResetDialog((p) => ({ ...p, open: false }));
      setNewPassword("");
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = useMemo(() => {
    if (!data?.total) return 1;
    return Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  }, [data?.total]);

  // Guard: superadmin only
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-emerald border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || user.role !== "superadmin") {
    return <Redirect to="/" />;
  }

  const formatDate = (date: Date | string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("th-TH", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald/15 border border-emerald/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald" />
            </div>
            จัดการผู้ใช้
          </h1>
          <p className="text-muted-foreground mt-1">
            จัดการ Admin accounts — เพิ่ม/ลบ/เปลี่ยน role
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 gap-2"
        >
          <Plus className="w-4 h-4" />
          เพิ่ม Admin
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">ทั้งหมด</p>
                <p className="text-2xl font-bold mt-1">{stats?.total ?? 0}</p>
              </div>
              <Users className="w-8 h-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Admins</p>
                <p className="text-2xl font-bold mt-1 text-amber-400">{stats?.admins ?? 0}</p>
              </div>
              <Shield className="w-8 h-8 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Superadmins</p>
                <p className="text-2xl font-bold mt-1 text-red-400">{stats?.superadmins ?? 0}</p>
              </div>
              <Crown className="w-8 h-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อ, อีเมล..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9 bg-background/50"
              />
            </div>
            <Select
              value={roleFilter}
              onValueChange={(v) => { setRoleFilter(v as typeof roleFilter); setPage(0); }}
            >
              <SelectTrigger className="w-[180px] bg-background/50">
                <SelectValue placeholder="กรอง Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="superadmin">Superadmin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>รายชื่อผู้ใช้ ({data?.total ?? 0} คน)</span>
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-normal">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span>หน้า {page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-emerald border-t-transparent rounded-full" />
            </div>
          ) : !data?.users.length ? (
            <div className="text-center py-12 text-muted-foreground">ไม่พบผู้ใช้</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="w-[50px]">ID</TableHead>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>อีเมล</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>เข้าใช้ล่าสุด</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.users.map((u) => {
                    const role = (u.role === "superadmin" ? "superadmin" : "admin") as UserRole;
                    const roleConfig = ROLE_CONFIG[role];
                    const RoleIcon = roleConfig.icon;
                    const isSelf = u.id === user?.id;

                    return (
                      <TableRow key={u.id} className="border-border/30 hover:bg-muted/30">
                        <TableCell className="font-mono text-xs text-muted-foreground">{u.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                              {(u.name ?? "?")[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                {u.name ?? "—"}
                                {isSelf && (
                                  <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 border-emerald/30 text-emerald">คุณ</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.email ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={`${roleConfig.badge} border text-[11px] gap-1`}>
                            <RoleIcon className="w-3 h-3" />
                            {roleConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(u.lastSignedIn)}</TableCell>
                        <TableCell className="text-right">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {/* Toggle role */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() =>
                                  setRoleDialog({
                                    open: true,
                                    userId: u.id,
                                    userName: u.name ?? "Unknown",
                                    currentRole: role,
                                    newRole: role === "admin" ? "superadmin" : "admin",
                                  })
                                }
                              >
                                {role === "admin" ? (
                                  <Crown className="w-3.5 h-3.5 mr-1 text-red-400" />
                                ) : (
                                  <Shield className="w-3.5 h-3.5 mr-1 text-amber-400" />
                                )}
                                {role === "admin" ? "→ Super" : "→ Admin"}
                              </Button>

                              {/* Reset password */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300"
                                onClick={() =>
                                  setResetDialog({
                                    open: true,
                                    userId: u.id,
                                    userName: u.name ?? "Unknown",
                                    email: u.email ?? "",
                                  })
                                }
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </Button>

                              {/* Delete (only admins, not superadmins) */}
                              {role === "admin" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                                  onClick={() =>
                                    setDeleteDialog({
                                      open: true,
                                      userId: u.id,
                                      userName: u.name ?? "Unknown",
                                      email: u.email ?? "",
                                    })
                                  }
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Create Admin Dialog ═══ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald" />
              เพิ่ม Admin ใหม่
            </DialogTitle>
            <DialogDescription>สร้างบัญชี Admin ใหม่เพื่อเข้าใช้งานระบบ</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createAdmin.mutate(createForm);
            }}
            className="space-y-4"
          >
            <div>
              <Label>ชื่อ</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="ชื่อผู้ใช้"
                required
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@example.com"
                required
              />
            </div>
            <div>
              <Label>รหัสผ่าน</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                required
                minLength={6}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>ยกเลิก</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={createAdmin.isPending}>
                {createAdmin.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                สร้าง Admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ═══ Delete User Dialog ═══ */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              ยืนยันการลบผู้ใช้
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>คุณกำลังจะลบ <strong>{deleteDialog.userName}</strong> ({deleteDialog.email})</p>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                การลบจะไม่สามารถกู้คืนได้ ข้อมูลทั้งหมดของผู้ใช้จะถูกลบ
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialog((p) => ({ ...p, open: false }))}>ยกเลิก</Button>
            <Button
              onClick={() => deleteUser.mutate({ userId: deleteDialog.userId })}
              disabled={deleteUser.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteUser.isPending ? "กำลังลบ..." : "ยืนยันลบ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Role Change Dialog ═══ */}
      <Dialog open={roleDialog.open} onOpenChange={(open) => setRoleDialog((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              ยืนยันการเปลี่ยน Role
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>คุณกำลังจะเปลี่ยน role ของ <strong>{roleDialog.userName}</strong></p>
              <div className="flex items-center gap-3 py-2">
                <Badge className={`${ROLE_CONFIG[roleDialog.currentRole]?.badge} border`}>
                  {ROLE_CONFIG[roleDialog.currentRole]?.label}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge className={`${ROLE_CONFIG[roleDialog.newRole]?.badge} border`}>
                  {ROLE_CONFIG[roleDialog.newRole]?.label}
                </Badge>
              </div>
              {roleDialog.newRole === "superadmin" && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  Superadmin มีสิทธิ์เข้าถึง Blackhat Mode และจัดการผู้ใช้ทั้งหมด
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRoleDialog((p) => ({ ...p, open: false }))}>ยกเลิก</Button>
            <Button
              onClick={() => updateRole.mutate({ userId: roleDialog.userId, newRole: roleDialog.newRole })}
              disabled={updateRole.isPending}
              className={roleDialog.newRole === "superadmin" ? "bg-red-600 hover:bg-red-700" : "bg-emerald hover:bg-emerald/90"}
            >
              {updateRole.isPending ? "กำลังบันทึก..." : "ยืนยัน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Reset Password Dialog ═══ */}
      <Dialog open={resetDialog.open} onOpenChange={(open) => { setResetDialog((p) => ({ ...p, open })); if (!open) setNewPassword(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-blue-400" />
              รีเซ็ตรหัสผ่าน
            </DialogTitle>
            <DialogDescription>
              ตั้งรหัสผ่านใหม่สำหรับ <strong>{resetDialog.userName}</strong> ({resetDialog.email})
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              resetPassword.mutate({ userId: resetDialog.userId, newPassword });
            }}
            className="space-y-4"
          >
            <div>
              <Label>รหัสผ่านใหม่</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                required
                minLength={6}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setResetDialog((p) => ({ ...p, open: false })); setNewPassword(""); }}>ยกเลิก</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={resetPassword.isPending}>
                {resetPassword.isPending ? "กำลังรีเซ็ต..." : "รีเซ็ตรหัสผ่าน"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
