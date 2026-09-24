"use client";

import { useEffect, useState } from "react";
import { DataPagination } from "@/components/common/DataPagination";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { HelpedTitle } from "@/components/common/ContextHelp";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
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
  Shield,
  AlertTriangle,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  MousePointerClick,
  Copy,
  Loader2,
  RefreshCw,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { IntegrityCaseDetail } from "@/components/admin/IntegrityCaseDetail";
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
import api, { unwrapPaginatedData } from "@/lib/api";
import { COURSE_TERM_OPTIONS, getAcademicYearOptions } from "@/lib/course-term";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface FlaggedSubmission {
  id: string;
  submissionId?: string;
  attemptNo?: number | null;
  studentId: string;
  studentName: string;
  examId: string;
  examTitle: string;
  academicYear?: string | null;
  term?: string | null;
  submittedAt: string;
  confidence: "High" | "Medium" | "Low";
  status: "pending" | "reviewed" | "dismissed" | "confirmed";
  academicScore?: number;
  integrityReview?: {
    status: "pending" | "reviewed" | "dismissed" | "confirmed";
    reviewerNote?: string | null;
    decidedAt?: string | null;
    penaltyPercent?: number | null;
    penaltyMode?: 'PERCENT' | 'FIXED' | null;
    penaltyAmount?: number | null;
    academicScore?: number | null;
    deductedScore?: number | null;
    finalScore?: number | null;
    auditLogs?: Array<{
      action: string;
      previousPercent?: number | null;
      nextPercent?: number | null;
      deductedScore?: number | null;
      note?: string | null;
      createdAt: string;
    }>;
  } | null;
  reasons: IntegrityReason[];
  similarityScore?: number;
  timeAnomaly?: boolean;
  patternMatch?: string[];
}


export interface IntegrityReason {
  type: "similarity" | "timing" | "pattern" | "behavior";
  description: string;
  weight: number;
  evidence?: string;
}

type IntegrityStats = {
  totalFlagged: number;
  pendingReview: number;
  highConfidence: number;
  confirmedCases: number;
};

type IntegrityPatterns = {
  tabSwitch: number;
  mouseAnomaly: number;
  copyPaste: number;
  otherBehavior: number;
};

type IntegrityCasesResponse = {
  data?: FlaggedSubmission[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats?: IntegrityStats;
  patterns?: IntegrityPatterns;
  timeline?: Array<{ date: string; count: number; highConfidence: number }>;
};

const EMPTY_STATS: IntegrityStats = {
  totalFlagged: 0,
  pendingReview: 0,
  highConfidence: 0,
  confirmedCases: 0,
};

const EMPTY_PATTERNS: IntegrityPatterns = {
  tabSwitch: 0,
  mouseAnomaly: 0,
  copyPaste: 0,
  otherBehavior: 0,
};

const EMPTY_FILTERS: FilterValues = {
  confidence: "all",
  examId: "all",
  courseId: "all",
  term: "all",
  academicYear: "all",
  submittedAt: { from: undefined, to: undefined },
  timeAnomaly: undefined,
};

const INTEGRITY_ROWS_PER_VIEW = 10;

export default function IntegrityOverview({ lecturerScope = false }: { lecturerScope?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const directSubmissionId = searchParams.get('submissionId')?.trim() || '';
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterValues>(EMPTY_FILTERS);
  const [selectedCase, setSelectedCase] = useState<FlaggedSubmission | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [submissions, setSubmissions] = useState<FlaggedSubmission[]>([]);
  const [stats, setStats] = useState<IntegrityStats>(EMPTY_STATS);
  const [patterns, setPatterns] = useState<IntegrityPatterns>(EMPTY_PATTERNS);
  const [timeline, setTimeline] = useState<Array<{ date: string; count: number; highConfidence: number }>>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [examOptions, setExamOptions] = useState<{ value: string; label: string }[]>([]);
  const [courseOptions, setCourseOptions] = useState<{ value: string; label: string }[]>([]);
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    if (!lecturerScope && String(user?.role || '').toUpperCase() === 'LECTURER') router.replace('/lecturer/integrity');
  }, [lecturerScope, router, user?.role]);

  const reviewCase = async (
    status: 'REVIEWED' | 'DISMISSED' | 'CONFIRMED',
    notes: string,
    deductionPercent?: 10 | 25 | 50 | 100,
    applyPenalty?: boolean,
    penaltyMode?: 'PERCENT' | 'FIXED',
    penaltyAmount?: number,
  ) => {
    if (!selectedCase?.submissionId) return;
    setSavingReview(true);
    try {
      const updatedReview = await api.reviewIntegrityCase(selectedCase.submissionId, {
        status,
        notes: notes || undefined,
        deductionPercent,
        applyPenalty,
        penaltyMode,
        penaltyAmount,
      });
      const nextStatus = status.toLowerCase() as FlaggedSubmission['status'];
      setSubmissions((items) => items.map((item) => item.id === selectedCase.id ? {
        ...item,
        status: nextStatus,
        integrityReview: updatedReview ? {
          status: nextStatus,
          reviewerNote: updatedReview.reviewerNote,
          decidedAt: updatedReview.decidedAt,
          penaltyPercent: updatedReview.penaltyPercent,
          penaltyMode: updatedReview.penaltyMode,
          penaltyAmount: updatedReview.penaltyAmount == null ? null : Number(updatedReview.penaltyAmount),
          academicScore: updatedReview.academicScore == null ? null : Number(updatedReview.academicScore),
          deductedScore: updatedReview.deductedScore == null ? null : Number(updatedReview.deductedScore),
          finalScore: updatedReview.finalScore == null ? null : Number(updatedReview.finalScore),
        } : item.integrityReview,
      } : item));
      setSelectedCase(null);
      if (directSubmissionId) router.replace(pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu kết quả xem xét');
    } finally {
      setSavingReview(false);
    }
  };

  const integrityFilters: FilterDefinition[] = [
    {
      key: "confidence",
      label: "Mức tín hiệu",
      type: "select",
      allLabel: "Tất cả mức tín hiệu",
      options: [
        { label: "Cao", value: "High" },
        { label: "Trung bình", value: "Medium" },
        { label: "Thấp", value: "Low" },
      ],
    },
    {
      key: "courseId",
      label: "Khóa học",
      type: "select",
      allLabel: "Tất cả khóa học",
      options: courseOptions,
    },
    {
      key: "examId",
      label: "Bài thi",
      type: "select",
      allLabel: "Tất cả bài thi",
      options: examOptions,
    },
    {
      key: "academicYear",
      label: "Năm học",
      type: "select",
      allLabel: "Tất cả năm học",
      options: getAcademicYearOptions().map((year) => ({ value: year, label: year })),
    },
    {
      key: "term",
      label: "Học kỳ",
      type: "select",
      allLabel: "Tất cả học kỳ",
      options: COURSE_TERM_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    },
    {
      key: "submittedAt",
      label: "Thời gian nộp",
      type: "date-range",
    },
    {
      key: "timeAnomaly",
      label: "Bất thường thời gian",
      type: "boolean",
      trueLabel: "Có tín hiệu",
      falseLabel: "Không có tín hiệu",
    },
  ];

  useEffect(() => {
    let mounted = true;
    api
      .getExams({ limit: 500, includeArchived: true })
      .then((res) => {
        if (!mounted) return;
        const exams = unwrapPaginatedData(res);
        setExamOptions(
          exams.map((e: any) => ({ value: e.id, label: e.title || "Không tên" })),
        );
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    // GET /courses is already role-scoped server-side (lecturer -> own
    // courses, admin -> all), so this one call works for both entry points
    // of this component.
    api
      .getCourses({ limit: 500 })
      .then((res) => {
        if (!mounted) return;
        const courses = Array.isArray(res) ? res : unwrapPaginatedData(res);
        setCourseOptions(
          (courses || []).map((c: any) => ({
            value: c.id,
            label: c.code ? `${c.code} - ${c.name}` : c.name || "Không tên",
          })),
        );
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const fetchCases = async (mountedRef?: { mounted: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const examIdFilter = appliedFilters.examId as string | undefined;
      const courseIdFilter = appliedFilters.courseId as string | undefined;
      const termFilter = appliedFilters.term as string | undefined;
      const academicYearFilter = appliedFilters.academicYear as string | undefined;
      const submittedAtRange = appliedFilters.submittedAt as
        | { from?: string; to?: string }
        | undefined;
      const response = (await api.getIntegrityCases({
        page,
        limit: INTEGRITY_ROWS_PER_VIEW,
        search: appliedSearch || undefined,
        confidence: (appliedFilters.confidence as string | undefined) || "all",
        examId: examIdFilter && examIdFilter !== "all" ? examIdFilter : undefined,
        courseId: courseIdFilter && courseIdFilter !== "all" ? courseIdFilter : undefined,
        term: termFilter && termFilter !== "all" ? termFilter : undefined,
        academicYear:
          academicYearFilter && academicYearFilter !== "all"
            ? academicYearFilter
            : undefined,
        submittedFrom: submittedAtRange?.from,
        submittedTo: submittedAtRange?.to,
        timeAnomaly: appliedFilters.timeAnomaly as boolean | undefined,
        status: activeTab,
        submissionId: directSubmissionId || undefined,
      })) as IntegrityCasesResponse;

      if (mountedRef && !mountedRef.mounted) return;
      setSubmissions(Array.isArray(response.data) ? response.data : []);
      setStats(response.stats || EMPTY_STATS);
      setPatterns(response.patterns || EMPTY_PATTERNS);
      setTimeline(Array.isArray(response.timeline) ? response.timeline : []);
      setTotalItems(response.pagination?.total || 0);
      setTotalPages(response.pagination?.totalPages || 1);
    } catch (err) {
      if (mountedRef && !mountedRef.mounted) return;
      setSubmissions([]);
      setStats(EMPTY_STATS);
      setPatterns(EMPTY_PATTERNS);
      setTimeline([]);
      setTotalItems(0);
      setTotalPages(1);
      setError(
        err instanceof Error ? err.message : "Không thể tải các trường hợp cần xem xét",
      );
    } finally {
      if (!mountedRef || mountedRef.mounted) setLoading(false);
    }
  };

  useEffect(() => {
    const mountedRef = { mounted: true };
    fetchCases(mountedRef);
    return () => {
      mountedRef.mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, appliedFilters, appliedSearch, directSubmissionId, page]);

  useEffect(() => {
    if (!directSubmissionId || loading) return;
    const matchingCase = submissions.find((item) => item.submissionId === directSubmissionId);
    if (matchingCase) {
      setSelectedCase(matchingCase);
      return;
    }
    setError('Không tìm thấy vụ việc hoặc bạn không có quyền xem lượt làm bài này.');
  }, [directSubmissionId, loading, submissions]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const INTEGRITY_ROW_HEIGHT = 64;
  const INTEGRITY_TABLE_HEADER_HEIGHT = 48;
  const INTEGRITY_TABLE_MIN_HEIGHT =
    INTEGRITY_ROWS_PER_VIEW * INTEGRITY_ROW_HEIGHT +
    INTEGRITY_TABLE_HEADER_HEIGHT;

  const activeFilterCount = getActiveFilterCount(
    appliedFilters,
    integrityFilters,
  );
  const activeFilterChips = getFilterChips(appliedFilters, integrityFilters);

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
    const nextFilters = {
      ...appliedFilters,
      [key]: EMPTY_FILTERS[key as keyof typeof EMPTY_FILTERS],
    };
    setAppliedFilters(nextFilters);
    setDraftFilters(nextFilters);
    setPage(1);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("vi-VN", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const patternTotal = Math.max(
    1,
    patterns.tabSwitch +
      patterns.mouseAnomaly +
      patterns.copyPaste +
      patterns.otherBehavior,
  );

  const detectionPatterns = [
    {
      label: "Chuyển tab",
      description: "Sinh viên rời hoặc chuyển tab trong phiên thi",
      value: patterns.tabSwitch,
      icon: Shield,
      className: "bg-warning/10 text-warning",
    },
    {
      label: "Tín hiệu con trỏ",
      description: "Con trỏ không hoạt động hoặc có hành vi bất thường",
      value: patterns.mouseAnomaly,
      icon: MousePointerClick,
      className: "bg-destructive/10 text-destructive",
    },
    {
      label: "Sự kiện sao chép/dán",
      description: "Tương tác bộ nhớ tạm trong phiên thi",
      value: patterns.copyPaste,
      icon: Copy,
      // lucide's Copy glyph has more internal padding than the other
      // pattern icons here at the same size, so it reads visibly smaller.
      iconClassName: "h-5 w-5",
      className: "bg-info/10 text-info",
    },
    {
      label: "Tín hiệu hành vi khác",
      description: "Sự kiện tiêu điểm, toàn màn hình hoặc giám sát",
      value: patterns.otherBehavior,
      icon: TrendingUp,
      className: "bg-muted text-muted-foreground",
    },
  ];

  if (selectedCase) {
    return (
      <IntegrityCaseDetail
        submission={selectedCase}
        onBack={() => {
          setSelectedCase(null);
          if (directSubmissionId) router.replace(pathname);
        }}
        onReview={reviewCase}
        isSaving={savingReview}
      />
    );
  }

  return (
    <DashboardLayout>
      <AdminPageShell>
        <ListPageHeader
          title="Giám sát rủi ro"
          className="mb-4"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchCases()}
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
          }
        />

        <div className="mb-6 space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
            <FilterPanel
              title="Bộ lọc tính toàn vẹn"
              description="Lọc theo mức tín hiệu, bài thi, ngày nộp và dấu hiệu bất thường."
              filters={integrityFilters}
              value={draftFilters}
              onValueChange={(key, nextValue) =>
                setDraftFilters((prev) => ({ ...prev, [key]: nextValue }))
              }
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
            />
          </div>
          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            onSearch={runSearch}
            placeholder="Tìm theo sinh viên hoặc bài thi"
            showSearchButton
          />
          <ActiveFilterChips
            chips={activeFilterChips}
            onRemove={removeFilter}
            onClearAll={clearFilters}
          />
        </div>

        {/* Visual Analytics Charts Panel */}
        <div className="mb-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Chart 1: Donut Chart - Phân bố trạng thái xử lý */}
            <Card className="lg:col-span-5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        <HelpedTitle
                          help={{
                            description: "Tỷ lệ phân bổ các trường hợp vi phạm theo trạng thái xử lý hiện tại.",
                            usedBy: "Giảng viên và giám thị theo dõi tiến độ xử lý và rà soát các bài thi có rủi ro.",
                            note: "Dữ liệu được cập nhật theo bộ lọc bài thi và thời gian bạn đang chọn.",
                          }}
                        >
                          Trạng thái xử lý
                        </HelpedTitle>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Tỷ lệ bài nộp theo tiến độ rà soát
                      </CardDescription>
                    </div>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Tổng: {stats.totalFlagged}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {stats.totalFlagged === 0 ? (
                  <div className="flex h-52 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                    <span>Không có tín hiệu nghi vấn nào trong phạm vi lọc</span>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <div className="h-52 w-52 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const data = payload[0];
                              const pct = stats.totalFlagged
                                ? Math.round(((Number(data.value) || 0) / stats.totalFlagged) * 100)
                                : 0;
                              return (
                                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                                  <p className="font-semibold text-popover-foreground">{data.name}</p>
                                  <p className="mt-0.5 text-muted-foreground">
                                    Số lượng: <span className="font-bold text-foreground">{data.value}</span> ({pct}%)
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Pie
                            data={[
                              { name: "Chờ xem xét", value: stats.pendingReview, color: "#f59e0b" },
                              {
                                name: "Đã xem xét",
                                value: Math.max(0, stats.totalFlagged - stats.pendingReview - stats.confirmedCases),
                                color: "#0284c7",
                              },
                              { name: "Đã xác nhận", value: stats.confirmedCases, color: "#ef4444" },
                            ].filter((d) => d.value > 0)}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={4}
                            stroke="none"
                          >
                            {[
                              { name: "Chờ xem xét", value: stats.pendingReview, color: "#f59e0b" },
                              {
                                name: "Đã xem xét",
                                value: Math.max(0, stats.totalFlagged - stats.pendingReview - stats.confirmedCases),
                                color: "#0284c7",
                              },
                              { name: "Đã xác nhận", value: stats.confirmedCases, color: "#ef4444" },
                            ]
                              .filter((d) => d.value > 0)
                              .map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="w-full flex-1 space-y-2.5">
                      {[
                        {
                          label: "Chờ xem xét",
                          value: stats.pendingReview,
                          color: "bg-amber-500",
                          textColor: "text-amber-600 dark:text-amber-400",
                        },
                        {
                          label: "Đã xem xét / Khác",
                          value: Math.max(0, stats.totalFlagged - stats.pendingReview - stats.confirmedCases),
                          color: "bg-sky-600",
                          textColor: "text-sky-600 dark:text-sky-400",
                        },
                        {
                          label: "Đã xác nhận vi phạm",
                          value: stats.confirmedCases,
                          color: "bg-red-500",
                          textColor: "text-red-600 dark:text-red-400",
                        },
                      ].map((item) => {
                        const pct = stats.totalFlagged
                          ? Math.round((item.value / stats.totalFlagged) * 100)
                          : 0;
                        return (
                          <div key={item.label} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                              <span className="font-medium text-foreground">{item.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-medium">
                              <span className={item.textColor}>{item.value}</span>
                              <span className="text-muted-foreground">({pct}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chart 2: Horizontal Bar Chart - Nhóm vi phạm */}
            <Card className="lg:col-span-7">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        <HelpedTitle
                          help={{
                            description: "Tổng hợp tần suất các hành vi vi phạm toàn vẹn học thuật được ghi nhận trong phiên thi.",
                            usedBy: "Giảng viên nhận biết các loại gian lận phổ biến như chuyển tab, bất thường chuột hoặc copy/paste.",
                            note: "Các tín hiệu là cơ sở cảnh báo tự động từ hệ thống giám sát để hỗ trợ rà soát.",
                          }}
                        >
                          Tần suất nhóm tín hiệu
                        </HelpedTitle>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Số lượng và tỷ lệ các nhóm hành vi vi phạm
                      </CardDescription>
                    </div>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Tổng sự kiện: {patterns.tabSwitch + patterns.mouseAnomaly + patterns.copyPaste + patterns.otherBehavior}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {patterns.tabSwitch + patterns.mouseAnomaly + patterns.copyPaste + patterns.otherBehavior === 0 ? (
                  <div className="flex h-52 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                    <span>Không có sự kiện bất thường nào</span>
                  </div>
                ) : (
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={[
                          {
                            name: "Chuyển tab",
                            count: patterns.tabSwitch,
                            fill: "#f59e0b",
                            pct: Math.round((patterns.tabSwitch / patternTotal) * 100),
                          },
                          {
                            name: "Tín hiệu con trỏ",
                            count: patterns.mouseAnomaly,
                            fill: "#ef4444",
                            pct: Math.round((patterns.mouseAnomaly / patternTotal) * 100),
                          },
                          {
                            name: "Sao chép/Dán",
                            count: patterns.copyPaste,
                            fill: "#0284c7",
                            pct: Math.round((patterns.copyPaste / patternTotal) * 100),
                          },
                          {
                            name: "Hành vi khác",
                            count: patterns.otherBehavior,
                            fill: "#8b5cf6",
                            pct: Math.round((patterns.otherBehavior / patternTotal) * 100),
                          },
                        ]}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/40" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis
                          dataKey="name"
                          type="category"
                          tick={{ fontSize: 12, fill: "currentColor" }}
                          width={110}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                                <p className="font-semibold text-popover-foreground">{d.name}</p>
                                <p className="mt-0.5 text-muted-foreground">
                                  Số lần: <span className="font-bold text-foreground">{d.count}</span> ({d.pct}%)
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {[
                            { fill: "#f59e0b" },
                            { fill: "#ef4444" },
                            { fill: "#0284c7" },
                            { fill: "#8b5cf6" },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chart 3: Area Chart - Xu hướng tín hiệu theo thời gian */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      <HelpedTitle
                        help={{
                          description: "Biểu đồ đường/miền thể hiện số ca nộp bài phát hiện tín hiệu nghi vấn theo từng ngày.",
                          usedBy: "Giúp giảng viên và quản trị viên nhận diện các ngày thi có tỷ lệ rủi ro cao hoặc đột biến vi phạm.",
                          note: "Đường màu tím thể hiện tổng ca ghi nhận, đường màu đỏ thể hiện các ca có mức tín hiệu cao (High).",
                        }}
                      >
                        Xu hướng phát hiện tín hiệu theo thời gian
                      </HelpedTitle>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Phân bổ số lượt nộp bài có cảnh báo theo ngày nộp bài
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                    <span className="text-muted-foreground">Tổng tín hiệu</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    <span className="text-muted-foreground">Mức tín hiệu cao</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {timeline.length === 0 ? (
                <div className="flex h-44 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                  <span>Chưa có dữ liệu theo mốc thời gian để vẽ biểu đồ</span>
                </div>
              ) : (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={timeline.map((item) => {
                        const parts = item.date.split("-");
                        const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : item.date;
                        return {
                          ...item,
                          formattedDate,
                        };
                      })}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis dataKey="formattedDate" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                              <p className="font-semibold text-popover-foreground">Ngày: {d.date}</p>
                              <p className="mt-1 text-violet-600 dark:text-violet-400">
                                Tổng bài nộp có tín hiệu: <span className="font-bold">{d.count}</span>
                              </p>
                              <p className="text-rose-600 dark:text-rose-400">
                                Mức tín hiệu cao: <span className="font-bold">{d.highConfidence}</span>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorCount)"
                        name="Tổng tín hiệu"
                      />
                      <Area
                        type="monotone"
                        dataKey="highConfidence"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorHigh)"
                        name="Mức tín hiệu cao"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v);
                setPage(1);
              }}
            >
              <TabsList className="mb-4">
                <TabsTrigger value="all">Tất cả</TabsTrigger>
                <TabsTrigger value="pending">Chờ xem xét</TabsTrigger>
                <TabsTrigger value="reviewed">Đã xem xét</TabsTrigger>
                <TabsTrigger value="confirmed">Đã xác nhận</TabsTrigger>
                <TabsTrigger value="dismissed">Đã loại trừ</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-0">
                <div
                  className="overflow-hidden"
                  style={{ minHeight: INTEGRITY_TABLE_MIN_HEIGHT }}
                >
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sinh viên</TableHead>
                          <TableHead className="text-center">Lượt</TableHead>
                          <TableHead>Bài thi</TableHead>
                          <TableHead>Thời gian nộp</TableHead>
                          <TableHead>Mức tín hiệu</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Tín hiệu chính</TableHead>
                          <TableHead className="text-right">Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="py-10 text-center text-muted-foreground"
                            >
                              <div className="inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Đang tải các trường hợp cần xem xét...
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : error ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="py-10 text-center text-destructive"
                            >
                              {error}
                            </TableCell>
                          </TableRow>
                        ) : submissions.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="text-center py-8 text-muted-foreground"
                            >
                              Không tìm thấy bài nộp có tín hiệu cần xem xét
                            </TableCell>
                          </TableRow>
                        ) : (
                          submissions.map((submission) => (
                            <TableRow key={submission.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-foreground">
                                    {submission.studentName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {submission.studentId}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">
                                {submission.attemptNo ?? "-"}
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-foreground">
                                  {submission.examTitle}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(submission.submittedAt)}
                                </p>
                              </TableCell>
                              <TableCell>
                                <StatusBadge
                                  status={submission.confidence}
                                  domain="confidence"
                                >
                                  {submission.confidence === "High" ? "Cao" : submission.confidence === "Medium" ? "Trung bình" : "Thấp"}
                                </StatusBadge>
                              </TableCell>
                              <TableCell>
                                <StatusBadge
                                  status={submission.status}
                                  domain="integrity"
                                >
                                  {submission.status === "pending" ? "Chờ xem xét" : submission.status === "reviewed" ? "Đã xem xét" : submission.status === "confirmed" ? "Đã xác nhận" : "Đã loại trừ"}
                                </StatusBadge>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-muted-foreground max-w-xs truncate">
                                  {submission.reasons[0]?.description || "—"}
                                </p>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedCase(submission)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Xem xét
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              onPageChange={setPage}
              itemLabel="bài nộp cần xem xét"
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                <HelpedTitle help={{
                  description: "Tổng hợp các nhóm tín hiệu toàn vẹn thường gặp từ dữ liệu phiên thi.",
                  usedBy: "Quản trị viên và giảng viên dùng để nhận biết loại tín hiệu nào xuất hiện nhiều nhất.",
                  note: "Đây chỉ là dữ liệu hỗ trợ rà soát, không phải kết luận gian lận.",
                }}>
                  Nhóm tín hiệu ghi nhận
                </HelpedTitle>
              </CardTitle>
              <CardDescription>
                Các nhóm tín hiệu thường gặp từ dữ liệu phiên thi; đây không phải kết luận gian lận
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detectionPatterns.map((pattern) => {
                const percentage = Math.round((pattern.value / patternTotal) * 100);
                return (
                  <div
                    key={pattern.label}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-8 w-8 rounded flex items-center justify-center ${pattern.className}`}
                      >
                        <pattern.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{pattern.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {pattern.description}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold">
                      {percentage}%
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                <HelpedTitle help={{
                  description: "Các nguyên tắc giúp xem xét bằng chứng toàn vẹn học thuật một cách công bằng.",
                  usedBy: "Dùng trước khi xác nhận, loại trừ hoặc chuyển tiếp một trường hợp cần xem xét.",
                  note: "Luôn cân nhắc bối cảnh bài thi, thiết bị, mạng và ghi chú của giảng viên.",
                }}>
                  Hướng dẫn xem xét
                </HelpedTitle>
              </CardTitle>
              <CardDescription>
                Nguyên tắc xem xét tín hiệu toàn vẹn học thuật
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <p className="text-sm font-medium">
                    Xem xét đầy đủ bằng chứng trước khi quyết định
                  </p>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Cân nhắc toàn bộ bối cảnh, bao gồm điều kiện thi và lịch sử của sinh viên
                </p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <p className="text-sm font-medium">Ghi lại căn cứ đánh giá</p>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Thêm ghi chú giải thích lý do xác nhận hoặc loại trừ trường hợp
                </p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <p className="text-sm font-medium">
                    Chuyển cấp các trường hợp chưa rõ ràng
                  </p>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Mời hội đồng học thuật tham gia với tình huống quan trọng hoặc còn mơ hồ
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminPageShell>
    </DashboardLayout>
  );
}
