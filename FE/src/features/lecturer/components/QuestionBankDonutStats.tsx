"use client";

import React, { useMemo } from "react";
import { Database, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { difficultyLabel, typeLabels as questionTypeLabels } from "../question-bank-utils";
import type { Question } from "../question-bank-utils";

export interface QuestionBankDonutStatsProps {
  questions: Question[];
  avgDifficulty: string;
  courses?: Array<{ id?: string; code: string; name: string; faculty?: string }>;
}

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function MiniDonutChart({
  segments,
  total,
  centerPrimary,
  centerSecondary,
  size = 110,
  strokeWidth = 14,
}: {
  segments: DonutSegment[];
  total: number;
  centerPrimary: string | number;
  centerSecondary: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedLength = 0;
  const activeSegments = segments.filter((s) => s.value > 0);

  return (
    <div
      className="relative shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${centerSecondary}: ${centerPrimary}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90 overflow-visible"
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Slices */}
        {total > 0 &&
          activeSegments.map((seg) => {
            const segFraction = seg.value / total;
            const segLength = segFraction * circumference;
            // slight spacing between segments if there are more than 1
            const gap = activeSegments.length > 1 ? Math.min(2, segLength * 0.1) : 0;
            const dashLength = Math.max(0.5, segLength - gap);
            const strokeDasharray = `${dashLength} ${circumference}`;
            const strokeDashoffset = -accumulatedLength;
            accumulatedLength += segLength;

            return (
              <circle
                key={seg.key}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-300 hover:opacity-80"
              >
                <title>{`${seg.label}: ${seg.value} (${Math.round(segFraction * 100)}%)`}</title>
              </circle>
            );
          })}
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-1">
        <span
          data-testid="donut-center-primary"
          className="text-lg font-bold leading-none tracking-tight text-foreground tabular-nums"
        >
          {centerPrimary}
        </span>
        <span
          data-testid="donut-center-secondary"
          className="text-[10px] font-medium text-muted-foreground leading-tight mt-1 truncate max-w-[72px]"
        >
          {centerSecondary}
        </span>
      </div>
    </div>
  );
}

export function QuestionBankDonutStats({
  questions,
  avgDifficulty,
}: QuestionBankDonutStatsProps) {
  const totalQuestions = questions.length;

  // 1. Phân loại câu hỏi (Question Types)
  const typeSegments = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach((q) => {
      const typeKey = q.type || "OTHER";
      counts[typeKey] = (counts[typeKey] || 0) + 1;
    });

    const palette = [
      "#3b82f6", // blue-500
      "#8b5cf6", // purple-500
      "#06b6d4", // cyan-500
      "#f59e0b", // amber-500
      "#10b981", // emerald-500
      "#ec4899", // pink-500
      "#f97316", // orange-500
      "#6366f1", // indigo-500
      "#64748b", // slate-500
    ];

    return Object.entries(counts)
      .map(([typeKey, count], idx) => ({
        key: typeKey,
        label: questionTypeLabels[typeKey] || typeKey,
        value: count,
        color: palette[idx % palette.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [questions]);

  // Nhóm hiển thị legend: top 3 + Khác nếu có nhiều hơn 3 loại
  const displayTypeSegments = useMemo(() => {
    if (typeSegments.length <= 4) return typeSegments;
    const top3 = typeSegments.slice(0, 3);
    const othersCount = typeSegments.slice(3).reduce((sum, item) => sum + item.value, 0);
    return [
      ...top3,
      {
        key: "OTHERS",
        label: "Khác",
        value: othersCount,
        color: "#94a3b8", // slate-400
      },
    ];
  }, [typeSegments]);

  // 2. Phân bố độ khó (Difficulty Distribution)
  const easyCount = useMemo(
    () => questions.filter((q) => difficultyLabel(q.difficulty || 1).text === "Dễ").length,
    [questions],
  );
  const mediumCount = useMemo(
    () => questions.filter((q) => difficultyLabel(q.difficulty || 1).text === "Trung bình").length,
    [questions],
  );
  const hardCount = useMemo(
    () => questions.filter((q) => difficultyLabel(q.difficulty || 1).text === "Khó").length,
    [questions],
  );

  const easyPct = totalQuestions > 0 ? Math.round((easyCount / totalQuestions) * 100) : 0;
  const mediumPct = totalQuestions > 0 ? Math.round((mediumCount / totalQuestions) * 100) : 0;
  const hardPct = totalQuestions > 0 ? Math.round((hardCount / totalQuestions) * 100) : 0;

  const difficultySegments: DonutSegment[] = useMemo(
    () => [
      {
        key: "EASY",
        label: "Dễ (1-4)",
        value: easyCount,
        color: "#10b981", // emerald-500
      },
      {
        key: "MEDIUM",
        label: "Trung bình (5)",
        value: mediumCount,
        color: "#f59e0b", // amber-500
      },
      {
        key: "HARD",
        label: "Khó (6-10)",
        value: hardCount,
        color: "#ef4444", // red-500
      },
    ],
    [easyCount, mediumCount, hardCount],
  );

  return (
    <div
      data-testid="question-bank-donut-stats"
      className="grid gap-4 sm:grid-cols-2 mb-8"
    >
      {/* CARD 1: TỔNG SỐ CÂU HỎI & CÁC LOẠI CÂU HỎI */}
      <Card className="rounded-xl shadow-sm border-border/80 bg-card hover:border-primary/30 transition-colors">
        <CardHeader className="p-3.5 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Database className="h-3.5 w-3.5" />
              </span>
              Tổng số câu hỏi
            </CardTitle>
            <span className="text-[11px] font-semibold text-primary tabular-nums">
              {typeSegments.length} loại
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-3.5 pt-0">
          <div className="flex items-center gap-3.5 pt-1">
            <MiniDonutChart
              segments={typeSegments}
              total={totalQuestions}
              centerPrimary={totalQuestions}
              centerSecondary="Tổng câu"
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              {totalQuestions === 0 ? (
                <p className="text-xs text-muted-foreground italic">Chưa có câu hỏi</p>
              ) : (
                displayTypeSegments.map((seg) => {
                  const pct = Math.round((seg.value / totalQuestions) * 100);
                  return (
                    <div
                      key={seg.key}
                      className="flex items-center justify-between text-xs gap-1.5"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="text-muted-foreground truncate max-w-[120px] text-[11px]">
                          {seg.label}
                        </span>
                      </div>
                      <span className="font-medium text-foreground tabular-nums text-[11px] shrink-0">
                        {seg.value} câu{" "}
                        <span className="text-muted-foreground font-normal">({pct}%)</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CARD 2: ĐỘ KHÓ TRUNG BÌNH & PHÂN BỐ DỄ / TRUNG BÌNH / KHÓ */}
      <Card className="rounded-xl shadow-sm border-border/80 bg-card hover:border-amber-500/30 transition-colors">
        <CardHeader className="p-3.5 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <BarChart3 className="h-3.5 w-3.5" />
              </span>
              Phân bố độ khó
            </CardTitle>
            <span className="text-[11px] font-semibold text-amber-600 tabular-nums">
              TB: {avgDifficulty}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-3.5 pt-0">
          <div className="flex items-center gap-3.5 pt-1">
            <MiniDonutChart
              segments={difficultySegments}
              total={totalQuestions}
              centerPrimary={avgDifficulty}
              centerSecondary="Độ khó TB"
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between text-xs gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-muted-foreground truncate text-[11px]">Dễ (1-4)</span>
                </div>
                <span className="font-medium text-foreground tabular-nums text-[11px] shrink-0">
                  {easyCount} câu{" "}
                  <span className="text-muted-foreground font-normal">({easyPct}%)</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-muted-foreground truncate text-[11px]">Trung bình (5)</span>
                </div>
                <span className="font-medium text-foreground tabular-nums text-[11px] shrink-0">
                  {mediumCount} câu{" "}
                  <span className="text-muted-foreground font-normal">({mediumPct}%)</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-muted-foreground truncate text-[11px]">Khó (6-10)</span>
                </div>
                <span className="font-medium text-foreground tabular-nums text-[11px] shrink-0">
                  {hardCount} câu{" "}
                  <span className="text-muted-foreground font-normal">({hardPct}%)</span>
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
