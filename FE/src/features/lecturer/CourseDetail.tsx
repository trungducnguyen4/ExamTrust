"use client";

import { Fragment, useState, useEffect } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
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
  TextFilterValue,
} from "@/components/common/list/filter-types";
import {
  getActiveFilterCount,
  getFilterChips,
} from "@/components/common/list/filter-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmActionDialog } from "@/components/common/ConfirmActionDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Search,
  Plus,
  FileSpreadsheet,
  UserPlus,
  Trash2,
  Mail,
  Download,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  BarChart3,
  Activity,
  Eye,
  Clock,
  ChevronDown,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import api, { unwrapPaginatedData } from "@/lib/api";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { BulkStudentImport } from "@/components/common/BulkStudentImport";
import { CourseTerm, formatCourseTerm } from "@/lib/course-term";

interface Student {
  enrollmentId: string;
  userId: string;
  studentCode: string;
  name: string;
  email: string;
  status: string;
  joinedAt: string;
}

interface Enrollment {
  id: string;
  student: {
    id: string;
    fullName: string;
    email: string;
    studentId?: string | null;
  };
  joinedAt: string;
}

interface Course {
  id: string;
  code?: string;
  name?: string;
  academicYear?: string;
  term?: CourseTerm;
}

interface CourseExamSummary {
  id: string;
  title: string;
  status: string;
  duration: number;
  startTime: string | null;
  endTime: string | null;
  submissionCount: number;
  avgScorePct: number | null;
  totalPoints?: number | null;
}

interface StudentExamPerformance {
  examId: string;
  examTitle: string;
  status: string;
  scorePct: number | null;
  submittedAt: string | null;
  reviewSignalCount: number;
}

interface StudentCoursePerformance {
  studentId: string;
  studentCode: string;
  name: string;
  email: string;
  submittedExamCount: number;
  avgScorePct: number | null;
  latestSubmissionAt: string | null;
  reviewSignalCount: number;
  examResults: StudentExamPerformance[];
}

interface CourseExam {
  id: string;
  title: string;
  status?: string;
  duration?: number;
  startTime?: string | null;
  endTime?: string | null;
  totalPoints?: number | null;
}

interface ExamSubmission {
  id: string;
  status?: string;
  score?: number | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  student?: {
    id?: string;
    fullName?: string;
    email?: string;
    studentId?: string | null;
  } | null;
  integrityFlags?: unknown[];
  anomalyFlags?: unknown[];
  securityEvents?: unknown[];
  _count?: {
    integrityEvents?: number;
    securityEvents?: number;
  };
}

const completedSubmissionStatuses = new Set([
  "SUBMITTED",
  "GRADED",
  "FLAGGED",
  "FINALIZED",
]);

// `value` is a 0-100 percentage (score * 10, since submission.score is
// already normalized to a 0-10 scale) — displayed as points out of 10 for
// consistency with ExamResultsList/ExamMonitor's avgScorePct.
const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "Chưa có dữ liệu";
  return `${(value / 10).toFixed(2)}/10`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getSubmissionReviewSignalCount = (submission: ExamSubmission) => {
  const explicitSignals =
    (Array.isArray(submission.integrityFlags)
      ? submission.integrityFlags.length
      : 0) +
    (Array.isArray(submission.anomalyFlags) ? submission.anomalyFlags.length : 0) +
    (Array.isArray(submission.securityEvents)
      ? submission.securityEvents.length
      : 0);
  const countedSignals =
    (submission._count?.integrityEvents || 0) +
    (submission._count?.securityEvents || 0);
  const statusSignal = String(submission.status || "").toUpperCase() === "FLAGGED" ? 1 : 0;
  return explicitSignals + countedSignals + statusSignal;
};

const getSubmissionScorePct = (submission: ExamSubmission) => {
  if (typeof submission.score !== "number") return null;
  return submission.score * 10;
};

export default function CourseDetail() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug : [];
  const id = typeof params?.id === "string" ? params.id : slug[1];
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/admin")
    ? "/admin"
    : "/lecturer";
  const [students, setStudents] = useState<Student[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedCourseId, setResolvedCourseId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>({
    status: "all",
    joinedAt: { from: undefined, to: undefined },
    studentCode: { value: "", operator: "contains" },
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>({
    status: "all",
    joinedAt: { from: undefined, to: undefined },
    studentCode: { value: "", operator: "contains" },
  });
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [courseExams, setCourseExams] = useState<CourseExamSummary[]>([]);
  const [studentPerformance, setStudentPerformance] = useState<
    StudentCoursePerformance[]
  >([]);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(
    null,
  );
  const [performancePage, setPerformancePage] = useState(1);
  const [courseExamLoading, setCourseExamLoading] = useState(false);

  // Manual Add Form
  const [newStudent, setNewStudent] = useState({ name: "", id: "", email: "" });



  const loadCourseExamData = async (
    courseId: string,
    enrolledStudents: Student[],
  ) => {
    setCourseExamLoading(true);
    try {
      const exams = unwrapPaginatedData<CourseExam>(
        await api.getExams({ courseId, limit: 100 }),
      );
      const examRows = await Promise.all(
        exams.map(async (exam) => {
          const [overview, submissionsRes] = await Promise.all([
            api.getExamOverview(exam.id).catch(() => null),
            api.getExamSubmissions(exam.id, 1, 500).catch(() => null),
          ]);
          const submissions = unwrapPaginatedData<ExamSubmission>(submissionsRes);
          const totalPoints =
            overview?.exam?.totalPoints ?? exam.totalPoints ?? null;
          const completedSubmissions = submissions.filter((submission) =>
            completedSubmissionStatuses.has(
              String(submission.status || "").toUpperCase(),
            ),
          );
          const avgScorePct =
            typeof overview?.summary?.avgScorePct === "number"
              ? overview.summary.avgScorePct
              : null;

          return {
            summary: {
              id: exam.id,
              title: exam.title,
              status: exam.status || "DRAFT",
              duration: exam.duration || 0,
              startTime: exam.startTime || null,
              endTime: exam.endTime || null,
              submissionCount:
                overview?.summary?.totalSubmissions ??
                submissions.length ??
                0,
              avgScorePct,
              totalPoints,
            } satisfies CourseExamSummary,
            submissions: completedSubmissions,
            totalPoints,
          };
        }),
      );

      setCourseExams(examRows.map((row) => row.summary));

      const submissionsByStudent = new Map<string, StudentExamPerformance[]>();
      examRows.forEach((row) => {
        row.submissions.forEach((submission) => {
          const studentId = submission.student?.id;
          if (!studentId) return;
          const current = submissionsByStudent.get(studentId) || [];
          current.push({
            examId: row.summary.id,
            examTitle: row.summary.title,
            status: submission.status || "SUBMITTED",
            scorePct: getSubmissionScorePct(submission),
            submittedAt:
              submission.submittedAt ||
              submission.updatedAt ||
              submission.createdAt ||
              null,
            reviewSignalCount: getSubmissionReviewSignalCount(submission),
          });
          submissionsByStudent.set(studentId, current);
        });
      });

      setStudentPerformance(
        enrolledStudents.map((student) => {
          const submissions = submissionsByStudent.get(student.userId) || [];
          const scored = submissions
            .map((submission) =>
              typeof submission.scorePct === "number"
                ? submission.scorePct
                : null,
            )
            .filter((score): score is number => score !== null);
          const latestSubmissionAt = submissions
            .map((submission) => submission.submittedAt)
            .filter((value): value is string => Boolean(value))
            .sort(
              (a, b) => new Date(b).getTime() - new Date(a).getTime(),
            )[0] || null;
          const submissionsByExam = new Map(
            submissions.map((submission) => [submission.examId, submission]),
          );

          return {
            studentId: student.userId,
            studentCode: student.studentCode,
            name: student.name,
            email: student.email,
            submittedExamCount: submissions.length,
            avgScorePct:
              scored.length > 0
                ? scored.reduce((sum, score) => sum + score, 0) / scored.length
                : null,
            latestSubmissionAt,
            reviewSignalCount: submissions.reduce(
              (sum, submission) => sum + submission.reviewSignalCount,
              0,
            ),
            examResults: examRows.map((row) => {
              const submitted = submissionsByExam.get(row.summary.id);
              return (
                submitted || {
                  examId: row.summary.id,
                  examTitle: row.summary.title,
                  status: "NOT_SUBMITTED",
                  scorePct: null,
                  submittedAt: null,
                  reviewSignalCount: 0,
                }
              );
            }),
          };
        }),
      );
    } catch (error) {
      console.error("Failed to load course exams:", error);
      setCourseExams([]);
      setStudentPerformance(
        enrolledStudents.map((student) => ({
          studentId: student.userId,
          studentCode: student.studentCode,
          name: student.name,
          email: student.email,
          submittedExamCount: 0,
          avgScorePct: null,
          latestSubmissionAt: null,
          reviewSignalCount: 0,
          examResults: [],
        })),
      );
    } finally {
      setCourseExamLoading(false);
    }
  };

  const reloadEnrollments = async (courseId: string) => {
    const enrollments: Enrollment[] = await api.getCourseEnrollments(courseId);
    const mapped: Student[] = enrollments.map((e: Enrollment) => ({
      enrollmentId: e.id,
      userId: e.student.id,
      studentCode: e.student.studentId || e.student.id.slice(0, 8),
      name: e.student.fullName,
      email: e.student.email,
      status: "active",
      joinedAt: new Date(e.joinedAt).toISOString().split("T")[0],
    }));
    setStudents(mapped);
    await loadCourseExamData(courseId, mapped);
  };

  const fetchData = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Try fetching by id first (DB id). If not found, fallback to searching by course code.
        let courseRes: any | null = null;
        let enrollments: Enrollment[] = [];
        let nextResolvedCourseId: string | null = null;

        try {
          courseRes = await api.getCourse(id);
        } catch (err) {
          courseRes = null;
        }

        if (!courseRes || !courseRes.id) {
          // fallback: fetch all courses and match by code or id
          try {
            const courses = unwrapPaginatedData(await api.getCourses());
            const found = courses.find(
              (c: any) =>
                (c.code && c.code.toLowerCase() === String(id).toLowerCase()) ||
                c.id === id,
            );
            if (found) {
              courseRes = found;
            }
          } catch (err) {
            console.warn("Failed to fetch courses for fallback lookup", err);
          }
        }

        if (courseRes && courseRes.id) {
          // fetch enrollments by the resolved course id
          enrollments = await api.getCourseEnrollments(courseRes.id);
          setCourse({
            id: courseRes.id,
            code: courseRes.code,
            name: courseRes.name,
            academicYear: courseRes.academicYear,
            term: courseRes.term,
          });
          nextResolvedCourseId = courseRes.id;
          setResolvedCourseId(courseRes.id);
        } else {
          // no course found — keep course as null and try to fetch enrollments by id param anyway
          try {
            enrollments = await api.getCourseEnrollments(id);
            nextResolvedCourseId = id;
            setResolvedCourseId(id);
          } catch (err) {
            enrollments = [];
            nextResolvedCourseId = null;
            setResolvedCourseId(null);
          }
        }

        const mapped: Student[] = enrollments.map((e: Enrollment) => ({
          enrollmentId: e.id,
          userId: e.student.id,
          studentCode: e.student.studentId || e.student.id.slice(0, 8),
          name: e.student.fullName,
          email: e.student.email,
          status: "active",
          joinedAt: new Date(e.joinedAt).toISOString().split("T")[0],
        }));
        setStudents(mapped);
        if (nextResolvedCourseId) {
          await loadCourseExamData(nextResolvedCourseId, mapped);
        } else {
          setCourseExams([]);
          setStudentPerformance([]);
        }
      } catch (err) {
        console.error("Failed to fetch course or enrollments:", err);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchData();
  }, [id]);

  const studentFilterDefinitions: FilterDefinition[] = [
    {
      key: "status",
      label: "Trạng thái",
      type: "select",
      allLabel: "Tất cả trạng thái",
      options: [{ label: "Đang hoạt động", value: "active" }],
    },
    {
      key: "joinedAt",
      label: "Ngày tham gia",
      type: "date-range",
    },
    {
      key: "studentCode",
      label: "Mã sinh viên",
      type: "text",
      placeholder: "Lọc theo mã sinh viên",
      operators: ["contains", "startsWith", "equals"],
    },
  ];

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filteredStudents = sortItems(students.filter((student) => {
    const statusFilter = appliedFilters.status as string | undefined;
    const joinedAtFilter = appliedFilters.joinedAt as
      | { from?: string; to?: string }
      | undefined;
    const codeFilter = appliedFilters.studentCode as TextFilterValue | undefined;

    const searchMatched = !normalizedSearch
      ? true
      : [student.name, student.studentCode, student.email]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
    if (!searchMatched) return false;

    const matchesStatus =
      !statusFilter || statusFilter === "all" || student.status === statusFilter;
    if (!matchesStatus) return false;

    const matchesCode = (() => {
      if (!codeFilter || !codeFilter.value.trim()) return true;
      const source = student.studentCode.toLowerCase();
      const value = codeFilter.value.trim().toLowerCase();
      if (codeFilter.operator === "startsWith") return source.startsWith(value);
      if (codeFilter.operator === "equals") return source === value;
      return source.includes(value);
    })();
    if (!matchesCode) return false;

    const matchesJoinedDate = (() => {
      if (!joinedAtFilter || (!joinedAtFilter.from && !joinedAtFilter.to)) return true;
      const joinedTs = new Date(student.joinedAt).getTime();
      if (Number.isNaN(joinedTs)) return false;
      if (joinedAtFilter.from) {
        const fromTs = new Date(joinedAtFilter.from).getTime();
        if (!Number.isNaN(fromTs) && joinedTs < fromTs) return false;
      }
      if (joinedAtFilter.to) {
        const toDate = new Date(joinedAtFilter.to);
        toDate.setHours(23, 59, 59, 999);
        const toTs = toDate.getTime();
        if (!Number.isNaN(toTs) && joinedTs > toTs) return false;
      }
      return true;
    })();

    return matchesJoinedDate;
  }), sortField, sortOrder);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / ITEMS_PER_PAGE));
  const paginatedStudents = filteredStudents.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );
  const STUDENT_ROW_HEIGHT = 56;
  const STUDENT_TABLE_HEADER_HEIGHT = 48;
  const STUDENT_TABLE_MIN_HEIGHT =
    ITEMS_PER_PAGE * STUDENT_ROW_HEIGHT + STUDENT_TABLE_HEADER_HEIGHT;
  const PERFORMANCE_ITEMS_PER_PAGE = 10;
  const performanceTotalPages = Math.max(
    1,
    Math.ceil(studentPerformance.length / PERFORMANCE_ITEMS_PER_PAGE),
  );
  const paginatedStudentPerformance = studentPerformance.slice(
    (performancePage - 1) * PERFORMANCE_ITEMS_PER_PAGE,
    performancePage * PERFORMANCE_ITEMS_PER_PAGE,
  );

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPerformancePage((current) => Math.min(current, performanceTotalPages));
  }, [performanceTotalPages]);

  const runSearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };
  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(1);
  };
  const clearFilters = () => {
    const emptyFilters: FilterValues = {
      status: "all",
      joinedAt: { from: undefined, to: undefined },
      studentCode: { value: "", operator: "contains" },
    };
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  };
  const removeFilter = (key: string) => {
    const emptyFilters: FilterValues = {
      status: "all",
      joinedAt: { from: undefined, to: undefined },
      studentCode: { value: "", operator: "contains" },
    };
    const next = { ...appliedFilters, [key]: emptyFilters[key] };
    setAppliedFilters(next);
    setDraftFilters(next);
    setPage(1);
  };

  const activeFilterCount = getActiveFilterCount(
    appliedFilters,
    studentFilterDefinitions,
  );
  const activeFilterChips = getFilterChips(appliedFilters, studentFilterDefinitions);

  const studentSortOptions = [
    { field: "studentCode", label: "Mã sinh viên" },
    { field: "name", label: "Họ tên" },
    { field: "joinedAt", label: "Ngày tham gia" },
  ];

  const handleAddManual = async () => {
    if (!resolvedCourseId) return;
    const keyword = newStudent.id.trim().toLowerCase();
    if (!keyword) return;

    try {
      setIsAdding(true);
      const studentsDb = await api.getStudents();
      const target = studentsDb.find(
        (s: any) =>
          String(s.email || "").toLowerCase() === keyword ||
          String(s.studentId || "").toLowerCase() === keyword,
      );

      if (!target) {
        toast.error("Không tìm thấy sinh viên với email hoặc mã sinh viên đã nhập");
        return;
      }

      await api.enrollStudent(resolvedCourseId, target.id);
      await reloadEnrollments(resolvedCourseId);
      setNewStudent({ name: "", id: "", email: "" });
      toast.success("Đã thêm sinh viên thành công");
    } catch (err: any) {
      toast.error(err?.message || "Thêm sinh viên thất bại");
    } finally {
      setIsAdding(false);
    }
  };



  const handleDelete = async (enrollmentId: string) => {
    try {
      await api.removeEnrollment(enrollmentId);
      setStudents((prev) =>
        prev.filter((s) => s.enrollmentId !== enrollmentId),
      );
      toast.success("Đã xóa sinh viên khỏi khóa học");
    } catch (err: any) {
      toast.error(err?.message || "Xóa sinh viên thất bại");
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

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* <BackToDashboardButton to={basePath} className="-ml-2" /> */}

        {/* Header */}
        <div>
          <Button
            variant="ghost"
            className="pl-0 gap-2 mb-2 text-muted-foreground hover:text-foreground"
            onClick={() =>
              router.push(
                basePath === "/admin"
                  ? "/admin/courses"
                  : "/lecturer/create-course",
              )
            }
          >
            <ArrowLeft className="h-4 w-4" /> Quay lại danh sách khóa học
          </Button>
          <ListPageHeader
            title={`${course?.name || "Chi tiết khóa học"}${course?.code ? ` (${course.code})` : ""}`}
            actions={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchData}
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
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" /> Xuất danh sách
                </Button>
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <UserPlus className="h-4 w-4" /> Thêm sinh viên
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
                    <DialogHeader>
                      <DialogTitle>Thêm sinh viên vào học phần</DialogTitle>
                      <DialogDescription>
                        Thêm sinh viên thủ công hoặc nhập từ tệp CSV.
                      </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="manual" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="manual">Nhập thủ công</TabsTrigger>
                        <TabsTrigger value="import">Nhập từ tệp</TabsTrigger>
                      </TabsList>

                      {/* Manual Entry Tab */}
                      <TabsContent value="manual" className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="sid">
                            Email / mã sinh viên{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="sid"
                            placeholder="Ví dụ: student@university.edu hoặc 20120001"
                            value={newStudent.id}
                            onChange={(e) =>
                              setNewStudent({ ...newStudent, id: e.target.value })
                            }
                          />
                        </div>
                        <Button
                          onClick={handleAddManual}
                          className="w-full mt-2"
                          disabled={!newStudent.id || isAdding}
                        >
                          {isAdding ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Thêm sinh viên
                        </Button>
                      </TabsContent>

                      {/* Import File Tab */}
                      <TabsContent value="import" className="py-4">
                        {resolvedCourseId ? (
                          <BulkStudentImport
                            courseId={resolvedCourseId}
                            onImportSuccess={async () => {
                              if (resolvedCourseId) {
                                await reloadEnrollments(resolvedCourseId);
                              }
                            }}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Không xác định được học phần. Không thể nhập sinh viên.
                          </p>
                        )}
                      </TabsContent>
                    </Tabs>
                  </DialogContent>
                </Dialog>
              </div>
            }
          />
          <p className="text-muted-foreground">
            {formatCourseTerm(
              course?.academicYear,
              course?.term,
            )} • {students.length} sinh viên đã tham gia
          </p>
        </div>

        <Tabs defaultValue="students" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="students">Sinh viên</TabsTrigger>
            <TabsTrigger value="exams">Bài kiểm tra & thống kê</TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="space-y-4">
        {/* Filters */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm theo họ tên, mã sinh viên hoặc email"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              title="Bộ lọc sinh viên"
              description="Lọc theo trạng thái, ngày tham gia và mã sinh viên."
              filters={studentFilterDefinitions}
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
              options={studentSortOptions}
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

        {/* Student List */}
        <Card>
          <CardContent className="p-0">
            <div
              className="overflow-hidden"
              style={{ minHeight: STUDENT_TABLE_MIN_HEIGHT }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã sinh viên</TableHead>
                    <TableHead>Họ tên</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tham gia</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStudents.length > 0 ? (
                    paginatedStudents.map((student) => (
                      <TableRow key={student.enrollmentId}>
                        <TableCell className="font-mono font-medium">
                          {student.studentCode}
                        </TableCell>
                        <TableCell>{student.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            <span>{student.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={student.status} domain="user" />
                        </TableCell>
                        <TableCell>{student.joinedAt}</TableCell>
                        <TableCell className="text-right">
                          <ConfirmActionDialog
                            title="Xóa sinh viên khỏi khóa học"
                            description="Sinh viên sẽ bị xóa khỏi khóa học và mất quyền truy cập vào nội dung, ghi danh của khóa học này. Tiếp tục?"
                            confirmText="Xóa"
                            cancelText="Hủy"
                            destructive
                            onConfirm={() => handleDelete(student.enrollmentId)}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </ConfirmActionDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Không tìm thấy sinh viên phù hợp với tìm kiếm của bạn.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredStudents.length}
              onPageChange={setPage}
              itemLabel="sinh viên"
              syncUrl={false}
            />
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="exams" className="space-y-5">
            {courseExamLoading ? (
              <Card>
                <CardContent className="flex min-h-[260px] items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm">Đang tải thống kê bài kiểm tra...</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <Card>
                    <CardContent className="flex items-center gap-3 pt-6">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Bài kiểm tra
                        </p>
                        <p className="text-2xl font-semibold tabular-nums">
                          {courseExams.length}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center gap-3 pt-6">
                      <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Lượt nộp
                        </p>
                        <p className="text-2xl font-semibold tabular-nums">
                          {courseExams.reduce(
                            (sum, exam) => sum + exam.submissionCount,
                            0,
                          )}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center gap-3 pt-6">
                      <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600">
                        <Activity className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Tín hiệu cần xem xét
                        </p>
                        <p className="text-2xl font-semibold tabular-nums">
                          {studentPerformance.reduce(
                            (sum, student) => sum + student.reviewSignalCount,
                            0,
                          )}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Bài kiểm tra của khóa học</CardTitle>
                    <CardDescription>
                      Mỗi dòng liên kết nhanh tới kết quả, giám sát và phân tích.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bài kiểm tra</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead>Lượt nộp</TableHead>
                            <TableHead>Điểm TB</TableHead>
                            <TableHead>Lịch</TableHead>
                            <TableHead className="text-right">Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {courseExams.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={6}
                                className="py-10 text-center text-muted-foreground"
                              >
                                Chưa có bài kiểm tra nào liên kết với khóa học này.
                              </TableCell>
                            </TableRow>
                          ) : (
                            courseExams.map((exam) => (
                              <TableRow key={exam.id}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {exam.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {exam.duration || 0} phút
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <StatusBadge
                                    status={exam.status}
                                    domain="exam"
                                  />
                                </TableCell>
                                <TableCell className="tabular-nums">
                                  {exam.submissionCount}
                                </TableCell>
                                <TableCell>
                                  {formatPercent(exam.avgScorePct)}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDateTime(exam.startTime)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {(exam.status === "ONGOING" ||
                                        exam.status === "PUBLISHED") &&
                                        (!exam.endTime || new Date(exam.endTime).getTime() > Date.now()) && (
                                        <DropdownMenuItem
                                          className="gap-2 text-xs"
                                          onClick={() => router.push(`${basePath}/exam/${exam.id}/monitor`)}
                                        >
                                          <Clock className="h-4 w-4" />
                                          Theo dõi
                                        </DropdownMenuItem>
                                      )}
                                      {(exam.status === "COMPLETED" ||
                                        exam.submissionCount > 0) && (
                                        <DropdownMenuItem
                                          className="gap-2 text-xs"
                                          onClick={() => router.push(`${basePath}/exam/${exam.id}/results`)}
                                        >
                                          <Eye className="h-4 w-4" />
                                          Xem kết quả
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        className="gap-2 text-xs"
                                        onClick={() => router.push(`${basePath}/analytics?examId=${exam.id}`)}
                                      >
                                        <BarChart3 className="h-4 w-4" />
                                        Phân tích
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Theo từng sinh viên</CardTitle>
                    <CardDescription>
                      Tổng hợp lượt nộp, điểm trung bình và tín hiệu cần xem xét.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sinh viên</TableHead>
                            <TableHead>Mã SV</TableHead>
                            <TableHead>Đã nộp</TableHead>
                            <TableHead>Điểm TB</TableHead>
                            <TableHead>Bài gần nhất</TableHead>
                            <TableHead>Tín hiệu cần xem xét</TableHead>
                            <TableHead className="text-right">Chi tiết</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {studentPerformance.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={7}
                                className="py-10 text-center text-muted-foreground"
                              >
                                Chưa có sinh viên để tổng hợp thống kê.
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedStudentPerformance.map((student) => {
                              const isExpanded =
                                expandedStudentId === student.studentId;
                              const completionPct =
                                courseExams.length > 0
                                  ? (student.submittedExamCount /
                                      courseExams.length) *
                                    100
                                  : 0;

                              return (
                                <Fragment key={student.studentId}>
                                  <TableRow>
                                    <TableCell>
                                      <div>
                                        <p className="font-medium text-foreground">
                                          {student.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {student.email}
                                        </p>
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-mono">
                                      {student.studentCode}
                                    </TableCell>
                                    <TableCell>
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 text-sm tabular-nums">
                                          <span>
                                            {student.submittedExamCount}/
                                            {courseExams.length}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {Math.round(completionPct)}%
                                          </span>
                                        </div>
                                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                                          <div
                                            className="h-full rounded-full bg-primary"
                                            style={{
                                              width: `${Math.min(
                                                completionPct,
                                                100,
                                              )}%`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {formatPercent(student.avgScorePct)}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {formatDateTime(student.latestSubmissionAt)}
                                    </TableCell>
                                    <TableCell>
                                      {student.reviewSignalCount > 0 ? (
                                        <StatusBadge tone="warning">
                                          {student.reviewSignalCount} tín hiệu
                                        </StatusBadge>
                                      ) : (
                                        <span className="text-sm text-muted-foreground">
                                          Không có
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() =>
                                          setExpandedStudentId((current) =>
                                            current === student.studentId
                                              ? null
                                              : student.studentId,
                                          )
                                        }
                                      >
                                        Chi tiết
                                        <ChevronDown
                                          className={`h-4 w-4 transition-transform ${
                                            isExpanded ? "rotate-180" : ""
                                          }`}
                                        />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && (
                                    <TableRow>
                                      <TableCell
                                        colSpan={7}
                                        className="bg-muted/30 p-4"
                                      >
                                        <div className="overflow-x-auto rounded-lg border bg-background">
                                          <div className="min-w-[760px]">
                                            <div className="grid grid-cols-[minmax(240px,1fr)_140px_120px_170px_140px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                              <span>Bài kiểm tra</span>
                                              <span>Trạng thái</span>
                                              <span>Điểm</span>
                                              <span>Thời gian nộp</span>
                                              <span>Tín hiệu</span>
                                            </div>
                                            {student.examResults.map((result) => (
                                              <div
                                                key={`${student.studentId}-${result.examId}`}
                                                className="grid grid-cols-[minmax(240px,1fr)_140px_120px_170px_140px] items-center gap-3 border-b px-4 py-3 last:border-b-0"
                                              >
                                                <div>
                                                  <p className="font-medium text-foreground">
                                                    {result.examTitle}
                                                  </p>
                                                </div>
                                                <div>
                                                  {result.status ===
                                                  "NOT_SUBMITTED" ? (
                                                    <StatusBadge tone="neutral">
                                                      Chưa nộp
                                                    </StatusBadge>
                                                  ) : (
                                                    <StatusBadge
                                                      status={result.status}
                                                      domain="exam"
                                                    />
                                                  )}
                                                </div>
                                                <div className="font-medium tabular-nums">
                                                  {formatPercent(result.scorePct)}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                  {formatDateTime(
                                                    result.submittedAt,
                                                  )}
                                                </div>
                                                <div>
                                                  {result.reviewSignalCount >
                                                  0 ? (
                                                    <StatusBadge tone="warning">
                                                      {
                                                        result.reviewSignalCount
                                                      }{" "}
                                                      tín hiệu
                                                    </StatusBadge>
                                                  ) : (
                                                    <span className="text-sm text-muted-foreground">
                                                      Không có
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </Fragment>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {studentPerformance.length > 0 && (
                      <DataPagination
                        currentPage={performancePage}
                        totalPages={performanceTotalPages}
                        totalItems={studentPerformance.length}
                        itemLabel="sinh viên"
                        onPageChange={(nextPage) => {
                          setExpandedStudentId(null);
                          setPerformancePage(nextPage);
                        }}
                        syncUrl={false}
                      />
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}


