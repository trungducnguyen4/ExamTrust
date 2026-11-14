"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Loader2, Save, UserCheck, Plus, RefreshCw, Undo2, Sparkles, CheckCircle2, XCircle, ListChecks, Image as ImageIcon, Music, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { formatManualAnswer, formatSignedScoreAdjustment, getScoreAdjustmentCategoryLabel } from "./manual-grading-formatters";
import { ContextHelp } from "@/components/common/ContextHelp";

function toDisplayText(value: any): string {
  if (value == null) return "Chưa nộp câu trả lời";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(toDisplayText).join(", ");
  }
  if (typeof value === "object") {
    if ("answer" in value) return toDisplayText(value.answer);
    if ("text" in value) return toDisplayText(value.text);
    if ("content" in value) return toDisplayText(value.content);
    return Object.entries(value).map(([key, item]) => `${key}: ${toDisplayText(item)}`).join(", ");
  }
  return String(value);
}

function toSavedPoints(value: any): string {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeFeedback(value: any): string {
  return String(value || "");
}

// Slot 0 is always the exam-start checkpoint, the highest slot seen is
// always the guaranteed end-of-exam checkpoint, anything else is numbered
// by its own slot index (1, 2, 3...).
function getScheduledCaptureLabel(capture: any, maxScheduledSlot: number | null): string {
  if (capture.trigger === "IDLE") return "Không tương tác (lịch sử)";
  if (capture.trigger !== "SCHEDULED") return "Tín hiệu bảo mật";
  const slot = capture.scheduledSlot;
  if (slot === 0) return "Ảnh bắt đầu";
  if (slot != null && maxScheduledSlot != null && slot === maxScheduledSlot) return "Ảnh kết thúc";
  return slot != null ? `Định kỳ ${slot}` : "Chụp theo lịch";
}

type DraftGrade = {
  pointsAwarded: string;
  feedback: string;
};

function MediaBadge({ mediaType }: { mediaType?: "image" | "audio" | null }) {
  if (mediaType === "image") return <ImageIcon className="inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-muted-foreground" aria-label="Câu hỏi có hình ảnh đính kèm" />;
  if (mediaType === "audio") return <Music className="inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-muted-foreground" aria-label="Câu hỏi có âm thanh đính kèm" />;
  return null;
}

function QuestionMedia({ mediaType, mediaUrl }: { mediaType?: "image" | "audio" | null; mediaUrl?: string | null }) {
  if (!mediaUrl) return null;
  if (mediaType === "image") return <img src={mediaUrl} alt="Hình ảnh minh họa câu hỏi" className="mt-2 max-h-56 w-full rounded-md border object-contain" />;
  if (mediaType === "audio") return <audio src={mediaUrl} controls className="mt-2 w-full" />;
  return null;
}

type AiSuggestion = {
  summary: string;
  strengths: string[];
  gaps: string[];
  suggestedPoints: number;
  confidence: number;
};

export default function ManualGradingDetail() {
  const params = useParams();
  const examId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const submissionId = Array.isArray(params?.submissionId)
    ? params.submissionId[0]
    : params?.submissionId;
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/admin") ? "/admin" : "/lecturer";

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<any | null>(null);
  const [showAutoAnswers, setShowAutoAnswers] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftGrade>>({});
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AiSuggestion>>({});
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentCategory, setAdjustmentCategory] = useState<"QUESTION_ERROR" | "PARTICIPATION" | "OTHER">("QUESTION_ERROR");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [evidenceCaptures, setEvidenceCaptures] = useState<any[]>([]);
  const [evidenceImageUrls, setEvidenceImageUrls] = useState<Record<string, string>>({});
  const evidenceMaxScheduledSlot = useMemo(() => {
    const slots = evidenceCaptures
      .filter((c) => c.trigger === "SCHEDULED" && c.scheduledSlot != null)
      .map((c) => c.scheduledSlot as number);
    return slots.length ? Math.max(...slots) : null;
  }, [evidenceCaptures]);

  const loadSubmissionDetail = async (mountedRef?: { mounted: boolean }) => {
    const isMounted = () => !mountedRef || mountedRef.mounted;
    if (!submissionId) {
      setLoading(false);
      toast.error("Thiếu mã bài nộp.");
      return;
    }
    try {
      setLoading(true);
      const data = await api.getManualGradingSubmission(submissionId);
      if (!isMounted()) return;
      setSubmission(data);
      const captures = await api.getEvidenceCaptures(submissionId).catch(() => []);
      if (!isMounted()) return;
      setEvidenceCaptures(captures);
      const urls = await Promise.all(captures.filter((capture: any) => capture.status !== "PURGED" && capture.capturedAt).map(async (capture: any) => [capture.id, await api.getEvidenceImageUrl(submissionId, capture.id).catch(() => "")] as const));
      if (isMounted()) setEvidenceImageUrls(Object.fromEntries(urls.filter(([, url]) => url)));
      const nextDrafts: Record<string, DraftGrade> = {};
      (data.manualAnswers || []).forEach((answer: any) => {
        nextDrafts[answer.id] = {
          pointsAwarded:
            answer.pointsAwarded === null || answer.pointsAwarded === undefined
              ? ""
              : String(answer.pointsAwarded),
          feedback: answer.feedback || "",
        };
      });
      setDrafts(nextDrafts);
    } catch (err: any) {
      toast.error(err?.message || "Không thể tải chi tiết chấm thủ công.");
    } finally {
      if (isMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    const mountedRef = { mounted: true };
    loadSubmissionDetail(mountedRef);
    return () => {
      mountedRef.mounted = false;
    };
  }, [submissionId]);

  useEffect(() => {
    if (submission?.student?.fullName) {
      document.title = `Chi tiết bài làm - ${submission.student.fullName} | ExamTrust`;
    }
  }, [submission?.student?.fullName]);

  const reviewEvidence = async (captureId: string, reviewStatus: "REVIEWED" | "DISMISSED") => {
    if (!submissionId) return;
    try {
      await api.reviewEvidenceCapture(submissionId, captureId, { reviewStatus });
      setEvidenceCaptures((items) => items.map((item) => item.id === captureId ? { ...item, reviewStatus } : item));
    } catch (error: any) {
      toast.error(error?.message || "Không thể cập nhật đánh giá bằng chứng.");
    }
  };

  const gradedCount = useMemo(
    () =>
      (submission?.manualAnswers || []).filter((answer: any) => Boolean(answer.manualGradedAt)).length,
    [submission?.manualAnswers],
  );
  const manualTotal = Number(submission?.manualTotal || 0);
  const isAllManualGraded = manualTotal > 0 && gradedCount === manualTotal;

  const saveAnswer = async (answer: any) => {
    const draft = drafts[answer.id];
    const points = Number(draft?.pointsAwarded);
    if (!Number.isFinite(points) || points < 0 || points > Number(answer.maxPoints)) {
      toast.error(`Điểm phải nằm trong khoảng từ 0 đến ${answer.maxPoints}.`);
      return;
    }

    try {
      setSavingId(answer.id);
      const updated = await api.gradeAnswer(answer.id, points, draft?.feedback || "");
      // Update this field's draft immediately from the response so the input
      // reflects the saved value without waiting on the refetch below, then
      // reload everything else — grading a manual answer can change the
      // submission's overall score, adjustment totals, and (if a penalty is
      // confirmed) the integrity review numbers, none of which a local patch
      // of just this one answer would pick up.
      setDrafts((current) => ({
        ...current,
        [answer.id]: {
          pointsAwarded: toSavedPoints(updated.pointsAwarded),
          feedback: normalizeFeedback(updated.feedback),
        },
      }));
      await refreshSubmission();
      toast.success("Đã lưu điểm chấm thủ công.");
    } catch (err: any) {
      toast.error(err?.message || "Không thể lưu điểm.");
    } finally {
      setSavingId(null);
    }
  };

  const requestAiSuggestion = async (answer: any) => {
    try {
      setSuggestingId(answer.id);
      const suggestion = await api.suggestGradeForAnswer(answer.id);
      setAiSuggestions((current) => ({ ...current, [answer.id]: suggestion }));
    } catch (err: any) {
      toast.error(err?.message || "Không thể lấy gợi ý AI.");
    } finally {
      setSuggestingId(null);
    }
  };

  const applyAiSuggestion = (answer: any) => {
    const suggestion = aiSuggestions[answer.id];
    if (!suggestion) return;
    setDrafts((prev) => ({
      ...prev,
      [answer.id]: {
        pointsAwarded: String(suggestion.suggestedPoints),
        feedback: prev[answer.id]?.feedback || suggestion.summary,
      },
    }));
    toast.info("Đã điền gợi ý AI vào ô điểm/nhận xét. Vui lòng kiểm tra lại trước khi lưu.");
  };

  const refreshSubmission = async () => {
    if (!submissionId) return;
    const data = await api.getManualGradingSubmission(submissionId);
    setSubmission(data);
  };

  const createAdjustment = async () => {
    const amount = Number(adjustmentAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error("Nhập số điểm điều chỉnh khác 0.");
      return;
    }
    if (adjustmentCategory === "OTHER" && adjustmentReason.trim().length < 3) {
      toast.error("Cần ghi rõ lý do khi chọn loại 'Khác'.");
      return;
    }
    try {
      setIsAdjusting(true);
      await api.createScoreAdjustment(String(submissionId), {
        amount,
        category: adjustmentCategory,
        reason: adjustmentReason.trim(),
      });
      setAdjustmentAmount("");
      setAdjustmentReason("");
      await refreshSubmission();
      toast.success("Đã lưu điều chỉnh điểm và nhật ký kiểm toán.");
    } catch (err: any) {
      toast.error(err?.message || "Không thể điều chỉnh điểm.");
    } finally {
      setIsAdjusting(false);
    }
  };

  const revokeAdjustment = async (adjustmentId: string) => {
    const reason = window.prompt("Lý do thu hồi điều chỉnh này:");
    if (!reason?.trim()) return;
    try {
      setIsAdjusting(true);
      await api.revokeScoreAdjustment(String(submissionId), adjustmentId, reason.trim());
      await refreshSubmission();
      toast.success("Đã thu hồi điều chỉnh; lịch sử vẫn được bảo toàn.");
    } catch (err: any) {
      toast.error(err?.message || "Không thể thu hồi điều chỉnh.");
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            className="-ml-2 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`${basePath}/exam/${examId}/results`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại kết quả
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSubmissionDetail()}
            disabled={loading}
            className="gap-2 self-end sm:self-auto shadow-xs"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Làm mới
          </Button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Card className="border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                      <UserCheck className="h-6 w-6 text-primary shrink-0" />
                      <span>Chi tiết bài làm - {submission?.student?.fullName || "Sinh viên"}</span>
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground pl-8 sm:pl-8.5">
                      <span className="font-medium text-slate-700">{submission?.exam?.title || "Bài thi"}</span>
                      {submission?.submittedAt ? ` · Nộp lúc ${new Date(submission.submittedAt).toLocaleString("vi-VN")}` : ""}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={`self-start sm:self-center text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 ${
                      isAllManualGraded
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-blue-200 bg-blue-50 text-blue-700"
                    }`}
                  >
                    {isAllManualGraded
                      ? "Đã hoàn tất chấm"
                      : `Đã chấm ${gradedCount}/${manualTotal} câu`}
                  </Badge>
                </div>
              </CardHeader>
            </Card>

            <Card className="border-indigo-200 bg-indigo-50/40 shadow-xs">
              <CardHeader className="p-5 sm:p-6 pb-3 sm:pb-4">
                <CardTitle className="text-lg font-semibold text-slate-900">Điều chỉnh điểm hậu kiểm</CardTitle>
                <CardDescription className="text-sm">
                  Không sửa snapshot hay điểm gốc của bài thi. Dùng cho câu hỏi sai, điểm phát biểu hoặc lý do đã được đối chiếu.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-5 sm:p-6 pt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                  <div className="lg:col-span-2">
                    <label className="flex items-center gap-1 text-sm font-medium text-slate-800">
                      Điểm +/-
                      <ContextHelp content="Nhập số dương để cộng thêm điểm, số âm để trừ điểm. Đây chỉ là một khoản điều chỉnh cộng dồn — không đổi điểm gốc/đáp án đã chấm." />
                    </label>
                    <Input
                      className="mt-1.5 h-10 w-full bg-white"
                      type="number"
                      step="0.01"
                      min={-10}
                      max={10}
                      placeholder="0.00"
                      value={adjustmentAmount}
                      onChange={(event) => setAdjustmentAmount(event.target.value)}
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="flex items-center gap-1 text-sm font-medium text-slate-800">
                      Loại
                      <ContextHelp content="Chỉ là nhãn phân loại để tra cứu/báo cáo sau này — hệ thống không tự kiểm tra đúng/sai, giảng viên tự xác định và ghi rõ trong ô Lý do bên cạnh. 'Lỗi đề thi': câu hỏi/đáp án trong đề bị phát hiện sai sau khi đã chấm. 'Điểm cộng thêm': điểm thưởng ngoài bài thi (phát biểu, tham gia...)." />
                    </label>
                    <select
                      className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={adjustmentCategory}
                      onChange={(event) => setAdjustmentCategory(event.target.value as typeof adjustmentCategory)}
                    >
                      <option value="QUESTION_ERROR">{getScoreAdjustmentCategoryLabel("QUESTION_ERROR")}</option>
                      <option value="PARTICIPATION">{getScoreAdjustmentCategoryLabel("PARTICIPATION")}</option>
                      <option value="OTHER">{getScoreAdjustmentCategoryLabel("OTHER")}</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-5">
                    <label className="text-sm font-medium text-slate-800">
                      Lý do{adjustmentCategory === "OTHER" ? " (bắt buộc)" : " (tùy chọn)"}
                    </label>
                    <Input
                      className="mt-1.5 h-10 w-full bg-white"
                      value={adjustmentReason}
                      onChange={(event) => setAdjustmentReason(event.target.value)}
                      placeholder="Ví dụ: Câu 4 có hai đáp án đúng, cộng 0.5 điểm"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-2">
                    <Button
                      className="h-10 w-full gap-2 shadow-xs"
                      onClick={createAdjustment}
                      disabled={isAdjusting}
                    >
                      {isAdjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Điều chỉnh
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-lg border border-indigo-100/80 bg-white/90 p-4 text-sm shadow-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-700">
                    <span>Điểm gốc: <strong className="text-slate-900 font-semibold">{Number(submission?.academicScore ?? submission?.score ?? 0).toFixed(2)}</strong></span>
                    <span className="text-muted-foreground">·</span>
                    <span>Điều chỉnh đang hiệu lực: <strong className="text-slate-900 font-semibold">{Number(submission?.activeAdjustmentTotal ?? 0).toFixed(2)}</strong></span>
                    <span className="text-muted-foreground">·</span>
                    <span>Điểm học thuật sau điều chỉnh: <strong className="text-primary font-bold">{Number(submission?.adjustedAcademicScore ?? submission?.score ?? 0).toFixed(2)}</strong>/10</span>
                  </div>
                  {submission?.integrityReview?.status === 'CONFIRMED' && submission?.integrityReview?.penaltyMode ? (
                    <div className="mt-2 pt-2 border-t border-rose-100 text-destructive">
                      <div>
                        Điểm bị trừ do vi phạm toàn vẹn: <strong>{Number(submission.integrityReview.penaltyMode === 'FIXED' ? (submission.integrityReview.penaltyAmount ?? submission.integrityReview.deductedScore ?? 0) : (submission.integrityReview.deductedScore ?? 0)).toFixed(2)}</strong>
                        {submission.integrityReview.penaltyMode === 'PERCENT' ? ` (${submission.integrityReview.penaltyPercent}%)` : ""}
                        {" "}— điểm cuối: <strong>{Number(submission.integrityReview.finalScore ?? 0).toFixed(2)}</strong>/10
                      </div>
                      {submission.integrityReview.reviewerNote ? (
                        <div className="mt-0.5 text-xs">Lý do: {submission.integrityReview.reviewerNote}</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {(submission?.scoreAdjustments || []).length > 0 ? (
                  <div className="space-y-2">
                    {submission.scoreAdjustments.map((adjustment: any) => {
                      const revoked = Boolean(adjustment.revokedAt);
                      return (
                        <div
                          key={adjustment.id}
                          className={`flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${revoked ? "border-rose-200 bg-rose-50/60 opacity-90" : "border-rose-100 bg-white shadow-xs"}`}
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className={revoked ? "text-muted-foreground line-through" : Number(adjustment.amount) >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSignedScoreAdjustment(Number(adjustment.amount))}</strong>
                              <span>{getScoreAdjustmentCategoryLabel(adjustment.category)}</span>
                              <span className="text-muted-foreground">·</span>
                              <span>{adjustment.reason}</span>
                              {revoked ? (
                                <Badge variant="destructive" className="gap-1 text-[11px]">
                                  <Undo2 className="h-3 w-3" /> Đã thu hồi
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
                          {!revoked ? <Button size="sm" variant="outline" className="gap-1" onClick={() => revokeAdjustment(adjustment.id)} disabled={isAdjusting}><Undo2 className="h-3.5 w-3.5" /> Thu hồi</Button> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {evidenceCaptures.length > 0 ? (
              <Card className="border-amber-200 bg-white shadow-xs">
                <CardHeader className="p-5 sm:p-6 pb-3 sm:pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-900">Bằng chứng webcam</CardTitle>
                  <CardDescription className="text-sm">Tag AI chỉ là tín hiệu hỗ trợ; giảng viên cần tự xem ảnh trước khi kết luận.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-5 sm:p-6 pt-0">
                  {evidenceCaptures.map((capture: any) => (
                    <div key={capture.id} className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-2.5 shadow-xs">
                      {evidenceImageUrls[capture.id] ? (
                        <img src={evidenceImageUrls[capture.id]} alt="Webcam evidence" className="aspect-video w-full rounded-lg bg-black object-cover" />
                      ) : (
                        <div className="aspect-video rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground p-3 text-center">
                          {capture.status === "PURGED" ? "Ảnh đã được xóa theo thời hạn lưu trữ" : "Không tải được ảnh"}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">{getScheduledCaptureLabel(capture, evidenceMaxScheduledSlot)} · {capture.capturedAt ? new Date(capture.capturedAt).toLocaleString("vi-VN") : "Đang chờ ảnh"}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(capture.aiTags || []).map((tag: any) => (
                          <Badge key={`${capture.id}-${tag.tag}`} variant="secondary" className="text-[11px]">
                            {tag.tag} {Number.isFinite(Number(tag.confidence)) ? `${Math.round(Number(tag.confidence) * 100)}%` : ""}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void reviewEvidence(capture.id, "REVIEWED")}>Đã xem</Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => void reviewEvidence(capture.id, "DISMISSED")}>Bỏ qua</Button>
                        <span className="ml-auto text-xs font-medium text-muted-foreground">{capture.reviewStatus}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {(submission?.autoAnswers || []).length > 0 ? (
              <Card className="border-slate-200 bg-white shadow-xs">
                <CardHeader className={`p-5 sm:p-6 ${showAutoAnswers ? "pb-3 sm:pb-4 border-b border-slate-100" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 pr-0 sm:pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                          <ListChecks className="h-5 w-5 text-primary" />
                          Câu tự động chấm
                        </CardTitle>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                          Đúng {submission.autoCorrect ?? 0}/{submission.autoTotal ?? submission.autoAnswers.length}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1 text-sm">
                        Các câu trắc nghiệm/tự động đã được hệ thống chấm ngay khi nộp bài — hiển thị để đối chiếu, không cần chấm lại.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAutoAnswers((prev) => !prev)}
                      className="shrink-0 self-start sm:self-center gap-1.5 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs"
                    >
                      {showAutoAnswers ? (
                        <>
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          Ẩn danh sách
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          Hiện danh sách ({submission.autoAnswers.length} câu)
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                {showAutoAnswers ? (
                  <CardContent className="space-y-4 p-5 sm:p-6 pt-4">
                    {submission.autoAnswers.map((answer: any, index: number) => {
                      const answerLines = formatManualAnswer(answer.questionType, answer.answer, answer.questionOptions);
                      const correctLines = answer.correctAnswer == null
                        ? ["Không xác định"]
                        : formatManualAnswer(answer.questionType, answer.correctAnswer, answer.questionOptions);
                      return (
                        <div key={answer.id} className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1 pr-0 sm:pr-4">
                              <p className="text-sm font-semibold leading-relaxed text-slate-900">
                                <MediaBadge mediaType={answer.questionMediaType} /> Câu {index + 1}. {answer.questionText}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{answer.questionType} · tối đa {answer.maxPoints} điểm</p>
                              <QuestionMedia mediaType={answer.questionMediaType} mediaUrl={answer.questionMediaUrl} />
                            </div>
                            <Badge
                              variant="outline"
                              className={`shrink-0 self-start sm:self-auto gap-1.5 px-3 py-1 font-semibold text-xs rounded-full ${
                                answer.isCorrect
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                              }`}
                            >
                              {answer.isCorrect ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-rose-600" />}
                              {answer.pointsAwarded ?? 0}/{answer.maxPoints} điểm
                            </Badge>
                          </div>
                          <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2">
                            <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sinh viên trả lời</p>
                              <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900 font-medium">
                                {answerLines.map((line, lineIndex) => <span key={lineIndex} className="block">{line}</span>)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Đáp án đúng</p>
                              <div className="mt-2 whitespace-pre-wrap text-sm text-emerald-950 font-medium">
                                {correctLines.map((line, lineIndex) => <span key={lineIndex} className="block">{line}</span>)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                ) : null}
              </Card>
            ) : null}

            {(submission?.manualAnswers || []).length === 0 ? (
              <Card className="border-slate-200 bg-white shadow-xs">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Bài nộp này không có câu hỏi cần chấm thủ công.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {submission.manualAnswers.map((answer: any, index: number) => {
                  const draft = drafts[answer.id] || { pointsAwarded: "", feedback: "" };
                  const savedPoints = toSavedPoints(answer.pointsAwarded);
                  const savedFeedback = normalizeFeedback(answer.feedback);
                  const isSaved = Boolean(answer.manualGradedAt);
                  const isDirty =
                    draft.pointsAwarded !== savedPoints ||
                    draft.feedback !== savedFeedback;
                  const isSaving = savingId === answer.id;
                  const answerLines = formatManualAnswer(answer.questionType, answer.answer, answer.questionOptions);
                  return (
                    <Card key={answer.id} className="border-slate-200 bg-white shadow-xs">
                      <CardHeader className="border-b border-slate-100 bg-slate-50/60 p-5 sm:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1 pr-0 sm:pr-4">
                            <CardTitle className="text-base font-semibold leading-relaxed text-slate-900">
                              <MediaBadge mediaType={answer.questionMediaType} /> Câu {index + 1}. {answer.questionText}
                            </CardTitle>
                            <CardDescription className="mt-1 text-xs">
                              {answer.questionType} · tối đa {answer.maxPoints} điểm
                            </CardDescription>
                            <QuestionMedia mediaType={answer.questionMediaType} mediaUrl={answer.questionMediaUrl} />
                          </div>
                          {answer.manualGradedAt ? (
                            <Badge className="shrink-0 self-start sm:self-auto border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1 font-semibold text-xs rounded-full" variant="outline">
                              Đã chấm: {answer.pointsAwarded}/{answer.maxPoints} điểm
                            </Badge>
                          ) : (
                            <Badge className="shrink-0 self-start sm:self-auto border-amber-200 bg-amber-50 text-amber-700 px-3 py-1 font-semibold text-xs rounded-full" variant="outline">
                              Chờ chấm
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 p-5 sm:p-6">
                        <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Câu trả lời của sinh viên
                          </p>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900 font-medium">
                            {answerLines.map((line, lineIndex) => <span key={lineIndex} className="block">{line}</span>)}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-muted-foreground">
                              Gợi ý AI chỉ mang tính tham khảo, giảng viên cần tự đánh giá trước khi chốt điểm.
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2 self-start sm:self-auto shadow-xs"
                              onClick={() => requestAiSuggestion(answer)}
                              disabled={suggestingId === answer.id}
                            >
                              {suggestingId === answer.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                              )}
                              Gợi ý AI
                            </Button>
                          </div>
                          {aiSuggestions[answer.id] ? (
                            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 text-sm space-y-2.5">
                              <p className="text-slate-800 font-medium">{aiSuggestions[answer.id].summary}</p>
                              {aiSuggestions[answer.id].strengths.length > 0 ? (
                                <p className="text-emerald-700 text-xs sm:text-sm">Điểm tốt: {aiSuggestions[answer.id].strengths.join("; ")}</p>
                              ) : null}
                              {aiSuggestions[answer.id].gaps.length > 0 ? (
                                <p className="text-amber-700 text-xs sm:text-sm">Thiếu sót: {aiSuggestions[answer.id].gaps.join("; ")}</p>
                              ) : null}
                              <div className="flex items-center justify-between pt-1 border-t border-violet-200/60">
                                <span className="text-xs text-muted-foreground">
                                  Điểm gợi ý: <strong>{aiSuggestions[answer.id].suggestedPoints}/{answer.maxPoints}</strong> · Độ tin cậy: {Math.round(aiSuggestions[answer.id].confidence * 100)}%
                                </span>
                                <Button size="sm" variant="ghost" className="text-violet-700 hover:text-violet-900 hover:bg-violet-100/60" onClick={() => applyAiSuggestion(answer)}>
                                  Áp dụng gợi ý
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                          <div className="md:col-span-3 lg:col-span-2">
                            <label className="text-sm font-medium text-slate-800">Điểm</label>
                            <div className="mt-1.5 flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={answer.maxPoints}
                                className="h-10 bg-white"
                                value={draft.pointsAwarded}
                                onChange={(event) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [answer.id]: {
                                      ...draft,
                                      pointsAwarded: event.target.value,
                                    },
                                  }))
                                }
                              />
                              <span className="text-sm font-medium text-muted-foreground">/{answer.maxPoints}</span>
                            </div>
                          </div>
                          <div className="md:col-span-9 lg:col-span-10">
                            <label className="text-sm font-medium text-slate-800">Nhận xét</label>
                            <Textarea
                              className="mt-1.5 min-h-[96px] bg-white"
                              placeholder="Nhập nhận xét cho sinh viên..."
                              value={draft.feedback}
                              onChange={(event) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [answer.id]: {
                                    ...draft,
                                    feedback: event.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <Button
                            variant={isSaved && !isDirty ? "outline" : "default"}
                            className="gap-2 shadow-xs"
                            onClick={() => saveAnswer(answer)}
                            disabled={isSaving || (isSaved && !isDirty)}
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isSaved && !isDirty ? (
                              <UserCheck className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            {isSaved && !isDirty ? "Đã lưu" : "Lưu điểm"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
