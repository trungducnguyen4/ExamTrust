"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, ExternalLink, Sparkles, TrendingUp, AlertTriangle, BarChart3, CheckCircle2, Filter, RefreshCw, X, XCircle, RotateCcw, Users, Layers, Lock, Search } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import api from "@/lib/api";
import { unwrapPaginatedData } from "@/lib/api";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { ContextHelp, HelpedTitle } from "@/components/common/ContextHelp";
import {
  ISSUE_LABELS,
  QUESTION_TYPE_LABELS,
  buildComparisonSnapshot,
  formatPreviewDate,
  formatTerm,
  getChangedComparisonFields,
  getCourseLabel,
  getDifficultyLabel,
  getGradingStrategyLabel,
  getScopeForGradingStrategy,
  normalizeCorrectAnswerIds,
  normalizeEditableOptions,
  toQuery,
  safeJsonValue,
  translateAiAnalysisText,
  translateMetricText,
  type AiImprovementDetail,
  type AiImprovementSummary,
  type AttemptScope,
  type ComparisonFieldKey,
  type EditableOption,
  type ExamOption,
  pickDefaultAnalyticsExamId,
  sortExamsForAnalytics,
  type IntelligencePayload,
  type PreviewQuestion,
  type QuestionComparisonSnapshot,
  type QuestionCourseInfo,
} from "./exam-analytics-model";

export default function ExamAnalytics() {
  const router = useRouter();
  const [requestedExamId, setRequestedExamId] = useState("");
  const [examOptions, setExamOptions] = useState<ExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>("");
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [selectedAttemptFilter, setSelectedAttemptFilter] = useState<string>("__all__");
  const [selectedAttemptScope, setSelectedAttemptScope] = useState<AttemptScope>("all");
  const [examSearchQuery, setExamSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingIntelligence, setLoadingIntelligence] = useState(false);
  const [data, setData] = useState<IntelligencePayload | null>(null);
  const [aiImprovements, setAiImprovements] = useState<Record<string, AiImprovementSummary>>({});
  const [aiImprovingQuestionId, setAiImprovingQuestionId] = useState<string | null>(null);
  const [improvementTarget, setImprovementTarget] = useState<IntelligencePayload["mostIncorrectQuestions"][number] | null>(null);
  const [improvementInstruction, setImprovementInstruction] = useState("");
  const [targetQuestionType, setTargetQuestionType] = useState("KEEP_CURRENT");
  const [reviewingImprovement, setReviewingImprovement] = useState<AiImprovementDetail | null>(null);
  const [reviewQuestionCourse, setReviewQuestionCourse] =
    useState<QuestionCourseInfo | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [previewQuestion, setPreviewQuestion] =
    useState<PreviewQuestion | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequestedExamId(params.get("examId") || "");
  }, []);

  // Derived: unique academic years from all exams (via course)
  const academicYears = useMemo(() => {
    const years = new Set<string>();
    examOptions.forEach((ex) => {
      const year = ex.course?.academicYear;
      if (year && year.trim()) years.add(year);
    });
    return Array.from(years).sort().reverse();
  }, [examOptions]);

  // Derived: terms filtered by selected academic year
  const terms = useMemo(() => {
    const termSet = new Set<string>();
    const filtered = selectedAcademicYear && selectedAcademicYear !== "__all__"
      ? examOptions.filter((ex) => ex.course?.academicYear === selectedAcademicYear)
      : examOptions;
    filtered.forEach((ex) => {
      const t = ex.course?.term;
      if (t && t.trim()) termSet.add(t);
    });
    return Array.from(termSet);
  }, [examOptions, selectedAcademicYear]);

  // Derived: unique maxAttempts values from exams
  const availableMaxAttempts = useMemo(() => {
    const set = new Set<number>();
    let hasUnlimited = false;
    examOptions.forEach((ex) => {
      const max = ex.maxAttempts ?? ex.settings?.maxAttempts;
      if (max === null || max === undefined) {
        hasUnlimited = true;
      } else {
        const num = Number(max);
        if (Number.isFinite(num) && num > 0) {
          set.add(num);
        }
      }
    });
    const numbers = Array.from(set).sort((a, b) => a - b);
    return { numbers, hasUnlimited };
  }, [examOptions]);

  // Derived: exams filtered by academic year, term, attempt configuration, and search keyword
  const filteredExams = useMemo(() => {
    let result = examOptions;
    if (selectedAcademicYear && selectedAcademicYear !== "__all__") {
      result = result.filter((ex) => ex.course?.academicYear === selectedAcademicYear);
    }
    if (selectedTerm && selectedTerm !== "__all__") {
      result = result.filter((ex) => ex.course?.term === selectedTerm);
    }
    if (selectedAttemptFilter !== "__all__") {
      if (selectedAttemptFilter === "UNLIMITED") {
        result = result.filter((ex) => {
          const max = ex.maxAttempts ?? ex.settings?.maxAttempts;
          return max === null || max === undefined;
        });
      } else {
        const targetNum = Number(selectedAttemptFilter);
        result = result.filter((ex) => {
          const max = ex.maxAttempts ?? ex.settings?.maxAttempts;
          return Number(max) === targetNum;
        });
      }
    }
    if (examSearchQuery.trim()) {
      const q = examSearchQuery.trim().toLowerCase();
      result = result.filter((ex) => {
        const title = (ex.title || "").toLowerCase();
        const code = (ex.course?.code || "").toLowerCase();
        const name = (ex.course?.name || "").toLowerCase();
        return title.includes(q) || code.includes(q) || name.includes(q);
      });
    }
    return result;
  }, [examOptions, selectedAcademicYear, selectedTerm, selectedAttemptFilter, examSearchQuery]);

  // Sync selected exam when filters change
  useEffect(() => {
    if (!filteredExams.length) {
      setSelectedExamId("");
      return;
    }
    const stillValid = filteredExams.some((ex) => ex.id === selectedExamId);
    const requestedStillValid =
      requestedExamId && filteredExams.some((ex) => ex.id === requestedExamId);
    if (requestedStillValid && selectedExamId !== requestedExamId) {
      setSelectedExamId(requestedExamId);
      return;
    }
    if (!stillValid) {
      setSelectedExamId(pickDefaultAnalyticsExamId(filteredExams));
    }
  }, [filteredExams, requestedExamId, selectedExamId]);

  const loadExams = async () => {
    try {
      setLoading(true);
      const response = await api.getExams({ page: 1, limit: 100 });
      const items = unwrapPaginatedData<ExamOption>(response);
      setExamOptions(items);
      if (items.length > 0) {
        const requestedExam = items.find((item) => item.id === requestedExamId);
        setSelectedExamId(requestedExam?.id || pickDefaultAnalyticsExamId(items));
      }
    } catch (error) {
      console.error("Failed to load exams for analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, [requestedExamId]);

  const loadIntelligence = async () => {
    if (!selectedExamId) return;
    try {
      setLoadingIntelligence(true);
      const payload = await api.getExamIntelligence(selectedExamId, { attemptScope: selectedAttemptScope });
      setData(payload as IntelligencePayload);
      const nextImprovements: Record<string, AiImprovementSummary> = {};
      for (const item of (payload as IntelligencePayload).mostIncorrectQuestions || []) {
        if (item.aiImprovement?.id) {
          nextImprovements[item.questionId] = item.aiImprovement;
        }
      }
      setAiImprovements(nextImprovements);
    } catch (error) {
      console.error("Failed to load exam intelligence:", error);
      setData(null);
    } finally {
      setLoadingIntelligence(false);
    }
  };

  // Whenever selectedExamId changes, auto-select default attemptScope from exam's gradingStrategy
  useEffect(() => {
    if (!selectedExamId) return;
    const current = examOptions.find((ex) => ex.id === selectedExamId);
    const currentStrategy = current?.gradingStrategy ?? current?.settings?.gradingStrategy;
    setSelectedAttemptScope(getScopeForGradingStrategy(currentStrategy));
  }, [selectedExamId, examOptions]);

  // Load intelligence when exam or attemptScope changes
  useEffect(() => {
    if (!selectedExamId) return;
    loadIntelligence();
  }, [selectedExamId, selectedAttemptScope]);

  useEffect(() => {
    const activeEntries = Object.entries(aiImprovements).filter(([, item]) =>
      item?.id && isPollingStatus(item.status),
    );
    if (!activeEntries.length) return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      for (const [questionId, improvement] of activeEntries) {
        try {
          const latest = await api.getQuestionAiImprovement(improvement.id) as AiImprovementSummary;
          if (!cancelled) setQuestionImprovement(questionId, latest);
        } catch (error) {
          console.error("Failed to poll AI improvement:", error);
        }
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [aiImprovements]);

  const distribution = useMemo(() => {
    const correct = data?.visualizations.correctVsIncorrect.correct || 0;
    const incorrect = data?.visualizations.correctVsIncorrect.incorrect || 0;
    const skipped = data?.visualizations.correctVsIncorrect.skipped || 0;
    const total = correct + incorrect + skipped;
    return {
      total,
      correct,
      incorrect,
      skipped,
      correctPct: total ? (correct / total) * 100 : 0,
      incorrectPct: total ? (incorrect / total) * 100 : 0,
      skippedPct: total ? (skipped / total) * 100 : 0,
    };
  }, [data]);

  const distributionPieData = useMemo(() => [
    { name: "Đúng", value: distribution.correct, pct: distribution.correctPct, color: "#10b981" },
    { name: "Sai", value: distribution.incorrect, pct: distribution.incorrectPct, color: "#f43f5e" },
    { name: "Bỏ qua", value: distribution.skipped, pct: distribution.skippedPct, color: "#f59e0b" },
  ], [distribution]);

  const trendChartData = useMemo(() => {
    return (data?.visualizations.trendSeries || []).map((row) => ({
      date: row.date,
      score: Number((row.avgScorePct / 10).toFixed(2)),
      pct: row.avgScorePct,
    }));
  }, [data]);

  const weakestTopicsChartData = useMemo(() => {
    return (data?.weakestTopics || []).map((t) => ({
      name: t.topicName,
      incorrectRate: Math.round(t.incorrectRate),
      skipRate: Math.round(t.skipRate),
    }));
  }, [data]);

  const attemptBreakdownChartData = useMemo(() => {
    return (data?.attemptStats?.attemptBreakdown || []).map((item) => ({
      attemptName: `Lần ${item.attemptNo}`,
      avgScore: Number((item.avgScorePct / 10).toFixed(2)),
      passRate: Number(item.passRate.toFixed(1)),
      submissions: item.submissionCount,
    }));
  }, [data]);

  const openAction = (action?: { path: string; params?: Record<string, string> }) => {
    if (!action?.path) return;
    router.push(`${action.path}${toQuery(action.params)}`);
  };

  const closeQuestionPreview = () => {
    setPreviewQuestion(null);
    setPreviewError("");
    setPreviewLoading(false);
  };

  const openQuestionPreview = async (item: {
    questionId: string;
    questionText?: string;
  }) => {
    setPreviewError("");
    setPreviewLoading(true);
    setPreviewQuestion({
      id: item.questionId,
      content: item.questionText || "",
    });
    try {
      const detail = (await api.getQuestionById(
        item.questionId,
      )) as PreviewQuestion;
      setPreviewQuestion(detail);
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Không thể tải chi tiết câu hỏi.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const setQuestionImprovement = (questionId: string, improvement: AiImprovementSummary | null) => {
    setAiImprovements((current) => {
      const next = { ...current };
      if (improvement?.id) next[questionId] = improvement;
      else delete next[questionId];
      return next;
    });
  };

  const getQuestionImprovement = (questionId: string) =>
    aiImprovements[questionId] || data?.mostIncorrectQuestions.find((item) => item.questionId === questionId)?.aiImprovement || null;

  const isPollingStatus = (status?: string) => status === "QUEUED" || status === "GENERATING";

  const formatAiStatus = (status?: string) => {
    switch (status) {
      case "QUEUED":
        return "Đang chờ AI xử lý";
      case "GENERATING":
        return "AI đang cải thiện câu hỏi...";
      case "READY_FOR_REVIEW":
        return "AI đã đề xuất bản mới";
      case "APPROVED":
        return "Đã cải thiện chất lượng câu hỏi";
      case "REJECTED":
        return "Đã từ chối đề xuất AI";
      case "FAILED":
        return "Không thể tạo đề xuất";
      case "EXPIRED":
        return "Đề xuất không còn phù hợp";
      default:
        return "";
    }
  };

  const closeAiReview = () => {
    setReviewingImprovement(null);
    setReviewQuestionCourse(null);
    setReviewError("");
  };

  const openAiImprovementDialog = (item: IntelligencePayload["mostIncorrectQuestions"][number]) => {
    setImprovementTarget(item);
    setImprovementInstruction("");
    setTargetQuestionType("KEEP_CURRENT");
  };

  const closeAiImprovementDialog = () => {
    if (aiImprovingQuestionId) return;
    setImprovementTarget(null);
    setImprovementInstruction("");
    setTargetQuestionType("KEEP_CURRENT");
  };

  const createAiImprovement = async () => {
    const item = improvementTarget;
    if (!selectedExamId || aiImprovingQuestionId) return;
    if (!item) return;
    try {
      setAiImprovingQuestionId(item.questionId);
      const response = await api.createQuestionAiImprovement({
        questionId: item.questionId,
        examId: selectedExamId,
        instruction: improvementInstruction.trim() || undefined,
        targetQuestionType: targetQuestionType === "KEEP_CURRENT" ? undefined : targetQuestionType,
        analytics: {
          orderIndex: item.orderIndex,
          questionText: item.questionText,
          incorrectRate: item.incorrectRate,
          skipRate: item.skipRate,
          flaggedCount: item.flaggedCount,
          possibleKeyError: item.possibleKeyError || undefined,
        },
      });
      setQuestionImprovement(item.questionId, response as AiImprovementSummary);
    } catch (error) {
      console.error("Failed to create AI improvement:", error);
      setAiImprovements((current) => ({
        ...current,
        [item.questionId]: {
          id: "",
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Không thể tạo đề xuất AI.",
        },
      }));
    } finally {
      setAiImprovingQuestionId(null);
      setImprovementTarget(null);
      setImprovementInstruction("");
      setTargetQuestionType("KEEP_CURRENT");
    }
  };

  const openAiReview = async (questionId: string, improvementId: string) => {
    try {
      setReviewBusy(true);
      setReviewError("");
      setReviewQuestionCourse(null);
      const detail = await api.getQuestionAiImprovement(improvementId) as AiImprovementDetail;
      const selectedExamCourse = examOptions.find(
        (exam) => exam.id === selectedExamId,
      )?.course;
      let fetchedQuestion: any = null;
      try {
        fetchedQuestion = await api.getQuestionById(questionId);
      } catch {
        fetchedQuestion = null;
      }
      const fetchedCourse =
        fetchedQuestion?.course ||
        fetchedQuestion?.currentVersion?.course ||
        fetchedQuestion?.question?.course ||
        null;
      const snapshotCourse: QuestionCourseInfo = {
        id:
          detail.originalSnapshot?.courseId ||
          detail.originalSnapshot?.course?.id ||
          null,
        code:
          detail.originalSnapshot?.courseCode ||
          detail.originalSnapshot?.course?.code ||
          null,
        name:
          detail.originalSnapshot?.courseName ||
          detail.originalSnapshot?.course?.name ||
          null,
        academicYear:
          detail.originalSnapshot?.academicYear ||
          detail.originalSnapshot?.courseAcademicYear ||
          detail.originalSnapshot?.course?.academicYear ||
          null,
        term:
          detail.originalSnapshot?.term ||
          detail.originalSnapshot?.courseTerm ||
          detail.originalSnapshot?.course?.term ||
          null,
      };
      const resolvedCourse: QuestionCourseInfo | null =
        getCourseLabel(snapshotCourse)
          ? snapshotCourse
          : fetchedCourse
            ? {
                id: fetchedCourse.id || fetchedQuestion?.courseId || null,
                code: fetchedCourse.code || null,
                name: fetchedCourse.name || null,
                academicYear: fetchedCourse.academicYear || null,
                term: fetchedCourse.term || null,
              }
            : selectedExamCourse
              ? {
                  id: selectedExamCourse.id,
                  code: selectedExamCourse.code,
                  name: selectedExamCourse.name,
                  academicYear: selectedExamCourse.academicYear,
                  term: selectedExamCourse.term,
                }
              : null;
      if (resolvedCourse) {
        setReviewQuestionCourse(resolvedCourse);
        detail.originalSnapshot = {
          ...(detail.originalSnapshot || {}),
          courseId: detail.originalSnapshot?.courseId || resolvedCourse.id,
          courseCode:
            detail.originalSnapshot?.courseCode || resolvedCourse.code,
          courseName:
            detail.originalSnapshot?.courseName || resolvedCourse.name,
          courseAcademicYear:
            detail.originalSnapshot?.courseAcademicYear ||
            resolvedCourse.academicYear,
          courseTerm:
            detail.originalSnapshot?.courseTerm || resolvedCourse.term,
        };
      }
      if (fetchedQuestion) {
        detail.originalSnapshot = {
          ...(fetchedQuestion || {}),
          ...(detail.originalSnapshot || {}),
        };
      }
      setReviewingImprovement(detail);
      setQuestionImprovement(questionId, detail);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Không thể tải đề xuất AI.");
    } finally {
      setReviewBusy(false);
    }
  };

  const approveAiImprovement = async () => {
    if (!reviewingImprovement) return;
    const finalDraft = reviewingImprovement.finalApproved || reviewingImprovement.proposal || null;
    if (!finalDraft) {
      setReviewError("Không tìm thấy bản cải thiện để áp dụng.");
      return;
    }
    if (!String(finalDraft.content || "").trim()) {
      setReviewError("Nội dung câu hỏi không được để trống.");
      return;
    }
    if (!window.confirm("Bản AI đề xuất sẽ thay thế nội dung hiện tại của câu hỏi. Bạn có chắc muốn tiếp tục?")) {
      return;
    }
    try {
      setReviewBusy(true);
      setReviewError("");
      await api.updateQuestionAiImprovementDraft(reviewingImprovement.id, finalDraft);
      const updated = await api.approveQuestionAiImprovement(reviewingImprovement.id, finalDraft);
      const questionId = String(updated?.originalSnapshot?.questionId || reviewingImprovement.originalSnapshot?.questionId || "");
      if (questionId) setQuestionImprovement(questionId, updated as AiImprovementSummary);
      closeAiReview();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Không thể duyệt đề xuất AI.");
    } finally {
      setReviewBusy(false);
    }
  };

  const rejectAiImprovement = async () => {
    if (!reviewingImprovement) return;
    try {
      setReviewBusy(true);
      setReviewError("");
      const updated = await api.rejectQuestionAiImprovement(reviewingImprovement.id, "Giảng viên từ chối đề xuất trong Analytics.");
      const questionId = String(updated?.originalSnapshot?.questionId || reviewingImprovement.originalSnapshot?.questionId || "");
      if (questionId) setQuestionImprovement(questionId, updated as AiImprovementSummary);
      closeAiReview();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Không thể từ chối đề xuất AI.");
    } finally {
      setReviewBusy(false);
    }
  };

  const getKpiCards = (payload: IntelligencePayload) => {
    const rawPassing = payload.exam?.passingScore ?? payload.passingScorePct ?? 50;
    const passingPct = rawPassing > 10 ? rawPassing : rawPassing * 10;
    const passingPoint = (passingPct / 10).toFixed(2);

    return [
      {
        icon: TrendingUp,
        value: (payload.kpis.avgScorePct / 10).toFixed(2) + "/10",
        label: "Điểm trung bình",
        iconWrapClassName: "bg-sky-500/10",
        iconClassName: "text-sky-600",
        className: "border-border/70 bg-sky-50/35",
      },
      {
        icon: TrendingUp,
        value: payload.kpis.passRate.toFixed(1) + "%",
        label: `Tỷ lệ đạt (≥ ${passingPoint}/10 · ${passingPct}%)`,
        iconWrapClassName: "bg-emerald-500/10",
        iconClassName: "text-emerald-600",
        className: "border-border/70 bg-emerald-50/35",
      },
      {
        icon: TrendingUp,
        value: payload.kpis.completionRate.toFixed(1) + "%",
        label: "Hoàn thành",
        iconWrapClassName: "bg-amber-500/10",
        iconClassName: "text-amber-600",
        className: "border-border/70 bg-amber-50/35",
      },
    ];
  };

  const trackAction = async (name: string) => {
    try {
      await api.sendExamLogs(
        "analytics",
        [{ type: "analytics_action_click", details: JSON.stringify({ event: name, examId: selectedExamId }), ts: Date.now() }],
      );
    } catch {
      // Non-blocking tracking.
    }
  };

  const openQuestionInBank = (questionId: string, questionCourseCode?: string | null) => {
    const courseCode = questionCourseCode || examOptions.find((exam) => exam.id === selectedExamId)?.course?.code;
    const query = new URLSearchParams({ id: questionId });
    if (courseCode) query.set("courseCode", courseCode);
    void trackAction("most_incorrect_open_question_bank");
    router.push(`/lecturer/question-editor?${query.toString()}`);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải thiết lập phân tích...
        </div>
      </DashboardLayout>
    );
  }

  const snapshotCourse: QuestionCourseInfo | null = reviewingImprovement
    ? {
        id: reviewingImprovement.originalSnapshot?.courseId || null,
        code: reviewingImprovement.originalSnapshot?.courseCode || null,
        name: reviewingImprovement.originalSnapshot?.courseName || null,
        academicYear:
          reviewingImprovement.originalSnapshot?.courseAcademicYear || null,
        term: reviewingImprovement.originalSnapshot?.courseTerm || null,
      }
    : null;
  const displayedReviewCourse =
    reviewQuestionCourse ||
    (getCourseLabel(snapshotCourse) ? snapshotCourse : null);

  const comparisonBefore = reviewingImprovement
    ? buildComparisonSnapshot(reviewingImprovement.originalSnapshot, displayedReviewCourse)
    : null;
  const comparisonAfter = reviewingImprovement
    ? buildComparisonSnapshot(
        reviewingImprovement.status === "APPROVED"
          ? reviewingImprovement.finalApproved || reviewingImprovement.proposal
          : reviewingImprovement.proposal || reviewingImprovement.finalApproved,
        displayedReviewCourse,
      )
    : null;
  const comparisonChanges =
    comparisonBefore && comparisonAfter
      ? getChangedComparisonFields(comparisonBefore, comparisonAfter)
      : [];
  const canApplyImprovement = reviewingImprovement?.status === "READY_FOR_REVIEW";

  return (
    <DashboardLayout>
      <AdminPageShell backTo="/lecturer">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            {data?.analyticsScope ? (
              <Badge variant={data.analyticsScope === "OFFICIAL" ? "default" : "secondary"} className="mb-2">
                {data.analyticsScope === "OFFICIAL" ? "Phân tích chính thức" : "Phân tích luyện tập"}
              </Badge>
            ) : null}
            <h1 className="text-xl font-bold sm:text-2xl">Phân tích hiệu suất</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadExams();
              loadIntelligence();
            }}
            disabled={loading || loadingIntelligence}
            className="gap-2"
          >
            {loading || loadingIntelligence ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Làm mới
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Filter className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold leading-5 text-foreground">Bộ lọc phân tích bài thi</h3>
              </div>
            </div>
            <div className="relative w-full sm:w-72 md:w-80">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Tìm theo tên bài thi, mã môn..."
                value={examSearchQuery}
                onChange={(e) => setExamSearchQuery(e.target.value)}
                className="h-8.5 pl-8 pr-7 text-xs rounded-lg bg-background border-border/80"
              />
              {examSearchQuery && (
                <button
                  type="button"
                  onClick={() => setExamSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                  title="Xóa tìm kiếm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="border-t border-border/60 pt-3.5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Năm học</label>
                <Select value={selectedAcademicYear} onValueChange={(val) => { setSelectedAcademicYear(val); setSelectedTerm(""); }}>
                  <SelectTrigger className="h-9 rounded-lg border-border bg-card text-xs">
                    <SelectValue placeholder="Tất cả năm học" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tất cả năm học</SelectItem>
                    {academicYears.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Học kỳ</label>
                <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                  <SelectTrigger className="h-9 rounded-lg border-border bg-card text-xs">
                    <SelectValue placeholder="Tất cả học kỳ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tất cả học kỳ</SelectItem>
                    {terms.map((term) => (
                      <SelectItem key={term} value={term}>{formatTerm(term)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Số lần làm cho phép tối đa
                </label>
                <Select value={selectedAttemptFilter} onValueChange={setSelectedAttemptFilter}>
                  <SelectTrigger className="h-9 rounded-lg border-border bg-card text-xs">
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tất cả</SelectItem>
                    {availableMaxAttempts.numbers.map((num) => (
                      <SelectItem key={num} value={String(num)}>
                        {num} {num === 1 ? "(Thi 1 lần)" : `(Làm lại ${num} lần)`}
                      </SelectItem>
                    ))}
                    {availableMaxAttempts.hasUnlimited && (
                      <SelectItem value="UNLIMITED">Không giới hạn (Luyện tập)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Bài thi {filteredExams.length > 0 && <span className="text-[11px] font-normal text-muted-foreground">({filteredExams.length} bài)</span>}
                </label>
                <Select
                  value={selectedExamId}
                  onValueChange={(val) => {
                    setSelectedExamId(val);
                    setSelectedAttemptScope("all");
                  }}
                  disabled={loadingIntelligence || filteredExams.length === 0}
                >
                  <SelectTrigger className="h-9 rounded-lg border-border bg-card text-xs">
                    <SelectValue placeholder={filteredExams.length === 0 ? (examSearchQuery ? "Không khớp bài thi" : "Không tìm thấy bài thi") : "Chọn bài thi"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortExamsForAnalytics(filteredExams).map((e) => {
                      const maxAttempts = e.maxAttempts ?? e.settings?.maxAttempts;
                      const isMulti = maxAttempts === null || maxAttempts === undefined || Number(maxAttempts) > 1;
                      const attemptLabel = maxAttempts === 1 ? "1 lần" : maxAttempts ? `tối đa ${maxAttempts} lần` : "làm lại tự do";
                      return (
                        <SelectItem key={e.id} value={e.id}>
                          {e.course?.code ? `${e.course.code} - ` : ""}{e.title}
                          {" "}({attemptLabel})
                          {!(Number(e._count?.submissions || 0) > 0) ? " · chưa có lượt nộp" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

            {selectedExamId && (() => {
              const current = examOptions.find((ex) => ex.id === selectedExamId);
              if (!current) return null;
              const max = current.maxAttempts ?? current.settings?.maxAttempts;
              const isMulti = max === null || max === undefined || Number(max) > 1;
              const currentStrategy = current.gradingStrategy ?? current.settings?.gradingStrategy ?? data?.gradingStrategy ?? "HIGHEST";
              return (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Đang phân tích:</span>
                  {examSearchQuery && (
                    <Badge variant="outline" className="text-xs border-primary/30 bg-primary/5 text-primary flex items-center gap-1">
                      <Search className="h-3 w-3" /> Tìm: "{examSearchQuery}"
                      <button type="button" onClick={() => setExamSearchQuery("")} className="hover:text-destructive ml-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {current.course?.code && <Badge variant="outline" className="text-xs">{current.course.code}</Badge>}
                  {current.course?.academicYear && <Badge variant="outline" className="text-xs">{current.course.academicYear}</Badge>}
                  {current.course?.term && <Badge variant="outline" className="text-xs">{formatTerm(current.course.term)}</Badge>}
                  <Badge variant={isMulti ? "secondary" : "outline"} className="text-xs">
                    {isMulti ? (max ? `Cho phép làm lại (${max} lần)` : "Luyện tập không giới hạn") : "Thi 1 lần"}
                  </Badge>
                  {isMulti && (
                    <Badge variant="outline" className="text-xs border-primary/40 bg-primary/5 text-primary font-medium flex items-center gap-1">
                      <RotateCcw className="h-3 w-3" /> Cách tính điểm: {getGradingStrategyLabel(currentStrategy)}
                    </Badge>
                  )}
                  {(() => {
                    const rawPassing = data?.exam?.passingScore ?? data?.passingScorePct ?? 50;
                    const passingPct = rawPassing > 10 ? rawPassing : rawPassing * 10;
                    const passingPoint = (passingPct / 10).toFixed(2);
                    return (
                      <Badge variant="outline" className="text-xs border-emerald-300 bg-emerald-50/60 text-emerald-700 font-medium">
                        Điểm đạt: {passingPoint}/10 ({passingPct}%)
                      </Badge>
                    );
                  })()}
                  <Badge variant="secondary" className="text-xs font-semibold">{current.title}</Badge>
                </div>
              );
            })()}
        </div>

        {!selectedExamId && !loadingIntelligence ? (
          <Card className="border-border/70 bg-card shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium">Không tìm thấy bài thi</p>
              <p className="text-sm mt-1">
                {examSearchQuery
                  ? `Không tìm thấy bài thi nào phù hợp với từ khóa "${examSearchQuery}".`
                  : selectedAcademicYear || selectedTerm
                  ? "Không có bài thi trong năm học và học kỳ đã chọn."
                  : "Chưa có bài thi để phân tích. Hãy tạo bài thi trước."}
              </p>
              {examSearchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExamSearchQuery("")}
                  className="mt-3 text-xs"
                >
                  Xóa bộ lọc tìm kiếm
                </Button>
              )}
            </CardContent>
          </Card>
        ) : loadingIntelligence ? (
          <div className="min-h-[35vh] flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải dữ liệu phân tích...
          </div>
        ) : !data ? (
          <Card className="border-border/70 bg-card shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium">Chưa có dữ liệu hiệu suất</p>
              <p className="text-sm mt-1">Bài thi này chưa có dữ liệu hiệu suất.</p>
            </CardContent>
          </Card>
        ) : (() => {
            const currentExam = examOptions.find((ex) => ex.id === selectedExamId);
            const isInProgress = currentExam?.status === "PUBLISHED" && currentExam?.endTime && new Date(currentExam.endTime) > new Date();
            if (isInProgress) {
              return (
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardContent className="py-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle className="h-7 w-7 text-amber-600" />
                    </div>
                    <p className="text-lg font-semibold text-amber-800">Bài thi đang diễn ra</p>
                    <p className="text-sm text-amber-700 mt-2 max-w-md mx-auto">
                      Bài thi chưa kết thúc nên hệ thống chưa thể phân tích dữ liệu.
                      Hãy quay lại sau khi bài thi kết thúc vào lúc{" "}
                      <strong>{currentExam?.endTime ? new Date(currentExam.endTime).toLocaleString("vi-VN") : "chưa xác định"}</strong>.
                    </p>
                  </CardContent>
                </Card>
              );
            }
            return (
            <div className="space-y-5">
              {/* Attempt Scope Bar for Multi-attempt exams */}
              {(data.allowsMultipleAttempts || data.attemptStats?.allowsMultipleAttempts) && (() => {
                const currentExam = examOptions.find((ex) => ex.id === selectedExamId);
                const currentStrategy = currentExam?.gradingStrategy ?? currentExam?.settings?.gradingStrategy ?? data?.gradingStrategy ?? "HIGHEST";
                const officialScope = getScopeForGradingStrategy(currentStrategy);

                return (
                  <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <RotateCcw className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-2">
                          Phân tích theo lượt làm bài:
                          <Badge variant="outline" className="text-xs bg-background border-primary/30 text-primary font-medium">
                            Mặc định bài thi: {getGradingStrategyLabel(currentStrategy)}
                          </Badge>
                          <Badge variant="outline" className="text-xs bg-background">
                            {data.attemptStats?.isUnlimited
                              ? "Không giới hạn số lần"
                              : `Tối đa ${data.attemptStats?.maxAttempts ?? ""} lần`}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Hệ thống tự động chọn tab theo quy tắc bài thi. Bạn có thể tự do bấm chọn các tab khác để xem phân tích từng nhóm lượt thi.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/80 bg-background p-1 shadow-xs">
                      {[
                        {
                          key: "best",
                          label: "Điểm cao nhất",
                          isOfficial: officialScope === "best",
                          count: data.attemptStats?.totalUniqueStudents,
                        },
                        {
                          key: "first",
                          label: "Lượt đầu (Lần 1)",
                          isOfficial: officialScope === "first",
                          count: data.attemptStats?.attemptBreakdown?.find((b) => b.attemptNo === 1)?.submissionCount,
                        },
                        {
                          key: "latest",
                          label: "Lượt gần nhất",
                          isOfficial: officialScope === "latest",
                          count: data.attemptStats?.totalUniqueStudents,
                        },
                        {
                          key: "all",
                          label: "Tất cả lượt làm",
                          isOfficial: officialScope === "all",
                          count: data.attemptStats?.attemptBreakdown?.reduce((sum, b) => sum + b.submissionCount, 0),
                        },
                      ].map((tab) => {
                        const isSelected = selectedAttemptScope === tab.key;
                        return (
                          <Button
                            key={tab.key}
                            variant={isSelected ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setSelectedAttemptScope(tab.key as AttemptScope)}
                            className={`h-8 text-xs font-medium transition-all ${
                              isSelected
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          >
                            {tab.label}
                            {tab.isOfficial && (
                              <span className="ml-1 text-[10px] opacity-80 font-normal">
                                (mặc định)
                              </span>
                            )}
                            {tab.count !== undefined && tab.count > 0 ? (
                              <span
                                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                  isSelected
                                    ? "bg-primary-foreground/20 text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {tab.count}
                              </span>
                            ) : null}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Smart Notice banner for Unlimited attempts (Practice mode) */}
              {data?.isUnlimited && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sky-900 shadow-xs flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Chế độ phân tích: Bài thi luyện tập không giới hạn</p>
                    <p className="text-xs text-sky-800 leading-relaxed">
                      Do bài thi cho phép nộp lại tự do, hệ thống tự động lọc sạch dữ liệu nhiễu (loại trừ các lượt nộp thử hoặc bỏ dở) bằng cách ưu tiên tổng hợp theo <strong>lượt nộp tốt nhất / gần nhất của từng sinh viên</strong>. Bạn cũng có thể chọn các tab phạm vi phía trên để phân tích chi tiết từng nhóm lượt làm.
                    </p>
                  </div>
                </div>
              )}

              {/* AI Summary Highlight Box */}
              {data.aiSummary && (
                <Card className="border-border/70 border-l-4 border-l-violet-600 bg-card shadow-sm transition-all hover:shadow-md dark:border-l-violet-400">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/80 dark:text-violet-300 shadow-xs">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-foreground">
                            <HelpedTitle help={{
                              description: "Tóm tắt ngắn do AI tạo từ dữ liệu kết quả bài thi, tỷ lệ sai, chủ đề yếu và áp lực thời gian.",
                              usedBy: "Giảng viên dùng để nhìn nhanh xu hướng trước khi đi vào từng câu hỏi hoặc từng chủ đề.",
                              note: "Đây là gợi ý hỗ trợ phân tích, nên đối chiếu với dữ liệu chi tiết trước khi quyết định chỉnh đề.",
                            }}>
                              Tóm tắt nhận định AI
                            </HelpedTitle>
                          </h2>
                          <Badge
                            variant="secondary"
                            className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300 text-xs font-semibold px-2 py-0.5"
                          >
                            AI Insights
                          </Badge>
                        </div>
                        <p className="text-sm leading-relaxed text-foreground/90 font-normal">
                          {translateMetricText(data.aiSummary)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {getKpiCards(data).map((card) => (
                  <AdminStatCard
                    key={card.label}
                    icon={card.icon}
                    value={card.value}
                    label={card.label}
                    iconWrapClassName={card.iconWrapClassName}
                    iconClassName={card.iconClassName}
                    className={card.className}
                  />
                ))}
              </div>

              {/* Retake & Progression Statistics Card */}
              {data.attemptStats && data.attemptStats.allowsMultipleAttempts && (
                <Card className="border-border/70 bg-card shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                          <TrendingUp className="h-4 w-4 text-primary" /> Phân tích tiến độ & hiệu quả làm lại
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Thống kê so sánh giữa lượt làm bài đầu tiên và các lượt làm lại tiếp theo của sinh viên.
                        </CardDescription>
                      </div>
                      {data.attemptStats.avgScoreImprovement !== null && (
                        <Badge
                          variant="outline"
                          className={
                            data.attemptStats.avgScoreImprovement >= 0
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold"
                              : "border-rose-200 bg-rose-50 text-rose-700 font-semibold"
                          }
                        >
                          {data.attemptStats.avgScoreImprovement >= 0
                            ? `Tiến bộ TB: +${(data.attemptStats.avgScoreImprovement / 10).toFixed(2)} điểm`
                            : `Giảm TB: ${(data.attemptStats.avgScoreImprovement / 10).toFixed(2)} điểm`}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Tổng sinh viên tham gia</p>
                        <p className="mt-1 text-lg font-bold text-foreground">{data.attemptStats.totalUniqueStudents} SV</p>
                        <p className="text-xs text-muted-foreground">Đã nộp ít nhất 1 bài</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Sinh viên làm lại (Lần 2+)</p>
                        <p className="mt-1 text-lg font-bold text-foreground">{data.attemptStats.studentsWithRetakes} SV</p>
                        <p className="text-xs text-muted-foreground">Tỷ lệ: {data.attemptStats.retakeRate.toFixed(1)}%</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Số lượt làm trung bình</p>
                        <p className="mt-1 text-lg font-bold text-foreground">{data.attemptStats.avgAttemptsPerStudent} lượt</p>
                        <p className="text-xs text-muted-foreground">Mỗi sinh viên</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Điểm TB Lần 1 vs Làm lại</p>
                        <p className="mt-1 text-lg font-bold text-foreground">
                          {(data.attemptStats.firstAttemptAvgScore / 10).toFixed(2)}
                          <span className="text-sm font-normal text-muted-foreground"> → </span>
                          <span className="text-emerald-600">
                            {data.attemptStats.retakeAttemptsAvgScore !== null
                              ? (data.attemptStats.retakeAttemptsAvgScore / 10).toFixed(2)
                              : "—"}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">Thang điểm 10</p>
                      </div>
                    </div>

                    {/* Progression Breakdown by Attempt Number with Chart */}
                    {data.attemptStats.attemptBreakdown && data.attemptStats.attemptBreakdown.length > 0 && (
                      <div className="space-y-4 pt-2 border-t border-border/70">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Biểu đồ tiến độ & tỷ lệ đạt qua các lần thi
                          </p>
                          <span className="text-[11px] text-muted-foreground">
                            Cột: Điểm TB (/10) · Đường: Tỷ lệ đạt (%)
                          </span>
                        </div>

                        <div className="h-[230px] w-full rounded-xl border border-border/60 bg-muted/10 p-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={attemptBreakdownChartData} margin={{ top: 12, right: 20, bottom: 5, left: -10 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.6} />
                              <XAxis dataKey="attemptName" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                              <YAxis
                                yAxisId="scoreAxis"
                                domain={[0, 10]}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 11 }}
                                tickFormatter={(v) => `${v}`}
                              />
                              <YAxis
                                yAxisId="rateAxis"
                                orientation="right"
                                domain={[0, 100]}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 11 }}
                                tickFormatter={(v) => `${v}%`}
                              />
                              <Tooltip
                                contentStyle={{
                                  borderRadius: 10,
                                  border: "1px solid hsl(var(--border))",
                                  backgroundColor: "hsl(var(--card))",
                                  color: "hsl(var(--card-foreground))",
                                  fontSize: "12px",
                                  boxShadow: "0 10px 25px -10px rgba(0,0,0,0.15)",
                                }}
                                formatter={(val: any, name: string) => {
                                  if (name === "Điểm TB") return [`${Number(val).toFixed(2)}/10 điểm`, name];
                                  if (name === "Tỷ lệ đạt") return [`${val}%`, name];
                                  return [val, name];
                                }}
                              />
                              <Legend
                                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                                iconType="circle"
                              />
                              <Bar
                                yAxisId="scoreAxis"
                                dataKey="avgScore"
                                name="Điểm TB"
                                fill="#0ea5e9"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={48}
                              />
                              <Line
                                yAxisId="rateAxis"
                                type="monotone"
                                dataKey="passRate"
                                name="Tỷ lệ đạt"
                                stroke="#10b981"
                                strokeWidth={2.5}
                                dot={{ r: 4, fill: "#10b981", strokeWidth: 1.5, stroke: "#fff" }}
                                activeDot={{ r: 6 }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Chi tiết bảng số liệu:
                          </p>
                          {data.attemptStats.attemptBreakdown.map((item) => (
                            <div
                              key={item.attemptNo}
                              className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant={item.attemptNo === 1 ? "secondary" : "outline"}
                                  className={`h-6 text-xs font-semibold ${
                                    item.attemptNo === 1 ? "bg-primary/10 text-primary border-primary/20" : ""
                                  }`}
                                >
                                  Lần {item.attemptNo}
                                </Badge>
                                <div>
                                  <span className="text-sm font-semibold text-foreground">
                                    {(item.avgScorePct / 10).toFixed(2)}/10 điểm TB
                                  </span>
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    · {item.submissionCount} lượt nộp
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="w-32 sm:w-44">
                                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>Tỷ lệ đạt</span>
                                    <span className="font-medium text-foreground">{item.passRate.toFixed(1)}%</span>
                                  </div>
                                  <Progress value={item.passRate} className="h-2" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card className="min-h-[300px] border-border/70 bg-card shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">Đúng / Sai / Bỏ qua</CardTitle>
                      <CardDescription>Tỷ lệ phân bố câu trả lời toàn bài thi.</CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {distribution.total} lượt trả lời
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {distribution.total === 0 ? (
                    <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground">
                      Chưa có dữ liệu câu trả lời.
                    </div>
                  ) : (
                    <div className="flex flex-col items-center sm:flex-row sm:justify-around gap-2 pt-1">
                      <div className="relative h-[210px] w-[210px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Tooltip
                              contentStyle={{
                                borderRadius: 10,
                                border: "1px solid hsl(var(--border))",
                                backgroundColor: "hsl(var(--card))",
                                color: "hsl(var(--card-foreground))",
                                fontSize: "12px",
                                boxShadow: "0 10px 25px -10px rgba(0,0,0,0.15)",
                              }}
                              formatter={(value: any, name: string) => [
                                `${value} câu (${distribution.total ? ((Number(value) / distribution.total) * 100).toFixed(1) : 0}%)`,
                                name,
                              ]}
                            />
                            <Pie
                              data={distributionPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={58}
                              outerRadius={88}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {distributionPieData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-2xl font-bold tracking-tight text-foreground">
                            {distribution.correctPct.toFixed(0)}%
                          </span>
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            Chính xác
                          </span>
                        </div>
                      </div>

                      <div className="flex w-full max-w-[200px] flex-col justify-center gap-3">
                        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-emerald-500/5 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-emerald-500" />
                            <span className="text-xs font-medium">Đúng</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-foreground">{distribution.correct}</p>
                            <p className="text-[10px] text-muted-foreground">{distribution.correctPct.toFixed(1)}%</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-rose-500/5 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-rose-500" />
                            <span className="text-xs font-medium">Sai</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-foreground">{distribution.incorrect}</p>
                            <p className="text-[10px] text-muted-foreground">{distribution.incorrectPct.toFixed(1)}%</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-amber-500/5 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-amber-500" />
                            <span className="text-xs font-medium">Bỏ qua</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-foreground">{distribution.skipped}</p>
                            <p className="text-[10px] text-muted-foreground">{distribution.skippedPct.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="min-h-[300px] border-border/70 bg-card shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">Tiến độ theo thời gian</CardTitle>
                      <CardDescription>Biến thiên điểm trung bình theo ngày nộp bài.</CardDescription>
                    </div>
                    {trendChartData.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Thang điểm 0 - 10
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {trendChartData.length === 0 ? (
                    <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground">
                      Chưa có dữ liệu tiến độ theo thời gian.
                    </div>
                  ) : (
                    <div className="h-[210px] w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendChartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.6} />
                          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 10]} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 10,
                              border: "1px solid hsl(var(--border))",
                              backgroundColor: "hsl(var(--card))",
                              color: "hsl(var(--card-foreground))",
                              fontSize: "12px",
                              boxShadow: "0 10px 25px -10px rgba(0,0,0,0.15)",
                            }}
                            formatter={(value: any) => [`${Number(value).toFixed(2)}/10 điểm`, "Điểm trung bình"]}
                            labelFormatter={(label) => `Ngày: ${label}`}
                          />
                          {(() => {
                            const rawPassing = data?.exam?.passingScore ?? data?.passingScorePct ?? 50;
                            const passingPoint = Number(((rawPassing > 10 ? rawPassing : rawPassing * 10) / 10).toFixed(2));
                            return (
                              <ReferenceLine
                                y={passingPoint}
                                stroke="#10b981"
                                strokeDasharray="4 4"
                                label={{
                                  value: `Đạt (${passingPoint})`,
                                  position: "insideTopRight",
                                  fill: "#10b981",
                                  fontSize: 10,
                                }}
                              />
                            );
                          })()}
                          <Area
                            type="monotone"
                            dataKey="score"
                            stroke="#0ea5e9"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#scoreGradient)"
                            activeDot={{ r: 5, stroke: "#0ea5e9", strokeWidth: 2, fill: "#fff" }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 bg-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">
                  <HelpedTitle help={{
                    description: "Tập hợp các chủ đề yếu và câu hỏi có tỷ lệ sai cao để giảng viên ưu tiên rà soát.",
                    usedBy: "Dùng sau khi bài thi có dữ liệu nộp bài, đặc biệt khi cần cải thiện chất lượng câu hỏi hoặc chuẩn bị ôn tập.",
                    note: "Tỷ lệ sai cao không luôn có nghĩa câu hỏi sai; có thể do chủ đề khó hoặc sinh viên chưa nắm kiến thức.",
                  }}>
                    Điểm cần chú ý
                  </HelpedTitle>
                </CardTitle>
                <CardDescription>Những chủ đề và câu hỏi cần ưu tiên rà soát.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        <HelpedTitle help={{
                          description: "Chủ đề yếu được tính bằng tổng số lượt trả lời sai của sinh viên chia cho tổng số lượt làm của toàn bộ câu hỏi thuộc chủ đề đó (% Sai = [Số câu sai / Tổng lượt làm] × 100).",
                          usedBy: "Hệ thống xếp hạng tất cả các chủ đề xuất hiện trong bài thi từ tỷ lệ sai cao nhất xuống thấp nhất, lấy tối đa top 8 chủ đề có tỷ lệ sai cao để cảnh báo.",
                          note: "Giảng viên có thể dựa vào danh sách này để mở đề luyện tập bổ trợ hoặc củng cố kiến thức tương ứng cho sinh viên.",
                        }}>
                          Chủ đề yếu nhất
                        </HelpedTitle>
                      </h3>
                      <Badge variant="outline" className="border-border bg-muted/40 text-xs">{data.weakestTopics.length} chủ đề</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Xếp hạng tối đa 8 chủ đề có tỷ lệ sai cao nhất (tính bằng: tổng số câu trả lời sai / tổng lượt làm của các câu hỏi thuộc chủ đề đó).
                    </p>

                    {data.weakestTopics.length === 0 ? (
                      <p className="rounded-md border border-border/70 p-4 text-sm text-muted-foreground">Chưa có chủ đề yếu nổi bật.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                        {/* Bar chart comparison */}
                        <div className="rounded-xl border border-border/70 bg-card p-3 lg:col-span-6 flex flex-col justify-between">
                          <div>
                            <p className="text-xs font-semibold text-foreground mb-1">
                              So sánh tỷ lệ sai theo chủ đề
                            </p>
                            <p className="text-[11px] text-muted-foreground mb-2">
                              Tỷ lệ trả lời sai (%) của sinh viên đối với các câu hỏi thuộc từng chủ đề.
                            </p>
                          </div>
                          <div className="h-[210px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={weakestTopicsChartData}
                                layout="vertical"
                                margin={{ top: 5, right: 25, left: 10, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.6} />
                                <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                                <YAxis
                                  type="category"
                                  dataKey="name"
                                  tickLine={false}
                                  axisLine={false}
                                  tick={{ fontSize: 11 }}
                                  width={100}
                                  tickFormatter={(v) => v.length > 13 ? `${v.slice(0, 12)}…` : v}
                                />
                                <Tooltip
                                  contentStyle={{
                                    borderRadius: 10,
                                    border: "1px solid hsl(var(--border))",
                                    backgroundColor: "hsl(var(--card))",
                                    color: "hsl(var(--card-foreground))",
                                    fontSize: "12px",
                                    boxShadow: "0 10px 25px -10px rgba(0,0,0,0.15)",
                                  }}
                                  formatter={(val: any) => [`${val}%`, "Tỷ lệ sai"]}
                                />
                                <Bar
                                  dataKey="incorrectRate"
                                  name="Tỷ lệ sai"
                                  fill="#f43f5e"
                                  radius={[0, 6, 6, 0]}
                                  maxBarSize={24}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Detailed action list */}
                        <div className="divide-y divide-border/70 rounded-xl border border-border/70 bg-card lg:col-span-6">
                          {data.weakestTopics.slice(0, 4).map((item) => (
                            <div key={`${item.topicId}-${item.topicName}`} className="p-3.5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-foreground">{item.topicName}</p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">Bỏ qua {item.skipRate.toFixed(0)}%</p>
                                </div>
                                <Badge variant="outline" className="shrink-0 border-rose-200 bg-rose-50 text-rose-700">
                                  {item.incorrectRate.toFixed(0)}% sai
                                </Badge>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1.5 h-7 px-0 text-xs text-primary hover:bg-transparent hover:text-primary/80"
                                onClick={() => { trackAction("weakest_topic_open_practice"); openAction(item.action); }}
                              >
                                Mở luyện tập <ExternalLink className="ml-1 h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        <HelpedTitle help={{
                          description: "Các câu hỏi được ưu tiên dựa trên nhiều tín hiệu về độ khó, tỷ lệ sai, tỷ lệ bỏ qua và cảnh báo nội dung hiện có.",
                          usedBy: "Giảng viên dùng để chọn câu cần kiểm tra trước khi chỉnh sửa hoặc nhờ AI đề xuất cải thiện.",
                          note: "Tỷ lệ sai cao không nhất thiết có nghĩa câu hỏi bị lỗi; đây chỉ là tín hiệu ưu tiên rà soát, không phải kết luận tự động.",
                        }}>
                          Câu hỏi cần rà soát
                        </HelpedTitle>
                      </h3>
                      {data.mostIncorrectQuestions.length > 8 ? <Badge variant="secondary" className="text-xs">Hiển thị 8/{data.mostIncorrectQuestions.length}</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Hỗ trợ cải thiện chất lượng nội dung & phương pháp dạy (Giúp giảng viên thấy câu nào sinh viên làm kém nhất để sửa đề hoặc ôn tập lại).
                    </p>
                    <div className="divide-y divide-border/70 rounded-md border border-border/70">
                      {data.mostIncorrectQuestions.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">Chưa có câu hỏi nào cần rà soát.</p>
                      ) : data.mostIncorrectQuestions.slice(0, 8).map((item) => {
                        const improvement = getQuestionImprovement(item.questionId);
                        const status = improvement?.status || "IDLE";
                        const isCreating = aiImprovingQuestionId === item.questionId;
                        return (
                          <div key={item.questionId} className="p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">Bài tập ưu tiên {item.orderIndex + 1}</p>
                                <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{translateMetricText(item.questionText)}</p>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                {item.possibleKeyError ? (
                                  <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
                                    ⚠ Nghi ngờ sai đáp án
                                  </Badge>
                                ) : null}
                                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{item.incorrectRate.toFixed(0)}% sai</Badge>
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Bỏ qua {item.skipRate.toFixed(0)}%</Badge>
                                {item.flaggedCount > 0 ? (
                                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">{item.flaggedCount} cảnh báo</Badge>
                                ) : null}
                              </div>
                            </div>

                            {item.possibleKeyError ? (
                              <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                                <p className="font-medium">
                                  {item.possibleKeyError.mostPickedOptionRate.toFixed(0)}% sinh viên chọn đáp án{" "}
                                  <span className="font-semibold">{item.possibleKeyError.mostPickedOptionLetter}</span>
                                  , cao hơn hẳn đáp án hệ thống đang chấm đúng là{" "}
                                  <span className="font-semibold">{item.possibleKeyError.correctOptionLetter}</span>{" "}
                                  (chỉ {item.possibleKeyError.correctOptionRate.toFixed(0)}%).
                                </p>
                                <p className="mt-1 text-xs text-red-700">
                                  Đây là dấu hiệu thống kê điển hình của việc nhập sai đáp án đúng khi tạo câu hỏi (trên {item.possibleKeyError.sampleSize} lượt trả lời) — không phải câu hỏi khó. Nên kiểm tra lại đáp án trước khi công bố điểm.
                                </p>
                              </div>
                            ) : null}

                            {item.answerPattern ? (
                              <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                                <p className="font-medium">
                                  Mẫu trả lời phổ biến ({item.answerPattern.sampleSize} lượt trả lời)
                                </p>
                                <div className="mt-2 space-y-1.5">
                                  {item.answerPattern.entries.map((entry) => (
                                    <p key={`${entry.label}-${entry.value}`} className="break-words text-sm">
                                      <span className="font-medium">{entry.label}:</span>{" "}
                                      <span className="font-semibold">{entry.value}</span>{" "}
                                      <span className="text-sky-700">— {entry.rate.toFixed(0)}% ({entry.count} lượt)</span>
                                    </p>
                                  ))}
                                </div>
                                <p className="mt-2 text-xs text-sky-700">
                                  Đây là xu hướng quan sát được trong câu trả lời, không phải kết luận tự động về đúng/sai hoặc chất lượng bài làm.
                                </p>
                              </div>
                            ) : null}

                            {status === "APPROVED" ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {formatAiStatus(status)}
                                </Badge>
                                <ContextHelp content={{
                                  description: "Câu hỏi đã được giảng viên duyệt bản cải thiện và cập nhật vào ngân hàng câu hỏi.",
                                  usedBy: "Dùng để phân biệt câu hỏi đã xử lý xong với câu hỏi vẫn còn chờ xem xét.",
                                  note: "Các bài thi cũ vẫn nên giữ nguyên snapshot lịch sử, chỉ ngân hàng câu hỏi hiện tại được cập nhật.",
                                }} />
                                {improvement?.id ? (
                                  <Button size="sm" className="h-8 gap-1" onClick={() => openAiReview(item.questionId, improvement.id)}>
                                    <Sparkles className="h-3.5 w-3.5" /> Xem thay đổi
                                  </Button>
                                ) : null}
                              </div>
                            ) : (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button variant="ghost" size="sm" className="h-8 px-0 text-primary hover:bg-transparent hover:text-primary/80" onClick={() => { void trackAction("most_incorrect_open_preview"); openQuestionPreview(item); }}>
                                  Mở câu hỏi <ExternalLink className="ml-1 h-3.5 w-3.5" />
                                </Button>

                                {status === "IDLE" || status === "REJECTED" || status === "FAILED" || status === "EXPIRED" ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-1"
                                      disabled={isCreating}
                                      onClick={() => {
                                        trackAction("open_ai_question_improvement");
                                        openAiImprovementDialog(item);
                                      }}
                                    >
                                      {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                      {status === "IDLE" ? "Nhờ AI cải thiện" : status === "FAILED" ? "Thử lại" : "Tạo đề xuất khác"}
                                    </Button>
                                    {status === "IDLE" ? <ContextHelp content={{
                                      description: "Yêu cầu AI phân tích câu hỏi có tỷ lệ sai cao và tạo một bản đề xuất cải thiện.",
                                      usedBy: "Giảng viên dùng khi muốn AI gợi ý cách viết lại nội dung, phương án, đáp án hoặc giải thích.",
                                      note: "AI không tự cập nhật ngân hàng câu hỏi; bản đề xuất chỉ có hiệu lực sau khi giảng viên duyệt.",
                                    }} /> : null}
                                  </>
                                ) : null}

                                {isPollingStatus(status) ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    {formatAiStatus(status)}
                                  </span>
                                ) : null}

                                {status === "READY_FOR_REVIEW" && improvement?.id ? (
                                  <>
                                    <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">Có bản cải thiện</Badge>
                                    <Button size="sm" className="h-8 gap-1" onClick={() => openAiReview(item.questionId, improvement.id)}>
                                      <Sparkles className="h-3.5 w-3.5" /> Xem cải thiện
                                    </Button>
                                  </>
                                ) : null}

                                {status === "REJECTED" ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                    <XCircle className="h-3.5 w-3.5" /> {formatAiStatus(status)}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </CardContent>
            </Card>

          </div>
            );
          })()}

        <Dialog open={Boolean(previewQuestion)} onOpenChange={(open) => {
          if (!open) closeQuestionPreview();
        }}>
          <DialogContent
            hideCloseButton
            className="w-[950px] max-w-[95vw] max-h-[85vh] overflow-hidden p-0 gap-0"
          >
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <DialogTitle className="text-lg font-semibold">
                  Question Preview
                </DialogTitle>
                {previewQuestion?.type ? (
                  <Badge variant="outline" className="shrink-0">
                    {QUESTION_TYPE_LABELS[String(previewQuestion.type)] ||
                      previewQuestion.type}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={!previewQuestion?.id || previewLoading}
                  onClick={() => openQuestionInBank(previewQuestion!.id, previewQuestion?.course?.code)}
                >
                  Chỉnh sửa trong ngân hàng <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={closeQuestionPreview}
                >
                  <span className="sr-only">Đóng</span>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {previewLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : previewError ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertTriangle className="h-10 w-10 text-destructive" />
                <p className="text-lg font-medium">
                  Không thể tải chi tiết câu hỏi
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {previewError}
                </p>
              </div>
            ) : previewQuestion ? (() => {
              const difficulty = getDifficultyLabel(previewQuestion.difficulty);

              return (
                <div className="max-h-[calc(85vh-73px)] space-y-6 overflow-y-auto p-6">
                  <QuestionReviewCard title="Nội dung câu hỏi">
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                      {previewQuestion.content || "Không có nội dung câu hỏi."}
                    </p>
                  </QuestionReviewCard>

                  <QuestionPreviewResponse question={previewQuestion} />

                  <QuestionReviewCard title="Giải thích">
                    {previewQuestion.explanation ? (
                      <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                        {previewQuestion.explanation}
                      </p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">
                        Chưa có giải thích
                      </p>
                    )}
                  </QuestionReviewCard>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border bg-card p-4 text-center">
                      <p className="mb-1 text-xs text-muted-foreground">
                        Difficulty
                      </p>
                      <p className={`text-lg font-semibold ${difficulty.className}`}>
                        {difficulty.text}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-card p-4 text-center">
                      <p className="mb-1 text-xs text-muted-foreground">
                        Points
                      </p>
                      <p className="text-lg font-semibold">
                        {previewQuestion.points ?? 1}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-card p-4 text-center">
                      <p className="mb-1 text-xs text-muted-foreground">
                        Type
                      </p>
                      <p className="text-lg font-semibold">
                        {QUESTION_TYPE_LABELS[String(previewQuestion.type || "")] ||
                          previewQuestion.type ||
                          "Không xác định"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
                    <div className="flex gap-2">
                      <span className="min-w-[100px] font-medium text-muted-foreground">
                        Course:
                      </span>
                      <span>
                        {getCourseLabel(previewQuestion.course) || "—"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="min-w-[100px] font-medium text-muted-foreground">
                        Created:
                      </span>
                      <span>{formatPreviewDate(previewQuestion.createdAt)}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="min-w-[100px] font-medium text-muted-foreground">
                        Last updated:
                      </span>
                      <span>{formatPreviewDate(previewQuestion.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })() : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(improvementTarget)}
          onOpenChange={(open) => {
            if (!open) closeAiImprovementDialog();
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Định hướng cải thiện câu hỏi
              </DialogTitle>
              <DialogDescription>
                AI sẽ kết hợp định hướng của bạn với tỷ lệ sai, bỏ qua và các tín hiệu chất lượng của câu hỏi. Đề xuất luôn cần giảng viên xem và duyệt trước khi áp dụng.
              </DialogDescription>
            </DialogHeader>
            {improvementTarget ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium text-foreground">Câu {improvementTarget.orderIndex + 1}</p>
                  <p className="mt-1 line-clamp-3 text-muted-foreground">{improvementTarget.questionText}</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="ai-improvement-question-type" className="text-sm font-medium text-foreground">
                    Loại câu hỏi mong muốn
                  </label>
                  <Select value={targetQuestionType} onValueChange={setTargetQuestionType}>
                    <SelectTrigger id="ai-improvement-question-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KEEP_CURRENT">Giữ nguyên loại hiện tại</SelectItem>
                      {Object.entries(QUESTION_TYPE_LABELS).map(([type, label]) => (
                        <SelectItem key={type} value={type}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">AI sẽ tạo đề xuất với cấu trúc đáp án phù hợp. Bạn vẫn xem và duyệt trước khi áp dụng.</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="ai-improvement-instruction" className="text-sm font-medium text-foreground">
                    Bạn muốn cải thiện theo hướng nào? <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
                  </label>
                  <Textarea
                    id="ai-improvement-instruction"
                    value={improvementInstruction}
                    onChange={(event) => setImprovementInstruction(event.target.value)}
                    maxLength={2000}
                    rows={4}
                    placeholder="Ví dụ: Giữ kiến thức trọng tâm nhưng diễn đạt rõ hơn cho sinh viên năm nhất; tăng độ phân biệt giữa các phương án nhiễu."
                  />
                  <p className="text-xs text-muted-foreground">Để trống nếu bạn muốn AI chỉ dựa vào dữ liệu hiệu suất hiện có.</p>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" disabled={Boolean(aiImprovingQuestionId)} onClick={closeAiImprovementDialog}>
                Hủy
              </Button>
              <Button
                disabled={!selectedExamId || Boolean(aiImprovingQuestionId)}
                onClick={() => {
                  trackAction("create_ai_question_improvement");
                  void createAiImprovement();
                }}
              >
                {aiImprovingQuestionId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Tạo đề xuất AI
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(reviewingImprovement)} onOpenChange={(open) => {
          if (!open && !reviewBusy) closeAiReview();
        }}>
          <DialogContent className="flex h-[94vh] w-[min(1440px,96vw)] max-w-none flex-col overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <HelpedTitle help={{
                      description: "Màn hình này cho phép so sánh bản cũ với bản AI đề xuất hoặc bản đã áp dụng cho câu hỏi.",
                      usedBy: "Giảng viên dùng để kiểm tra thay đổi trước khi chấp nhận cập nhật vào ngân hàng câu hỏi.",
                      note: "AI chỉ tạo đề xuất. Câu hỏi chỉ được cập nhật sau khi giảng viên bấm áp dụng.",
                    }}>
                      {"So sánh cải thiện câu hỏi"}
                    </HelpedTitle>
                  </DialogTitle>
                  <DialogDescription className="mt-2">
                    {canApplyImprovement
                      ? "So sánh bản cũ và bản AI đề xuất trước khi áp dụng vào ngân hàng câu hỏi."
                      : "Xem lại những thay đổi đã được áp dụng cho câu hỏi này."}
                  </DialogDescription>
                </div>
                {reviewingImprovement ? <Badge variant="outline" className="shrink-0 border-primary/25 bg-primary/10 text-primary">{`Độ tin cậy ${Math.round(Number(reviewingImprovement.confidence || 0) * 100)}%`}</Badge> : null}
              </div>
            </DialogHeader>
            {reviewError ? <div className="mx-6 mt-4 shrink-0 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{reviewError}</div> : null}
            {reviewingImprovement && comparisonBefore && comparisonAfter ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                  <Card className="border-border/70">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold">Tóm tắt thay đổi</CardTitle>
                      <CardDescription>
                        {comparisonChanges.length
                          ? "Chỉ hiển thị các trường có thay đổi giữa bản cũ và bản mới."
                          : "Không phát hiện thay đổi rõ ràng giữa hai phiên bản."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {comparisonChanges.length ? (
                        <div className="flex flex-wrap gap-2">
                          {comparisonChanges.map((field) => (
                            <Badge key={field.key} variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                              {field.label}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          AI không tạo ra khác biệt dễ nhận thấy ở các trường chính. Bạn vẫn có thể kiểm tra chi tiết bên dưới.
                        </p>
                      )}

                      {(reviewingImprovement.diagnosis?.reason || (reviewingImprovement.diagnosis?.issues || []).length > 0) ? (
                        <div className="rounded-lg border border-border bg-muted/30 p-4">
                          <p className="text-sm font-medium text-foreground">Nhận định của AI</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {translateAiAnalysisText(reviewingImprovement.diagnosis?.reason) || "AI chưa cung cấp nhận định tổng quan."}
                          </p>
                          {(reviewingImprovement.diagnosis?.issues || []).length ? (
                            <div className="mt-3 space-y-2">
                              {reviewingImprovement.diagnosis?.issues?.map((issue, index) => (
                                <div key={`${issue.type}-${index}`} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                  <p className="font-medium">{ISSUE_LABELS[String(issue.type || "")] || issue.type || "Vấn đề cần xem xét"}</p>
                                  {issue.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{translateAiAnalysisText(issue.description)}</p> : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <QuestionComparisonCard
                      title="Bản cũ"
                      snapshot={comparisonBefore}
                      changedFields={comparisonChanges.map((field) => field.key)}
                    />
                    <QuestionComparisonCard
                      title="Bản mới"
                      snapshot={comparisonAfter}
                      changedFields={comparisonChanges.map((field) => field.key)}
                    />
                  </div>
                </div>
              </div>
            ) : reviewBusy ? <div className="grid min-h-80 flex-1 place-items-center text-muted-foreground"><div className="space-y-4 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /><div className="space-y-1 text-sm"><p>{"Đang phân tích câu hỏi."}</p><p>{"Đang kiểm tra đáp án."}</p><p>{"Đang viết lại nội dung và giải thích."}</p></div></div></div> : null}
            <DialogFooter className="sticky bottom-0 z-10 shrink-0 justify-between gap-3 border-t border-border bg-card/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
              <div className="flex gap-2">
                <Button variant="outline" disabled={reviewBusy} onClick={closeAiReview}>{"Đóng"}</Button>
                {canApplyImprovement ? (
                  <Button variant="outline" disabled={reviewBusy || !reviewingImprovement} onClick={rejectAiImprovement}>{"Giữ nguyên câu hỏi hiện tại"}</Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                {canApplyImprovement ? (
                  <Button disabled={reviewBusy || !reviewingImprovement} onClick={approveAiImprovement}>
                    {reviewBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {"Áp dụng bản cải thiện"}
                  </Button>
                ) : null}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminPageShell>
    </DashboardLayout>
  );
}

function QuestionReviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function QuestionPreviewResponse({ question }: { question: PreviewQuestion }) {
  const type = String(question.type || "").toUpperCase();
  const options = normalizeEditableOptions(question.options);
  const correctAnswers = normalizeCorrectAnswerIds(question.correctAnswer);
  const rawOptions = safeJsonValue(question.options);
  const toValues = (value: unknown) => Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : typeof value === "string"
      ? value.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

  if (type === "MATCHING") {
    const structured = rawOptions && typeof rawOptions === "object" && !Array.isArray(rawOptions)
      ? rawOptions as Record<string, unknown>
      : null;
    const pairs = Array.isArray(rawOptions)
      ? rawOptions.map((item, index) => {
          const pair = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return { id: String(pair.id ?? index + 1), left: String(pair.text ?? pair.left ?? ""), right: String(pair.match ?? pair.right ?? "") };
        })
      : (() => {
          const left = toValues(structured?.left);
          const right = toValues(structured?.right);
          return left.map((item, index) => ({ id: String(index + 1), left: item, right: right[index] || "Chưa ghép" }));
        })();
    return <QuestionReviewCard title="Các cặp ghép đôi">
      {pairs.length ? <div className="space-y-2">{pairs.map((pair) => <div key={pair.id} className="grid gap-2 rounded-lg border bg-card p-3 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center"><span className="break-words font-medium">{pair.left}</span><span className="text-center text-muted-foreground">→</span><span className="break-words text-primary">{pair.right}</span></div>)}</div> : <PreviewEmpty text="Chưa có cặp ghép đôi." />}
    </QuestionReviewCard>;
  }

  if (type === "ORDERING") {
    return <QuestionReviewCard title="Thứ tự đúng">
      {options.length ? <div className="space-y-2">{options.map((option, index) => <div key={option.id} className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span><span className="break-words pt-0.5">{option.text}</span></div>)}</div> : <PreviewEmpty text="Chưa có các bước để sắp xếp." />}
    </QuestionReviewCard>;
  }

  if (type === "FILL_IN_BLANK") {
    const inlineAnswers = Array.from(String(question.content || "").matchAll(/\[\[([^\]]+)\]\]/g), (match) => match[1].trim()).filter(Boolean);
    const answers = correctAnswers.length ? correctAnswers : inlineAnswers;
    const template = String(question.content || "").replace(/\[\[[^\]]+\]\]/g, "_____ ");
    return <>
      <QuestionReviewCard title="Câu có chỗ trống"><p className="whitespace-pre-wrap break-words rounded-lg border border-dashed bg-muted/30 p-4 text-sm leading-7">{template}</p></QuestionReviewCard>
      <QuestionReviewCard title="Đáp án các chỗ trống">{answers.length ? <div className="flex flex-wrap gap-2">{answers.map((answer, index) => <Badge key={`${answer}-${index}`} variant="outline" className="border-green-200 bg-green-50 text-green-800">Chỗ trống {index + 1}: {answer}</Badge>)}</div> : <PreviewEmpty text="Chưa có đáp án cho chỗ trống." />}</QuestionReviewCard>
    </>;
  }

  if (["ESSAY", "SHORT_ANSWER"].includes(type)) {
    return <QuestionReviewCard title="Đáp án / tiêu chí mong đợi">{correctAnswers.length ? <AnswerBadges answers={correctAnswers} /> : <PreviewEmpty text="Câu tự luận không có đáp án cố định; xem phần giải thích hoặc chỉnh sửa để thêm tiêu chí chấm." />}</QuestionReviewCard>;
  }

  const optionTitle = type === "FIND_ERROR" ? "Dòng mã cần tìm lỗi" : type === "TRUE_FALSE" ? "Khẳng định" : "Các lựa chọn";
  return <>
    <QuestionReviewCard title={optionTitle}>{options.length ? <div className="space-y-2">{options.map((option) => {
      const isCorrect = correctAnswers.some((answer) => answer.toUpperCase() === option.id.toUpperCase() || answer === option.text);
      return <div key={option.id} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${isCorrect ? "border-green-300 bg-green-50" : "border-border bg-card"}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${isCorrect ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>{isCorrect ? "✓" : option.id}</span><span className={`flex-1 whitespace-pre-wrap break-words pt-0.5 ${type === "FIND_ERROR" ? "font-mono" : ""}`}>{option.text}</span></div>;
    })}</div> : <PreviewEmpty text="Chưa có lựa chọn." />}</QuestionReviewCard>
    <QuestionReviewCard title="Đáp án đúng">{correctAnswers.length ? <AnswerBadges answers={correctAnswers} /> : <PreviewEmpty text="Chưa có đáp án đúng." />}</QuestionReviewCard>
  </>;
}

function AnswerBadges({ answers }: { answers: string[] }) {
  return <div className="flex flex-wrap gap-2">{answers.map((answer, index) => <Badge key={`${answer}-${index}`} variant="outline" className="border-green-200 bg-green-50 text-green-800">✓ {answer}</Badge>)}</div>;
}

function PreviewEmpty({ text }: { text: string }) {
  return <p className="text-sm italic text-muted-foreground">{text}</p>;
}

function QuestionComparisonCard({
  title,
  snapshot,
  changedFields,
}: {
  title: string;
  snapshot: QuestionComparisonSnapshot;
  changedFields: ComparisonFieldKey[];
}) {
  const difficulty = getDifficultyLabel(snapshot.difficulty);
  const changedSet = new Set(changedFields);
  const isChanged = (field: ComparisonFieldKey) => changedSet.has(field);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {snapshot.type ? (
            <Badge variant="outline">
              {QUESTION_TYPE_LABELS[String(snapshot.type)] || snapshot.type}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ComparisonSection title="Nội dung câu hỏi" changed={isChanged("content")}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {snapshot.content || "Chưa có nội dung."}
          </p>
        </ComparisonSection>

        <ComparisonSection title="Loại câu hỏi" changed={isChanged("type")}>
          <p className="text-sm text-foreground">
            {QUESTION_TYPE_LABELS[String(snapshot.type)] || snapshot.type || "Không xác định"}
          </p>
        </ComparisonSection>

        <ComparisonSection title="Phương án" changed={isChanged("options") || isChanged("correctAnswer")}>
          {snapshot.options.length ? (
            <div className="space-y-2">
              {snapshot.options.map((option) => (
                <OptionPreviewRow
                  key={option.id}
                  option={option}
                  isCorrect={snapshot.correctAnswerIds.includes(option.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Không có phương án.</p>
          )}
        </ComparisonSection>

        <ComparisonSection title="Đáp án đúng" changed={isChanged("correctAnswer")}>
          <p className="text-sm text-foreground">
            {snapshot.correctAnswerIds.length ? snapshot.correctAnswerIds.join(", ") : "Chưa xác định"}
          </p>
        </ComparisonSection>

        <ComparisonSection title="Giải thích" changed={isChanged("explanation")}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {snapshot.explanation || "Chưa có giải thích."}
          </p>
        </ComparisonSection>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ComparisonSection title="Độ khó" changed={isChanged("difficulty")}>
            <p className={`text-sm font-medium ${difficulty.className}`}>
              {snapshot.difficulty == null ? "Chưa gán" : `${snapshot.difficulty} · ${difficulty.text}`}
            </p>
          </ComparisonSection>
          <ComparisonSection title="Điểm" changed={isChanged("points")}>
            <p className="text-sm font-medium text-foreground">
              {snapshot.points == null ? "Chưa gán" : snapshot.points}
            </p>
          </ComparisonSection>
        </div>

        <ComparisonSection title="Khóa học" changed={false}>
          {getCourseLabel(snapshot.course) ? (
            <div className="space-y-1 text-sm text-foreground">
              <p className="font-medium">{getCourseLabel(snapshot.course)}</p>
              {snapshot.course?.academicYear || snapshot.course?.term ? (
                <p className="text-xs text-muted-foreground">
                  {[snapshot.course?.academicYear, snapshot.course?.term].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa xác định khóa học.</p>
          )}
        </ComparisonSection>

        <ComparisonSection title="Thẻ" changed={isChanged("tags")}>
          <TagList values={snapshot.tags} emptyLabel="Chưa có thẻ." />
        </ComparisonSection>

        <ComparisonSection title="Chủ đề" changed={isChanged("topics")}>
          <TagList values={snapshot.topics} emptyLabel="Chưa có chủ đề." />
        </ComparisonSection>
      </CardContent>
    </Card>
  );
}

function OptionPreviewRow({ option, isCorrect }: { option: EditableOption; isCorrect: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border font-semibold ${isCorrect ? "border-success bg-success/15 text-success" : "border-border text-muted-foreground"}`}>{isCorrect ? <CheckCircle2 className="h-4 w-4" /> : option.id}</span>
      <span className="leading-6">{option.text}</span>
    </div>
  );
}

function ComparisonSection({
  title,
  changed,
  children,
}: {
  title: string;
  changed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-4 ${changed ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {changed ? (
          <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
            Đã thay đổi
          </Badge>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function TagList({ values, emptyLabel }: { values: string[]; emptyLabel: string }) {
  if (!values.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <Badge key={value} variant="secondary" className="font-normal">
          {value}
        </Badge>
      ))}
    </div>
  );
}
