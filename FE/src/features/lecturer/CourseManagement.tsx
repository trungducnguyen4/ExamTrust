"use client";

import { useState, useEffect, useMemo } from "react";
import { DataPagination } from "@/components/common/DataPagination";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { ListPageHeader } from "@/components/common/list/ListPageHeader";
import { SearchBar } from "@/components/common/list/SearchBar";
import { FilterPanel } from "@/components/common/list/FilterPanel";
import { SortButton, type SortOrder } from "@/components/common/list/SortButton";
import { ActiveFilterChips } from "@/components/common/list/ActiveFilterChips";
import { sortItems } from "@/components/common/list/sort-utils";
import {
  FilterDefinition,
  FilterValues,
  TextFilterValue,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Users,
  Clock,
  Archive,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { api, unwrapPaginatedData } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { CourseTerm, COURSE_TERM_OPTIONS, formatCourseTerm } from "@/lib/course-term";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Course {
  id: string;
  code: string;
  name: string;
  department?: string;
  faculty?: string;
  academicYear?: string;
  term?: CourseTerm;
  enrolledStudents?: number;
  totalStudents?: number;
  progress?: number;
  lastAccessed?: string;
  _count?: {
    enrollments?: number;
    exams?: number;
  };
}

interface GroupedCourses {
  [faculty: string]: Course[];
}

const EMPTY_FILTERS: FilterValues = {
  faculty: "all",
  examState: "all",
  academicYear: { value: "", operator: "contains" },
  term: "all",
};

const gradientClasses = [
  "bg-gradient-to-br from-pink-400 to-pink-600",
  "bg-gradient-to-br from-purple-400 to-indigo-600",
  "bg-gradient-to-br from-blue-400 to-cyan-600",
  "bg-gradient-to-br from-green-400 to-emerald-600",
  "bg-gradient-to-br from-yellow-400 to-orange-600",
  "bg-gradient-to-br from-red-400 to-pink-600",
  "bg-gradient-to-br from-gray-400 to-gray-600",
];

export default function CourseManagement() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [archiveScope, setArchiveScope] = useState<"active" | "archived">("active");
  const [courseActionId, setCourseActionId] = useState<string | null>(null);
  const [recentCourses, setRecentCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterValues>(EMPTY_FILTERS);
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  useEffect(() => {
    fetchCourses();
  }, [archiveScope]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      // Use my-courses which returns aggregated fields from the backend
      const raw = await api.getMyCourses(archiveScope);
      // Normalise: backend returns array directly (not paginated)
      const safeRelativeTime = (raw: any): string => {
        if (!raw) return "—";
        const d = new Date(raw);
        if (isNaN(d.getTime())) return "—";
        return formatDistanceToNow(d, { addSuffix: true });
      };

      const list: Course[] = (
        Array.isArray(raw) ? raw : unwrapPaginatedData(raw)
      ).map((c: any) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        faculty: c.faculty ?? c.department ?? "Chung",
        department: c.department,
        academicYear: c.academicYear,
        term: c.term,
        enrolledStudents: c.enrolledStudents ?? c._count?.enrollments ?? 0,
        totalStudents: c.totalStudents ?? c._count?.enrollments ?? 0,
        progress: c.progress ?? 0,
        lastAccessed: safeRelativeTime(c.lastAccessed),
        _count: {
          enrollments:
            c._count?.enrollments ?? c.enrolledStudents ?? c.totalStudents ?? 0,
          exams: c._count?.exams ?? c.exams ?? 0,
        },
      }));
      setCourses(list);
      setRecentCourses(list.slice(0, 2));
    } catch (error) {
      console.error("Failed to fetch courses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveToggle = async (course: Course) => {
    const restoring = archiveScope === "archived";
    const confirmed = window.confirm(
      restoring
        ? `Khôi phục khóa học "${course.name}"?`
        : `Lưu trữ khóa học "${course.name}"? Dữ liệu bài thi và kết quả vẫn được giữ lại.`,
    );
    if (!confirmed) return;
    try {
      setCourseActionId(course.id);
      await (restoring ? api.restoreCourse(course.id) : api.archiveCourse(course.id));
      setCourses((previous) => previous.filter((item) => item.id !== course.id));
    } catch (error) {
      console.error("Failed to update course archive state", error);
    } finally {
      setCourseActionId(null);
    }
  };

  const groupCoursesByFaculty = (courses: Course[]): GroupedCourses => {
    return courses.reduce((acc, course) => {
      const faculty = course.faculty || "Other";
      if (!acc[faculty]) {
        acc[faculty] = [];
      }
      acc[faculty].push(course);
      return acc;
    }, {} as GroupedCourses);
  };

  const getGradientClass = (index: number): string => {
    return gradientClasses[index % gradientClasses.length];
  };


  const courseFilterDefinitions: FilterDefinition[] = useMemo(
    () => [
      {
        key: "faculty",
        label: "Khoa",
        type: "select",
        allLabel: "Tất cả khoa",
        options: Array.from(
          new Set(courses.map((course) => course.faculty || "Chung")),
        ).map((faculty) => ({
          label: faculty,
          value: faculty,
        })),
      },
      {
        key: "examState",
        label: "Trạng thái bài thi",
        type: "select",
        allLabel: "Tất cả bài thi",
        options: [
          { label: "Có bài thi", value: "hasExams" },
          { label: "Chưa có bài thi", value: "noExams" },
        ],
      },
      {
        key: "academicYear",
        label: "Năm học",
        type: "text",
        operators: ["contains", "startsWith", "equals"],
        placeholder: "Lọc theo năm học",
      },
      {
        key: "term",
        label: "Học kỳ",
        type: "select",
        allLabel: "Tất cả học kỳ",
        options: COURSE_TERM_OPTIONS.map((option) => ({
          label: option.label,
          value: option.value,
        })),
      },
    ],
    [courses],
  );

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filteredCourses = useMemo(() => {
    const facultyFilter = appliedFilters.faculty as string | undefined;
    const examStateFilter = appliedFilters.examState as string | undefined;
    const academicYearFilter = appliedFilters.academicYear as
      | TextFilterValue
      | undefined;
    const termFilter = appliedFilters.term as string | undefined;

    const matchText = (source: string | undefined, filter?: TextFilterValue) => {
      if (!filter || !filter.value.trim()) return true;
      const sourceValue = (source || "").toLowerCase();
      const filterValue = filter.value.trim().toLowerCase();
      if (filter.operator === "startsWith") return sourceValue.startsWith(filterValue);
      if (filter.operator === "equals") return sourceValue === filterValue;
      return sourceValue.includes(filterValue);
    };

    return courses.filter((course) => {
      const termLabel = formatCourseTerm(
        course.academicYear,
        course.term,
      );
      const searchMatched = !normalizedSearch
        ? true
        : [course.code, course.name, course.faculty, termLabel]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
      if (!searchMatched) return false;

      if (
        facultyFilter &&
        facultyFilter !== "all" &&
        (course.faculty || "Chung") !== facultyFilter
      ) {
        return false;
      }

      const courseExams = course._count?.exams || 0;
      if (examStateFilter === "hasExams" && courseExams === 0) return false;
      if (examStateFilter === "noExams" && courseExams > 0) return false;

      if (!matchText(course.academicYear, academicYearFilter)) return false;

      if (termFilter && termFilter !== "all" && course.term !== termFilter) {
        return false;
      }

      return true;
    });
  }, [appliedFilters, courses, normalizedSearch, sortField, sortOrder]);

  // Apply sorting before returning
  const filteredAndSortedCourses = useMemo(() => {
    return sortItems(filteredCourses, sortField, sortOrder);
  }, [filteredCourses, sortField, sortOrder]);

  const groupedCourses = groupCoursesByFaculty(filteredAndSortedCourses);

  const COURSES_PER_PAGE = 12;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedCourses.length / COURSES_PER_PAGE),
  );

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedCourses = useMemo(() => {
    const start = (page - 1) * COURSES_PER_PAGE;
    return filteredAndSortedCourses.slice(start, start + COURSES_PER_PAGE);
  }, [filteredAndSortedCourses, page]);

  const paginatedGrouped = groupCoursesByFaculty(paginatedCourses);

  const totalStudents = courses.reduce(
    (sum, course) => sum + (course._count?.enrollments ?? 0),
    0,
  );
  const totalExams = courses.reduce(
    (sum, course) => sum + (course._count?.exams ?? 0),
    0,
  );
  const facultiesCount = Object.keys(groupedCourses).length;

  const activeFilterCount = getActiveFilterCount(
    appliedFilters,
    courseFilterDefinitions,
  );
  const activeFilterChips = getFilterChips(appliedFilters, courseFilterDefinitions);

  const courseSortOptions = [
    { field: "name", label: "Tên khóa học" },
    { field: "_count.enrollments", label: "Sinh viên" },
    { field: "_count.exams", label: "Bài thi" },
  ];

  const runSearch = () => setAppliedSearch(searchInput.trim());
  const applyFilters = () => setAppliedFilters(draftFilters);
  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setSearchInput("");
    setAppliedSearch("");
  };
  const removeFilter = (key: string) => {
    const next = {
      ...appliedFilters,
      [key]: EMPTY_FILTERS[key as keyof typeof EMPTY_FILTERS],
    };
    setAppliedFilters(next);
    setDraftFilters(next);
  };

  return (
    <DashboardLayout>
      <AdminPageShell backTo="/lecturer">
        <ListPageHeader
          title="Quản lý khóa học"
          actions={
            <div className="flex items-center gap-3">
              <Select
                value={viewMode}
                onValueChange={(value: "card" | "list") => setViewMode(value)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Thẻ</SelectItem>
                  <SelectItem value="list">Danh sách</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchCourses}
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Làm mới
              </Button>
              <Button asChild className="gap-2">
                <Link href="/lecturer/create-course">
                  <Plus className="h-4 w-4" />
                  Thêm khóa học
                </Link>
              </Button>
            </div>
          }
        />

        {/* Quick stats */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminStatCard icon={BookOpen} value={courses.length} label="Tổng khóa học" />
            <AdminStatCard icon={Users} value={totalStudents} label="Tổng sinh viên" />
            <AdminStatCard icon={Clock} value={totalExams} label="Tổng bài thi" />
            <AdminStatCard
              icon={Filter}
              value={facultiesCount}
              label="Khoa"
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm theo mã, tên, khoa, năm học hoặc học kỳ"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              title="Bộ lọc khóa học"
              description="Tìm kiếm và lọc các khóa học theo các tiêu chí khác nhau."
              filters={courseFilterDefinitions}
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
              options={courseSortOptions}
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
        </section>

        {/* Recently Accessed Courses */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Khóa học truy cập gần đây</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentCourses.map((course, index) => (
              <Card key={course.id} className="overflow-hidden">
                <div className={`h-32 ${getGradientClass(index)} relative`}>
                  <div className="absolute inset-0 bg-black/20" />
                </div>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {course.faculty}
                        </p>
                        <h3 className="font-medium">{course.code}</h3>
                        <p className="text-sm text-muted-foreground">
                          {course.name}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-1 py-2 border-t border-b border-border text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-base font-semibold text-foreground">
                          {course._count?.enrollments || 0}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Sinh viên
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-base font-semibold text-foreground">
                          {course._count?.exams || 0}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Bài thi
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-xs font-medium text-foreground line-clamp-1">
                          {course.lastAccessed}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Đã truy cập
                        </div>
                      </div>
                    </div>

                    {course.progress && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Hoàn thành {course.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${course.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Course Overview */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Tổng quan khóa học</h2>
            <div className="flex items-center gap-2">
              <Select value={archiveScope} onValueChange={(value) => setArchiveScope(value as "active" | "archived")}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Các khóa học đang hoạt động</SelectItem>
                  <SelectItem value="archived">Các khóa học đã được lưu trữ</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Tất cả khóa học
              </Button>
              <Select defaultValue="name">
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Tên khóa học</SelectItem>
                  <SelectItem value="code">Mã khóa học</SelectItem>
                  <SelectItem value="faculty">Khoa</SelectItem>
                </SelectContent>
              </Select>
              <Select value={viewMode} onValueChange={(value: "card" | "list") => setViewMode(value)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Thẻ</SelectItem>
                  <SelectItem value="list">Danh sách</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-8">
              {viewMode === "list" ? (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-36">Mã khóa học</TableHead>
                        <TableHead>Tên khóa học</TableHead>
                        <TableHead className="w-40">Khoa</TableHead>
                        <TableHead className="w-32">Học kỳ</TableHead>
                        <TableHead className="w-24 text-center">Sinh viên</TableHead>
                        <TableHead className="w-20 text-center">Bài thi</TableHead>
                        <TableHead className="w-40">Truy cập gần nhất</TableHead>
                        <TableHead className="w-32 text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCourses.map((course) => (
                        <TableRow key={course.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{course.code}</TableCell>
                          <TableCell>
                            <p className="font-medium">{course.name}</p>
                          </TableCell>
                          <TableCell>{course.faculty}</TableCell>
                          <TableCell>{formatCourseTerm(course.academicYear, course.term)}</TableCell>
                          <TableCell className="text-center">{course._count?.enrollments || 0}</TableCell>
                          <TableCell className="text-center">{course._count?.exams || 0}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{course.lastAccessed || "Chưa truy cập"}</TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/lecturer/course/${course.id}`}>Xem chi tiết</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {viewMode !== "list" && Object.entries(paginatedGrouped).map(
                ([faculty, facultyCourses]) => (
                  <div key={faculty}>
                    <h3 className="text-lg font-medium mb-4 text-foreground">
                      {faculty}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {facultyCourses.map((course, index) => (
                        <Card
                          key={course.id}
                          className="overflow-hidden transition-shadow hover:shadow-md"
                        >
                          <div
                            className={`h-24 ${getGradientClass(index)} relative`}
                          >
                            <div className="absolute inset-0 bg-black/20" />
                            <div className="absolute top-3 right-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20"
                                onClick={() => handleArchiveToggle(course)}
                                disabled={courseActionId === course.id}
                                title={archiveScope === "archived" ? "Khôi phục khóa học" : "Lưu trữ khóa học"}
                              >
                                {courseActionId === course.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : archiveScope === "archived" ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>

                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div>
                                <h4 className="font-medium text-sm">
                                  {course.code}
                                </h4>
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {course.name}
                                </p>
                              </div>

                              <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-border">
                                <div className="flex flex-col items-center justify-center">
                                  <div className="text-lg font-semibold text-foreground">
                                    {course._count?.enrollments || 0}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Users className="h-3 w-3" />
                                    <span>Sinh viên</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-center justify-center">
                                  <div className="text-lg font-semibold text-foreground">
                                    {course._count?.exams || 0}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <BookOpen className="h-3 w-3" />
                                    <span>Bài thi</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-center justify-center">
                                  <div className="text-xs font-medium text-foreground text-center">
                                    {course.lastAccessed}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Clock className="h-3 w-3" />
                                    <span>Đã truy cập</span>
                                  </div>
                                </div>
                              </div>

                              {course.progress && (
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span>Hoàn thành {course.progress}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div
                                      className="bg-blue-600 h-1.5 rounded-full"
                                      style={{ width: `${course.progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="w-full"
                              >
                                <Link href={`/lecturer/course/${course.id}`}>
                                  Xem chi tiết
                                </Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ),
              )}
              {filteredCourses.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Không có khóa học phù hợp với tìm kiếm hoặc bộ lọc hiện tại.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <DataPagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredCourses.length}
            onPageChange={setPage}
            itemLabel="khóa học"
            className="border-t-0 px-0"
            syncUrl={false}
          />
        </section>
      </AdminPageShell>
    </DashboardLayout>
  );
}



