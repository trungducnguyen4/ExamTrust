"use client";

import { CheckCircle2, ChevronDown, ChevronUp, GripVertical, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { QuestionOption } from "../question-editor-types";
import { QUESTION_LIMITS, WARNING_THRESHOLD } from "../question-validation.constants";
import { lineContentCounterText } from "../question-validation";

type Props = {
  questionType: string;
  options: QuestionOption[];
  multipleAnswers: boolean;
  tfAnswer: "true" | "false";
  essayRubric: string;
  pinnedOptions: Set<string>;
  onMultipleAnswersChange: (value: boolean) => void;
  onTfAnswerChange: (value: "true" | "false") => void;
  onEssayRubricChange: (value: string) => void;
  onAddOption: () => void;
  onRemoveOption: (id: string) => void;
  onUpdateOption: (id: string, value: string) => void;
  onReplaceOptions: (options: QuestionOption[]) => void;
  onUpdateMatch: (id: string, value: string) => void;
  onMoveOption: (id: string, direction: "up" | "down") => void;
  onToggleCorrect: (id: string) => void;
  onTogglePinned: (id: string) => void;
};

const answerTitles: Record<string, string> = {
  multiple_choice: "Các phương án trả lời",
  true_false: "Đáp án đúng",
  essay: "Tiêu chí chấm điểm",
  matching: "Các cặp ghép đôi",
  find_error: "Các dòng mã nguồn",
  ordering: "Các phần tử theo thứ tự",
};

export function FillBlankGuide() {
  return (
    <div className="mb-3 rounded-md border border-muted/30 bg-muted/30 p-3">
      <p className="text-sm font-medium">Cách tạo chỗ trống</p>
      <p className="mt-1 text-xs text-muted-foreground">Dùng hai dấu ngoặc vuông, ví dụ: Thủ đô Pháp là [[Paris]].</p>
      <p className="mt-1 text-xs text-muted-foreground">Sinh viên sẽ điền phần nằm trong ngoặc khi làm bài.</p>
    </div>
  );
}

export function QuestionAnswerEditor({
  questionType, options, multipleAnswers, tfAnswer, essayRubric,
  pinnedOptions, onMultipleAnswersChange, onTfAnswerChange,
  onEssayRubricChange,
  onAddOption, onRemoveOption, onUpdateOption, onUpdateMatch, onMoveOption,
  onToggleCorrect, onTogglePinned, onReplaceOptions,
}: Props) {
  if (questionType === "fill_blank") return null;
  const isOptionType = ["multiple_choice", "ordering", "matching", "find_error"].includes(questionType);
  const findErrorEditorTitle = questionType === "find_error" ? "Nội dung theo dòng" : null;
  const title = answerTitles[questionType] ?? "Đáp án";

  return (
    <Card>
      <CardHeader className="px-3 pb-2 pt-3 sm:px-6 sm:pb-3 sm:pt-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm sm:text-base">{findErrorEditorTitle || title}</CardTitle>
          {isOptionType && questionType !== "find_error" && options.length < 8 ? (
            <Button variant="outline" size="sm" onClick={onAddOption} className="gap-1 text-xs">
              <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Thêm
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3 sm:space-y-3 sm:px-6 sm:pb-6">
        {questionType === "multiple_choice" ? (
          <div className="mb-2">
            <div className="flex items-center gap-3">
              <Label className="text-sm">Cho phép nhiều đáp án đúng</Label>
              <Switch checked={multipleAnswers} onCheckedChange={onMultipleAnswersChange} />
            </div>
            {multipleAnswers ? <p className="mt-2 text-xs italic text-muted-foreground">Sinh viên có thể chọn nhiều đáp án đúng.</p> : null}
          </div>
        ) : null}

        {questionType === "find_error" ? (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 sm:p-3">
            Nhập mỗi dòng mã nguồn trên một hàng, sau đó chọn vòng tròn bên cạnh dòng có lỗi.
          </div>
        ) : null}

        {questionType === "find_error" ? <FindErrorLineEditor options={options} onReplaceOptions={onReplaceOptions} /> : null}

        {isOptionType && questionType !== "find_error" ? options.map((option, index) => (
          <OptionRow
            key={option.id}
            questionType={questionType}
            option={option}
            index={index}
            optionCount={options.length}
            pinned={pinnedOptions.has(option.id)}
            onRemove={onRemoveOption}
            onUpdate={onUpdateOption}
            onUpdateMatch={onUpdateMatch}
            onMove={onMoveOption}
            onToggleCorrect={onToggleCorrect}
            onTogglePinned={onTogglePinned}
          />
        )) : null}

        {questionType === "true_false" ? (
          <div className="flex gap-2 sm:gap-4" role="radiogroup" aria-label="Đáp án đúng">
            {(["true", "false"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                role="radio"
                aria-checked={tfAnswer === value}
                variant={tfAnswer === value ? "default" : "outline"}
                onClick={() => onTfAnswerChange(value)}
                onKeyDown={(event) => {
                  // Native <button> already activates on Space/Enter, but this
                  // is made explicit so the toggle keeps working even if some
                  // ancestor element's own key handling swallows the event
                  // before it reaches native activation.
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    onTfAnswerChange(value);
                  }
                }}
                size="sm"
                className="flex-1 text-sm"
              >
                {value === "true" ? "Đúng" : "Sai"}
              </Button>
            ))}
          </div>
        ) : null}

        {questionType === "essay" ? (
          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Rubric / tiêu chí chấm điểm</Label>
              <RichTextEditor
                placeholder="Mô tả tiêu chí, ý chính cần có..."
                value={essayRubric}
                onChange={(val) => onEssayRubricChange(val)}
                rows={4}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FindErrorLineEditor({ options, onReplaceOptions }: { options: QuestionOption[]; onReplaceOptions: (options: QuestionOption[]) => void }) {
  const lines = options.filter((option) => option.text.trim());
  const updateLines = (value: string) => {
    const parsed = value.split(/\r?\n/).map((line) => line.trim());
    const next = parsed.map((text, index) => ({ id: String.fromCharCode(65 + index), text, isCorrect: options[index]?.isCorrect || false }));
    while (next.length < 2) next.push({ id: String.fromCharCode(65 + next.length), text: "", isCorrect: false });
    onReplaceOptions(next);
  };
  const toggleLine = (id: string) => onReplaceOptions(options.map((option) => option.id === id ? { ...option, isCorrect: !option.isCorrect } : option));

  const textareaValue = options.map((option) => option.text).join("\n");
  const lineCount = Math.max(lines.length, textareaValue.split("\n").length);

  return <div className="space-y-3">
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Nhập code theo từng dòng. Nhấn vào số dòng bên trái để đánh dấu dòng có lỗi (màu đỏ).
    </div>
    <div className="space-y-1">
      <Label>Nội dung theo dòng</Label>
      <div className="relative rounded-lg border bg-card overflow-hidden">
        <div className="flex">
          {/* Line numbers + error toggles */}
          <div className="shrink-0 border-r bg-muted/30 py-2 select-none">
            {Array.from({ length: Math.max(lineCount, 1) }).map((_, idx) => {
              const opt = options[idx];
              const isError = opt?.isCorrect || false;
              const hasText = opt?.text?.trim();
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => opt?.id && hasText ? toggleLine(opt.id) : undefined}
                  disabled={!hasText}
                  className={`flex items-center justify-center w-10 h-6 text-xs font-mono transition-all duration-150
                    ${hasText ? "cursor-pointer hover:bg-red-100" : "cursor-default"}
                    ${isError ? "bg-red-500 text-white font-bold" : "text-muted-foreground hover:text-red-600"}`}
                  title={hasText ? (isError ? "Dòng có lỗi — nhấn để bỏ chọn" : "Nhấn để đánh dấu dòng có lỗi") : ""}
                >
                  {isError ? "✕" : idx + 1}
                </button>
              );
            })}
          </div>
          {/* Textarea */}
          <Textarea
            value={textareaValue}
            onChange={(event) => updateLines(event.target.value)}
            rows={Math.max(6, lineCount + 1)}
            placeholder={"public class Main {\n  public static void main(String[] args) {\n    int x = 1\n  }\n}"}
            className="flex-1 border-0 rounded-none resize-y font-mono text-sm leading-6 py-2 focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{ lineHeight: "1.5rem" }}
          />
        </div>
      </div>
      {(() => {
        const raw = options.map((o) => o.text).join("\n");
        const counter = lineContentCounterText(raw);
        return (
          <p className={`text-xs ${counter.charsWarn ? (raw.length > QUESTION_LIMITS.lineContent.maxTotalLength ? "text-destructive" : "text-amber-600") : "text-muted-foreground"}`}>
            {counter.chars} &middot; {counter.lines}
            {" "}&middot; Cần ít nhất {QUESTION_LIMITS.lineContent.minLines} dòng không trống
          </p>
        );
      })()}
    </div>
    {lines.length > 0 && !lines.some((option) => option.isCorrect) && (
      <p className="text-sm text-destructive">Hãy chọn ít nhất một dòng có lỗi bằng cách nhấn vào số dòng bên trái.</p>
    )}
    {lines.length > 0 && lines.some((option) => option.isCorrect) && (
      <p className="text-xs text-green-600">
        Đã đánh dấu {lines.filter((option) => option.isCorrect).length} dòng lỗi: {" "}
        {lines.filter((option) => option.isCorrect).map((option, i) => (
          <span key={option.id} className="font-medium">
            {i > 0 && ", "}Dòng {options.indexOf(option) + 1}
          </span>
        ))}
      </p>
    )}
  </div>;
}

type OptionRowProps = {
  questionType: string;
  option: QuestionOption;
  index: number;
  optionCount: number;
  pinned: boolean;
  onRemove: (id: string) => void;
  onUpdate: (id: string, value: string) => void;
  onUpdateMatch: (id: string, value: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onToggleCorrect: (id: string) => void;
  onTogglePinned: (id: string) => void;
};

function OptionRow({ questionType, option, index, optionCount, pinned, onRemove, onUpdate, onUpdateMatch, onMove, onToggleCorrect, onTogglePinned }: OptionRowProps) {
  if (questionType === "multiple_choice") {
    return (
      <div className="rounded-lg border border-border/80 bg-muted/10 p-2.5 sm:p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CorrectToggle questionType={questionType} option={option} onToggle={onToggleCorrect} />
            <span className="text-xs font-semibold text-foreground">
              Phương án {option.id}
              {option.isCorrect ? (
                <span className="ml-2 text-xs font-medium text-green-600 dark:text-green-400">
                  (Đáp án đúng)
                </span>
              ) : null}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={pinned ? "h-7 w-7 p-0 text-amber-600" : "h-7 w-7 p-0 text-muted-foreground"}
                    onClick={() => onTogglePinned(option.id)}
                  >
                    {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{pinned ? "Đáp án được ghim, không xáo trộn" : "Ghim để không xáo trộn"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
              onClick={() => onRemove(option.id)}
              disabled={optionCount <= 2}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <RichTextEditor
          compact
          rows={2}
          placeholder={`Nhập nội dung phương án ${option.id}...`}
          value={option.text}
          onChange={(val) => onUpdate(option.id, val)}
        />
      </div>
    );
  }

  const isMatching = questionType === "matching";
  const isOrdering = questionType === "ordering";
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {isMatching ? <GripVertical className="h-4 w-4 shrink-0 cursor-move text-muted-foreground" /> : null}
      {isOrdering ? <div className="flex shrink-0 flex-col gap-0.5"><Button type="button" variant="ghost" size="sm" className="h-4 w-6 p-0" disabled={index === 0} onClick={() => onMove(option.id, "up")}><ChevronUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="sm" className="h-4 w-6 p-0" disabled={index === optionCount - 1} onClick={() => onMove(option.id, "down")}><ChevronDown className="h-3.5 w-3.5" /></Button></div> : null}
      {questionType === "find_error" ? <CorrectToggle questionType={questionType} option={option} onToggle={onToggleCorrect} /> : null}
      {isOrdering ? <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</div> : null}
      <Input placeholder={isMatching ? "Khái niệm..." : questionType === "find_error" ? "Dòng mã nguồn..." : `Phương án ${option.id}`} value={option.text} onChange={(event) => onUpdate(option.id, event.target.value)} className={`min-w-0 flex-1 text-sm ${questionType === "find_error" ? "font-mono" : ""}`} />
      {isMatching ? <><span className="shrink-0 text-sm text-muted-foreground">→</span><Input placeholder="Ghép với..." value={option.match || ""} onChange={(event) => onUpdateMatch(option.id, event.target.value)} className="min-w-0 flex-1 text-sm" /></> : null}
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onRemove(option.id)} disabled={optionCount <= 2}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

function CorrectToggle({ questionType, option, onToggle }: { questionType: string; option: QuestionOption; onToggle: (id: string) => void }) {
  const isError = questionType === "find_error";
  return (
    <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" onClick={() => onToggle(option.id)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium ${option.isCorrect ? isError ? "border-destructive bg-destructive/10 text-destructive" : "border-green-500 bg-green-100 text-green-700" : "border-gray-300 text-muted-foreground"}`}>{option.isCorrect ? <CheckCircle2 className="h-4 w-4" /> : option.id}</button></TooltipTrigger><TooltipContent>{option.isCorrect ? "Đáp án đúng" : isError ? "Đánh dấu dòng có lỗi" : "Đánh dấu đáp án đúng"}</TooltipContent></Tooltip></TooltipProvider>
  );
}
