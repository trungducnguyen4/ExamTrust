"use client";

import type { Dispatch, SetStateAction } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, GripVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormattedText } from "@/components/ui/formatted-text";
import type { AnswerMap, FindErrorQ, FillBlankQ, MatchingQ, MultiChoiceQ, OrderingQ, Question, ShortAnswerQ, SingleChoiceQ, TrueFalseQ } from "./exam-taking-model";

// ─── Question sub-renderers ────────────────────────────────────────

/** 1. Single Choice (radio-style) */
function SingleChoiceRenderer({
  q,
  answers,
  setAnswer,
}: {
  q: SingleChoiceQ;
  answers: AnswerMap;
  setAnswer: (id: number, v: unknown) => void;
}) {
  const selected = answers[q.id] as number | undefined;
  return (
    <div className="space-y-3">
      <FormattedText
        text={q.content}
        className="text-sm text-muted-foreground leading-relaxed break-words"
      />
      {q.options.map((opt, idx) => {
        const isSel = selected === idx;
        return (
          <button
            key={idx}
            onClick={() => setAnswer(q.id, idx)}
            className={`w-full text-left border rounded-lg px-4 py-3 flex items-center gap-3 transition-all
              ${
                isSel
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-card hover:border-primary/30 hover:bg-secondary/30"
              }`}
          >
            <span
              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                isSel
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {String.fromCharCode(65 + idx)}
            </span>
            <FormattedText text={opt} className="min-w-0 break-words text-sm" />
          </button>
        );
      })}
    </div>
  );
}

/** 2. Multiple Choice (checkboxes, select all that apply) */
function MultiChoiceRenderer({
  q,
  answers,
  setAnswer,
}: {
  q: MultiChoiceQ;
  answers: AnswerMap;
  setAnswer: (id: number, v: unknown) => void;
}) {
  const selected = (answers[q.id] as number[] | undefined) ?? [];
  const toggle = (idx: number) => {
    const next = selected.includes(idx)
      ? selected.filter((i) => i !== idx)
      : [...selected, idx];
    setAnswer(q.id, next);
  };
  return (
    <div className="space-y-3">
      <FormattedText
        text={q.content}
        className="text-sm text-muted-foreground leading-relaxed break-words"
      />
      <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-violet-800">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Select all that apply
      </div>
      {q.options.map((opt, idx) => {
        const isSel = selected.includes(idx);
        return (
          <div
            key={idx}
            onClick={() => toggle(idx)}
            className={`cursor-pointer w-full flex items-center gap-3 border rounded-lg px-4 py-3 transition-all
              ${
                isSel
                  ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300"
                  : "border-border bg-card hover:bg-secondary/30"
              }`}
          >
            <Checkbox
              checked={isSel}
              onCheckedChange={() => {}} // Controlled by div onClick
              className="pointer-events-none"
            />
            <FormattedText text={opt} className="min-w-0 break-words text-sm" />
          </div>
        );
      })}
    </div>
  );
}

/** 3. True / False */
function TrueFalseRenderer({
  q,
  answers,
  setAnswer,
}: {
  q: TrueFalseQ;
  answers: AnswerMap;
  setAnswer: (id: number, v: unknown) => void;
}) {
  const selected = answers[q.id] as boolean | undefined;
  return (
    <div>
      <FormattedText
        text={q.content}
        className="text-sm text-muted-foreground leading-relaxed mb-6 break-words"
      />
      <div className="flex gap-4">
        {([true, false] as const).map((val) => {
          const isSel = selected === val;
          return (
            <button
              key={String(val)}
              onClick={() => setAnswer(q.id, val)}
              className={`flex-1 py-5 rounded-xl border-2 font-semibold text-sm transition-all
                ${
                  isSel
                    ? val
                      ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950"
                      : "border-red-500 bg-red-50 text-red-700 dark:bg-red-950"
                    : "border-border bg-card hover:bg-secondary/30"
                }`}
            >
              {val ? "✓  True" : "✗  False"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 4. Fill in the Blank */
function FillBlankRenderer({
  q,
  answers,
  setAnswer,
}: {
  q: FillBlankQ;
  answers: AnswerMap;
  setAnswer: (id: number, v: unknown) => void;
}) {
  const vals =
    (answers[q.id] as string[] | undefined) ?? Array<string>(q.blanks).fill("");
  const setVal = (i: number, v: string) => {
    const next = [...vals];
    next[i] = v;
    setAnswer(q.id, next);
  };

  // Split template on {{n}} markers and render inline inputs
  const parts = q.template.split(/(\{\{\d+\}\})/g);
  let blankIdx = 0;
  const elements = parts.map((part, i) => {
    if (/^\{\{\d+\}\}$/.test(part)) {
      const idx = blankIdx++;
      return (
        <input
          key={i}
          value={vals[idx] ?? ""}
          onChange={(e) => setVal(idx, e.target.value)}
          placeholder={`(${idx + 1})`}
          className="inline-block border-b-2 border-primary bg-transparent text-primary font-semibold text-sm focus:outline-none mx-1 w-28 text-center"
        />
      );
    }
    return (
      <span key={i} className="inline-block text-sm leading-relaxed text-foreground break-words align-baseline">
        <FormattedText text={part} />
      </span>
    );
  });

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Fill each blank with the appropriate term.
      </p>
      <div className="bg-muted/40 border rounded-lg p-4 leading-[2.5]">
        {elements}
      </div>
      <div
        className={`mt-4 grid gap-3 ${q.blanks <= 2 ? "grid-cols-2" : "grid-cols-3"}`}
      >
        {Array(q.blanks)
          .fill(null)
          .map((_, i) => (
            <div key={i}>
              <label className="text-xs text-muted-foreground mb-1 block">
                Chỗ trống {i + 1}
              </label>
              <Input
                value={vals[i] ?? ""}
                onChange={(e) => setVal(i, e.target.value)}
                placeholder={`Đáp án ${i + 1}…`}
                className="text-sm"
              />
            </div>
          ))}
      </div>
    </div>
  );
}

/** 5. Matching */
function MatchingRenderer({
  q,
  answers,
  setAnswer,
}: {
  q: MatchingQ;
  answers: AnswerMap;
  setAnswer: (id: number, v: unknown) => void;
}) {
  const val = (answers[q.id] as Record<number, string> | undefined) ?? {};
  const setMatch = (leftIdx: number, rightVal: string) =>
    setAnswer(q.id, { ...val, [leftIdx]: rightVal });

  return (
    <div className="space-y-4">
      <FormattedText
        text={q.content}
        className="text-sm text-muted-foreground leading-relaxed break-words"
      />
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Cột trái
          </div>
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
            Ghép với
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {q.left.map((leftItem, i) => (
            <div
              key={`${leftItem}-${i}`}
              className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] sm:items-center"
            >
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-3 shadow-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  {i + 1}
                </span>
                <span className="min-w-0 break-words text-sm font-medium text-slate-900">
                  {leftItem}
                </span>
              </div>
              <div className="min-w-0">
                <Select
                  value={val[i] ?? ""}
                  onValueChange={(v) => setMatch(i, v)}
                >
                  <SelectTrigger
                    className={`h-12 text-sm ${
                      val[i]
                        ? "border-violet-500 bg-violet-50 text-slate-900 ring-1 ring-violet-200"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    <SelectValue placeholder="Chọn đáp án ghép" />
                  </SelectTrigger>
                  <SelectContent>
                    {q.right.map((rightItem, j) => (
                      <SelectItem key={j} value={rightItem} className="text-sm">
                        {rightItem}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
/** 6. Find the Error */
function FindErrorRenderer({
  q,
  answers,
  setAnswer,
}: {
  q: FindErrorQ;
  answers: AnswerMap;
  setAnswer: (id: number, v: unknown) => void;
}) {
  const selected = (answers[q.id] as string[] | undefined) ?? [];
  const toggle = (label: string) => setAnswer(q.id, selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label]);
  return (
    <div>
      <FormattedText
        text={q.content}
        className="text-sm text-muted-foreground leading-relaxed mb-3 break-words"
      />
      <p className="text-xs font-medium text-primary mb-3">
        Nhấp vào dòng bạn cho là có chứa lỗi:
      </p>
      <div className="rounded-lg border bg-card">
        {q.segments.map((seg, idx) => {
          const isSel = selected.includes(seg.label);
          return (
            <button
              key={seg.label}
              onClick={() => toggle(seg.label)}
              className={`group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-all duration-150 cursor-pointer
                first:rounded-t-lg last:rounded-b-lg
                ${idx < q.segments.length - 1 ? "border-b" : ""}
                ${isSel
                  ? "bg-red-50 border-red-200 text-red-800 ring-1 ring-red-200"
                  : "border-transparent text-foreground hover:bg-red-50/50 hover:border-red-200/50 hover:text-red-800"}`}
            >
              <span
                className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold mt-0.5 transition-all duration-150
                ${isSel
                  ? "bg-red-500 text-white"
                  : "bg-secondary text-muted-foreground border border-gray-300 group-hover:border-red-400 group-hover:bg-red-100"}`}
              >
                {isSel ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </span>
              <span className="min-w-0 break-words leading-relaxed text-sm font-mono">{seg.code}</span>
              {!isSel && (
                <span className="ml-auto shrink-0 self-center text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  Nhấn để chọn
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-amber-600 mt-2 font-medium">
          Đã chọn: Dòng <strong>{selected.join(", ")}</strong>
        </p>
      )}
    </div>
  );
}

/** 7. Ordering / Sequencing */
function OrderingRenderer({
  q,
  orderState,
  setOrderState,
  setAnswer,
}: {
  q: OrderingQ;
  orderState: Record<number, string[]>;
  setOrderState: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  setAnswer: (id: number, value: unknown) => void;
}) {
  const items = orderState[q.id] ?? q.items;
  const move = (idx: number, dir: "up" | "down") => {
    const next = [...items];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setOrderState((prev) => ({ ...prev, [q.id]: next }));
    setAnswer(q.id, next);
  };
  return (
    <div>
      <FormattedText
        text={q.content}
        className="text-sm text-muted-foreground leading-relaxed mb-3 break-words"
      />
      <p className="text-xs font-medium text-primary mb-3">
        Dùng các nút mũi tên để sắp xếp các mục theo đúng thứ tự:
      </p>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={item}
            className="flex items-center gap-3 border rounded-lg px-4 py-3 bg-card hover:bg-secondary/20 transition-colors"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            <FormattedText text={item} className="min-w-0 flex-1 break-words text-sm" />
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                onClick={() => move(idx, "up")}
                disabled={idx === 0}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-secondary disabled:opacity-25 transition-colors"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => move(idx, "down")}
                disabled={idx === items.length - 1}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-secondary disabled:opacity-25 transition-colors"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground font-mono w-5 text-right">
              {idx + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 8. Short Answer / Essay */
function ShortAnswerRenderer({
  q,
  answers,
  setAnswer,
}: {
  q: ShortAnswerQ;
  answers: AnswerMap;
  setAnswer: (id: number, v: unknown) => void;
}) {
  const val = (answers[q.id] as string | undefined) ?? "";
  const wordCount = val.trim() === "" ? 0 : val.trim().split(/\s+/).length;
  const limit = q.maxWords ?? 500;
  const isOver = wordCount > limit;
  return (
    <div>
      <FormattedText
        text={q.content}
        className="text-sm text-muted-foreground leading-relaxed mb-4 break-words"
      />
      <Textarea
        placeholder="Nhập câu trả lời của bạn tại đây…"
        value={val}
        onChange={(e) => setAnswer(q.id, e.target.value)}
        className={`min-h-[180px] text-sm resize-y ${isOver ? "border-red-500 focus-visible:ring-red-500" : ""}`}
      />
      <div
        className={`flex justify-end items-center gap-1 mt-1 text-xs ${
          isOver ? "text-red-500 font-medium" : "text-muted-foreground"
        }`}
      >
        {!isOver && wordCount > 0 && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        )}
        {wordCount} / {limit} words
        {isOver && " — over limit!"}
      </div>
    </div>
  );
}




export function QuestionRenderer({
  question,
  answers,
  setAnswer,
  orderState,
  setOrderState,
}: {
  question: Question;
  answers: AnswerMap;
  setAnswer: (id: number, value: unknown) => void;
  orderState: Record<number, string[]>;
  setOrderState: Dispatch<SetStateAction<Record<number, string[]>>>;
}) {
  const media = question.imageUrl ? (
    <img
      src={question.imageUrl}
      alt="Hình ảnh minh họa câu hỏi"
      className="mb-4 max-h-96 w-full rounded-lg border object-contain"
    />
  ) : question.audioUrl ? (
    <audio src={question.audioUrl} controls className="mb-4 w-full" />
  ) : null;

  const renderer = (() => {
    switch (question.type) {
      case "single-choice": return <SingleChoiceRenderer q={question} answers={answers} setAnswer={setAnswer} />;
      case "multi-choice": return <MultiChoiceRenderer q={question} answers={answers} setAnswer={setAnswer} />;
      case "true-false": return <TrueFalseRenderer q={question} answers={answers} setAnswer={setAnswer} />;
      case "fill-blank": return <FillBlankRenderer q={question} answers={answers} setAnswer={setAnswer} />;
      case "matching": return <MatchingRenderer q={question} answers={answers} setAnswer={setAnswer} />;
      case "find-error": return <FindErrorRenderer q={question} answers={answers} setAnswer={setAnswer} />;
      case "ordering": return <OrderingRenderer q={question} orderState={orderState} setOrderState={setOrderState} setAnswer={setAnswer} />;
      case "short-answer": return <ShortAnswerRenderer q={question} answers={answers} setAnswer={setAnswer} />;
    }
  })();

  return (
    <>
      {media}
      {renderer}
    </>
  );
}

