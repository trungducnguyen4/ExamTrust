"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DataPagination } from "@/components/common/DataPagination";
import { ListPageHeader } from "@/components/common/list/ListPageHeader";
import { SearchBar } from "@/components/common/list/SearchBar";
import { FilterPanel } from "@/components/common/list/FilterPanel";
import { SortButton, type SortOrder } from "@/components/common/list/SortButton";
import { ActiveFilterChips } from "@/components/common/list/ActiveFilterChips";
import { sortItems } from "@/components/common/list/sort-utils";
import {
  getActiveFilterCount,
  getFilterChips,
} from "@/components/common/list/filter-utils";
import {
  type FilterDefinition,
  type FilterValues,
} from "@/components/common/list/filter-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Loader2, RefreshCw, UserRound, CalendarDays } from "lucide-react";
import api from "@/lib/api";
import { formatCourseTerm, type CourseTerm } from "@/lib/course-term";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { formatLatestActivityVi } from "./student-dashboard-types";

type StudentCourse = {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  academicYear?: string;
  term?: CourseTerm;
  credits?: number;
  progress?: number;
  lastAccessed?: string;
  lecturer?: {
    id?: string;
    fullName?: string;
    email?: string;
  };
};

const safeLabel = (value?: string | null) => (value ? value : "Chưa cập nhật");

export default function StudentCourses() {
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>({
    term: "all",
    credits: { min: undefined, max: undefined },
    progress: { min: undefined, max: undefined },
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>({
    term: "all",
    credits: { min: undefined, max: undefined },
    progress: { min: undefined, max: undefined },
  });
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);

  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getMyCourses();
      setCourses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load my courses", error);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    const termOptions = Array.from(
      new Set(
        courses
          .map((course) =>
            formatCourseTerm(course.academicYear, course.term),
          )
          .filter(Boolean),
      ),
    ).map((term) => ({ label: String(term), value: String(term) }));

    return [
      {
        key: "term",
        label: "Học kỳ",
        type: "select",
        allLabel: "Tất cả học kỳ",
        options: termOptions,
      },
      {
        key: "credits",
        label: "Tín chỉ",
        type: "number-range",
        min: 0,
        max: 10,
        step: 1,
      },
      {
        key: "progress",
        label: "Tiến độ",
        type: "number-range",
        min: 0,
        max: 100,
        step: 1,
      },
    ];
  }, [courses]);

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filteredCourses = useMemo(() => {
    const filtered = courses.filter((course) => {
      const termFilter = appliedFilters.term as string | undefined;
      const creditsFilter = appliedFilters.credits as
        | { min?: number; max?: number }
        | undefined;
      const progressFilter = appliedFilters.progress as
        | { min?: number; max?: number }
        | undefined;

      const termText = formatCourseTerm(
        course.academicYear,
        course.term,
      );

      const searchMatched = !normalizedSearch
        ? true
        : [
            course.code,
            course.name,
            course.description,
            course.lecturer?.fullName,
            termText,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
      if (!searchMatched) return false;

      if (termFilter && termFilter !== "all" && termText !== termFilter) {
        return false;
      }

      if (
        creditsFilter &&
        (creditsFilter.min !== undefined || creditsFilter.max !== undefined)
      ) {
        const credits = typeof course.credits === "number" ? course.credits : -1;
        if (creditsFilter.min !== undefined && credits < creditsFilter.min) return false;
        if (creditsFilter.max !== undefined && credits > creditsFilter.max) return false;
      }

      if (
        progressFilter &&
        (progressFilter.min !== undefined || progressFilter.max !== undefined)
      ) {
        const progress = typeof course.progress === "number" ? course.progress : -1;
        if (progressFilter.min !== undefined && progress < progressFilter.min) return false;
        if (progressFilter.max !== undefined && progress > progressFilter.max) return false;
      }

      return true;
    });

    return sortItems(filtered, sortField, sortOrder);
  }, [appliedFilters, courses, normalizedSearch, sortField, sortOrder]);

  const ITEMS_PER_PAGE = 8;
  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / ITEMS_PER_PAGE));
  const paginatedCourses = filteredCourses.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );
  const COURSE_ITEM_MIN_HEIGHT = ITEMS_PER_PAGE * 110;

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
      term: "all",
      credits: { min: undefined, max: undefined },
      progress: { min: undefined, max: undefined },
    };
    setDraftFilters(empty);
    setAppliedFilters(empty);
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  };

  const removeFilter = (key: string) => {
    const empty: FilterValues = {
      term: "all",
      credits: { min: undefined, max: undefined },
      progress: { min: undefined, max: undefined },
    };
    const next = { ...appliedFilters, [key]: empty[key] };
    setAppliedFilters(next);
    setDraftFilters(next);
    setPage(1);
  };

  const activeFilterCount = getActiveFilterCount(appliedFilters, filterDefinitions);
  const activeFilterChips = getFilterChips(appliedFilters, filterDefinitions);

  const sortOptions = [
    { field: "name", label: "Tên khóa học" },
    { field: "code", label: "Mã khóa học" },
    { field: "progress", label: "Tiến độ" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackToDashboardButton to="/student" className="-ml-2" />

        <div className="space-y-3">
          <ListPageHeader
            title="Khóa học của tôi"
            actions={
              <Button variant="outline" size="sm" onClick={loadCourses} disabled={loading} className="gap-2">
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
              placeholder="Tìm theo mã, tên khóa học hoặc giảng viên"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              title="Bộ lọc khóa học"
              description="Lọc theo học kỳ, số tín chỉ và tiến độ."
              filters={filterDefinitions}
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
              options={sortOptions}
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
            <CardTitle>Khóa học đã tham gia</CardTitle>
            <CardDescription>
              Xem các khóa học đã tham gia và truy cập danh sách bài thi của từng khóa học.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3" style={{ minHeight: COURSE_ITEM_MIN_HEIGHT }}>
                {filteredCourses.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-10 text-center">
                    <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">
                      Không có khóa học phù hợp với tìm kiếm hoặc bộ lọc.
                    </p>
                  </div>
                ) : (
                  paginatedCourses.map((course) => {
                    const termText = formatCourseTerm(
                      course.academicYear,
                      course.term,
                    );
                    const progressValue =
                      typeof course.progress === "number"
                        ? Math.max(0, Math.min(100, course.progress))
                        : 0;

                    return (
                      <div
                        key={course.id}
                        className="rounded-xl border border-border/60 p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-foreground">
                                {safeLabel(course.name)}
                              </h3>
                              <Badge variant="secondary">{safeLabel(course.code)}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {course.description || "Khóa học chưa có mô tả."}
                            </p>
                            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {termText}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <UserRound className="h-3.5 w-3.5" />
                                Giảng viên: {safeLabel(course.lecturer?.fullName)}
                              </span>
                              <span>Tín chỉ: {course.credits ?? "Chưa cập nhật"}</span>
                            </div>
                          </div>

                          <div className="min-w-[220px] space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Tiến độ</span>
                              <span className="font-medium text-foreground">{progressValue}%</span>
                            </div>
                            <Progress value={progressValue} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              Hoạt động gần nhất: {formatLatestActivityVi(course.lastAccessed)}
                            </p>
                            <Button asChild className="w-full" size="sm">
                              <Link href={`/student/courses/${course.id}`}>Xem chi tiết khóa học</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredCourses.length}
              onPageChange={setPage}
              itemLabel="khóa học"
              syncUrl={false}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}



