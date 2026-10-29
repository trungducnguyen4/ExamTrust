"use client";

import { AlertCircle, ArrowRight, Eye, EyeOff, IdCard, Loader2, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        email,
        password,
        fullName,
        studentId: studentId || undefined,
      });
      router.push("/student");
    } catch (registerError: any) {
      const message = String(registerError?.message || "").toLowerCase();
      setError(
        message.includes("failed to fetch")
          ? "Không thể kết nối máy chủ. Hãy kiểm tra backend tại cổng 3001."
          : registerError?.message || "Đăng ký thất bại. Vui lòng thử lại.",
      );
    }
  };

  return (
    <AuthPageShell>
      <main id="main-content" className="container relative grid flex-1 items-center py-4 lg:py-6">
        <section className="mx-auto w-full max-w-2xl">
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-heavy sm:p-8">
            <div>
              <p className="text-sm font-semibold text-primary">Bắt đầu</p>
              <h2 className="mt-1.5 text-2xl font-bold tracking-[-0.035em]">Tạo tài khoản sinh viên</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Tài khoản giảng viên do nhà trường cấp.
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mt-5" role="alert">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Họ và tên</Label>
                  <div className="relative">
                    <User
                      className="pointer-events-none absolute inset-y-0 left-3.5 my-auto h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="fullName"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="Nguyễn Văn A"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                      className="pl-10"
                    />
                  </div>
                </div>

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
              </div>

              <div className="space-y-2">
                <Label htmlFor="studentId">Mã số sinh viên (tùy chọn)</Label>
                <div className="relative">
                  <IdCard
                    className="pointer-events-none absolute inset-y-0 left-3.5 my-auto h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="studentId"
                    name="studentId"
                    type="text"
                    placeholder="522h0001"
                    value={studentId}
                    onChange={(event) => setStudentId(event.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">Mật khẩu</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Ít nhất 6 ký tự"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={6}
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

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                Khi đăng ký, bạn đồng ý với chính sách sử dụng và bảo vệ dữ liệu của nhà trường.
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
                    Đang đăng ký
                  </>
                ) : (
                  <>
                    Đăng ký
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Đã có tài khoản?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Đăng nhập
              </Link>
            </p>
          </div>
        </section>
      </main>
    </AuthPageShell>
  );
}
