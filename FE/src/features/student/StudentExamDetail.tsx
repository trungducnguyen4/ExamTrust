"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlarmClock,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStatusBadgeLabel } from "@/components/ui/status-badge";
import api from "@/lib/api";
import {
  formatAttemptLimitVi,
  formatDurationVi,
  formatNumberVi,
  getExamWindowLabel,
  getScheduleLabel,
} from "@/lib/presentation";

type ExamDetail = {
  id: string;
  title?: string;
  description?: string;
  duration?: number;
  status?: string;
  passingScore?: number;
  totalPoints?: number;
  maxAttempts?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  settings?: {
    maxAttempts?: number | null;
    allowedIpCidrs?: string[];
  };
  course?: {
    id?: string;
    code?: string;
    name?: string;
  };
  _count?: {
    submissions?: number;
  };
};

type MySubmission = {
  id?: string;
  status?: string;
  attemptNo?: number | null;
  score?: number | null;
  submittedAt?: string | null;
};

const statusBadgeClass = (status?: string) => {
  const normalized = String(status || "PUBLISHED").toUpperCase();

  if (["GRADED", "FINALIZED", "SUBMITTED"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (["IN_PROGRESS", "ONGOING"].includes(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
};

const accessBadgeClass = (state: string) => {
  if (state === "open") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (state === "upcoming") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

export default function StudentExamDetail() {
  const { id: routeId } = useParams();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [mySubmission, setMySubmission] = useState<MySubmission | null>(null);
  const [completedSubmission, setCompletedSubmission] = useState<MySubmission | null>(null);

  const loadExamDetail = useCallback(async () => {
    if (!id) {
      setError("Thiếu mã bài thi.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [examRes, mySubmissionsRes] = await Promise.all([
        api.getExam(id),
        api.getMySubmissions().catch(() => []),
      ]);

      setExam(examRes || null);
      const submissionList = Array.isArray(mySubmissionsRes) ? mySubmissionsRes : [];
      const examSubmissions = submissionList.filter((item: any) => String(item?.examId ?? item?.exam?.id ?? "") === id);
      const byLatest = [...examSubmissions].sort((a: any, b: any) => {
        const aTime = new Date(a?.submittedAt || a?.startedAt || a?.createdAt || 0).getTime();
        const bTime = new Date(b?.submittedAt || b?.startedAt || b?.createdAt || 0).getTime();
        return bTime - aTime;
      });
      const latestAny = byLatest[0] || null;
      const latestCompleted = byLatest.find((item: any) =>
        ["SUBMITTED", "GRADED", "FLAGGED", "FINALIZED"].includes(String(item?.status || "").toUpperCase()),
      ) || null;
      setMySubmission(latestAny || null);
      setCompletedSubmission(latestCompleted || null);
    } catch (err: any) {
      setError(err?.message || "Không thể tải chi tiết bài thi.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadExamDetail();
  }, [loadExamDetail]);

  const accessState = useMemo(() => {
    if (!exam) return "unknown";
    const now = Date.now();
    const startTs = exam.startTime ? new Date(exam.startTime).getTime() : NaN;
    const endTs = exam.endTime ? new Date(exam.endTime).getTime() : NaN;

    if (!Number.isNaN(endTs) && now > endTs) return "ended";
    if (!Number.isNaN(startTs) && now < startTs) return "upcoming";
    return "open";
  }, [exam]);

  const submissionStatus = String(mySubmission?.status || "").toUpperCase();
  const configuredMaxAttempts =
    typeof exam?.maxAttempts === "number"
      ? exam.maxAttempts
      : typeof exam?.settings?.maxAttempts === "number"
        ? exam.settings.maxAttempts
      : null;
  const latestAttemptNo = Number(mySubmission?.attemptNo ?? 0);
  const attemptLimitReached =
    configuredMaxAttempts !== null &&
    Number.isFinite(configuredMaxAttempts) &&
    latestAttemptNo >= configuredMaxAttempts;
  const canStartNewAttempt =
    !attemptLimitReached || submissionStatus === "IN_PROGRESS";
  const hasCompletedSubmission = Boolean(completedSubmission?.id);
  const shouldViewResult = hasCompletedSubmission;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackToDashboardButton to="/student/exams" label="Quay lại bài thi của tôi" className="-ml-2" />
          <Button variant="outline" size="sm" onClick={loadExamDetail} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Làm mới
          </Button>
        </div>

        {loading ? (
          <Card className="border-slate-200 bg-white/95 shadow-medium">
            <CardContent className="py-12 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-slate-200 bg-white/95 shadow-medium">
            <CardContent className="py-10 text-center">
              <p className="font-medium text-foreground">Không thể tải chi tiết bài thi.</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden border-slate-200 bg-white/95 shadow-medium">
              <div className="h-1 bg-gradient-to-r from-primary via-emerald-500 to-amber-400" />
              <CardHeader className="bg-slate-50/70">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-2xl text-slate-900">
                    {exam?.title || "Chi tiết bài thi"}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(exam?.status)}
                  >
                    {getStatusBadgeLabel(String(exam?.status || "PUBLISHED"))}
                  </Badge>
                  {exam?.course?.code ? (
                    <Badge
                      variant="secondary"
                      className="border-slate-200 bg-white text-slate-600"
                    >
                      {exam.course.code}
                    </Badge>
                  ) : null}
                </div>
                <CardDescription>
                  {exam?.course?.name || "Chưa có thông tin khóa học"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <p className="text-sm text-muted-foreground">
                  {exam?.description || "Bài thi này chưa có mô tả bổ sung."}
                </p>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-muted-foreground">Thời gian bắt đầu</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <CalendarClock className="h-4 w-4 text-primary" />
                      {getScheduleLabel(exam?.startTime)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-muted-foreground">Thời gian kết thúc</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <AlarmClock className="h-4 w-4 text-primary" />
                      {getScheduleLabel(exam?.endTime)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-muted-foreground">Thời lượng</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <Clock3 className="h-4 w-4 text-primary" />
                      {formatDurationVi(exam?.duration)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-muted-foreground">Điểm đạt</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {formatNumberVi(exam?.passingScore)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-muted-foreground">Khóa học</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <BookOpen className="h-4 w-4 text-primary" />
                      {exam?.course?.code || "Chưa cập nhật"} - {exam?.course?.name || "Chưa cập nhật"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-muted-foreground">Tổng điểm</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <FileText className="h-4 w-4 text-primary" />
                      {formatNumberVi(exam?.totalPoints)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs text-muted-foreground">Số lần làm tối đa</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatAttemptLimitVi(configuredMaxAttempts)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200 bg-white/95 shadow-medium">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70">
                <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  Quyền truy cập và lượt làm bài
                </CardTitle>
                <CardDescription>
                  Kiểm tra trạng thái mở bài thi, lượt làm và thao tác tiếp theo của bạn.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={accessBadgeClass(accessState)}>
                    Trạng thái: {getExamWindowLabel(accessState)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(submissionStatus || "NOT_STARTED")}
                  >
                    Lượt làm: {mySubmission ? getStatusBadgeLabel(submissionStatus || "IN_PROGRESS") : "Chưa bắt đầu"}
                  </Badge>
                  {mySubmission?.attemptNo ? (
                    <Badge variant="secondary" className="border-slate-200 bg-slate-50 text-slate-700">
                      Lượt {mySubmission.attemptNo}
                    </Badge>
                  ) : null}
                  {typeof mySubmission?.score === "number" ? (
                    <Badge variant="secondary" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Điểm: {formatNumberVi(mySubmission.score)}
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {shouldViewResult ? (
                    <Button asChild>
                      <Link href={`/student/grading?examId=${exam?.id}${completedSubmission?.id ? `&submissionId=${completedSubmission.id}` : ""}`}>Xem chi tiết kết quả</Link>
                    </Button>
                  ) : accessState === "open" && canStartNewAttempt ? (
                    <Button asChild>
                      <Link href={`/student/exam-ready?examId=${exam?.id}`}>Bắt đầu làm bài</Link>
                    </Button>
                  ) : accessState === "open" ? (
                    <Button asChild>
                      <Link href={`/student/exam-ready?examId=${exam?.id}`}>Bắt đầu làm bài</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" disabled>
                      {accessState === "upcoming" ? "Bài thi chưa mở" : "Bài thi đã đóng"}
                    </Button>
                  )}

                  {exam?.course?.id ? (
                    <Button asChild variant="outline">
                      <Link href={`/student/courses/${exam.course.id}`}>Đi đến khóa học</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}



