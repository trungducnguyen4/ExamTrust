"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { Activity, AlertTriangle, Camera, ClipboardCheck, History, Info, Loader2, RefreshCw, Search, Send, ShieldCheck, TableProperties } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import { DataPagination } from "@/components/common/DataPagination";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip";
import api, { API_BASE_URL, unwrapPaginatedData } from "@/lib/api";
import { getIntegrityEventLabel } from "@/lib/integrity-event-labels";
import { formatSignedScoreAdjustment, getScoreAdjustmentCategoryLabel } from "./manual-grading-formatters";

type ExamOverview = {
  exam: {
    id: string;
    title: string;
    totalPoints?: number;
    maxAttempts?: number | null;
    status?: string;
    startTime?: string | null;
    endTime?: string | null;
    settings?: { allowLateSubmission?: boolean } | null;
  };
  analyticsScope?: "OFFICIAL" | "PRACTICE";
  isUnlimited?: boolean;
  summary: {
    totalSubmissions: number;
    analyzedSubmissions?: number;
    inProgress: number;
    completed: number;
    avgScorePct: number;
    highestScorePct: number;
    lowestScorePct: number;
  };
  scoreDistribution: Array<{ key: string; count: number }>;
  anomalies: Array<{
    id: string;
    eventType: string;
    details?: string;
    timestamp: string;
    severity: "low" | "medium" | "high";
    submissionId?: string | null;
    student?: { fullName?: string; studentId?: string } | null;
  }>;
  updatedAt: string;
};

type MonitoringGroup = {
  key: string;
  student?: { fullName?: string; studentId?: string } | null;
  submissionId?: string | null;
  severity: "low" | "medium" | "high";
  latestTimestamp: string;
  eventTypes: string[];
  eventCount: number;
};

type SubmissionTimeline = {
  summary?: { tabSwitches?: number; mouseAnomalies?: number; warnings?: number; critical?: number };
  events?: Array<{ id: string; timestamp: string; description: string; severity: "normal" | "warning" | "critical"; detail?: string }>;
};

type EvidenceCapture = {
  id: string;
  capturedAt?: string | null;
  scheduledAt?: string | null;
  createdAt?: string | null;
  trigger?: string | null;
  scheduledSlot?: number | null;
  reviewStatus?: string | null;
};

// Slot 0 is always the exam-start checkpoint, the highest slot seen is
// always the guaranteed end-of-exam checkpoint, anything else is numbered
// by its own slot index (1, 2, 3...).
function getScheduledCaptureLabel(capture: EvidenceCapture, maxScheduledSlot: number | null): string {
  if (capture.trigger !== "SCHEDULED") return "Chụp theo tín hiệu";
  const slot = capture.scheduledSlot;
  if (slot === 0) return "Ảnh bắt đầu";
  if (slot != null && maxScheduledSlot != null && slot === maxScheduledSlot) return "Ảnh kết thúc";
  return slot != null ? `Định kỳ ${slot}` : "Chụp theo lịch";
}

type RiskFlag = {
  submissionId?: string | null;
  status?: string | null;
  job?: { output?: { riskLevel?: string | null } | null } | null;
};

type AnswerMatrix = {
  exam: { id: string; title: string; maxAttempts: number };
  submittedCount: number;
  questionColumns: Array<{
    key: string;
    label: string;
    stem: string;
    questionSnapshotId?: string | null;
    questionVersionId?: string | null;
    isRandomBankQuestion: boolean;
  }>;
  students: Array<{
    submissionId: string;
    student?: { fullName?: string | null; studentId?: string | null } | null;
    status: string;
    cells: Record<string, "CORRECT" | "INCORRECT" | "ESSAY_STRONG" | "ESSAY_MODERATE" | "ESSAY_WEAK" | "ESSAY_POOR" | "BLANK" | "PENDING_MANUAL" | "NOT_ASSIGNED" | "RANDOM_NOT_COMPARABLE">;
  }>;
  availableAttempts: number[];
  selectedAttemptNo: number;
};

function formatTimeSpent(start?: string | null, end?: string | null) {
  if (!start || !end) return "-";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(diffMs / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h} giờ ${m} phút`;
  return `${m} phút`;
}

function toLocalDateTimeInput(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getEventTypeLabel(eventType?: string) {
  return getIntegrityEventLabel(eventType);
}

function getAnomalyDescription(eventType?: string, details?: string) {
  const event = String(eventType || "").toLowerCase();
  const detailText = String(details || "");
  const detectedCount = detailText.match(/detected\s+(\d+)\s+(mouse anomalies|tab switches)/i);

  if (detectedCount) {
    const [, count, kind] = detectedCount;
    return kind.toLowerCase().includes("mouse")
      ? `Hệ thống ghi nhận ${count} tương tác chuột cần được đối chiếu.`
      : `Hệ thống ghi nhận ${count} lần chuyển tab trong phiên thi.`;
  }

  if (event === "tab_switch" || /"kind"\s*:\s*"tab_switch"/i.test(detailText)) {
    return "Hệ thống ghi nhận sinh viên đã chuyển sang một tab hoặc cửa sổ khác.";
  }
  if (event === "window_blur" || /"kind"\s*:\s*"window_blur"/i.test(detailText)) {
    return "Hệ thống ghi nhận cửa sổ làm bài tạm thời mất tiêu điểm.";
  }
  if (event === "fullscreen_exit") {
    return "Hệ thống ghi nhận sinh viên đã thoát chế độ toàn màn hình.";
  }
  if (event.includes("mouse")) {
    return "Hệ thống ghi nhận tương tác chuột cần được đối chiếu.";
  }
  return "Hệ thống đã lưu sự kiện này để giảng viên đối chiếu khi cần.";
}

function formatScoreOnTen(score: unknown) {
  const normalized = Number(score);
  if (!Number.isFinite(normalized)) return "-";
  return `${Math.max(0, Math.min(10, normalized)).toFixed(2)}/10`;
}

function groupAnomaliesByStudent(anomalies: ExamOverview["anomalies"]): MonitoringGroup[] {
  const severityRank = { low: 1, medium: 2, high: 3 } as const;
  const grouped = new Map<string, MonitoringGroup>();

  for (const anomaly of anomalies) {
    const key = anomaly.student?.studentId || anomaly.student?.fullName || anomaly.submissionId || anomaly.id;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        key,
        student: anomaly.student,
        submissionId: anomaly.submissionId,
        severity: anomaly.severity,
        latestTimestamp: anomaly.timestamp,
        eventTypes: [anomaly.eventType],
        eventCount: 1,
      });
      continue;
    }

    current.eventCount += 1;
    if (!current.eventTypes.includes(anomaly.eventType)) current.eventTypes.push(anomaly.eventType);
    if (severityRank[anomaly.severity] > severityRank[current.severity]) current.severity = anomaly.severity;
    if (new Date(anomaly.timestamp).getTime() >= new Date(current.latestTimestamp).getTime()) {
      current.latestTimestamp = anomaly.timestamp;
      current.submissionId = anomaly.submissionId || current.submissionId;
    }
  }

  return [...grouped.values()].sort(
    (left, right) => new Date(right.latestTimestamp).getTime() - new Date(left.latestTimestamp).getTime(),
  );
}

function ReviewStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border p-3 text-sm"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

export default function ExamResultsList() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug : [];
  const routeId = params?.id;
  const examId = Array.isArray(routeId) ? routeId[0] : routeId || slug[1];
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/admin") ? "/admin" : "/lecturer";

  const [examTitle, setExamTitle] = useState("Kết quả bài thi");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [overview, setOverview] = useState<ExamOverview | null>(null);
  const [manualStatus, setManualStatus] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [page, setPage] = useState(1);
  const fetchDataRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [reviewSubmission, setReviewSubmission] = useState<{ id: string; name: string } | null>(null);
  const [reviewTimeline, setReviewTimeline] = useState<SubmissionTimeline | null>(null);
  const [reviewCaptures, setReviewCaptures] = useState<EvidenceCapture[]>([]);
  const reviewMaxScheduledSlot = (() => {
    const slots = reviewCaptures
      .filter((c) => c.trigger === "SCHEDULED" && c.scheduledSlot != null)
      .map((c) => c.scheduledSlot as number);
    return slots.length ? Math.max(...slots) : null;
  })();
  const [reviewImages, setReviewImages] = useState<Record<string, string>>({});
  const [reviewRiskFlag, setReviewRiskFlag] = useState<RiskFlag | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [adjustmentHistory, setAdjustmentHistory] = useState<any | null>(null);
  const [adjustmentHistoryLoading, setAdjustmentHistoryLoading] = useState(false);
  const [answerMatrix, setAnswerMatrix] = useState<AnswerMatrix | null>(null);
  const [answerMatrixOpen, setAnswerMatrixOpen] = useState(false);
  const [answerMatrixLoading, setAnswerMatrixLoading] = useState(false);
  const [reopenSubmission, setReopenSubmission] = useState<{ id: string; name: string } | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [isReopening, setIsReopening] = useState(false);
  const [deadlineExtensionSubmission, setDeadlineExtensionSubmission] = useState<{
    id: string;
    name: string;
    deadline?: string | null;
  } | null>(null);
  const [deadlineExtensionAt, setDeadlineExtensionAt] = useState("");
  const [deadlineExtensionReason, setDeadlineExtensionReason] = useState("");
  const [isExtendingDeadline, setIsExtendingDeadline] = useState(false);
  const ITEMS_PER_PAGE = 10;
  const groupedAnomalies = groupAnomaliesByStudent(overview?.anomalies ?? []);
  // The matrix is one row per submission, so with multiple attempts allowed
  // it now shows one attempt at a time (picked via a dropdown in the dialog)
  // instead of being blocked outright — any exam with at least one
  // submission can open it.
  const canOpenAnswerMatrix = (overview?.summary?.totalSubmissions ?? 0) > 0;

  useEffect(() => {
    let mounted = true;

    const fetchData = async (silent = false) => {
      if (!examId) {
        setLoading(false);
        return;
      }

      if (silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [examRes, subsRes, overviewRes, manualStatusRes] = await Promise.all([
          api.getExam(examId),
          api.getExamSubmissions(examId, page, ITEMS_PER_PAGE),
          api.getExamOverview(examId),
          api.getExamManualGradingStatus(examId).catch(() => null),
        ]);

        if (!mounted) return;

        setExamTitle(examRes?.title || "Kết quả bài thi");
        setSubmissions(unwrapPaginatedData(subsRes));
        setTotalPages(subsRes?.totalPages ?? 1);
        setOverview(overviewRes || null);
        setManualStatus(manualStatusRes || null);
      } catch (err) {
        console.error("Không thể tải kết quả bài thi", err);
      } finally {
        if (!mounted) return;
        if (silent) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    };

    fetchDataRef.current = fetchData;
    fetchData();
    const intervalId = window.setInterval(() => fetchData(true), 10000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [examId, page]);

  const handleManualRefresh = () => {
    void fetchDataRef.current?.(true);
  };

  const filtered = submissions
    .filter((s) => {
      if (!search) return true;
      const name = s.student?.fullName || "";
      const sid = s.student?.studentId || "";
      return (
        name.toLowerCase().includes(search.toLowerCase()) ||
        sid.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => {
      const sidA = a.student?.studentId || a.studentId || "";
      const sidB = b.student?.studentId || b.studentId || "";
      if (sidA !== sidB) return sidA.localeCompare(sidB);
      return (a.attemptNo ?? 0) - (b.attemptNo ?? 0);
    });
  const manualBySubmission = new Map(
    (manualStatus?.submissions || []).map((row: any) => [row.submissionId, row]),
  );

  // "Còn cho phép làm bài" here means startExam would still accept a new
  // attempt — same status/window checks it enforces server-side (see
  // submissions.service.ts startExam), just read-only for a heads-up. Doesn't
  // account for individual students' remaining maxAttempts (would need a
  // per-student query), only whether the exam itself is still open at all.
  const examStatus = overview?.exam?.status;
  const examEndTime = overview?.exam?.endTime ? new Date(overview.exam.endTime) : null;
  const allowLateSubmission = Boolean(overview?.exam?.settings?.allowLateSubmission);
  const examStillAcceptsAttempts = (examStatus === "PUBLISHED" || examStatus === "ONGOING")
    && (!examEndTime || examEndTime.getTime() > Date.now() || allowLateSubmission);

  const handleExport = async (format: "csv" | "pdf" = "csv") => {
    if (!examId) return;
    try {
      const token = api.getToken();
      const res = await fetch(
        `${API_BASE_URL}/submissions/exam/${examId}/export?format=${format}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) throw new Error("Xuất dữ liệu không thành công");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (format === "pdf") {
        // Load the PDF into a hidden iframe on this same page and trigger the
        // browser's own Print dialog — no new tab, current page stays put.
        // That dialog already gives a preview pane plus a "Save as PDF"
        // destination, so the lecturer can look it over before saving.
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.src = url;
        let printed = false;
        const runOnce = () => {
          if (printed) return;
          printed = true;
          try {
            iframe.contentWindow?.print();
          } catch {
            // Some browsers block scripted print on a PDF iframe — the file
            // is still loaded, just without the dialog auto-opening.
          }
        };
        iframe.onload = runOnce;
        document.body.appendChild(iframe);
        setTimeout(runOnce, 1200);
        // Give the iframe time to load and the print dialog time to be used
        // before tearing it down.
        setTimeout(() => {
          iframe.remove();
          window.URL.revokeObjectURL(url);
        }, 60_000);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${examTitle.replace(/\s+/g, "_") || "exam"}-results.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Không thể xuất dữ liệu", err);
      toast.error("Xuất dữ liệu không thành công. Vui lòng thử lại.");
    }
  };

  const handlePublishResults = async () => {
    if (!examId) return;
    try {
      setIsPublishing(true);
      const nextStatus = await api.publishExamResults(examId);
      setManualStatus(nextStatus);
      const subsRes = await api.getExamSubmissions(examId, page, ITEMS_PER_PAGE);
      setSubmissions(unwrapPaginatedData(subsRes));
      toast.success("Đã công bố kết quả cho sinh viên.");
    } catch (err: any) {
      toast.error(err?.message || "Không thể công bố kết quả.");
    } finally {
      setIsPublishing(false);
    }
  };

  const openIntegrityReview = async (submission: { id: string; student?: { fullName?: string | null } | null }) => {
    setReviewSubmission({ id: submission.id, name: submission.student?.fullName || "Sinh viên" });
    setReviewTimeline(null);
    setReviewCaptures([]);
    setReviewImages({});
    setReviewRiskFlag(null);
    setReviewLoading(true);
    try {
      const [timeline, captures, riskFlags] = await Promise.all([
        api.getSubmissionTimeline(submission.id),
        api.getEvidenceCaptures(submission.id),
        examId ? api.listExamRiskFlags(examId) : Promise.resolve([]),
      ]);
      setReviewTimeline(timeline as SubmissionTimeline);
      const nextCaptures = (captures || []) as EvidenceCapture[];
      setReviewCaptures(nextCaptures);
      setReviewRiskFlag(((riskFlags || []) as RiskFlag[]).find((flag) => flag.submissionId === submission.id) || null);
      const images = await Promise.all(nextCaptures.map(async (capture) => {
        try {
          return [capture.id, await api.getEvidenceImageUrl(submission.id, capture.id)] as const;
        } catch {
          return null;
        }
      }));
      setReviewImages(Object.fromEntries(images.filter((item): item is readonly [string, string] => Boolean(item))));
    } catch (err) {
      console.error("Không thể tải dữ liệu rà soát", err);
      toast.error("Không thể tải dữ liệu rà soát toàn vẹn.");
    } finally {
      setReviewLoading(false);
    }
  };

  const openAdjustmentHistory = async (submission: { id: string; student?: { fullName?: string | null } | null }) => {
    setAdjustmentHistory({ id: submission.id, name: submission.student?.fullName || "Sinh viên", scoreAdjustments: [] });
    setAdjustmentHistoryLoading(true);
    try {
      const res = await api.getManualGradingSubmission(submission.id);
      setAdjustmentHistory(res);
    } catch (err) {
      console.error("Không thể tải lịch sử chỉnh điểm", err);
      toast.error("Không thể tải lịch sử chỉnh điểm.");
      setAdjustmentHistory(null);
    } finally {
      setAdjustmentHistoryLoading(false);
    }
  };

  const openAnswerMatrix = async (attemptNo?: number) => {
    if (!examId) return;
    if (!canOpenAnswerMatrix) {
      toast.error("Chưa có lượt nộp bài nào để xem ma trận.");
      return;
    }
    setAnswerMatrixLoading(true);
    try {
      const matrix = await api.getExamAnswerMatrix(examId, attemptNo);
      setAnswerMatrix(matrix as AnswerMatrix);
      setAnswerMatrixOpen(true);
    } catch (err: any) {
      toast.error(err?.message || "Không thể tải ma trận đáp án.");
    } finally {
      setAnswerMatrixLoading(false);
    }
  };

  const handleReopenSubmission = async () => {
    if (!reopenSubmission) return;
    if (reopenReason.trim().length < 3) {
      toast.error("Hãy nhập lý do mở lại lượt làm bài.");
      return;
    }
    try {
      setIsReopening(true);
      await api.reopenSubmission(reopenSubmission.id, reopenReason.trim());
      toast.success("Đã mở lại lượt làm bài. Sinh viên sẽ tiếp tục đúng lượt này.");
      setReopenSubmission(null);
      setReopenReason("");
      const next = await api.getExamSubmissions(examId!, page, ITEMS_PER_PAGE);
      setSubmissions(unwrapPaginatedData(next));
    } catch (err: any) {
      toast.error(err?.message || "Không thể mở lại lượt làm bài.");
    } finally {
      setIsReopening(false);
    }
  };

  const handleExtendDeadline = async () => {
    if (!deadlineExtensionSubmission) return;
    const deadline = new Date(deadlineExtensionAt);
    if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      toast.error("Hãy chọn deadline mới trong tương lai.");
      return;
    }
    if (deadlineExtensionReason.trim().length < 3) {
      toast.error("Hãy nhập lý do gia hạn deadline.");
      return;
    }
    try {
      setIsExtendingDeadline(true);
      const result = await api.extendSubmissionDeadline(
        deadlineExtensionSubmission.id,
        deadline.toISOString(),
        deadlineExtensionReason.trim(),
      );
      toast.success(
        result?.reopened
          ? "Đã gia hạn và mở lại lượt làm bài của sinh viên."
          : "Đã gia hạn deadline cho lượt làm bài.",
      );
      setDeadlineExtensionSubmission(null);
      setDeadlineExtensionAt("");
      setDeadlineExtensionReason("");
      const next = await api.getExamSubmissions(examId!, page, ITEMS_PER_PAGE);
      setSubmissions(unwrapPaginatedData(next));
    } catch (err: any) {
      toast.error(err?.message || "Không thể gia hạn deadline cho lượt làm bài.");
    } finally {
      setIsExtendingDeadline(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/90 p-5 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-start gap-2">
            {overview?.analyticsScope ? (
              <StatusBadge
                status={overview.analyticsScope === "OFFICIAL" ? "published" : "available"}
                domain="exam"
              >
                {overview.analyticsScope === "OFFICIAL" ? "Phân tích chính thức" : "Phân tích bài luyện tập"}
              </StatusBadge>
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Danh sách kết quả sinh viên — {examTitle}
            </h1>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              {isRefreshing
                ? "Đang cập nhật dữ liệu..."
                : `Cập nhật lần cuối: ${overview?.updatedAt ? new Date(overview.updatedAt).toLocaleTimeString("vi-VN") : "Chưa có dữ liệu"}`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Làm mới
            </Button>
            <Button onClick={() => handleExport("csv")} className="shadow-sm">
              Xuất CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("pdf")}
              className="border-slate-300 bg-background/80 shadow-sm"
            >
              Xuất PDF
            </Button>
          </div>
        </div>

        {manualStatus && manualStatus.submissions.length > 0 ? (
          <Card
            className={
              manualStatus.manualPending > 0
                ? "border-amber-200 bg-amber-50/70 shadow-[0_16px_40px_-30px_rgba(180,83,9,0.45)]"
                : "border-emerald-200 bg-emerald-50/70 shadow-[0_16px_40px_-30px_rgba(5,150,105,0.35)]"
            }
          >
            <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={
                    manualStatus.manualPending > 0
                      ? "rounded-xl bg-amber-100 p-2 text-amber-700"
                      : "rounded-xl bg-emerald-100 p-2 text-emerald-700"
                  }
                >
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2
                    className={
                      manualStatus.manualPending > 0
                        ? "font-semibold text-amber-950"
                        : "font-semibold text-emerald-950"
                    }
                  >
                    {manualStatus.manualPending > 0
                      ? "Cần chấm thủ công"
                      : manualStatus.published
                        ? "Đã công bố kết quả"
                        : manualStatus.hasManualGrading
                          ? "Đã hoàn tất chấm thủ công"
                          : "Sẵn sàng công bố kết quả"}
                  </h2>
                  <p
                    className={
                      manualStatus.manualPending > 0
                        ? "mt-1 text-sm text-amber-800"
                        : "mt-1 text-sm text-emerald-800"
                    }
                  >
                    {manualStatus.hasManualGrading
                      ? `Đã chấm ${manualStatus.manualGraded}/${manualStatus.manualTotal} câu trả lời tự luận. `
                      : "Bài thi chỉ có câu hỏi chấm tự động. "}
                    {manualStatus.published
                      ? "Kết quả đã được công bố cho sinh viên."
                      : manualStatus.manualPending > 0
                        ? `Còn ${manualStatus.manualPending} câu cần nhập điểm và nhận xét.`
                        : "Sẵn sàng công bố để sinh viên xem điểm và đáp án."}
                  </p>
                  {!manualStatus.published ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Công bố áp dụng cho toàn bộ sinh viên đủ điều kiện của kỳ thi này cùng một lúc (không công bố
                      được riêng từng sinh viên/lượt). Chỉ có thể công bố khi tất cả câu tự luận trong kỳ thi đã
                      được chấm điểm xong.
                    </p>
                  ) : null}
                  {!manualStatus.published && examStillAcceptsAttempts ? (
                    <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Đề này vẫn còn cho phép làm bài (chưa hết hạn/maxAttempts) — công bố ngay có thể lộ đáp án cho người làm sau.
                    </p>
                  ) : null}
                </div>
              </div>
              <Button
                onClick={handlePublishResults}
                disabled={!manualStatus.canPublish || isPublishing}
                className="gap-2 shadow-sm"
                title="Công bố kết quả cho toàn bộ sinh viên đủ điều kiện của kỳ thi này"
              >
                {isPublishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Công bố kết quả
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4">
          <Card className="border-slate-200/80 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)]">
            <CardContent className="pt-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold tracking-tight">Phân bố điểm (trực tiếp)</h2>
                  <p className="text-xs text-muted-foreground">
                    Tổng quan nhanh về sự phân bố điểm của lớp.
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-muted-foreground">
                  Trung bình:{" "}
                  <span className="font-semibold text-foreground">
                    {((overview?.summary?.avgScorePct ?? 0) / 10).toFixed(2)}/10
                  </span>{" "}
                  | Cao nhất:{" "}
                  <span className="font-semibold text-foreground">
                    {((overview?.summary?.highestScorePct ?? 0) / 10).toFixed(2)}/10
                  </span>
                </div>
              </div>

              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview?.scoreDistribution || []}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                      opacity={0.65}
                    />
                    <XAxis
                      dataKey="key"
                      tickLine={false}
                      axisLine={false}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--background))",
                        boxShadow: "0 16px 30px -20px rgba(15, 23, 42, 0.45)",
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} maxBarSize={70} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                  <p className="text-muted-foreground">Đã hoàn thành</p>
                  <p className="mt-1 font-semibold text-emerald-700">
                    {overview?.summary?.completed ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="text-muted-foreground">Đang làm bài</p>
                  <p className="mt-1 font-semibold text-amber-700">
                    {overview?.summary?.inProgress ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <p className="text-muted-foreground">Tổng số</p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {overview?.summary?.totalSubmissions ?? 0}
                  </p>
                </div>
              </div>

            </CardContent>
          </Card>

        </div>

        <Card className="border-slate-200/80 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)]">
            <CardContent className="pt-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="rounded-full bg-amber-100 p-1.5 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold tracking-tight">Dữ liệu giám sát cần xem xét</h2>
                  <p className="text-xs text-muted-foreground">
                    Chỉ là tín hiệu tham khảo, không phải kết luận gian lận tự động.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupedAnomalies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có dữ liệu giám sát cần xem xét.
                  </p>
                ) : (
                  groupedAnomalies.map((item) => (
                    <div
                      key={item.key}
                      className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-background to-slate-50/70 p-3 shadow-sm"
                    >
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">
                            {item.student?.fullName || "Không xác định sinh viên"}
                          </p>
                          <StatusBadge domain="severity" status={item.severity} />
                        </div>
                        <p className="text-sm font-medium text-slate-700">
                          {item.eventCount} sự kiện cần đối chiếu
                        </p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          {item.eventTypes.map((eventType) => getEventTypeLabel(eventType)).join(", ")}
                        </p>
                      </div>
                      {/* Grouped as one unit (not left as separate flex
                          children) so the timestamp and button always sit
                          together at the card's bottom edge — otherwise the
                          timestamp's own position still drifted with however
                          many lines the event-type list above it wrapped to. */}
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          Sự kiện gần nhất: {new Date(item.latestTimestamp).toLocaleString("vi-VN")}
                        </p>
                        {item.submissionId ? (
                          <Button
                            className="w-full"
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`${basePath}/integrity?submissionId=${encodeURIComponent(item.submissionId)}`)}
                          >
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Xem xét
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200/80 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)]">
          <CardContent className="p-0">
            <div className="border-b border-slate-200/80 bg-slate-50/70 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo tên hoặc mã sinh viên"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-0 bg-background/90 pl-9 shadow-sm"
                />
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 bg-background"
                  onClick={() => openAnswerMatrix()}
                  disabled={answerMatrixLoading || !canOpenAnswerMatrix}
                  title={!canOpenAnswerMatrix ? "Chưa có lượt nộp bài nào để xem ma trận." : "Xem ma trận đáp án theo sinh viên"}
                >
                  {answerMatrixLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TableProperties className="h-4 w-4" />}
                  Xem chi tiết
                </Button>
                {!canOpenAnswerMatrix ? (
                  <p className="max-w-xs text-xs text-muted-foreground">Chưa có lượt nộp bài nào để xem ma trận.</p>
                ) : null}
              </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table className="border-separate border-spacing-0">
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="bg-slate-50/80 font-semibold text-slate-600">
                      Tên sinh viên
                    </TableHead>
                    <TableHead className="bg-slate-50/80 font-semibold text-slate-600">
                      ID
                    </TableHead>
                    <TableHead className="bg-slate-50/80 font-semibold text-slate-600">
                      Lượt
                    </TableHead>
                    <TableHead className="bg-slate-50/80 font-semibold text-slate-600">
                      Điểm
                    </TableHead>
                    <TableHead className="bg-slate-50/80 font-semibold text-slate-600">
                      Thời gian làm bài
                    </TableHead>
                    <TableHead className="bg-slate-50/80 font-semibold text-slate-600">
                      Trạng thái
                    </TableHead>
                    <TableHead className="bg-slate-50/80 text-right font-semibold text-slate-600">
                      Thao tác
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Chưa có lượt nộp bài nào cho kỳ thi này.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((s) => {
                      const manualRow = manualBySubmission.get(s.id) as any;
                      const isManualCompleted = Boolean(manualRow?.completed);
                      const isPublished = Boolean(manualStatus?.published);
                      const canExtendDeadline = String(s.status || "").toUpperCase() === "IN_PROGRESS"
                        || Boolean(s.autoSubmittedAt);
                      return (
                      <TableRow key={s.id} className="transition-colors hover:bg-slate-50/80">
                        <TableCell className="py-4">
                          <button
                            type="button"
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            onClick={() => openIntegrityReview(s)}
                          >
                            {s.student?.fullName || "—"}
                          </button>
                        </TableCell>
                        <TableCell className="py-4 text-muted-foreground">
                          {s.student?.studentId || s.student?.id}
                        </TableCell>
                        <TableCell className="py-4 text-muted-foreground">
                          {s.attemptNo ?? "-"}
                        </TableCell>
                        <TableCell className="py-4 font-medium text-foreground">
                          {(() => {
                            const hasPenalty = s.integrityReview?.status === "CONFIRMED" && Boolean(s.integrityReview?.penaltyMode);
                            const hasAdjustment = Number(s.adjustmentTotal ?? 0) !== 0;
                            const finalScore = hasPenalty ? s.integrityReview.finalScore : s.score;
                            return (
                              <div className="flex items-center gap-2">
                                <span className={hasPenalty ? "text-destructive" : undefined}>{finalScore != null ? formatScoreOnTen(finalScore) : "-"}</span>
                                {hasPenalty || hasAdjustment ? (
                                  <UiTooltip>
                                    <UiTooltipTrigger asChild>
                                      <span className={`inline-flex cursor-help items-center ${hasPenalty ? "text-destructive" : "text-muted-foreground"}`}>
                                        <Info className="h-3.5 w-3.5" />
                                      </span>
                                    </UiTooltipTrigger>
                                    <UiTooltipContent className="max-w-xs space-y-1 text-xs">
                                      <p className="font-medium">Điểm gốc {formatScoreOnTen(s.academicScore)}</p>
                                      {hasAdjustment ? (
                                        <p>Điểm hậu kiểm {formatSignedScoreAdjustment(Number(s.adjustmentTotal))}</p>
                                      ) : null}
                                      {hasPenalty ? (
                                        <p className="font-medium text-destructive">
                                          Bị trừ do vi phạm {s.integrityReview.penaltyMode === "FIXED"
                                            ? Number(s.integrityReview.penaltyAmount ?? s.integrityReview.deductedScore ?? 0).toFixed(2)
                                            : `${Number(s.integrityReview.deductedScore ?? 0).toFixed(2)} (${s.integrityReview.penaltyPercent}%)`}
                                        </p>
                                      ) : null}
                                      <p className="text-muted-foreground">
                                        Điểm cuối <span className={hasPenalty ? "font-semibold text-destructive" : "font-semibold text-foreground"}>{formatScoreOnTen(finalScore)}</span>
                                      </p>
                                    </UiTooltipContent>
                                  </UiTooltip>
                                ) : null}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                                  title="Lịch sử chỉnh điểm"
                                  aria-label="Lịch sử chỉnh điểm"
                                  onClick={() => openAdjustmentHistory(s)}
                                >
                                  <History className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="py-4 text-muted-foreground">
                          {formatTimeSpent(s.startedAt, s.submittedAt)}
                        </TableCell>
                        <TableCell className="py-4">
                          <StatusBadge domain="submission" status={s.status} />
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                          {manualRow?.manualTotal > 0 ? (
                            <Badge
                              variant="outline"
                              className={
                                isManualCompleted
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                              }
                            >
                              {isManualCompleted
                                ? isPublished
                                  ? "Đã công bố"
                                  : "Đã chấm xong"
                                : `Chấm còn ${manualRow.manualPending}/${manualRow.manualTotal}`}
                            </Badge>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              router.push(`${basePath}/exam/${examId}/submissions/${s.id}/review`)
                            }
                          >
                            Chi tiết bài làm
                          </Button>
                          {!isPublished && ["SUBMITTED", "GRADED", "FLAGGED"].includes(String(s.status || "").toUpperCase()) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-300 text-amber-800 hover:bg-amber-50"
                              onClick={() => {
                                setReopenSubmission({ id: s.id, name: s.student?.fullName || "Sinh viên" });
                                setReopenReason("");
                              }}
                            >
                              Mở lại lượt
                            </Button>
                          ) : null}
                          {!isPublished && canExtendDeadline ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-sky-300 text-sky-800 hover:bg-sky-50"
                              onClick={() => {
                                setDeadlineExtensionSubmission({
                                  id: s.id,
                                  name: s.student?.fullName || "Sinh viên",
                                  deadline: s.deadline,
                                });
                                setDeadlineExtensionAt("");
                                setDeadlineExtensionReason("");
                              }}
                            >
                              Gia hạn deadline
                            </Button>
                          ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <DataPagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={submissions.length}
          onPageChange={setPage}
          itemLabel="lượt nộp"
          className="border-t-0 px-0"
        />
      </div>
      <Dialog open={Boolean(reviewSubmission)} onOpenChange={(open) => !open && setReviewSubmission(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Giám sát rủi ro: {reviewSubmission?.name}</DialogTitle>
            <DialogDescription>Dữ liệu hỗ trợ giảng viên đối chiếu sau kỳ thi, không phải kết luận gian lận tự động.</DialogDescription>
          </DialogHeader>
          {reviewLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Đang tải dữ liệu rà soát...</div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <ReviewStat label="Đổi tab" value={reviewTimeline?.summary?.tabSwitches || 0} />
                <ReviewStat label="Bất thường chuột" value={reviewTimeline?.summary?.mouseAnomalies || 0} />
                <ReviewStat label="Cảnh báo" value={reviewTimeline?.summary?.warnings || 0} />
                <ReviewStat label="Đánh giá rủi ro" value={reviewRiskFlag?.job?.output?.riskLevel || reviewRiskFlag?.status || "Chưa có"} />
              </div>
              <section>
                <h3 className="mb-2 font-medium">Dòng thời gian phiên làm bài</h3>
                <div className="space-y-2">
                  {(reviewTimeline?.events || []).length === 0 ? <p className="text-sm text-muted-foreground">Chưa có sự kiện giám sát.</p> : reviewTimeline?.events?.map((event) => <div key={event.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{event.description}</span><span className="shrink-0 text-muted-foreground">{new Date(event.timestamp).toLocaleString("vi-VN")}</span></div>{event.detail ? <p className="mt-1 text-muted-foreground">{event.detail}</p> : null}</div>)}
                </div>
              </section>
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-medium"><Camera className="h-4 w-4" />Bằng chứng camera</h3>
                {reviewCaptures.length === 0 ? <p className="text-sm text-muted-foreground">Không có ảnh bằng chứng cho lượt làm bài này.</p> : <div className="grid gap-3 sm:grid-cols-2">{reviewCaptures.map((capture) => <div key={capture.id} className="overflow-hidden rounded-lg border"><div className="aspect-video bg-muted">{reviewImages[capture.id] ? <img src={reviewImages[capture.id]} alt={`Bằng chứng camera của ${reviewSubmission?.name}`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Ảnh không còn khả dụng</div>}</div><div className="p-3 text-xs text-muted-foreground">{getScheduledCaptureLabel(capture, reviewMaxScheduledSlot)} · {new Date(capture.capturedAt || capture.scheduledAt || capture.createdAt || Date.now()).toLocaleString("vi-VN")} · {capture.reviewStatus || "Chờ rà soát"}</div></div>)}</div>}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reopenSubmission)} onOpenChange={(open) => {
        if (!open && !isReopening) setReopenSubmission(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mở lại lượt làm bài</DialogTitle>
            <DialogDescription>
              {reopenSubmission?.name} sẽ tiếp tục đúng lượt đã nộp. Snapshot, câu trả lời autosave và dữ liệu giám sát được giữ nguyên; điểm tự động của lượt này sẽ được chấm lại khi nộp.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reopenReason}
            onChange={(event) => setReopenReason(event.target.value)}
            placeholder="Lý do mở lại lượt làm bài (bắt buộc)"
            disabled={isReopening}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReopenSubmission(null)} disabled={isReopening}>Hủy</Button>
            <Button onClick={handleReopenSubmission} disabled={isReopening || reopenReason.trim().length < 3}>
              {isReopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Xác nhận mở lại
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deadlineExtensionSubmission)} onOpenChange={(open) => {
        if (!open && !isExtendingDeadline) setDeadlineExtensionSubmission(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gia hạn deadline lượt làm bài</DialogTitle>
            <DialogDescription>
              {deadlineExtensionSubmission?.name} sẽ có deadline riêng. Nếu lượt này đã được hệ thống tự nộp, hệ thống sẽ mở lại đúng lượt đó; snapshot, autosave và log giám sát vẫn được giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Deadline hiện tại: <strong className="text-foreground">{deadlineExtensionSubmission?.deadline ? new Date(deadlineExtensionSubmission.deadline).toLocaleString("vi-VN") : "Chưa giới hạn"}</strong></p>
            <label className="font-medium" htmlFor="deadline-extension-at">Deadline mới</label>
            <Input
              id="deadline-extension-at"
              type="datetime-local"
              min={toLocalDateTimeInput(new Date())}
              value={deadlineExtensionAt}
              onChange={(event) => setDeadlineExtensionAt(event.target.value)}
              disabled={isExtendingDeadline}
            />
            <label className="font-medium" htmlFor="deadline-extension-reason">Lý do gia hạn</label>
            <Textarea
              id="deadline-extension-reason"
              value={deadlineExtensionReason}
              onChange={(event) => setDeadlineExtensionReason(event.target.value)}
              placeholder="Lý do chính đáng (bắt buộc)"
              disabled={isExtendingDeadline}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeadlineExtensionSubmission(null)} disabled={isExtendingDeadline}>Hủy</Button>
            <Button onClick={handleExtendDeadline} disabled={isExtendingDeadline || !deadlineExtensionAt || deadlineExtensionReason.trim().length < 3}>
              {isExtendingDeadline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Xác nhận gia hạn
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(adjustmentHistory)} onOpenChange={(open) => !open && setAdjustmentHistory(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" />Lịch sử chỉnh điểm: {adjustmentHistory?.student?.fullName || adjustmentHistory?.name}</DialogTitle>
            <DialogDescription>Các điều chỉnh điểm cho bài nộp này. Điều chỉnh đã thu hồi vẫn được bảo toàn trong lịch sử.</DialogDescription>
          </DialogHeader>
          {adjustmentHistoryLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Đang tải lịch sử chỉnh điểm...</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-indigo-100 bg-white/80 p-3 text-sm">
                Điểm gốc: <strong>{Number(adjustmentHistory?.academicScore ?? 0).toFixed(2)}</strong> · Điều chỉnh đang hiệu lực: <strong>{Number(adjustmentHistory?.activeAdjustmentTotal ?? 0).toFixed(2)}</strong> · Điểm học thuật sau điều chỉnh: <strong>{Number(adjustmentHistory?.adjustedAcademicScore ?? 0).toFixed(2)}</strong>/10
              </div>
              {(adjustmentHistory?.scoreAdjustments || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có điều chỉnh điểm nào cho bài nộp này.</p>
              ) : (
                <div className="space-y-2">
                  {adjustmentHistory.scoreAdjustments.map((adjustment: any) => {
                    const revoked = Boolean(adjustment.revokedAt);
                    return (
                      <div
                        key={adjustment.id}
                        className={`flex flex-col gap-2 rounded-lg border p-3 text-sm ${revoked ? "border-rose-200 bg-rose-50/60 opacity-90" : "border-rose-100 bg-white"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className={revoked ? "text-muted-foreground line-through" : Number(adjustment.amount) >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSignedScoreAdjustment(Number(adjustment.amount))}</strong>
                          <span>{getScoreAdjustmentCategoryLabel(adjustment.category)}</span>
                          <span className="text-muted-foreground">·</span>
                          <span>{adjustment.reason}</span>
                          {revoked ? (
                            <Badge variant="destructive" className="gap-1 text-[11px]">
                              <History className="h-3 w-3" /> Đã thu hồi
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{adjustment.createdBy?.fullName || "Giảng viên"} · {new Date(adjustment.createdAt).toLocaleString("vi-VN")}</p>
                        {revoked ? (
                          <p className="mt-1 text-xs font-medium text-rose-600">
                            Đã thu hồi lúc {adjustment.revokedAt ? new Date(adjustment.revokedAt).toLocaleString("vi-VN") : ""}
                            {adjustment.revocationReason ? ` — Lý do: ${adjustment.revocationReason}` : ""}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={answerMatrixOpen} onOpenChange={setAnswerMatrixOpen}>
        <DialogContent className="max-h-[92vh] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-[calc(100vw-4rem)]">
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2"><TableProperties className="h-5 w-5 text-primary" />Ma trận đáp án theo sinh viên</DialogTitle>
              {answerMatrix && answerMatrix.availableAttempts.length > 1 ? (
                <div className="flex items-center gap-2 text-sm">
                  <label htmlFor="answer-matrix-attempt" className="text-muted-foreground">Lượt</label>
                  <select
                    id="answer-matrix-attempt"
                    className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={answerMatrix.selectedAttemptNo}
                    disabled={answerMatrixLoading}
                    onChange={(event) => openAnswerMatrix(Number(event.target.value))}
                  >
                    {answerMatrix.availableAttempts.map((attempt) => (
                      <option key={attempt} value={attempt}>Lượt {attempt}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <DialogDescription>
              {answerMatrix?.students.length || 0} sinh viên · {answerMatrix?.submittedCount || 0} lượt đã nộp. Chỉ dùng để đối chiếu nhanh, không thay đổi điểm hay đáp án.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-auto px-6 py-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {[
                ["bg-emerald-100 border-emerald-300", "Đúng"],
                ["bg-rose-100 border-rose-300", "Sai"],
                ["bg-amber-100 border-amber-300", "Để trống"],
                ["bg-slate-300 border-slate-400", "Chờ chấm thủ công"],
                ["bg-slate-100 border-slate-200", "Không được giao / câu rút ngẫu nhiên"],
              ].map(([className, label]) => <span key={label} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded border ${className}`} />{label}</span>)}
            </div>
            {!answerMatrix || answerMatrix.students.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Chưa có lượt làm bài để hiển thị trong ma trận.</p>
            ) : (
              <div className="max-h-[62vh] overflow-auto rounded-lg border">
                <Table className="min-w-max border-separate border-spacing-0 text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-30 min-w-52 border-b bg-slate-50 font-semibold shadow-[1px_0_0_0_rgb(226_232_240)]">Sinh viên</TableHead>
                      {answerMatrix.questionColumns.map((question) => (
                        <TableHead
                          key={question.key}
                          className={`sticky top-0 z-20 min-w-16 border-b text-center font-semibold ${question.isRandomBankQuestion ? "bg-slate-200 text-slate-500" : "bg-slate-50"}`}
                          title={question.isRandomBankQuestion
                            ? "Câu rút ngẫu nhiên từ ngân hàng — không dùng để so sánh"
                            : `${question.stem}\nSnapshot: ${question.questionSnapshotId || question.questionVersionId || "không có"}`}
                        >
                          <span className="cursor-help">{question.label}</span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {answerMatrix.students.map((student) => (
                      <TableRow key={student.submissionId}>
                        <TableCell className="sticky left-0 z-10 border-b bg-background shadow-[1px_0_0_0_rgb(226_232_240)]">
                          <p className="font-medium">{student.student?.fullName || "—"}</p>
                          <p className="text-[11px] text-muted-foreground">{student.student?.studentId || "Không có mã"}</p>
                        </TableCell>
                        {answerMatrix.questionColumns.map((question) => {
                          const state = question.isRandomBankQuestion ? "RANDOM_NOT_COMPARABLE" : student.cells[question.key];
                          const display = {
                            CORRECT: ["bg-emerald-100 text-emerald-800", "Đúng", "✓"],
                            INCORRECT: ["bg-rose-100 text-rose-800", "Sai", "×"],
                            // Tự luận/chấm tay không phải đúng/sai tuyệt đối —
                            // dùng ký hiệu "TL" riêng (khác ✓/× của câu tự
                            // động chấm) và tô màu theo tỷ lệ điểm đạt được,
                            // không quy về đúng hẳn hoặc sai hẳn.
                            ESSAY_STRONG: ["bg-emerald-100 text-emerald-800", "Tự luận: đạt phần lớn số điểm (≥75%)", "TL"],
                            ESSAY_MODERATE: ["bg-lime-100 text-lime-800", "Tự luận: đạt trên nửa số điểm (50–74%)", "TL"],
                            ESSAY_WEAK: ["bg-orange-100 text-orange-800", "Tự luận: đạt ít điểm (25–49%)", "TL"],
                            ESSAY_POOR: ["bg-rose-100 text-rose-800", "Tự luận: đạt rất ít hoặc không có điểm (<25%)", "TL"],
                            BLANK: ["bg-amber-100 text-amber-800", "Để trống", "—"],
                            PENDING_MANUAL: ["bg-slate-300 text-slate-700", "Chờ chấm thủ công", "…"],
                            NOT_ASSIGNED: ["bg-slate-100 text-slate-400", "Không được giao", "—"],
                            RANDOM_NOT_COMPARABLE: ["bg-slate-200 text-slate-500", "Câu rút ngẫu nhiên từ ngân hàng — không dùng để so sánh", "—"],
                          }[state || "NOT_ASSIGNED"];
                          return <TableCell key={question.key} className={`border-b p-0 text-center ${display[0]}`} title={display[1]}><span className="flex h-11 min-w-16 items-center justify-center font-semibold" aria-label={display[1]}>{display[2]}</span></TableCell>;
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}



