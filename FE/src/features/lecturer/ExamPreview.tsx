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
  DialogFooter,
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
} from "lucide-react";
import api from "@/lib/api";
import { FormattedText } from "@/components/ui/formatted-text";

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
    difficulty?: number;
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
  const basePath = pathname.startsWith("/admin")
    ? "/admin"
    : "/lecturer";
  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQRDialog, setShowQRDialog] = useState(false);

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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!exam) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Không tìm thấy bài thi.
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* <BackToDashboardButton to="/lecturer" className="-ml-2" /> */}

        <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-card px-6 py-5 shadow-sm">
          <div>
            <Button
              variant="ghost"
              className="px-0"
              onClick={() => router.push(`${basePath}/exams`)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Quay lại danh sách bài thi
            </Button>
            <h1 className="text-2xl font-bold">{exam.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {exam.course?.code
                ? `${exam.course.code} - ${exam.course?.name || ""}`
                : exam.course?.name || "Chưa có khóa học"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadExam}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Làm mới
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQRDialog(true)}
            >
              <QrCode className="h-4 w-4 mr-1" />
              Hiện mã QR
            </Button>
            {(exam._count?.submissions ?? 0) > 0 ? (
              <Button asChild>
                <Link href={`${basePath}/exam/${exam.id}/results`}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Kết quả &amp; Chấm bài
                </Link>
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href={`${basePath}/question-bank`}>Mở ngân hàng câu hỏi</Link>
              </Button>
            )}
          </div>
        </div>

        {/* QR dialog */}
        <Dialog
          open={showQRDialog}
          onOpenChange={(open) => setShowQRDialog(open)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mã QR bài thi</DialogTitle>
              <DialogDescription>
                Hiển thị mã QR này trên màn hình để sinh viên quét
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 text-center">
              <img
                alt="Mã QR bài thi"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=720x720&data=${encodeURIComponent(`${typeof window !== "undefined" ? window.location.origin : ""}/student/exam-ready?examId=${exam?.id}`)}`}
                style={{ width: 560, height: 560 }}
              />
              <div className="mt-4">
                <Button asChild>
                  <Link href={`${basePath}/exam/${exam?.id}/qr`}>
                    Mở toàn màn hình
                  </Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader className="border-b bg-info/5">
            <CardTitle>Xem trước bài thi</CardTitle>
            <CardDescription>
              Rà soát câu hỏi, đáp án đúng và cấu hình trước khi sinh viên làm bài.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" /> {exam.duration} phút
              </span>
              <span className="inline-flex items-center gap-1">
                <BookOpen className="h-4 w-4" />{" "}
                {exam.examQuestions?.length || 0} câu hỏi
              </span>
              {timeline.start && (
                <Badge
                  variant={
                    timeline.isScheduled
                      ? "secondary"
                      : timeline.isEnded
                        ? "destructive"
                        : "default"
                  }
                >
                  {timeline.isScheduled
                    ? `Đã lên lịch ${format(timeline.start, "d MMM, HH:mm")}`
                    : timeline.isEnded
                      ? "Đã kết thúc"
                      : "Đang diễn ra"}
                </Badge>
              )}
            </div>

            {exam.description ? (
              <p className="text-sm text-muted-foreground">
                {exam.description}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b bg-muted/30">
            <CardTitle>Câu hỏi</CardTitle>
            <CardDescription>
              {timeline.isEnded
                ? "Bài thi đã kết thúc. Không thể chỉnh sửa trong màn hình này."
                : "Xem trước câu hỏi, đáp án đúng và chỉnh sửa từng câu nếu cần."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {!exam.examQuestions?.length ? (
              <div className="py-8 text-center text-muted-foreground">
                Bài thi chưa có câu hỏi.
              </div>
            ) : (
              <div className="space-y-4">
                {exam.examQuestions.map((eq, index) => {
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

                  return (
                    <div
                      key={eq.id}
                      className="overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-info text-info-foreground hover:bg-info">
                            Câu {index + 1}
                          </Badge>
                          <Badge variant="secondary">
                            {normalizeType(eq.question?.type)}
                          </Badge>
                        </div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Độ khó: {eq.question?.difficulty ?? "-"} | Điểm:{" "}
                          {eq.question?.points ?? "-"}
                        </div>
                      </div>

                      <div className="space-y-4 p-4">
                        {eq.question?.mediaType === "image" && eq.question?.mediaUrl ? (
                          <img
                            src={eq.question.mediaUrl}
                            alt="Hình ảnh minh họa câu hỏi"
                            className="max-h-80 w-full rounded-md border object-contain"
                          />
                        ) : eq.question?.mediaType === "audio" && eq.question?.mediaUrl ? (
                          <audio src={eq.question.mediaUrl} controls className="w-full" />
                        ) : null}
                        <FormattedText
                          text={eq.question?.content || "Chưa có nội dung"}
                          className="rounded-md border border-border/70 bg-background px-4 py-3 text-sm font-medium leading-6"
                        />

                        {rawType === "MATCHING" ? (
                          /* MATCHING: show pairs */
                          matchingPairs.length > 0 ? (
                            <div className="space-y-2">
                              {matchingPairs.map((pair, i) => {
                                const isCorrect = matchingAnswer.some(
                                  (a) => a.left === pair.left && a.right === pair.right,
                                );
                                return (
                                  <div key={i} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${isCorrect ? "border-success/35 bg-success/10 text-success" : "border-border bg-muted/20 text-foreground"}`}>
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">{i + 1}</span>
                                    <span className="font-medium min-w-0 break-words">{pair.left}</span>
                                    <span className="text-muted-foreground shrink-0">→</span>
                                    <span className="min-w-0 break-words">{pair.right}</span>
                                    {isCorrect ? <CheckCircle2 className="ml-auto h-4 w-4 shrink-0" /> : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null
                        ) : rawType === "ORDERING" ? (
                          /* ORDERING: show numbered items */
                          orderingItems.length > 0 ? (
                            <div className="space-y-2">
                              {orderingItems.map((item, i) => {
                                const isCorrect = orderingAnswer[i] === item;
                                return (
                                  <div key={i} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${isCorrect ? "border-success/35 bg-success/10 text-success" : "border-border bg-muted/20 text-foreground"}`}>
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">{i + 1}</span>
                                    <FormattedText text={item} className="min-w-0 break-words" />
                                    {isCorrect ? <CheckCircle2 className="ml-auto h-4 w-4 shrink-0" /> : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null
                        ) : rawType === "FIND_ERROR" ? (
                          /* FIND_ERROR: show code lines */
                          options.length > 0 ? (
                            <div className="space-y-1">
                              {options.map((option) => {
                                const isCorrect = correctKeys.has(option.key);
                                return (
                                  <div key={option.key} className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm font-mono ${isCorrect ? "border-destructive/35 bg-destructive/10 text-destructive" : "border-border bg-muted/20 text-foreground"}`}>
                                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCorrect ? "bg-destructive text-destructive-foreground" : "bg-background text-muted-foreground"}`}>{option.key}</span>
                                    <span className="min-w-0 break-words whitespace-pre-wrap leading-6">{option.value}</span>
                                    {isCorrect ? <span className="ml-auto shrink-0 text-xs font-medium text-destructive">Dòng lỗi</span> : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null
                        ) : options.length > 0 ? (
                          /* Default: show options A/B/C/D */
                          <div className="grid gap-2 sm:grid-cols-2">
                            {options.map((option) => {
                              const isCorrect = correctKeys.has(option.key);
                              return (
                                <div
                                  key={option.key}
                                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                                    isCorrect
                                      ? "border-success/35 bg-success/10 text-success"
                                      : "border-border bg-muted/20 text-foreground"
                                  }`}
                                >
                                  <span
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                      isCorrect
                                        ? "bg-success text-success-foreground"
                                        : "bg-background text-muted-foreground"
                                    }`}
                                  >
                                    {option.key}
                                  </span>
                                  <FormattedText text={option.value} className="min-w-0 break-words leading-6" />
                                  {isCorrect ? (
                                    <CheckCircle2 className="ml-auto h-4 w-4 shrink-0" />
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3">
                          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-success">
                            <CheckCircle2 className="h-4 w-4" />
                            Đáp án đúng
                          </div>
                          {rawType === "MATCHING" ? (
                            matchingAnswer.length > 0 ? (
                              <div className="space-y-1">
                                {matchingAnswer.map((pair, i) => (
                                  <p key={i} className="text-sm leading-6 text-foreground">
                                    <span className="font-medium">{pair.left}</span> → {pair.right}
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
                                    <span className="font-medium">{i + 1}.</span> {item}
                                  </p>
                                ))}
                              </div>
                            ) : orderingItems.length > 0 ? (
                              <div className="space-y-1">
                                {orderingItems.map((item, i) => (
                                  <p key={i} className="text-sm leading-6 text-foreground">
                                    <span className="font-medium">{i + 1}.</span> {item}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm leading-6 text-foreground break-words">{correctAnswerText}</p>
                            )
                          ) : rawType === "FIND_ERROR" ? (
                            <p className="text-sm leading-6 text-foreground">
                              Dòng chứa lỗi: <span className="font-bold text-destructive">{correctAnswerText}</span>
                            </p>
                          ) : (
                            <p className="text-sm leading-6 text-foreground break-words">
                              {correctAnswerText}
                            </p>
                          )}
                        </div>

                        {eq.question?.explanation ? (
                          <div className="rounded-md border border-info/25 bg-info/5 px-4 py-3">
                            <p className="text-xs font-semibold uppercase text-info">
                              Giải thích / rubric
                            </p>
                            <p className="mt-1 text-sm leading-6 text-foreground break-words">
                              {eq.question.explanation}
                            </p>
                          </div>
                        ) : null}

                        <Separator />

                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={timeline.isEnded}
                            asChild
                          >
                            <Link
                              href={`${basePath}/question-editor?id=${eq.question.id}`}
                            >
                              <PencilLine className="h-4 w-4 mr-1" />
                              Sửa câu hỏi
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}



