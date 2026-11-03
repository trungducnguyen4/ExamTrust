"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  FileText,
  Clock,
  CalendarClock,
  Eye,
  Edit2,
  Trash2,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Archive,
  RotateCcw,
  MoreHorizontal,
  RefreshCw,
  Settings,
  Shield,
  Repeat,
  Camera,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import api, { unwrapPaginatedData } from "@/lib/api";
import {
  getNumericInputError,
  parseNumericInput,
  sanitizeNumericInput,
} from "@/lib/number-input";
import { formatDateTimeVi, formatDurationVi, getScheduleLabel } from "@/lib/presentation";
import { toast } from "sonner";

interface Exam {
  id: string;
  title: string;
  description?: string;
  course: { id: string; code: string; name: string };
  status: "DRAFT" | "PUBLISHED" | "ONGOING" | "COMPLETED" | "ARCHIVED";
  duration: number;
  totalPoints?: number;
  passingScore?: number;
  startTime?: string;
  endTime?: string;
  createdAt: string;
  updatedAt: string;
  resultsPublishedAt?: string | null;
  _count?: {
    examQuestions: number;
    submissions: number;
  };
}

interface CourseOption {
  id: string;
  code: string;
  name: string;
}

const GRADING_STRATEGY_LABELS: Record<string, string> = {
  HIGHEST: "Lấy điểm cao nhất",
  AVERAGE: "Lấy điểm trung bình",
  FIRST_ATTEMPT: "Lượt làm đầu tiên",
  LAST_ATTEMPT: "Lượt làm cuối cùng",
};

function formatSecondsLabel(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} giờ`);
  if (minutes) parts.push(`${minutes} phút`);
  if (seconds || parts.length === 0) parts.push(`${seconds} giây`);
  return parts.join(" ");
}

export default function ExamManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get("status")?.toUpperCase() || "all";
  const requestedTimeRange = searchParams.get("timeRange") || "";
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>({
    status: requestedStatus,
    courseId: "all",
    title: { value: "", operator: "contains" },
    createdAt: { from: undefined, to: undefined },
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>({
    status: requestedStatus,
    courseId: "all",
    title: { value: "", operator: "contains" },
    createdAt: { from: undefined, to: undefined },
  });
  const [sortField, setSortField] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [publishingExamId, setPublishingExamId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsExam, setSettingsExam] = useState<any>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [editForm, setEditForm] = useState({
    description: "",
    showResultImmediately: false,
  });
  const [editFormLoading, setEditFormLoading] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({
    startTime: "",
    endTime: "",
  });

  const toDatetimeLocalValue = (isoDate?: string) => {
    if (!isoDate) return "";
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return "";
    const localDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  };

  const formatExamMetadata = (exam: Exam) => {
    const parts = [];
    if (exam.duration) parts.push(formatDurationVi(exam.duration));
    if (exam._count?.examQuestions) parts.push(`${exam._count.examQuestions} câu hỏi`);
    if (exam._count?.submissions) parts.push(`${exam._count.submissions} lượt nộp`);
    // updatedAt equals createdAt (Prisma @updatedAt) until the exam is first
    // edited — so this naturally falls back to the creation date on its own.
    const hasBeenEdited = new Date(exam.updatedAt).getTime() - new Date(exam.createdAt).getTime() > 1000;
    parts.push(
      hasBeenEdited
        ? `cập nhật lúc ${formatDateTimeVi(exam.updatedAt)}`
        : `tạo lúc ${formatDateTimeVi(exam.createdAt)}`,
    );
    return parts.join(" • ");
  };

  useEffect(() => {
    void fetchExams();
  }, []);

  // requestedStatus comes from useSearchParams(), which re-renders this
  // component on every URL query change — but since this page never
  // unmounts when only the query string changes (same route), the
  // useState initializers above only capture it once, at first mount.
  // Without this, navigating here a second time with a different
  // ?status= (e.g. from the dashboard's "Cần bạn chú ý" widget) leaves
  // the filter — and the page number — stuck on whatever was set last
  // time, so the requested status can silently show as empty.
  useEffect(() => {
    setDraftFilters((prev) => ({ ...prev, status: requestedStatus }));
    setAppliedFilters((prev) => ({ ...prev, status: requestedStatus }));
    setPage(1);
  }, [requestedStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchExams = async () => {
    try {
      setLoading(true);
      const [examData, courseData] = await Promise.all([
        api.getExams({
          // This screen filters, sorts, and paginates the complete lecturer
          // dataset locally. Always fetch the first backend page so changing
          // the UI page never skips another 500-record backend page.
          page: 1,
          limit: 500, // Fetch all exams for client-side pagination
          includeArchived: true,
        }),
        api.getMyCourses(),
      ]);
      setExams(unwrapPaginatedData(examData) || []);
      setCourses(
        (Array.isArray(courseData)
          ? courseData
          : unwrapPaginatedData(courseData)) || [],
      );
    } catch (error) {
      console.error("Failed to fetch exams:", error);
      toast.error("Không thể tải danh sách bài thi");
    } finally {
      setLoading(false);
    }
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
    } catch (error) {
      console.error("Failed to delete exam:", error);
      toast.error("Không thể xóa bài thi");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchiveExam = async () => {
    if (!selectedExam) return;
    try {
      setIsArchiving(true);
      const archived = selectedExam.status === 'ARCHIVED';
      await (archived ? api.restoreExam(selectedExam.id) : api.archiveExam(selectedExam.id));
      setExams((previous) => previous.filter((exam) => exam.id !== selectedExam.id));
      toast.success(archived ? 'Đã khôi phục bài thi' : 'Đã lưu trữ bài thi');
      setShowArchiveDialog(false);
      setSelectedExam(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể cập nhật bài thi');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleEditExam = async (exam: Exam) => {
    if (exam.status === "DRAFT") {
      router.push(`/lecturer/exams/create?id=${exam.id}`);
      return;
    }
    setSelectedExam(exam);
    setEditForm({ description: exam.description || "", showResultImmediately: false });
    setShowEditDialog(true);
    setEditFormLoading(true);
    try {
      // Exam list rows don't carry `settings` — fetch the current value so the
      // toggle doesn't silently default to off and overwrite it on save.
      const detail = await api.getExam(exam.id);
      setEditForm({
        description: detail.description || "",
        showResultImmediately: Boolean(detail.settings?.showResultImmediately),
      });
    } catch (error) {
      console.error("Failed to load exam settings for edit:", error);
      toast.error("Không thể tải cài đặt hiện tại của bài thi");
    } finally {
      setEditFormLoading(false);
    }
  };

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

  const handleSaveEdit = async () => {
    if (!selectedExam) return;
    try {
      setIsUpdating(true);
      // Exam is already PUBLISHED/etc. here (DRAFT exams route to the full
      // create/edit page instead) — the BE only accepts description/
      // reviewSettings/settings once an exam has left DRAFT, since submissions
      // may already reference its question snapshots and grading config.
      const updateData = {
        description: editForm.description,
        settings: { showResultImmediately: editForm.showResultImmediately },
      };
      await api.updateExam(selectedExam.id, updateData);

      setExams(
        exams.map((e) =>
          e.id === selectedExam.id ? { ...e, description: editForm.description } : e,
        ),
      );

      toast.success("Đã cập nhật bài thi thành công");
      setShowEditDialog(false);
      setSelectedExam(null);
    } catch (error) {
      console.error("Failed to update exam:", error);
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật bài thi");
    } finally {
      setIsUpdating(false);
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

  const handleRepublishExam = async (exam: Exam) => {
    try {
      setPublishingExamId(exam.id);
      const updated = await api.publishExam(exam.id);
      setExams((prev) =>
        prev.map((item) =>
          item.id === exam.id
            ? { ...item, status: (updated?.status as Exam["status"]) || "PUBLISHED" }
            : item,
        ),
      );
      toast.success("Đã công bố lại bài thi và tạo snapshot cho học sinh.");
    } catch (error) {
      console.error("Failed to republish exam:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể công bố lại bài thi",
      );
    } finally {
      setPublishingExamId(null);
    }
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
      toast.error(
        `Khung giờ thi phải dài ít nhất ${selectedExam.duration} phút`,
      );
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
      toast.error(error instanceof Error ? error.message : "Không thể đổi lịch bài thi");
    } finally {
      setIsRescheduling(false);
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
        options: courses.map((course) => ({
          label: `${course.code} - ${course.name}`,
          value: course.id,
        })),
      },
      {
        key: "title",
        label: "Tiêu đề",
        type: "text",
        placeholder: "Lọc theo tiêu đề",
        operators: ["contains", "startsWith", "equals"],
      },
      {
        key: "createdAt",
        label: "Ngày tạo",
        type: "date-range",
      },
    ],
    [courses],
  );

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filteredExams = useMemo(() => {
    const statusValue = appliedFilters.status as string | undefined;
    const courseValue = appliedFilters.courseId as string | undefined;
    const titleFilter = appliedFilters.title as TextFilterValue | undefined;
    const createdAtRange = appliedFilters.createdAt as
      | { from?: string; to?: string }
      | undefined;
    const now = Date.now();
    const next24Hours = now + 24 * 60 * 60 * 1000;

    const matchesText = (source: string, filter?: TextFilterValue) => {
      if (!filter || !filter.value.trim()) return true;
      const sourceValue = source.toLowerCase();
      const filterValue = filter.value.trim().toLowerCase();
      if (filter.operator === "startsWith") return sourceValue.startsWith(filterValue);
      if (filter.operator === "equals") return sourceValue === filterValue;
      return sourceValue.includes(filterValue);
    };

    const filtered = exams.filter((exam) => {
      const matchesSearch = !normalizedSearch
        ? true
        : [exam.title, exam.course.code, exam.course.name]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);

      const matchesStatus =
        !statusValue ||
        statusValue === "all" ||
        exam.status?.toUpperCase() === statusValue.toUpperCase();
      const matchesCourse =
        !courseValue || courseValue === "all" || exam.course.id === courseValue;
      const matchesTitle = matchesText(exam.title, titleFilter);

      const matchesCreatedAt = (() => {
        if (!createdAtRange || (!createdAtRange.from && !createdAtRange.to)) {
          return true;
        }
        const createdAt = new Date(exam.createdAt).getTime();
        if (Number.isNaN(createdAt)) return false;
        if (createdAtRange.from) {
          const fromTs = new Date(createdAtRange.from).getTime();
          if (!Number.isNaN(fromTs) && createdAt < fromTs) return false;
        }
        if (createdAtRange.to) {
          const toDate = new Date(createdAtRange.to);
          toDate.setHours(23, 59, 59, 999);
          const toTs = toDate.getTime();
          if (!Number.isNaN(toTs) && createdAt > toTs) return false;
        }
        return true;
      })();

      const startTime = exam.startTime ? new Date(exam.startTime).getTime() : NaN;
      const matchesTimeRange =
        requestedTimeRange !== "next24Hours" ||
        (exam.status === "PUBLISHED" &&
          Number.isFinite(startTime) &&
          startTime > now &&
          startTime <= next24Hours);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesCourse &&
        matchesTitle &&
        matchesCreatedAt &&
        matchesTimeRange
      );
    });

    return sortItems(filtered, sortField, sortOrder);
  }, [appliedFilters, exams, normalizedSearch, requestedTimeRange, sortField, sortOrder]);

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
      courseId: "all",
      title: { value: "", operator: "contains" },
      createdAt: { from: undefined, to: undefined },
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
      courseId: "all",
      title: { value: "", operator: "contains" },
      createdAt: { from: undefined, to: undefined },
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

  const examSortOptions = [
    { field: "updatedAt", label: "Cập nhật gần nhất" },
    { field: "course.code", label: "Khóa học" },
    { field: "startTime", label: "Lịch thi" },
    { field: "status", label: "Trạng thái" },
  ];

  const ITEMS_PER_PAGE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / ITEMS_PER_PAGE));
  const EXAM_ROW_HEIGHT = 60;
  const EXAM_TABLE_HEADER_HEIGHT = 48;
  const EXAM_TABLE_MIN_HEIGHT =
    ITEMS_PER_PAGE * EXAM_ROW_HEIGHT + EXAM_TABLE_HEADER_HEIGHT;

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedExams = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredExams.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredExams, page]);

  const stats = {
    total: exams.length,
    published: exams.filter((e) => e.status === "PUBLISHED").length,
    ongoing: exams.filter((e) => e.status === "ONGOING").length,
    draft: exams.filter((e) => e.status === "DRAFT").length,
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
      <AdminPageShell backTo="/lecturer">
        <ListPageHeader
          title="Quản lý bài thi"
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchExams}
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
              <Button
                onClick={() => router.push("/lecturer/exams/create")}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Tạo bài thi
              </Button>
            </>
          }
        />

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            icon={AlertCircle}
            value={stats.draft}
            label="Bản nháp"
            iconWrapClassName="bg-gray-500/10"
            iconClassName="text-gray-600"
          />
        </div>

        <div className="mb-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm bài thi hoặc khóa học"
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
          <CardContent>
            {filteredExams.length === 0 ? (
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
                    ? "Tạo bài thi đầu tiên để bắt đầu"
                    : "Hãy thử điều chỉnh bộ lọc"}
                </p>
                {exams.length === 0 && (
                  <Button
                    onClick={() => router.push("/lecturer/exams/create")}
                    className="mt-4"
                    size="sm"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Tạo bài thi
                  </Button>
                )}
              </div>
            ) : (
              <div
                className="overflow-x-auto"
                style={{ minHeight: EXAM_TABLE_MIN_HEIGHT }}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[18rem]">Bài kiểm tra &amp; khóa học</TableHead>
                      <TableHead className="min-w-[15rem]">Thời gian làm bài</TableHead>
                      <TableHead className="text-center">Lượt làm</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedExams.map((exam) => {
                      const canViewResults = (exam._count?.submissions ?? 0) > 0;
                      // exam.status is set once at creation/publish time and
                      // nothing in the app ever transitions it forward when
                      // the schedule closes, so a PUBLISHED/ONGOING exam
                      // whose endTime has already passed keeps showing that
                      // stale status forever. Override the badge the same
                      // way LecturerDashboard's "recent exams" list already
                      // does, so the two screens agree on the same exam.
                      const isPastEnd = Boolean(exam.endTime) && new Date(exam.endTime as string).getTime() < Date.now();
                      const resultsPublished = Boolean(exam.resultsPublishedAt);
                      return (
                        <TableRow key={exam.id} className="hover:bg-muted/50">
                          <TableCell className="min-w-[18rem]">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">
                                {exam.title}
                              </div>
                              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm">
                                <span className="truncate font-medium text-foreground">
                                  {exam.course.name}
                                </span>
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                  {exam.course.code}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatExamMetadata(exam)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[15rem]">
                            <div className="space-y-1.5 text-xs">
                              {exam.startTime ? (
                                <div className="flex items-start gap-1.5">
                                  <span className="shrink-0 font-medium text-foreground">
                                    Bắt đầu
                                  </span>
                                  <span className="text-muted-foreground">
                                    {getScheduleLabel(exam.startTime)}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-start gap-1.5">
                                  <span className="shrink-0 font-medium text-foreground">
                                    Bắt đầu
                                  </span>
                                  <span className="text-muted-foreground">Chưa lên lịch</span>
                                </div>
                              )}
                              {exam.endTime ? (
                                <div className="flex items-start gap-1.5 border-t border-border/60 pt-1.5">
                                  <span className="shrink-0 font-medium text-foreground">
                                    Kết thúc
                                  </span>
                                  <span className="text-muted-foreground">
                                    {getScheduleLabel(exam.endTime)}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-start gap-1.5 border-t border-border/60 pt-1.5">
                                  <span className="shrink-0 font-medium text-foreground">
                                    Kết thúc
                                  </span>
                                  <span className="text-muted-foreground">Chưa lên lịch</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {canViewResults ? (
                              <button
                                type="button"
                                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                                onClick={() => router.push(`/lecturer/exam/${exam.id}/results`)}
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
                            <div className="flex items-center justify-end gap-1.5">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="gap-2 text-xs"
                                    onClick={() => router.push(`/lecturer/exam/${exam.id}/preview`)}
                                  >
                                    <Eye className="h-4 w-4" />
                                    Xem trước
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="gap-2 text-xs"
                                    onClick={() => void handleViewSettings(exam)}
                                  >
                                    <Settings className="h-4 w-4" />
                                    Xem cài đặt
                                  </DropdownMenuItem>
                                  {(exam.status === "ONGOING" ||
                                    exam.status === "PUBLISHED") &&
                                    (!exam.endTime || new Date(exam.endTime).getTime() > Date.now()) && (
                                    <DropdownMenuItem
                                      className="gap-2 text-xs"
                                      onClick={() => router.push(`/lecturer/exam/${exam.id}/monitor`)}
                                    >
                                      <Clock className="h-4 w-4" />
                                      Theo dõi
                                    </DropdownMenuItem>
                                  )}
                                  {canViewResults && (
                                    <DropdownMenuItem
                                      className="gap-2 text-xs"
                                      onClick={() => router.push(`/lecturer/exam/${exam.id}/results`)}
                                    >
                                      <BarChart3 className="h-4 w-4" />
                                      Kết quả &amp; Chấm bài
                                    </DropdownMenuItem>
                                  )}
                                  {(exam.status === "DRAFT" ||
                                    exam.status === "PUBLISHED") && (
                                    <DropdownMenuItem
                                      className="gap-2 text-xs"
                                      onClick={() => handleOpenRescheduleDialog(exam)}
                                    >
                                      <CalendarClock className="h-4 w-4" />
                                      Đổi lịch
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    className="gap-2 text-xs"
                                    onClick={() => {
                                      setSelectedExam(exam);
                                      setShowArchiveDialog(true);
                                    }}
                                  >
                                    {exam.status === "ARCHIVED" ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                    {exam.status === "ARCHIVED" ? "Khôi phục" : "Lưu trữ"}
                                  </DropdownMenuItem>
                                  {(exam.status === "DRAFT" ||
                                    exam.status === "PUBLISHED" ||
                                    exam.status === "ONGOING") && (
                                    <DropdownMenuItem
                                      className="gap-2 text-xs"
                                      onClick={() => void handleEditExam(exam)}
                                    >
                                      <Edit2 className="h-4 w-4" />
                                      Sửa
                                    </DropdownMenuItem>
                                  )}
                                  {exam.status === "DRAFT" && (
                                    <DropdownMenuItem
                                      className="gap-2 text-destructive text-xs"
                                      onClick={() => {
                                        setSelectedExam(exam);
                                        setShowDeleteDialog(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Xóa
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          <DataPagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredExams.length}
            onPageChange={setPage}
            itemLabel="bài thi"
          />
        </Card>
      </AdminPageShell>

      {/* Edit Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
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
              const questionCount = Array.isArray(settingsExam.examQuestions) ? settingsExam.examQuestions.length : null;
              return (
                <div className="space-y-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Khóa học</p>
                    <p className="mt-1 font-medium">
                      {settingsExam.course ? `${settingsExam.course.code} · ${settingsExam.course.name}` : "—"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Bắt đầu</p>
                      <p className="mt-1 font-medium">{formatDateTimeVi(settingsExam.startTime)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Kết thúc</p>
                      <p className="mt-1 font-medium">{formatDateTimeVi(settingsExam.endTime)}</p>
                    </div>
                  </div>

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
                      <p className="text-xs text-muted-foreground">Số câu hỏi</p>
                      <p className="mt-1 font-medium">{questionCount ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Cách tính điểm</p>
                      <p className="mt-1 font-medium">{GRADING_STRATEGY_LABELS[settingsExam.gradingStrategy] || "Lấy điểm cao nhất"}</p>
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

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Trộn câu hỏi</p>
                      <p className="mt-1 font-medium">{settings.shuffleQuestions ? "Có" : "Không"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Cho nộp bài trễ</p>
                      <p className="mt-1 font-medium">{settingsExam.allowLateSubmission ? "Có" : "Không"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Công bố kết quả ngay sau khi nộp</p>
                      <p className="mt-1 font-medium">{settings.showResultImmediately ? "Có" : "Không"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Trạng thái</p>
                      <p className="mt-1 font-medium">{settingsExam.status ?? "—"}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Shield className="h-3.5 w-3.5" /> Giám sát</p>
                    <p className="mt-1 font-medium">{proctoringEnabled ? "Đã bật" : "Đã tắt"}</p>
                  </div>

                  {proctoringEnabled && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" /> Bằng chứng webcam</p>
                      <p className="font-medium">
                        {webcamPolicy.enabled ? "Đã bật" : "Đã tắt"}
                        {webcamPolicy.enabled && webcamPolicy.screenCaptureEnabled ? " · Kèm chụp màn hình" : ""}
                      </p>
                      {webcamPolicy.enabled && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                          <p>Ngưỡng không thao tác: <span className="text-foreground">{webcamPolicy.mouseIdleThresholdMs ? formatSecondsLabel(Math.round(webcamPolicy.mouseIdleThresholdMs / 1000)) : "—"}</span></p>
                          <p>Cooldown chụp sự kiện: <span className="text-foreground">{webcamPolicy.eventCooldownMs ? formatSecondsLabel(Math.round(webcamPolicy.eventCooldownMs / 1000)) : "—"}</span></p>
                          <p className="col-span-2">
                            Chụp định kỳ: <span className="text-foreground">{webcamPolicy.scheduledCaptureIntervalSeconds
                              ? `mỗi ${formatSecondsLabel(webcamPolicy.scheduledCaptureIntervalSeconds)} (kèm ảnh đầu/cuối)`
                              : "5 mốc theo % thời gian (mặc định)"}</span>
                          </p>
                        </div>
                      )}
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
            {(selectedExam?.status === "DRAFT" ||
              selectedExam?.status === "PUBLISHED" ||
              selectedExam?.status === "ONGOING") && (
              <Button
                onClick={() => {
                  setShowSettingsDialog(false);
                  if (selectedExam) void handleEditExam(selectedExam);
                }}
              >
                Sửa cài đặt
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa cài đặt bài thi</DialogTitle>
            <DialogDescription>
              Bài thi đã công bố và/hoặc đã có lượt làm bài nên chỉ có thể sửa mô tả và chính sách công bố kết quả —
              câu hỏi, thời lượng, điểm đạt... đã bị khóa để không làm sai lệch các bài đã nộp/đã chấm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">Mô tả</Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Mô tả bài thi"
                rows={3}
                disabled={editFormLoading}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="showResultImmediately" className="text-sm font-medium">
                  Công bố kết quả ngay sau khi nộp
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Chỉ áp dụng cho bài chấm hoàn toàn tự động. Nếu có câu tự luận/chấm tay, vẫn phải bấm "Công bố kết quả" thủ công sau khi chấm xong.
                </p>
              </div>
              <Switch
                id="showResultImmediately"
                checked={editForm.showResultImmediately}
                onCheckedChange={(v) => setEditForm((prev) => ({ ...prev, showResultImmediately: v }))}
                disabled={editFormLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Hủy
            </Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating || editFormLoading}>
              {isUpdating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
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
              <Label htmlFor="rescheduleStartTime">Thời gian bắt đầu</Label>
              <Input
                id="rescheduleStartTime"
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
              <Label htmlFor="rescheduleEndTime">Thời gian kết thúc</Label>
              <Input
                id="rescheduleEndTime"
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
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa bài thi</DialogTitle>
            <DialogDescription>
              Chỉ bản nháp chưa có dữ liệu làm bài mới có thể xóa. Bài thi khác sẽ được lưu trữ để giữ lịch sử.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteExam}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Xóa bản nháp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedExam?.status === 'ARCHIVED' ? 'Khôi phục bài thi?' : 'Lưu trữ bài thi?'}</DialogTitle>
            <DialogDescription>
              {selectedExam?.status === 'ARCHIVED'
                ? 'Bài thi sẽ trở lại danh sách quản lý phù hợp với trạng thái trước đó.'
                : 'Bài thi sẽ được ẩn khỏi danh sách quản lý thông thường. Toàn bộ lượt làm bài, điểm và dữ liệu giám sát vẫn được giữ lại.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArchiveDialog(false)}>Hủy</Button>
            <Button onClick={handleArchiveExam} disabled={isArchiving}>
              {isArchiving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {selectedExam?.status === 'ARCHIVED' ? 'Khôi phục' : 'Lưu trữ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}



