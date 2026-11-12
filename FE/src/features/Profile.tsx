"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Globe2,
  Laptop,
  Loader2,
  Monitor,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

type Session = {
  id: string;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: string;
  active: boolean;
};

function getSessionDevice(userAgent?: string | null) {
  const agent = userAgent || "";
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(agent);
  const platform = /windows/i.test(agent)
    ? "Windows"
    : /mac os|macintosh/i.test(agent)
      ? "macOS"
      : /android/i.test(agent)
        ? "Android"
        : /iphone|ipad|ipod/i.test(agent)
          ? "iOS"
          : /linux/i.test(agent)
            ? "Linux"
            : "Thiết bị không xác định";
  const browser = /edg\//i.test(agent)
    ? "Microsoft Edge"
    : /firefox\//i.test(agent)
      ? "Firefox"
      : /chrome\//i.test(agent)
        ? "Chrome"
        : /safari\//i.test(agent)
          ? "Safari"
          : "Trình duyệt";

  return {
    browser,
    platform,
    label: `${browser} trên ${platform}`,
    icon: isMobile ? Smartphone : /windows|mac os|linux/i.test(agent) ? Laptop : Monitor,
  };
}

type SessionGroup = Session & {
  activeSessionIds: string[];
};

function groupSessionsByDevice(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();

  for (const session of sessions) {
    const device = getSessionDevice(session.userAgent);
    const key = `${device.label}|${session.ip || "unknown"}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ...session,
        active: session.active,
        activeSessionIds: session.active ? [session.id] : [],
      });
      continue;
    }

    if (session.active) {
      existing.active = true;
      existing.activeSessionIds.push(session.id);
    }

    if (new Date(session.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      existing.createdAt = session.createdAt;
      existing.userAgent = session.userAgent;
      existing.ip = session.ip;
    }
  }

  return Array.from(groups.values()).sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}

export default function Profile() {
  const { user, isAuthenticated, isLoading, applyProfileToSession } = useAuth();
  const router = useRouter();
  const isStudent = user?.role === "STUDENT";
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [studentId, setStudentId] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const deviceSessions = useMemo(() => groupSessionsByDevice(sessions), [sessions]);

  useEffect(() => {
    if (!user) return;

    setFullName(user.fullName || "");
    setEmail(user.email || "");
    setDepartment(user.department || "");
    setStudentId(user.studentId || "");
  }, [user]);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !user)) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router, user]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await api.listSessions();
      setSessions(Array.isArray(data) ? (data as Session[]) : []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadSessions();
  }, [user]);

  if (isLoading) {
    return (
      <main
        id="main-content"
        className="flex min-h-[100dvh] items-center justify-center bg-background px-6"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          Đang tải hồ sơ...
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isStudent) {
      toast.error("Sinh viên tạm thời chưa thể chỉnh sửa hồ sơ");
      return;
    }

    if (!fullName.trim() || !email.trim()) {
      toast.error("Họ tên và email là bắt buộc");
      return;
    }

    setIsSavingProfile(true);
    try {
      const updatedUser = await api.updateMyProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        department: department.trim() || undefined,
        studentId:
          user.role === "STUDENT" ? studentId.trim() || undefined : undefined,
      });
      applyProfileToSession(updatedUser);
      toast.success("Đã cập nhật hồ sơ");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật hồ sơ");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Vui lòng nhập đầy đủ các trường mật khẩu");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Mật khẩu mới phải có ít nhất 6 ký tự");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Xác nhận mật khẩu mới không khớp");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await api.changeMyPassword({
        currentPassword,
        newPassword,
      });
      toast.success("Đã cập nhật mật khẩu");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật mật khẩu");
    } finally {
      setIsUpdatingPassword(false);
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleRevokeSessions = async (sessionIds: string[]) => {
    try {
      await Promise.all(sessionIds.map((sessionId) => api.revokeSession(sessionId)));
      toast.success(
        sessionIds.length > 1
          ? "Đã thu hồi các phiên trên thiết bị này"
          : "Đã thu hồi phiên đăng nhập",
      );
      await loadSessions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không thể thu hồi phiên");
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      await api.revokeAllSessions();
      toast.success("Đã đăng xuất tất cả thiết bị khác");
      await loadSessions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không thể thu hồi phiên");
    }
  };

  const roleLabel =
    user.role === "STUDENT"
      ? "Sinh viên"
      : user.role === "LECTURER"
        ? "Giảng viên"
        : "Quản trị viên";

  const dashboardPath =
    user.role === "ADMIN"
      ? "/admin"
      : user.role === "LECTURER"
        ? "/lecturer"
        : "/student";

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <BackToDashboardButton to={dashboardPath} className="mb-4 -ml-2" />

        <h1 className="text-2xl font-semibold text-foreground mb-1">Hồ sơ cá nhân</h1>
        <p className="text-muted-foreground mb-6">
          Quản lý thông tin và bảo mật tài khoản
        </p>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)] xl:items-start">
          {/* Profile Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Thông tin cá nhân</CardTitle>
              <CardDescription>
                Cập nhật thông tin tài khoản. Ảnh đại diện hiện chưa hỗ trợ thay đổi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {user.fullName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h3 className="font-medium text-foreground">
                    {user.fullName}
                  </h3>
                  <p className="text-sm text-muted-foreground break-all">
                    {user.email}
                  </p>
                  <StatusBadge status={user.role} domain="role" className="mt-2">
                    {roleLabel}
                  </StatusBadge>
                </div>
              </div>
              <Separator />
              <form
                className="grid gap-4 lg:grid-cols-2"
                onSubmit={handleProfileUpdate}
              >
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="full-name">Họ và tên</Label>
                  <Input
                    id="full-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isStudent}
                    required
                  />
                </div>
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="email-address">Địa chỉ email</Label>
                  <Input
                    id="email-address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isStudent}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="department">Khoa hoặc đơn vị</Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={isStudent}
                    placeholder="Ví dụ: Công nghệ thông tin"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="student-id">Mã sinh viên</Label>
                  <Input
                    id="student-id"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    disabled={isStudent || user.role !== "STUDENT"}
                    placeholder={
                      user.role === "STUDENT"
                        ? "Nhập mã sinh viên"
                        : "Chỉ dành cho tài khoản sinh viên"
                    }
                  />
                </div>
                <div className="grid gap-2 lg:col-span-2">
                  <Label>Vai trò</Label>
                  <Input
                    value={roleLabel}
                    disabled
                    className="bg-secondary/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Liên hệ quản trị viên nếu cần thay đổi vai trò.
                  </p>
                </div>
                <div className="lg:col-span-2">
                  <Button type="submit" disabled={isSavingProfile || isStudent}>
                    {isSavingProfile && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Lưu hồ sơ
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Password Change */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Đổi mật khẩu</CardTitle>
                <CardDescription>
                  Sử dụng mật khẩu riêng và đủ mạnh để bảo vệ tài khoản
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
                    <Input
                      id="current-password"
                      type="password"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-password">Mật khẩu mới</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirm-password">
                      Xác nhận mật khẩu mới
                    </Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" disabled={isUpdatingPassword}>
                    {isUpdatingPassword && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Cập nhật mật khẩu
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Session management */}
        <Card className="mt-6">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Phiên đăng nhập</CardTitle>
              <CardDescription>
                Các thiết bị/trình duyệt đang đăng nhập tài khoản này
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={sessionsLoading || deviceSessions.length === 0}
              onClick={handleRevokeAllSessions}
            >
              Đăng xuất tất cả thiết bị
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessionsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải phiên đăng
                nhập...
              </div>
            ) : deviceSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có phiên đăng nhập nào.
              </p>
            ) : (
              deviceSessions.map((s) => {
                const device = getSessionDevice(s.userAgent);
                const DeviceIcon = device.icon;

                return (
                  <div
                    key={s.id}
                    className="grid gap-3 rounded-xl border border-border/80 bg-card p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <DeviceIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-medium text-foreground">{device.label}</p>
                        {s.active && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            Đang hoạt động
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                        <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{s.ip || "Không xác định IP"}</span>
                        <span aria-hidden="true">·</span>
                        <span>Đăng nhập {new Date(s.createdAt).toLocaleString("vi-VN")}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                      {!s.active && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Đã thu hồi
                        </span>
                      )}
                      {s.active && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[#E5E7EB] bg-white text-[#374151] shadow-none hover:bg-[#F9FAFB] hover:text-[#111827]"
                          onClick={() => handleRevokeSessions(s.activeSessionIds)}
                        >
                          Thu hồi
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

