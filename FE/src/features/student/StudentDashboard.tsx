"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { HelpedTitle } from "@/components/common/ContextHelp";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, getStatusBadgeLabel } from "@/components/ui/status-badge";
import {
  Calendar,
  Clock,
  FileText,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Loader2,
  RefreshCw,
  TrendingUp,
  Target,
  Award,
} from "lucide-react";
import { format, formatDistanceToNow, addHours } from "date-fns";
import { vi } from "date-fns/locale";
import Link from "next/link";
import { formatScoreVi } from "@/lib/presentation";
import { useStudentDashboardData } from "./hooks/useStudentDashboardData";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function StudentDashboard() {
  const { user } = useAuth();
  const {
    upcomingExams,
    examHistory,
    latestCompletedSubmissionByExamId,
    loading,
    initialized,
    reload,
  } = useStudentDashboardData();

  const avgScore =
    examHistory.length > 0
      ? Number((
          examHistory.reduce((acc, e) => acc + (e.score || 0), 0) /
            examHistory.length
        ).toFixed(2))
      : 0;



  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-wrap items-start justify-between gap-3 animate-fade-in opacity-0">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Chào mừng trở lại, {user?.fullName.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">
              {upcomingExams.length > 0
                ? `Bạn có ${upcomingExams.length} bài thi sắp diễn ra`
                : "Bạn đã hoàn tất lịch hiện tại. Không có bài thi sắp tới."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Làm mới
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              label: "Bài thi sắp tới",
              value: upcomingExams.length,
              icon: FileText,
              color: "text-blue-600",
              bg: "bg-blue-500/10",
              gradient: "card-gradient-blue",
              sub: "Đã lên lịch",
            },
            {
              label: "Điểm trung bình",
              value: formatScoreVi(avgScore),
              icon: Target,
              color: "text-violet-600",
              bg: "bg-violet-500/10",
              gradient: "card-gradient-violet",
              sub: "Kết quả tổng quan",
            },
          ].map((stat, i) => (
            <Card
              key={stat.label}
              className={`card-elevated ${stat.gradient} animate-fade-in-up opacity-0 stagger-${i + 1}`}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </p>
                    {loading && !initialized ? (
                      <Skeleton className="h-9 w-16 mt-1 rounded-lg" />
                    ) : (
                      <p className="text-3xl font-bold text-foreground mt-1">
                        {stat.value}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {stat.sub}
                    </p>
                  </div>
                  <div
                    className={`h-11 w-11 rounded-xl ${stat.bg} flex items-center justify-center`}
                  >
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Upcoming Exams */}
          <div className="lg:col-span-3">
            <Card className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold">
                    <HelpedTitle help="Các bài thi đã được lên lịch hoặc sắp mở để bạn chuẩn bị trước.">
                      Bài thi sắp tới
                    </HelpedTitle>
                  </CardTitle>
                  <CardDescription>Các bài thi đã được lên lịch</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-primary gap-1 rounded-xl"
                  asChild
                >
                  <Link href="/student/exams">
                    Xem tất cả
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {loading && !initialized ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border/50">
                          <div className="space-y-2">
                            <Skeleton className="h-5 w-48" />
                            <div className="flex gap-3">
                              <Skeleton className="h-4 w-20" />
                              <Skeleton className="h-4 w-16" />
                            </div>
                          </div>
                          <Skeleton className="h-8 w-24 rounded-xl" />
                        </div>
                      ))}
                    </div>
                  ) : upcomingExams.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                        <Calendar className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground font-medium">
                        Không có bài thi sắp tới
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Lịch hiện tại đã hoàn tất.
                      </p>
                    </div>
                  ) : (
                    upcomingExams.map((exam, i) => {
                      const scheduledAt = new Date(exam.startTime);
                      const isToday =
                        scheduledAt.toDateString() ===
                        new Date().toDateString();
                      const latestAttemptNo = Number(exam.mySubmissionAttemptNo ?? 0);
                      const latestSubmissionId = latestCompletedSubmissionByExamId.get(exam.id)?.id;
                      const configuredMaxAttempts =
                        typeof exam.maxAttempts === "number"
                          ? exam.maxAttempts
                          : typeof exam.settings?.maxAttempts === "number"
                            ? exam.settings.maxAttempts
                            : null;
                      const status = String(
                        exam.mySubmissionStatus || "",
                      ).toUpperCase();
                      const isCompletedAttempt = Boolean(latestSubmissionId);
                      const attemptLimitReached =
                        configuredMaxAttempts !== null &&
                        Number.isFinite(configuredMaxAttempts) &&
                        latestAttemptNo >= configuredMaxAttempts;
                      const canStartNewAttempt =
                        !attemptLimitReached || status === "IN_PROGRESS";
                      const startUrl = `/student/exam-ready?examId=${exam.id}&title=${encodeURIComponent(exam.title)}&course=${encodeURIComponent(exam.course.code)}&duration=${exam.duration}`;

                      const todayCTA = (
                        <div className="flex items-center gap-2">
                          {isCompletedAttempt ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/student/grading?examId=${exam.id}${latestSubmissionId ? `&submissionId=${latestSubmissionId}` : ""}`}>
                                Xem kết quả
                              </Link>
                            </Button>
                          ) : null}
                          {canStartNewAttempt ? (
                            <Button
                              size="sm"
                              className="rounded-xl shadow-sm"
                              asChild
                            >
                              <Link href={startUrl}>Bắt đầu</Link>
                            </Button>
                          ) : !isCompletedAttempt ? (
                            <Button size="sm" variant="outline" disabled>
                              Đã hết lượt làm bài
                            </Button>
                          ) : null}
                        </div>
                      );

                      return (
                        <div
                          key={exam.id}
                          className={`flex items-center justify-between rounded-xl border border-border/50 p-4 hover:bg-secondary/50 hover:border-primary/10 transition-all duration-200 animate-fade-in opacity-0 stagger-${i + 1}`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2.5">
                              <h4 className="font-semibold text-foreground">
                              {exam.title}
                              </h4>
                              {isToday && (
                                <span className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-700 rounded-md font-semibold">
                                  Hôm nay
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1 font-medium">
                                <BookOpen className="h-3 w-3" />
                                {exam.course.code}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(scheduledAt, "dd/MM/yyyy", { locale: vi })}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {exam.duration} min
                              </span>
                            </div>
                          </div>
                          {isToday ? (
                            todayCTA
                          ) : (
                            <StatusBadge variant="info">
                              {formatDistanceToNow(scheduledAt, {
                                addSuffix: true,
                                locale: vi,
                              })}
                            </StatusBadge>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>

        {/* Recent Results */}
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold">
                <HelpedTitle help="Các lần làm bài gần nhất và trạng thái điểm số để bạn theo dõi tiến độ học tập.">
                  Kết quả gần đây
                </HelpedTitle>
              </CardTitle>
              <CardDescription>Lịch sử làm bài và điểm số của bạn</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary gap-1 rounded-xl"
              asChild
            >
              <Link href="/student/results">
                Xem tất cả
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {examHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Award className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    Chưa có kết quả bài thi
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Hoàn thành bài thi để xem kết quả tại đây
                  </p>
                </div>
              ) : (
                examHistory.slice(0, 5).map((submission, i) => {
                  const score = submission.score || 0;
                  const maxScore = 10;
                  const passingScore = Number(submission.exam?.passingScore ?? 50) / 10;
                  const passed = score >= passingScore;
                  const completedAt = submission.submittedAt
                    ? new Date(submission.submittedAt)
                    : new Date();
                  const pct = Math.round((score / maxScore) * 100);
                  const submissionAttempt = submission.attemptNo ?? "Chưa cập nhật";

                  return (
                    <Link
                      key={submission.id}
                      href={`/student/grading?examId=${submission.examId}&submissionId=${submission.id}`}
                      className={`flex items-center justify-between rounded-xl border border-border/50 p-4 hover:bg-secondary/50 hover:border-primary/10 transition-all duration-200 animate-fade-in opacity-0 stagger-${i + 1}`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-11 w-11 rounded-xl flex items-center justify-center ${
                            passed ? "bg-emerald-500/10" : "bg-red-500/10"
                          }`}
                        >
                          {passed ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground">
                            {submission.exam?.title}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {submission.exam?.course?.code} ·{" "}
                            {format(completedAt, "dd/MM/yyyy", { locale: vi })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Lượt {submissionAttempt}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-4">
                        <div>
                          <p className="text-lg font-bold text-foreground">
                            {formatScoreVi(score)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pct}%
                          </p>
                        </div>
                        <StatusBadge
                          variant={passed ? "success" : "destructive"}
                        >
                          {passed ? "ĐẠT" : "KHÔNG ĐẠT"}
                        </StatusBadge>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}



