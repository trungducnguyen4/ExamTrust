"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DataPagination } from "@/components/common/DataPagination";
import { ListPageHeader } from "@/components/common/list/ListPageHeader";
import { SearchBar } from "@/components/common/list/SearchBar";
import { FilterPanel } from "@/components/common/list/FilterPanel";
import { ActiveFilterChips } from "@/components/common/list/ActiveFilterChips";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";

type StudentExamItem = {
  id: string;
  title?: string;
  status?: string;
  startTime?: string | null;
  endTime?: string | null;
  duration?: number;
  submitted?: boolean;
  completed?: boolean;
  source?: "available" | "submission";
  hasCompletedAttempt?: boolean;
  mySubmissionId?: string | null;
  myCompletedSubmissionId?: string | null;
  maxAttempts?: number | null;
  mySubmissionStatus?: string | null;
  mySubmissionAttemptNo?: number | null;
  settings?: {
    maxAttempts?: number | null;
  };
  course?: {
    id?: string;
    code?: string;
    name?: string;
  };
};

const completedAttemptStatuses = new Set([
  "SUBMITTED",
  "GRADED",
  "FLAGGED",
  "FINALIZED",
]);

const statusText = (exam: StudentExamItem) => {
  if (exam.completed) return "Completed";
  const status = String(exam.status || "").toUpperCase();
  if (status === "ONGOING") return "Ongoing";
  return "Upcoming";
};

const statusLabel = (exam: StudentExamItem) => {
  const status = statusText(exam);
  if (status === "Completed") return "Đã hoàn thành";
  if (status === "Ongoing") return "Đang diễn ra";
  return "Sắp diễn ra";
};

const getExamStatusKey = (exam: StudentExamItem) => {
  if (exam.completed) return "completed";
  const status = String(exam.status || "").toUpperCase();
  if (status === "ONGOING") return "ongoing";
  return "published";
};

const summaryCardClassByKey: Record<"upcoming" | "ongoing" | "completed", string> = {
  upcoming:
    "rounded-xl border border-info/25 bg-info/5 p-3 shadow-[0_0_0_1px_rgba(59,130,246,0.06)]",
  ongoing:
    "rounded-xl border border-warning/30 bg-warning/10 p-3 shadow-[0_0_0_1px_rgba(245,158,11,0.1)]",
  completed:
    "rounded-xl border border-success/25 bg-success/10 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]",
};

const rowAccentByStatus: Record<string, string> = {
  completed: "border-l-4 border-l-success/60",
  ongoing: "border-l-4 border-l-warning/60",
  published: "border-l-4 border-l-info/60",
};

export default function StudentExams() {
  const [exams, setExams] = useState<StudentExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>({
    status: "all",
    courseCode: "all",
    startTime: { from: undefined, to: undefined },
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>({
    status: "all",
    courseCode: "all",
    startTime: { from: undefined, to: undefined },
  });
  const [page, setPage] = useState(1);

  const loadExams = useCallback(async () => {
    try {
      setLoading(true);
      const [available, mySubs] = await Promise.all([
        api.getAvailableExams(),
        api.getMySubmissions(),
      ]);
      const examsList = (available || []) as any[];
      const submissions = (mySubs || []) as any[];
      const submittedExamIds = new Set<string>(
        submissions
          .filter((s: any) =>
            completedAttemptStatuses.has(String(s.status || "").toUpperCase()),
          )
          .map((s: any) => String(s.examId ?? s.exam?.id)),
      );

      const byId = new Map<string, StudentExamItem>();

      examsList.forEach((exam: any) => {
        const id = String(exam.id);
        const latestSubmission = [...submissions]
          .filter((s: any) => String(s.examId ?? s.exam?.id ?? "") === id)
          .sort((a: any, b: any) => {
            const aTime = new Date(a?.submittedAt || a?.startedAt || a?.createdAt || 0).getTime();
            const bTime = new Date(b?.submittedAt || b?.startedAt || b?.createdAt || 0).getTime();
            return bTime - aTime;
          })[0];
        const latestCompletedSubmission = [...submissions]
          .filter(
            (s: any) =>
              String(s.examId ?? s.exam?.id ?? "") === id &&
              completedAttemptStatuses.has(String(s.status || "").toUpperCase()),
          )
          .sort((a: any, b: any) => {
            const aTime = new Date(a?.submittedAt || a?.startedAt || a?.createdAt || 0).getTime();
            const bTime = new Date(b?.submittedAt || b?.startedAt || b?.createdAt || 0).getTime();
            return bTime - aTime;
          })[0];

        const configuredMaxAttempts =
          typeof exam?.maxAttempts === "number"
            ? exam.maxAttempts
            : typeof exam?.settings?.maxAttempts === "number"
              ? exam.settings.maxAttempts
              : null;

        byId.set(id, {
          id,
          title: exam.title,
          status: exam.status,
          startTime: exam.startTime,
          endTime: exam.endTime,
          duration: exam.duration,
          course: exam.course,
          // latestSubmission can be an IN_PROGRESS attempt — only a row in
          // completedAttemptStatuses means the student actually submitted.
          submitted: submittedExamIds.has(id),
          completed: false,
          source: "available",
          hasCompletedAttempt: submittedExamIds.has(id),
          mySubmissionId: latestSubmission?.id ?? null,
          myCompletedSubmissionId: latestCompletedSubmission?.id ?? null,
          maxAttempts: configuredMaxAttempts,
          mySubmissionStatus: latestSubmission?.status ?? null,
          mySubmissionAttemptNo: latestSubmission?.attemptNo ?? null,
        });
      });

      setExams(Array.from(byId.values()));
    } catch (err) {
      console.error("Failed to load exams", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const examFilterDefinitions: FilterDefinition[] = useMemo(
    () => [
      {
        key: "status",
        label: "Trạng thái",
        type: "select",
        allLabel: "Tất cả trạng thái",
        options: [
          { label: "Sắp diễn ra", value: "PUBLISHED" },
          { label: "Đang diễn ra", value: "ONGOING" },
        ],
      },
      {
        key: "courseCode",
        label: "Khóa học",
        type: "select",
        allLabel: "Tất cả khóa học",
        options: Array.from(
          new Set(exams.map((exam) => exam.course?.code).filter(Boolean)),
        ).map((code) => ({
          label: String(code),
          value: String(code),
        })),
      },
      {
        key: "startTime",
        label: "Thời gian bắt đầu",
        type: "date-range",
      },
    ],
    [exams],
  );

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      const statusFilter = appliedFilters.status as string | undefined;
      const courseFilter = appliedFilters.courseCode as string | undefined;
      const startTimeFilter = appliedFilters.startTime as
        | { from?: string; to?: string }
        | undefined;

      const searchMatched = !normalizedSearch
        ? true
        : [exam.title, exam.course?.code, exam.course?.name]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
      if (!searchMatched) return false;

      const effectiveStatus = exam.completed
        ? "COMPLETED"
        : String(exam.status || "PUBLISHED").toUpperCase();

      if (statusFilter && statusFilter !== "all" && effectiveStatus !== statusFilter) {
        return false;
      }

      if (
        courseFilter &&
        courseFilter !== "all" &&
        exam.course?.code !== courseFilter
      ) {
        return false;
      }

      if (startTimeFilter?.from || startTimeFilter?.to) {
        const startTs = exam.startTime ? new Date(exam.startTime).getTime() : NaN;
        if (Number.isNaN(startTs)) return false;
        if (startTimeFilter.from) {
          const fromTs = new Date(startTimeFilter.from).getTime();
          if (!Number.isNaN(fromTs) && startTs < fromTs) return false;
        }
        if (startTimeFilter.to) {
          const toDate = new Date(startTimeFilter.to);
          toDate.setHours(23, 59, 59, 999);
          const toTs = toDate.getTime();
          if (!Number.isNaN(toTs) && startTs > toTs) return false;
        }
      }

      return true;
    });
  }, [appliedFilters, exams, normalizedSearch]);

  const examSummary = useMemo(() => {
    const counts = { upcoming: 0, ongoing: 0, completed: 0 };
    exams.forEach((exam) => {
      const status = statusText(exam).toLowerCase();
      if (status === "upcoming") counts.upcoming += 1;
      if (status === "ongoing") counts.ongoing += 1;
      if (status === "completed") counts.completed += 1;
    });
    return counts;
  }, [exams]);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / ITEMS_PER_PAGE));
  const paginatedExams = filteredExams.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );
  const EXAM_ITEM_HEIGHT = 106;
  const EXAM_LIST_MIN_HEIGHT = Math.min(paginatedExams.length, ITEMS_PER_PAGE) * EXAM_ITEM_HEIGHT;

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
      startTime: { from: undefined, to: undefined },
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
      startTime: { from: undefined, to: undefined },
    };
    const next = { ...appliedFilters, [key]: empty[key] };
    setAppliedFilters(next);
    setDraftFilters(next);
    setPage(1);
  };

  const activeFilterCount = getActiveFilterCount(
    appliedFilters,
    examFilterDefinitions,
  );
  const activeFilterChips = getFilterChips(appliedFilters, examFilterDefinitions);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackToDashboardButton to="/student" className="-ml-2" />

        <div className="space-y-3">
          <ListPageHeader
            title="Bài thi"
            actions={
              <Button variant="outline" size="sm" onClick={loadExams} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Làm mới
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={summaryCardClassByKey.upcoming}>
              <p className="text-xs text-muted-foreground">Sắp diễn ra</p>
              <p className="text-xl font-semibold text-foreground">{examSummary.upcoming}</p>
            </div>
            <div className={summaryCardClassByKey.ongoing}>
              <p className="text-xs text-muted-foreground">Đang diễn ra</p>
              <p className="text-xl font-semibold text-foreground">{examSummary.ongoing}</p>
            </div>
            <div className={summaryCardClassByKey.completed}>
              <p className="text-xs text-muted-foreground">Đã hoàn thành</p>
              <p className="text-xl font-semibold text-foreground">{examSummary.completed}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm tên bài thi hoặc khóa học"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              filters={examFilterDefinitions}
              value={draftFilters}
              onValueChange={(key, nextValue) =>
                setDraftFilters((prev) => ({ ...prev, [key]: nextValue }))
              }
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
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
            <CardTitle>Bài thi của tôi</CardTitle>
            <CardDescription>
              Theo dõi bài thi sắp tới và đang diễn ra theo từng khóa học.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div
                className="space-y-3"
                style={{ minHeight: EXAM_LIST_MIN_HEIGHT }}
              >
                {filteredExams.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                      <Calendar className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-muted-foreground">
                      Không có bài thi phù hợp với tìm kiếm hoặc bộ lọc
                    </p>
                  </div>
                ) : (
                  paginatedExams.map((exam) => (
                    (() => {
                      const latestAttemptNo = Number(exam.mySubmissionAttemptNo ?? 0);
                      const configuredMaxAttempts =
                        typeof exam.maxAttempts === "number"
                          ? exam.maxAttempts
                          : typeof exam.settings?.maxAttempts === "number"
                            ? exam.settings.maxAttempts
                            : null;
                      const submissionStatus = String(exam.mySubmissionStatus || "").toUpperCase();
                      const hasCompletedAttempt = Boolean(exam.hasCompletedAttempt);
                      const attemptLimitReached =
                        configuredMaxAttempts !== null &&
                        Number.isFinite(configuredMaxAttempts) &&
                        latestAttemptNo >= configuredMaxAttempts;
                      const canStartNewAttempt =
                        !attemptLimitReached || submissionStatus === "IN_PROGRESS";
                      const hasResult = hasCompletedAttempt || attemptLimitReached;
                      const supportsMultipleAttempts = Number(configuredMaxAttempts || 0) > 1;
                      const resultUrl = supportsMultipleAttempts
                        ? `/student/results?examId=${exam.id}`
                        : exam.myCompletedSubmissionId || exam.mySubmissionId
                        ? `/student/grading?examId=${exam.id}&submissionId=${exam.myCompletedSubmissionId || exam.mySubmissionId}`
                        : `/student/grading?examId=${exam.id}`;

                      return (
                    <div
                      key={exam.id}
                      className={`flex flex-col gap-3 rounded-xl border border-border/50 bg-background/80 p-4 transition-colors hover:bg-muted/20 md:flex-row md:items-center md:justify-between ${
                        rowAccentByStatus[getExamStatusKey(exam)] || rowAccentByStatus.published
                      }`}
                    >
                      <div>
                        <h4 className="font-semibold text-foreground">
                          {exam.title}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {(exam.course?.code || "-") + " - " + (exam.course?.name || "Chưa có thông tin khóa học")}
                        </p>
                        {exam.startTime && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(exam.startTime).toLocaleString("vi-VN")}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge
                            status={getExamStatusKey(exam)}
                            domain="exam"
                            className={getExamStatusKey(exam) === "ongoing" ? "animate-pulse" : ""}
                          >
                            {statusLabel(exam)}
                          </StatusBadge>
                          {exam.submitted ? (
                            <StatusBadge status="submitted" domain="submission">
                              Đã nộp
                            </StatusBadge>
                          ) : null}
                          <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Số lần thi: {latestAttemptNo}{configuredMaxAttempts !== null ? `/${configuredMaxAttempts}` : " / Không giới hạn"}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {canStartNewAttempt ? (
                          <Button asChild size="sm">
                            <Link href={`/student/exam-ready?examId=${exam.id}`}>Bắt đầu</Link>
                          </Button>
                        ) : null}

                        {hasResult ? (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="border-emerald-500/50 bg-emerald-50 text-emerald-700 hover:border-emerald-600 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                          >
                            <Link href={resultUrl}>Xem kết quả</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                      );
                    })()
                  ))
                )}
              </div>
            )}
            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredExams.length}
              onPageChange={setPage}
              itemLabel="bài thi"
              syncUrl={false}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}



