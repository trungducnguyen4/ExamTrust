"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DataPagination } from "@/components/common/DataPagination";
import { ListPageHeader } from "@/components/common/list/ListPageHeader";
import { SearchBar } from "@/components/common/list/SearchBar";
import { FilterPanel } from "@/components/common/list/FilterPanel";
import { SortButton, type SortOrder } from "@/components/common/list/SortButton";
import { ActiveFilterChips } from "@/components/common/list/ActiveFilterChips";
import { sortItems } from "@/components/common/list/sort-utils";
import {
  FilterDefinition,
  FilterValues,
} from "@/components/common/list/filter-types";
import {
  getActiveFilterCount,
  getFilterChips,
} from "@/components/common/list/filter-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Award, FileCheck2, RefreshCw, RotateCcw, Trophy, CalendarDays, Clock3 } from "lucide-react";
import api from "@/lib/api";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { getStatusBadgeLabel } from "@/components/ui/status-badge";

const scoreBadgeClass = (score: unknown) => {
  const numericScore = typeof score === "number" ? score : null;

  if (numericScore === null) return "border-border bg-muted text-muted-foreground";
  if (numericScore >= 8) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (numericScore >= 5) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
};

const statusBadgeClass = (status?: string) => {
  const normalized = String(status || "").toUpperCase();

  if (["GRADED", "FINALIZED"].includes(normalized)) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (normalized === "FLAGGED") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
};

type ResultAttempt = {
  submissionId: string;
  attemptNo: number;
  status: string;
  startedAt?: string | null;
  submittedAt?: string | null;
  score?: number | null;
  scoreAvailable: boolean;
  provisionalScore?: number | null;
  pendingManualCount?: number;
};

type ResultGroup = {
  examId: string;
  exam: {
    id: string;
    title: string;
    course?: { code?: string; name?: string } | null;
    gradingStrategy: "HIGHEST" | "AVERAGE" | "FIRST_ATTEMPT" | "LAST_ATTEMPT";
  };
  attempts: ResultAttempt[];
  attemptCount: number;
  officialScore?: number | null;
  resultsPublished: boolean;
  lastActivityAt?: string | null;
};

const strategyLabel: Record<ResultGroup["exam"]["gradingStrategy"], string> = {
  HIGHEST: "Lấy điểm cao nhất",
  AVERAGE: "Lấy điểm trung bình",
  FIRST_ATTEMPT: "Lấy điểm lượt đầu",
  LAST_ATTEMPT: "Lấy điểm lượt cuối",
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Chưa nộp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", hour12: false,
  }).format(date);
};

const formatDuration = (start?: string | null, end?: string | null) => {
  if (!start || !end) return "—";
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return `${minutes} phút`;
};

const ATTEMPTS_PER_PAGE = 5;

export default function StudentResults() {
  const searchParams = useSearchParams();
  const scopedExamId = searchParams.get("examId");
  const [resultGroups, setResultGroups] = useState<ResultGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>({
    status: "all",
    courseCode: "all",
    score: { min: undefined, max: undefined },
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>({
    status: "all",
    courseCode: "all",
    score: { min: undefined, max: undefined },
  });
  const [sortField, setSortField] = useState("lastActivityAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [attemptPages, setAttemptPages] = useState<Record<string, number>>({});

  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getMyResultsHistory();
      setResultGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load submissions", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const resultFilterDefinitions: FilterDefinition[] = useMemo(
    () => [
      {
        key: "status",
        label: "Trạng thái",
        type: "select",
        allLabel: "Tất cả trạng thái",
        options: [
          { label: "Đã nộp", value: "SUBMITTED" },
          { label: "Đã chấm", value: "GRADED" },
          { label: "Cần xem xét", value: "FLAGGED" },
          { label: "Đã hoàn tất", value: "FINALIZED" },
        ],
      },
      {
        key: "courseCode",
        label: "Khóa học",
        type: "select",
        allLabel: "Tất cả khóa học",
        options: Array.from(
          new Set(
            resultGroups
              .map((group) => group.exam?.course?.code)
              .filter(Boolean),
          ),
        ).map((code) => ({ label: String(code), value: String(code) })),
      },
      {
        key: "score",
        label: "Điểm",
        type: "number-range",
        min: 0,
        max: 10,
        step: 1,
      },
    ],
    [resultGroups],
  );

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    const filtered = resultGroups.filter((group) => {
      if (scopedExamId && group.examId !== scopedExamId) return false;
      const statusFilter = appliedFilters.status as string | undefined;
      const courseFilter = appliedFilters.courseCode as string | undefined;
      const scoreFilter = appliedFilters.score as
        | { min?: number; max?: number }
        | undefined;

      const searchMatched = !normalizedSearch
        ? true
        : [
            group.exam?.title,
            group.exam?.course?.code,
            group.attempts.map((attempt) => attempt.status).join(" "),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
      if (!searchMatched) return false;

      if (statusFilter && statusFilter !== "all" && !group.attempts.some((attempt) => attempt.status === statusFilter)) {
        return false;
      }

      if (
        courseFilter &&
        courseFilter !== "all" &&
        group.exam?.course?.code !== courseFilter
      ) {
        return false;
      }

      if (scoreFilter && (scoreFilter.min !== undefined || scoreFilter.max !== undefined)) {
        const score = group.officialScore ?? -1;
        if (scoreFilter.min !== undefined && score < scoreFilter.min) return false;
        if (scoreFilter.max !== undefined && score > scoreFilter.max) return false;
      }

      return true;
    });

    return sortItems(filtered, sortField, sortOrder);
  }, [appliedFilters, normalizedSearch, resultGroups, scopedExamId, sortField, sortOrder]);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredGroups.length / ITEMS_PER_PAGE),
  );
  const paginatedGroups = filteredGroups.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );
  const RESULT_ITEM_HEIGHT = 172;
  const RESULT_LIST_MIN_HEIGHT = ITEMS_PER_PAGE * RESULT_ITEM_HEIGHT;

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const runSearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };
  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(1);
  };
  const clearFilters = () => {
    const empty: FilterValues = {
      status: "all",
      courseCode: "all",
      score: { min: undefined, max: undefined },
    };
    setDraftFilters(empty);
    setAppliedFilters(empty);
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  };
  const removeFilter = (key: string) => {
    const empty: FilterValues = {
      status: "all",
      courseCode: "all",
      score: { min: undefined, max: undefined },
    };
    const next = { ...appliedFilters, [key]: empty[key] };
    setAppliedFilters(next);
    setDraftFilters(next);
    setPage(1);
  };

  const activeFilterCount = getActiveFilterCount(
    appliedFilters,
    resultFilterDefinitions,
  );
  const activeFilterChips = getFilterChips(appliedFilters, resultFilterDefinitions);

  const resultSortOptions = [
    { field: "officialScore", label: "Điểm chính thức" },
    { field: "lastActivityAt", label: "Hoạt động gần nhất" },
    { field: "exam.title", label: "Tên bài thi" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackToDashboardButton to="/student" className="-ml-2" />

        <div className="space-y-3">
          <ListPageHeader
            title="Kết quả"
            actions={
              <Button variant="outline" size="sm" onClick={loadResults} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Làm mới
              </Button>
            }
          />
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm theo tên bài thi hoặc khóa học"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              title="Bộ lọc kết quả"
              description="Lọc theo trạng thái, khóa học và khoảng điểm."
              filters={resultFilterDefinitions}
              value={draftFilters}
              onValueChange={(key, nextValue) =>
                setDraftFilters((prev) => ({ ...prev, [key]: nextValue }))
              }
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
            />
              
              <div className="hidden sm:block h-6 w-px bg-border/70 shrink-0" />
              <SortButton
              options={resultSortOptions}
              value={sortField}
              order={sortOrder}
              onSortChange={(field, order) => {
                setSortField(field);
                setSortOrder(order);
              }}
            />
            </div>
          </div>
          <ActiveFilterChips
            chips={activeFilterChips}
            onRemove={removeFilter}
            onClearAll={clearFilters}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Kết quả của tôi</CardTitle>
            <CardDescription>Các bài thi đã nộp và đã chấm</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div
                className="space-y-3"
                style={{ minHeight: RESULT_LIST_MIN_HEIGHT }}
              >
                {filteredGroups.length === 0 ? (
                  <div className="text-center py-12">
                    <Award className="h-6 w-6 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground mt-2">
                      Không có kết quả phù hợp với tìm kiếm hoặc bộ lọc
                    </p>
                  </div>
                ) : (
                  paginatedGroups.map((group) => {
                    const totalAttemptPages = Math.max(
                      1,
                      Math.ceil(group.attempts.length / ATTEMPTS_PER_PAGE),
                    );
                    const currentAttemptPage = Math.min(
                      attemptPages[group.examId] ?? 1,
                      totalAttemptPages,
                    );
                    const attemptStart = (currentAttemptPage - 1) * ATTEMPTS_PER_PAGE;
                    const visibleAttempts = group.attempts.slice(
                      attemptStart,
                      attemptStart + ATTEMPTS_PER_PAGE,
                    );

                    return (
                      <div
                        key={group.examId}
                        className="rounded-xl border border-border bg-card/70 p-4 transition-colors hover:border-primary/30 hover:bg-muted/30"
                      >
                      <div className="flex flex-col gap-4 border-b border-border/70 pb-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-foreground">
                            {group.exam.title}
                          </h4>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {group.exam.course?.code || "Chưa có thông tin khóa học"}
                            {group.exam.course?.name ? ` · ${group.exam.course.name}` : ""}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              {group.attemptCount} lượt làm
                            </Badge>
                            <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                              {strategyLabel[group.exam.gradingStrategy]}
                            </Badge>
                          </div>
                        </div>
                        <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-left md:text-right">
                          <p className="text-xs text-muted-foreground">Điểm chính thức</p>
                          <p className="mt-1 text-lg font-semibold text-primary">
                            {group.officialScore == null ? "Chờ công bố/chấm" : `${group.officialScore.toFixed(2)}/10`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {visibleAttempts.map((attempt) => {
                          const gradingComplete = ["GRADED", "FINALIZED"].includes(String(attempt.status || "").toUpperCase());
                          return (
                          <div key={attempt.submissionId} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">Lượt {attempt.attemptNo}</p>
                                <Badge variant="outline" className={statusBadgeClass(attempt.status)}>
                                  <FileCheck2 className="mr-1 h-3.5 w-3.5" />
                                  {getStatusBadgeLabel(attempt.status)}
                                </Badge>
                                <Badge variant="outline" className={scoreBadgeClass(attempt.score)}>
                                  <Trophy className="mr-1 h-3.5 w-3.5" />
                                  {attempt.scoreAvailable && attempt.score != null
                                    ? `${attempt.score.toFixed(2)}/10`
                                    : gradingComplete ? "Đã chấm — chờ công bố" : "Chờ chấm"}
                                </Badge>
                                {!attempt.scoreAvailable && attempt.provisionalScore != null ? (
                                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                    <Trophy className="mr-1 h-3.5 w-3.5" />
                                    Tạm tính {attempt.provisionalScore.toFixed(2)}/10
                                    {attempt.pendingManualCount ? ` · còn ${attempt.pendingManualCount} câu tự luận` : ""}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Nộp: {formatDateTime(attempt.submittedAt)}</span>
                                <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Thời gian làm: {formatDuration(attempt.startedAt, attempt.submittedAt)}</span>
                              </div>
                            </div>
                            <Button asChild size="sm" variant={attempt.scoreAvailable ? "default" : "outline"}>
                              <Link href={`/student/grading?examId=${group.examId}&submissionId=${attempt.submissionId}`}>
                                {attempt.scoreAvailable ? "Xem kết quả" : "Xem chi tiết bài làm"}
                              </Link>
                            </Button>
                          </div>
                          );
                        })}
                      </div>
                      {group.attempts.length > ATTEMPTS_PER_PAGE && (
                        <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-muted-foreground">
                            Hiển thị {attemptStart + 1}–{Math.min(attemptStart + ATTEMPTS_PER_PAGE, group.attempts.length)} / {group.attempts.length} lượt làm
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={currentAttemptPage === 1}
                              onClick={() =>
                                setAttemptPages((previous) => ({
                                  ...previous,
                                  [group.examId]: currentAttemptPage - 1,
                                }))
                              }
                            >
                              Trước
                            </Button>
                            <span className="min-w-20 text-center text-muted-foreground">
                              Trang {currentAttemptPage}/{totalAttemptPages}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={currentAttemptPage === totalAttemptPages}
                              onClick={() =>
                                setAttemptPages((previous) => ({
                                  ...previous,
                                  [group.examId]: currentAttemptPage + 1,
                                }))
                              }
                            >
                              Sau
                            </Button>
                          </div>
                        </div>
                      )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredGroups.length}
              onPageChange={setPage}
              itemLabel="kết quả"
              syncUrl={false}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}



