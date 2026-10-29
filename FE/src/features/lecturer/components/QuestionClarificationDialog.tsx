"use client";

import { useState } from "react";
import { Sparkles, HelpCircle, Check, ArrowRight, X, BrainCircuit, Target, ShieldAlert, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ClarificationConfig {
  bloomLevel: string;
  style: string;
  distractorDepth: string;
  timeEstimate: string;
  customNotes: string;
}

interface Props {
  open: boolean;
  prompt: string;
  questionCount: number;
  courseName?: string;
  onClose: () => void;
  onConfirm: (config: ClarificationConfig) => void;
  onSkip: () => void;
}

const bloomOptions = [
  { id: "UNDERSTAND", label: "Nhận biết & Thông hiểu", desc: "Khái niệm, định nghĩa, ghi nhớ bản chất" },
  { id: "APPLY", label: "Vận dụng & Phân tích", desc: "Giải quyết vấn đề, phân tích ca thực tế" },
  { id: "EVALUATE", label: "Đánh giá & So sánh", desc: "So sánh các giải pháp, phán đoán tối ưu" },
];

const styleOptions = [
  { id: "CONCEPTUAL", label: "Lý thuyết trực diện", desc: "Hỏi đáp nhanh nguyên lý, đặc điểm" },
  { id: "SCENARIO", label: "Tình huống thực tế (Case study)", desc: "Kịch bản bài toán thực tế doanh nghiệp" },
  { id: "CODE_ANALYSIS", label: "Đoạn mã & Debugging", desc: "Cho đoạn code/mã giả, tìm lỗi hoặc kết quả" },
];

const distractorOptions = [
  { id: "DIRECT", label: "Rõ ràng", desc: "Phương án nhiễu dễ phân biệt" },
  { id: "COMMON_PITFALLS", label: "Bẫy logic phổ biến", desc: "Cài cắm các ngộ nhận sinh viên hay mắc" },
  { id: "SUBTLE", label: "Tinh vi & Chặt chẽ", desc: "Nhiều phương án gần đúng, cần hiểu sâu" },
];

const timeOptions = [
  { id: "SHORT", label: "< 45 giây", desc: "Trắc nghiệm nhanh đầu giờ" },
  { id: "MEDIUM", label: "1 - 2 phút", desc: "Tiêu chuẩn bài thi định kỳ" },
  { id: "LONG", label: "> 3 phút", desc: "Suy luận tính toán phức tạp" },
];

export function QuestionClarificationDialog({
  open,
  prompt,
  questionCount,
  courseName,
  onClose,
  onConfirm,
  onSkip,
}: Props) {
  const [bloomLevel, setBloomLevel] = useState("APPLY");
  const [style, setStyle] = useState("SCENARIO");
  const [distractorDepth, setDistractorDepth] = useState("COMMON_PITFALLS");
  const [timeEstimate, setTimeEstimate] = useState("MEDIUM");
  const [customNotes, setCustomNotes] = useState("");

  const handleConfirm = () => {
    onConfirm({
      bloomLevel,
      style,
      distractorDepth,
      timeEstimate,
      customNotes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-7">
        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BrainCircuit className="h-4 w-4" />
              </div>
              <Badge variant="outline" className="text-xs font-semibold text-primary border-primary/30">
                Grill-me Mode
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {questionCount > 1 ? `Sinh ${questionCount} câu hỏi` : "Sinh 1 câu hỏi"}
            </span>
          </div>
          <DialogTitle className="text-lg sm:text-xl font-bold">
            Làm rõ yêu cầu sư phạm trước khi tạo câu hỏi
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
            Chọn nhanh các định hướng sư phạm để AI tạo câu hỏi sát với chuẩn đầu ra môn học của bạn nhất.
          </DialogDescription>
        </DialogHeader>

        {/* Prompt summary preview */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Chủ đề gốc:</span>
            {courseName && <span className="font-medium text-primary">{courseName}</span>}
          </div>
          <p className="text-sm font-medium text-foreground line-clamp-2 italic">
            "{prompt}"
          </p>
        </div>

        <div className="space-y-5 pt-2">
          {/* 1. Bloom Level */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Mức độ nhận thức (Thang Bloom)
              </Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {bloomOptions.map((opt) => {
                const isSelected = bloomLevel === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBloomLevel(opt.id)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground shadow-sm"
                        : "border-border/70 bg-card hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold leading-tight">{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                    <span className="text-[11px] mt-1 leading-normal opacity-80">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Format / Style */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Định dạng & Ngữ cảnh bài toán
              </Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {styleOptions.map((opt) => {
                const isSelected = style === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStyle(opt.id)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground shadow-sm"
                        : "border-border/70 bg-card hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold leading-tight">{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                    <span className="text-[11px] mt-1 leading-normal opacity-80">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Distractors */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3. Độ tinh vi của các phương án nhiễu (Bẫy câu hỏi)
              </Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {distractorOptions.map((opt) => {
                const isSelected = distractorDepth === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDistractorDepth(opt.id)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground shadow-sm"
                        : "border-border/70 bg-card hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold leading-tight">{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                    <span className="text-[11px] mt-1 leading-normal opacity-80">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Time estimate */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                4. Thời gian làm bài dự kiến mỗi câu
              </Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {timeOptions.map((opt) => {
                const isSelected = timeEstimate === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTimeEstimate(opt.id)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground shadow-sm"
                        : "border-border/70 bg-card hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold leading-tight">{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                    <span className="text-[11px] mt-1 leading-normal opacity-80">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Custom notes */}
          <div className="space-y-1.5">
            <Label htmlFor="custom-notes" className="text-xs font-medium text-muted-foreground">
              Ghi chú bổ sung cho AI (không bắt buộc)
            </Label>
            <Textarea
              id="custom-notes"
              placeholder="Ví dụ: Tập trung vào tầng Giao vận TCP/UDP, tránh hỏi về mô hình OSI 7 tầng..."
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              className="text-xs sm:text-sm h-18 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            className="sm:mr-auto text-muted-foreground text-xs hover:text-foreground"
          >
            Bỏ qua & Tạo ngay
          </Button>
          <Button type="button" variant="outline" onClick={onClose} size="sm">
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            className="gap-2 shadow-sm font-semibold"
            size="sm"
          >
            <Sparkles className="h-4 w-4" />
            Xác nhận & Bắt đầu tạo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
