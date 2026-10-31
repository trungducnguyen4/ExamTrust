"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BookOpen, Calendar, Clock, FileText, Loader2, RefreshCw } from "lucide-react";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DataPagination } from "@/components/common/DataPagination";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import api, { unwrapPaginatedData } from "@/lib/api";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { CourseTerm, formatCourseTerm } from "@/lib/course-term";
import {
  getExamAction,
  getExamDisplayState,
  getExamStateLabel,
  type CourseExamSubmission,
  type ExamDisplayState,
} from "@/lib/course-exam-action";
import {
  formatDurationVi,
  formatNumberVi,
  getScheduleLabel,
} from "@/lib/presentation";

type Course = {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  academicYear?: string;
  term?: CourseTerm;
  credits?: number;
};

type Exam = {
  id: string;
  title: string;
  status: string;
  startTime?: string | null;
  endTime?: string | null;
  duration?: number;
  maxAttempts?: number | null;
  settings?: {
    maxAttempts?: number | null;
  } | null;
};

const examStateBadgeClass = (state: ExamDisplayState) => {
  if (state === "graded") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (state === "expired") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (state === "submitted") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "";
};

export default function StudentCourseDetail() {
  const params = useParams<{ id?: string | string[]; slug?: string[] }>();
  const routeId = params.id;
  const idFromRouteId = Array.isArray(routeId) ? routeId[0] : routeId;
  const id = idFromRouteId ?? params.slug?.[1];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<CourseExamSubmission[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>({
    status: "all",
    startTime: { from: undefined, to: undefined },
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>({
    status: "all",
    startTime: { from: undefined, to: undefined },
  });
  const [page, setPage] = useState(1);

  const loadCourseDetail = useCallback(async () => {
    if (!id) {
      setError("Thiếu mã khóa học.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [courseRes, examsRes, submissionsRes] = await Promise.all([
        api.getCourse(id),
        api.getExams({ courseId: id, limit: 50 }),
        api.getMySubmissions().catch(() => []),
      ]);

      setCourse(courseRes || null);
      setExams(unwrapPaginatedData<Exam>(examsRes));
      setSubmissions(Array.isArray(submissionsRes) ? submissionsRes : []);
    } catch (err: any) {
      const message = err?.message || "Không thể tải chi tiết khóa học.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCourseDetail();
  }, [loadCourseDetail]);

  const sortedExams = useMemo(
    () =>
      [...exams].sort((a, b) => {
        const aTs = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTs = b.startTime ? new Date(b.startTime).getTime() : 0;
        return bTs - aTs;
      }),
    [exams],
  );

  const examFilterDefinitions: FilterDefinition[] = [
    {
      key: "status",
      label: "Trạng thái",
      type: "select",
      allLabel: "Tất cả trạng thái",
      options: [
        { label: "Bản nháp", value: "DRAFT" },
        { label: "Đã công bố", value: "PUBLISHED" },
        { label: "Đang diễn ra", value: "ONGOING" },
        { label: "Đã hoàn thành", value: "COMPLETED" },
      ],
    },
    {
      key: "startTime",
      label: "Thời gian bắt đầu",
      type: "date-range",
    },
  ];

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filteredExams = useMemo(() => {
    return sortedExams.filter((exam) => {
      const statusFilter = appliedFilters.status as string | undefined;
      const startTimeFilter = appliedFilters.startTime as
        | { from?: string; to?: string }
        | undefined;

      const searchMatched = !normalizedSearch
        ? true
        : [exam.title, exam.status].join(" ").toLowerCase().includes(normalizedSearch);
      if (!searchMatched) return false;

      if (statusFilter && statusFilter !== "all" && exam.status !== statusFilter) {
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
  }, [appliedFilters, normalizedSearch, sortedExams]);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / ITEMS_PER_PAGE));
  const paginatedExams = filteredExams.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );
  const EXAM_ITEM_HEIGHT = 92;
  const EXAM_LIST_MIN_HEIGHT = ITEMS_PER_PAGE * EXAM_ITEM_HEIGHT;

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
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <BackToDashboardButton to="/student" className="-ml-2" />

          <div className="rounded-2xl border border-border/50 bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">
                  {course?.name || "Chi tiết khóa học"}
                </h1>
                {course?.code && <Badge variant="secondary">{course.code}</Badge>}
              </div>
              <Button variant="outline" size="sm" onClick={loadCourseDetail} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Làm mới
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {course?.description ||
                "Khóa học này chưa có mô tả."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                Học kỳ: {formatCourseTerm(
                  course?.academicYear,
                  course?.term,
                )}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Tín chỉ: {formatNumberVi(course?.credits)}
              </span>
            </div>
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Đang tải dữ liệu khóa học...
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-medium text-foreground">
                Không thể tải khóa học này.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <Card>
            <CardHeader>
              <CardTitle>Bài thi trong khóa học</CardTitle>
              <CardDescription>{filteredExams.length} bài thi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-3">
                <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
                    value={searchInput}
                    onChange={setSearchInput}
                    onSearch={runSearch}
                    placeholder="Tìm theo tên bài thi"
                    className="min-w-0 flex-1 sm:min-w-[280px]"
                  />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
                    title="Bộ lọc bài thi"
                    description="Lọc theo trạng thái và thời gian bắt đầu."
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

              {filteredExams.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  Không có bài thi phù hợp với tìm kiếm hoặc bộ lọc hiện tại.
                </div>
              ) : (
                <div
                  className="space-y-3"
                  style={{ minHeight: EXAM_LIST_MIN_HEIGHT }}
                >
                  {paginatedExams.map((exam) => {
                    const action = getExamAction(exam, course?.id || id || "", submissions);
                    const latestSubmission =
                      submissions
                        .filter((submission) => submission.examId === exam.id)
                        .sort((a, b) => {
                          const aTime = new Date(a.submittedAt || a.startedAt || a.createdAt || 0).getTime();
                          const bTime = new Date(b.submittedAt || b.startedAt || b.createdAt || 0).getTime();
                          return bTime - aTime;
                        })[0] || null;
                    const displayState = getExamDisplayState(exam, latestSubmission);
                    const shouldShowPrimaryAction =
                      !["view_exams", "expired", "grading"].includes(action.actionType);
                    return (
                      <div
                        key={exam.id}
                        className="flex flex-col gap-3 rounded-xl border border-border/60 p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">
                            {exam.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {getScheduleLabel(exam.startTime)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {formatDurationVi(exam.duration)}
                            </span>
                            <Badge variant="outline" className={examStateBadgeClass(displayState)}>
                              {getExamStateLabel(displayState)}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {shouldShowPrimaryAction ? (
                            <Button asChild>
                              <Link href={action.href}>{action.label}</Link>
                            </Button>
                          ) : action.disabled ? (
                            <Button variant="outline" disabled className="cursor-not-allowed">
                              {action.label}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
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
        )}
      </div>
    </DashboardLayout>
  );
}



