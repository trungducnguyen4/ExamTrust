"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchBar } from "@/components/common/list/SearchBar";
import { FilterPanel } from "@/components/common/list/FilterPanel";
import { ActiveFilterChips } from "@/components/common/list/ActiveFilterChips";
import { FilterDefinition, FilterValues } from "@/components/common/list/filter-types";
import { getActiveFilterCount, getFilterChips } from "@/components/common/list/filter-utils";
import { typeLabels as questionTypeLabels } from "./question-bank-utils";
import { api } from "@/lib/api";
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2, Layers, Loader2, Minus, RefreshCw, TableProperties, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MATRIX_27_CASES, evaluateMatrixCase, type MatrixCase } from "./question-matrix-evaluator";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const EMPTY_HISTORY_FILTERS: FilterValues = {
  type: "all",
  trend: "all",
  withAttempts: undefined,
  aiGenerated: undefined,
};

const historyFilterDefinitions: FilterDefinition[] = [
  {
    key: "type",
    label: "Loại câu hỏi",
    type: "select",
    allLabel: "Tất cả loại",
    options: Object.entries(questionTypeLabels).map(([value, label]) => ({ value, label })),
  },
  {
    key: "trend",
    label: "Xu hướng",
    type: "select",
    allLabel: "Tất cả xu hướng",
    options: [
      { value: "improving", label: "Cải thiện" },
      { value: "stable", label: "Ổn định" },
      { value: "degrading", label: "Cần xem xét" },
    ],
  },
  {
    key: "withAttempts",
    label: "Lượt làm",
    type: "boolean",
    trueLabel: "Đã có lượt làm",
    falseLabel: "Chưa có lượt làm",
  },
  {
    key: "aiGenerated",
    label: "Hỗ trợ AI",
    type: "boolean",
    trueLabel: "Có hỗ trợ AI",
    falseLabel: "Không có hỗ trợ AI",
  },
];

type QuestionMetric = {
  versionId: string;
  versionNo: number;
  examId?: string | null;
  exam: string;
  date: string;
  attempts: number;
  students?: number | null;
  usageCount?: number;
  correctRate: number | null;
  difficulty: number | null;
  discrimination: number | null;
  reliability: number | null;
};

type QuestionHistoryRow = {
  id: string;
  content: string;
  course: string;
  type: string;
  status: string;
  metrics: QuestionMetric[];
  versionMetrics?: QuestionMetric[];
  examUsageMetrics?: QuestionMetric[];
  versions: Array<{ id: string; versionNo: number; stem: string; aiGenerated: boolean; createdAt: string }>;
  trend: "stable" | "improving" | "degrading";
  recommendation: string | null;
};

export default function QuestionHistoryAnalysis() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const basePath = pathname.startsWith("/admin") ? "/admin" : "/lecturer";
  const questionBankPath = `${basePath}/question-bank`;
  const questionEditorPath = `${basePath}/question-editor`;
  const [rows, setRows] = useState<QuestionHistoryRow[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionHistoryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>(EMPTY_HISTORY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>(EMPTY_HISTORY_FILTERS);
  const [analysisView, setAnalysisView] = useState<"versions" | "usages" | "history">("versions");
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [matrixTab, setMatrixTab] = useState<"all" | "p_up" | "p_stable" | "p_down">("all");
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (showMatrixModal) {
      setTimeout(() => {
        if (activeRowRef.current) {
          activeRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
    }
  }, [showMatrixModal]);

  const loadHistory = async (activeCheck?: () => boolean) => {
    const isActive = () => !activeCheck || activeCheck();
    setLoading(true);
    setError("");
    try {
      const payload = await api.getQuestionHistory({
        courseId: searchParams.get("courseId") || undefined,
      });
      const data = Array.isArray(payload?.data) ? payload.data : [];
      if (!isActive()) return;
      setRows(data);
      setStats(payload?.stats || null);
      setSelectedQuestion(data[0] || null);
    } catch (err: any) {
      if (isActive()) setError(err.message || "Không thể tải lịch sử câu hỏi");
    } finally {
      if (isActive()) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    loadHistory(() => active);
    return () => {
      active = false;
    };
  }, [searchParams]);

  const filteredRows = useMemo(() => {
    const search = appliedSearch.trim().toLowerCase();
    const type = appliedFilters.type as string | undefined;
    const trend = appliedFilters.trend as string | undefined;
    const withAttempts = appliedFilters.withAttempts as boolean | undefined;
    const aiGenerated = appliedFilters.aiGenerated as boolean | undefined;

    return rows.filter((row) => {
      const matchesSearch =
        !search || row.content.toLowerCase().includes(search) || row.id.toLowerCase().includes(search);
      const matchesType = !type || type === "all" || row.type === type;
      const matchesTrend = !trend || trend === "all" || row.trend === trend;
      const rowHasAttempts = row.metrics.some((metric) => metric.attempts > 0);
      const matchesAttempts = withAttempts === undefined || rowHasAttempts === withAttempts;
      const rowHasAi = row.versions.some((version) => version.aiGenerated);
      const matchesAi = aiGenerated === undefined || rowHasAi === aiGenerated;
      return matchesSearch && matchesType && matchesTrend && matchesAttempts && matchesAi;
    });
  }, [rows, appliedSearch, appliedFilters]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedQuestion(null);
      return;
    }
    if (!selectedQuestion || !filteredRows.some((row) => row.id === selectedQuestion.id)) {
      setSelectedQuestion(filteredRows[0]);
    }
  }, [filteredRows, selectedQuestion]);

  const runSearch = () => setAppliedSearch(searchInput.trim());
  const applyFilters = () => setAppliedFilters(draftFilters);
  const clearFilters = () => {
    setDraftFilters(EMPTY_HISTORY_FILTERS);
    setAppliedFilters(EMPTY_HISTORY_FILTERS);
    setSearchInput("");
    setAppliedSearch("");
  };
  const removeFilter = (key: string) => {
    const nextFilters = {
      ...appliedFilters,
      [key]: EMPTY_HISTORY_FILTERS[key as keyof typeof EMPTY_HISTORY_FILTERS],
    };
    setAppliedFilters(nextFilters);
    setDraftFilters(nextFilters);
  };
  const activeFilterCount = getActiveFilterCount(appliedFilters, historyFilterDefinitions);
  const activeFilterChips = getFilterChips(appliedFilters, historyFilterDefinitions);

  const versionMetrics = useMemo(
    () => selectedQuestion?.versionMetrics || selectedQuestion?.metrics || [],
    [selectedQuestion],
  );
  const usageMetrics = useMemo(
    () => selectedQuestion?.examUsageMetrics || [],
    [selectedQuestion],
  );
  const chartMetrics = analysisView === "usages" ? usageMetrics : versionMetrics;

  const versionMatrixEvaluation = useMemo(() => {
    const usable = versionMetrics.filter((m) => m.attempts > 0);
    if (usable.length < 2) return null;
    const first = usable[0];
    const last = usable[usable.length - 1];
    return evaluateMatrixCase(first, last);
  }, [versionMetrics]);

  const usageMatrixEvaluation = useMemo(() => {
    const usable = usageMetrics.filter((m) => m.attempts > 0);
    if (usable.length < 2) return null;
    const first = usable[0];
    const last = usable[usable.length - 1];
    return evaluateMatrixCase(first, last);
  }, [usageMetrics]);

  const activeMatrixEvaluation = analysisView === "usages" ? usageMatrixEvaluation : versionMatrixEvaluation;

  const filteredMatrixCases = useMemo(() => {
    if (matrixTab === "all") return MATRIX_27_CASES;
    return MATRIX_27_CASES.filter((c) => c.group === matrixTab);
  }, [matrixTab]);

  const lineData = useMemo(
    () => ({
      labels: chartMetrics.map((metric) => analysisView === "usages" ? metric.exam : `V${metric.versionNo}`),
      datasets: [
        {
          label: "Chỉ số độ khó",
          data: chartMetrics.map((metric) => metric.difficulty ?? 0),
          borderColor: "rgb(239, 68, 68)",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          fill: true,
          tension: 0.3,
        },
        {
          label: "Chỉ số phân biệt",
          data: chartMetrics.map((metric) => metric.discrimination ?? 0),
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.3,
        },
        {
          label: "Độ tin cậy ước tính",
          data: chartMetrics.map((metric) => metric.reliability ?? 0),
          borderColor: "rgb(34, 197, 94)",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          fill: true,
          tension: 0.3,
        },
      ],
    }),
    [analysisView, chartMetrics],
  );

  const barData = useMemo(
    () => ({
      labels: chartMetrics.map((metric) => analysisView === "usages" ? metric.exam : `V${metric.versionNo}`),
      datasets: [
        {
          label: "Tỷ lệ trả lời đúng",
          data: chartMetrics.map((metric) => Math.round((metric.correctRate ?? 0) * 100)),
          backgroundColor: chartMetrics.map((metric) => {
            const value = metric.correctRate ?? 0;
            return value > 0.5 ? "rgba(34, 197, 94, 0.7)" : value > 0.3 ? "rgba(234, 179, 8, 0.7)" : "rgba(239, 68, 68, 0.7)";
          }),
          borderRadius: 4,
        },
      ],
    }),
    [analysisView, chartMetrics],
  );

  const metricTooltipOptions = useMemo(() => ({
    plugins: {
      tooltip: {
        callbacks: {
          afterBody: (items: Array<{ dataIndex: number }>) => {
            const metric = chartMetrics[items[0]?.dataIndex];
            if (!metric) return [];
            return [
              `Tỷ lệ đúng: ${metric.correctRate === null ? "Chưa có" : `${(metric.correctRate * 100).toFixed(1)}%`}`,
              `Chỉ số phân biệt: ${metric.discrimination === null ? "Chưa đủ dữ liệu" : metric.discrimination.toFixed(2)}`,
              `Số lượt trả lời: ${metric.attempts}`,
              analysisView === "versions"
                ? `Được sử dụng trong: ${metric.usageCount ?? 0} bài thi`
                : `Số sinh viên: ${metric.students ?? "Chưa có"}`,
            ];
          },
        },
      },
      legend: { position: "bottom" as const },
    },
  }), [analysisView, chartMetrics]);

  const trendIcon = (trend: string) => {
    switch (trend) {
      case "improving":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "degrading":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };
  const trendLabel = (trend: string) => ({
    improving: "Cải thiện",
    degrading: "Suy giảm",
    stable: "Ổn định",
  }[trend] || "Chưa xác định");

  const formatRecommendation = (rec: string | null | undefined) => {
    if (!rec) return "";
    if (rec.includes("Review wording") || rec.includes("difficulty calibration") || rec.includes("distractors")) {
      return "Cần xem xét lại cách diễn đạt, các phương án nhiễu và hiệu chỉnh lại độ khó trước khi tái sử dụng câu hỏi này.";
    }
    if (rec.includes("No completed submission data") || rec.includes("Keep collecting attempts")) {
      return "Chưa có đủ dữ liệu bài nộp hoàn tất. Hãy thu thập thêm lượt làm bài trước khi đưa ra quyết định chất lượng.";
    }
    return rec;
  };

  const currentMetric = chartMetrics[chartMetrics.length - 1];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground" onClick={() => router.push(questionBankPath)}>
          <ArrowLeft className="h-4 w-4" /> Quay lại ngân hàng câu hỏi
        </Button>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              Lịch sử phiên bản & phân tích chất lượng câu hỏi
            </h1>
            <p className="text-muted-foreground">
              Phân tích từ phiên bản câu hỏi, bài nộp và thống kê chất lượng đã lưu.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMatrixModal(true)}
              className="gap-2 text-primary border-primary/30 hover:bg-primary/5"
            >
              <TableProperties className="h-4 w-4" />
              Xem bảng ma trận
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadHistory()}
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
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
              Đang tải lịch sử câu hỏi...
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card className="border-red-200">
            <CardContent className="py-8 text-center text-red-600">{error}</CardContent>
          </Card>
        )}

        {!loading && !error && rows.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              Chưa có lịch sử câu hỏi. Hãy xuất bản câu hỏi có phiên bản và thu thập bài nộp.
            </CardContent>
          </Card>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-semibold">{stats?.totalQuestions ?? rows.length}</p>
                <p className="text-xs text-muted-foreground">Câu hỏi</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-semibold">{stats?.withAttempts ?? 0}</p>
                <p className="text-xs text-muted-foreground">Đã có lượt làm</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-semibold text-red-600">{stats?.degrading ?? 0}</p>
                <p className="text-xs text-muted-foreground">Cần xem xét</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-semibold text-blue-600">{stats?.aiGenerated ?? 0}</p>
                <p className="text-xs text-muted-foreground">Có hỗ trợ AI</p>
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
                value={searchInput}
                onChange={setSearchInput}
                onSearch={runSearch}
                placeholder="Tìm câu hỏi hoặc ID..."
                className="min-w-0 flex-1 sm:min-w-[280px]"
              />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
                title="Bộ lọc câu hỏi"
                description="Lọc theo loại, xu hướng, lượt làm và hỗ trợ AI."
                filters={historyFilterDefinitions}
                value={draftFilters}
                onValueChange={(key, nextValue) =>
                  setDraftFilters((prev) => ({ ...prev, [key]: nextValue }))
                }
                onApply={applyFilters}
                onClear={clearFilters}
                activeCount={activeFilterCount}
                className="shrink-0"
              />
              
              
            </div>
          </div>
            <ActiveFilterChips
              chips={activeFilterChips}
              onRemove={removeFilter}
              onClearAll={clearFilters}
            />
          </div>
        )}

        {!loading && !error && rows.length > 0 && (filteredRows.length === 0 || !selectedQuestion) && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              Không có câu hỏi phù hợp với bộ lọc hiện tại.
            </CardContent>
          </Card>
        )}

        {!loading && !error && rows.length > 0 && filteredRows.length > 0 && selectedQuestion && (
          <>
            <Tabs value={analysisView} onValueChange={(value) => setAnalysisView(value as "versions" | "usages" | "history")}>
              <TabsList className="mb-4">
                <TabsTrigger value="versions">Theo phiên bản</TabsTrigger>
                <TabsTrigger value="usages">Theo lần thi</TabsTrigger>
                <TabsTrigger value="history">Lịch sử chỉnh sửa</TabsTrigger>
              </TabsList>

              <TabsContent value="versions" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Câu hỏi</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[620px] overflow-y-auto">
                      {filteredRows.map((row) => (
                        <button
                          key={row.id}
                          onClick={() => setSelectedQuestion(row)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedQuestion.id === row.id ? "border-primary bg-primary/5" : "border-muted hover:border-primary/30"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-muted-foreground">{row.id.slice(0, 8)}</span>
                            <div className="flex items-center gap-1">
                              {trendIcon(row.trend)}
                              <StatusBadge variant={row.trend === "improving" ? "success" : row.trend === "degrading" ? "destructive" : "default"}>
                                {trendLabel(row.trend)}
                              </StatusBadge>
                            </div>
                          </div>
                          <p className="text-xs line-clamp-2">{row.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {row.course} · {row.versions.length} phiên bản
                          </p>
                        </button>
                      ))}
                    </CardContent>
                  </Card>

                  <div className="col-span-2 space-y-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">Chất lượng qua phiên bản</CardTitle>
                            <CardDescription className="line-clamp-1">{selectedQuestion.content}</CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowMatrixModal(true)}
                            className="gap-1.5 text-xs shrink-0 text-primary border-primary/30 hover:bg-primary/5"
                          >
                            <TableProperties className="h-3.5 w-3.5" />
                            Xem bảng ma trận
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {chartMetrics.some((metric) => metric.attempts > 0) ? (
                          <>
                            <Line data={lineData} options={{ responsive: true, scales: { y: { min: 0, max: 1 } }, ...metricTooltipOptions }} />

                            {versionMatrixEvaluation?.matchedCase && (
                              <div className="mt-4 rounded-lg border bg-gradient-to-r from-muted/50 via-muted/20 to-background p-4 text-sm space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                                      <Layers className="h-4 w-4 text-primary" />
                                      Trường hợp #{versionMatrixEvaluation.matchedCase.id} / 27:
                                    </span>
                                    <Badge
                                      variant={
                                        versionMatrixEvaluation.matchedCase.variant === "destructive"
                                          ? "destructive"
                                          : versionMatrixEvaluation.matchedCase.variant === "success"
                                          ? "default"
                                          : "secondary"
                                      }
                                      className={
                                        versionMatrixEvaluation.matchedCase.variant === "success"
                                          ? "bg-green-600 hover:bg-green-700 text-white"
                                          : ""
                                      }
                                    >
                                      {versionMatrixEvaluation.matchedCase.assessment}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
                                    <span>
                                      Δp (Độ dễ):{" "}
                                      <strong
                                        className={
                                          versionMatrixEvaluation.deltaP > 0.05
                                            ? "text-red-600 dark:text-red-400"
                                            : versionMatrixEvaluation.deltaP < -0.05
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-foreground"
                                        }
                                      >
                                        {versionMatrixEvaluation.deltaP >= 0 ? `+${versionMatrixEvaluation.deltaP.toFixed(2)}` : versionMatrixEvaluation.deltaP.toFixed(2)} ({versionMatrixEvaluation.matchedCase.labelP})
                                      </strong>
                                    </span>
                                    <span>
                                      ΔD (Phân biệt):{" "}
                                      <strong
                                        className={
                                          versionMatrixEvaluation.deltaD > 0.05
                                            ? "text-blue-600 dark:text-blue-400"
                                            : versionMatrixEvaluation.deltaD < -0.05
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-foreground"
                                        }
                                      >
                                        {versionMatrixEvaluation.deltaD >= 0 ? `+${versionMatrixEvaluation.deltaD.toFixed(2)}` : versionMatrixEvaluation.deltaD.toFixed(2)} ({versionMatrixEvaluation.matchedCase.labelD})
                                      </strong>
                                    </span>
                                    <span>
                                      ΔR (Tin cậy):{" "}
                                      <strong
                                        className={
                                          versionMatrixEvaluation.deltaR > 0.05
                                            ? "text-green-600 dark:text-green-400"
                                            : versionMatrixEvaluation.deltaR < -0.05
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-foreground"
                                        }
                                      >
                                        {versionMatrixEvaluation.deltaR >= 0 ? `+${versionMatrixEvaluation.deltaR.toFixed(2)}` : versionMatrixEvaluation.deltaR.toFixed(2)} ({versionMatrixEvaluation.matchedCase.labelR})
                                      </strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Hiện tượng khảo thí thực tế:
                                  </p>
                                  <p className="text-sm font-medium text-foreground leading-relaxed">
                                    {versionMatrixEvaluation.matchedCase.explanation}
                                  </p>
                                </div>

                                <div className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div>
                                    <strong className="text-foreground">Khuyến nghị cho giảng viên: </strong>
                                    {versionMatrixEvaluation.matchedCase.action}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowMatrixModal(true)}
                                    className="h-auto p-0 text-primary hover:underline font-medium shrink-0 flex items-center gap-1 text-xs"
                                  >
                                    Xem trên ma trận <ArrowRight className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="py-12 text-center text-muted-foreground">Câu hỏi này chưa có lượt làm hoàn tất.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Tỷ lệ trả lời đúng qua phiên bản (%)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {chartMetrics.some((metric) => metric.attempts > 0) ? (
                          <Bar data={barData} options={{ responsive: true, scales: { y: { min: 0, max: 100 } }, ...metricTooltipOptions }} />
                        ) : (
                          <div className="py-8 text-center text-muted-foreground">Đang chờ dữ liệu bài nộp.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-primary/15 bg-muted/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Cách đọc dữ liệu theo phiên bản</CardTitle>
                        <CardDescription>Mỗi điểm gộp toàn bộ response thực tế của một version, có trọng số theo số lượt trả lời.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm md:grid-cols-3">
                        <div>
                          <p className="font-medium">Chỉ số độ khó (p)</p>
                          <p className="mt-1 text-muted-foreground">p = số lượt đúng / tổng lượt làm. p càng cao thì câu càng dễ; khoảng 0,30–0,80 thường hữu ích để phân loại.</p>
                          <p className="mt-1 font-medium">Hiện tại: {currentMetric?.difficulty !== null && currentMetric?.difficulty !== undefined ? currentMetric.difficulty.toFixed(2) : "Chưa đủ dữ liệu"}</p>
                        </div>
                        <div>
                          <p className="font-medium">Chỉ số phân biệt (D)</p>
                          <p className="mt-1 text-muted-foreground">D đo mức độ câu hỏi tách được nhóm làm tốt và nhóm làm yếu. D ≥ 0,30 là tốt; D thấp cần xem lại cách diễn đạt hoặc đáp án nhiễu.</p>
                          <p className="mt-1 font-medium">Hiện tại: {currentMetric?.discrimination !== null && currentMetric?.discrimination !== undefined ? currentMetric.discrimination.toFixed(2) : "Chưa đủ dữ liệu"}</p>
                        </div>
                        <div>
                          <p className="font-medium">Độ tin cậy ước tính</p>
                          <p className="mt-1 text-muted-foreground">Chỉ số tham khảo được suy ra từ độ phân biệt, chỉ hiển thị khi có ít nhất 10 lượt làm. Giá trị cao hơn cho thấy kết quả ổn định hơn.</p>
                          <p className="mt-1 font-medium">Hiện tại: {currentMetric?.reliability !== null && currentMetric?.reliability !== undefined ? currentMetric.reliability.toFixed(2) : "Chưa đủ dữ liệu"}</p>
                        </div>
                      </CardContent>
                    </Card>

                    {selectedQuestion.recommendation && (
                      <Card className="border-yellow-200 bg-yellow-50/50">
                        <CardContent className="py-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-yellow-800">Khuyến nghị</p>
                              <p className="text-sm text-yellow-700">{formatRecommendation(selectedQuestion.recommendation)}</p>
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" variant="outline" className="gap-1 text-xs">
                                  <RefreshCw className="h-3 w-3" /> Tạo phiên bản mới
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => router.push(`${questionEditorPath}?id=${selectedQuestion.id}`)}>
                                  Sửa câu hỏi <ArrowRight className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="usages" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Câu hỏi</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[620px] overflow-y-auto">
                      {filteredRows.map((row) => (
                        <button
                          key={row.id}
                          onClick={() => setSelectedQuestion(row)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedQuestion.id === row.id ? "border-primary bg-primary/5" : "border-muted hover:border-primary/30"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-muted-foreground">{row.id.slice(0, 8)}</span>
                            <div className="flex items-center gap-1">
                              {trendIcon(row.trend)}
                              <StatusBadge variant={row.trend === "improving" ? "success" : row.trend === "degrading" ? "destructive" : "default"}>
                                {trendLabel(row.trend)}
                              </StatusBadge>
                            </div>
                          </div>
                          <p className="text-xs line-clamp-2">{row.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {row.course} · {row.versions.length} phiên bản
                          </p>
                        </button>
                      ))}
                    </CardContent>
                  </Card>

                  <div className="col-span-2 space-y-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">Chất lượng qua các lần thi</CardTitle>
                            <CardDescription className="line-clamp-1">{selectedQuestion.content}</CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowMatrixModal(true)}
                            className="gap-1.5 text-xs shrink-0 text-primary border-primary/30 hover:bg-primary/5"
                          >
                            <TableProperties className="h-3.5 w-3.5" />
                            Xem bảng ma trận
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {chartMetrics.some((metric) => metric.attempts > 0) ? (
                          <>
                            <Line data={lineData} options={{ responsive: true, scales: { y: { min: 0, max: 1 } }, ...metricTooltipOptions }} />

                            {usageMatrixEvaluation?.matchedCase && (
                              <div className="mt-4 rounded-lg border bg-gradient-to-r from-muted/50 via-muted/20 to-background p-4 text-sm space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                                      <Layers className="h-4 w-4 text-primary" />
                                      Trường hợp #{usageMatrixEvaluation.matchedCase.id} / 27 (theo đợt thi):
                                    </span>
                                    <Badge
                                      variant={
                                        usageMatrixEvaluation.matchedCase.variant === "destructive"
                                          ? "destructive"
                                          : usageMatrixEvaluation.matchedCase.variant === "success"
                                          ? "default"
                                          : "secondary"
                                      }
                                      className={
                                        usageMatrixEvaluation.matchedCase.variant === "success"
                                          ? "bg-green-600 hover:bg-green-700 text-white"
                                          : ""
                                      }
                                    >
                                      {usageMatrixEvaluation.matchedCase.assessment}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
                                    <span>
                                      Δp (Độ dễ):{" "}
                                      <strong
                                        className={
                                          usageMatrixEvaluation.deltaP > 0.05
                                            ? "text-red-600 dark:text-red-400"
                                            : usageMatrixEvaluation.deltaP < -0.05
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-foreground"
                                        }
                                      >
                                        {usageMatrixEvaluation.deltaP >= 0 ? `+${usageMatrixEvaluation.deltaP.toFixed(2)}` : usageMatrixEvaluation.deltaP.toFixed(2)} ({usageMatrixEvaluation.matchedCase.labelP})
                                      </strong>
                                    </span>
                                    <span>
                                      ΔD (Phân biệt):{" "}
                                      <strong
                                        className={
                                          usageMatrixEvaluation.deltaD > 0.05
                                            ? "text-blue-600 dark:text-blue-400"
                                            : usageMatrixEvaluation.deltaD < -0.05
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-foreground"
                                        }
                                      >
                                        {usageMatrixEvaluation.deltaD >= 0 ? `+${usageMatrixEvaluation.deltaD.toFixed(2)}` : usageMatrixEvaluation.deltaD.toFixed(2)} ({usageMatrixEvaluation.matchedCase.labelD})
                                      </strong>
                                    </span>
                                    <span>
                                      ΔR (Tin cậy):{" "}
                                      <strong
                                        className={
                                          usageMatrixEvaluation.deltaR > 0.05
                                            ? "text-green-600 dark:text-green-400"
                                            : usageMatrixEvaluation.deltaR < -0.05
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-foreground"
                                        }
                                      >
                                        {usageMatrixEvaluation.deltaR >= 0 ? `+${usageMatrixEvaluation.deltaR.toFixed(2)}` : usageMatrixEvaluation.deltaR.toFixed(2)} ({usageMatrixEvaluation.matchedCase.labelR})
                                      </strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Hiện tượng khảo thí qua các đợt thi:
                                  </p>
                                  <p className="text-sm font-medium text-foreground leading-relaxed">
                                    {usageMatrixEvaluation.matchedCase.explanation}
                                  </p>
                                </div>

                                <div className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div>
                                    <strong className="text-foreground">Khuyến nghị cho giảng viên: </strong>
                                    {usageMatrixEvaluation.matchedCase.action}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowMatrixModal(true)}
                                    className="h-auto p-0 text-primary hover:underline font-medium shrink-0 flex items-center gap-1 text-xs"
                                  >
                                    Xem trên ma trận <ArrowRight className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="py-12 text-center text-muted-foreground">Chưa có response gắn với lần sử dụng cụ thể của câu hỏi này.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Tỷ lệ trả lời đúng theo lần thi (%)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {chartMetrics.some((metric) => metric.attempts > 0) ? (
                          <Bar data={barData} options={{ responsive: true, scales: { y: { min: 0, max: 100 } }, ...metricTooltipOptions }} />
                        ) : (
                          <div className="py-8 text-center text-muted-foreground">Đang chờ dữ liệu bài nộp.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-primary/15 bg-muted/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Cách đọc dữ liệu theo lần thi</CardTitle>
                        <CardDescription>Mỗi điểm là một bài thi/cohort riêng; không dùng để suy luận thay đổi của nội dung câu hỏi.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm md:grid-cols-3">
                        <div>
                          <p className="font-medium">Chỉ số độ khó (p)</p>
                          <p className="mt-1 text-muted-foreground">p = số lượt đúng / tổng lượt làm trong lần thi. So sánh các điểm để nhận biết cohort hoặc điều kiện làm bài khác nhau.</p>
                          <p className="mt-1 font-medium">Hiện tại: {currentMetric?.difficulty !== null && currentMetric?.difficulty !== undefined ? currentMetric.difficulty.toFixed(2) : "Chưa đủ dữ liệu"}</p>
                        </div>
                        <div>
                          <p className="font-medium">Chỉ số phân biệt (D)</p>
                          <p className="mt-1 text-muted-foreground">D được tính riêng theo mỗi lần thi. Cần có đủ response trước khi dùng làm bằng chứng rà soát chất lượng.</p>
                          <p className="mt-1 font-medium">Hiện tại: {currentMetric?.discrimination !== null && currentMetric?.discrimination !== undefined ? currentMetric.discrimination.toFixed(2) : "Chưa đủ dữ liệu"}</p>
                        </div>
                        <div>
                          <p className="font-medium">Cỡ mẫu</p>
                          <p className="mt-1 text-muted-foreground">Tooltip cho biết số lượt trả lời và số sinh viên của từng bài thi để đặt biến động vào đúng ngữ cảnh.</p>
                          <p className="mt-1 font-medium">Hiện tại: {currentMetric ? `${currentMetric.attempts} lượt trả lời · ${currentMetric.students ?? 0} sinh viên` : "Chưa đủ dữ liệu"}</p>
                        </div>
                      </CardContent>
                    </Card>

                    {selectedQuestion.recommendation && (
                      <Card className="border-yellow-200 bg-yellow-50/50">
                        <CardContent className="py-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-yellow-800">Khuyến nghị</p>
                              <p className="text-sm text-yellow-700">{formatRecommendation(selectedQuestion.recommendation)}</p>
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" variant="outline" className="gap-1 text-xs">
                                  <RefreshCw className="h-3 w-3" /> Tạo phiên bản mới
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => router.push(`${questionEditorPath}?id=${selectedQuestion.id}`)}>
                                  Sửa câu hỏi <ArrowRight className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Lịch sử phiên bản</CardTitle>
                    <CardDescription>Các phiên bản câu hỏi cố định, dùng để lưu trữ đề thi theo đúng thời điểm gốc.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedQuestion.versions.map((version, index) => (
                      <div key={version.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`h-3 w-3 rounded-full ${version.aiGenerated ? "bg-blue-500" : index === 0 ? "bg-green-500" : "bg-muted-foreground"}`} />
                          {index < selectedQuestion.versions.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">v{version.versionNo}</span>
                              <span className="text-sm font-medium">{version.aiGenerated ? "Phiên bản có hỗ trợ AI" : index === 0 ? "Phiên bản đầu tiên" : "Phiên bản thủ công"}</span>
                              {version.aiGenerated && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                            </div>
                            <span className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleDateString("vi-VN")}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{version.stem}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Modal Bảng ma trận 27 trường hợp */}
        <Dialog open={showMatrixModal} onOpenChange={setShowMatrixModal}>
          <DialogContent className="max-w-6xl w-[96vw] max-h-[88vh] flex flex-col p-6 overflow-hidden">
            <DialogHeader className="pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <TableProperties className="h-5 w-5 text-primary" />
                <DialogTitle className="text-lg">Ma trận 27 trường hợp đánh giá chất lượng câu hỏi (3×3×3)</DialogTitle>
              </div>
              <DialogDescription>
                Kết hợp biến thiên 3 chỉ số khảo thí: <strong>Δp (Độ dễ / Tỷ lệ đúng)</strong> × <strong>ΔD (Độ phân biệt)</strong> × <strong>ΔR (Độ tin cậy)</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2 border-b pb-3 pt-1 shrink-0">
              <Button
                size="sm"
                variant={matrixTab === "all" ? "default" : "outline"}
                onClick={() => setMatrixTab("all")}
                className="h-7 text-xs"
              >
                Tất cả (27 trường hợp)
              </Button>
              <Button
                size="sm"
                variant={matrixTab === "p_up" ? "default" : "outline"}
                onClick={() => setMatrixTab("p_up")}
                className="h-7 text-xs"
              >
                Nhóm I: Δp Tăng (Dễ hơn)
              </Button>
              <Button
                size="sm"
                variant={matrixTab === "p_stable" ? "default" : "outline"}
                onClick={() => setMatrixTab("p_stable")}
                className="h-7 text-xs"
              >
                Nhóm II: Δp Ổn định
              </Button>
              <Button
                size="sm"
                variant={matrixTab === "p_down" ? "default" : "outline"}
                onClick={() => setMatrixTab("p_down")}
                className="h-7 text-xs"
              >
                Nhóm III: Δp Giảm (Khó hơn)
              </Button>
            </div>

            <div className="flex-1 overflow-auto rounded-md border min-h-0">
              <Table className="w-full">
                <TableHeader className="sticky top-0 bg-background z-20 shadow-sm">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 text-center font-bold">STT</TableHead>
                    <TableHead className="w-20 text-center font-bold">Δp (Độ dễ)</TableHead>
                    <TableHead className="w-20 text-center font-bold">ΔD (Phân biệt)</TableHead>
                    <TableHead className="w-20 text-center font-bold">ΔR (Tin cậy)</TableHead>
                    <TableHead className="w-48 font-bold">Đánh giá thuật toán</TableHead>
                    <TableHead className="min-w-[260px] font-bold">Hiện tượng Sư phạm / Khảo thí thực tế</TableHead>
                    <TableHead className="min-w-[220px] font-bold">Hành động khuyến nghị</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMatrixCases.map((item) => {
                    const isCurrent = activeMatrixEvaluation?.matchedCase?.id === item.id;
                    return (
                      <TableRow
                        key={item.id}
                        ref={isCurrent ? activeRowRef : undefined}
                        className={
                          isCurrent
                            ? "bg-primary/10 hover:bg-primary/15 font-medium border-l-4 border-l-primary"
                            : undefined
                        }
                      >
                        <TableCell className="text-center font-mono text-xs">
                          {isCurrent ? (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground font-bold text-xs shadow-sm">
                              {item.id}
                            </span>
                          ) : (
                            item.id
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono">{item.labelP}</TableCell>
                        <TableCell className="text-center text-xs font-mono">{item.labelD}</TableCell>
                        <TableCell className="text-center text-xs font-mono">{item.labelR}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={
                                item.variant === "destructive"
                                  ? "destructive"
                                  : item.variant === "success"
                                  ? "default"
                                  : "secondary"
                              }
                              className={
                                item.variant === "success"
                                  ? "bg-green-600 hover:bg-green-700 text-white text-[11px]"
                                  : "text-[11px]"
                              }
                            >
                              {item.assessment}
                            </Badge>
                            {isCurrent && (
                              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                                Đang áp dụng
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs leading-relaxed">{item.explanation}</TableCell>
                        <TableCell className="text-xs text-muted-foreground leading-relaxed">{item.action}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
