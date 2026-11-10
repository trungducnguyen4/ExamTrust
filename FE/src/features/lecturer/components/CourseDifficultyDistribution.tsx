"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface CourseDifficultyDistributionProps {
  total?: number;
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
  questions?: Array<{ difficulty?: number | null }>;
  className?: string;
  showBreakdownText?: boolean;
}

export function CourseDifficultyDistribution({
  total,
  easyCount,
  mediumCount,
  hardCount,
  questions,
  className,
  showBreakdownText = true,
}: CourseDifficultyDistributionProps) {
  const stats = useMemo(() => {
    let easy = easyCount ?? 0;
    let medium = mediumCount ?? 0;
    let hard = hardCount ?? 0;
    let count = total ?? (easy + medium + hard);

    if (questions && questions.length > 0) {
      easy = 0;
      medium = 0;
      hard = 0;
      for (const q of questions) {
        const d = Math.round(Number(q.difficulty) || 1);
        if (d <= 4) easy++;
        else if (d === 5) medium++;
        else hard++;
      }
      count = questions.length;
    } else if (total !== undefined && total !== null) {
      count = total;
    } else if (questions && questions.length === 0) {
      count = 0;
      easy = 0;
      medium = 0;
      hard = 0;
    }

    const easyPct = count > 0 ? (easy / count) * 100 : 0;
    const mediumPct = count > 0 ? (medium / count) * 100 : 0;
    const hardPct = count > 0 ? (hard / count) * 100 : 0;

    return {
      count,
      easy,
      medium,
      hard,
      easyPct,
      mediumPct,
      hardPct,
    };
  }, [total, easyCount, mediumCount, hardCount, questions]);

  const { count, easy, medium, hard, easyPct, mediumPct, hardPct } = stats;

  const tooltipText =
    count > 0
      ? `Phân bố độ khó: ${easy} Dễ (${Math.round(easyPct)}%) · ${medium} Trung bình (${Math.round(mediumPct)}%) · ${hard} Khó (${Math.round(hardPct)}%)`
      : "Chưa có câu hỏi trong khóa học này";

  return (
    <div
      className={cn("flex flex-col gap-1.5 w-full max-w-[170px]", className)}
      title={tooltipText}
      data-testid="course-difficulty-distribution"
    >
      {/* Total question count & optional percentage summary */}
      <div className="flex items-baseline justify-between gap-1.5">
        <div className="flex items-baseline gap-1">
          <span className="text-muted-foreground md:hidden text-xs">Câu hỏi:</span>
          <span
            className="font-semibold tabular-nums text-foreground text-sm"
            data-testid="dist-total-count"
          >
            {count}
          </span>
          <span className="text-[11px] text-muted-foreground">câu</span>
        </div>

        {count > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums hidden xl:inline">
            {Math.round(easyPct)}% · {Math.round(mediumPct)}% · {Math.round(hardPct)}%
          </span>
        )}
      </div>

      {/* Mini Segmented Distribution Bar */}
      {count > 0 ? (
        <>
          <div
            className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
            role="progressbar"
            aria-label="Phân bố độ khó câu hỏi"
            aria-valuenow={count}
          >
            {easy > 0 && (
              <div
                data-testid="dist-bar-easy"
                style={{ width: `${easyPct}%` }}
                className="h-full bg-emerald-500 transition-all hover:opacity-85"
                title={`Dễ: ${easy} câu (${Math.round(easyPct)}%)`}
              />
            )}
            {medium > 0 && (
              <div
                data-testid="dist-bar-medium"
                style={{ width: `${mediumPct}%` }}
                className="h-full bg-amber-500 transition-all hover:opacity-85"
                title={`Trung bình: ${medium} câu (${Math.round(mediumPct)}%)`}
              />
            )}
            {hard > 0 && (
              <div
                data-testid="dist-bar-hard"
                style={{ width: `${hardPct}%` }}
                className="h-full bg-rose-500 transition-all hover:opacity-85"
                title={`Khó: ${hard} câu (${Math.round(hardPct)}%)`}
              />
            )}
          </div>

          {/* Micro Legend: Dễ / TB / Khó with color dots */}
          {showBreakdownText && (
            <div
              className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground"
              data-testid="dist-breakdown-legend"
            >
              <span
                className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"
                title={`Dễ (1-4): ${easy} câu`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>{easy} Dễ</span>
              </span>
              <span
                className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400"
                title={`Trung bình (5): ${medium} câu`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>{medium} TB</span>
              </span>
              <span
                className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400"
                title={`Khó (6-10): ${hard} câu`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <span>{hard} Khó</span>
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full rounded-full bg-muted/40" />
          <span className="text-[10px] text-muted-foreground italic">0 câu hỏi</span>
        </div>
      )}
    </div>
  );
}
