"use client";

import { AlertCircle, ArrowRight, BookOpenCheck, Eye, EyeOff, GraduationCap, Loader2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { elapsedMs, logPerf, nowMs } from "@/lib/perf";

const demoAccounts = [
  { role: "Quản trị viên", email: "admin@tdtutdtu.edu.vn", icon: ShieldCheck },
  { role: "Giảng viên", email: "lecturer01@tdtutdtu.edu.vn", icon: BookOpenCheck },
  { role: "Sinh viên", email: "522h0001@tdtutdtu.edu.vn", icon: GraduationCap },
] as const;

const demoPassword = "123123123Az!";

// Local to Login only (single usage) — a horizontal icon-over-label demo-role picker,
// not extracted to components/ui since no other screen renders this.
function RoleDemoButton({
  icon: Icon,
  role,
  selected,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  role: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all duration-200",
        selected
          ? "border-primary/60 bg-accent/60 shadow-soft"
          : "border-border/70 bg-card hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
          selected ? "bg-primary text-primary-foreground" : "bg-accent text-primary",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-xs font-medium leading-tight text-foreground">{role}</span>
    </button>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [selectedDemoEmail, setSelectedDemoEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    const flowStartedAt = nowMs();
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const loginStartedAt = nowMs();
      await login(email, password);
      logPerf(`login-submit-to-auth-complete=${elapsedMs(loginStartedAt)}ms`);
      const normalizedEmail = email.toLowerCase();
      logPerf(`complete-login-before-redirect=${elapsedMs(flowStartedAt)}ms`);
      if (normalizedEmail.includes("lecturer")) router.push("/lecturer");
      else if (normalizedEmail.includes("admin")) router.push("/admin");
      else router.push("/student");
    } catch (loginError: any) {
      const message = String(loginError?.message || "").toLowerCase();
      setError(
        message.includes("failed to fetch")
          ? "Không thể kết nối máy chủ. Hãy kiểm tra backend tại cổng 3001."
          : "Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyDemoAccount = (accountEmail: string) => {
    setEmail(accountEmail);
    setPassword(demoPassword);
    setError("");
    setSelectedDemoEmail(accountEmail);
  };

  return (
    <AuthPageShell>
      <main
        id="main-content"
        className="container relative grid flex-1 items-center gap-8 py-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(420px,0.55fr)] lg:gap-10 lg:py-6"
      >
        <section className="hidden max-w-xl lg:block">
          <p className="text-sm font-semibold text-primary">Không gian làm việc an toàn</p>
          <h1 className="mt-3 text-3xl font-bold leading-[1.12] tracking-[-0.05em] text-foreground xl:text-4xl">
            Tiếp tục công việc theo đúng vai trò của bạn
          </h1>
          <p className="mt-4 max-w-[54ch] text-sm leading-6 text-muted-foreground">
            Sinh viên làm bài tập trung trong giao diện thi rõ ràng.
          </p>
          <p className="mt-1 max-w-[80ch] text-sm leading-6 text-muted-foreground">
            Giảng viên quản lý đề thi, ngân hàng câu hỏi, theo dõi kết quả học tập theo thời gian thực.
          </p>

          <div className="mt-6">
            <p className="text-sm font-semibold text-foreground">Tài khoản demo</p>
            <p className="mt-1 text-xs text-muted-foreground">Chọn một vai trò để điền thông tin đăng nhập.</p>
            <div className="mt-2.5 grid grid-cols-3 gap-3">
              {demoAccounts.map((account) => (
                <RoleDemoButton
                  key={account.email}
                  icon={account.icon}
                  role={account.role}
                  selected={selectedDemoEmail === account.email}
                  onSelect={() => applyDemoAccount(account.email)}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/60 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Gợi ý quy trình</p>
              <p className="mt-1.5 max-w-[38ch] text-sm leading-6 text-muted-foreground">
                Lưu ý: Để sử dụng tài khoản demo, hãy chọn một vai trò từ danh sách phía trên để tự động điền thông tin
                đăng nhập.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-primary/20">
              <ShieldCheck className="h-8 w-8" aria-hidden="true" />
              <BookOpenCheck className="h-8 w-8" aria-hidden="true" />
              <GraduationCap className="h-8 w-8" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-heavy">
            <div>
              <p className="text-sm font-semibold text-primary">Chào mừng trở lại</p>
              <h2 className="mt-1.5 text-2xl font-bold tracking-[-0.035em]">Đăng nhập ExamTrust</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Sử dụng tài khoản được nhà trường cấp.</p>
            </div>

            {error && (
              <Alert variant="destructive" className="mt-5" role="alert">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute inset-y-0 left-3.5 my-auto h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="tenban@truong.edu.vn"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="password">Mật khẩu</Label>
                  <Link href="/reset-password" className="text-xs font-medium text-primary hover:underline">
                    Quên mật khẩu?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="pr-11"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                Khi đăng nhập, bạn đồng ý với chính sách sử dụng và bảo vệ dữ liệu của nhà trường.
              </p>

              <Button
                type="submit"
                className="group w-full bg-gradient-to-r from-primary to-[hsl(195_72%_40%)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-heavy active:translate-y-0"
                size="lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Đang đăng nhập
                  </>
                ) : (
                  <>
                    Đăng nhập
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Chưa có tài khoản?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Đăng ký ngay
              </Link>
            </p>
          </div>
        </section>
      </main>
    </AuthPageShell>
  );
}
