"use client";

import { useState } from "react";
import { Check, CheckCircle2, ChevronRight, Copy, Database, FileText, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { difficultyLabel } from "../question-bank-utils";

export interface BatchGeneratedQuestion {
  id?: string;
  content: string;
  type: string;
  difficulty?: number;
  explanation?: string;
  points?: number;
  options?: Record<string, string> | null;
  correctAnswer?: Record<string, string> | { answer?: string; answers?: string[] } | null;
  pairs?: Array<{ left?: string; right?: string }> | null;
  items?: string[] | null;
}

interface Props {
  open: boolean;
  questions: BatchGeneratedQuestion[];
  courseName?: string;
  onClose: () => void;
  onApplySingle: (question: BatchGeneratedQuestion) => void;
  onSaveToBank: (question: BatchGeneratedQuestion) => Promise<void>;
  onSaveAllToBank: (questions: BatchGeneratedQuestion[]) => Promise<void>;
}

const typeLabels: Record<string, string> = {
  MULTIPLE_CHOICE: "Trắc nghiệm nhiều lựa chọn",
  TRUE_FALSE: "Đúng / Sai",
  ESSAY: "Tự luận",
  FILL_IN_BLANK: "Điền khuyết",
  MATCHING: "Nối cặp",
  ORDERING: "Sắp xếp thứ tự",
  FIND_ERROR: "Tìm lỗi sai",
};

export function QuestionBatchReviewDialog({
  open,
  questions,
  courseName,
  onClose,
  onApplySingle,
  onSaveToBank,
  onSaveAllToBank,
}: Props) {
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());

  const handleSaveSingle = async (question: BatchGeneratedQuestion, index: number) => {
    try {
      setSavingIndex(index);
      await onSaveToBank(question);
      setSavedIndices((prev) => new Set([...prev, index]));
      toast.success(`Đã lưu câu hỏi #${index + 1} vào ngân hàng!`);
    } catch (err: any) {
      toast.error(`Lưu câu hỏi thất bại: ${err?.message || "Lỗi không xác định"}`);
    } finally {
      setSavingIndex(null);
    }
  };

  const handleSaveAll = async () => {
    try {
      setSavingAll(true);
      await onSaveAllToBank(questions);
      setSavedIndices(new Set(questions.map((_, i) => i)));
      toast.success(`Đã lưu toàn bộ ${questions.length} câu hỏi vào ngân hàng câu hỏi!`);
    } catch (err: any) {
      toast.error(`Lưu toàn bộ thất bại: ${err?.message || "Lỗi không xác định"}`);
    } finally {
      setSavingAll(false);
    }
  };

  const getCorrectAnswerText = (q: BatchGeneratedQuestion) => {
    if (!q.correctAnswer) return "";
    if (typeof q.correctAnswer === "string") return q.correctAnswer;
    if ("answer" in q.correctAnswer && q.correctAnswer.answer) return String(q.correctAnswer.answer);
    if ("answers" in q.correctAnswer && Array.isArray(q.correctAnswer.answers)) return q.correctAnswer.answers.join(", ");
    return "";
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 sm:p-7">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <DialogTitle className="text-lg sm:text-xl font-bold">
                Bộ câu hỏi AI vừa tạo ({questions.length} câu)
              </DialogTitle>
            </div>
            {courseName && (
              <Badge variant="outline" className="font-medium text-xs">
                {courseName}
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-1">
            Xem lại các câu hỏi vừa sinh. Bạn có thể chèn một câu vào form soạn thảo hiện tại hoặc lưu tất cả vào Ngân hàng câu hỏi.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Questions List */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
          {questions.map((q, idx) => {
            const isSaved = savedIndices.has(idx);
            const isSavingThis = savingIndex === idx;
            const diffInfo = typeof q.difficulty === "number" ? difficultyLabel(q.difficulty) : null;
            const correctKey = getCorrectAnswerText(q);

            return (
              <Card
                key={idx}
                className={`transition-all border ${
                  isSaved ? "bg-muted/30 border-green-500/30" : "bg-card border-border/70 hover:border-primary/30"
                }`}
              >
                <CardHeader className="py-3 px-4 sm:px-5 flex flex-row items-center justify-between gap-3 bg-muted/20 border-b">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                      #{idx + 1}
                    </span>
                    <Badge variant="secondary" className="text-[11px] font-medium">
                      {typeLabels[q.type] || q.type}
                    </Badge>
                    {diffInfo && (
                      <Badge variant="outline" className={`text-[11px] font-medium ${diffInfo.color}`}>
                        {diffInfo.text}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onApplySingle(q);
                        onClose();
                        toast.success(`Đã áp dụng câu hỏi #${idx + 1} vào form soạn thảo!`);
                      }}
                      className="h-8 gap-1.5 text-xs rounded-lg"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Điền vào form
                    </Button>
                    <Button
                      type="button"
                      variant={isSaved ? "secondary" : "default"}
                      size="sm"
                      disabled={isSaved || isSavingThis || savingAll}
                      onClick={() => handleSaveSingle(q, idx)}
                      className="h-8 gap-1.5 text-xs rounded-lg"
                    >
                      {isSavingThis ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isSaved ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Database className="h-3.5 w-3.5" />
                      )}
                      {isSaved ? "Đã lưu" : "Lưu vào kho"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-5 space-y-3">
                  {/* Question Stem */}
                  <div className="text-sm font-semibold text-foreground leading-relaxed whitespace-pre-wrap">
                    {q.content}
                  </div>

                  {/* Options if Multiple Choice / True False */}
                  {q.options && typeof q.options === "object" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {Object.entries(q.options).map(([key, text]) => {
                        const isCorrect = correctKey.includes(key);
                        return (
                          <div
                            key={key}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                              isCorrect
                                ? "border-green-500/40 bg-green-500/10 text-green-950 dark:text-green-200 font-medium"
                                : "border-border/60 bg-muted/10 text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                isCorrect
                                  ? "bg-green-600 text-white"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {key}
                            </span>
                            <span className="flex-1 leading-tight pt-0.5">{text}</span>
                            {isCorrect && (
                              <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1 border border-border/50">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        💡 Giải thích:
                      </span>
                      <p className="leading-relaxed">{q.explanation}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} size="sm">
            Đóng
          </Button>
          <Button
            type="button"
            onClick={handleSaveAll}
            disabled={savingAll || savedIndices.size === questions.length}
            className="gap-2 font-semibold shadow-sm"
            size="sm"
          >
            {savingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            Lưu tất cả {questions.length} câu vào ngân hàng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
