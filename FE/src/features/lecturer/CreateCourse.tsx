"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
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
  TextFilterValue,
} from "@/components/common/list/filter-types";
import {
  getActiveFilterCount,
  getFilterChips,
} from "@/components/common/list/filter-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditableStudentImport } from "./components/EditableStudentImport";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  BookOpen,
  Users,
  Edit2,
  Trash2,
  Search,
  GraduationCap,
  Loader2,
  Upload,
  FileSpreadsheet,
  UserPlus,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Info,
  BarChart3,
  ChevronRight,
  ChevronDown,
  Clock,
  Eye,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import api, { unwrapPaginatedData } from "@/lib/api";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ConfirmActionDialog } from "@/components/common/ConfirmActionDialog";
import { useAuth } from "@/contexts/AuthContext";
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

interface Course {
  id: string;
  code: string;
  name: string;
  academicYear?: string;
  term?: CourseTerm;
  description?: string;
  credits?: number;
  students: number;
  exams: number;
  status: "active" | "archived" | "draft";
  createdAt: string;
}

interface APICourse {
  id: string;
  code: string;
  name: string;
  description?: string;
  academicYear?: string;
  term?: CourseTerm;
  credits?: number;
  status?: string;
  createdAt: string;
  _count?: {
    enrollments?: number;
    exams?: number;
  };
}

interface CourseExamPreview {
  id: string;
  title: string;
  status: string;
  duration?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  createdAt?: string | null;
  _count?: {
    submissions?: number;
  };
  course?: {
    id?: string;
    code?: string;
    name?: string;
  };
}

const courseGradientClasses = [
  "bg-gradient-to-br from-pink-400 to-pink-600",
  "bg-gradient-to-br from-purple-400 to-indigo-600",
  "bg-gradient-to-br from-blue-400 to-cyan-600",
  "bg-gradient-to-br from-green-400 to-emerald-600",
  "bg-gradient-to-br from-yellow-400 to-orange-600",
  "bg-gradient-to-br from-red-400 to-pink-600",
  "bg-gradient-to-br from-slate-400 to-slate-600",
];

const getCourseGradientClass = (index: number) =>
  courseGradientClasses[index % courseGradientClasses.length];

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

interface ImportedStudent {
  email: string;
  fullName: string;
  studentId: string;
  department: string;
}

const toAsciiUpper = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toUpperCase();

const buildToken = (value: string, maxLength: number, fallback: string) => {
  const compact = toAsciiUpper(value).split(/\s+/).filter(Boolean).join("");
  return (compact.slice(0, maxLength) || fallback).toUpperCase();
};

const academicYearOptions = getAcademicYearOptions();
const { academicYear: defaultAcademicYear, term: defaultTerm } =
  getCurrentAcademicTerm();

const EMPTY_FILTERS: FilterValues = {
  status: "all",
  academicYear: { value: "", operator: "contains" },
  term: "all",
};

export default function CreateCourse() {
  const legacyImportEnabled = process.env.NEXT_PUBLIC_ENABLE_LEGACY_IMPORT === "true";
  const router = useRouter();
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterValues>(EMPTY_FILTERS);
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [createCreditsError, setCreateCreditsError] = useState("");
  const [editCreditsError, setEditCreditsError] = useState("");
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [courseExamsByCourseId, setCourseExamsByCourseId] = useState<
    Record<string, CourseExamPreview[]>
  >({});
  const [courseExamLoadingByCourseId, setCourseExamLoadingByCourseId] =
    useState<Record<string, boolean>>({});
  const [courseExamErrorByCourseId, setCourseExamErrorByCourseId] = useState<
    Record<string, boolean>
  >({});

  // Multi-step wizard
  const [step, setStep] = useState<1 | 2>(1);
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);
  const [createdCourseCode, setCreatedCourseCode] = useState("");

  // Form state
  const [newCourse, setNewCourse] = useState({
    name: "",
    academicYear: defaultAcademicYear,
    term: defaultTerm,
    description: "",
    credits: "",
  });

  const [editCourse, setEditCourse] = useState({
    code: "",
    name: "",
    academicYear: defaultAcademicYear,
    term: defaultTerm,
    description: "",
    credits: "",
  });

  const previewCourseCode = `${buildToken(newCourse.name, 6, "COURSE")}-${buildToken(user?.fullName || user?.email || "", 4, "USER")}-XX`;

  // Student enrollment state
  const [enrollTab, setEnrollTab] = useState<"manual" | "import" | "training">("manual");
  const [studentSearch, setStudentSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<
    StudentSearchResult[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [trainingSearch, setTrainingSearch] = useState("");
  const [trainingResults, setTrainingResults] = useState<StudentSearchResult[]>([]);
  const [selectedTrainingStudents, setSelectedTrainingStudents] = useState<StudentSearchResult[]>([]);
  const [isTrainingSearching, setIsTrainingSearching] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollResults, setEnrollResults] = useState<EnrollResult[]>([]);
  const [provisionedCount, setProvisionedCount] = useState(0);
  const [csvText, setCsvText] = useState("");
  const [importedStudents, setImportedStudents] = useState<ImportedStudent[]>([]);
  const [importError, setImportError] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const trainingSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const data = unwrapPaginatedData(await api.getCourses());
      const safeIso = (raw?: any) => {
        if (!raw) return "—";
        const d = new Date(raw);
        if (isNaN(d.getTime())) return typeof raw === "string" ? raw : "—";
        return d.toISOString().split("T")[0];
      };
      const mapped: Course[] = data.map((c: APICourse) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        academicYear: c.academicYear || undefined,
        term: c.term || undefined,
        description: c.description,
        credits: c.credits,
        // Accept multiple possible shapes returned by the backend:
        // - admin list: _count.enrollments / _count.exams
        // - lecturer-specific endpoints: enrolledStudents / exams
        // - generic: students / exams
        students:
          (c as any).students ??
          (c as any).enrolledStudents ??
          c._count?.enrollments ??
          0,
        exams: (c as any).exams ?? c._count?.exams ?? 0,
        status: (c.status?.toLowerCase() as Course["status"]) || "draft",
        createdAt: safeIso(c.createdAt),
      }));
      setCourses(mapped);
    } catch (err) {
      console.error("Failed to fetch courses:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

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
        key: "academicYear",
        label: "Năm học",
        type: "text",
        placeholder: "Lọc theo năm học",
        operators: ["contains", "startsWith", "equals"],
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
        key: "students",
        label: "Sinh viên",
        type: "text",
      },
    ],
    [],
  );

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filteredCourses = useMemo(() => {
    const statusFilter = appliedFilters.status as string | undefined;
    const academicYearFilter = appliedFilters.academicYear as TextFilterValue | undefined;
    const termFilter = appliedFilters.term as string | undefined;

    const matchesText = (source: string | undefined, filter?: TextFilterValue) => {
      if (!filter || !filter.value.trim()) return true;
      const sourceValue = (source || "").toLowerCase();
      const filterValue = filter.value.trim().toLowerCase();
      if (filter.operator === "startsWith") return sourceValue.startsWith(filterValue);
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
        : [course.code, course.name, termLabel]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
      if (!matchesSearch) return false;

      if (statusFilter && statusFilter !== "all" && course.status !== statusFilter) {
        return false;
      }

      if (!matchesText(course.academicYear, academicYearFilter)) return false;

      if (termFilter && termFilter !== "all" && course.term !== termFilter) {
        return false;
      }

      return true;
    });

    return sortItems(filtered, sortField, sortOrder);
  }, [appliedFilters, courses, normalizedSearch, sortField, sortOrder]);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / ITEMS_PER_PAGE));
  const displayedCourses = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredCourses.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCourses, page]);
  const COURSE_ROW_HEIGHT = 72;
  const COURSE_TABLE_HEADER_HEIGHT = 48;
  const COURSE_TABLE_MIN_HEIGHT =
    ITEMS_PER_PAGE * COURSE_ROW_HEIGHT + COURSE_TABLE_HEADER_HEIGHT;

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
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  };
  const removeFilter = (key: string) => {
    const next = {
      ...appliedFilters,
      [key]: EMPTY_FILTERS[key as keyof typeof EMPTY_FILTERS],
    };
    setAppliedFilters(next);
    setDraftFilters(next);
    setPage(1);
  };

  const activeFilterCount = getActiveFilterCount(appliedFilters, courseFilterDefinitions);
  const activeFilterChips = getFilterChips(appliedFilters, courseFilterDefinitions);

  const courseSortOptions = [
    { field: "name", label: "Tên khóa học" },
    { field: "credits", label: "Tín chỉ" },
    { field: "students", label: "Sinh viên" },
    { field: "status", label: "Trạng thái" },
  ];

  const formatExamDateTime = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatExamSchedule = (exam: CourseExamPreview) => {
    const start = formatExamDateTime(exam.startTime);
    const end = formatExamDateTime(exam.endTime);
    if (start && end) return `${start} - ${end}`;
    if (start) return `Từ ${start}`;
    if (end) return `Đến ${end}`;
    return "Chưa lên lịch";
  };

  const loadCourseExams = useCallback(async (courseId: string, force = false) => {
    if (!force && courseExamsByCourseId[courseId]) return;

    setCourseExamLoadingByCourseId((current) => ({
      ...current,
      [courseId]: true,
    }));
    setCourseExamErrorByCourseId((current) => ({
      ...current,
      [courseId]: false,
    }));

    try {
      const data = unwrapPaginatedData(
        await api.getExams({ courseId, limit: 100 }),
      ) as CourseExamPreview[];
      setCourseExamsByCourseId((current) => ({
        ...current,
        [courseId]: data,
      }));
    } catch (error) {
      console.error("Failed to load course exams:", error);
      setCourseExamErrorByCourseId((current) => ({
        ...current,
        [courseId]: true,
      }));
    } finally {
      setCourseExamLoadingByCourseId((current) => ({
        ...current,
        [courseId]: false,
      }));
    }
  }, [courseExamsByCourseId]);

  const toggleCourseExams = (courseId: string) => {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
      return;
    }

    setExpandedCourseId(courseId);
    void loadCourseExams(courseId);
  };

  const goToNestedExamRoute = (
    event: MouseEvent,
    href: string,
  ) => {
    event.stopPropagation();
    router.push(href);
  };

  // Search students by name or email
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

  const handleTrainingSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setTrainingResults([]);
        return;
      }
      try {
        setIsTrainingSearching(true);
        const students = await api.searchTrainingSystemStudents({
          query,
          courseId: createdCourseId || undefined,
        });
        const filtered = (Array.isArray(students) ? students : []).filter(
          (s: StudentSearchResult) =>
            !selectedTrainingStudents.some((sel) => sel.id === s.id),
        );
        setTrainingResults(filtered.slice(0, 10));
      } catch (err) {
        console.error("Failed to search training system students:", err);
      } finally {
        setIsTrainingSearching(false);
      }
    },
    [createdCourseId, selectedTrainingStudents],
  );

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      handleStudentSearch(studentSearch);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [studentSearch, handleStudentSearch]);

  useEffect(() => {
    if (trainingSearchTimeoutRef.current)
      clearTimeout(trainingSearchTimeoutRef.current);
    trainingSearchTimeoutRef.current = setTimeout(() => {
      handleTrainingSearch(trainingSearch);
    }, 300);
    return () => {
      if (trainingSearchTimeoutRef.current)
        clearTimeout(trainingSearchTimeoutRef.current);
    };
  }, [trainingSearch, handleTrainingSearch]);

  const addStudent = (student: StudentSearchResult) => {
    setSelectedStudents((prev) => [...prev, student]);
    setSearchResults((prev) => prev.filter((s) => s.id !== student.id));
    setStudentSearch("");
  };

  const removeStudent = (studentId: string) => {
    setSelectedStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const addTrainingStudent = (student: StudentSearchResult) => {
    setSelectedTrainingStudents((prev) => [...prev, student]);
    setTrainingResults((prev) => prev.filter((s) => s.id !== student.id));
    setTrainingSearch("");
  };

  const removeTrainingStudent = (studentId: string) => {
    setSelectedTrainingStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const importHeaderAliases: Record<keyof ImportedStudent, string[]> = {
    fullName: ["fullname", "hoten", "ten", "hovaten"],
    email: ["email", "emailaddress"],
    studentId: ["studentid", "masinhvien", "mssv"],
    department: ["department", "khoa", "donvi"],
  };

  const normalizeImportHeader = (value: unknown) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const parseImportRows = (rows: unknown[][]): ImportedStudent[] => {
    const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell ?? "").trim()));
    if (nonEmptyRows.length < 2) throw new Error("Tệp phải có hàng tiêu đề và ít nhất một sinh viên.");
    const headers = nonEmptyRows[0].map(normalizeImportHeader);
    const columnIndex = Object.fromEntries(Object.entries(importHeaderAliases).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ])) as Record<keyof ImportedStudent, number>;
    const missing = Object.entries(columnIndex).filter(([, index]) => index < 0).map(([field]) => field);
    if (missing.length) throw new Error(`Thiếu cột bắt buộc: ${missing.join(", ")}.`);

    const students = nonEmptyRows.slice(1).map((row, index) => {
      const student = Object.fromEntries(Object.entries(columnIndex).map(([field, column]) => [
        field,
        String(row[column] ?? "").trim(),
      ])) as unknown as ImportedStudent;
      if (!student.fullName || !student.email || !student.studentId || !student.department) {
        throw new Error(`Dòng ${index + 2} phải có đủ fullName, email, studentId và department.`);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) {
        throw new Error(`Email ở dòng ${index + 2} không hợp lệ.`);
      }
      return { ...student, email: student.email.toLowerCase() };
    });
    const duplicateEmails = students.length !== new Set(students.map((student) => student.email)).size;
    if (duplicateEmails) throw new Error("Tệp có email bị trùng.");
    return students;
  };

  const parseImportText = (text: string) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const delimiter = lines[0]?.includes("\t") ? "\t" : lines[0]?.includes(";") ? ";" : ",";
    return parseImportRows(lines.map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^['"]|['"]$/g, ""))));
  };

  const applyImportedStudents = (students: ImportedStudent[], text: string, fileName = "") => {
    setImportedStudents(students);
    setCsvText(text);
    setCsvFileName(fileName);
    setImportError("");
  };

  const importStudentFile = async (file: File) => {
    try {
      const isSpreadsheet = /\.(xlsx|xls)$/i.test(file.name);
      if (isSpreadsheet) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
        applyImportedStudents(parseImportRows(rows), "", file.name);
      } else {
        const text = await file.text();
        applyImportedStudents(parseImportText(text), text, file.name);
      }
    } catch (error: any) {
      setImportedStudents([]);
      setImportError(error?.message || "Không thể đọc tệp import.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void importStudentFile(file);
  };

  const handlePasteImport = (text: string) => {
    setCsvText(text);
    try {
      applyImportedStudents(parseImportText(text), text);
    } catch (error: any) {
      setImportedStudents([]);
      setImportError(error?.message || "Dữ liệu import không hợp lệ.");
    }
  };

  const validateCreditsField = (rawValue: string) =>
    getNumericInputError(rawValue, {
      min: 1,
      max: 10,
      integer: true,
    });

  const handleCreate = async () => {
    const creditsError = validateCreditsField(newCourse.credits);
    if (creditsError) {
      setCreateCreditsError(creditsError);
      toast.error(creditsError);
      return;
    }

    setIsCreating(true);
    try {
      const created = await api.createCourse({
        name: newCourse.name,
        description: newCourse.description || undefined,
        credits: parseNumericInput(newCourse.credits, { min: 1, max: 10 }),
        academicYear: newCourse.academicYear,
        term: newCourse.term,
      });
      const mapped: Course = {
        id: created.id,
        code: created.code,
        name: created.name,
        academicYear: newCourse.academicYear,
        term: newCourse.term,
        students: 0,
        exams: 0,
        status: "active",
        createdAt: (() => {
          const d = new Date(created.createdAt);
          return isNaN(d.getTime())
            ? typeof created.createdAt === "string"
              ? created.createdAt
              : "—"
            : d.toISOString().split("T")[0];
        })(),
      };
      setCourses((prev) => [mapped, ...prev]);
      setCreatedCourseId(created.id);
      setCreatedCourseCode(created.code);
      setStep(2);
      setCreateCreditsError("");
      toast.success("Đã tạo khóa học thành công");
    } catch (err) {
      console.error("Failed to create course:", err);
      toast.error(
        err instanceof Error ? err.message : "Tạo khóa học thất bại",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveCourseInfo = async () => {
    const creditsError = validateCreditsField(newCourse.credits);
    if (creditsError) {
      setCreateCreditsError(creditsError);
      toast.error(creditsError);
      return;
    }

    setIsCreating(true);
    try {
      const payload = {
        name: newCourse.name,
        description: newCourse.description || undefined,
        credits: parseNumericInput(newCourse.credits, { min: 1, max: 10 }),
        academicYear: newCourse.academicYear,
        term: newCourse.term,
      };

      if (createdCourseId) {
        const updated = await api.updateCourse(createdCourseId, payload);
        setCourses((prev) =>
          prev.map((course) =>
            course.id === createdCourseId
              ? {
                  ...course,
                  code: updated.code,
                  name: updated.name,
                  academicYear: updated.academicYear || course.academicYear,
                  term: updated.term || course.term,
                  description: updated.description,
                  credits: updated.credits,
                }
              : course,
          ),
        );
        setCreatedCourseCode(updated.code);
        toast.success("Đã cập nhật khóa học thành công");
      } else {
        const created = await api.createCourse(payload);
        const mapped: Course = {
          id: created.id,
          code: created.code,
          name: created.name,
          academicYear: newCourse.academicYear,
          term: newCourse.term,
          students: 0,
          exams: 0,
          status: "active",
          createdAt: (() => {
            const d = new Date(created.createdAt);
            return isNaN(d.getTime())
              ? typeof created.createdAt === "string"
                ? created.createdAt
                : "Chưa có"
              : d.toISOString().split("T")[0];
          })(),
        };
        setCourses((prev) => [mapped, ...prev]);
        setCreatedCourseId(created.id);
        setCreatedCourseCode(created.code);
        toast.success("Tạo khóa học thành công");
      }

      setStep(2);
      setCreateCreditsError("");
    } catch (err) {
      console.error("Failed to save course info:", err);
      toast.error(
        err instanceof Error ? err.message : "Lưu thông tin khóa học thất bại",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const openEditDialog = async (course: Course) => {
    setEditingCourseId(course.id);
    setEditCourse({
      code: course.code,
      name: course.name,
      academicYear: course.academicYear || defaultAcademicYear,
      term: course.term || defaultTerm,
      description: course.description || "",
      credits: course.credits != null ? String(course.credits) : "",
    });
    setEditCreditsError("");
    setShowEditDialog(true);

    try {
      const fullCourse = await api.getCourse(course.id);
      setEditCourse((prev) => ({
        ...prev,
        code: fullCourse.code || prev.code,
        name: fullCourse.name || prev.name,
        academicYear: fullCourse.academicYear || prev.academicYear,
        term: fullCourse.term || prev.term,
        description: fullCourse.description || "",
        credits: fullCourse.credits != null ? String(fullCourse.credits) : "",
      }));
      setCourses((prev) =>
        prev.map((item) =>
          item.id === course.id
            ? {
                ...item,
                code: fullCourse.code || item.code,
                name: fullCourse.name || item.name,
                academicYear: fullCourse.academicYear || item.academicYear,
                term: fullCourse.term || item.term,
                description: fullCourse.description,
                credits: fullCourse.credits,
              }
            : item,
        ),
      );
    } catch (err) {
      console.error("Failed to load course details for edit:", err);
      toast.error("Không thể tải đầy đủ thông tin khóa học");
    }
  };

  const handleUpdate = async () => {
    if (!editingCourseId) return;

    const creditsError = validateCreditsField(editCourse.credits);
    if (creditsError) {
      setEditCreditsError(creditsError);
      toast.error(creditsError);
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await api.updateCourse(editingCourseId, {
        name: editCourse.name,
        academicYear: editCourse.academicYear || undefined,
        term: editCourse.term || undefined,
        description: editCourse.description || undefined,
        credits: parseNumericInput(editCourse.credits, { min: 1, max: 10 }),
      });

      setCourses((prev) =>
        prev.map((course) =>
          course.id === editingCourseId
            ? {
                ...course,
                code: updated.code,
                name: updated.name,
                academicYear: updated.academicYear || course.academicYear,
                term: updated.term || course.term,
                description: updated.description,
                credits: updated.credits,
              }
            : course,
        ),
      );

      setShowEditDialog(false);
      toast.success("Đã cập nhật khóa học thành công");
    } catch (err) {
      console.error("Failed to update course:", err);
      toast.error(
        err instanceof Error ? err.message : "Cập nhật khóa học thất bại",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEnrollStudents = async () => {
    if (!createdCourseId) return;
    setIsEnrolling(true);
    setEnrollResults([]);

    try {
      if (enrollTab === "manual" && selectedStudents.length > 0) {
        const result = await api.bulkEnroll(
          createdCourseId,
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
        const successCount = result.success.length;
        setCourses((prev) =>
          prev.map((c) =>
            c.id === createdCourseId
              ? { ...c, students: c.students + successCount }
              : c,
          ),
        );
      } else if (enrollTab === "training" && selectedTrainingStudents.length > 0) {
        const result = await api.bulkEnroll(
          createdCourseId,
          selectedTrainingStudents.map((s) => s.id),
        );
        const results: EnrollResult[] = [
          ...result.success.map((id: string) => {
            const student = selectedTrainingStudents.find((s) => s.id === id);
            return {
              email: student?.email || id,
              fullName: student?.fullName,
              studentId: student?.studentId,
              status: "success" as const,
            };
          }),
          ...result.failed.map((f: { studentId: string; reason: string }) => {
            const student = selectedTrainingStudents.find((s) => s.id === f.studentId);
            return {
              email: student?.email || f.studentId,
              status: "failed" as const,
              reason: f.reason,
            };
          }),
        ];
        setEnrollResults(results);
        const successCount = result.success.length;
        setCourses((prev) =>
          prev.map((c) =>
            c.id === createdCourseId
              ? { ...c, students: c.students + successCount }
              : c,
          ),
        );
      } else if (enrollTab === "import" && importedStudents.length > 0) {
        const result = await api.bulkImportStudents(createdCourseId, importedStudents);
        const results: EnrollResult[] = [
          ...result.success.map((s: any) => ({
            email: s.email,
            fullName: s.fullName,
            studentId: s.studentId,
            // Backend provisioned flag isn't per-item, so just mark as success
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
        const successCount = result.success.length;
        setCourses((prev) =>
          prev.map((c) =>
            c.id === createdCourseId
              ? { ...c, students: c.students + successCount }
              : c,
          ),
        );
      }
    } catch (err) {
      console.error("Failed to enroll students:", err);
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleCloseDialog = () => {
    setShowCreateDialog(false);
    setTimeout(() => {
      setStep(1);
      setCreatedCourseId(null);
      setCreatedCourseCode("");
      setNewCourse({
        name: "",
        academicYear: defaultAcademicYear,
        term: defaultTerm,
        description: "",
        credits: "",
      });
      setSelectedStudents([]);
      setSelectedTrainingStudents([]);
      setSearchResults([]);
      setTrainingResults([]);
      setStudentSearch("");
      setTrainingSearch("");
      setCsvText("");
      setImportedStudents([]);
      setImportError("");
      setCsvFileName("");
      setEnrollResults([]);
      setProvisionedCount(0);
      setEnrollTab("manual");
    }, 200);
  };

  const handleDialogInteractOutside = useCallback((event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-radix-popper-content-wrapper]")) {
      event.preventDefault();
    }
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCourse(id);
      setCourses((prev) => prev.filter((c) => c.id !== id));
      toast.success("Đã xóa khóa học thành công");
    } catch (err) {
      console.error("Failed to delete course:", err);
      toast.error(
        err instanceof Error ? err.message : "Xóa khóa học thất bại",
      );
    }
  };

  const downloadTemplate = () => {
    const csvContent =
      "fullName,email,studentId,department\nNguyễn Văn An,an.nguyen@examtrust.edu,SV001,Công nghệ thông tin\nTrần Thị Bình,binh.tran@examtrust.edu,SV002,Kỹ thuật phần mềm";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mau_import_sinh_vien.csv";
    a.click();
    URL.revokeObjectURL(url);
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

  return (
    <DashboardLayout>
      <AdminPageShell backTo="/lecturer">
        <ListPageHeader
          title="Quản lý khóa học"
          className="mb-6"
          actions={
          <>
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
          <Dialog
            open={showCreateDialog}
            onOpenChange={(open) => {
              if (!open) handleCloseDialog();
              else setShowCreateDialog(true);
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Tạo khóa học
              </Button>
            </DialogTrigger>
            <DialogContent
              className="w-[96vw] max-w-[1600px] max-h-[94vh] overflow-y-auto p-7"
              onInteractOutside={handleDialogInteractOutside}
            >
              {/* Step indicator */}
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                    1
                  </span>
                  Thông tin khóa học
                </div>
                <div className="h-px w-8 bg-border" />
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                    2
                  </span>
                  Thêm sinh viên
                </div>
              </div>

              {/* === STEP 1: Course Information === */}
              {step === 1 && (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-xl">
                      Tạo khóa học mới
                    </DialogTitle>
                    <DialogDescription>
                      Nhập thông tin khóa học. Bạn có thể thêm sinh viên ở bước tiếp theo.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="courseCode">
                          Mã khóa học (tự động tạo)
                        </Label>
                        <Input
                          id="courseCode"
                          value={previewCourseCode}
                          className="font-mono"
                          disabled
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="academicYear">Năm học</Label>
                        <Select
                          value={newCourse.academicYear}
                          onValueChange={(v) =>
                            setNewCourse({ ...newCourse, academicYear: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
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
                        <Label htmlFor="courseName">Tên khóa học *</Label>
                        <Input
                          id="courseName"
                          placeholder="Ví dụ: Thuật toán nâng cao"
                          value={newCourse.name}
                          onChange={(e) =>
                            setNewCourse({ ...newCourse, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="term">Học kỳ</Label>
                        <Select
                          value={newCourse.term}
                          onValueChange={(v) =>
                            setNewCourse({
                              ...newCourse,
                              term: v as CourseTerm,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COURSE_TERM_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="credits">Số tín chỉ</Label>
                      <Input
                        id="credits"
                        type="number"
                        min={1}
                        max={10}
                        placeholder="Ví dụ: 3"
                        value={newCourse.credits}
                        onChange={(e) =>
                          setNewCourse({
                            ...newCourse,
                            credits: sanitizeNumericInput(e.target.value, {
                              min: 1,
                              max: 10,
                            }),
                          })
                        }
                        onBlur={(e) =>
                          setCreateCreditsError(
                            validateCreditsField(e.target.value) || "",
                          )
                        }
                      />
                      {createCreditsError ? (
                        <p className="text-xs text-destructive">
                          {createCreditsError}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">
                        Mô tả (không bắt buộc)
                      </Label>
                      <Textarea
                        id="description"
                        placeholder="Nhập mô tả ngắn về khóa học..."
                        value={newCourse.description}
                        onChange={(e) =>
                          setNewCourse({
                            ...newCourse,
                            description: e.target.value,
                          })
                        }
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={handleCloseDialog}>
                      Hủy
                    </Button>
                    <Button
                      onClick={handleSaveCourseInfo}
                      disabled={
                        isCreating ||
                        !newCourse.name ||
                        !newCourse.academicYear ||
                        !newCourse.term
                      }
                      className="gap-2"
                    >
                      {isCreating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      {createdCourseId ? "Lưu & tiếp tục" : "Tạo & thêm sinh viên"}
                    </Button>
                  </DialogFooter>
                </>
              )}

              {/* === STEP 2: Add Students === */}
              {step === 2 && (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      Đã tạo khóa học — Thêm sinh viên
                    </DialogTitle>
                    <DialogDescription>
                      <span className="font-semibold text-foreground">
                        {createdCourseCode || previewCourseCode}
                      </span>{" "}
                      — Khóa học {newCourse.name} đã được tạo. Hãy thêm sinh viên vào khóa học này.
                    </DialogDescription>
                  </DialogHeader>

                  <Tabs
                    value={enrollTab}
                    onValueChange={(v) =>
                      setEnrollTab(v as "manual" | "import" | "training")
                    }
                    className="mt-2"
                  >
                    <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="manual" className="gap-2">
                      <UserPlus className="h-4 w-4" /> Tìm kiếm thủ công
                    </TabsTrigger>
                    <TabsTrigger value="training" className="gap-2">
                      <GraduationCap className="h-4 w-4" /> Hệ thống đào tạo
                    </TabsTrigger>
                    <TabsTrigger value="import" className="gap-2">
                      <FileSpreadsheet className="h-4 w-4" /> Nhập CSV / Excel
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

                      {/* Search Results */}
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
                                  <p className="text-sm font-medium">
                                    {student.fullName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {student.email}{" "}
                                    {student.studentId &&
                                      `• ${student.studentId}`}
                                  </p>
                                </div>
                              </div>
                              <Plus className="h-4 w-4 text-primary" />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Selected Students */}
                      {selectedStudents.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            Sinh viên đã chọn ({selectedStudents.length})
                          </Label>
                          <div className="border rounded-lg max-h-48 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">
                                    Sinh viên
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    Email
                                  </TableHead>
                                  <TableHead className="text-xs">
                                    Mã sinh viên
                                  </TableHead>
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
                                        onClick={() =>
                                          removeStudent(student.id)
                                        }
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
                          <p className="text-sm">
                            Tìm kiếm và thêm sinh viên vào khóa học này
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    {/* Training System Search */}
                    <TabsContent value="training" className="space-y-4 mt-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Tìm sinh viên trong hệ thống đào tạo theo tên, email hoặc mã sinh viên..."
                          value={trainingSearch}
                          onChange={(e) => setTrainingSearch(e.target.value)}
                          className="bg-white pl-9"
                        />
                        {isTrainingSearching && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
                        <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <p className="text-sm text-muted-foreground">
                          Hệ thống đang dùng lớp tích hợp đào tạo để có thể kết nối API bên ngoài sau này mà không thay đổi quy trình ghi danh.
                        </p>
                      </div>

                      {trainingResults.length > 0 && (
                        <div className="border rounded-lg max-h-40 overflow-y-auto">
                          {trainingResults.map((student) => (
                            <div
                              key={student.id}
                              className="flex items-center justify-between p-2.5 hover:bg-muted/50 cursor-pointer border-b last:border-b-0 transition-colors"
                              onClick={() => addTrainingStudent(student)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                  {student.fullName.charAt(0)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium">
                                    {student.fullName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {student.email} {student.studentId && `• ${student.studentId}`}
                                  </p>
                                </div>
                              </div>
                              <Plus className="h-4 w-4 text-primary" />
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedTrainingStudents.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            Sinh viên đã chọn từ hệ thống đào tạo ({selectedTrainingStudents.length})
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
                                {selectedTrainingStudents.map((student) => (
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
                                        onClick={() => removeTrainingStudent(student.id)}
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

                      {selectedTrainingStudents.length === 0 && !trainingSearch && (
                        <div className="text-center py-8 text-muted-foreground">
                          <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">
                            Tìm kiếm và thêm sinh viên từ hệ thống đào tạo
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    {/* CSV / Excel Import */}
                    <TabsContent value="import" className="space-y-4 mt-4">
                      {createdCourseId ? (
                        <EditableStudentImport
                          courseId={createdCourseId}
                          onSuccess={(count) => {
                            setCourses((prev) => prev.map((course) => course.id === createdCourseId ? { ...course, students: course.students + count } : course));
                            setEnrollResults([{ email: "", fullName: `${count} sinh viên`, status: "success" }]);
                          }}
                        />
                      ) : null}
                      {legacyImportEnabled && <>
                      {/* Convention info */}
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                          <p className="font-medium mb-1">
                            Quy ước tệp CSV / Excel
                          </p>
                          <p className="text-xs leading-relaxed">
                            Tệp phải có đủ 4 cột: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">fullName</code>,{" "}
                            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">email</code>,{" "}
                            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">studentId</code> và{" "}
                            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">department</code>. Hỗ trợ CSV, TXT, XLS và XLSX; cột CSV có thể cách nhau bằng dấu phẩy, chấm phẩy hoặc tab.
                          </p>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-blue-600 gap-1 mt-1"
                            onClick={downloadTemplate}
                          >
                            <Download className="h-3 w-3" /> Tải tệp mẫu
                          </Button>
                        </div>
                      </div>

                      {/* File upload */}
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
                            if (file) void importStudentFile(file);
                          }}
                        >
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm font-medium">
                            {csvFileName
                              ? csvFileName
                              : "Nhấn để tải tệp lên hoặc kéo thả vào đây"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            CSV, TXT, XLS, XLSX
                          </p>
                        </div>
                      </div>

                      {/* Or paste emails */}
                      <div className="space-y-2">
                        <Label className="text-sm">
                          Hoặc dán dữ liệu CSV trực tiếp
                        </Label>
                        <Textarea
                          placeholder={
                            "fullName,email,studentId,department\nNguyễn Văn An,an.nguyen@examtrust.edu,SV001,Công nghệ thông tin"
                          }
                          value={csvText}
                          onChange={(e) => handlePasteImport(e.target.value)}
                          rows={4}
                          className="font-mono text-sm"
                        />
                      </div>

                      {importError ? <p className="text-sm text-destructive">{importError}</p> : null}

                      {/* Parsed student preview */}
                      {importedStudents.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            Đã nhận diện {importedStudents.length} sinh viên hợp lệ
                          </Label>
                          <div className="border rounded-lg max-h-32 overflow-y-auto p-2">
                            <div className="flex flex-wrap gap-1.5">
                              {importedStudents.map((student) => (
                                <span
                                  key={student.email}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted font-mono"
                                >
                                  {student.fullName} · {student.studentId} · {student.department}
                                  <button
                                    className="ml-0.5 hover:text-destructive"
                                    onClick={() =>
                                      setImportedStudents((prev) =>
                                        prev.filter((item) => item.email !== student.email),
                                      )
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
                      </>}
                    </TabsContent>
                  </Tabs>

                  {/* Enrollment Results */}
                  {enrollResults.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <Label className="text-sm font-medium">
                        Kết quả ghi danh
                      </Label>
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
                              <p className="text-xs text-muted-foreground">
                                {result.email}
                              </p>
                            </div>
                            {result.status === "failed" && (
                              <span className="text-xs text-red-600 shrink-0">
                                {result.reason}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {
                          enrollResults.filter((r) => r.status === "success")
                            .length
                        }{" "}
                        đã được ghi danh thành công
                        {provisionedCount > 0 && (
                          <span className="text-amber-600 font-medium">
                            {" "}
                            ({provisionedCount} tài khoản mới được tạo tự động với
                            mật khẩu <code>Examtrust@123</code>)
                          </span>
                        )}
                        {enrollResults.filter((r) => r.status === "failed")
                          .length > 0 &&
                          `, ${enrollResults.filter((r) => r.status === "failed").length} thất bại`}
                      </p>
                    </div>
                  )}

                  <DialogFooter className="gap-2 mt-4">
                    <Button variant="outline" onClick={handleCloseDialog}>
                      {enrollResults.length > 0 ? "Hoàn tất" : "Bỏ qua — Thêm sau"}
                    </Button>
                    {enrollResults.length === 0 && enrollTab !== "import" && (
                      <Button
                        variant="outline"
                        onClick={() => setStep(1)}
                        className="gap-2"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Quay lại thông tin khóa học
                      </Button>
                    )}
                    {enrollResults.length === 0 && (
                      <Button
                        onClick={handleEnrollStudents}
                        disabled={
                          isEnrolling ||
                          (enrollTab === "manual"
                            ? selectedStudents.length === 0
                            : importedStudents.length === 0)
                        }
                        className="gap-2"
                      >
                        {isEnrolling ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Users className="h-4 w-4" />
                        )}
                        Ghi danh{" "}
                        {enrollTab === "manual"
                          ? selectedStudents.length
                          : importedStudents.length}{" "}
                        sinh viên
                      </Button>
                    )}
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent
              className="max-w-xl"
              onInteractOutside={handleDialogInteractOutside}
            >
              <DialogHeader>
                <DialogTitle>Sửa khóa học</DialogTitle>
                <DialogDescription>
                  Cập nhật thông tin khóa học.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-code">Mã khóa học (chỉ đọc)</Label>
                    <Input
                      id="edit-code"
                      value={editCourse.code}
                      className="font-mono"
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-academicYear">Năm học</Label>
                    <Select
                      value={editCourse.academicYear}
                      onValueChange={(v) =>
                        setEditCourse((prev) => ({
                          ...prev,
                          academicYear: v,
                        }))
                      }
                    >
                      <SelectTrigger id="edit-academicYear">
                        <SelectValue />
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
                    <Label htmlFor="edit-name">Tên khóa học *</Label>
                    <Input
                      id="edit-name"
                      value={editCourse.name}
                      onChange={(e) =>
                        setEditCourse((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-term">Học kỳ</Label>
                    <Select
                      value={editCourse.term}
                      onValueChange={(v) =>
                        setEditCourse((prev) => ({
                          ...prev,
                          term: v as CourseTerm,
                        }))
                      }
                    >
                      <SelectTrigger id="edit-term">
                        <SelectValue />
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
                  <Label htmlFor="edit-credits">Số tín chỉ</Label>
                  <Input
                    id="edit-credits"
                    type="number"
                    min={1}
                    max={10}
                    value={editCourse.credits}
                    onChange={(e) =>
                      setEditCourse((prev) => ({
                        ...prev,
                        credits: sanitizeNumericInput(e.target.value, {
                          min: 1,
                          max: 10,
                        }),
                      }))
                    }
                    onBlur={(e) =>
                      setEditCreditsError(
                        validateCreditsField(e.target.value) || "",
                      )
                    }
                  />
                  {editCreditsError ? (
                    <p className="text-xs text-destructive">
                      {editCreditsError}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-description">Mô tả</Label>
                  <Textarea
                    id="edit-description"
                    value={editCourse.description}
                    onChange={(e) =>
                      setEditCourse((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                >
                  Hủy
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={
                    isUpdating ||
                    !editCourse.name ||
                    !editCourse.academicYear ||
                    !editCourse.term
                  }
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Lưu thay đổi"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <AdminStatCard
            icon={BookOpen}
            value={courses.length}
            label="Tổng khóa học"
          />
          <AdminStatCard
            icon={Users}
            value={courses.reduce((s, c) => s + c.students, 0)}
            label="Tổng sinh viên"
          />
          <AdminStatCard
            icon={GraduationCap}
            value={courses.filter((c) => c.status === "active").length}
            label="Khóa học hoạt động"
          />
          <AdminStatCard
            icon={FileSpreadsheet}
            value={courses.reduce((s, c) => s + c.exams, 0)}
            label="Tổng bài thi"
          />
        </div>

        <div className="mb-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm theo mã, tên khóa học, năm học hoặc học kỳ"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              title="Bộ lọc khóa học"
              description="Lọc theo trạng thái, năm học, học kỳ và số lượng sinh viên."
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
        </div>

        {/* Course rows */}
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">Khóa học của bạn</h2>
            <p className="text-sm text-muted-foreground">
              Quản lý khóa học và các bài thi liên quan
            </p>
          </div>

          <div
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
            style={{ minHeight: COURSE_TABLE_MIN_HEIGHT }}
          >
            <div className="hidden border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[minmax(260px,1.4fr)_80px_minmax(170px,.9fr)_90px_80px_110px_110px_24px] md:items-center md:gap-4">
              <span>Khóa học</span>
              <span>Tín chỉ</span>
              <span>Học kỳ</span>
              <span>Sinh viên</span>
              <span>Bài thi</span>
              <span>Trạng thái</span>
              <span className="text-right">Thao tác</span>
              <span className="sr-only">Mở</span>
            </div>

            <div className="divide-y">
              {displayedCourses.map((course, index) => {
                const isExpanded = expandedCourseId === course.id;
                const courseExams = courseExamsByCourseId[course.id] || [];
                const isLoadingCourseExams =
                  courseExamLoadingByCourseId[course.id];
                const hasCourseExamError = courseExamErrorByCourseId[course.id];

                return (
                  <div key={course.id}>
                    <div
                      role="link"
                      tabIndex={0}
                      className="group grid cursor-pointer gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(260px,1.4fr)_80px_minmax(170px,.9fr)_90px_80px_110px_110px_24px] md:items-center"
                      onClick={() => router.push(`/lecturer/course/${course.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/lecturer/course/${course.id}`);
                        }
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm ${getCourseGradientClass((page - 1) * ITEMS_PER_PAGE + index)}`}
                        >
                          {course.code.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {course.name}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {course.code}
                          </p>
                        </div>
                      </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 md:contents">
                    <div>
                      <span className="block text-xs text-muted-foreground md:hidden">
                        Tín chỉ
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {course.credits ?? "—"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="block text-xs text-muted-foreground md:hidden">
                        Học kỳ
                      </span>
                      <span className="block truncate text-foreground">
                        {formatCourseTerm(course.academicYear, course.term)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground md:hidden">
                        Sinh viên
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {course.students}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground md:hidden">
                        Bài thi
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-9 justify-start gap-1.5 px-2 font-semibold tabular-nums text-foreground"
                        aria-expanded={isExpanded}
                        aria-controls={`course-exams-${course.id}`}
                        aria-label={`Mở danh sách bài kiểm tra của ${course.code}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCourseExams(course.id);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {course.exams}
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                        Trạng thái
                      </span>
                      <StatusBadge status={course.status} domain="course" />
                    </div>
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2 text-xs"
                            onClick={() => openEditDialog(course)}
                          >
                            <Edit2 className="h-4 w-4" />
                            Sửa
                          </DropdownMenuItem>
                          <ConfirmActionDialog
                            title="Xóa khóa học"
                            description="Hành động này không thể hoàn tác. Khóa học sẽ bị xóa nếu không có dữ liệu phụ thuộc ngăn thao tác."
                            confirmText="Xóa"
                            destructive
                            onConfirm={() => handleDelete(course.id)}
                          >
                            <DropdownMenuItem
                              className="gap-2 text-xs text-destructive"
                              onSelect={(event) => event.preventDefault()}
                            >
                              <Trash2 className="h-4 w-4" />
                              Xóa
                            </DropdownMenuItem>
                          </ConfirmActionDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                    </div>

                    {isExpanded && (
                      <div
                        id={`course-exams-${course.id}`}
                        className="border-t bg-muted/20 px-4 py-4"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h3 className="font-semibold text-foreground">
                              Bài kiểm tra trong khóa học
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {course.code} · {course.name}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={(event) =>
                              goToNestedExamRoute(
                                event,
                                `/lecturer/exams/create?courseId=${course.id}`,
                              )
                            }
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Tạo bài kiểm tra cho khóa này
                          </Button>
                        </div>

                        {isLoadingCourseExams && (
                          <div className="space-y-2" aria-label="Đang tải bài kiểm tra">
                            {[0, 1, 2].map((item) => (
                              <div
                                key={item}
                                className="h-16 animate-pulse rounded-lg border bg-background/70"
                              />
                            ))}
                          </div>
                        )}

                        {!isLoadingCourseExams && hasCourseExamError && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <p className="text-sm text-destructive">
                                Không tải được bài kiểm tra của khóa học này.
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void loadCourseExams(course.id, true);
                                }}
                              >
                                Thử lại
                              </Button>
                            </div>
                          </div>
                        )}

                        {!isLoadingCourseExams &&
                          !hasCourseExamError &&
                          courseExams.length === 0 && (
                            <div className="rounded-lg border border-dashed bg-background/70 p-6 text-center">
                              <p className="font-medium text-foreground">
                                Khóa học này chưa có bài kiểm tra.
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Tạo bài kiểm tra đầu tiên và hệ thống sẽ tự gắn vào khóa học này.
                              </p>
                            </div>
                          )}

                        {!isLoadingCourseExams &&
                          !hasCourseExamError &&
                          courseExams.length > 0 && (
                            <div className="space-y-2">
                              {courseExams.map((exam) => {
                                const submissionCount =
                                  exam._count?.submissions ?? 0;
                                const isMonitorWindowOpen =
                                  !exam.endTime ||
                                  new Date(exam.endTime).getTime() > Date.now();
                                const canMonitor =
                                  isMonitorWindowOpen &&
                                  (exam.status === "ONGOING" ||
                                    exam.status === "PUBLISHED");
                                const canViewResults =
                                  exam.status === "COMPLETED" ||
                                  submissionCount > 0;

                                return (
                                  <div
                                    key={exam.id}
                                    className="grid gap-3 rounded-lg border bg-background/80 p-3 shadow-sm md:grid-cols-[minmax(220px,1.2fr)_minmax(220px,1fr)_120px_100px_minmax(260px,auto)] md:items-center"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-foreground">
                                        {exam.title || "Bài kiểm tra chưa đặt tên"}
                                      </p>
                                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5" />
                                        {exam.duration
                                          ? `${exam.duration} phút`
                                          : "Chưa đặt thời lượng"}
                                      </p>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {formatExamSchedule(exam)}
                                    </div>
                                    <div>
                                      <StatusBadge status={exam.status} domain="exam" />
                                    </div>
                                    <div className="text-sm">
                                      <span className="font-semibold tabular-nums text-foreground">
                                        {submissionCount}
                                      </span>{" "}
                                      <span className="text-muted-foreground">
                                        Lượt nộp
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 md:justify-end">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="border-[#E5E7EB] bg-white text-[#374151] shadow-none hover:border-[#D1D5DB] hover:bg-[#F9FAFB] hover:text-[#111827] [&>svg]:text-[#6B7280]"
                                        onClick={(event) =>
                                          goToNestedExamRoute(
                                            event,
                                            `/lecturer/exam/${exam.id}/preview`,
                                          )
                                        }
                                      >
                                        <Eye className="mr-1.5 h-4 w-4" />
                                        Xem trước
                                      </Button>
                                      {canMonitor && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8] shadow-none hover:border-[#93C5FD] hover:bg-[#DBEAFE] hover:text-[#1E40AF] [&>svg]:text-[#2563EB]"
                                          onClick={(event) =>
                                            goToNestedExamRoute(
                                              event,
                                              `/lecturer/exam/${exam.id}/monitor`,
                                            )
                                          }
                                        >
                                          <Clock className="mr-1.5 h-4 w-4" />
                                          Theo dõi
                                        </Button>
                                      )}
                                      {canViewResults && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="border-[#BBF7D0] bg-[#F0FDF4] font-semibold text-[#047857] shadow-sm hover:border-[#86EFAC] hover:bg-[#DCFCE7] hover:text-[#065F46] [&>svg]:text-[#059669]"
                                          onClick={(event) =>
                                            goToNestedExamRoute(
                                              event,
                                              `/lecturer/exam/${exam.id}/results`,
                                            )
                                          }
                                        >
                                          <BarChart3 className="mr-1.5 h-4 w-4" />
                                          Xem kết quả
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredCourses.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  Không tìm thấy khóa học
                </div>
              )}
            </div>
          </div>

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



