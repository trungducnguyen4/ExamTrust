"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Archive,
  RotateCcw,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api, { unwrapPaginatedData } from "@/lib/api";
import {
  COURSE_TERM_OPTIONS,
  CourseTerm,
  formatCourseTerm,
  getAcademicYearOptions,
  getCurrentAcademicTerm,
} from "@/lib/course-term";
import {
  getNumericInputError,
  parseNumericInput,
  sanitizeNumericInput,
} from "@/lib/number-input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Lecturer {
  id: string;
  fullName: string;
  email: string;
}

interface StudentSearchResult {
  id: string;
  email: string;
  fullName: string;
  studentId: string | null;
  department: string | null;
}

interface EnrollResult {
  email: string;
  fullName?: string;
  studentId?: string | null;
  status: "success" | "failed" | "provisioned";
  reason?: string;
}

interface CourseItem {
  id: string;
  code: string;
  name: string;
  academicYear?: string;
  term?: CourseTerm;
  description?: string;
  credits?: number;
  status?: string;
  lecturerId?: string | null;
  lecturer?: Lecturer | null;
  _count?: {
    enrollments?: number;
    exams?: number;
  };
}

interface CourseForm {
  name: string;
  academicYear: string;
  term: CourseTerm;
  description: string;
  credits: string;
  lecturerId: string;
}

const academicYearOptions = getAcademicYearOptions();
const { academicYear: defaultAcademicYear, term: defaultTerm } =
  getCurrentAcademicTerm();

const defaultForm: CourseForm = {
  name: "",
  academicYear: defaultAcademicYear,
  term: defaultTerm,
  description: "",
  credits: "",
  lecturerId: "unassigned",
};

const toAsciiUpper = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toUpperCase();

const buildToken = (value: string, maxLength: number, fallback: string) => {
  const compact = toAsciiUpper(value).split(/\s+/).filter(Boolean).join("");
  return (compact.slice(0, maxLength) || fallback).toUpperCase();
};

const EMPTY_FILTERS: FilterValues = {
  status: "all",
  lecturerId: "all",
  academicYear: { value: "", operator: "contains" },
  term: "all",
  credits: { min: undefined, max: undefined },
};

export default function AdminCourseManagement() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [archiveScope, setArchiveScope] = useState<'active' | 'archived'>('active');
  const [actionCourse, setActionCourse] = useState<CourseItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleteCourse, setDeleteCourse] = useState<CourseItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterValues>(EMPTY_FILTERS);
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CourseForm>(defaultForm);
  const [editForm, setEditForm] = useState<CourseForm>(defaultForm);
  const [createCreditsError, setCreateCreditsError] = useState("");
  const [editCreditsError, setEditCreditsError] = useState("");

  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [createdCourse, setCreatedCourse] = useState<{ id: string; name: string } | null>(null);
  const [lecturerSearch, setLecturerSearch] = useState("");
  const [selectedLecturerId, setSelectedLecturerId] = useState("unassigned");
  const [assigningLecturer, setAssigningLecturer] = useState(false);

  const [enrollTab, setEnrollTab] = useState<"manual" | "import">("manual");
  const [studentSearch, setStudentSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<StudentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvEmails, setCsvEmails] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollResults, setEnrollResults] = useState<EnrollResult[]>([]);
  const [provisionedCount, setProvisionedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetCreateWizard = () => {
    setCreateStep(1);
    setCreateForm(defaultForm);
    setCreateCreditsError("");
    setCreatedCourse(null);
    setSelectedLecturerId("unassigned");
    setLecturerSearch("");
    setEnrollTab("manual");
    setStudentSearch("");
    setSearchResults([]);
    setSelectedStudents([]);
    setCsvText("");
    setCsvEmails([]);
    setCsvFileName("");
    setEnrollResults([]);
    setProvisionedCount(0);
  };

  const handleStudentSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        setIsSearching(true);
        const students = await api.getStudents();
        const q = query.toLowerCase();
        const filtered = students
          .filter(
            (s: StudentSearchResult) =>
              s.email.toLowerCase().includes(q) ||
              s.fullName.toLowerCase().includes(q) ||
              (s.studentId && s.studentId.toLowerCase().includes(q)),
          )
          .filter(
            (s: StudentSearchResult) =>
              !selectedStudents.some((sel) => sel.id === s.id),
          );
        setSearchResults(filtered.slice(0, 10));
      } catch (err) {
        console.error("Failed to search students:", err);
      } finally {
        setIsSearching(false);
      }
    },
    [selectedStudents],
  );

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      handleStudentSearch(studentSearch);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [studentSearch, handleStudentSearch]);

  const addStudent = (student: StudentSearchResult) => {
    setSelectedStudents((prev) => [...prev, student]);
    setSearchResults((prev) => prev.filter((s) => s.id !== student.id));
    setStudentSearch("");
  };

  const removeStudent = (studentId: string) => {
    setSelectedStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const parseEmailsFromCSV = (text: string): string[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const emails: string[] = [];
    for (const line of lines) {
      const parts = line
        .split(/[,;\t]/)
        .map((p) => p.trim().replace(/^["']|["']$/g, ""));
      for (const part of parts) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) {
          emails.push(part.toLowerCase());
        }
      }
    }
    return [...new Set(emails)];
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const emails = parseEmailsFromCSV(text);
      setCsvEmails(emails);
      setCsvText(text);
    };
    reader.readAsText(file);
  };

  const handlePasteEmails = (text: string) => {
    setCsvText(text);
    const emails = parseEmailsFromCSV(text);
    setCsvEmails(emails);
  };

  const downloadTemplate = () => {
    const csvContent =
      "email\nstudent@examtrust.edu\nstudent2@examtrust.edu\nstudent3@examtrust.edu";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEnrollStudents = async () => {
    if (!createdCourse) return;
    setIsEnrolling(true);
    setEnrollResults([]);

    try {
      if (enrollTab === "manual" && selectedStudents.length > 0) {
        const result = await api.bulkEnroll(
          createdCourse.id,
          selectedStudents.map((s) => s.id),
        );
        const results: EnrollResult[] = [
          ...result.success.map((id: string) => {
            const student = selectedStudents.find((s) => s.id === id);
            return {
              email: student?.email || id,
              fullName: student?.fullName,
              studentId: student?.studentId,
              status: "success" as const,
            };
          }),
          ...result.failed.map((f: { studentId: string; reason: string }) => {
            const student = selectedStudents.find((s) => s.id === f.studentId);
            return {
              email: student?.email || f.studentId,
              status: "failed" as const,
              reason: f.reason,
            };
          }),
        ];
        setEnrollResults(results);
        await fetchData();
      } else if (enrollTab === "import" && csvEmails.length > 0) {
        const result = await api.bulkEnrollByEmails(createdCourse.id, csvEmails);
        const results: EnrollResult[] = [
          ...result.success.map((s: any) => ({
            email: s.email,
            fullName: s.fullName,
            studentId: s.studentId,
            status: "success" as const,
          })),
          ...result.failed.map((f: any) => ({
            email: f.email,
            status: "failed" as const,
            reason: f.reason,
          })),
        ];
        setEnrollResults(results);
        setProvisionedCount(result.provisioned ?? 0);
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to enroll students:", err);
    } finally {
      setIsEnrolling(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [coursesRes, lecturersRes] = await Promise.all([
        api.getCourses({ page: 1, limit: 200, archiveStatus: archiveScope }),
        api.getLecturers(),
      ]);

      setCourses(unwrapPaginatedData<CourseItem>(coursesRes));
      setLecturers(lecturersRes || []);
    } catch (error) {
      console.error("Failed to load course management data", error);
      toast.error(
        error instanceof Error ? error.message : "Không thể tải danh sách khóa học",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [archiveScope]);

  const courseFilterDefinitions: FilterDefinition[] = useMemo(
    () => [
      {
        key: "status",
        label: "Trạng thái",
        type: "select",
        allLabel: "Tất cả trạng thái",
        options: [
          { label: "Bản nháp", value: "draft" },
          { label: "Đang hoạt động", value: "active" },
          { label: "Đã lưu trữ", value: "archived" },
        ],
      },
      {
        key: "lecturerId",
        label: "Giảng viên",
        type: "select",
        allLabel: "Tất cả giảng viên",
        options: lecturers.map((lecturer) => ({
          label: lecturer.fullName,
          value: lecturer.id,
        })),
      },
      {
        key: "academicYear",
        label: "Năm học",
        type: "text",
        placeholder: "Lọc theo năm học",
        operators: ["contains", "startsWith", "equals"],
        defaultOperator: "contains",
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
      {
        key: "credits",
        label: "Tín chỉ",
        type: "number-range",
        min: 0,
        max: 10,
        step: 1,
      },
    ],
    [lecturers],
  );

  const courseSortOptions = [
    { field: "name", label: "Tên khóa học" },
    { field: "credits", label: "Tín chỉ" },
    { field: "_count.enrollments", label: "Sinh viên" },
    { field: "status", label: "Trạng thái" },
  ];

  const normalizedSearch = appliedSearch.trim().toLowerCase();

  const filteredCourses = useMemo(() => {
    const academicYearFilter = appliedFilters.academicYear as
      | TextFilterValue
      | undefined;
    const termFilter = appliedFilters.term as string | undefined;
    const creditsFilter = appliedFilters.credits as
      | { min?: number; max?: number }
      | undefined;
    const statusValue = appliedFilters.status as string | undefined;
    const lecturerValue = appliedFilters.lecturerId as string | undefined;

    const matchesText = (
      source: string | undefined,
      filter?: TextFilterValue,
    ) => {
      if (!filter || !filter.value.trim()) return true;
      const sourceValue = (source || "").toLowerCase();
      const filterValue = filter.value.trim().toLowerCase();
      if (filter.operator === "startsWith")
        return sourceValue.startsWith(filterValue);
      if (filter.operator === "equals") return sourceValue === filterValue;
      return sourceValue.includes(filterValue);
    };

    const filtered = courses.filter((course) => {
      const termLabel = formatCourseTerm(
        course.academicYear,
        course.term,
      );
      const matchesSearch = !normalizedSearch
        ? true
        : [
            course.code,
            course.name,
            termLabel,
            course.lecturer?.fullName || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);

      const matchesStatus =
        !statusValue ||
        statusValue === "all" ||
        (course.status || "draft") === statusValue;
      const matchesLecturer =
        !lecturerValue ||
        lecturerValue === "all" ||
        course.lecturerId === lecturerValue;
      const matchesAcademicYear = matchesText(
        course.academicYear,
        academicYearFilter,
      );
      const matchesTerm =
        !termFilter || termFilter === "all" || course.term === termFilter;
      const matchesCredits = (() => {
        if (
          !creditsFilter ||
          (creditsFilter.min === undefined && creditsFilter.max === undefined)
        )
          return true;
        const credits = course.credits;
        if (credits === undefined || credits === null) return false;
        if (creditsFilter.min !== undefined && credits < creditsFilter.min)
          return false;
        if (creditsFilter.max !== undefined && credits > creditsFilter.max)
          return false;
        return true;
      })();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesLecturer &&
        matchesAcademicYear &&
        matchesTerm &&
        matchesCredits
      );
    });

    return sortItems(filtered, sortField, sortOrder);
  }, [courses, normalizedSearch, appliedFilters, sortField, sortOrder]);

  const [page, setPage] = useState(1);
  const COURSE_ROWS_PER_VIEW = 10;
  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / COURSE_ROWS_PER_VIEW));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const displayedCourses = useMemo(
    () => {
      const start = (page - 1) * COURSE_ROWS_PER_VIEW;
      return filteredCourses.slice(start, start + COURSE_ROWS_PER_VIEW);
    },
    [filteredCourses, page],
  );
  const COURSE_ROW_HEIGHT = 72;
  const COURSE_TABLE_HEADER_HEIGHT = 48;
  const COURSE_TABLE_MIN_HEIGHT =
    COURSE_ROWS_PER_VIEW * COURSE_ROW_HEIGHT + COURSE_TABLE_HEADER_HEIGHT;

  const activeFilterCount = getActiveFilterCount(
    appliedFilters,
    courseFilterDefinitions,
  );
  const activeFilterChips = getFilterChips(
    appliedFilters,
    courseFilterDefinitions,
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

  const courseStats = useMemo(() => {
    const totalCourses = filteredCourses.length;
    const assignedLecturers = courses.filter((course) =>
      Boolean(course.lecturerId),
    ).length;
    const totalEnrollments = courses.reduce(
      (sum, course) => sum + (course._count?.enrollments || 0),
      0,
    );
    const activeCourses = courses.filter(
      (course) => (course.status || "draft").toLowerCase() !== "archived",
    ).length;

    return {
      totalCourses,
      assignedLecturers,
      totalEnrollments,
      activeCourses,
    };
  }, [courses]);

  const toPayload = (form: CourseForm, allowUnassign = false) => ({
    name: form.name.trim(),
    academicYear: form.academicYear.trim() || undefined,
    term: form.term || undefined,
    description: form.description.trim() || undefined,
    credits: parseNumericInput(form.credits, { min: 1, max: 10 }),
    lecturerId:
      form.lecturerId === "unassigned"
        ? allowUnassign
          ? null
          : undefined
        : form.lecturerId,
  });

  const validateCreditsField = (rawValue: string) =>
    getNumericInputError(rawValue, {
      min: 1,
      max: 10,
      integer: true,
    });

  const getPreviewCode = (courseName: string) => {
    const courseToken = buildToken(courseName, 6, "COURSE");
    const creatorToken = buildToken(
      user?.fullName || user?.email || "",
      4,
      "USER",
    );
    return `${courseToken}-${creatorToken}-XX`;
  };

  const handleCreate = async () => {
    const creditsError = validateCreditsField(createForm.credits);
    if (creditsError) {
      setCreateCreditsError(creditsError);
      toast.error(creditsError);
      return;
    }

    setSaving(true);
    try {
      const created = await api.createCourse(toPayload(createForm));
      setCourses((prev) => [created, ...prev]);
      setCreateCreditsError("");
      toast.success("Đã tạo khóa học thành công");
      setCreatedCourse({ id: created.id, name: created.name || createForm.name });
      setCreateStep(2);
    } catch (error) {
      console.error("Failed to create course", error);
      toast.error(
        error instanceof Error ? error.message : "Không thể tạo khóa học",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAssignLecturer = async () => {
    if (!createdCourse) return;
    if (selectedLecturerId === "unassigned") {
      setCreateStep(3);
      return;
    }

    setAssigningLecturer(true);
    try {
      const updated = await api.updateCourse(createdCourse.id, {
        lecturerId: selectedLecturerId,
      });
      setCourses((prev) =>
        prev.map((item) => (item.id === createdCourse.id ? updated : item)),
      );
      setCreateStep(3);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không thể gán giảng viên",
      );
    } finally {
      setAssigningLecturer(false);
    }
  };

  const openEditDialog = (course: CourseItem) => {
    setEditingCourseId(course.id);
    setEditForm({
      name: course.name,
      academicYear: course.academicYear || defaultAcademicYear,
      term: course.term || defaultTerm,
      description: course.description || "",
      credits: course.credits ? String(course.credits) : "",
      lecturerId: course.lecturerId || "unassigned",
    });
    setEditCreditsError("");
    setShowEditDialog(true);
  };

  const handleUpdate = async () => {
    if (!editingCourseId) return;

    const creditsError = validateCreditsField(editForm.credits);
    if (creditsError) {
      setEditCreditsError(creditsError);
      toast.error(creditsError);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateCourse(
        editingCourseId,
        toPayload(editForm, true),
      );
      setCourses((prev) =>
        prev.map((item) => (item.id === editingCourseId ? updated : item)),
      );
      setShowEditDialog(false);
      setEditingCourseId(null);
      toast.success("Đã cập nhật khóa học thành công");
    } catch (error) {
      console.error("Failed to update course", error);
      toast.error(
        error instanceof Error ? error.message : "Không thể cập nhật khóa học",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCourse(id);
      setCourses((prev) => prev.filter((item) => item.id !== id));
      toast.success("Đã xóa khóa học thành công");
    } catch (error) {
      console.error("Failed to delete course", error);
      toast.error(
        error instanceof Error ? error.message : "Không thể xóa khóa học",
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteCourse) return;
    try {
      setDeleting(true);
      await handleDelete(deleteCourse.id);
      setDeleteCourse(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleArchiveAction = async () => {
    if (!actionCourse) return;
    try {
      setArchiving(true);
      if (actionCourse.status === 'archived') await api.restoreCourse(actionCourse.id);
      else await api.archiveCourse(actionCourse.id);
      toast.success(actionCourse.status === 'archived' ? 'Đã khôi phục khóa học' : 'Đã lưu trữ khóa học');
      setActionCourse(null);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể cập nhật khóa học');
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const renderForm = (
    form: CourseForm,
    onChange: (patch: Partial<CourseForm>) => void,
    creditsError: string,
    setCreditsError: (message: string) => void,
  ) => (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="course-code">Mã khóa học (tự động tạo)</Label>
          <Input
            id="course-code"
            value={getPreviewCode(form.name)}
            disabled
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="academicYear">Năm học</Label>
          <Select
            value={form.academicYear}
            onValueChange={(value) => onChange({ academicYear: value })}
          >
            <SelectTrigger id="academicYear">
              <SelectValue placeholder="Chọn năm học" />
            </SelectTrigger>
            <SelectContent>
              {academicYearOptions.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="course-name">Tên khóa học *</Label>
          <Input
            id="course-name"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="term">Học kỳ</Label>
          <Select
            value={form.term}
            onValueChange={(value) =>
              onChange({ term: value as CourseTerm })
            }
          >
            <SelectTrigger id="term">
              <SelectValue placeholder="Chọn học kỳ" />
            </SelectTrigger>
            <SelectContent>
              {COURSE_TERM_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="credits">Tín chỉ</Label>
        <Input
          id="credits"
          type="number"
          min={1}
          max={10}
          value={form.credits}
          onChange={(e) =>
            onChange({
              credits: sanitizeNumericInput(e.target.value, { min: 1, max: 10 }),
            })
          }
          onBlur={(e) => setCreditsError(validateCreditsField(e.target.value) || "")}
        />
        {creditsError ? (
          <p className="text-xs text-destructive">{creditsError}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="lecturer">Giảng viên</Label>
        <Select
          value={form.lecturerId}
          onValueChange={(value) => onChange({ lecturerId: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Chọn giảng viên" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Chưa gán</SelectItem>
            {lecturers.map((lecturer) => (
              <SelectItem key={lecturer.id} value={lecturer.id}>
                {lecturer.fullName} ({lecturer.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Mô tả</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <AdminPageShell>
        <ListPageHeader
          title="Tất cả khóa học"
          actions={
            <>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Làm mới
            </Button>
            <Dialog
              open={showCreateDialog}
              onOpenChange={(open) => {
                setShowCreateDialog(open);
                if (!open) resetCreateWizard();
              }}
            >
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Thêm khóa học
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                {/* Step indicator */}
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${createStep === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                      1
                    </span>
                    Thông tin khóa học
                  </div>
                  <div className="h-px w-8 bg-border" />
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${createStep === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                      2
                    </span>
                    Thêm giảng viên
                  </div>
                  <div className="h-px w-8 bg-border" />
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${createStep === 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                      3
                    </span>
                    Thêm sinh viên
                  </div>
                </div>

                {createStep === 1 && (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-xl">Tạo khóa học mới</DialogTitle>
                      <DialogDescription>
                        Điền thông tin khóa học. Bạn có thể gán giảng viên và thêm sinh viên ở các bước tiếp theo.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="course-code">Mã khóa học (tự động tạo)</Label>
                          <Input
                            id="course-code"
                            value={getPreviewCode(createForm.name)}
                            disabled
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="academicYear">Năm học</Label>
                          <Select
                            value={createForm.academicYear}
                            onValueChange={(value) =>
                              setCreateForm((prev) => ({ ...prev, academicYear: value }))
                            }
                          >
                            <SelectTrigger id="academicYear">
                              <SelectValue placeholder="Chọn năm học" />
                            </SelectTrigger>
                            <SelectContent>
                              {academicYearOptions.map((year) => (
                                <SelectItem key={year} value={year}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="course-name">Tên khóa học *</Label>
                          <Input
                            id="course-name"
                            placeholder="VD: Thuật toán nâng cao"
                            value={createForm.name}
                            onChange={(e) =>
                              setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="term">Học kỳ</Label>
                          <Select
                            value={createForm.term}
                            onValueChange={(value) =>
                              setCreateForm((prev) => ({ ...prev, term: value as CourseTerm }))
                            }
                          >
                            <SelectTrigger id="term">
                              <SelectValue placeholder="Chọn học kỳ" />
                            </SelectTrigger>
                            <SelectContent>
                              {COURSE_TERM_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="credits">Tín chỉ</Label>
                        <Input
                          id="credits"
                          type="number"
                          min={1}
                          max={10}
                          placeholder="VD: 3"
                          value={createForm.credits}
                          onChange={(e) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              credits: sanitizeNumericInput(e.target.value, { min: 1, max: 10 }),
                            }))
                          }
                          onBlur={(e) =>
                            setCreateCreditsError(validateCreditsField(e.target.value) || "")
                          }
                        />
                        {createCreditsError ? (
                          <p className="text-xs text-destructive">{createCreditsError}</p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Mô tả (không bắt buộc)</Label>
                        <Textarea
                          id="description"
                          placeholder="Mô tả ngắn về khóa học..."
                          value={createForm.description}
                          onChange={(e) =>
                            setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                          }
                          rows={3}
                        />
                      </div>
                    </div>

                    <DialogFooter className="gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowCreateDialog(false)}
                      >
                        Hủy
                      </Button>
                      <Button
                        onClick={handleCreate}
                        className="gap-2"
                        disabled={
                          saving ||
                          !createForm.name.trim() ||
                          !createForm.academicYear.trim() ||
                          !createForm.term
                        }
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                        {createdCourse ? "Lưu & tiếp tục" : "Tạo & thêm giảng viên"}
                      </Button>
                    </DialogFooter>
                  </>
                )}

                {createStep === 2 && createdCourse && (() => {
                  const query = lecturerSearch.trim().toLowerCase();
                  const filteredLecturers = query
                    ? lecturers.filter(
                        (lecturer) =>
                          lecturer.fullName.toLowerCase().includes(query) ||
                          lecturer.email.toLowerCase().includes(query),
                      )
                    : lecturers;
                  const selectedLecturer = lecturers.find((l) => l.id === selectedLecturerId);
                  const selectedLabel =
                    selectedLecturerId === "unassigned" || !selectedLecturer
                      ? "Chưa gán"
                      : `${selectedLecturer.fullName} (${selectedLecturer.email})`;

                  return (
                    <>
                      <DialogHeader>
                        <DialogTitle className="text-xl">Thêm giảng viên</DialogTitle>
                        <DialogDescription>
                          <span className="font-semibold text-foreground">
                            {createdCourse.name}
                          </span>{" "}
                          đã được tạo. Tìm và gán giảng viên, hoặc bỏ qua.
                        </DialogDescription>
                      </DialogHeader>

                      <Tabs value="manual" className="mt-2">
                        <TabsList className="grid w-full grid-cols-1">
                          <TabsTrigger value="manual" className="gap-2">
                            <UserPlus className="h-4 w-4" /> Tìm kiếm thủ công
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="manual" className="space-y-3 mt-4">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="wizard-lecturer"
                              value={lecturerSearch}
                              onChange={(e) => setLecturerSearch(e.target.value)}
                              placeholder="Tìm giảng viên theo tên hoặc email..."
                              autoComplete="off"
                              className="pl-9"
                            />
                          </div>

                          <div className="border rounded-lg max-h-48 overflow-y-auto">
                            <div
                              className={cn(
                                "flex items-center justify-between p-2.5 cursor-pointer border-b last:border-b-0 transition-colors hover:bg-muted/50",
                                selectedLecturerId === "unassigned" && "bg-muted/50",
                              )}
                              onClick={() => setSelectedLecturerId("unassigned")}
                            >
                              <span className="text-sm text-muted-foreground">Chưa gán</span>
                              <Check
                                className={cn(
                                  "h-4 w-4 shrink-0 text-primary",
                                  selectedLecturerId === "unassigned" ? "opacity-100" : "opacity-0",
                                )}
                              />
                            </div>
                            {filteredLecturers.length === 0 ? (
                              <div className="p-3 text-sm text-muted-foreground text-center">
                                Không tìm thấy giảng viên.
                              </div>
                            ) : (
                              filteredLecturers.map((lecturer) => (
                                <div
                                  key={lecturer.id}
                                  className={cn(
                                    "flex items-center justify-between p-2.5 cursor-pointer border-b last:border-b-0 transition-colors hover:bg-muted/50",
                                    selectedLecturerId === lecturer.id && "bg-muted/50",
                                  )}
                                  onClick={() => setSelectedLecturerId(lecturer.id)}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                                      {lecturer.fullName.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{lecturer.fullName}</p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {lecturer.email}
                                      </p>
                                    </div>
                                  </div>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary",
                                      selectedLecturerId === lecturer.id ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                </div>
                              ))
                            )}
                          </div>

                          <p className="text-sm">
                            Đã chọn: <span className="font-medium">{selectedLabel}</span>
                          </p>
                        </TabsContent>
                      </Tabs>

                      <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setCreateStep(1)}>
                          Quay lại
                        </Button>
                        <Button
                          onClick={handleAssignLecturer}
                          disabled={assigningLecturer}
                          className="gap-2"
                        >
                          {assigningLecturer ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                          Tiếp: Thêm sinh viên
                        </Button>
                      </DialogFooter>
                    </>
                  );
                })()}

                {createStep === 3 && createdCourse && (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-xl flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        Đã tạo khóa học — Thêm sinh viên
                      </DialogTitle>
                      <DialogDescription>
                        <span className="font-semibold text-foreground">
                          {createdCourse.name}
                        </span>{" "}
                        đã được tạo. Bây giờ hãy thêm sinh viên vào khóa học này.
                      </DialogDescription>
                    </DialogHeader>

                    <Tabs
                      value={enrollTab}
                      onValueChange={(v) => setEnrollTab(v as "manual" | "import")}
                      className="mt-2"
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="manual" className="gap-2">
                          <UserPlus className="h-4 w-4" /> Tìm kiếm thủ công
                        </TabsTrigger>
                        <TabsTrigger value="import" className="gap-2">
                          <FileSpreadsheet className="h-4 w-4" /> Nhập từ CSV / Excel
                        </TabsTrigger>
                      </TabsList>

                      {/* Manual Student Search */}
                      <TabsContent value="manual" className="space-y-4 mt-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Tìm sinh viên theo tên, email hoặc mã sinh viên..."
                            value={studentSearch}
                            onChange={(e) => setStudentSearch(e.target.value)}
                            className="bg-white pl-9"
                          />
                          {isSearching && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                        </div>

                        {searchResults.length > 0 && (
                          <div className="border rounded-lg max-h-40 overflow-y-auto">
                            {searchResults.map((student) => (
                              <div
                                key={student.id}
                                className="flex items-center justify-between p-2.5 hover:bg-muted/50 cursor-pointer border-b last:border-b-0 transition-colors"
                                onClick={() => addStudent(student)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                    {student.fullName.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">{student.fullName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {student.email}{" "}
                                      {student.studentId && `• ${student.studentId}`}
                                    </p>
                                  </div>
                                </div>
                                <Plus className="h-4 w-4 text-primary" />
                              </div>
                            ))}
                          </div>
                        )}

                        {selectedStudents.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">
                              Sinh viên đã chọn ({selectedStudents.length})
                            </Label>
                            <div className="border rounded-lg max-h-48 overflow-y-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Sinh viên</TableHead>
                                    <TableHead className="text-xs">Email</TableHead>
                                    <TableHead className="text-xs">Mã sinh viên</TableHead>
                                    <TableHead className="text-xs w-10"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {selectedStudents.map((student) => (
                                    <TableRow key={student.id}>
                                      <TableCell className="text-sm py-2">
                                        {student.fullName}
                                      </TableCell>
                                      <TableCell className="text-sm py-2 text-muted-foreground">
                                        {student.email}
                                      </TableCell>
                                      <TableCell className="text-sm py-2 font-mono">
                                        {student.studentId || "-"}
                                      </TableCell>
                                      <TableCell className="py-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                          onClick={() => removeStudent(student.id)}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}

                        {selectedStudents.length === 0 && !studentSearch && (
                          <div className="text-center py-8 text-muted-foreground">
                            <UserPlus className="h-10 w-10 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Tìm và thêm sinh viên vào khóa học này</p>
                          </div>
                        )}
                      </TabsContent>

                      {/* CSV / Excel Import */}
                      <TabsContent value="import" className="space-y-4 mt-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <div className="text-sm text-blue-800 dark:text-blue-200">
                            <p className="font-medium mb-1">Quy ước tệp CSV / Excel</p>
                            <p className="text-xs leading-relaxed">
                              Tải lên tệp <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.csv</code>{" "}
                              hoặc <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.txt</code> chứa
                              email sinh viên. Mỗi dòng nên chứa một địa chỉ email. Các cột có thể được phân
                              tách bằng dấu phẩy, chấm phẩy hoặc tab. Hệ thống sẽ tự động nhận diện địa chỉ
                              email trong tệp.
                            </p>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-blue-600 gap-1 mt-1"
                              onClick={downloadTemplate}
                            >
                              <Download className="h-3 w-3" /> Tải mẫu
                            </Button>
                          </div>
                        </div>

                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt,.xlsx,.xls"
                            className="hidden"
                            onChange={handleFileUpload}
                          />
                          <div
                            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const file = e.dataTransfer.files[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const text = event.target?.result as string;
                                  const emails = parseEmailsFromCSV(text);
                                  setCsvEmails(emails);
                                  setCsvText(text);
                                  setCsvFileName(file.name);
                                };
                                reader.readAsText(file);
                              }
                            }}
                          >
                            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm font-medium">
                              {csvFileName ? csvFileName : "Nhấp để tải lên hoặc kéo & thả"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">CSV, TXT, XLS, XLSX</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm">Hoặc dán email trực tiếp</Label>
                          <Textarea
                            placeholder={
                              "student1@examtrust.edu\nstudent2@examtrust.edu\nstudent3@examtrust.edu"
                            }
                            value={csvText}
                            onChange={(e) => handlePasteEmails(e.target.value)}
                            rows={4}
                            className="font-mono text-sm"
                          />
                        </div>

                        {csvEmails.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              Đã nhận diện {csvEmails.length} email
                            </Label>
                            <div className="border rounded-lg max-h-32 overflow-y-auto p-2">
                              <div className="flex flex-wrap gap-1.5">
                                {csvEmails.map((email) => (
                                  <span
                                    key={email}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted font-mono"
                                  >
                                    {email}
                                    <button
                                      className="ml-0.5 hover:text-destructive"
                                      onClick={() =>
                                        setCsvEmails((prev) => prev.filter((e) => e !== email))
                                      }
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>

                    {enrollResults.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <Label className="text-sm font-medium">Kết quả ghi danh</Label>
                        <div className="border rounded-lg max-h-40 overflow-y-auto">
                          {enrollResults.map((result, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center gap-3 p-2.5 border-b last:border-b-0 ${result.status === "success" ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}
                            >
                              {result.status === "success" ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {result.fullName || result.email}
                                </p>
                                <p className="text-xs text-muted-foreground">{result.email}</p>
                              </div>
                              {result.status === "failed" && (
                                <span className="text-xs text-red-600 shrink-0">{result.reason}</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {enrollResults.filter((r) => r.status === "success").length} đã ghi danh thành công
                          {provisionedCount > 0 && (
                            <span className="text-amber-600 font-medium">
                              {" "}
                              ({provisionedCount} tài khoản mới được tự động tạo với mật khẩu{" "}
                              <code>Examtrust@123</code>)
                            </span>
                          )}
                          {enrollResults.filter((r) => r.status === "failed").length > 0 &&
                            `, ${enrollResults.filter((r) => r.status === "failed").length} thất bại`}
                        </p>
                      </div>
                    )}

                    <DialogFooter className="gap-2 mt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowCreateDialog(false);
                          resetCreateWizard();
                        }}
                      >
                        {enrollResults.length > 0 ? "Xong" : "Bỏ qua — Thêm sau"}
                      </Button>
                      {enrollResults.length === 0 && (
                        <Button variant="outline" onClick={() => setCreateStep(2)} className="gap-2">
                          <ArrowLeft className="h-4 w-4" />
                          Quay lại
                        </Button>
                      )}
                      {enrollResults.length === 0 && (
                        <Button
                          onClick={handleEnrollStudents}
                          disabled={
                            isEnrolling ||
                            (enrollTab === "manual"
                              ? selectedStudents.length === 0
                              : csvEmails.length === 0)
                          }
                          className="gap-2"
                        >
                          {isEnrolling ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Users className="h-4 w-4" />
                          )}
                          Ghi danh{" "}
                          {enrollTab === "manual" ? selectedStudents.length : csvEmails.length}{" "}
                          sinh viên
                        </Button>
                      )}
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
            </>
          }
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            icon={BookOpen}
            value={courseStats.totalCourses}
            label="Tổng số khóa học"
            iconWrapClassName="bg-blue-500/10"
            iconClassName="text-blue-600"
          />
          <AdminStatCard
            icon={GraduationCap}
            value={courseStats.assignedLecturers}
            label="Giảng viên đã gán"
            iconWrapClassName="bg-violet-500/10"
            iconClassName="text-violet-600"
          />
          <AdminStatCard
            icon={Users}
            value={courseStats.totalEnrollments}
            label="Tổng số lượt ghi danh"
            iconWrapClassName="bg-emerald-500/10"
            iconClassName="text-emerald-600"
          />
          <AdminStatCard
            icon={Pencil}
            value={courseStats.activeCourses}
            label="Khóa học đang hoạt động"
            iconWrapClassName="bg-amber-500/10"
            iconClassName="text-amber-600"
          />
        </div>

        <div className="mb-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm theo mã, tên, năm học, học kỳ hoặc giảng viên"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              title="Bộ lọc khóa học"
              description="Lọc khóa học theo trạng thái, giảng viên, năm học, học kỳ và số tín chỉ."
              filters={courseFilterDefinitions}
              value={draftFilters}
              onValueChange={(key, nextValue) =>
                setDraftFilters((prev) => ({ ...prev, [key]: nextValue }))
              }
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
            />
              
              <Select value={archiveScope} onValueChange={(value) => setArchiveScope(value as 'active' | 'archived')}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Các khóa học đang hoạt động</SelectItem>
                <SelectItem value="archived">Các khóa học đã được lưu trữ</SelectItem>
              </SelectContent>
            </Select>
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
        </div>

        <Card>
          <CardContent className="p-0">
            <div
              className="overflow-x-auto"
              style={{ minHeight: COURSE_TABLE_MIN_HEIGHT }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã khóa học</TableHead>
                    <TableHead>Tên khóa học</TableHead>
                    <TableHead className="text-center min-w-20">Tín chỉ</TableHead>
                    <TableHead>Học kỳ</TableHead>
                    <TableHead>Giảng viên</TableHead>
                    <TableHead className="text-center min-w-20">
                      Sinh viên
                    </TableHead>
                    <TableHead className="text-center min-w-20">
                      Bài thi
                    </TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedCourses.length > 0 ? (
                    displayedCourses.map((course) => (
                      <TableRow key={course.id}>
                        <TableCell className="font-mono font-medium">
                          {course.code}
                        </TableCell>
                        <TableCell className="font-medium">
                          {course.name}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {course.credits ?? "-"}
                        </TableCell>
                        <TableCell>
                          {formatCourseTerm(
                            course.academicYear,
                            course.term,
                          )}
                        </TableCell>
                        <TableCell>
                          {course.lecturer ? (
                            <div className="text-sm">
                              <p className="font-medium">
                                {course.lecturer.fullName}
                              </p>
                              <p className="text-muted-foreground">
                                {course.lecturer.email}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              Chưa gán
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {course._count?.enrollments || 0}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {course._count?.exams || 0}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={course.status || "draft"}
                            domain="course"
                          />
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
                                className="gap-2 text-xs"
                                onClick={() => router.push(`/admin/course/${course.id}`)}
                              >
                                <Users className="h-4 w-4" />
                                Xem chi tiết
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 text-xs"
                                onClick={() => openEditDialog(course)}
                              >
                                <Pencil className="h-4 w-4" />
                                Chỉnh sửa
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 text-xs"
                                onClick={() => setActionCourse(course)}
                              >
                                {course.status === 'archived' ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                {course.status === 'archived' ? 'Khôi phục khóa học' : 'Lưu trữ khóa học'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 text-destructive text-xs"
                                onClick={() => setDeleteCourse(course)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Xóa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Không tìm thấy khóa học.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredCourses.length}
              onPageChange={setPage}
              itemLabel="khóa học"
            />
          </CardContent>
        </Card>
      </AdminPageShell>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sửa khóa học</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin khóa học và giảng viên phụ trách.
            </DialogDescription>
          </DialogHeader>

          {renderForm(
            editForm,
            (patch) => setEditForm((prev) => ({ ...prev, ...patch })),
            editCreditsError,
            setEditCreditsError,
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={
                saving ||
                !editForm.name.trim() ||
                !editForm.academicYear.trim() ||
                !editForm.term
              }
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(actionCourse)} onOpenChange={(open) => !open && setActionCourse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionCourse?.status === 'archived' ? 'Khôi phục khóa học?' : 'Lưu trữ khóa học?'}</DialogTitle>
            <DialogDescription>
              {actionCourse?.status === 'archived'
                ? 'Khóa học sẽ xuất hiện lại trong danh sách đang hoạt động.'
                : 'Khóa học sẽ được ẩn khỏi danh sách đang hoạt động. Bài học, bài thi, kết quả và dữ liệu liên quan vẫn được giữ lại.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionCourse(null)}>Hủy</Button>
            <Button onClick={handleArchiveAction} disabled={archiving}>{archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : actionCourse?.status === 'archived' ? 'Khôi phục' : 'Lưu trữ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteCourse)} onOpenChange={(open) => !open && setDeleteCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa khóa học</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Khóa học "{deleteCourse?.name}" sẽ bị xóa nếu không có dữ liệu liên quan ngăn cản việc xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
