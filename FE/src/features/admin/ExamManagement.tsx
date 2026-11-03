"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DataPagination } from "@/components/common/DataPagination";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Users,
  Clock,
  CalendarClock,
  Eye,
  Trash2,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Settings,
  Shield,
  Repeat,
  Camera,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import api, { unwrapPaginatedData } from "@/lib/api";
import { toast } from "sonner";
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
import { formatDateTimeVi, formatDurationVi, getScheduleLabel } from "@/lib/presentation";

interface Exam {
  id: string;
  title: string;
  description?: string;
  course: { id: string; code: string; name: string };
  creator: { id: string; fullName: string };
  status: "DRAFT" | "PUBLISHED" | "ONGOING" | "COMPLETED" | "ARCHIVED";
  duration: number;
  totalPoints?: number;
  passingScore?: number;
  startTime?: string;
  endTime?: string;
  createdAt: string;
  resultsPublishedAt?: string | null;
  _count?: {
    examQuestions: number;
    submissions: number;
  };
}

const EMPTY_FILTERS: FilterValues = {
  status: "all",
  courseId: "all",
  creatorId: "all",
  totalPoints: { min: undefined, max: undefined },
  createdAt: { from: undefined, to: undefined },
  title: { value: "", operator: "contains" },
};

export default function AdminExamManagement() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterValues>(EMPTY_FILTERS);
  const [sortField, setSortField] = useState("title");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({
    startTime: "",
    endTime: "",
  });
  const [courses, setCourses] = useState<any[]>([]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsExam, setSettingsExam] = useState<any>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const handleViewSettings = async (exam: Exam) => {
    setSelectedExam(exam);
    setSettingsExam(null);
    setShowSettingsDialog(true);
    setSettingsLoading(true);
    try {
      const detail = await api.getExam(exam.id);
      setSettingsExam(detail);
    } catch (error) {
      console.error("Failed to load exam settings:", error);
      toast.error("Không thể tải cài đặt bài thi");
    } finally {
      setSettingsLoading(false);
    }
  };

  const toDatetimeLocalValue = (isoDate?: string) => {
    if (!isoDate) return "";
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return "";
    const localDate = new Date(
      parsed.getTime() - parsed.getTimezoneOffset() * 60000,
    );
    return localDate.toISOString().slice(0, 16);
  };

  const formatExamMetadata = (exam: Exam) => {
    const parts = [];
    if (exam.duration) parts.push(formatDurationVi(exam.duration));
    if (exam._count?.examQuestions) parts.push(`${exam._count.examQuestions} câu hỏi`);
    if (exam._count?.submissions) parts.push(`${exam._count.submissions} lượt nộp`);
    parts.push(`tạo lúc ${formatDateTimeVi(exam.createdAt)}`);
    return parts.join(" • ");
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [examsData, coursesData] = await Promise.all([
        api.getExams(),
        api.getCourses(),
      ]);
      const exams = unwrapPaginatedData(examsData);
      const courses = unwrapPaginatedData(coursesData);
      setExams(exams || []);
      setCourses(courses || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Không thể tải danh sách bài thi");
    } finally {
      setLoading(false);
    }
  };

  const examFilterDefinitions: FilterDefinition[] = useMemo(
    () => [
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
          { label: "Đã lưu trữ", value: "ARCHIVED" },
        ],
      },
      {
        key: "courseId",
        label: "Khóa học",
        type: "select",
        allLabel: "Tất cả khóa học",
        options: courses.map((course: any) => ({
          label: `${course.code} - ${course.name}`,
          value: course.id,
        })),
      },
      {
        key: "creatorId",
        label: "Người tạo",
        type: "select",
        allLabel: "Tất cả người tạo",
        options: Array.from(
          new Map(
            exams.map((exam) => [exam.creator.id, exam.creator.fullName]),
          ).entries(),
        ).map(([value, label]) => ({ label, value })),
      },
      {
        key: "title",
        label: "Tiêu đề",
        type: "text",
        placeholder: "Lọc theo tiêu đề",
        operators: ["contains", "startsWith", "equals"],
        defaultOperator: "contains",
      },
      {
        key: "totalPoints",
        label: "Tổng điểm",
        type: "number-range",
        min: 0,
        max: 500,
        step: 1,
      },
      {
        key: "createdAt",
        label: "Ngày tạo",
        type: "date-range",
      },
    ],
    [courses, exams],
  );

  const examSortOptions = [
    { field: "course.code", label: "Khóa học" },
    { field: "startTime", label: "Lịch thi" },
    { field: "status", label: "Trạng thái" },
    { field: "title", label: "Tiêu đề" },
  ];

  const normalizedSearch = appliedSearch.trim().toLowerCase();

  const filteredExams = useMemo(() => {
    const statusValue = appliedFilters.status as string | undefined;
    const courseValue = appliedFilters.courseId as string | undefined;
    const creatorValue = appliedFilters.creatorId as string | undefined;
    const titleFilter = appliedFilters.title as TextFilterValue | undefined;
    const totalPointsFilter = appliedFilters.totalPoints as
      | { min?: number; max?: number }
      | undefined;
    const createdAtRange = appliedFilters.createdAt as
      | { from?: string; to?: string }
      | undefined;

    const matchesText = (source: string, filter?: TextFilterValue) => {
      if (!filter || !filter.value.trim()) return true;
      const sourceValue = source.toLowerCase();
      const filterValue = filter.value.trim().toLowerCase();
      if (filter.operator === "startsWith")
        return sourceValue.startsWith(filterValue);
      if (filter.operator === "equals") return sourceValue === filterValue;
      return sourceValue.includes(filterValue);
    };

    const filtered = exams.filter((exam) => {
      const matchesSearch = !normalizedSearch
        ? true
        : [
            exam.title,
            exam.course.code,
            exam.course.name,
            exam.creator.fullName,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
      const matchesStatus =
        !statusValue || statusValue === "all" || exam.status === statusValue;
      const matchesCourse =
        !courseValue || courseValue === "all" || exam.course.id === courseValue;
      const matchesCreator =
        !creatorValue ||
        creatorValue === "all" ||
        exam.creator.id === creatorValue;
      const matchesTitle = matchesText(exam.title, titleFilter);
      const matchesPoints = (() => {
        if (
          !totalPointsFilter ||
          (totalPointsFilter.min === undefined &&
            totalPointsFilter.max === undefined)
        )
          return true;
        if (exam.totalPoints === undefined || exam.totalPoints === null)
          return false;
        if (
          totalPointsFilter.min !== undefined &&
          exam.totalPoints < totalPointsFilter.min
        )
          return false;
        if (
          totalPointsFilter.max !== undefined &&
          exam.totalPoints > totalPointsFilter.max
        )
          return false;
        return true;
      })();
      const matchesCreatedAt = (() => {
        if (!createdAtRange?.from && !createdAtRange?.to) return true;
        const createdAt = new Date(exam.createdAt).getTime();
        if (createdAtRange.from) {
          const from = new Date(createdAtRange.from).getTime();
          if (!Number.isNaN(from) && createdAt < from) return false;
        }
        if (createdAtRange.to) {
          const to = new Date(createdAtRange.to).getTime();
          if (!Number.isNaN(to) && createdAt > to) return false;
        }
        return true;
      })();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCourse &&
        matchesCreator &&
        matchesTitle &&
        matchesPoints &&
        matchesCreatedAt
      );
    });

    return sortItems(filtered, sortField, sortOrder);
  }, [exams, normalizedSearch, appliedFilters, sortField, sortOrder]);

  const [page, setPage] = useState(1);
  const EXAM_ROWS_PER_VIEW = 10;
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / EXAM_ROWS_PER_VIEW));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const displayedExams = useMemo(
    () => {
      const start = (page - 1) * EXAM_ROWS_PER_VIEW;
      return filteredExams.slice(start, start + EXAM_ROWS_PER_VIEW);
    },
    [filteredExams, page],
  );
  const EXAM_ROW_HEIGHT = 60;
  const EXAM_TABLE_HEADER_HEIGHT = 48;
  const EXAM_TABLE_MIN_HEIGHT =
    EXAM_ROWS_PER_VIEW * EXAM_ROW_HEIGHT + EXAM_TABLE_HEADER_HEIGHT;

  const activeFilterCount = getActiveFilterCount(
    appliedFilters,
    examFilterDefinitions,
  );
  const activeFilterChips = getFilterChips(
    appliedFilters,
    examFilterDefinitions,
  );

  const runSearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const removeFilter = (key: string) => {
    const nextFilters = {
      ...appliedFilters,
      [key]: EMPTY_FILTERS[key as keyof typeof EMPTY_FILTERS],
    };
    setAppliedFilters(nextFilters);
    setDraftFilters(nextFilters);
  };

  const handleDeleteExam = async () => {
    if (!selectedExam) return;
    try {
      setIsDeleting(true);
      await api.deleteExam(selectedExam.id);
      setExams(exams.filter((e) => e.id !== selectedExam.id));
      toast.success("Đã xóa bài thi thành công");
      setShowDeleteDialog(false);
      setSelectedExam(null);
    } catch (error: any) {
      console.error("Failed to delete exam:", error);
      toast.error(error?.message || "Không thể xóa bài thi");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenRescheduleDialog = (exam: Exam) => {
    setSelectedExam(exam);
    setRescheduleForm({
      startTime: toDatetimeLocalValue(exam.startTime),
      endTime: toDatetimeLocalValue(exam.endTime),
    });
    setShowRescheduleDialog(true);
  };

  const handleSaveReschedule = async () => {
    if (!selectedExam) return;

    if (!rescheduleForm.startTime || !rescheduleForm.endTime) {
      toast.error("Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc");
      return;
    }

    const startTime = new Date(rescheduleForm.startTime);
    const endTime = new Date(rescheduleForm.endTime);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      toast.error("Thời gian lịch thi không hợp lệ");
      return;
    }

    if (endTime <= startTime) {
      toast.error("Thời gian kết thúc phải sau thời gian bắt đầu");
      return;
    }

    if ((endTime.getTime() - startTime.getTime()) / 60000 < selectedExam.duration) {
      toast.error(`Khung giờ thi phải dài ít nhất ${selectedExam.duration} phút`);
      return;
    }

    try {
      setIsRescheduling(true);
      await api.rescheduleExam(selectedExam.id, {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });

      setExams((prev) =>
        prev.map((exam) =>
          exam.id === selectedExam.id
            ? {
                ...exam,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
              }
            : exam,
        ),
      );

      toast.success("Đã cập nhật lịch thi thành công");
      setShowRescheduleDialog(false);
      setSelectedExam(null);
    } catch (error) {
      console.error("Failed to reschedule exam:", error);
      toast.error("Không thể đổi lịch bài thi");
    } finally {
      setIsRescheduling(false);
    }
  };

  const stats = {
    total: exams.length,
    published: exams.filter((e) => e.status === "PUBLISHED").length,
    ongoing: exams.filter((e) => e.status === "ONGOING").length,
    submissions: exams.reduce(
      (sum, e) => sum + (e._count?.submissions || 0),
      0,
    ),
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Đang tải danh sách bài thi...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <AdminPageShell>
        <ListPageHeader
          title="Tất cả bài thi"
          className="mb-4"
          actions={
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Làm mới
            </Button>
          }
        />

        {/* Stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            icon={FileText}
            value={stats.total}
            label="Tổng số bài thi"
          />
          <AdminStatCard
            icon={CheckCircle2}
            value={stats.published}
            label="Đã công bố"
            iconWrapClassName="bg-blue-500/10"
            iconClassName="text-blue-600"
          />
          <AdminStatCard
            icon={Clock}
            value={stats.ongoing}
            label="Đang diễn ra"
            iconWrapClassName="bg-amber-500/10"
            iconClassName="text-amber-600"
          />
          <AdminStatCard
            icon={Users}
            value={stats.submissions}
            label="Tổng số lượt nộp"
            iconWrapClassName="bg-emerald-500/10"
            iconClassName="text-emerald-600"
          />
        </div>

        <div className="mb-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm bài thi, khóa học hoặc giảng viên"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
                bare
                title="Bộ lọc bài thi"
                description="Lọc theo trạng thái, khóa học, tiêu đề, thời lượng và ngày tạo."
                filters={examFilterDefinitions}
                value={draftFilters}
                onValueChange={(key, nextValue) =>
                  setDraftFilters((prev) => ({ ...prev, [key]: nextValue }))
                }
                onApply={applyFilters}
                onClear={clearFilters}
                activeCount={activeFilterCount}
                inline
                className="shrink-0"
              />
              <div className="hidden sm:block h-6 w-px bg-border/70 shrink-0" />
              <SortButton
                options={examSortOptions}
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

        {/* Exam List */}
        <Card>
          <CardContent className="p-0">
            {displayedExams.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center px-6 py-12 text-center"
                style={{ minHeight: EXAM_TABLE_MIN_HEIGHT }}
              >
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground font-medium">
                  {exams.length === 0
                    ? "Chưa có bài thi nào"
                    : "Không có bài thi phù hợp với bộ lọc"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {exams.length === 0
                    ? "Bài thi sẽ xuất hiện khi giảng viên tạo mới"
                    : "Hãy thử điều chỉnh bộ lọc"}
                </p>
              </div>
            ) : (
              <div
                className="overflow-hidden"
                style={{ minHeight: EXAM_TABLE_MIN_HEIGHT }}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="max-w-sm">Tiêu đề</TableHead>
                      <TableHead>Khóa học</TableHead>
                      <TableHead>Giảng viên</TableHead>
                      <TableHead>Lịch thi</TableHead>
                      <TableHead className="text-center">Lượt làm</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedExams.map((exam) => {
                      // exam.status is set once at creation/publish time and
                      // nothing in the app ever transitions it forward when
                      // the schedule closes, so a PUBLISHED/ONGOING exam
                      // whose endTime has already passed keeps showing that
                      // stale status forever. Override the badge the same
                      // way LecturerDashboard's "recent exams" list already
                      // does, so the two screens agree on the same exam.
                      const isPastEnd = Boolean(exam.endTime) && new Date(exam.endTime).getTime() < Date.now();
                      const resultsPublished = Boolean(exam.resultsPublishedAt);
                      return (
                        <TableRow key={exam.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">
                            <div>
                              <div className="truncate">{exam.title}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatExamMetadata(exam)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-mono">
                                {exam.course.code}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {exam.course.name}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {exam.creator.fullName}
                          </TableCell>
                          <TableCell className="max-w-[14rem]">
                            <div className="text-xs text-muted-foreground leading-5">
                              {exam.startTime ? (
                                <div className="truncate">
                                  <span className="font-medium">Bắt đầu:</span>{" "}
                                  {getScheduleLabel(exam.startTime)}
                                </div>
                              ) : (
                                <div className="truncate">Bắt đầu: Chưa lên lịch</div>
                              )}
                              {exam.endTime ? (
                                <div className="truncate">
                                  <span className="font-medium">Kết thúc:</span>{" "}
                                  {getScheduleLabel(exam.endTime)}
                                </div>
                              ) : (
                                <div className="truncate">Kết thúc: Chưa lên lịch</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {(exam._count?.submissions ?? 0) > 0 ? (
                              <button
                                type="button"
                                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                                onClick={() => router.push(`/admin/exam/${exam.id}/results`)}
                              >
                                {exam._count?.submissions}
                              </button>
                            ) : (
                              <span className="text-sm text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {exam.status === "ARCHIVED" ? (
                              <StatusBadge
                                status={exam.status}
                                domain="exam"
                                className="text-xs"
                              />
                            ) : resultsPublished ? (
                              <StatusBadge tone="success" className="text-xs">
                                Đã công bố kết quả
                              </StatusBadge>
                            ) : isPastEnd ? (
                              <StatusBadge tone="danger" className="text-xs">
                                Đã hết hạn
                              </StatusBadge>
                            ) : (
                              <StatusBadge
                                status={exam.status}
                                domain="exam"
                                className="text-xs"
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(`/admin/exam/${exam.id}/preview`)
                                  }
                                  className="gap-2 text-xs"
                                >
                                  <Eye className="h-4 w-4" />
                                  Xem trước
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void handleViewSettings(exam)}
                                  className="gap-2 text-xs"
                                >
                                  <Settings className="h-4 w-4" />
                                  Xem cài đặt
                                </DropdownMenuItem>
                                {(exam.status === "ONGOING" ||
                                  exam.status === "PUBLISHED") &&
                                  (!exam.endTime || new Date(exam.endTime).getTime() > Date.now()) && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(`/admin/exam/${exam.id}/monitor`)
                                    }
                                    className="gap-2 text-xs"
                                  >
                                    <Clock className="h-4 w-4" />
                                    Theo dõi
                                  </DropdownMenuItem>
                                )}
                                {(exam.status === "COMPLETED" ||
                                  (exam._count?.submissions ?? 0) > 0) && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(`/admin/exam/${exam.id}/results`)
                                    }
                                    className="gap-2 text-xs"
                                  >
                                    <BarChart3 className="h-4 w-4" />
                                    Kết quả
                                  </DropdownMenuItem>
                                )}
                                {(exam.status === "DRAFT" ||
                                  exam.status === "PUBLISHED") && (
                                  <DropdownMenuItem
                                    onClick={() => handleOpenRescheduleDialog(exam)}
                                    className="gap-2 text-xs"
                                  >
                                    <CalendarClock className="h-4 w-4" />
                                    Đổi lịch
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedExam(exam);
                                    setShowDeleteDialog(true);
                                  }}
                                  className="gap-2 text-destructive text-xs"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Xóa
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredExams.length}
              onPageChange={setPage}
              itemLabel="bài thi"
            />
          </CardContent>
        </Card>
      </AdminPageShell>

      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cài đặt bài thi</DialogTitle>
            <DialogDescription>{selectedExam?.title}</DialogDescription>
          </DialogHeader>
          {settingsLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải cài đặt...
            </div>
          ) : settingsExam ? (
            (() => {
              const settings = settingsExam.settings || {};
              const proctoringEnabled = settings.proctoringEnabled === undefined
                ? Boolean(settings.requiresProctoring)
                : Boolean(settings.proctoringEnabled);
              const webcamPolicy = settings.webcamEvidencePolicy || {};
              const maxAttempts = settingsExam.maxAttempts;
              return (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Thời lượng</p>
                      <p className="mt-1 flex items-center gap-1.5 font-medium"><Clock className="h-3.5 w-3.5" />{settingsExam.duration ?? settingsExam.timeLimitMinutes ?? "—"} phút</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Số lần làm tối đa</p>
                      <p className="mt-1 flex items-center gap-1.5 font-medium"><Repeat className="h-3.5 w-3.5" />{maxAttempts == null ? "Không giới hạn" : maxAttempts}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Điểm tối đa</p>
                      <p className="mt-1 font-medium">{settingsExam.totalPoints ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Điểm đạt</p>
                      <p className="mt-1 font-medium">{settingsExam.passingScore ?? "—"}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Shield className="h-3.5 w-3.5" /> Giám sát</p>
                    <p className="mt-1 font-medium">{proctoringEnabled ? "Đã bật" : "Đã tắt"}</p>
                  </div>
                  {proctoringEnabled && (
                    <div className="rounded-lg border p-3">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" /> Bằng chứng webcam</p>
                      <p className="mt-1 font-medium">
                        {webcamPolicy.enabled ? "Đã bật" : "Đã tắt"}
                        {webcamPolicy.enabled && webcamPolicy.screenCaptureEnabled ? " · Kèm chụp màn hình" : ""}
                      </p>
                    </div>
                  )}
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Mô tả</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground">{settingsExam.description || "Chưa có mô tả"}</p>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Không thể tải cài đặt bài thi</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi lịch bài thi</DialogTitle>
            <DialogDescription>
              Cập nhật thời gian bắt đầu và kết thúc cho "{selectedExam?.title}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminRescheduleStartTime">Thời gian bắt đầu</Label>
              <Input
                id="adminRescheduleStartTime"
                type="datetime-local"
                value={rescheduleForm.startTime}
                onChange={(e) =>
                  setRescheduleForm((prev) => ({
                    ...prev,
                    startTime: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminRescheduleEndTime">Thời gian kết thúc</Label>
              <Input
                id="adminRescheduleEndTime"
                type="datetime-local"
                value={rescheduleForm.endTime}
                onChange={(e) =>
                  setRescheduleForm((prev) => ({
                    ...prev,
                    endTime: e.target.value,
                  }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Khung giờ thi phải dài ít nhất bằng thời lượng đã cấu hình.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRescheduleDialog(false)}
            >
              Hủy
            </Button>
            <Button onClick={handleSaveReschedule} disabled={isRescheduling}>
              {isRescheduling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Lưu lịch thi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa bài thi</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa "{selectedExam?.title}"? Thao tác này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteExam}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}



