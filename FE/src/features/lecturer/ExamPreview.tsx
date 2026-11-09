"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Clock,
  BookOpen,
  PencilLine,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  QrCode,
  RefreshCw,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  ListOrdered,
  HelpCircle,
  Award,
  Layers,
  Sparkles,
  Eye,
} from "lucide-react";
import api from "@/lib/api";
import { FormattedText } from "@/components/ui/formatted-text";
import AutonomousAuditDialog from "./components/AutonomousAuditDialog";

type ExamQuestion = {
  id: string;
  orderIndex: number;
  question: {
    id: string;
    type: string;
    content: string;
    options?: Record<string, any> | any[] | null;
    correctAnswer?: any;
    explanation?: string | null;
    difficulty?: number | string;
    points?: number;
    mediaType?: "image" | "audio" | null;
    mediaUrl?: string | null;
  };
};

type ExamData = {
  id: string;
  title: string;
  description?: string;
  status: string;
  startTime?: string | null;
  duration: number;
  course?: { code?: string; name?: string };
  examQuestions: ExamQuestion[];
  _count?: { submissions?: number };
};

function normalizeType(rawType?: string) {
  const labels: Record<string, string> = {
    MULTIPLE_CHOICE: "Trắc nghiệm",
    MULTI_SELECT: "Chọn nhiều",
    TRUE_FALSE: "Đúng / Sai",
    MATCHING: "Ghép đôi",
    SHORT_ANSWER: "Trả lời ngắn",
    ESSAY: "Tự luận",
    FILL_IN_BLANK: "Điền vào chỗ trống",
    ORDERING: "Sắp xếp",
    FIND_ERROR: "Tìm lỗi sai",
  };
  if (!rawType) return "Không rõ";
  return labels[rawType.toUpperCase()] || rawType.replace(/_/g, " ");
}

function getDifficultyInfo(diff?: number | string | null): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  const num = Number(diff);
  const str = String(diff || "").toUpperCase();
  if (num === 1 || str === "EASY") {
    return {
      label: "Dễ",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      dotClass: "bg-emerald-500",
    };
  }
  if (num === 3 || str === "HARD") {
    return {
      label: "Khó",
      badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
      dotClass: "bg-rose-500",
    };
  }
  return {
    label: "Trung bình",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    dotClass: "bg-amber-500",
  };
}

function toText(value: any): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    if ("answer" in value) return toText(value.answer);
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${toText(item)}`)
      .join("; ");
  }
  return String(value);
}

function getOptionEntries(options: ExamQuestion["question"]["options"]) {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((option, index) => ({
      key: String.fromCharCode(65 + index),
      value: toText(option),
    }));
  }
  if (typeof options === "object") {
    return Object.entries(options).map(([key, value]) => ({
      key,
      value: toText(value),
    }));
  }
  return [];
}

function getCorrectAnswerKeys(correctAnswer: any) {
  const answer = correctAnswer?.answer ?? correctAnswer;
  if (Array.isArray(answer)) return answer.map((item) => String(item));
  if (answer && typeof answer === "object") return Object.keys(answer);
  if (answer == null || answer === "") return [];
  return [String(answer)];
}

function getCorrectAnswerText(correctAnswer: any, options: ExamQuestion["question"]["options"]) {
  const answer = correctAnswer?.answer ?? correctAnswer;
  const optionMap = new Map(getOptionEntries(options).map((option) => [option.key, option.value]));

  if (Array.isArray(answer)) {
    return answer
      .map((key) => `${key}${optionMap.get(String(key)) ? `. ${optionMap.get(String(key))}` : ""}`)
      .join(", ");
  }

  if (answer && typeof answer === "object") {
    return Object.entries(answer)
      .map(([key, value]) => `${key} → ${toText(value)}`)
      .join("; ");
  }

  if (answer == null || answer === "") return "Chưa có đáp án";
  const key = String(answer);
  return optionMap.has(key) ? `${key}. ${optionMap.get(key)}` : key;
}

// ─── Special parsers for MATCHING / ORDERING / FIND_ERROR ───

function parseMatchingPairs(options: any): { left: string; right: string }[] {
  if (!options || typeof options !== "object" || Array.isArray(options)) return [];
  const left = Array.isArray(options.left) ? options.left.map(String) : [];
  const right = Array.isArray(options.right) ? options.right.map(String) : [];
  return left.map((l, i) => ({ left: l, right: right[i] || "" }));
}

function parseMatchingAnswer(correctAnswer: any): { left: string; right: string }[] {
  const raw = correctAnswer?.pairs;
  if (Array.isArray(raw)) return raw.map((p: any) => ({ left: String(p.left || ""), right: String(p.right || "") }));
  return [];
}

function parseOrderingItems(options: any): string[] {
  if (Array.isArray(options)) return options.map(String);
  return [];
}

function parseOrderingAnswer(correctAnswer: any): string[] {
  const raw = correctAnswer?.items;
  if (Array.isArray(raw)) return raw.map(String);
  return [];
}

export default function ExamPreview() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug : [];
  const routeId = params?.id;
  const examId = Array.isArray(routeId) ? routeId[0] : routeId || slug[1];
  const pathname = usePathname();
  const router = useRouter();
  const basePath = pathname.startsWith("/admin") ? "/admin" : "/lecturer";

  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"single" | "all">("single");

  const loadExam = async () => {
    if (!examId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getExam(examId);
      setExam(res);
    } catch (error) {
      console.error("Failed to load exam preview:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExam();
  }, [examId]);

  const questions = useMemo(() => exam?.examQuestions || [], [exam]);
  const totalQuestions = questions.length;

  const totalPoints = useMemo(() => {
    return questions.reduce((acc, eq) => acc + (eq.question?.points ?? 1), 0);
  }, [questions]);

  const difficultyStats = useMemo(() => {
    let easy = 0;
    let medium = 0;
    let hard = 0;
    questions.forEach((eq) => {
      const d = eq.question?.difficulty;
      const num = Number(d);
      const str = String(d || "").toUpperCase();
      if (num === 1 || str === "EASY") easy++;
      else if (num === 3 || str === "HARD") hard++;
      else medium++;
    });
    return { easy, medium, hard };
  }, [questions]);

  // Keyboard navigation for single-question mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showQRDialog || showAuditDialog) return;
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === "ArrowLeft") {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalQuestions, showQRDialog, showAuditDialog]);

  const timeline = useMemo(() => {
    if (!exam?.startTime) {
      return {
        isScheduled: false,
        isEnded: false,
        start: null as Date | null,
        end: null as Date | null,
      };
    }

    const now = Date.now();
    const start = new Date(exam.startTime);
    const end = new Date(start.getTime() + (exam.duration || 0) * 60000);

    return {
      start,
      end,
      isScheduled: now < start.getTime(),
      isEnded: now > end.getTime(),
    };
  }, [exam]);

  const handleSelectQuestion = (index: number) => {
    setCurrentIndex(index);
    if (viewMode === "all") {
      const el = document.getElementById(`question-card-${index}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
        }, 1500);
      }
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!exam) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Không tìm thấy bài thi.
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const currentEq = questions[currentIndex];

  const renderQuestionCard = (eq: ExamQuestion, index: number, isSingleView: boolean) => {
    const options = getOptionEntries(eq.question?.options);
    const rawType = String(eq.question?.type || "").toUpperCase();
    const qType = normalizeType(rawType);
    const matchingPairs = rawType === "MATCHING" ? parseMatchingPairs(eq.question?.options) : [];
    const matchingAnswer = rawType === "MATCHING" ? parseMatchingAnswer(eq.question?.correctAnswer) : [];
    const orderingItems = rawType === "ORDERING" ? parseOrderingItems(eq.question?.options) : [];
    const orderingAnswer = rawType === "ORDERING" ? parseOrderingAnswer(eq.question?.correctAnswer) : [];
    const correctKeys = new Set(getCorrectAnswerKeys(eq.question?.correctAnswer));
    const correctAnswerText = getCorrectAnswerText(
      eq.question?.correctAnswer,
      eq.question?.options,
    );
    const diffInfo = getDifficultyInfo(eq.question?.difficulty);

    return (
      <div
        id={`question-card-${index}`}
        key={eq.id}
        className="rounded-xl border border-border/80 bg-card shadow-xs transition-all hover:border-border"
      >
        {/* Header of question card */}
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-bold text-base text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {index + 1}
              </span>
              Câu {index + 1}
              {isSingleView && (
                <span className="text-xs font-normal text-muted-foreground">
                  / {totalQuestions}
                </span>
              )}
            </span>
            <Badge variant="secondary" className="text-xs font-medium">
              {qType}
            </Badge>
            <Badge variant="outline" className={`text-xs font-medium ${diffInfo.badgeClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${diffInfo.dotClass}`} />
              {diffInfo.label}
            </Badge>
            <Badge variant="outline" className="text-xs font-mono font-medium text-muted-foreground">
              {eq.question?.points ?? 1} điểm
            </Badge>
          </div>

          <Button
            size="sm"
            variant="ghost"
            disabled={timeline.isEnded}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href={`${basePath}/question-editor?id=${eq.question.id}`}>
              <PencilLine className="h-3.5 w-3.5" />
              Sửa câu hỏi
            </Link>
          </Button>
        </div>

        {/* Question content & media */}
        <div className="space-y-4 p-5 sm:p-6">
          {eq.question?.mediaType === "image" && eq.question?.mediaUrl ? (
            <div className="overflow-hidden rounded-lg border bg-muted/10 p-2">
              <img
                src={eq.question.mediaUrl}
                alt="Hình ảnh minh họa câu hỏi"
                className="max-h-80 w-full rounded-md object-contain"
              />
            </div>
          ) : eq.question?.mediaType === "audio" && eq.question?.mediaUrl ? (
            <div className="rounded-lg border bg-muted/20 p-3">
              <audio src={eq.question.mediaUrl} controls className="w-full" />
            </div>
          ) : null}

          <FormattedText
            text={eq.question?.content || "Chưa có nội dung"}
            className="rounded-lg border border-border/70 bg-background/50 px-4 py-3.5 text-sm sm:text-[15px] font-medium leading-relaxed"
          />

          {/* Options view styled like student exam */}
          {rawType === "MATCHING" ? (
            matchingPairs.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Ghép đôi các khái niệm:
                </p>
                {matchingPairs.map((pair, i) => {
                  const isCorrect = matchingAnswer.some(
                    (a) => a.left === pair.left && a.right === pair.right,
                  );
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                        isCorrect
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="font-medium min-w-0 break-words">{pair.left}</span>
                      <span className="text-muted-foreground shrink-0 font-bold">➔</span>
                      <span className="min-w-0 break-words">{pair.right}</span>
                      {isCorrect && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" /> Ghép đúng
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null
          ) : rawType === "ORDERING" ? (
            orderingItems.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Thứ tự sắp xếp:
                </p>
                {orderingItems.map((item, i) => {
                  const isCorrect = orderingAnswer[i] === item;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                        isCorrect
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {i + 1}
                      </span>
                      <FormattedText text={item} className="min-w-0 break-words flex-1" />
                      {isCorrect && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-600" />}
                    </div>
                  );
                })}
              </div>
            ) : null
          ) : rawType === "FIND_ERROR" ? (
            options.length > 0 ? (
              <div className="space-y-1.5 font-mono pt-1">
                <p className="text-xs font-medium font-sans text-muted-foreground uppercase tracking-wide">
                  Đoạn mã kiểm tra:
                </p>
                {options.map((option) => {
                  const isCorrect = correctKeys.has(option.key);
                  return (
                    <div
                      key={option.key}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-xs transition-colors ${
                        isCorrect
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200 font-semibold"
                          : "border-border/60 bg-muted/20 text-foreground"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                          isCorrect ? "bg-rose-600 text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {option.key}
                      </span>
                      <span className="min-w-0 break-words whitespace-pre-wrap leading-5 flex-1">
                        {option.value}
                      </span>
                      {isCorrect && (
                        <span className="ml-auto shrink-0 text-[11px] font-semibold text-rose-600">
                          Dòng lỗi
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null
          ) : options.length > 0 ? (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Các lựa chọn đáp án:
              </p>
              <div className="grid gap-2.5">
                {options.map((option) => {
                  const isCorrect = correctKeys.has(option.key);
                  return (
                    <div
                      key={option.key}
                      className={`group flex items-start gap-3 rounded-xl border p-3.5 text-sm transition-all ${
                        isCorrect
                          ? "border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-100 shadow-xs"
                          : "border-border/80 bg-card hover:bg-muted/40 text-foreground"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-transform ${
                          isCorrect
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                        }`}
                      >
                        {option.key}
                      </span>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <FormattedText
                          text={option.value}
                          className="break-words leading-relaxed text-[13.5px]"
                        />
                      </div>
                      {isCorrect && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full border border-emerald-300/40">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Đáp án đúng
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Đáp án đúng */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Đáp án chính xác của hệ thống
            </div>
            {rawType === "MATCHING" ? (
              matchingAnswer.length > 0 ? (
                <div className="space-y-1">
                  {matchingAnswer.map((pair, i) => (
                    <p key={i} className="text-sm leading-6 text-foreground">
                      <span className="font-semibold">{pair.left}</span> → {pair.right}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-foreground break-words">{correctAnswerText}</p>
              )
            ) : rawType === "ORDERING" ? (
              orderingAnswer.length > 0 ? (
                <div className="space-y-1">
                  {orderingAnswer.map((item, i) => (
                    <p key={i} className="text-sm leading-6 text-foreground">
                      <span className="font-semibold">{i + 1}.</span> {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-foreground break-words">{correctAnswerText}</p>
              )
            ) : rawType === "FIND_ERROR" ? (
              <p className="text-sm leading-6 text-foreground">
                Dòng chứa lỗi: <span className="font-bold text-rose-600">{correctAnswerText}</span>
              </p>
            ) : (
              <p className="text-sm leading-6 text-foreground break-words font-medium">
                {correctAnswerText}
              </p>
            )}
          </div>

          {/* Rubric / Explanation */}
          {eq.question?.explanation ? (
            <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                <HelpCircle className="h-4 w-4" />
                Giải thích &amp; Hướng dẫn chấm (Rubric)
              </div>
              <p className="text-sm leading-relaxed text-foreground break-words">
                {eq.question.explanation}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border/60 pb-4">
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 -ml-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.push(`${basePath}/exams`)}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Quay lại danh sách bài thi
              </Button>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{exam.title}</h1>
              <p className="text-sm text-muted-foreground">
                {exam.course?.code
                  ? `${exam.course.code} — ${exam.course?.name || ""}`
                  : exam.course?.name || "Chưa có khóa học"}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAuditDialog(true)}
                className="border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-medium gap-1.5 shadow-xs"
              >
                <BrainCircuit className="h-4 w-4 text-primary animate-pulse" />
                Thẩm định AI Squad (LangGraph)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadExam}
                disabled={loading}
                className="gap-1.5 text-xs"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Làm mới
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQRDialog(true)}
                className="text-xs"
              >
                <QrCode className="h-3.5 w-3.5 mr-1" />
                Mã QR
              </Button>
              {(exam._count?.submissions ?? 0) > 0 ? (
                <Button size="sm" asChild>
                  <Link href={`${basePath}/exam/${exam.id}/results`}>
                    <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                    Kết quả &amp; Chấm bài
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${basePath}/question-bank`}>Ngân hàng câu hỏi</Link>
                </Button>
              )}
            </div>
          </div>

          {/* Metadata & View Mode Selector */}
          <div className="flex items-center justify-between gap-4 flex-wrap pt-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" /> {exam.duration} phút
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <BookOpen className="h-4 w-4 text-muted-foreground" /> {totalQuestions} câu hỏi
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Award className="h-4 w-4 text-muted-foreground" /> {totalPoints} điểm
              </span>
              {timeline.start && (
                <>
                  <span className="text-muted-foreground/40">•</span>
                  <Badge
                    variant={
                      timeline.isScheduled
                        ? "secondary"
                        : timeline.isEnded
                          ? "destructive"
                          : "default"
                    }
                    className="text-xs"
                  >
                    {timeline.isScheduled
                      ? `Lên lịch ${format(timeline.start, "d MMM, HH:mm")}`
                      : timeline.isEnded
                        ? "Đã kết thúc"
                        : "Đang diễn ra"}
                  </Badge>
                </>
              )}
            </div>

            {/* View Mode Switcher */}
            <div className="inline-flex items-center rounded-lg border bg-muted/30 p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("single")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
                  viewMode === "single"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Từng câu (Giao diện thi)
              </button>
              <button
                type="button"
                onClick={() => setViewMode("all")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
                  viewMode === "all"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                Toàn bộ danh sách
              </button>
            </div>
          </div>

          {exam.description ? (
            <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">
              {exam.description}
            </p>
          ) : null}
        </div>

        {/* Main 2-Column Content: Left Navigator Box + Right Question Content */}
        {!totalQuestions ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Bài thi chưa có câu hỏi nào.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── Left Column: Question Navigator Box (Palette) ─────────────── */}
            <div className="lg:col-span-4 xl:col-span-3 space-y-4 lg:sticky lg:top-20">
              <Card className="border-border/80 shadow-xs">
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4 text-primary" />
                      Danh sách câu hỏi
                    </CardTitle>
                    <Badge variant="outline" className="text-xs font-mono font-medium">
                      {currentIndex + 1} / {totalQuestions}
                    </Badge>
                  </div>
                  <Progress
                    value={((currentIndex + 1) / totalQuestions) * 100}
                    className="h-1.5 mt-2"
                  />
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  {/* Question Grid Box */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {questions.map((eq, idx) => {
                      const isActive = currentIndex === idx;
                      const diffInfo = getDifficultyInfo(eq.question?.difficulty);

                      return (
                        <button
                          key={eq.id}
                          type="button"
                          onClick={() => handleSelectQuestion(idx)}
                          title={`Câu ${idx + 1}: ${normalizeType(eq.question?.type)} (${diffInfo.label})`}
                          className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-all duration-150 ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary ring-offset-2 scale-105 z-10 font-bold"
                              : "border border-border/70 bg-card hover:bg-muted/60 text-foreground"
                          }`}
                        >
                          {idx + 1}
                          {/* Tiny difficulty indicator dot */}
                          <span
                            className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${diffInfo.dotClass}`}
                          />
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend & Difficulty Breakdown */}
                  <div className="space-y-2 border-t border-border/60 pt-3 text-xs">
                    <p className="font-medium text-muted-foreground uppercase text-[10.5px] tracking-wider">
                      Phân bổ độ khó
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 py-1.5 text-emerald-700 dark:text-emerald-300">
                        <div className="font-bold text-sm leading-none">{difficultyStats.easy}</div>
                        <div className="text-[10.5px] mt-1 font-medium">Dễ</div>
                      </div>
                      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 py-1.5 text-amber-700 dark:text-amber-300">
                        <div className="font-bold text-sm leading-none">{difficultyStats.medium}</div>
                        <div className="text-[10.5px] mt-1 font-medium">Trung bình</div>
                      </div>
                      <div className="rounded-md border border-rose-500/20 bg-rose-500/10 py-1.5 text-rose-700 dark:text-rose-300">
                        <div className="font-bold text-sm leading-none">{difficultyStats.hard}</div>
                        <div className="text-[10.5px] mt-1 font-medium">Khó</div>
                      </div>
                    </div>
                  </div>

                  {/* Keyboard tip */}
                  <p className="text-[11px] text-muted-foreground text-center border-t border-border/40 pt-2">
                    Mẹo: Dùng phím <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">←</kbd> và{" "}
                    <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">→</kbd> để đổi câu
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── Right Column: Question Content ────────────────────────────── */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-6">
              {viewMode === "single" ? (
                /* Single Question (Student-Like Interactive View) */
                <div className="space-y-4">
                  {renderQuestionCard(currentEq, currentIndex, true)}

                  {/* Bottom Navigation Toolbar */}
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      disabled={currentIndex === 0}
                      className="gap-1.5 text-xs"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Câu trước
                    </Button>

                    <div className="text-xs font-medium text-muted-foreground">
                      Câu <span className="font-bold text-foreground">{currentIndex + 1}</span> / {totalQuestions}
                    </div>

                    <Button
                      variant={currentIndex === totalQuestions - 1 ? "outline" : "default"}
                      size="sm"
                      onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                      disabled={currentIndex === totalQuestions - 1}
                      className="gap-1.5 text-xs"
                    >
                      Câu tiếp theo
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                /* All Questions Stacked View with Anchor Scrolling */
                <div className="space-y-6">
                  {questions.map((eq, idx) => renderQuestionCard(eq, idx, false))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* QR Dialog */}
        <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Mã QR bài thi</DialogTitle>
              <DialogDescription>
                Hiển thị mã QR này trên màn hình để sinh viên quét và làm bài
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col items-center justify-center text-center">
              <img
                alt="Mã QR bài thi"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=720x720&data=${encodeURIComponent(
                  `${typeof window !== "undefined" ? window.location.origin : ""}/student/exam-ready?examId=${exam?.id}`,
                )}`}
                className="h-64 w-64 rounded-lg border p-2 shadow-xs"
              />
              <div className="mt-4">
                <Button asChild size="sm">
                  <Link href={`${basePath}/exam/${exam?.id}/qr`}>Mở toàn màn hình</Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Autonomous Exam QA Squad Dialog (LangGraph) */}
        {exam && (
          <AutonomousAuditDialog
            open={showAuditDialog}
            onOpenChange={setShowAuditDialog}
            examId={exam.id}
            examTitle={exam.title}
            examQuestions={exam.examQuestions}
            onAuditApplied={loadExam}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
